-- OMNI Docking Bay (protocol omni.dock/v1): owner-issued single-use pairing codes, device public keys,
-- owner approval, per-device permissions, revocation, signed-request nonces and an event log.
-- Records only. Nothing here executes, dispatches, enables autonomy, or contacts Railway/Jackboy/CODE.
-- Device autonomy has no column: it is off for every device until a later reviewed migration adds it.

CREATE TABLE public.omni_dock_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  branch_kind text NOT NULL CHECK (branch_kind IN ('honeycomb_mobile', 'omni_desktop', 'omni_cli')),
  requested_permissions text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_device uuid,
  cancelled_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
  CHECK (requested_permissions <@ ARRAY['status.read', 'log.read', 'jobs.propose', 'stop.engage', 'files.transfer']::text[])
);
GRANT SELECT ON public.omni_dock_invites TO authenticated;
GRANT ALL ON public.omni_dock_invites TO service_role;
ALTER TABLE public.omni_dock_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads dock invites"
  ON public.omni_dock_invites FOR SELECT TO authenticated
  USING (public.is_razul_owner());

CREATE TABLE public.omni_dock_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.omni_dock_invites(id),
  branch_kind text NOT NULL CHECK (branch_kind IN ('honeycomb_mobile', 'omni_desktop', 'omni_cli')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  platform text NOT NULL CHECK (platform IN ('ios', 'ipados', 'android', 'web', 'macos', 'windows', 'linux', 'unknown')),
  public_key jsonb NOT NULL,
  key_fingerprint text NOT NULL CHECK (key_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paired', 'revoked')),
  requested_permissions text[] NOT NULL DEFAULT '{}',
  permissions text[] NOT NULL DEFAULT '{}',
  reported_capabilities text[] NOT NULL DEFAULT '{}',
  app_version text NOT NULL DEFAULT '' CHECK (length(app_version) <= 40),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text NOT NULL DEFAULT '' CHECK (length(revoke_reason) <= 200),
  last_seen_at timestamptz,
  revision integer NOT NULL DEFAULT 0,
  CHECK (permissions <@ ARRAY['status.read', 'log.read', 'jobs.propose', 'stop.engage', 'files.transfer']::text[]),
  CHECK (cardinality(reported_capabilities) <= 16),
  CHECK (status <> 'paired' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (status <> 'revoked' OR (revoked_at IS NOT NULL AND cardinality(permissions) = 0))
);
CREATE UNIQUE INDEX omni_dock_devices_live_key ON public.omni_dock_devices (key_fingerprint) WHERE status <> 'revoked';
GRANT SELECT ON public.omni_dock_devices TO authenticated;
GRANT ALL ON public.omni_dock_devices TO service_role;
ALTER TABLE public.omni_dock_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads docked devices"
  ON public.omni_dock_devices FOR SELECT TO authenticated
  USING (public.is_razul_owner());

CREATE TABLE public.omni_dock_nonces (
  device_id uuid NOT NULL REFERENCES public.omni_dock_devices(id) ON DELETE CASCADE,
  nonce text NOT NULL CHECK (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, nonce)
);
GRANT ALL ON public.omni_dock_nonces TO service_role;
ALTER TABLE public.omni_dock_nonces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.omni_dock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid,
  invite_id uuid,
  event text NOT NULL CHECK (event ~ '^[a-z_]{3,40}$'),
  outcome text NOT NULL CHECK (outcome IN ('ok', 'refused', 'denied', 'error')),
  detail text NOT NULL DEFAULT '' CHECK (length(detail) <= 300),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX omni_dock_events_created_idx ON public.omni_dock_events (created_at DESC);
GRANT SELECT ON public.omni_dock_events TO authenticated;
GRANT ALL ON public.omni_dock_events TO service_role;
ALTER TABLE public.omni_dock_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Verified MFA owner reads dock events"
  ON public.omni_dock_events FOR SELECT TO authenticated
  USING (public.is_razul_owner());

REVOKE ALL ON public.omni_dock_invites, public.omni_dock_devices, public.omni_dock_nonces, public.omni_dock_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.omni_dock_invites, public.omni_dock_devices, public.omni_dock_events FROM authenticated;
REVOKE ALL ON public.omni_dock_nonces FROM authenticated;

-- Held tasks may now come from a docked device. Still 'held' only: no dispatcher exists.
ALTER TABLE public.omni_terminal_tasks ADD COLUMN source_device uuid REFERENCES public.omni_dock_devices(id);
CREATE INDEX omni_terminal_tasks_source_idx ON public.omni_terminal_tasks (source_device, created_at) WHERE source_device IS NOT NULL;

CREATE OR REPLACE FUNCTION public.omni_dock_valid_permissions(_p text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT _p IS NOT NULL
    AND cardinality(_p) <= 5
    AND _p <@ ARRAY['status.read', 'log.read', 'jobs.propose', 'stop.engage', 'files.transfer']::text[]
    AND NOT EXISTS (SELECT 1 FROM unnest(_p) v WHERE v IS NULL)
$$;

-- Owner (aal2) with fresh two-factor issues a short-lived single-use code. Only its hash is stored.
CREATE OR REPLACE FUNCTION public.omni_dock_create_invite(_code_hash text, _kind text, _requested text[], _minutes integer)
RETURNS SETOF public.omni_dock_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _new uuid;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF _minutes IS NULL OR _minutes < 2 OR _minutes > 15 THEN
    RAISE EXCEPTION 'Codes last 2 to 15 minutes' USING ERRCODE = '22023';
  END IF;
  IF NOT public.omni_dock_valid_permissions(_requested) THEN
    RAISE EXCEPTION 'Unknown permission requested' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.omni_dock_invites
      WHERE consumed_at IS NULL AND cancelled_at IS NULL AND expires_at > now()) >= 3 THEN
    RAISE EXCEPTION 'Three pairing codes are already open; cancel one first' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_dock_invites (code_hash, branch_kind, requested_permissions, created_by, expires_at)
  VALUES (_code_hash, _kind, _requested, auth.uid(), now() + make_interval(mins => _minutes))
  RETURNING id INTO _new;
  INSERT INTO public.omni_dock_events (invite_id, event, outcome, detail)
  VALUES (_new, 'invite_created', 'ok', _kind);
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'dock_invite_create', 'omni_dock', _new::text);
  RETURN QUERY SELECT * FROM public.omni_dock_invites WHERE id = _new;
END $$;

CREATE OR REPLACE FUNCTION public.omni_dock_cancel_invite(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  UPDATE public.omni_dock_invites SET cancelled_at = now()
  WHERE id = _id AND consumed_at IS NULL AND cancelled_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open pairing code with that id' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_dock_events (invite_id, event, outcome) VALUES (_id, 'invite_cancelled', 'ok');
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'dock_invite_cancel', 'omni_dock', _id::text);
END $$;

-- Owner approves a pending device after comparing the safety code. Permissions start from what the code requested.
CREATE OR REPLACE FUNCTION public.omni_dock_approve(_device uuid, _permissions text[])
RETURNS SETOF public.omni_dock_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.omni_dock_devices;
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  SELECT * INTO _row FROM public.omni_dock_devices WHERE id = _device FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'pending' THEN
    RAISE EXCEPTION 'No device is waiting for approval with that id' USING ERRCODE = '22023';
  END IF;
  IF _row.claimed_at < now() - interval '30 minutes' THEN
    UPDATE public.omni_dock_devices
      SET status = 'revoked', revoked_at = now(), revoke_reason = 'Approval window expired', permissions = '{}', revision = revision + 1
      WHERE id = _device;
    INSERT INTO public.omni_dock_events (device_id, event, outcome) VALUES (_device, 'approval_expired', 'refused');
    RETURN QUERY SELECT * FROM public.omni_dock_devices WHERE id = _device;
    RETURN;
  END IF;
  IF NOT public.omni_dock_valid_permissions(_permissions) OR NOT (_permissions <@ _row.requested_permissions) THEN
    RAISE EXCEPTION 'Permissions must come from what the pairing code requested' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_dock_devices
    SET status = 'paired', permissions = _permissions, approved_by = auth.uid(), approved_at = now(), revision = revision + 1
    WHERE id = _device;
  INSERT INTO public.omni_dock_events (device_id, event, outcome, detail)
  VALUES (_device, 'device_approved', 'ok', array_to_string(_permissions, ','));
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'dock_device_approve', 'omni_dock', _device::text);
  RETURN QUERY SELECT * FROM public.omni_dock_devices WHERE id = _device;
