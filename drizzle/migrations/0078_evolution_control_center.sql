CREATE TABLE public.evolution_cloud_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  provider text NOT NULL CHECK (provider IN ('railway','vultr')),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'not_checked' CHECK (status IN ('not_checked','verified','failed','missing_credential')),
  checked_at timestamptz,
  detail text CHECK (detail IS NULL OR length(detail) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider, label)
);
CREATE TABLE public.evolution_github_repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  github_repo_id bigint NOT NULL,
  full_name text NOT NULL,
  owner_login text NOT NULL,
  private boolean NOT NULL,
  archived boolean NOT NULL DEFAULT false,
  default_branch text,
  html_url text NOT NULL,
  pushed_at timestamptz,
  size_kb integer,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, github_repo_id)
);
CREATE TABLE public.evolution_github_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('running','succeeded','failed')),
  pages integer NOT NULL DEFAULT 0,
  repos_seen integer NOT NULL DEFAULT 0,
  sources text[] NOT NULL DEFAULT '{}',
  error text CHECK (error IS NULL OR length(error) <= 500),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE TABLE public.evolution_directory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  lovable_project_id text CHECK (lovable_project_id IS NULL OR lovable_project_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  website_url text CHECK (website_url IS NULL OR (length(website_url) <= 300 AND website_url ~ '^https://[A-Za-z0-9.-]+(/[^[:space:]]*)?$')),
  website_status integer,
  website_checked_at timestamptz,
  github_repo_id bigint,
  cloud_connection_id uuid REFERENCES public.evolution_cloud_connections(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, lovable_project_id)
);
CREATE TABLE public.evolution_settings (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  clone_all_opt_in boolean NOT NULL DEFAULT false,
  github_orgs text[] NOT NULL DEFAULT ARRAY['OMERTA-ROW'] CHECK (cardinality(github_orgs) <= 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.evolution_cloud_connections, public.evolution_github_repos, public.evolution_github_sync_runs, public.evolution_directory, public.evolution_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.evolution_cloud_connections TO authenticated;
GRANT UPDATE (label) ON public.evolution_cloud_connections TO authenticated;
GRANT SELECT ON public.evolution_github_repos, public.evolution_github_sync_runs TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.evolution_directory TO authenticated;
GRANT UPDATE (name, lovable_project_id, website_url, github_repo_id, cloud_connection_id, notes) ON public.evolution_directory TO authenticated;
GRANT SELECT, INSERT ON public.evolution_settings TO authenticated;
GRANT UPDATE (clone_all_opt_in, github_orgs) ON public.evolution_settings TO authenticated;
GRANT ALL ON public.evolution_cloud_connections, public.evolution_github_repos, public.evolution_github_sync_runs, public.evolution_directory, public.evolution_settings TO service_role;

ALTER TABLE public.evolution_cloud_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_github_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_github_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY evo_cloud_owner ON public.evolution_cloud_connections FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.is_razul_owner()) WITH CHECK (owner_id = auth.uid() AND public.is_razul_owner() AND status = 'not_checked' AND checked_at IS NULL);
CREATE POLICY evo_repos_owner_read ON public.evolution_github_repos FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());
CREATE POLICY evo_runs_owner_read ON public.evolution_github_sync_runs FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_razul_owner());
CREATE POLICY evo_dir_owner ON public.evolution_directory FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.is_razul_owner()) WITH CHECK (owner_id = auth.uid() AND public.is_razul_owner());
CREATE POLICY evo_settings_owner ON public.evolution_settings FOR ALL TO authenticated
  USING (owner_id = auth.uid() AND public.is_razul_owner()) WITH CHECK (owner_id = auth.uid() AND public.is_razul_owner());

-- Changing a website or credential label invalidates earlier check results.
CREATE OR REPLACE FUNCTION public.evolution_directory_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' OR NEW.website_url IS DISTINCT FROM OLD.website_url THEN
    IF current_user <> 'service_role' THEN NEW.website_status := NULL; NEW.website_checked_at := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evolution_directory_touch BEFORE INSERT OR UPDATE ON public.evolution_directory FOR EACH ROW EXECUTE FUNCTION public.evolution_directory_touch();
CREATE OR REPLACE FUNCTION public.evolution_cloud_label_reset() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user <> 'service_role' THEN NEW.status := 'not_checked'; NEW.checked_at := NULL; NEW.detail := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER evolution_cloud_label_reset BEFORE UPDATE ON public.evolution_cloud_connections FOR EACH ROW EXECUTE FUNCTION public.evolution_cloud_label_reset();

CREATE TRIGGER evolution_directory_audit AFTER INSERT OR UPDATE OR DELETE ON public.evolution_directory FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE TRIGGER evolution_cloud_audit AFTER INSERT OR UPDATE OR DELETE ON public.evolution_cloud_connections FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE TRIGGER evolution_runs_audit AFTER INSERT ON public.evolution_github_sync_runs FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();
CREATE TRIGGER evolution_settings_audit AFTER INSERT OR UPDATE ON public.evolution_settings FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();

INSERT INTO public.evolution_directory (owner_id, name, lovable_project_id)
SELECT r.user_id, v.name, v.pid FROM public.user_roles r CROSS JOIN (VALUES
 ('Jackboy Dev Control','72823346-c174-4e90-9e17-671e197837c5'),
 ('Orbiting Minds Mothership','f02f1b04-6f4d-4d33-bd52-d2d44971db21'),
 ('OMNI','8325455a-c043-4a06-9a74-470a2511f91f'),
 ('Itanimulli Legacy','bc815e5c-10a5-405a-9e24-733180ad008f'),
 ('Honeycomb Password Pilot','146032e5-2354-47c9-84a9-bfa3c379c21b'),
 ('Honeycomb Terminal Companion','f5dd4092-07a4-4e53-bf40-35c167b9eaac'),
 ('Georgia Justice Project','081d207d-094c-46f3-8eaa-44eda0875cb7'),
 ('Stream Sync Hub','9b5f69fc-83bc-4436-be28-558bc9568bd9'),
 ('Razul Centrial Intelligence','733f4559-7c74-4a46-8bea-3cbbde871040'),
 ('X-Federal Private Finance','151730e9-518d-48b2-aa7b-f50c30bf7c6c'),
 ('Jax Data Concierge','f0979d97-3fc8-4497-88c1-400a5c9b5139'),
 ('Vera Health AI','a95c7ca1-d551-4e6a-8158-b437cf39ba8c'),
 ('NumberShield Privacy Protection','c24c59a6-b268-40a1-aa39-4813327e83be'),
 ('Voice Vault Brain Guild','48d47264-d899-4f6b-98d8-761e85f95dfe'),
 ('NanoDrift Platform','c099f433-f3fa-4b9b-920c-a9db26739394'),
 ('Itanimulli Inc. Community Hub','a517cf4e-c8cf-408b-a515-b81d5ec755e2'),
 ('CyberLink Social','f6447429-4027-45e0-bfb6-e09c4b149510'),
 ('Hercules Driver''s Command','59def010-ac63-461f-85a8-6757ef85ef3e'),
 ('Jail Release Assist','4617022d-94b5-4eb9-9120-3aafc9f792ac')
) AS v(name, pid) WHERE r.role::text = 'owner'
ON CONFLICT (owner_id, lovable_project_id) DO NOTHING;