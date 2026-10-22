ALTER TABLE public.knowledge_job_state ADD COLUMN lease_owner uuid;
CREATE FUNCTION public.claim_owned_knowledge_lease(_owner uuid, _minutes integer DEFAULT 10) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ok boolean;
BEGIN
 IF _owner IS NULL OR _minutes IS NULL OR _minutes < 1 OR _minutes > 10 THEN RETURN false; END IF;
 UPDATE public.knowledge_job_state SET lease_owner = _owner, lease_until = now() + make_interval(mins => _minutes)
 WHERE id = 1 AND (lease_until IS NULL OR lease_until < now()) RETURNING true INTO ok;
 RETURN coalesce(ok, false);
END $$;
REVOKE ALL ON FUNCTION public.claim_owned_knowledge_lease(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_owned_knowledge_lease(uuid, integer) TO service_role;
CREATE FUNCTION public.release_owned_knowledge_lease(_owner uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ok boolean;
BEGIN
 UPDATE public.knowledge_job_state SET lease_until = NULL, lease_owner = NULL WHERE id = 1 AND lease_owner = _owner RETURNING true INTO ok;
 RETURN coalesce(ok, false);
END $$;
REVOKE ALL ON FUNCTION public.release_owned_knowledge_lease(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_owned_knowledge_lease(uuid) TO service_role;
COMMENT ON FUNCTION public.claim_knowledge_lease(integer) IS 'DEPRECATED: use claim_owned_knowledge_lease and token-matched release; retained for old deployed code.';
CREATE FUNCTION public.record_beta_access_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
 INSERT INTO public.beta_audit(owner_id, capability, record_id, action) VALUES(NEW.user_id, 'beta_access', NEW.user_id, TG_OP);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_beta_access_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER beta_access_audit AFTER INSERT OR UPDATE ON public.beta_access FOR EACH ROW EXECUTE FUNCTION public.record_beta_access_change();
COMMENT ON FUNCTION public.record_beta_access_change() IS 'Records access approval and pause changes as private unsigned metadata; does not confer approval authority or store credentials.';