END $$;

CREATE OR REPLACE FUNCTION public.omni_dock_set_permissions(_device uuid, _permissions text[], _revision integer)
RETURNS SETOF public.omni_dock_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  PERFORM public.assert_fresh_mfa(900);
  IF NOT public.omni_dock_valid_permissions(_permissions) THEN
    RAISE EXCEPTION 'Unknown permission' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_dock_devices
    SET permissions = _permissions, revision = revision + 1
    WHERE id = _device AND status = 'paired' AND revision = _revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Device changed or is not paired; refresh and try again' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_dock_events (device_id, event, outcome, detail)
  VALUES (_device, 'permissions_changed', 'ok', array_to_string(_permissions, ','));
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'dock_device_permissions', 'omni_dock', _device::text);
  RETURN QUERY SELECT * FROM public.omni_dock_devices WHERE id = _device;
END $$;

-- Revoking needs only the verified owner, so it is always available. Held tasks from the device are cancelled.
CREATE OR REPLACE FUNCTION public.omni_dock_revoke(_device uuid, _reason text)
RETURNS SETOF public.omni_dock_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _clean text := left(COALESCE(btrim(_reason), ''), 200);
BEGIN
  PERFORM public.assert_razul_owner();
  IF public.omni_terminal_secret_like(_clean) THEN
    RAISE EXCEPTION 'Reason looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_dock_devices
    SET status = 'revoked', revoked_at = now(), revoke_reason = _clean, permissions = '{}', revision = revision + 1
    WHERE id = _device AND status <> 'revoked';
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

