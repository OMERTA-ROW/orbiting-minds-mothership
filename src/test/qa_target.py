"""Require explicit target confirmation before administrative preview QA mutations."""
import os


def require_qa_target():
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    approved = os.environ.get("EVOLUTION_QA_APPROVED_BACKEND_URL", "").rstrip("/")
    server_project = os.environ.get("SUPABASE_PROJECT_ID")
    browser_project = os.environ.get("VITE_SUPABASE_PROJECT_ID")
    if not base or approved != base or not server_project or server_project != browser_project:
        raise RuntimeError("Administrative QA requires an explicitly approved backend matching this preview project.")
    return base