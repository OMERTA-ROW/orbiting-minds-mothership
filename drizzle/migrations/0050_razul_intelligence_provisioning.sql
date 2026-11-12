-- Razul intelligence provisioning. Additive. A manifest is a versioned PROPOSAL describing one
-- specialist agent for one Jackboy-built app; it never grants tools, sets secrets or changes
-- production. Owner reads only; owner actions go through definer functions; the database refuses,
-- on its own, approval without a proof-verified passing sandbox evaluation (<24 h) of the exact
-- manifest, approval/widening/promotion without the owner's fresh second factor, widening while
-- Emergency Stop is engaged or the terminal is disabled, and any write to releases except through
-- a promotion or rollback. There is no continuous or automatic promotion.

CREATE TABLE public.razul_agent_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id text NOT NULL CHECK (app_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  agent_id text NOT NULL CHECK (agent_id ~ '^[a-z][a-z0-9-]{1,39}$'),
  version text NOT NULL CHECK (version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
  manifest jsonb NOT NULL,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  created_by text NOT NULL CHECK (created_by IN ('owner','razul')),
  created_by_user uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, agent_id, version),
  CHECK (manifest->>'contract' = 'razul.manifest/v1'),
  CHECK (manifest->>'appId' = app_id AND manifest->>'agentId' = agent_id AND manifest->>'version' = version),
  CHECK (manifest->>'knowledgeNamespace' = 'app/' || app_id || '/' || agent_id),
  CHECK (jsonb_typeof(manifest->'tools') = 'array'
    AND manifest->'tools' <@ '["knowledge.search","memory.read","memory.propose","status.read","code.propose"]'::jsonb),
  CHECK (jsonb_typeof(manifest->'requiredSettings') = 'array'),
  CHECK (manifest#>>'{memory,ownerManaged}' = 'true' AND manifest#>>'{memory,scope}' = 'agent'),
  CHECK ((manifest#>>'{budgets,taskCents}')::integer BETWEEN 0 AND 100
    AND (manifest#>>'{budgets,dayCents}')::integer BETWEEN 0 AND 500
    AND (manifest#>>'{budgets,totalCents}')::integer BETWEEN 0 AND 1000)
);

CREATE TABLE public.razul_update_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  app_id text NOT NULL,
  agent_id text NOT NULL,
  manifest_id uuid NOT NULL UNIQUE REFERENCES public.razul_agent_manifests(id),
  previous_manifest_id uuid REFERENCES public.razul_agent_manifests(id),
  proposed_by text NOT NULL CHECK (proposed_by IN ('owner','razul')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','evaluated','approved','rejected','staged','promoted','rolled_back','withdrawn')),
  escalations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(escalations) = 'array'),
  changes jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(changes) = 'array'),
  escalations_acknowledged boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 280),
  stage smallint CHECK (stage IS NULL OR stage IN (10, 50, 100)),
  stage_healthy boolean,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 0
);
-- One open proposal per agent at a time.
CREATE UNIQUE INDEX razul_update_proposals_one_open ON public.razul_update_proposals (app_id, agent_id)
  WHERE status IN ('proposed','evaluated','approved','staged');

CREATE TABLE public.razul_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.razul_update_proposals(id),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  kind text NOT NULL CHECK (kind IN ('static','sandbox')),
  passed boolean NOT NULL,
  proof_verified boolean NOT NULL DEFAULT false,
  runner text NOT NULL CHECK (char_length(runner) BETWEEN 1 AND 80),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ran_at timestamptz NOT NULL DEFAULT now(),
  -- A sandbox result counts only when the Mothership verified the sandbox's signed proof.
  CHECK (kind <> 'sandbox' OR proof_verified)
);

-- The single active manifest per agent. Written only by the promotion/rollback trigger.
CREATE TABLE public.razul_agent_releases (
  app_id text NOT NULL,
  agent_id text NOT NULL,
  manifest_id uuid NOT NULL REFERENCES public.razul_agent_manifests(id),
  previous_manifest_id uuid REFERENCES public.razul_agent_manifests(id),
  proposal_id uuid NOT NULL REFERENCES public.razul_update_proposals(id),
  released_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, agent_id)
);

