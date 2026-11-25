-- Migration 0076 (pending owner approval): Native OMNI CLI browser authorization, separate from omni-web delegations:
-- no bearer token is issued. A successful PKCE exchange creates a device credential
-- whose private key signs every omni.dock/v1 request until owner revocation/rotation.

ALTER TABLE public.omni_dock_devices
  ALTER COLUMN invite_id DROP NOT NULL,
  ADD COLUMN owner_id uuid REFERENCES auth.users(id),
  ADD COLUMN native_client_id text,
  ADD COLUMN native_authorization_id uuid;

UPDATE public.omni_dock_devices d
SET owner_id = i.created_by
FROM public.omni_dock_invites i
WHERE d.invite_id = i.id;

ALTER TABLE public.omni_dock_devices
  ALTER COLUMN owner_id SET NOT NULL,
  ADD CONSTRAINT omni_dock_native_client_check
    CHECK (native_client_id IS NULL OR native_client_id = 'omni-native-cli');

CREATE TABLE public.omni_native_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  client_id text NOT NULL CHECK (client_id = 'omni-native-cli'),
  audience text NOT NULL CHECK (audience = 'omni-mothership'),
  redirect_uri text NOT NULL,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  code_challenge text NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  proof_nonce_hash text NOT NULL UNIQUE CHECK (proof_nonce_hash ~ '^[0-9a-f]{64}$'),
  public_key jsonb NOT NULL,
  key_fingerprint text NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  platform text NOT NULL CHECK (platform IN ('macos', 'linux', 'windows')),
  permissions text[] NOT NULL,
  rotation_device_id uuid REFERENCES public.omni_dock_devices(id),
  rotation_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  device_id uuid REFERENCES public.omni_dock_devices(id),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '60 seconds'),
  CHECK ((rotation_device_id IS NULL) = (rotation_revision IS NULL))
);
CREATE INDEX omni_native_authorization_owner_idx
  ON public.omni_native_authorization_codes (owner_id, created_at DESC);
ALTER TABLE public.omni_dock_devices
  ADD CONSTRAINT omni_dock_native_authorization_fk
  FOREIGN KEY (native_authorization_id)
  REFERENCES public.omni_native_authorization_codes(id);
CREATE UNIQUE INDEX omni_dock_native_authorization_unique
  ON public.omni_dock_devices (native_authorization_id)
  WHERE native_authorization_id IS NOT NULL;
REVOKE ALL ON public.omni_native_authorization_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.omni_native_authorization_codes TO service_role;
ALTER TABLE public.omni_native_authorization_codes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.omni_native_authorization_codes IS
  'One-use native CLI browser authorization codes. Stores only code hashes, PKCE challenges, public keys and granted device permissions; never bearer credentials or private keys.';
COMMENT ON COLUMN public.omni_dock_devices.owner_id IS
  'Verified Mothership owner who explicitly authorized this device; scopes all native device records.';

CREATE OR REPLACE FUNCTION public.omni_native_owner_ok(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT _uid IS NOT NULL
    AND COALESCE(public.has_role(_uid, 'owner'), false)
    AND EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = _uid AND u.email_confirmed_at IS NOT NULL
    )
