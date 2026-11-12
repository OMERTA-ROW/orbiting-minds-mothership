-- Honeycomb mobile companion: new per-device permissions. Additive; existing values stay valid.
-- cloud.read  = metadata-only cloud/CODE task snapshot; audit.read = metadata-only audit tail;
-- jobs.pause  = pause an agent / stop a job or agent (reductions only);
-- chat.send   = reserved, no endpoint yet.
ALTER TABLE public.omni_dock_invites DROP CONSTRAINT IF EXISTS omni_dock_invites_requested_permissions_check;
ALTER TABLE public.omni_dock_invites ADD CONSTRAINT omni_dock_invites_requested_permissions_check
  CHECK (requested_permissions <@ ARRAY['status.read', 'log.read', 'jobs.propose', 'stop.engage', 'files.transfer',
    'cloud.read', 'audit.read', 'jobs.pause', 'chat.send']::text[]);
ALTER TABLE public.omni_dock_devices DROP CONSTRAINT IF EXISTS omni_dock_devices_permissions_check;
ALTER TABLE public.omni_dock_devices ADD CONSTRAINT omni_dock_devices_permissions_check
  CHECK (permissions <@ ARRAY['status.read', 'log.read', 'jobs.propose', 'stop.engage', 'files.transfer',
    'cloud.read', 'audit.read', 'jobs.pause', 'chat.send']::text[]);

CREATE OR REPLACE FUNCTION public.omni_dock_valid_permissions(_p text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT _p IS NOT NULL
    AND cardinality(_p) <= 9
    AND _p <@ ARRAY['status.read', 'log.read', 'jobs.propose', 'stop.engage', 'files.transfer',
      'cloud.read', 'audit.read', 'jobs.pause', 'chat.send']::text[]
    AND NOT EXISTS (SELECT 1 FROM unnest(_p) v WHERE v IS NULL)
$$;
REVOKE ALL ON FUNCTION public.omni_dock_valid_permissions(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_dock_valid_permissions(text[]) TO authenticated, service_role;