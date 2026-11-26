CREATE OR REPLACE FUNCTION public.evolution_project_create(_name text, _brief text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _id uuid;
BEGIN
 IF NOT COALESCE(public.is_razul_owner(),false) THEN RAISE EXCEPTION 'Verified owner with two-step sign-in required'; END IF;
 IF _name IS NULL OR length(btrim(_name)) NOT BETWEEN 2 AND 100 OR _brief IS NULL OR length(_brief)>2000 THEN RAISE EXCEPTION 'Invalid project'; END IF;
 INSERT INTO public.beta_projects(owner_id,name,brief) VALUES(auth.uid(),btrim(_name),_brief) RETURNING id INTO _id;
 RETURN _id;
END $$;
CREATE OR REPLACE FUNCTION public.evolution_config_save(_project uuid, _expected_revision integer, _source text, _branch text, _command text, _output text)
RETURNS public.evolution_project_configs LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _rev integer; _row public.evolution_project_configs;
BEGIN
 IF NOT COALESCE(public.is_razul_owner(),false) THEN RAISE EXCEPTION 'Verified owner with two-step sign-in required'; END IF;
 PERFORM 1 FROM public.beta_projects WHERE id=_project AND owner_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
 IF _expected_revision IS NULL OR _expected_revision < 0 OR _source IS NULL OR length(_source)>500 OR (_source<>'' AND (_source !~ '^https://[A-Za-z0-9.-]+/[A-Za-z0-9._/-]+$' OR _source ~ '[?#@]')) OR _branch IS NULL OR _branch !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$' OR _branch ~ '\.\.|//|/\.|\.$|/$' OR _command IS NULL OR length(_command)>500 OR _output IS NULL OR _output !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$' OR _output ~ '\.\.|//|/\.|\.$|/$' THEN RAISE EXCEPTION 'Invalid non-sensitive configuration'; END IF;
 IF (_source || ' ' || _command) ~* '(password|api[_ -]?key|secret|token)[[:space:]]*[:=]|sk-[a-z0-9_-]{12,}|BEGIN .*PRIVATE KEY' THEN RAISE EXCEPTION 'Credentials are not allowed in project configuration'; END IF;
 SELECT coalesce(max(revision),0) INTO _rev FROM public.evolution_project_configs WHERE project_id=_project;
 IF _rev<>_expected_revision THEN RAISE EXCEPTION 'Configuration changed; reload before saving'; END IF;
 INSERT INTO public.evolution_project_configs(project_id,owner_id,revision,source_url,branch,build_command,output_directory) VALUES(_project,auth.uid(),_rev+1,_source,_branch,_command,_output) RETURNING * INTO _row;
 RETURN _row;
END $$;
CREATE TRIGGER evolution_configs_audit AFTER INSERT ON public.evolution_project_configs FOR EACH ROW EXECUTE FUNCTION public.record_beta_change();