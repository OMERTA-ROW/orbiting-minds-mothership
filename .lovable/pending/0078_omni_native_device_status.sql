-- Native credential reconciliation, pending owner approval. Replay nonces survive key rotation.
CREATE TABLE public.omni_native_status_nonces (
  device_id uuid NOT NULL REFERENCES public.omni_dock_devices(id) ON DELETE CASCADE,
  nonce text NOT NULL CHECK (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, nonce)
);
CREATE INDEX omni_native_status_nonces_seen_idx ON public.omni_native_status_nonces (seen_at);
REVOKE ALL ON public.omni_native_status_nonces FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.omni_native_status_nonces TO service_role;
ALTER TABLE public.omni_native_status_nonces ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.omni_native_device_status(_device uuid, _fingerprint text, _nonce text, _timestamp_ms bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _d public.omni_dock_devices;
BEGIN
  IF _device IS NULL OR _fingerprint IS NULL OR _fingerprint !~ '^[0-9a-f]{64}$'
     OR _nonce IS NULL OR _nonce !~ '^[A-Za-z0-9_-]{16,64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO _d FROM public.omni_dock_devices WHERE id = _device FOR UPDATE;
  IF NOT FOUND OR _d.status IS DISTINCT FROM 'paired'
     OR _d.native_client_id IS DISTINCT FROM 'omni-native-cli'
     OR NOT public.omni_native_owner_ok(_d.owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_permitted');
  END IF;
  IF _timestamp_ms IS NULL OR abs(extract(epoch FROM clock_timestamp()) * 1000 - _timestamp_ms) > 60000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_request');
  END IF;
  IF _d.key_fingerprint IS DISTINCT FROM _fingerprint THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'device_changed');
  END IF;
  DELETE FROM public.omni_native_status_nonces WHERE seen_at < now() - interval '15 minutes';
  BEGIN
    INSERT INTO public.omni_native_status_nonces (device_id, nonce) VALUES (_device, _nonce);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'replay');
  END;
  INSERT INTO public.omni_dock_events (device_id, event, outcome)
    VALUES (_device, 'native_device_status', 'ok');
  RETURN jsonb_build_object(
    'ok', true, 'device_id', _d.id, 'revision', _d.revision,
    'key_fingerprint', _d.key_fingerprint, 'permissions', to_jsonb(_d.permissions),
    'checked_at', clock_timestamp()
  );
END $$;
REVOKE ALL ON FUNCTION public.omni_native_device_status(uuid,text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.omni_native_device_status(uuid,text,text,bigint) TO service_role;
