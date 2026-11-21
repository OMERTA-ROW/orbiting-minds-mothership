-- Owner choice "save all" for Dread and Draco: a second per-agent switch (off until the owner turns it on)
-- saves each completed delegated chat exchange into that agent's own memory, once per reply. The owner reviews
-- and deletes these with the existing owner/aal2 functions. Audit rows stay metadata only.
ALTER TABLE public.omni_agent_memories DROP CONSTRAINT omni_agent_memories_source_kind_check;
ALTER TABLE public.omni_agent_memories ADD CONSTRAINT omni_agent_memories_source_kind_check
  CHECK (source_kind IN ('owner_typed', 'terminal_session', 'held_task', 'document', 'web_page', 'omni_chat'));
ALTER TABLE public.omni_agent_memory_audit DROP CONSTRAINT omni_agent_memory_audit_event_check;
ALTER TABLE public.omni_agent_memory_audit ADD CONSTRAINT omni_agent_memory_audit_event_check
  CHECK (event IN ('saved', 'deleted', 'retrieved', 'deleted_all', 'chat_use_on', 'chat_use_off', 'used_in_chat',
                   'save_chats_on', 'save_chats_off', 'saved_from_chat'));

ALTER TABLE public.omni_agent_memory_settings ADD COLUMN save_chats boolean NOT NULL DEFAULT false;
ALTER TABLE public.omni_delegated_chat_runs ADD COLUMN saved_memory_id uuid;

CREATE OR REPLACE FUNCTION public.omni_memory_set_save_chats(_agent text, _on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  PERFORM public.assert_razul_owner();
  IF COALESCE(_agent, '') NOT IN ('dread', 'draco') OR _on IS NULL THEN
    RAISE EXCEPTION 'Only Dread and Draco can save chats to memory' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.omni_agent_memory_settings (owner_id, agent_id, save_chats, updated_at)
  VALUES (auth.uid(), _agent, _on, now())
  ON CONFLICT (owner_id, agent_id) DO UPDATE SET save_chats = EXCLUDED.save_chats, updated_at = now();
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, event, item_count)
  VALUES (auth.uid(), _agent, CASE WHEN _on THEN 'save_chats_on' ELSE 'save_chats_off' END, 0);
  RETURN _on;
END $$;

-- Service-only. Called once after a reply's outcome is recorded as completed.
CREATE OR REPLACE FUNCTION public.omni_delegation_chat_save(
  _run_id uuid, _agent text, _title text, _body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  _r public.omni_delegated_chat_runs;
  _on boolean;
  _id uuid;
  _title_clean text := COALESCE(btrim(_title), '');
  _body_clean text := COALESCE(btrim(_body), '');
BEGIN
  SELECT * INTO _r FROM public.omni_delegated_chat_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_found');
  END IF;
  IF _r.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'run_not_completed');
  END IF;
  IF COALESCE(_agent, '') NOT IN ('dread', 'draco') OR _r.memory_agent_id IS DISTINCT FROM _agent THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'agent_mismatch');
  END IF;
  IF _r.saved_memory_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_saved');
  END IF;
  SELECT s.save_chats INTO _on FROM public.omni_agent_memory_settings s
  WHERE s.owner_id = _r.owner_id AND s.agent_id = _agent FOR SHARE;
  IF NOT COALESCE(_on, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'save_chats_off');
  END IF;
  IF length(_title_clean) NOT BETWEEN 1 AND 120 OR length(_body_clean) NOT BETWEEN 1 AND 8000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  IF public.omni_terminal_secret_like(_title_clean) OR public.omni_terminal_secret_like(_body_clean) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'secret_like');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('omni_agent_memory:' || _r.owner_id::text || ':' || _agent));
  IF (SELECT count(*) FROM public.omni_agent_memories m WHERE m.owner_id = _r.owner_id AND m.agent_id = _agent) >= 500 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'memory_full');
  END IF;
  INSERT INTO public.omni_agent_memories (owner_id, agent_id, kind, title, body, source_kind, source_ref, body_sha256)
  VALUES (_r.owner_id, _agent, 'note', _title_clean, _body_clean, 'omni_chat', 'OMNI web chat ' || _run_id::text,
          encode(sha256(convert_to(_body_clean, 'UTF8')), 'hex'))
  RETURNING id INTO _id;
  UPDATE public.omni_delegated_chat_runs SET saved_memory_id = _id WHERE id = _run_id;
  INSERT INTO public.omni_agent_memory_audit (actor_id, agent_id, memory_id, event, item_count)
  VALUES (_r.owner_id, _agent, _id, 'saved_from_chat', 1);
  RETURN jsonb_build_object('ok', true, 'memory_id', _id);
END $$;

REVOKE ALL ON FUNCTION public.omni_memory_set_save_chats(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.omni_memory_set_save_chats(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.omni_delegation_chat_save(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_delegation_chat_save(uuid, text, text, text) TO service_role;