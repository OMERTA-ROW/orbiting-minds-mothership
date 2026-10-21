CREATE TABLE public.beta_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
 brief text NOT NULL DEFAULT '' CHECK (length(brief) <= 2000),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (id, owner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_projects TO authenticated;
GRANT ALL ON public.beta_projects TO service_role;
ALTER TABLE public.beta_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_owner ON public.beta_projects FOR ALL TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE INDEX beta_projects_owner_idx ON public.beta_projects(owner_id);

CREATE TABLE public.beta_agent_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid(),
 project_id uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
 provider text NOT NULL CHECK (length(btrim(provider)) BETWEEN 2 AND 100),
 model text NOT NULL CHECK (length(btrim(model)) BETWEEN 2 AND 100),
 scope text NOT NULL DEFAULT 'Draft planning only' CHECK (length(scope) <= 500),
 operator_consent boolean NOT NULL CHECK (operator_consent = true),
 status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (project_id, owner_id) REFERENCES public.beta_projects(id, owner_id) ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_agent_profiles TO authenticated;
GRANT ALL ON public.beta_agent_profiles TO service_role;
ALTER TABLE public.beta_agent_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY agents_owner ON public.beta_agent_profiles FOR ALL TO authenticated USING ((SELECT auth.uid()) = owner_id) WITH CHECK ((SELECT auth.uid()) = owner_id);
CREATE INDEX beta_agents_owner_idx ON public.beta_agent_profiles(owner_id);

CREATE TABLE public.beta_access (
 user_id uuid PRIMARY KEY,
 ai_approved boolean NOT NULL DEFAULT false,
 paused boolean NOT NULL DEFAULT false,
 approved_at timestamptz
);
GRANT SELECT ON public.beta_access TO authenticated;
GRANT UPDATE (paused) ON public.beta_access TO authenticated;
GRANT ALL ON public.beta_access TO service_role;
ALTER TABLE public.beta_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY access_owner_read ON public.beta_access FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY access_owner_pause ON public.beta_access FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE FUNCTION public.initialize_beta_access() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.beta_access(user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.initialize_beta_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER beta_access_on_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.initialize_beta_access();

CREATE TABLE public.beta_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL,
 capability text NOT NULL,
 record_id uuid NOT NULL,
 action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.beta_audit TO authenticated;
GRANT ALL ON public.beta_audit TO service_role;
ALTER TABLE public.beta_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_owner_read ON public.beta_audit FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE INDEX beta_audit_owner_idx ON public.beta_audit(owner_id, occurred_at DESC);
CREATE FUNCTION public.record_beta_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid; record uuid;
BEGIN
 IF TG_OP = 'DELETE' THEN actor := OLD.owner_id; record := OLD.id;
 ELSE actor := NEW.owner_id; record := NEW.id;
 END IF;
 INSERT INTO public.beta_audit(owner_id, capability, record_id, action) VALUES (actor, TG_TABLE_NAME, record, TG_OP);
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_beta_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER beta_projects_audit AFTER INSERT OR UPDATE OR DELETE ON public.beta_projects FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE TRIGGER beta_agents_audit AFTER INSERT OR UPDATE OR DELETE ON public.beta_agent_profiles FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
COMMENT ON TABLE public.beta_agent_profiles IS 'Owner declarations only; no verified external enrollment or API authority.';
COMMENT ON TABLE public.beta_audit IS 'Database-generated CRUD metadata. Not signed, independent or executed-artifact evidence.';
COMMENT ON TABLE public.beta_access IS 'Server-managed AI beta approval, default deny; users may only update their own pause flag.';