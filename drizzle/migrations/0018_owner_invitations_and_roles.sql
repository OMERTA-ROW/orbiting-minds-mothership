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
  token_hash text NOT NULL UNIQUE,
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

CREATE TABLE public.owner_config (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), owner_email text NOT NULL);
GRANT ALL ON public.owner_config TO service_role;
ALTER TABLE public.owner_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.caller_role() RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid() ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.claim_owner() RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u auth.users%ROWTYPE; cfg text;
BEGIN
  SELECT owner_email INTO cfg FROM public.owner_config WHERE id = 1 FOR UPDATE;
  IF cfg IS NULL THEN RAISE EXCEPTION 'Owner email not configured'; END IF;
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF u.id IS NULL OR u.email_confirmed_at IS NULL OR lower(u.email) <> lower(cfg) THEN RAISE EXCEPTION 'Not the configured, confirmed owner'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN RAISE EXCEPTION 'Owner already assigned'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (u.id, 'owner'); RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.create_invitation(_email text, _role public.app_role, _expires_at timestamptz, _token_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.app_role := public.caller_role(); nid uuid;
BEGIN
  IF _role = 'owner' THEN RAISE EXCEPTION 'Invitations cannot grant owner'; END IF;
  IF r IS NULL OR r = 'tester' OR (r = 'admin' AND _role <> 'tester') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _expires_at <= now() OR _expires_at > now() + interval '14 days' THEN RAISE EXCEPTION 'Invalid expiry'; END IF;
  INSERT INTO public.invitations (email, role, token_hash, created_by, expires_at) VALUES (lower(_email), _role, _token_hash, auth.uid(), _expires_at) RETURNING id INTO nid;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.app_role := public.caller_role(); i public.invitations%ROWTYPE;
BEGIN
  SELECT * INTO i FROM public.invitations WHERE id = _id FOR UPDATE;
  IF i.id IS NULL OR r IS NULL OR r = 'tester' OR (r = 'admin' AND i.role <> 'tester') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.invitations SET revoked_at = now() WHERE id = _id AND accepted_at IS NULL AND revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.accept_invitation(_token_hash text) RETURNS public.app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.invitations%ROWTYPE; u auth.users%ROWTYPE;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id = auth.uid();
  IF u.id IS NULL OR u.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirm your email first'; END IF;
  SELECT * INTO i FROM public.invitations WHERE token_hash = _token_hash FOR UPDATE;
  IF i.id IS NULL OR i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL OR i.expires_at <= now() THEN RAISE EXCEPTION 'Invitation is not valid'; END IF;
  IF lower(u.email) <> i.email THEN RAISE EXCEPTION 'This invitation belongs to a different account'; END IF;
  IF i.role = 'owner' THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.invitations SET accepted_at = now(), accepted_by = u.id WHERE id = i.id;
  INSERT INTO public.user_roles (user_id, role, granted_by) VALUES (u.id, i.role, i.created_by) ON CONFLICT DO NOTHING;
  RETURN i.role;
END $$;

CREATE OR REPLACE FUNCTION public.remove_member(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.app_role := public.caller_role();
BEGIN
  IF _user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'owner') THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF r = 'owner' THEN DELETE FROM public.user_roles WHERE user_id = _user_id;
  ELSIF r = 'admin' AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'tester') THEN DELETE FROM public.user_roles WHERE user_id = _user_id;
  ELSE RAISE EXCEPTION 'Not allowed'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.list_members() RETURNS TABLE(user_id uuid, email text, role public.app_role) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.caller_role() NOT IN ('owner','admin') OR public.caller_role() IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT r.user_id, u.email::text, r.role FROM public.user_roles r JOIN auth.users u ON u.id = r.user_id;
END $$;
CREATE OR REPLACE FUNCTION public.list_invitations() RETURNS SETOF public.invitations LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.caller_role() NOT IN ('owner','admin') OR public.caller_role() IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT * FROM public.invitations ORDER BY created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.claim_owner, public.create_invitation, public.revoke_invitation, public.accept_invitation, public.remove_member, public.list_members, public.list_invitations FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_owner, public.create_invitation, public.revoke_invitation, public.accept_invitation, public.remove_member, public.list_members, public.list_invitations TO authenticated;