-- Service-only (public dock endpoint, after verifying proof of key possession). Consumes the code atomically.
-- Returns a reason instead of raising so the failure can be logged.
CREATE OR REPLACE FUNCTION public.omni_dock_claim(
  _code_hash text, _label text, _platform text, _public_key jsonb, _fingerprint text,
  _app_version text, _capabilities text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _invite public.omni_dock_invites;
  _new uuid;
BEGIN
  -- Codes carry 50 bits and last at most 15 minutes; this cap also bounds log growth from guessing.
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
  INSERT INTO public.omni_dock_devices (invite_id, branch_kind, label, platform, public_key, key_fingerprint,
                                        requested_permissions, reported_capabilities, app_version)
  VALUES (_invite.id, _invite.branch_kind, btrim(_label), _platform, _public_key, _fingerprint,
          _invite.requested_permissions, COALESCE(_capabilities, '{}'), COALESCE(_app_version, ''))
  RETURNING id INTO _new;
  UPDATE public.omni_dock_invites SET consumed_at = now(), consumed_device = _new WHERE id = _invite.id;
  INSERT INTO public.omni_dock_events (device_id, invite_id, event, outcome, detail)
  VALUES (_new, _invite.id, 'pair_claimed', 'ok', 'Waiting for owner approval');
  RETURN jsonb_build_object('ok', true, 'device_id', _new, 'branch_kind', _invite.branch_kind);
END $$;

-- Service-only: record a signed request after signature verification. Single-use nonces stop replays.
CREATE OR REPLACE FUNCTION public.omni_dock_touch(
  _device uuid, _nonce text, _event text, _capabilities text[], _app_version text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.omni_dock_devices;
BEGIN
  SELECT * INTO _row FROM public.omni_dock_devices WHERE id = _device FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_device');
  END IF;
  IF _row.status = 'revoked' THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome) VALUES (_device, _event, 'denied');
    RETURN jsonb_build_object('ok', false, 'reason', 'revoked');
  END IF;
  DELETE FROM public.omni_dock_nonces WHERE seen_at < now() - interval '15 minutes';
  BEGIN
    INSERT INTO public.omni_dock_nonces (device_id, nonce) VALUES (_device, _nonce);
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome, detail) VALUES (_device, _event, 'denied', 'Replayed request');
    RETURN jsonb_build_object('ok', false, 'reason', 'replay');
  END;
  UPDATE public.omni_dock_devices
    SET last_seen_at = now(),
        reported_capabilities = COALESCE(_capabilities, reported_capabilities),
        app_version = COALESCE(_app_version, app_version)
    WHERE id = _device;
  IF _event <> 'heartbeat' THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome) VALUES (_device, _event, 'ok');
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', _row.status, 'permissions', to_jsonb(_row.permissions),
                            'label', _row.label, 'owner', _row.approved_by);