CREATE TABLE public.razul_knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace text NOT NULL CHECK (namespace ~ '^app/[a-z][a-z0-9-]{1,39}/[a-z][a-z0-9-]{1,39}$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 20000),
  source_kind text NOT NULL CHECK (source_kind IN ('owner_upload','official_url','owner_typed')),
  source_ref text NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 300),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  retrieved_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX razul_knowledge_docs_ns ON public.razul_knowledge_docs (namespace, created_at);

CREATE TABLE public.razul_provisioning_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL CHECK (char_length(actor) <= 40),
  event text NOT NULL CHECK (char_length(event) <= 60),
  app_id text,
  agent_id text,
  proposal_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['razul_agent_manifests','razul_update_proposals','razul_evaluations','razul_agent_releases','razul_knowledge_docs','razul_provisioning_events'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Owner reads" ON public.%I FOR SELECT TO authenticated USING (public.is_razul_owner())', t);
  END LOOP;
END $$;
-- Releases change only through the trigger below, never by direct writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.razul_agent_releases FROM service_role;

CREATE TRIGGER razul_agent_manifests_append_only BEFORE UPDATE OR DELETE ON public.razul_agent_manifests
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER razul_agent_manifests_no_truncate BEFORE TRUNCATE ON public.razul_agent_manifests
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER razul_evaluations_append_only BEFORE UPDATE OR DELETE ON public.razul_evaluations
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER razul_evaluations_no_truncate BEFORE TRUNCATE ON public.razul_evaluations
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER razul_provisioning_events_append_only BEFORE UPDATE OR DELETE ON public.razul_provisioning_events
  FOR EACH ROW EXECUTE FUNCTION public.omni_append_only();
CREATE TRIGGER razul_provisioning_events_no_truncate BEFORE TRUNCATE ON public.razul_provisioning_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();

-- Manifest content checks that CHECK constraints cannot express: setting NAMES only, no secret-like text.
CREATE OR REPLACE FUNCTION public.razul_manifest_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _s jsonb;
BEGIN
  IF jsonb_array_length(NEW.manifest->'requiredSettings') > 10 OR jsonb_array_length(NEW.manifest->'tools') > 10 THEN
    RAISE EXCEPTION 'Too many tools or settings' USING ERRCODE = '22023';
  END IF;
  FOR _s IN SELECT * FROM jsonb_array_elements(NEW.manifest->'requiredSettings') LOOP
    IF jsonb_typeof(_s) <> 'string' OR NOT (_s #>> '{}') ~ '^[A-Z][A-Z0-9_]{2,63}$' THEN
      RAISE EXCEPTION 'Required settings must be names only' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF public.omni_terminal_secret_like(COALESCE(NEW.manifest#>>'{identity,name}','') || ' ' || COALESCE(NEW.manifest#>>'{identity,purpose}','')) THEN
    RAISE EXCEPTION 'Manifest text looks like a key or token' USING ERRCODE = '22023';
  END IF;
  IF NEW.manifest_sha256 <> encode(sha256(convert_to(NEW.manifest::text, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Manifest digest does not match its content' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER razul_manifest_guard BEFORE INSERT ON public.razul_agent_manifests
  FOR EACH ROW EXECUTE FUNCTION public.razul_manifest_guard();

CREATE OR REPLACE FUNCTION public.razul_proposal_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE _m public.razul_agent_manifests; _stop boolean; _enabled boolean; _release uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'proposed' OR NEW.stage IS NOT NULL OR NEW.stage_healthy IS NOT NULL
       OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.escalations_acknowledged THEN
      RAISE EXCEPTION 'Proposals start as proposed' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO _m FROM public.razul_agent_manifests WHERE id = NEW.manifest_id;
    IF _m.app_id IS DISTINCT FROM NEW.app_id OR _m.agent_id IS DISTINCT FROM NEW.agent_id THEN
      RAISE EXCEPTION 'Proposal does not match its manifest' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.owner_id <> OLD.owner_id OR NEW.app_id <> OLD.app_id OR NEW.agent_id <> OLD.agent_id
     OR NEW.manifest_id <> OLD.manifest_id OR NEW.previous_manifest_id IS DISTINCT FROM OLD.previous_manifest_id
     OR NEW.proposed_by <> OLD.proposed_by OR NEW.created_at <> OLD.created_at
     OR NEW.escalations <> OLD.escalations OR NEW.changes <> OLD.changes THEN
    RAISE EXCEPTION 'Proposal identity and content cannot change' USING ERRCODE = '22023';
  END IF;
  IF OLD.status IN ('rejected','withdrawn','rolled_back') THEN
    RAISE EXCEPTION 'This proposal is closed' USING ERRCODE = '22023';
  END IF;
  IF NEW.status <> 'approved' AND NEW.status <> 'staged' AND NEW.status <> 'promoted'
     AND (NEW.approved_by IS DISTINCT FROM OLD.approved_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at) THEN
    RAISE EXCEPTION 'Approval fields change only on approval' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO _m FROM public.razul_agent_manifests WHERE id = NEW.manifest_id;

  IF NEW.status = OLD.status AND NEW.status <> 'staged' THEN
    IF NEW.stage IS DISTINCT FROM OLD.stage OR NEW.stage_healthy IS DISTINCT FROM OLD.stage_healthy
       OR NEW.escalations_acknowledged <> OLD.escalations_acknowledged THEN
      RAISE EXCEPTION 'Nothing to change in this state' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.status = 'evaluated' THEN
    IF OLD.status <> 'proposed' OR NOT EXISTS (
      SELECT 1 FROM public.razul_evaluations e WHERE e.proposal_id = NEW.id AND e.kind = 'sandbox' AND e.manifest_sha256 = _m.manifest_sha256) THEN
      RAISE EXCEPTION 'Needs a sandbox evaluation' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.status IN ('rejected','withdrawn') THEN
    IF NEW.status = 'withdrawn' AND OLD.status NOT IN ('proposed','evaluated') THEN
      RAISE EXCEPTION 'Only unapproved proposals can be withdrawn' USING ERRCODE = '22023';
    END IF;
    IF NEW.status = 'rejected' AND OLD.status NOT IN ('proposed','evaluated','approved') THEN
      RAISE EXCEPTION 'Staged or promoted proposals are rolled back, not rejected' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.status = 'approved' THEN
    PERFORM public.assert_razul_owner();
    PERFORM public.assert_fresh_mfa(900);
    IF OLD.status <> 'evaluated' THEN RAISE EXCEPTION 'Evaluate the proposal first' USING ERRCODE = '22023'; END IF;
    IF NEW.approved_by IS DISTINCT FROM auth.uid() OR NEW.approved_at IS NULL OR NEW.approved_at < now() - interval '1 minute' OR NEW.approved_at > now() + interval '1 minute' THEN
      RAISE EXCEPTION 'Approval must be recorded by the owner now' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(NEW.escalations) > 0 AND NOT NEW.escalations_acknowledged THEN
      RAISE EXCEPTION 'Acknowledge each new permission, model, budget or setting first' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.razul_evaluations e WHERE e.proposal_id = NEW.id AND e.manifest_sha256 = _m.manifest_sha256 AND NOT e.passed) THEN
      RAISE EXCEPTION 'An evaluation of this manifest failed' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.razul_evaluations e WHERE e.proposal_id = NEW.id AND e.kind = 'sandbox'
                   AND e.passed AND e.proof_verified AND e.manifest_sha256 = _m.manifest_sha256 AND e.ran_at >= now() - interval '24 hours') THEN
      RAISE EXCEPTION 'Needs a passing sandbox evaluation from the last 24 hours' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.status = 'staged' THEN
    IF OLD.status = 'staged' AND NEW.stage = OLD.stage THEN
      -- Health-check result for the current stage only.
      IF NEW.escalations_acknowledged <> OLD.escalations_acknowledged THEN
        RAISE EXCEPTION 'Nothing to change in this state' USING ERRCODE = '22023';
      END IF;
    ELSE
      PERFORM public.assert_razul_owner();
      PERFORM public.assert_fresh_mfa(900);
      SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
      IF _stop IS DISTINCT FROM false THEN RAISE EXCEPTION 'Emergency Stop is engaged or unreadable' USING ERRCODE = '22023'; END IF;
      SELECT terminal_enabled INTO _enabled FROM public.omni_workspace_settings WHERE id = 1;
      IF _enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'The terminal kill switch is off' USING ERRCODE = '22023'; END IF;
      SELECT manifest_id INTO _release FROM public.razul_agent_releases WHERE app_id = NEW.app_id AND agent_id = NEW.agent_id;
      IF _release IS DISTINCT FROM NEW.previous_manifest_id THEN
        RAISE EXCEPTION 'The active version changed since this was proposed' USING ERRCODE = '22023';
      END IF;
      IF NEW.stage_healthy IS NOT NULL THEN RAISE EXCEPTION 'A new stage starts unchecked' USING ERRCODE = '22023'; END IF;
      IF OLD.status = 'approved' THEN
        IF NEW.stage IS DISTINCT FROM 10 THEN RAISE EXCEPTION 'Start at 10%%' USING ERRCODE = '22023'; END IF;
      ELSIF OLD.status = 'staged' THEN
        IF OLD.stage_healthy IS NOT TRUE THEN RAISE EXCEPTION 'The current stage has not passed its health check' USING ERRCODE = '22023'; END IF;
        IF NOT ((OLD.stage = 10 AND NEW.stage = 50) OR (OLD.stage = 50 AND NEW.stage = 100)) THEN
          RAISE EXCEPTION 'Widen one stage at a time' USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'Approve the proposal first' USING ERRCODE = '22023';
      END IF;
    END IF;
  ELSIF NEW.status = 'promoted' THEN
    PERFORM public.assert_razul_owner();
    PERFORM public.assert_fresh_mfa(900);
    IF OLD.status <> 'staged' OR OLD.stage IS DISTINCT FROM 100 OR OLD.stage_healthy IS NOT TRUE THEN
      RAISE EXCEPTION 'Promote only after a healthy 100%% stage' USING ERRCODE = '22023';
    END IF;
    SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
    IF _stop IS DISTINCT FROM false THEN RAISE EXCEPTION 'Emergency Stop is engaged or unreadable' USING ERRCODE = '22023'; END IF;
    SELECT manifest_id INTO _release FROM public.razul_agent_releases WHERE app_id = NEW.app_id AND agent_id = NEW.agent_id;
    IF _release IS DISTINCT FROM NEW.previous_manifest_id THEN
      RAISE EXCEPTION 'The active version changed since this was proposed' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.status = 'rolled_back' THEN
    -- A reduction: allowed for the owner or the service at any time, including during Emergency Stop.
    IF OLD.status NOT IN ('staged','promoted') THEN RAISE EXCEPTION 'Nothing to roll back' USING ERRCODE = '22023'; END IF;
    NEW.stage := NULL;
    NEW.stage_healthy := NULL;
  ELSE
    RAISE EXCEPTION 'Transition not allowed' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := now();
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END $$;
CREATE TRIGGER razul_proposal_guard BEFORE INSERT OR UPDATE ON public.razul_update_proposals
  FOR EACH ROW EXECUTE FUNCTION public.razul_proposal_guard();
CREATE TRIGGER razul_proposal_no_delete BEFORE DELETE OR TRUNCATE ON public.razul_update_proposals
  FOR EACH STATEMENT EXECUTE FUNCTION public.omni_append_only();

-- Releases and audit follow promotion/rollback. Runs as definer so releases stay write-protected.
CREATE OR REPLACE FUNCTION public.razul_proposal_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'promoted' AND OLD.status <> 'promoted' THEN
    INSERT INTO public.razul_agent_releases (app_id, agent_id, manifest_id, previous_manifest_id, proposal_id, released_at)
    VALUES (NEW.app_id, NEW.agent_id, NEW.manifest_id, NEW.previous_manifest_id, NEW.id, now())
    ON CONFLICT (app_id, agent_id) DO UPDATE SET manifest_id = EXCLUDED.manifest_id,
      previous_manifest_id = EXCLUDED.previous_manifest_id, proposal_id = EXCLUDED.proposal_id, released_at = now();
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'rolled_back' AND OLD.status = 'promoted' THEN
    IF NEW.previous_manifest_id IS NULL THEN
      DELETE FROM public.razul_agent_releases WHERE app_id = NEW.app_id AND agent_id = NEW.agent_id AND proposal_id = NEW.id;
    ELSE
      UPDATE public.razul_agent_releases SET manifest_id = NEW.previous_manifest_id, previous_manifest_id = NULL, released_at = now()
      WHERE app_id = NEW.app_id AND agent_id = NEW.agent_id AND proposal_id = NEW.id;
    END IF;
  END IF;
  INSERT INTO public.razul_provisioning_events (actor, event, app_id, agent_id, proposal_id, detail)
  VALUES (CASE WHEN auth.uid() IS NULL THEN 'service' ELSE 'owner' END,
          CASE WHEN TG_OP = 'INSERT' THEN 'proposal_created' ELSE 'proposal_' || NEW.status END,
          NEW.app_id, NEW.agent_id, NEW.id,
          jsonb_build_object('stage', NEW.stage, 'healthy', NEW.stage_healthy, 'revision', NEW.revision));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.razul_proposal_after() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER razul_proposal_after AFTER INSERT OR UPDATE ON public.razul_update_proposals
  FOR EACH ROW EXECUTE FUNCTION public.razul_proposal_after();

-- Owner: propose a manifest (owner-authored). The database computes the digest itself.
CREATE OR REPLACE FUNCTION public.razul_propose_manifest(_manifest jsonb, _escalations jsonb, _changes jsonb, _note text, _static jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _app text := _manifest->>'appId'; _agent text := _manifest->>'agentId'; _ver text := _manifest->>'version';
        _sha text; _mid uuid; _pid uuid; _prev uuid; _note_clean text := COALESCE(btrim(_note), '');
BEGIN
  PERFORM public.assert_razul_owner();
  IF public.omni_terminal_secret_like(_note_clean) THEN RAISE EXCEPTION 'Note looks like a key or token; remove it' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.razul_agent_manifests m WHERE m.app_id = _app AND m.agent_id = _agent
             AND string_to_array(m.version, '.')::int[] >= string_to_array(_ver, '.')::int[]) THEN
    RAISE EXCEPTION 'Use a version higher than every earlier version of this agent' USING ERRCODE = '22023';
  END IF;
  _sha := encode(sha256(convert_to(_manifest::text, 'UTF8')), 'hex');
  SELECT manifest_id INTO _prev FROM public.razul_agent_releases WHERE app_id = _app AND agent_id = _agent;
  INSERT INTO public.razul_agent_manifests (app_id, agent_id, version, manifest, manifest_sha256, created_by, created_by_user)
  VALUES (_app, _agent, _ver, _manifest, _sha, 'owner', auth.uid()) RETURNING id INTO _mid;
  INSERT INTO public.razul_update_proposals (owner_id, app_id, agent_id, manifest_id, previous_manifest_id, proposed_by, escalations, changes, note)
  VALUES (auth.uid(), _app, _agent, _mid, _prev, 'owner', COALESCE(_escalations, '[]'::jsonb), COALESCE(_changes, '[]'::jsonb), _note_clean)
  RETURNING id INTO _pid;
  INSERT INTO public.razul_evaluations (proposal_id, manifest_sha256, kind, passed, runner, summary)
  VALUES (_pid, _sha, 'static', true, 'mothership-static-lint', COALESCE(_static, '{}'::jsonb));
  RETURN _pid;
END $$;

-- Owner: decide. Approval/widening/promotion also need a fresh second factor (re-checked by the guard).
CREATE OR REPLACE FUNCTION public.razul_decide_proposal(_id uuid, _action text, _stage smallint, _acknowledge boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF _action IN ('approve','stage','promote') THEN PERFORM public.assert_fresh_mfa(900); END IF;
  IF _action = 'approve' THEN
    UPDATE public.razul_update_proposals SET status = 'approved', approved_by = auth.uid(), approved_at = now(),
      escalations_acknowledged = COALESCE(_acknowledge, false) WHERE id = _id;
  ELSIF _action = 'reject' THEN
    UPDATE public.razul_update_proposals SET status = 'rejected' WHERE id = _id;
  ELSIF _action = 'withdraw' THEN
    UPDATE public.razul_update_proposals SET status = 'withdrawn' WHERE id = _id;
  ELSIF _action = 'stage' THEN
    UPDATE public.razul_update_proposals SET status = 'staged', stage = _stage, stage_healthy = NULL WHERE id = _id;
  ELSIF _action = 'promote' THEN
    UPDATE public.razul_update_proposals SET status = 'promoted' WHERE id = _id;
  ELSIF _action = 'rollback' THEN
    UPDATE public.razul_update_proposals SET status = 'rolled_back' WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'Unknown action' USING ERRCODE = '22023';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found' USING ERRCODE = '22023'; END IF;
END $$;

-- Owner-managed knowledge: add/delete per namespace, digest computed here, metadata-only audit.
CREATE OR REPLACE FUNCTION public.razul_add_knowledge(_namespace text, _title text, _body text, _source_kind text, _source_ref text, _retrieved_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid;
BEGIN
  PERFORM public.assert_razul_owner();
  IF public.omni_terminal_secret_like(_title || ' ' || _body || ' ' || _source_ref) THEN
    RAISE EXCEPTION 'Text looks like a key or token; remove it' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.razul_knowledge_docs WHERE namespace = _namespace) >= 200 THEN
    RAISE EXCEPTION 'This namespace already has 200 documents' USING ERRCODE = '22023';
  END IF;
  IF _retrieved_at IS NULL OR _retrieved_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Retrieved date cannot be in the future' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.razul_knowledge_docs (namespace, title, body, source_kind, source_ref, source_sha256, retrieved_at, created_by)
  VALUES (_namespace, btrim(_title), _body, _source_kind, btrim(_source_ref), encode(sha256(convert_to(_body, 'UTF8')), 'hex'), _retrieved_at, auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.razul_provisioning_events (actor, event, detail)
  VALUES ('owner', 'knowledge_added', jsonb_build_object('namespace', _namespace, 'doc', _id, 'source_kind', _source_kind));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.razul_delete_knowledge(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _ns text;
BEGIN
  PERFORM public.assert_razul_owner();
  DELETE FROM public.razul_knowledge_docs WHERE id = _id RETURNING namespace INTO _ns;
  IF _ns IS NULL THEN RAISE EXCEPTION 'Document not found' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.razul_provisioning_events (actor, event, detail)
  VALUES ('owner', 'knowledge_deleted', jsonb_build_object('namespace', _ns, 'doc', _id));
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.razul_propose_manifest(jsonb,jsonb,jsonb,text,jsonb)',
    'public.razul_decide_proposal(uuid,text,smallint,boolean)',
    'public.razul_add_knowledge(text,text,text,text,text,timestamptz)',
    'public.razul_delete_knowledge(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.razul_manifest_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.razul_proposal_guard() FROM PUBLIC, anon, authenticated;
