-- Cloud shell: record which model provider and GitHub repository/branch a workspace session uses,
-- and let a draft pull request be an owner-approved (passkey) action. Additive: every existing value stays valid.
ALTER TABLE public.omni_workspace_sessions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'none' CHECK (provider IN ('none', 'openai', 'anthropic')),
  ADD COLUMN IF NOT EXISTS repository text CHECK (repository IS NULL OR (length(repository) <= 200 AND repository ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')),
  ADD COLUMN IF NOT EXISTS repo_ref text CHECK (repo_ref IS NULL OR (length(repo_ref) <= 100 AND repo_ref ~ '^[A-Za-z0-9._/-]+$'));
ALTER TABLE public.omni_workspace_approvals DROP CONSTRAINT IF EXISTS omni_workspace_approvals_action_kind_check;
ALTER TABLE public.omni_workspace_approvals ADD CONSTRAINT omni_workspace_approvals_action_kind_check
  CHECK (action_kind IN ('merge', 'deploy', 'publish', 'secrets', 'github_permissions', 'network', 'pull_request'));