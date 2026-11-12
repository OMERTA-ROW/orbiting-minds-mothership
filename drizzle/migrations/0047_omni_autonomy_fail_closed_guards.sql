-- Autonomous Mode windows: database-level fail-closed guards. Additive; no rows are changed except
-- ending open windows when a stop condition happens.

-- 1. A window can only be opened for 15, 30 or 60 minutes, never for Jackboy (its CODE gatekeeper
--    keeps its own controls), only while Emergency Stop is released, the terminal kill switch is on
--    and the agent is enrolled.
CREATE OR REPLACE FUNCTION public.omni_autonomy_window_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _stop boolean;
  _enabled boolean;
  _status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.ended_at IS NOT NULL AND NEW.ended_at IS NULL THEN
      RAISE EXCEPTION 'An ended autonomy window cannot be reopened.';
    END IF;
    IF NEW.expires_at > OLD.expires_at OR NEW.started_at <> OLD.started_at
       OR NEW.agent_id <> OLD.agent_id OR NEW.owner_id <> OLD.owner_id THEN
      RAISE EXCEPTION 'An autonomy window cannot be extended or reassigned.';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.agent_id = 'jackboy' THEN
    RAISE EXCEPTION 'Jackboy CODE keeps its own controls; Mothership never grants it autonomy.';
  END IF;
  IF NEW.ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'A new autonomy window must start open.';
  END IF;
  IF (NEW.expires_at - NEW.started_at) NOT IN (interval '15 minutes', interval '30 minutes', interval '60 minutes') THEN
    RAISE EXCEPTION 'Autonomy windows are 15, 30 or 60 minutes.';
  END IF;
  SELECT emergency_stop INTO _stop FROM public.omni_terminal_controls WHERE id = 1;
  IF _stop IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Emergency Stop is engaged or unreadable.';
  END IF;
  SELECT terminal_enabled INTO _enabled FROM public.omni_workspace_settings WHERE id = 1;
  IF _enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The terminal kill switch is off.';
  END IF;
  SELECT status INTO _status FROM public.omni_agents WHERE id = NEW.agent_id;
  IF _status IS DISTINCT FROM 'enrolled' THEN
    RAISE EXCEPTION 'This agent is not enrolled.';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_autonomy_window_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS omni_autonomy_window_guard ON public.omni_autonomy_windows;
CREATE TRIGGER omni_autonomy_window_guard
  BEFORE INSERT OR UPDATE ON public.omni_autonomy_windows
  FOR EACH ROW EXECUTE FUNCTION public.omni_autonomy_window_guard();

-- 2. Stop conditions end every open window immediately, whichever path changed them.
CREATE OR REPLACE FUNCTION public.omni_autonomy_end_all(_reason text, _agent text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.omni_autonomy_windows
     SET ended_at = now(), end_reason = _reason
   WHERE ended_at IS NULL AND (_agent IS NULL OR agent_id = _agent);
$$;
REVOKE ALL ON FUNCTION public.omni_autonomy_end_all(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.omni_autonomy_on_emergency_stop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.omni_autonomy_end_all('emergency_stop', NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_autonomy_on_emergency_stop() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS omni_autonomy_on_emergency_stop ON public.omni_terminal_controls;
CREATE TRIGGER omni_autonomy_on_emergency_stop
  AFTER INSERT OR UPDATE OF emergency_stop ON public.omni_terminal_controls
  FOR EACH ROW WHEN (NEW.emergency_stop IS DISTINCT FROM false)
  EXECUTE FUNCTION public.omni_autonomy_on_emergency_stop();

CREATE OR REPLACE FUNCTION public.omni_autonomy_on_kill_switch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.omni_autonomy_end_all('kill_switch', NULL);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_autonomy_on_kill_switch() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS omni_autonomy_on_kill_switch ON public.omni_workspace_settings;
CREATE TRIGGER omni_autonomy_on_kill_switch
  AFTER INSERT OR UPDATE OF terminal_enabled ON public.omni_workspace_settings
  FOR EACH ROW WHEN (NEW.terminal_enabled IS DISTINCT FROM true)
  EXECUTE FUNCTION public.omni_autonomy_on_kill_switch();

CREATE OR REPLACE FUNCTION public.omni_autonomy_on_agent_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.omni_autonomy_end_all('agent_paused', NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.omni_autonomy_on_agent_pause() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS omni_autonomy_on_agent_pause ON public.omni_agents;
CREATE TRIGGER omni_autonomy_on_agent_pause
  AFTER UPDATE OF status ON public.omni_agents
  FOR EACH ROW WHEN (NEW.status IS DISTINCT FROM 'enrolled')
  EXECUTE FUNCTION public.omni_autonomy_on_agent_pause();