END $$;

CREATE OR REPLACE FUNCTION public.omni_dock_log(_device uuid, _event text, _outcome text, _detail text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  INSERT INTO public.omni_dock_events (device_id, event, outcome, detail)
  VALUES (_device, _event, _outcome, left(COALESCE(_detail, ''), 300));
$$;

-- Service-only: a paired device with stop.engage may engage (never release) the Emergency Stop.
CREATE OR REPLACE FUNCTION public.omni_dock_engage_stop(_device uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.omni_dock_devices;
BEGIN
  SELECT * INTO _row FROM public.omni_dock_devices WHERE id = _device;
  IF NOT FOUND OR _row.status <> 'paired' OR NOT ('stop.engage' = ANY (_row.permissions)) THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome) VALUES (_device, 'stop_engage', 'denied');
    RETURN false;
  END IF;
  INSERT INTO public.omni_terminal_controls (id, emergency_stop, changed_by, changed_at, reason, revision)
  VALUES (1, true, _row.approved_by, now(), left('Engaged from docked device ' || _row.label, 280), 1)
  ON CONFLICT (id) DO UPDATE
    SET emergency_stop = true, changed_by = _row.approved_by, changed_at = now(),
        reason = left('Engaged from docked device ' || _row.label, 280),
        revision = public.omni_terminal_controls.revision + 1;
  INSERT INTO public.omni_dock_events (device_id, event, outcome) VALUES (_device, 'stop_engage', 'ok');
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (_row.approved_by, 'emergency_stop_engage_device', 'omni_dock', _device::text);
  RETURN true;
END $$;

-- Service-only: a paired device with jobs.propose may hold a task for the owner. Never dispatched.
CREATE OR REPLACE FUNCTION public.omni_dock_hold_task(
  _device uuid, _id uuid, _kind text, _agent text, _project text, _repository text, _instructions text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _row public.omni_dock_devices;
  _existing public.omni_terminal_tasks;
  _repo text := NULLIF(btrim(COALESCE(_repository, '')), '');
BEGIN
  SELECT * INTO _row FROM public.omni_dock_devices WHERE id = _device;
  IF NOT FOUND OR _row.status <> 'paired' OR NOT ('jobs.propose' = ANY (_row.permissions)) THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome) VALUES (_device, 'job_propose', 'denied');
    RETURN jsonb_build_object('ok', false, 'reason', 'not_permitted');
  END IF;
  IF public.omni_terminal_secret_like(_project) OR public.omni_terminal_secret_like(_instructions) THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome, detail) VALUES (_device, 'job_propose', 'refused', 'Looked like a secret');
    RETURN jsonb_build_object('ok', false, 'reason', 'secret_like');
  END IF;
  SELECT * INTO _existing FROM public.omni_terminal_tasks WHERE id = _id;
  IF FOUND THEN
    IF _existing.source_device IS DISTINCT FROM _device OR _existing.kind IS DISTINCT FROM _kind
       OR _existing.agent IS DISTINCT FROM _agent OR _existing.project_label IS DISTINCT FROM btrim(_project)
       OR _existing.repository IS DISTINCT FROM _repo OR _existing.instructions IS DISTINCT FROM btrim(_instructions) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'id_conflict');
    END IF;
    RETURN jsonb_build_object('ok', true, 'task_id', _id, 'state', _existing.state, 'duplicate', true);
  END IF;
  IF (SELECT count(*) FROM public.omni_terminal_tasks
      WHERE source_device = _device AND created_at > now() - interval '24 hours') >= 20 THEN
    INSERT INTO public.omni_dock_events (device_id, event, outcome, detail) VALUES (_device, 'job_propose', 'refused', 'Daily limit of 20');
    RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit');
  END IF;
  INSERT INTO public.omni_terminal_tasks (id, created_by, kind, agent, project_label, repository, instructions, source_device)
  VALUES (_id, _row.approved_by, _kind, _agent, btrim(_project), _repo, btrim(_instructions), _device);
  INSERT INTO public.omni_dock_events (device_id, event, outcome, detail) VALUES (_device, 'job_held', 'ok', _id::text);
  RETURN jsonb_build_object('ok', true, 'task_id', _id, 'state', 'held', 'duplicate', false);
