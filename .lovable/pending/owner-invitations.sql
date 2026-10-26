-- PENDING / NOT APPLIED. This project's single backend serves preview AND the live site,
-- so applying this would change production schema. Apply only after owner approval
-- (or in an isolated draft backend).
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'tester');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_self_read ON public.user_roles FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL CHECK (role <> 'owner'),
  token_hash text NOT NULL UNIQUE,      -- SHA-256 only; plaintext token never stored
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invites_admin_read ON public.invitations FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'owner') OR public.has_role((SELECT auth.uid()), 'admin'));
-- Writes (create/revoke/accept) go only through row-locked SECURITY DEFINER functions
-- that re-check canGrant/expiry/single-use server-side; no direct INSERT/UPDATE grants.

-- Owner bootstrap (run once by the owner after signing up and confirming email; replace UUID):
-- INSERT INTO public.user_roles (user_id, role) VALUES ('<owner-auth-user-uuid>', 'owner');
