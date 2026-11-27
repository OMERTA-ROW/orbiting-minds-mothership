CREATE TABLE public.neuro_components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 pathway_key text NOT NULL CHECK (pathway_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 active_revision integer NOT NULL DEFAULT 0 CHECK (active_revision >= 0),
 integration_status text NOT NULL DEFAULT 'not_connected' CHECK (integration_status = 'not_connected'),
 autonomy_enabled boolean NOT NULL DEFAULT false CHECK (autonomy_enabled = false),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,pathway_key), UNIQUE(owner_id,id)
);
REVOKE ALL ON public.neuro_components FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.neuro_components TO authenticated;
GRANT ALL ON public.neuro_components TO service_role;
ALTER TABLE public.neuro_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY neuro_components_read ON public.neuro_components FOR SELECT TO authenticated USING (owner_id = (select auth.uid()) AND (select public.is_razul_owner()));

CREATE TABLE public.neuro_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 component_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 base_revision integer NOT NULL CHECK (base_revision >= 0),
 profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
 digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(component_id,revision),
 FOREIGN KEY(owner_id,component_id) REFERENCES public.neuro_components(owner_id,id)
);
REVOKE ALL ON public.neuro_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.neuro_revisions TO authenticated;
GRANT SELECT,INSERT ON public.neuro_revisions TO service_role;
ALTER TABLE public.neuro_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY neuro_revisions_read ON public.neuro_revisions FOR SELECT TO authenticated USING (owner_id = (select auth.uid()) AND (select public.is_razul_owner()));
CREATE INDEX neuro_revisions_owner_created ON public.neuro_revisions(owner_id,created_at DESC);

CREATE TABLE public.neuro_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 component_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision >= 0),
 previous_revision integer NOT NULL CHECK (previous_revision >= 0),
 action text NOT NULL CHECK (action IN ('registered','proposed','scope_review','approved','rollback')),
 note text NOT NULL CHECK (length(note) <= 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(owner_id,component_id) REFERENCES public.neuro_components(owner_id,id)
);
REVOKE ALL ON public.neuro_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.neuro_reviews TO authenticated;
GRANT SELECT,INSERT ON public.neuro_reviews TO service_role;
ALTER TABLE public.neuro_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY neuro_reviews_read ON public.neuro_reviews FOR SELECT TO authenticated USING (owner_id = (select auth.uid()) AND (select public.is_razul_owner()));
CREATE INDEX neuro_reviews_owner_created ON public.neuro_reviews(owner_id,created_at DESC);
CREATE INDEX neuro_reviews_component_revision ON public.neuro_reviews(component_id,revision,action);

CREATE FUNCTION public.neuro_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN RAISE EXCEPTION 'Neuro revisions and review history are immutable'; END $$;
CREATE TRIGGER neuro_revisions_immutable BEFORE UPDATE OR DELETE ON public.neuro_revisions FOR EACH ROW EXECUTE FUNCTION public.neuro_immutable();
CREATE TRIGGER neuro_reviews_immutable BEFORE UPDATE OR DELETE ON public.neuro_reviews FOR EACH ROW EXECUTE FUNCTION public.neuro_immutable();

