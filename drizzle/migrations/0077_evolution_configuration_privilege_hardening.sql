REVOKE ALL ON TABLE public.evolution_project_configs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.evolution_project_configs TO authenticated;
GRANT ALL ON TABLE public.evolution_project_configs TO service_role;
REVOKE ALL ON FUNCTION public.evolution_project_create(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.evolution_config_save(uuid,integer,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evolution_project_create(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evolution_config_save(uuid,integer,text,text,text,text) TO authenticated;