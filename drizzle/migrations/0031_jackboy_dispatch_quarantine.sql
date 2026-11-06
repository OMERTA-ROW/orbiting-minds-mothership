-- Service-only receive quarantine. No function in this migration executes jobs.
CREATE TABLE public.jackboy_dispatch_grants (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  jackboy_owner_id uuid NOT NULL,
  project_id uuid NOT NULL,
  job_id uuid NOT NULL,
  repo text NOT NULL CHECK (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  kind text NOT NULL CHECK (kind = 'test'),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jackboy_dispatch_nonces (
  nonce text PRIMARY KEY CHECK (nonce ~ '^[a-f0-9]{32}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.jackboy_dispatch_jobs (
  id uuid PRIMARY KEY,
  grant_id uuid NOT NULL REFERENCES public.jackboy_dispatch_grants(id),
  payload_digest text NOT NULL,
  status text NOT NULL CHECK (status IN ('quarantined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.jackboy_dispatch_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jackboy_dispatch_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jackboy_dispatch_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.jackboy_dispatch_grants, public.jackboy_dispatch_nonces, public.jackboy_dispatch_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.jackboy_dispatch_grants, public.jackboy_dispatch_nonces, public.jackboy_dispatch_jobs TO service_role;

CREATE FUNCTION public.jackboy_dispatch_owner_grant(
  _op text, _id uuid, _jackboy_owner uuid, _project uuid, _job uuid,
  _repo text, _digest text, _expires timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE g public.jackboy_dispatch_grants;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Verified MFA owner required';
  END IF;
  IF _op = 'issue' THEN
    IF _id IS NULL OR _jackboy_owner IS NULL OR _project IS NULL OR _job IS NULL
      OR _repo IS NULL OR _repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
      OR _digest IS NULL OR _digest !~ '^[a-f0-9]{64}$'
      OR _expires IS NULL OR _expires <= now() OR _expires > now() + interval '15 minutes'
      THEN RAISE EXCEPTION 'Invalid grant scope'; END IF;
    INSERT INTO public.jackboy_dispatch_grants
      (id, owner_id, jackboy_owner_id, project_id, job_id, repo, kind, payload_digest, expires_at)
      VALUES (_id, auth.uid(), _jackboy_owner, _project, _job, _repo, 'test', _digest, _expires)
      RETURNING * INTO g;
  ELSIF _op = 'revoke' THEN
    SELECT * INTO g FROM public.jackboy_dispatch_grants WHERE id = _id AND owner_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grant not found'; END IF;
    IF g.revoked_at IS NULL THEN
      UPDATE public.jackboy_dispatch_grants SET revoked_at = now() WHERE id = _id RETURNING * INTO g;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid operation';
  END IF;
  INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
    VALUES(auth.uid(), 'jackboy-grant-' || _op, 'jackboy_dispatch_grant', g.id::text);
  RETURN jsonb_build_object('id', g.id, 'expiresAt', g.expires_at, 'revoked', g.revoked_at IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.jackboy_dispatch_owner_grant(text,uuid,uuid,uuid,uuid,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jackboy_dispatch_owner_grant(text,uuid,uuid,uuid,uuid,text,text,timestamptz) TO authenticated;

-- Admission and audit commit together; caller must authenticate and verify the
-- request signature and exact body digest before invoking this service-only RPC.
CREATE FUNCTION public.jackboy_dispatch_quarantine(
  _op text, _nonce text, _grant uuid, _job uuid, _owner uuid, _project uuid,
  _repo text, _kind text, _digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE g public.jackboy_dispatch_grants; j public.jackboy_dispatch_jobs;
BEGIN
  IF _op IS NULL OR _op NOT IN ('submit', 'status', 'cancel')
    OR _nonce IS NULL OR _nonce !~ '^[a-f0-9]{32}$'
    OR _digest IS NULL OR _digest !~ '^[a-f0-9]{64}$'
    OR _grant IS NULL OR _job IS NULL OR _owner IS NULL OR _project IS NULL
    OR _repo IS NULL OR _kind IS NULL THEN RAISE EXCEPTION 'Invalid request'; END IF;
  SELECT * INTO g FROM public.jackboy_dispatch_grants WHERE id = _grant FOR UPDATE;
  IF NOT FOUND OR g.revoked_at IS NOT NULL OR g.expires_at <= now()
    OR g.expires_at > now() + interval '15 minutes'
    OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = g.owner_id AND role = 'owner')
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = g.owner_id AND email_confirmed_at IS NOT NULL)
    OR g.job_id IS DISTINCT FROM _job OR g.jackboy_owner_id IS DISTINCT FROM _owner
    OR g.project_id IS DISTINCT FROM _project OR g.repo IS DISTINCT FROM _repo
    OR g.kind IS DISTINCT FROM _kind OR g.payload_digest IS DISTINCT FROM _digest
    THEN RAISE EXCEPTION 'Grant unavailable'; END IF;
  INSERT INTO public.jackboy_dispatch_nonces(nonce) VALUES (_nonce) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'Replayed nonce'; END IF;
  SELECT * INTO j FROM public.jackboy_dispatch_jobs WHERE id = _job FOR UPDATE;
  IF FOUND AND (j.grant_id <> _grant OR j.payload_digest <> _digest)
    THEN RAISE EXCEPTION 'Conflicting job'; END IF;
  IF _op = 'submit' AND j.id IS NULL THEN
    INSERT INTO public.jackboy_dispatch_jobs(id, grant_id, payload_digest, status)
      VALUES(_job, _grant, _digest, 'quarantined') RETURNING * INTO j;
  ELSIF j.id IS NULL THEN
    RAISE EXCEPTION 'Unknown job';
  ELSIF _op = 'cancel' AND j.status = 'quarantined' THEN
    UPDATE public.jackboy_dispatch_jobs SET status = 'cancelled', updated_at = now()
      WHERE id = _job RETURNING * INTO j;
  END IF;
  INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
    VALUES(g.owner_id, 'jackboy-' || _op, 'jackboy_dispatch_job', _job::text);
  RETURN jsonb_build_object('id', j.id, 'status', j.status);
END $$;
REVOKE ALL ON FUNCTION public.jackboy_dispatch_quarantine(text,text,uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jackboy_dispatch_quarantine(text,text,uuid,uuid,uuid,uuid,text,text,text) TO service_role;

-- An MFA owner explicitly sends a stored quarantine state; this never runs a job.
CREATE FUNCTION public.jackboy_dispatch_callback_snapshot(
  _op text, _job uuid, _expected_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE g public.jackboy_dispatch_grants; j public.jackboy_dispatch_jobs;
BEGIN
  IF public.is_razul_owner() IS DISTINCT FROM true OR auth.uid() IS NULL
    OR _op IS NULL OR _op NOT IN ('prepare','ack') OR _job IS NULL
    THEN RAISE EXCEPTION 'Verified MFA owner required'; END IF;
  SELECT * INTO j FROM public.jackboy_dispatch_jobs WHERE id = _job;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job unavailable'; END IF;
  SELECT * INTO g FROM public.jackboy_dispatch_grants WHERE id = j.grant_id FOR UPDATE;
  SELECT * INTO j FROM public.jackboy_dispatch_jobs WHERE id = _job FOR UPDATE;
  IF NOT FOUND OR g.owner_id IS DISTINCT FROM auth.uid() OR g.revoked_at IS NOT NULL
    OR g.id IS DISTINCT FROM j.grant_id OR g.expires_at <= now()
    OR g.payload_digest IS DISTINCT FROM j.payload_digest
    OR (_op = 'ack' AND (_expected_status IS NULL OR _expected_status IS DISTINCT FROM j.status))
    THEN RAISE EXCEPTION 'Callback grant or state unavailable'; END IF;
  INSERT INTO public.razul_control_audit(actor_id, action, record_type, record_id)
    VALUES(auth.uid(), 'jackboy-callback-' || _op, 'jackboy_dispatch_job', j.id::text);
  RETURN jsonb_build_object('ownerId', g.jackboy_owner_id, 'projectId', g.project_id,
    'grantId', g.id, 'jobId', j.id, 'repo', g.repo, 'payloadDigest', g.payload_digest,
    'status', j.status);
END $$;
REVOKE ALL ON FUNCTION public.jackboy_dispatch_callback_snapshot(text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.jackboy_dispatch_callback_snapshot(text,uuid,text) TO authenticated;
