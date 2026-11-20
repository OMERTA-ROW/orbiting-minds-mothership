-- OMNI API keys: owner-authorized first-class "Never expires" option. Additive only:
-- existing finite keys keep their exact expires_at; never_expires defaults to false.
-- A never-expiring key stores expires_at = NULL and never_expires = true (enforced together),
-- stays hash-only, owner/MFA-created and works until the owner revokes it.
ALTER TABLE public.omni_api_keys ADD COLUMN never_expires boolean NOT NULL DEFAULT false;
ALTER TABLE public.omni_api_keys ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.omni_api_keys ADD CONSTRAINT omni_api_keys_expiry_shape CHECK (
  (never_expires AND expires_at IS NULL) OR (NOT never_expires AND expires_at IS NOT NULL)
);
COMMENT ON COLUMN public.omni_api_keys.never_expires IS
  'Owner chose "Never expires": expires_at is NULL and the key works until revoked.';

CREATE OR REPLACE FUNCTION public.omni_api_key_issue(
  _name text,
  _scopes text[],
  _key_hash text,
  _key_prefix text,
  _expiry_days integer,
  _never_expires boolean
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
  IF _never_expires IS NULL THEN
    RAISE EXCEPTION 'Choose an expiry or Never expires' USING ERRCODE = '22023';
  END IF;
  IF _never_expires AND _expiry_days IS NOT NULL THEN
    RAISE EXCEPTION 'A never-expiring key cannot also have an expiry' USING ERRCODE = '22023';
  END IF;
  IF NOT _never_expires AND (_expiry_days IS NULL OR _expiry_days < 1 OR _expiry_days > 365) THEN
    RAISE EXCEPTION 'Expiry must be 1-365 days' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT s) INTO _clean FROM unnest(_scopes) s
    WHERE s IN ('health', 'jobs');
  IF _clean IS NULL OR cardinality(_clean) < 1
     OR EXISTS (SELECT 1 FROM unnest(_scopes) s WHERE s IS NULL OR s NOT IN ('health', 'jobs')) THEN
    RAISE EXCEPTION 'Only approved scopes (health, jobs) are allowed, at least one' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_api_keys
    (name, key_prefix, key_hash, scopes, never_expires, expires_at, created_by)
  VALUES (
    trim(_name), _key_prefix, _key_hash, _clean, _never_expires,
    CASE WHEN _never_expires THEN NULL ELSE now() + make_interval(days => _expiry_days) END,
    auth.uid()
  )
  RETURNING id INTO _id;
  INSERT INTO public.razul_control_audit (actor_id, action, record_type, record_id)
  VALUES (auth.uid(), CASE WHEN _never_expires THEN 'create_no_expiry' ELSE 'create' END,
          'omni_api_key', _id::text);
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.omni_api_key_issue(text, text[], text, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_api_key_issue(text, text[], text, text, integer, boolean) TO authenticated;

COMMENT ON FUNCTION public.omni_api_key_create(text, text[], text, text, integer) IS
  'DEPRECATED: replaced by omni_api_key_issue (adds Never expires); kept for earlier published builds, finite expiry only.';

-- Same signature and service-role-only grant; a key is valid while active and either
-- never-expiring or not yet past its expiry.
CREATE OR REPLACE FUNCTION public.omni_api_key_verify(_key_hash text, _scope text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id FROM public.omni_api_keys
  WHERE key_hash = _key_hash
    AND status = 'active'
    AND ((never_expires AND expires_at IS NULL) OR (NOT never_expires AND expires_at > now()))
    AND _scope = ANY (scopes);
  IF _id IS NOT NULL THEN
    UPDATE public.omni_api_keys SET last_used_at = now() WHERE id = _id;
  END IF;
  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.omni_api_key_verify(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_api_key_verify(text, text) TO service_role;