END $$;

-- Terminal idempotency now compares every task field, including project and repository.
CREATE OR REPLACE FUNCTION public.omni_terminal_queue_task(
  _id uuid, _kind text, _agent text, _project text, _repository text, _instructions text
)
RETURNS SETOF public.omni_terminal_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _existing public.omni_terminal_tasks;
  _repo text := NULLIF(btrim(COALESCE(_repository, '')), '');
BEGIN
  PERFORM public.assert_razul_owner();
  IF _id IS NULL THEN
    RAISE EXCEPTION 'Task id is required' USING ERRCODE = '22023';
  END IF;
  IF public.omni_terminal_secret_like(_project) OR public.omni_terminal_secret_like(_instructions) THEN
    RAISE EXCEPTION 'Task text looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _existing FROM public.omni_terminal_tasks WHERE id = _id;
  IF FOUND THEN
    IF _existing.kind IS DISTINCT FROM _kind OR _existing.agent IS DISTINCT FROM _agent
       OR _existing.project_label IS DISTINCT FROM btrim(_project) OR _existing.repository IS DISTINCT FROM _repo
       OR _existing.instructions IS DISTINCT FROM btrim(_instructions) OR _existing.source_device IS NOT NULL THEN
      RAISE EXCEPTION 'Task id already used for a different task' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT * FROM public.omni_terminal_tasks WHERE id = _id;
    RETURN;
  END IF;
  INSERT INTO public.omni_terminal_tasks (id, created_by, kind, agent, project_label, repository, instructions)
  VALUES (_id, auth.uid(), _kind, _agent, btrim(_project), _repo, btrim(_instructions));
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'task_held', 'omni_terminal', _id::text);
  RETURN QUERY SELECT * FROM public.omni_terminal_tasks WHERE id = _id;
END $$;

REVOKE ALL ON FUNCTION public.omni_dock_valid_permissions(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_dock_valid_permissions(text[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.omni_dock_create_invite(text, text, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_dock_create_invite(text, text, text[], integer) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_dock_cancel_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_dock_cancel_invite(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_dock_approve(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_dock_approve(uuid, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_dock_set_permissions(uuid, text[], integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_dock_set_permissions(uuid, text[], integer) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_dock_revoke(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_dock_revoke(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_dock_claim(text, text, text, jsonb, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_dock_claim(text, text, text, jsonb, text, text, text[]) TO service_role;
REVOKE ALL ON FUNCTION public.omni_dock_touch(uuid, text, text, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_dock_touch(uuid, text, text, text[], text) TO service_role;
REVOKE ALL ON FUNCTION public.omni_dock_log(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_dock_log(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.omni_dock_engage_stop(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_dock_engage_stop(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.omni_dock_hold_task(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_dock_hold_task(uuid, uuid, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.omni_terminal_queue_task(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_terminal_queue_task(uuid, text, text, text, text, text) TO authenticated, service_role;