$$;
REVOKE ALL ON FUNCTION public.omni_native_owner_ok(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_owner_ok(uuid) TO service_role;

-- Consent is owner + aal2 + fresh TOTP. Only the exact public CLI, loopback callback
-- port, proven P-256 key and implemented device permissions can be recorded.
CREATE OR REPLACE FUNCTION public.omni_native_authorize(
  _client_id text,
  _audience text,
  _port integer,
  _code_hash text,
  _code_challenge text,
  _proof_nonce_hash text,
  _proof_timestamp_ms bigint,
  _public_key jsonb,
  _fingerprint text,
  _label text,
  _platform text,
  _permissions text[],
  _rotation_device uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
  _device public.omni_dock_devices;
  _redirect text;
  _selected text[];
  _expected_fingerprint text;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _client_id IS DISTINCT FROM 'omni-native-cli'
     OR _audience IS DISTINCT FROM 'omni-mothership'
     OR _port IS NULL OR _port NOT BETWEEN 1024 AND 65535 THEN
    RAISE EXCEPTION 'Unknown native client or loopback callback' USING ERRCODE = '22023';
  END IF;
  _redirect := 'http://127.0.0.1:' || _port::text || '/callback';
  IF _code_hash IS NULL OR _code_hash !~ '^[0-9a-f]{64}$'
     OR _proof_nonce_hash IS NULL OR _proof_nonce_hash !~ '^[0-9a-f]{64}$'
     OR _code_challenge IS NULL OR _code_challenge !~ '^[A-Za-z0-9_-]{43}$'
     OR _proof_timestamp_ms IS NULL
     OR abs(extract(epoch FROM clock_timestamp()) * 1000 - _proof_timestamp_ms) > 300000 THEN
    RAISE EXCEPTION 'Native authorization proof is malformed or expired' USING ERRCODE = '22023';
  END IF;
  IF _public_key IS NULL OR jsonb_typeof(_public_key) <> 'object'
     OR (_public_key - ARRAY['kty', 'crv', 'x', 'y']) <> '{}'::jsonb
     OR _public_key->>'kty' IS DISTINCT FROM 'EC'
     OR _public_key->>'crv' IS DISTINCT FROM 'P-256'
     OR COALESCE(_public_key->>'x', '') !~ '^[A-Za-z0-9_-]{43}$'
     OR COALESCE(_public_key->>'y', '') !~ '^[A-Za-z0-9_-]{43}$' THEN
    RAISE EXCEPTION 'Native device requires a public P-256 key' USING ERRCODE = '22023';
  END IF;
  _expected_fingerprint := encode(sha256(convert_to(
    format('{"crv":"P-256","kty":"EC","x":"%s","y":"%s"}',
      _public_key->>'x', _public_key->>'y'), 'UTF8')), 'hex');
  IF _fingerprint IS DISTINCT FROM _expected_fingerprint THEN
    RAISE EXCEPTION 'Native device key fingerprint did not match' USING ERRCODE = '22023';
  END IF;
  IF _label IS NULL OR length(btrim(_label)) NOT BETWEEN 1 AND 60
     OR _label ~ '[[:cntrl:]]'
     OR _platform IS NULL OR _platform NOT IN ('macos', 'linux', 'windows') THEN
    RAISE EXCEPTION 'Native device details are invalid' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_label) THEN
    RAISE EXCEPTION 'Device label looks like a secret' USING ERRCODE = '22023';
  END IF;
  IF _rotation_device IS NULL THEN
    IF _permissions IS NULL OR cardinality(_permissions) < 1
       OR NOT public.omni_dock_valid_permissions(_permissions)
       OR NOT (_permissions <@ ARRAY[
         'status.read', 'jobs.propose', 'stop.engage', 'cloud.read', 'audit.read', 'jobs.pause'
       ]::text[]) THEN
      RAISE EXCEPTION 'Choose only implemented native device permissions' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT p ORDER BY p) INTO _selected FROM unnest(_permissions) p;
    IF cardinality(_selected) <> cardinality(_permissions) THEN
      RAISE EXCEPTION 'Duplicate native device permission' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF COALESCE(cardinality(_permissions), 0) <> 0 THEN
      RAISE EXCEPTION 'Key rotation cannot change device permissions' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _device FROM public.omni_dock_devices
      WHERE id = _rotation_device AND owner_id = auth.uid()
        AND native_client_id = _client_id AND status = 'paired'
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Native device is not available for rotation' USING ERRCODE = '22023';
    END IF;
    IF _device.key_fingerprint = _fingerprint THEN
      RAISE EXCEPTION 'New device key must differ from the current key' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.omni_dock_devices
    WHERE key_fingerprint = _fingerprint AND status <> 'revoked'
      AND id IS DISTINCT FROM _rotation_device
  ) THEN
    RAISE EXCEPTION 'Native device key is already registered' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.omni_native_authorization_codes
      WHERE owner_id = auth.uid() AND created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Too many native sign-in approvals; wait 10 minutes' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_native_authorization_codes (
    owner_id, client_id, audience, redirect_uri, code_hash, code_challenge,
    proof_nonce_hash, public_key, key_fingerprint, label, platform, permissions,
    rotation_device_id, rotation_revision, expires_at
  ) VALUES (
    auth.uid(), _client_id, _audience, _redirect, _code_hash, _code_challenge,
    _proof_nonce_hash, _public_key, _fingerprint, btrim(_label), _platform,
    COALESCE(_selected, _device.permissions), _rotation_device,
    CASE WHEN _rotation_device IS NULL THEN NULL ELSE _device.revision END,
    now() + interval '60 seconds'
  ) RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'native_device_authorize', 'omni_native', _id::text);
  RETURN jsonb_build_object('ok', true, 'authorization_id', _id, 'expires_in', 60);