CREATE FUNCTION public.neuro_register(p_key text,p_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cid uuid;
BEGIN
 IF public.is_razul_owner() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE='42501'; END IF;
 INSERT INTO public.neuro_components(owner_id,pathway_key,name) VALUES(auth.uid(),p_key,p_name) ON CONFLICT(owner_id,pathway_key) DO NOTHING RETURNING id INTO cid;
 IF cid IS NULL THEN SELECT id INTO cid FROM public.neuro_components WHERE owner_id=auth.uid() AND pathway_key=p_key;
 ELSE INSERT INTO public.neuro_reviews(owner_id,component_id,revision,previous_revision,action,note) VALUES(auth.uid(),cid,0,0,'registered','Owner registered a metadata pathway; no integration or permission granted.'); END IF;
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.neuro_register(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.neuro_register(text,text) TO authenticated;

CREATE FUNCTION public.neuro_register_ecosystem() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r record; n integer;
BEGIN
 IF public.is_razul_owner() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE='42501'; END IF;
 FOR r IN SELECT * FROM (VALUES ('omni','OMNI'),('code','CODE'),('jackboy','Jackboy'),('evolution','Evolution'),('razul','Razul Central Intelligence'),('guardian','Guardian'),('jax','JAX'),('hercules','Hercules'),('cyberlink','Cyberlink'),('honeycomb','Honeycomb'),('legacy','Legacy'),('x-federal','X-Federal'),('neuro','Neuro Intelligence')) AS v(key,name)
 LOOP PERFORM public.neuro_register(r.key,r.name); END LOOP;
 FOR r IN SELECT id,name FROM public.evolution_directory WHERE owner_id=auth.uid() ORDER BY id LIMIT 500
 LOOP PERFORM public.neuro_register('project-' || r.id::text,r.name); END LOOP;
 SELECT count(*) INTO n FROM public.neuro_components WHERE owner_id=auth.uid(); RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.neuro_register_ecosystem() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.neuro_register_ecosystem() TO authenticated;

CREATE FUNCTION public.neuro_change(p_action text,p_component uuid,p_expected integer,p_target integer,p_profile jsonb,p_note text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.neuro_components; r public.neuro_revisions; v integer; kv record;
BEGIN
 IF public.is_razul_owner() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified owner with two-step sign-in required' USING ERRCODE='42501'; END IF;
 IF p_expected IS NULL OR p_target IS NULL OR p_note IS NULL OR length(p_note)>2000 THEN RAISE EXCEPTION 'Invalid request'; END IF;
 SELECT * INTO c FROM public.neuro_components WHERE id=p_component AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Component not found' USING ERRCODE='42501'; END IF;
 IF c.active_revision <> p_expected THEN RAISE EXCEPTION 'Active version changed; refresh before continuing'; END IF;
 IF p_action='propose' THEN
   IF p_profile IS NULL OR jsonb_typeof(p_profile)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_profile))<>7 THEN RAISE EXCEPTION 'Seven profile fields required'; END IF;
   FOR kv IN SELECT * FROM jsonb_each(p_profile) LOOP
     IF kv.key NOT IN ('knowledge','reasoning','memory','learning','evaluations','version','evidence') OR jsonb_typeof(kv.value)<>'string' OR length(kv.value #>> '{}')>2000 THEN RAISE EXCEPTION 'Invalid profile field'; END IF;
   END LOOP;
   IF length(btrim(p_profile->>'version')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Version required (1-80 characters)'; END IF;
   SELECT coalesce(max(revision),0)+1 INTO v FROM public.neuro_revisions WHERE component_id=c.id;
   INSERT INTO public.neuro_revisions(owner_id,component_id,revision,base_revision,profile,digest) VALUES(auth.uid(),c.id,v,c.active_revision,p_profile,encode(sha256(convert_to(p_profile::text,'UTF8')),'hex'));
   INSERT INTO public.neuro_reviews(owner_id,component_id,revision,previous_revision,action,note) VALUES(auth.uid(),c.id,v,c.active_revision,'proposed',p_note);
   RETURN v;
 END IF;
 IF p_action NOT IN ('scope_review','approved','rollback') THEN RAISE EXCEPTION 'Unknown review action'; END IF;
 IF length(btrim(p_note))<10 THEN RAISE EXCEPTION 'Record scoped evidence or a rollback reason (10 characters minimum)'; END IF;
 SELECT * INTO r FROM public.neuro_revisions WHERE component_id=c.id AND owner_id=auth.uid() AND revision=p_target;
 IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found'; END IF;
 IF r.digest <> encode(sha256(convert_to(r.profile::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Integrity check failed'; END IF;
 IF p_action IN ('scope_review','approved') AND r.base_revision<>c.active_revision THEN RAISE EXCEPTION 'Proposal is stale; create a new proposal'; END IF;
 IF p_action='approved' AND NOT EXISTS(SELECT 1 FROM public.neuro_reviews WHERE component_id=c.id AND revision=r.revision AND action='scope_review') THEN RAISE EXCEPTION 'Scoped owner review required before approval'; END IF;
 IF p_action='rollback' AND (p_target=c.active_revision OR NOT EXISTS(SELECT 1 FROM public.neuro_reviews WHERE component_id=c.id AND revision=r.revision AND action IN ('approved','rollback'))) THEN RAISE EXCEPTION 'Rollback needs a different previously approved revision'; END IF;
 IF p_action IN ('approved','rollback') THEN UPDATE public.neuro_components SET active_revision=r.revision WHERE id=c.id; END IF;
 INSERT INTO public.neuro_reviews(owner_id,component_id,revision,previous_revision,action,note) VALUES(auth.uid(),c.id,r.revision,c.active_revision,p_action,p_note);
 RETURN r.revision;
END $$;
REVOKE ALL ON FUNCTION public.neuro_change(text,uuid,integer,integer,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.neuro_change(text,uuid,integer,integer,jsonb,text) TO authenticated;
COMMENT ON TABLE public.neuro_components IS 'Private metadata pathways only. No Neuro adapter, learning, memory reads, execution or grants. Autonomy is permanently off.';
COMMENT ON TABLE public.neuro_reviews IS 'Owner-authored scoped review and integrity evidence, never a claim that Razul or Guardian performed inference or authorized external work.';