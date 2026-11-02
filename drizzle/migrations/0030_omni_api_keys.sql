-- OMNI API credential provisioning: owner-only create/rotate/revoke, SHA-256 hash-only
-- storage (plaintext secrets are generated in the server function and shown once),
-- scoped expiring keys, service-role-only verification for the authenticated
-- /api/public/omni/* endpoints, and audit rows in the existing owner control log.

CREATE TABLE public.omni_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz
);
GRANT SELECT ON public.omni_api_keys TO authenticated;
GRANT ALL ON public.omni_api_keys TO service_role;
ALTER TABLE public.omni_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Omni API key private owner boundary" ON public.omni_api_keys AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_razul_owner()) WITH CHECK (public.is_razul_owner());
CREATE POLICY "Owner reads OMNI API keys" ON public.omni_api_keys FOR SELECT TO authenticated
  USING (public.is_razul_owner());

CREATE OR REPLACE FUNCTION public.omni_api_key_create(
  _name text,
  _scopes text[],
  _key_hash text,
  _key_prefix text,
  _days integer
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
  _clean text[];
BEGIN
  PERFORM public.assert_razul_owner();
  IF _name IS NULL OR length(trim(_name)) < 1 OR length(_name) > 60 THEN
    RAISE EXCEPTION 'Key name must be 1-60 characters' USING ERRCODE = '22023';
  END IF;
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Key hash must be a 64-char hex string' USING ERRCODE = '22023';
  END IF;
  IF _key_prefix IS NULL OR _key_prefix !~ '^omni_[0-9a-f]{4,8}$' THEN
    RAISE EXCEPTION 'Key prefix must be omni_ plus 4-8 hex chars' USING ERRCODE = '22023';
  END IF;
  IF _days IS NULL OR _days < 1 OR _days > 365 THEN
    RAISE EXCEPTION 'Expiry must be 1-365 days' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT s) INTO _clean FROM unnest(_scopes) s
    WHERE s IN ('health', 'jobs');
  IF _clean IS NULL OR cardinality(_clean) < 1 THEN
    RAISE EXCEPTION 'At least one approved scope (health, jobs) is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_api_keys (name, key_prefix, key_hash, scopes, expires_at, created_by)
  VALUES (trim(_name), _key_prefix, _key_hash, _clean, now() + make_interval(days => _days), auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'create', 'omni_api_key', _id::text);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.omni_api_key_create(text, text[], text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_api_key_create(text, text[], text, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.omni_api_key_rotate(
  _id uuid,
  _key_hash text,
  _key_prefix text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF _key_hash IS NULL OR _key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Key hash must be a 64-char hex string' USING ERRCODE = '22023';
  END IF;
  IF _key_prefix IS NULL OR _key_prefix !~ '^omni_[0-9a-f]{4,8}$' THEN
    RAISE EXCEPTION 'Key prefix must be omni_ plus 4-8 hex chars' USING ERRCODE = '22023';
  END IF;
  UPDATE public.omni_api_keys
  SET key_hash = _key_hash, key_prefix = _key_prefix, rotated_at = now(), last_used_at = NULL
  WHERE id = _id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active key not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'rotate', 'omni_api_key', _id::text);
END $$;
REVOKE ALL ON FUNCTION public.omni_api_key_rotate(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_api_key_rotate(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.omni_api_key_revoke(_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  UPDATE public.omni_api_keys SET status = 'revoked' WHERE id = _id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active key not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), 'revoke', 'omni_api_key', _id::text);
END $$;
REVOKE ALL ON FUNCTION public.omni_api_key_revoke(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_api_key_revoke(uuid) TO authenticated;

-- Verification is service-role only: the /api/public/omni/* routes call it with the
-- admin client after hashing the presented bearer key. Returns the key id on success
-- (for audit records) or NULL on any failure; never returns the hash or secret.
CREATE OR REPLACE FUNCTION public.omni_api_key_verify(_key_hash text, _scope text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM public.omni_api_keys
  WHERE key_hash = _key_hash
    AND status = 'active'
    AND expires_at > now()
    AND _scope = ANY (scopes);
  IF _id IS NOT NULL THEN
    UPDATE public.omni_api_keys SET last_used_at = now() WHERE id = _id;
  END IF;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.omni_api_key_verify(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_api_key_verify(text, text) TO service_role;