END $$;
REVOKE ALL ON FUNCTION public.omni_native_authorize(text,text,integer,text,text,text,bigint,jsonb,text,text,text,text[],uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_native_authorize(text,text,integer,text,text,text,bigint,jsonb,text,text,text,text[],uuid) TO authenticated;

-- Service-only PKCE exchange. It creates an already-consented device, never a bearer token.
-- Rotation preserves permissions and invalidates every nonce signed by the old key atomically.
CREATE OR REPLACE FUNCTION public.omni_native_exchange(
  _code_hash text, _code_challenge text, _client_id text, _audience text, _port integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _c public.omni_native_authorization_codes;
  _d public.omni_dock_devices;
  _now timestamptz := clock_timestamp();
  _redirect text;
BEGIN
  IF _code_hash IS NULL OR _code_hash !~ '^[0-9a-f]{64}$'
     OR _client_id IS DISTINCT FROM 'omni-native-cli'
     OR _audience IS DISTINCT FROM 'omni-mothership'
     OR _port IS NULL OR _port NOT BETWEEN 1024 AND 65535 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  _redirect := 'http://127.0.0.1:' || _port::text || '/callback';
  SELECT * INTO _c FROM public.omni_native_authorization_codes
    WHERE code_hash = _code_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;
  IF _c.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'code_already_used');
  END IF;
  UPDATE public.omni_native_authorization_codes SET used_at = _now WHERE id = _c.id;
  IF _c.expires_at <= _now THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'code_expired');
  END IF;
  IF _c.client_id IS DISTINCT FROM _client_id OR _c.audience IS DISTINCT FROM _audience
     OR _c.redirect_uri IS DISTINCT FROM _redirect THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'client_mismatch');
  END IF;
  IF _code_challenge IS NULL OR _c.code_challenge IS DISTINCT FROM _code_challenge THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pkce_mismatch');
  END IF;
  IF NOT public.omni_native_owner_ok(_c.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'owner_unverified');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_c.key_fingerprint, 0));
  IF _c.rotation_device_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.omni_dock_devices
      WHERE key_fingerprint = _c.key_fingerprint AND status <> 'revoked'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'key_in_use');
    END IF;
    INSERT INTO public.omni_dock_devices (
      owner_id, invite_id, native_client_id, native_authorization_id,
      branch_kind, label, platform, public_key, key_fingerprint, status,
      requested_permissions, permissions, approved_by, approved_at, claimed_at
    ) VALUES (
      _c.owner_id, NULL, _c.client_id, _c.id, 'omni_cli', _c.label, _c.platform,
      _c.public_key, _c.key_fingerprint, 'paired', _c.permissions, _c.permissions,
      _c.owner_id, _now, _now
    ) RETURNING * INTO _d;
  ELSE
    SELECT * INTO _d FROM public.omni_dock_devices
      WHERE id = _c.rotation_device_id FOR UPDATE;
    IF NOT FOUND OR _d.owner_id IS DISTINCT FROM _c.owner_id
       OR _d.native_client_id IS DISTINCT FROM _c.client_id
       OR _d.status IS DISTINCT FROM 'paired'
       OR _d.revision IS DISTINCT FROM _c.rotation_revision THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'rotation_stale');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.omni_dock_devices
      WHERE key_fingerprint = _c.key_fingerprint AND status <> 'revoked' AND id <> _d.id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'key_in_use');
    END IF;
    DELETE FROM public.omni_dock_nonces WHERE device_id = _d.id;
    UPDATE public.omni_dock_devices SET
      native_authorization_id = _c.id, public_key = _c.public_key,
      key_fingerprint = _c.key_fingerprint, label = _c.label, platform = _c.platform,
      last_seen_at = NULL, revision = revision + 1
    WHERE id = _d.id
    RETURNING * INTO _d;
    INSERT INTO public.omni_dock_events (device_id, event, outcome, detail)
    VALUES (_d.id, 'device_key_rotated', 'ok', _d.key_fingerprint);
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (_c.owner_id, 'native_device_rotate', 'omni_dock', _d.id::text);
  END IF;
  UPDATE public.omni_native_authorization_codes SET device_id = _d.id WHERE id = _c.id;
  IF _c.rotation_device_id IS NULL THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome, detail)
    VALUES (_d.id, 'device_enrolled', 'ok', _d.key_fingerprint);
    INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
    VALUES (_c.owner_id, 'native_device_enroll', 'omni_dock', _d.id::text);
  END IF;
  RETURN jsonb_build_object(
    'ok', true, 'device_id', _d.id, 'status', _d.status, 'permissions', to_jsonb(_d.permissions),
    'key_fingerprint', _d.key_fingerprint, 'revision', _d.revision
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_native_exchange(text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_exchange(text,text,text,text,integer) TO service_role;

-- Existing manual Dock enrollment keeps the same owner boundary.
CREATE OR REPLACE FUNCTION public.omni_dock_claim(
  _code_hash text, _label text, _platform text, _public_key jsonb, _fingerprint text,
  _app_version text, _capabilities text[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  _invite public.omni_dock_invites;
  _new uuid;
BEGIN
  IF (SELECT count(*) FROM public.omni_dock_events
      WHERE event = 'pair_failed' AND created_at > now() - interval '10 minutes') >= 50 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'throttled');
  END IF;
  SELECT * INTO _invite FROM public.omni_dock_invites WHERE code_hash = _code_hash FOR UPDATE;
  IF NOT FOUND OR _invite.consumed_at IS NOT NULL OR _invite.cancelled_at IS NOT NULL OR _invite.expires_at <= now() THEN
    INSERT INTO public.omni_dock_events (invite_id, event, outcome) VALUES (_invite.id, 'pair_failed', 'denied');
    RETURN jsonb_build_object('ok', false, 'reason', 'code_invalid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.omni_dock_devices WHERE key_fingerprint = _fingerprint AND status <> 'revoked') THEN
    INSERT INTO public.omni_dock_events (invite_id, event, outcome) VALUES (_invite.id, 'pair_failed', 'denied');
    RETURN jsonb_build_object('ok', false, 'reason', 'key_in_use');
  END IF;
  INSERT INTO public.omni_dock_devices (
    owner_id, invite_id, branch_kind, label, platform, public_key, key_fingerprint,
    requested_permissions, reported_capabilities, app_version
  )
  VALUES (
    _invite.created_by, _invite.id, _invite.branch_kind, btrim(_label), _platform, _public_key,
    _fingerprint, _invite.requested_permissions, COALESCE(_capabilities, '{}'), COALESCE(_app_version, '')
  ) RETURNING id INTO _new;
  UPDATE public.omni_dock_invites SET consumed_at = now(), consumed_device = _new WHERE id = _invite.id;
  INSERT INTO public.omni_dock_events (device_id, invite_id, event, outcome, detail)
  VALUES (_new, _invite.id, 'pair_claimed', 'ok', 'Waiting for owner approval');
  RETURN jsonb_build_object('ok', true, 'device_id', _new, 'branch_kind', _invite.branch_kind);
END $$;

CREATE OR REPLACE FUNCTION public.omni_dock_revoke(_device uuid, _reason text)
RETURNS SETOF public.omni_dock_devices
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  _clean text := left(COALESCE(btrim(_reason), ''), 200);
BEGIN
  PERFORM public.assert_razul_owner();
  IF public.omni_terminal_secret_like(_clean) THEN
    RAISE EXCEPTION 'Reason looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_dock_devices
    SET status = 'revoked', revoked_at = now(), revoke_reason = _clean, permissions = '{}', revision = revision + 1
    WHERE id = _device AND owner_id = auth.uid() AND status <> 'revoked';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active device with that id' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_terminal_tasks SET state = 'cancelled', cancelled_at = now()
    WHERE source_device = _device AND state = 'held';
  DELETE FROM public.omni_dock_nonces WHERE device_id = _device;
  INSERT INTO public.omni_dock_events (device_id, event, outcome, detail) VALUES (_device, 'device_revoked', 'ok', _clean);
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'dock_device_revoke', 'omni_dock', _device::text);
  RETURN QUERY SELECT * FROM public.omni_dock_devices WHERE id = _device;
END $$;

-- The native editor is available only after this migration is actually installed.
CREATE OR REPLACE FUNCTION public.omni_native_authorization_ready()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.omni_native_authorization_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_native_authorization_ready() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.omni_native_owner_ok(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.omni_native_authorize(text,text,integer,text,text,text,bigint,jsonb,text,text,text,text[],uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.omni_native_exchange(text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
