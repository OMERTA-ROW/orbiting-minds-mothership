export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activation_activations: {
        Row: {
          activated_at: string | null
          actor_id: string | null
          attempt_id: string | null
          evidence: Json
          kind: string
          reason: string
          started_at: string | null
          status: string
          step_revision: number | null
          step7_revision: number | null
          updated_at: string
          window_ends_at: string | null
        }
        Insert: {
          activated_at?: string | null
          actor_id?: string | null
          attempt_id?: string | null
          evidence?: Json
          kind: string
          reason?: string
          started_at?: string | null
          status?: string
          step_revision?: number | null
          step7_revision?: number | null
          updated_at?: string
          window_ends_at?: string | null
        }
        Update: {
          activated_at?: string | null
          actor_id?: string | null
          attempt_id?: string | null
          evidence?: Json
          kind?: string
          reason?: string
          started_at?: string | null
          status?: string
          step_revision?: number | null
          step7_revision?: number | null
          updated_at?: string
          window_ends_at?: string | null
        }
        Relationships: []
      }
      activation_approval_checks: {
        Row: {
          checked_at: string
          deployment_mode: string | null
          details: Json
          evidence_version: number
          status: string
          step: number
          summary: string
        }
        Insert: {
          checked_at?: string
          deployment_mode?: string | null
          details?: Json
          evidence_version: number
          status: string
          step: number
          summary: string
        }
        Update: {
          checked_at?: string
          deployment_mode?: string | null
          details?: Json
          evidence_version?: number
          status?: string
          step?: number
          summary?: string
        }
        Relationships: []
      }
      activation_approvals: {
        Row: {
          approval_expires_at: string | null
          approver_id: string | null
          decided_at: string | null
          note: string
          revision: number
          spend_confirmations: Json | null
          status: string
          step: number
        }
        Insert: {
          approval_expires_at?: string | null
          approver_id?: string | null
          decided_at?: string | null
          note?: string
          revision?: number
          spend_confirmations?: Json | null
          status?: string
          step: number
        }
        Update: {
          approval_expires_at?: string | null
          approver_id?: string | null
          decided_at?: string | null
          note?: string
          revision?: number
          spend_confirmations?: Json | null
          status?: string
          step?: number
        }
        Relationships: []
      }
      ai_gateway_state: {
        Row: {
          blocked_at: string
          blocked_status: number
          feature: string
          message: string
        }
        Insert: {
          blocked_at?: string
          blocked_status: number
          feature: string
          message: string
        }
        Update: {
          blocked_at?: string
          blocked_status?: number
          feature?: string
          message?: string
        }
        Relationships: []
      }
      beta_access: {
        Row: {
          ai_approved: boolean
          approved_at: string | null
          paused: boolean
          studio_approved: boolean
          user_id: string
        }
        Insert: {
          ai_approved?: boolean
          approved_at?: string | null
          paused?: boolean
          studio_approved?: boolean
          user_id: string
        }
        Update: {
          ai_approved?: boolean
          approved_at?: string | null
          paused?: boolean
          studio_approved?: boolean
          user_id?: string
        }
        Relationships: []
      }
      beta_agent_profiles: {
        Row: {
          created_at: string
          id: string
          model: string
          name: string
          operator_consent: boolean
          owner_id: string
          project_id: string
          provider: string
          scope: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          model: string
          name: string
          operator_consent: boolean
          owner_id?: string
          project_id: string
          provider: string
          scope?: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          model?: string
          name?: string
          operator_consent?: boolean
          owner_id?: string
          project_id?: string
          provider?: string
          scope?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_agent_profiles_project_id_owner_id_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "beta_projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      beta_audit: {
        Row: {
          action: string
          capability: string
          id: string
          occurred_at: string
          owner_id: string
          record_id: string
        }
        Insert: {
          action: string
          capability: string
          id?: string
          occurred_at?: string
          owner_id: string
          record_id: string
        }
        Update: {
          action?: string
          capability?: string
          id?: string
          occurred_at?: string
          owner_id?: string
          record_id?: string
        }
        Relationships: []
      }
      beta_projects: {
        Row: {
          brief: string
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          brief?: string
          created_at?: string
          id?: string
          name: string
          owner_id?: string
        }
        Update: {
          brief?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      forge_creator_versions: {
        Row: {
          asset_id: string | null
          canon_id: string | null
          content: Json
          created_at: string
          id: string
          kind: string
          owner_id: string
          prepared_at: string | null
          project_id: string
          reviewed_at: string | null
          revision: number
          sha256: string
          state: string
        }
        Insert: {
          asset_id?: string | null
          canon_id?: string | null
          content: Json
          created_at?: string
          id?: string
          kind: string
          owner_id: string
          prepared_at?: string | null
          project_id: string
          reviewed_at?: string | null
          revision?: number
          sha256: string
          state?: string
        }
        Update: {
          asset_id?: string | null
          canon_id?: string | null
          content?: Json
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          prepared_at?: string | null
          project_id?: string
          reviewed_at?: string | null
          revision?: number
          sha256?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "forge_creator_versions_asset_id_owner_id_fkey"
            columns: ["asset_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "studio_assets"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "forge_creator_versions_canon_id_owner_id_fkey"
            columns: ["canon_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "forge_creator_versions"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "forge_creator_versions_project_id_owner_id_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "beta_projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      forge_reviews: {
        Row: {
          created_at: string
          export_approved: boolean
          id: string
          owner_id: string
          privacy_consent: boolean
          rights_consent: boolean
          sha256: string
          version_id: string
        }
        Insert: {
          created_at?: string
          export_approved: boolean
          id?: string
          owner_id?: string
          privacy_consent: boolean
          rights_consent: boolean
          sha256: string
          version_id: string
        }
        Update: {
          created_at?: string
          export_approved?: boolean
          id?: string
          owner_id?: string
          privacy_consent?: boolean
          rights_consent?: boolean
          sha256?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forge_reviews_version_id_owner_id_sha256_fkey"
            columns: ["version_id", "owner_id", "sha256"]
            isOneToOne: false
            referencedRelation: "forge_versions"
            referencedColumns: ["id", "owner_id", "sha256"]
          },
        ]
      }
      forge_versions: {
        Row: {
          actual_cost: number | null
          content: Json
          cost_status: string
          created_at: string
          evidence: Json
          id: string
          kind: string
          output_id: string | null
          owner_id: string
          processor: string
          project_id: string
          revision: number
          sha256: string
          source_id: string | null
        }
        Insert: {
          actual_cost?: number | null
          content: Json
          cost_status?: string
          created_at?: string
          evidence: Json
          id?: string
          kind: string
          output_id?: string | null
          owner_id: string
          processor: string
          project_id: string
          revision: number
          sha256: string
          source_id?: string | null
        }
        Update: {
          actual_cost?: number | null
          content?: Json
          cost_status?: string
          created_at?: string
          evidence?: Json
          id?: string
          kind?: string
          output_id?: string | null
          owner_id?: string
          processor?: string
          project_id?: string
          revision?: number
          sha256?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forge_versions_output_id_owner_id_fkey"
            columns: ["output_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "studio_assets"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "forge_versions_project_id_owner_id_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "beta_projects"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "forge_versions_source_id_owner_id_fkey"
            columns: ["source_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "studio_assets"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by: string
          declined_at?: string | null
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string
          declined_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token_hash?: string
        }
        Relationships: []
      }
      jackboy_dispatch_grants: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          jackboy_owner_id: string
          job_id: string
          kind: string
          owner_id: string
          payload_digest: string
          project_id: string
          repo: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id: string
          jackboy_owner_id: string
          job_id: string
          kind: string
          owner_id: string
          payload_digest: string
          project_id: string
          repo: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          jackboy_owner_id?: string
          job_id?: string
          kind?: string
          owner_id?: string
          payload_digest?: string
          project_id?: string
          repo?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      jackboy_dispatch_jobs: {
        Row: {
          created_at: string
          grant_id: string
          id: string
          payload_digest: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grant_id: string
          id: string
          payload_digest: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grant_id?: string
          id?: string
          payload_digest?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jackboy_dispatch_jobs_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "jackboy_dispatch_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      jackboy_dispatch_nonces: {
        Row: {
          created_at: string
          nonce: string
        }
        Insert: {
          created_at?: string
          nonce: string
        }
        Update: {
          created_at?: string
          nonce?: string
        }
        Relationships: []
      }
      jackboy_permits: {
        Row: {
          closed_at: string | null
          closed_reason: string | null
          daily_usd: number
          digest: string
          expires_at: string
          issued_at: string
          job_id: string
          kind: string
          per_call_usd: number
          per_task_usd: number
          permit_id: string
          renewals: number
          signature_digest: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_reason?: string | null
          daily_usd: number
          digest: string
          expires_at: string
          issued_at?: string
          job_id: string
          kind: string
          per_call_usd: number
          per_task_usd: number
          permit_id: string
          renewals?: number
          signature_digest: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_reason?: string | null
          daily_usd?: number
          digest?: string
          expires_at?: string
          issued_at?: string
          job_id?: string
          kind?: string
          per_call_usd?: number
          per_task_usd?: number
          permit_id?: string
          renewals?: number
          signature_digest?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      jackboy_safety_nonces: {
        Row: {
          nonce: string
          seen_at: string
        }
        Insert: {
          nonce: string
          seen_at?: string
        }
        Update: {
          nonce?: string
          seen_at?: string
        }
        Relationships: []
      }
      jackboy_safety_state: {
        Row: {
          active_permits: number | null
          authorization_expires_at: string | null
          autonomous_allowed: boolean | null
          blocked_by: string | null
          cancellation: string | null
          code_enabled: boolean | null
          code_stop: boolean | null
          expires_at: string | null
          id: number
          manual_allowed: boolean | null
          observed_at: string | null
          paused: boolean | null
          proof_digest: string | null
          reason: string
          recorded_at: string
          source: string
          state: string
        }
        Insert: {
          active_permits?: number | null
          authorization_expires_at?: string | null
          autonomous_allowed?: boolean | null
          blocked_by?: string | null
          cancellation?: string | null
          code_enabled?: boolean | null
          code_stop?: boolean | null
          expires_at?: string | null
          id: number
          manual_allowed?: boolean | null
          observed_at?: string | null
          paused?: boolean | null
          proof_digest?: string | null
          reason?: string
          recorded_at?: string
          source?: string
          state?: string
        }
        Update: {
          active_permits?: number | null
          authorization_expires_at?: string | null
          autonomous_allowed?: boolean | null
          blocked_by?: string | null
          cancellation?: string | null
          code_enabled?: boolean | null
          code_stop?: boolean | null
          expires_at?: string | null
          id?: number
          manual_allowed?: boolean | null
          observed_at?: string | null
          paused?: boolean | null
          proof_digest?: string | null
          reason?: string
          recorded_at?: string
          source?: string
          state?: string
        }
        Relationships: []
      }
      knowledge_briefs: {
        Row: {
          brief_date: string
          created_at: string
          entries: Json
          id: string
          item_count: number
          model: string
          overview: string
          run_id: string | null
        }
        Insert: {
          brief_date: string
          created_at?: string
          entries?: Json
          id?: string
          item_count?: number
          model: string
          overview: string
          run_id?: string | null
        }
        Update: {
          brief_date?: string
          created_at?: string
          entries?: Json
          id?: string
          item_count?: number
          model?: string
          overview?: string
          run_id?: string | null
        }
        Relationships: []
      }
      knowledge_items: {
        Row: {
          categories: string[]
          collected_at: string
          id: string
          published_at: string | null
          run_id: string | null
          source_id: string
          source_name: string
          summary: string
          title: string
          url: string
        }
        Insert: {
          categories?: string[]
          collected_at?: string
          id?: string
          published_at?: string | null
          run_id?: string | null
          source_id: string
          source_name: string
          summary?: string
          title: string
          url: string
        }
        Update: {
          categories?: string[]
          collected_at?: string
          id?: string
          published_at?: string | null
          run_id?: string | null
          source_id?: string
          source_name?: string
          summary?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      knowledge_job_state: {
        Row: {
          brief_attempt_date: string | null
          brief_attempt_pending: boolean
          brief_attempt_run: string | null
          id: number
          lease_owner: string | null
          lease_until: string | null
          paused_at: string | null
          paused_reason: string | null
          paused_status: number | null
        }
        Insert: {
          brief_attempt_date?: string | null
          brief_attempt_pending?: boolean
          brief_attempt_run?: string | null
          id?: number
          lease_owner?: string | null
          lease_until?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          paused_status?: number | null
        }
        Update: {
          brief_attempt_date?: string | null
          brief_attempt_pending?: boolean
          brief_attempt_run?: string | null
          id?: number
          lease_owner?: string | null
          lease_until?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          paused_status?: number | null
        }
        Relationships: []
      }
      knowledge_runs: {
        Row: {
          brief_message: string | null
          brief_status: string
          duplicates: number
          fetched: number
          finished_at: string | null
          id: string
          inserted: number
          source_errors: Json
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          brief_message?: string | null
          brief_status?: string
          duplicates?: number
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          source_errors?: Json
          started_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          brief_message?: string | null
          brief_status?: string
          duplicates?: number
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          source_errors?: Json
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      omni_agent_jobs: {
        Row: {
          agent_id: string
          cost_cents: number
          created_at: string
          cursor: string | null
          ended_at: string | null
          id: string
          input: string
          kind: string
          origin: string
          session_id: string
          status: string
        }
        Insert: {
          agent_id: string
          cost_cents?: number
          created_at?: string
          cursor?: string | null
          ended_at?: string | null
          id?: string
          input: string
          kind: string
          origin: string
          session_id: string
          status?: string
        }
        Update: {
          agent_id?: string
          cost_cents?: number
          created_at?: string
          cursor?: string | null
          ended_at?: string | null
          id?: string
          input?: string
          kind?: string
          origin?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_agent_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "omni_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omni_agent_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "omni_workspace_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_agent_memories: {
        Row: {
          agent_id: string
          body: string
          body_sha256: string
          created_at: string
          id: string
          kind: string
          owner_id: string
          source_kind: string
          source_ref: string
          title: string
        }
        Insert: {
          agent_id: string
          body: string
          body_sha256: string
          created_at?: string
          id?: string
          kind: string
          owner_id: string
          source_kind: string
          source_ref?: string
          title: string
        }
        Update: {
          agent_id?: string
          body?: string
          body_sha256?: string
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          source_kind?: string
          source_ref?: string
          title?: string
        }
        Relationships: []
      }
      omni_agent_memory_audit: {
        Row: {
          actor_id: string
          agent_id: string
          at: string
          event: string
          id: number
          item_count: number
          memory_id: string | null
        }
        Insert: {
          actor_id: string
          agent_id: string
          at?: string
          event: string
          id?: never
          item_count?: number
          memory_id?: string | null
        }
        Update: {
          actor_id?: string
          agent_id?: string
          at?: string
          event?: string
          id?: never
          item_count?: number
          memory_id?: string | null
        }
        Relationships: []
      }
      omni_agent_runs: {
        Row: {
          consent: boolean
          created_at: string
          error_message: string | null
          error_status: number | null
          finished_at: string | null
          gateway_run_id: string | null
          id: string
          input_tokens: number | null
          message: string
          model: string
          output_tokens: number | null
          owner_id: string
          project_id: string
          result: string
          status: string
          total_tokens: number | null
        }
        Insert: {
          consent: boolean
          created_at?: string
          error_message?: string | null
          error_status?: number | null
          finished_at?: string | null
          gateway_run_id?: string | null
          id: string
          input_tokens?: number | null
          message: string
          model: string
          output_tokens?: number | null
          owner_id: string
          project_id: string
          result?: string
          status?: string
          total_tokens?: number | null
        }
        Update: {
          consent?: boolean
          created_at?: string
          error_message?: string | null
          error_status?: number | null
          finished_at?: string | null
          gateway_run_id?: string | null
          id?: string
          input_tokens?: number | null
          message?: string
          model?: string
          output_tokens?: number | null
          owner_id?: string
          project_id?: string
          result?: string
          status?: string
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "omni_agent_runs_project_id_owner_id_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "beta_projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      omni_agent_steps: {
        Row: {
          agent_id: string
          body: string
          body_sha256: string | null
          cost_cents: number
          created_at: string
          decided_at: string | null
          exit_code: number | null
          id: string
          job_id: string
          kind: string
          model: string | null
          remote_id: string
          session_id: string
          status: string
          stream: string | null
          title: string
        }
        Insert: {
          agent_id: string
          body?: string
          body_sha256?: string | null
          cost_cents?: number
          created_at?: string
          decided_at?: string | null
          exit_code?: number | null
          id?: string
          job_id: string
          kind: string
          model?: string | null
          remote_id: string
          session_id: string
          status: string
          stream?: string | null
          title?: string
        }
        Update: {
          agent_id?: string
          body?: string
          body_sha256?: string | null
          cost_cents?: number
          created_at?: string
          decided_at?: string | null
          exit_code?: number | null
          id?: string
          job_id?: string
          kind?: string
          model?: string | null
          remote_id?: string
          session_id?: string
          status?: string
          stream?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_agent_steps_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "omni_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omni_agent_steps_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "omni_agent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_agents: {
        Row: {
          allowed_actions: string[]
          budget_day_cents: number
          budget_task_cents: number
          budget_total_cents: number
          display_name: string
          id: string
          link_kind: string
          model: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allowed_actions?: string[]
          budget_day_cents?: number
          budget_task_cents?: number
          budget_total_cents?: number
          display_name: string
          id: string
          link_kind: string
          model?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allowed_actions?: string[]
          budget_day_cents?: number
          budget_task_cents?: number
          budget_total_cents?: number
          display_name?: string
          id?: string
          link_kind?: string
          model?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      omni_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rotated_at: string | null
          scopes: string[]
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          rotated_at?: string | null
          scopes?: string[]
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rotated_at?: string | null
          scopes?: string[]
          status?: string
        }
        Relationships: []
      }
      omni_autonomy_windows: {
        Row: {
          agent_id: string
          end_reason: string | null
          ended_at: string | null
          expires_at: string
          id: string
          owner_id: string
          started_at: string
        }
        Insert: {
          agent_id: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at: string
          id?: string
          owner_id: string
          started_at?: string
        }
        Update: {
          agent_id?: string
          end_reason?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          owner_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_autonomy_windows_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "omni_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_code_job_events: {
        Row: {
          actor: string
          agent_id: string
          at: string
          detail: Json
          event: string
          id: number
          job_id: string
        }
        Insert: {
          actor: string
          agent_id: string
          at?: string
          detail?: Json
          event: string
          id?: never
          job_id: string
        }
        Update: {
          actor?: string
          agent_id?: string
          at?: string
          detail?: Json
          event?: string
          id?: never
          job_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_code_job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "omni_code_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_code_jobs: {
        Row: {
          agent_id: string
          approved_at: string | null
          approved_by: string | null
          attempts: number
          checkpoint: string | null
          cost_cents: number
          created_at: string
          destructive: boolean
          ended_at: string | null
          error: string | null
          id: string
          instructions: string
          kind: string
          lease_expires_at: string | null
          lease_owner: string | null
          max_attempts: number
          not_before: string | null
          owner_id: string
          plan_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          checkpoint?: string | null
          cost_cents?: number
          created_at?: string
          destructive?: boolean
          ended_at?: string | null
          error?: string | null
          id?: string
          instructions?: string
          kind: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          not_before?: string | null
          owner_id: string
          plan_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          approved_at?: string | null
          approved_by?: string | null
          attempts?: number
          checkpoint?: string | null
          cost_cents?: number
          created_at?: string
          destructive?: boolean
          ended_at?: string | null
          error?: string | null
          id?: string
          instructions?: string
          kind?: string
          lease_expires_at?: string | null
          lease_owner?: string | null
          max_attempts?: number
          not_before?: string | null
          owner_id?: string
          plan_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_code_jobs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "omni_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_code_service: {
        Row: {
          always_on: boolean
          always_on_until: string | null
          changed_at: string
          changed_by: string | null
          id: number
          idle_only: boolean
          jobs_per_agent_hour: number
          max_concurrent: number
          max_per_agent: number
          min_idle_minutes: number
          window_end_hour: number | null
          window_start_hour: number | null
        }
        Insert: {
          always_on?: boolean
          always_on_until?: string | null
          changed_at?: string
          changed_by?: string | null
          id: number
          idle_only?: boolean
          jobs_per_agent_hour?: number
          max_concurrent?: number
          max_per_agent?: number
          min_idle_minutes?: number
          window_end_hour?: number | null
          window_start_hour?: number | null
        }
        Update: {
          always_on?: boolean
          always_on_until?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: number
          idle_only?: boolean
          jobs_per_agent_hour?: number
          max_concurrent?: number
          max_per_agent?: number
          min_idle_minutes?: number
          window_end_hour?: number | null
          window_start_hour?: number | null
        }
        Relationships: []
      }
      omni_dock_devices: {
        Row: {
          app_version: string
          approved_at: string | null
          approved_by: string | null
          branch_kind: string
          claimed_at: string
          id: string
          invite_id: string
          key_fingerprint: string
          label: string
          last_seen_at: string | null
          permissions: string[]
          platform: string
          public_key: Json
          reported_capabilities: string[]
          requested_permissions: string[]
          revision: number
          revoke_reason: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          app_version?: string
          approved_at?: string | null
          approved_by?: string | null
          branch_kind: string
          claimed_at?: string
          id?: string
          invite_id: string
          key_fingerprint: string
          label: string
          last_seen_at?: string | null
          permissions?: string[]
          platform: string
          public_key: Json
          reported_capabilities?: string[]
          requested_permissions?: string[]
          revision?: number
          revoke_reason?: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          app_version?: string
          approved_at?: string | null
          approved_by?: string | null
          branch_kind?: string
          claimed_at?: string
          id?: string
          invite_id?: string
          key_fingerprint?: string
          label?: string
          last_seen_at?: string | null
          permissions?: string[]
          platform?: string
          public_key?: Json
          reported_capabilities?: string[]
          requested_permissions?: string[]
          revision?: number
          revoke_reason?: string
          revoked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_dock_devices_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "omni_dock_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_dock_events: {
        Row: {
          created_at: string
          detail: string
          device_id: string | null
          event: string
          id: string
          invite_id: string | null
          outcome: string
        }
        Insert: {
          created_at?: string
          detail?: string
          device_id?: string | null
          event: string
          id?: string
          invite_id?: string | null
          outcome: string
        }
        Update: {
          created_at?: string
          detail?: string
          device_id?: string | null
          event?: string
          id?: string
          invite_id?: string | null
          outcome?: string
        }
        Relationships: []
      }
      omni_dock_invites: {
        Row: {
          branch_kind: string
          cancelled_at: string | null
          code_hash: string
          consumed_at: string | null
          consumed_device: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          requested_permissions: string[]
        }
        Insert: {
          branch_kind: string
          cancelled_at?: string | null
          code_hash: string
          consumed_at?: string | null
          consumed_device?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          requested_permissions?: string[]
        }
        Update: {
          branch_kind?: string
          cancelled_at?: string | null
          code_hash?: string
          consumed_at?: string | null
          consumed_device?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          requested_permissions?: string[]
        }
        Relationships: []
      }
      omni_dock_nonces: {
        Row: {
          device_id: string
          nonce: string
          seen_at: string
        }
        Insert: {
          device_id: string
          nonce: string
          seen_at?: string
        }
        Update: {
          device_id?: string
          nonce?: string
          seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_dock_nonces_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "omni_dock_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_file_journal: {
        Row: {
          at: string
          id: number
          op: Json
          op_index: number
          plan_id: string
          result: string
          trashed_to: string | null
          undo: boolean
        }
        Insert: {
          at?: string
          id?: never
          op: Json
          op_index: number
          plan_id: string
          result: string
          trashed_to?: string | null
          undo?: boolean
        }
        Update: {
          at?: string
          id?: never
          op?: Json
          op_index?: number
          plan_id?: string
          result?: string
          trashed_to?: string | null
          undo?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "omni_file_journal_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "omni_file_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_file_plans: {
        Row: {
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          confirmed_destructive: number[]
          created_at: string
          grant_id: string
          id: string
          ops: Json
          owner_id: string
          plan_sha256: string
          status: string
          summary: Json
        }
        Insert: {
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confirmed_destructive?: number[]
          created_at?: string
          grant_id: string
          id?: string
          ops?: Json
          owner_id: string
          plan_sha256: string
          status?: string
          summary?: Json
        }
        Update: {
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          confirmed_destructive?: number[]
          created_at?: string
          grant_id?: string
          id?: string
          ops?: Json
          owner_id?: string
          plan_sha256?: string
          status?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "omni_file_plans_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "omni_mac_folder_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_mac_folder_grants: {
        Row: {
          created_at: string
          device_id: string | null
          expires_at: string
          id: string
          mode: string
          owner_id: string
          path: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          expires_at: string
          id?: string
          mode: string
          owner_id: string
          path: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          expires_at?: string
          id?: string
          mode?: string
          owner_id?: string
          path?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      omni_passkey_checks: {
        Row: {
          challenge: string
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          kind: string
          owner_id: string
          purpose: string
          rp_id: string
          used_at: string | null
        }
        Insert: {
          challenge: string
          confirmed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          kind: string
          owner_id: string
          purpose: string
          rp_id: string
          used_at?: string | null
        }
        Update: {
          challenge?: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          owner_id?: string
          purpose?: string
          rp_id?: string
          used_at?: string | null
        }
        Relationships: []
      }
      omni_passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          id: string
          last_used_at: string | null
          name: string
          owner_id: string
          public_key: string
          rp_id: string
          transports: string[]
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          id?: string
          last_used_at?: string | null
          name: string
          owner_id: string
          public_key: string
          rp_id: string
          transports?: string[]
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          id?: string
          last_used_at?: string | null
          name?: string
          owner_id?: string
          public_key?: string
          rp_id?: string
          transports?: string[]
        }
        Relationships: []
      }
      omni_social_drafts: {
        Row: {
          content: Json
          created_at: string
          id: string
          owner_id: string
          project_id: string
          reviewed_at: string | null
          revision: number
          state: string
          updated_at: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          owner_id?: string
          project_id: string
          reviewed_at?: string | null
          revision?: number
          state?: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          owner_id?: string
          project_id?: string
          reviewed_at?: string | null
          revision?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_social_drafts_project_id_owner_id_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "beta_projects"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      omni_spend_ledger: {
        Row: {
          agent_id: string
          cents: number
          created_at: string
          id: number
          job_id: string | null
          note: string | null
          session_id: string | null
        }
        Insert: {
          agent_id: string
          cents: number
          created_at?: string
          id?: never
          job_id?: string | null
          note?: string | null
          session_id?: string | null
        }
        Update: {
          agent_id?: string
          cents?: number
          created_at?: string
          id?: never
          job_id?: string | null
          note?: string | null
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "omni_spend_ledger_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "omni_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_task_handoffs: {
        Row: {
          created_at: string
          created_by: string
          detail: string
          jackboy_job_id: string | null
          job_kind: string
          last_checked_at: string | null
          payload_digest: string
          status: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          detail?: string
          jackboy_job_id?: string | null
          job_kind: string
          last_checked_at?: string | null
          payload_digest: string
          status?: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          detail?: string
          jackboy_job_id?: string | null
          job_kind?: string
          last_checked_at?: string | null
          payload_digest?: string
          status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_task_handoffs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "omni_terminal_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_terminal_controls: {
        Row: {
          changed_at: string
          changed_by: string | null
          emergency_stop: boolean
          id: number
          reason: string
          revision: number
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          emergency_stop?: boolean
          id?: number
          reason?: string
          revision?: number
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          emergency_stop?: boolean
          id?: number
          reason?: string
          revision?: number
        }
        Relationships: []
      }
      omni_terminal_log: {
        Row: {
          actor_id: string
          command: string
          created_at: string
          id: string
          outcome: string
          session_id: string
          summary: string
        }
        Insert: {
          actor_id: string
          command: string
          created_at?: string
          id?: string
          outcome: string
          session_id: string
          summary?: string
        }
        Update: {
          actor_id?: string
          command?: string
          created_at?: string
          id?: string
          outcome?: string
          session_id?: string
          summary?: string
        }
        Relationships: []
      }
      omni_terminal_tasks: {
        Row: {
          agent: string
          cancelled_at: string | null
          created_at: string
          created_by: string
          id: string
          instructions: string
          kind: string
          project_label: string
          repository: string | null
          source_device: string | null
          state: string
        }
        Insert: {
          agent: string
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          id: string
          instructions: string
          kind: string
          project_label: string
          repository?: string | null
          source_device?: string | null
          state?: string
        }
        Update: {
          agent?: string
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          instructions?: string
          kind?: string
          project_label?: string
          repository?: string | null
          source_device?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_terminal_tasks_source_device_fkey"
            columns: ["source_device"]
            isOneToOne: false
            referencedRelation: "omni_dock_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_workspace_approvals: {
        Row: {
          action_kind: string
          agent_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          description: string
          id: string
          job_id: string
          remote_id: string
          session_id: string
          status: string
        }
        Insert: {
          action_kind: string
          agent_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description: string
          id?: string
          job_id: string
          remote_id: string
          session_id: string
          status?: string
        }
        Update: {
          action_kind?: string
          agent_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          description?: string
          id?: string
          job_id?: string
          remote_id?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_workspace_approvals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "omni_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "omni_workspace_approvals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "omni_agent_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_workspace_audit: {
        Row: {
          actor: string
          agent_id: string | null
          at: string
          detail: Json
          event: string
          id: number
          job_id: string | null
          output_head: string | null
          output_sha256: string | null
          session_id: string | null
        }
        Insert: {
          actor: string
          agent_id?: string | null
          at?: string
          detail?: Json
          event: string
          id?: never
          job_id?: string | null
          output_head?: string | null
          output_sha256?: string | null
          session_id?: string | null
        }
        Update: {
          actor?: string
          agent_id?: string | null
          at?: string
          detail?: Json
          event?: string
          id?: never
          job_id?: string | null
          output_head?: string | null
          output_sha256?: string | null
          session_id?: string | null
        }
        Relationships: []
      }
      omni_workspace_sessions: {
        Row: {
          agent_id: string
          end_reason: string | null
          ended_at: string | null
          id: string
          last_activity_at: string
          model: string | null
          owner_id: string
          provider: string
          repo_ref: string | null
          repository: string | null
          sandbox_id: string | null
          sandbox_name: string | null
          started_at: string
        }
        Insert: {
          agent_id: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          model?: string | null
          owner_id: string
          provider?: string
          repo_ref?: string | null
          repository?: string | null
          sandbox_id?: string | null
          sandbox_name?: string | null
          started_at?: string
        }
        Update: {
          agent_id?: string
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          last_activity_at?: string
          model?: string | null
          owner_id?: string
          provider?: string
          repo_ref?: string | null
          repository?: string | null
          sandbox_id?: string | null
          sandbox_name?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omni_workspace_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "omni_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      omni_workspace_settings: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: number
          reason: string | null
          terminal_enabled: boolean
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id: number
          reason?: string | null
          terminal_enabled?: boolean
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: number
          reason?: string | null
          terminal_enabled?: boolean
        }
        Relationships: []
      }
      owner_config: {
        Row: {
          id: number
          owner_email: string
        }
        Insert: {
          id?: number
          owner_email: string
        }
        Update: {
          id?: number
          owner_email?: string
        }
        Relationships: []
      }
      owner_mfa_recovery_codes: {
        Row: {
          batch_id: string
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          batch_id: string
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      owner_mfa_recovery_events: {
        Row: {
          created_at: string
          detail: string
          event: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          detail?: string
          event: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          detail?: string
          event?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      razul_agent_feedback: {
        Row: {
          agent: string
          created_at: string
          created_by: string
          finding_id: string
          id: string
          note: string
          verdict: string
        }
        Insert: {
          agent: string
          created_at?: string
          created_by: string
          finding_id: string
          id?: string
          note?: string
          verdict: string
        }
        Update: {
          agent?: string
          created_at?: string
          created_by?: string
          finding_id?: string
          id?: string
          note?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "razul_agent_feedback_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "razul_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_agent_feeds: {
        Row: {
          agent: string
          alerts_enabled: boolean
          categories: string[]
          min_relevance: number
          updated_at: string
        }
        Insert: {
          agent: string
          alerts_enabled?: boolean
          categories?: string[]
          min_relevance?: number
          updated_at?: string
        }
        Update: {
          agent?: string
          alerts_enabled?: boolean
          categories?: string[]
          min_relevance?: number
          updated_at?: string
        }
        Relationships: []
      }
      razul_agent_manifests: {
        Row: {
          agent_id: string
          app_id: string
          created_at: string
          created_by: string
          created_by_user: string | null
          id: string
          manifest: Json
          manifest_sha256: string
          version: string
        }
        Insert: {
          agent_id: string
          app_id: string
          created_at?: string
          created_by: string
          created_by_user?: string | null
          id?: string
          manifest: Json
          manifest_sha256: string
          version: string
        }
        Update: {
          agent_id?: string
          app_id?: string
          created_at?: string
          created_by?: string
          created_by_user?: string | null
          id?: string
          manifest?: Json
          manifest_sha256?: string
          version?: string
        }
        Relationships: []
      }
      razul_agent_releases: {
        Row: {
          agent_id: string
          app_id: string
          manifest_id: string
          previous_manifest_id: string | null
          proposal_id: string
          released_at: string
        }
        Insert: {
          agent_id: string
          app_id: string
          manifest_id: string
          previous_manifest_id?: string | null
          proposal_id: string
          released_at?: string
        }
        Update: {
          agent_id?: string
          app_id?: string
          manifest_id?: string
          previous_manifest_id?: string | null
          proposal_id?: string
          released_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razul_agent_releases_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: false
            referencedRelation: "razul_agent_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razul_agent_releases_previous_manifest_id_fkey"
            columns: ["previous_manifest_id"]
            isOneToOne: false
            referencedRelation: "razul_agent_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razul_agent_releases_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "razul_update_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_alert_events: {
        Row: {
          agent: string
          created_at: string
          finding_id: string
          id: string
          read_at: string | null
          relevance: number
        }
        Insert: {
          agent: string
          created_at?: string
          finding_id: string
          id?: string
          read_at?: string | null
          relevance: number
        }
        Update: {
          agent?: string
          created_at?: string
          finding_id?: string
          id?: string
          read_at?: string | null
          relevance?: number
        }
        Relationships: [
          {
            foreignKeyName: "razul_alert_events_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "razul_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_control_audit: {
        Row: {
          action: string
          actor_id: string | null
          id: string
          occurred_at: string
          record_id: string
          record_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          id?: string
          occurred_at?: string
          record_id: string
          record_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          id?: string
          occurred_at?: string
          record_id?: string
          record_type?: string
        }
        Relationships: []
      }
      razul_dispatch_queue: {
        Row: {
          created_at: string
          created_by: string | null
          guardian_status: string
          id: string
          scout_type: string
          sentinel_id: string
          status: string
          task: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          guardian_status?: string
          id?: string
          scout_type: string
          sentinel_id: string
          status?: string
          task: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          guardian_status?: string
          id?: string
          scout_type?: string
          sentinel_id?: string
          status?: string
          task?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razul_dispatch_queue_sentinel_id_fkey"
            columns: ["sentinel_id"]
            isOneToOne: false
            referencedRelation: "razul_sentinels"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_evaluations: {
        Row: {
          id: string
          kind: string
          manifest_sha256: string
          passed: boolean
          proof_verified: boolean
          proposal_id: string
          ran_at: string
          runner: string
          summary: Json
        }
        Insert: {
          id?: string
          kind: string
          manifest_sha256: string
          passed: boolean
          proof_verified?: boolean
          proposal_id: string
          ran_at?: string
          runner: string
          summary?: Json
        }
        Update: {
          id?: string
          kind?: string
          manifest_sha256?: string
          passed?: boolean
          proof_verified?: boolean
          proposal_id?: string
          ran_at?: string
          runner?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "razul_evaluations_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "razul_update_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_findings: {
        Row: {
          category: string
          collected_at: string
          corroborations: number
          entities: string[]
          evidence_class: string
          evidence_strength: number
          id: string
          published_at: string | null
          relevance: number
          revision: number
          routed_to: string[]
          run_id: string | null
          source_id: string
          source_name: string
          summary: string
          title: string
          topic: string
          url: string
        }
        Insert: {
          category: string
          collected_at?: string
          corroborations?: number
          entities?: string[]
          evidence_class?: string
          evidence_strength?: number
          id?: string
          published_at?: string | null
          relevance?: number
          revision?: number
          routed_to?: string[]
          run_id?: string | null
          source_id: string
          source_name: string
          summary?: string
          title: string
          topic?: string
          url: string
        }
        Update: {
          category?: string
          collected_at?: string
          corroborations?: number
          entities?: string[]
          evidence_class?: string
          evidence_strength?: number
          id?: string
          published_at?: string | null
          relevance?: number
          revision?: number
          routed_to?: string[]
          run_id?: string | null
          source_id?: string
          source_name?: string
          summary?: string
          title?: string
          topic?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "razul_findings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "razul_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_job_state: {
        Row: {
          alert_threshold: number
          blocked_sources: string[]
          coverage: string[]
          id: number
          lease_owner: string | null
          lease_until: string | null
          paused_at: string | null
          paused_reason: string | null
          retention_days: number
          updated_at: string
        }
        Insert: {
          alert_threshold?: number
          blocked_sources?: string[]
          coverage?: string[]
          id?: number
          lease_owner?: string | null
          lease_until?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          retention_days?: number
          updated_at?: string
        }
        Update: {
          alert_threshold?: number
          blocked_sources?: string[]
          coverage?: string[]
          id?: number
          lease_owner?: string | null
          lease_until?: string | null
          paused_at?: string | null
          paused_reason?: string | null
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      razul_knowledge_docs: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          namespace: string
          retrieved_at: string
          source_kind: string
          source_ref: string
          source_sha256: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          id?: string
          namespace: string
          retrieved_at: string
          source_kind: string
          source_ref: string
          source_sha256: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          namespace?: string
          retrieved_at?: string
          source_kind?: string
          source_ref?: string
          source_sha256?: string
          title?: string
        }
        Relationships: []
      }
      razul_project_passports: {
        Row: {
          architecture: string
          created_at: string
          documentation_url: string | null
          features: string[]
          id: string
          lessons: string[]
          pending_tasks: string[]
          permissions: string[]
          project: string
          provenance: string
          purpose: string
          resident_agent: string
          status: string
          tools: string[]
          updated_at: string
          verified_tests: string[]
          version: number
        }
        Insert: {
          architecture?: string
          created_at?: string
          documentation_url?: string | null
          features?: string[]
          id?: string
          lessons?: string[]
          pending_tasks?: string[]
          permissions?: string[]
          project: string
          provenance?: string
          purpose?: string
          resident_agent: string
          status?: string
          tools?: string[]
          updated_at?: string
          verified_tests?: string[]
          version?: number
        }
        Update: {
          architecture?: string
          created_at?: string
          documentation_url?: string | null
          features?: string[]
          id?: string
          lessons?: string[]
          pending_tasks?: string[]
          permissions?: string[]
          project?: string
          provenance?: string
          purpose?: string
          resident_agent?: string
          status?: string
          tools?: string[]
          updated_at?: string
          verified_tests?: string[]
          version?: number
        }
        Relationships: []
      }
      razul_provisioning_events: {
        Row: {
          actor: string
          agent_id: string | null
          app_id: string | null
          at: string
          detail: Json
          event: string
          id: number
          proposal_id: string | null
        }
        Insert: {
          actor: string
          agent_id?: string | null
          app_id?: string | null
          at?: string
          detail?: Json
          event: string
          id?: never
          proposal_id?: string | null
        }
        Update: {
          actor?: string
          agent_id?: string | null
          app_id?: string | null
          at?: string
          detail?: Json
          event?: string
          id?: never
          proposal_id?: string | null
        }
        Relationships: []
      }
      razul_query_cache: {
        Row: {
          answer: Json
          created_at: string
          question_hash: string
          scope_key: string
        }
        Insert: {
          answer: Json
          created_at?: string
          question_hash: string
          scope_key?: string
        }
        Update: {
          answer?: Json
          created_at?: string
          question_hash?: string
          scope_key?: string
        }
        Relationships: []
      }
      razul_query_log: {
        Row: {
          agent: string
          cached: boolean
          created_at: string
          id: string
          question_hash: string
          result_count: number
        }
        Insert: {
          agent: string
          cached?: boolean
          created_at?: string
          id?: string
          question_hash: string
          result_count?: number
        }
        Update: {
          agent?: string
          cached?: boolean
          created_at?: string
          id?: string
          question_hash?: string
          result_count?: number
        }
        Relationships: []
      }
      razul_runs: {
        Row: {
          alerts: number
          duplicates: number
          fetched: number
          finished_at: string | null
          id: string
          inserted: number
          source_errors: Json
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          alerts?: number
          duplicates?: number
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          source_errors?: Json
          started_at?: string
          status?: string
          trigger: string
        }
        Update: {
          alerts?: number
          duplicates?: number
          fetched?: number
          finished_at?: string | null
          id?: string
          inserted?: number
          source_errors?: Json
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: []
      }
      razul_sentinel_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          sentinel_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload: Json
          sentinel_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          sentinel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "razul_sentinel_events_sentinel_id_fkey"
            columns: ["sentinel_id"]
            isOneToOne: false
            referencedRelation: "razul_sentinels"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_sentinels: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string | null
          name: string
          scopes: string[]
          status: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          last_seen_at?: string | null
          name: string
          scopes?: string[]
          status?: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          scopes?: string[]
          status?: string
          token_hash?: string
        }
        Relationships: []
      }
      razul_source_checks: {
        Row: {
          checked_at: string
          error_code: string | null
          fetched: number
          id: string
          inserted: number
          run_id: string
          source_id: string
          status: string
        }
        Insert: {
          checked_at?: string
          error_code?: string | null
          fetched?: number
          id?: string
          inserted?: number
          run_id: string
          source_id: string
          status: string
        }
        Update: {
          checked_at?: string
          error_code?: string | null
          fetched?: number
          id?: string
          inserted?: number
          run_id?: string
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "razul_source_checks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "razul_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razul_source_checks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "razul_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      razul_sources: {
        Row: {
          active: boolean
          added_at: string
          category: string
          id: string
          kind: string
          name: string
          terms_note: string
          url: string
        }
        Insert: {
          active?: boolean
          added_at?: string
          category: string
          id: string
          kind: string
          name: string
          terms_note: string
          url: string
        }
        Update: {
          active?: boolean
          added_at?: string
          category?: string
          id?: string
          kind?: string
          name?: string
          terms_note?: string
          url?: string
        }
        Relationships: []
      }
      razul_update_proposals: {
        Row: {
          agent_id: string
          app_id: string
          approved_at: string | null
          approved_by: string | null
          changes: Json
          created_at: string
          escalations: Json
          escalations_acknowledged: boolean
          id: string
          manifest_id: string
          note: string
          owner_id: string
          previous_manifest_id: string | null
          proposed_by: string
          revision: number
          stage: number | null
          stage_healthy: boolean | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          app_id: string
          approved_at?: string | null
          approved_by?: string | null
          changes?: Json
          created_at?: string
          escalations?: Json
          escalations_acknowledged?: boolean
          id?: string
          manifest_id: string
          note?: string
          owner_id: string
          previous_manifest_id?: string | null
          proposed_by: string
          revision?: number
          stage?: number | null
          stage_healthy?: boolean | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          app_id?: string
          approved_at?: string | null
          approved_by?: string | null
          changes?: Json
          created_at?: string
          escalations?: Json
          escalations_acknowledged?: boolean
          id?: string
          manifest_id?: string
          note?: string
          owner_id?: string
          previous_manifest_id?: string | null
          proposed_by?: string
          revision?: number
          stage?: number | null
          stage_healthy?: boolean | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "razul_update_proposals_manifest_id_fkey"
            columns: ["manifest_id"]
            isOneToOne: true
            referencedRelation: "razul_agent_manifests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "razul_update_proposals_previous_manifest_id_fkey"
            columns: ["previous_manifest_id"]
            isOneToOne: false
            referencedRelation: "razul_agent_manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_assets: {
        Row: {
          byte_size: number
          created_at: string
          gain_db: number | null
          id: string
          metrics: Json | null
          owner_id: string
          privacy_consent: boolean
          project_id: string
          rights_consent: boolean
          role: string
          sha256: string | null
          source_id: string | null
        }
        Insert: {
          byte_size: number
          created_at?: string
          gain_db?: number | null
          id?: string
          metrics?: Json | null
          owner_id?: string
          privacy_consent: boolean
          project_id: string
          rights_consent: boolean
          role: string
          sha256?: string | null
          source_id?: string | null
        }
        Update: {
          byte_size?: number
          created_at?: string
          gain_db?: number | null
          id?: string
          metrics?: Json | null
          owner_id?: string
          privacy_consent?: boolean
          project_id?: string
          rights_consent?: boolean
          role?: string
          sha256?: string | null
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studio_assets_project_id_owner_id_fkey"
            columns: ["project_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "beta_projects"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "studio_assets_source_id_owner_id_fkey"
            columns: ["source_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "studio_assets"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { _token_hash: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      account_mfa_assert_step_up: { Args: never; Returns: undefined }
      account_mfa_consume_recovery_code: {
        Args: { _hash: string; _user: string }
        Returns: string
      }
      account_mfa_record_disabled: {
        Args: { _ok: boolean; _removed: number; _user: string }
        Returns: undefined
      }
      account_mfa_recovery_status: {
        Args: never
        Returns: {
          created_at: string
          remaining: number
        }[]
      }
      account_mfa_set_recovery_codes: {
        Args: { _hashes: string[] }
        Returns: number
      }
      activation_activation_begin: {
        Args: { _attempt: string; _kind: string }
        Returns: Json
      }
      activation_activation_finish: {
        Args: {
          _attempt: string
          _evidence: Json
          _kind: string
          _ok: boolean
          _reason: string
        }
        Returns: string
      }
      activation_activation_revoke: { Args: { _kind: string }; Returns: string }
      activation_approval_decide: {
        Args: {
          _action: string
          _cap_confirmed: boolean
          _daily_confirmed: boolean
          _expires_at: string
          _note: string
          _step: number
        }
        Returns: {
          approval_expires_at: string | null
          approver_id: string | null
          decided_at: string | null
          note: string
          revision: number
          spend_confirmations: Json | null
          status: string
          step: number
        }[]
        SetofOptions: {
          from: "*"
          to: "activation_approvals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      activation_approval_record_check: {
        Args: {
          _actor: string
          _details: Json
          _mode: string
          _status: string
          _step: number
          _summary: string
          _version: number
        }
        Returns: undefined
      }
      activation_autonomy_authorized: { Args: never; Returns: boolean }
      activation_effective: { Args: { _kind: string }; Returns: boolean }
      activation_prereq_blocker: { Args: { _kind: string }; Returns: string }
      assert_fresh_mfa: {
        Args: { _max_age_seconds?: number }
        Returns: undefined
      }
      assert_razul_owner: { Args: never; Returns: undefined }
      caller_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      cancel_omni_agent_run: {
        Args: { _id: string }
        Returns: {
          consent: boolean
          created_at: string
          error_message: string | null
          error_status: number | null
          finished_at: string | null
          gateway_run_id: string | null
          id: string
          input_tokens: number | null
          message: string
          model: string
          output_tokens: number | null
          owner_id: string
          project_id: string
          result: string
          status: string
          total_tokens: number | null
        }
        SetofOptions: {
          from: "*"
          to: "omni_agent_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_knowledge_lease: { Args: { _minutes: number }; Returns: boolean }
      claim_owned_knowledge_lease: {
        Args: { _minutes?: number; _owner: string }
        Returns: boolean
      }
      claim_owned_razul_lease: {
        Args: { _minutes: number; _owner: string }
        Returns: boolean
      }
      claim_owner: { Args: never; Returns: boolean }
      create_invitation: {
        Args: {
          _email: string
          _expires_at: string
          _role: Database["public"]["Enums"]["app_role"]
          _token_hash: string
        }
        Returns: string
      }
      decline_invitation: { Args: { _token_hash: string }; Returns: undefined }
      forge_release_transition: {
        Args: {
          _action: string
          _approve?: boolean
          _id: string
          _owned_site?: boolean
          _privacy?: boolean
          _rights?: boolean
          _sha256: string
        }
        Returns: {
          asset_id: string | null
          canon_id: string | null
          content: Json
          created_at: string
          id: string
          kind: string
          owner_id: string
          prepared_at: string | null
          project_id: string
          reviewed_at: string | null
          revision: number
          sha256: string
          state: string
        }
        SetofOptions: {
          from: "*"
          to: "forge_creator_versions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_knowledge_reader: { Args: never; Returns: boolean }
      is_razul_owner: { Args: never; Returns: boolean }
      jackboy_dispatch_callback_snapshot: {
        Args: { _expected_status?: string; _job: string; _op: string }
        Returns: Json
      }
      jackboy_dispatch_owner_grant: {
        Args: {
          _digest: string
          _expires: string
          _id: string
          _jackboy_owner: string
          _job: string
          _op: string
          _project: string
          _repo: string
        }
        Returns: Json
      }
      jackboy_dispatch_quarantine: {
        Args: {
          _digest: string
          _grant: string
          _job: string
          _kind: string
          _nonce: string
          _op: string
          _owner: string
          _project: string
          _repo: string
        }
        Returns: Json
      }
      jackboy_manual_blocked: { Args: never; Returns: boolean }
      jackboy_permit_active: {
        Args: { _job: string; _kind: string }
        Returns: boolean
      }
      jackboy_permit_close: {
        Args: { _job: string; _reason: string; _status: string }
        Returns: string
      }
      jackboy_permit_record: {
        Args: {
          _daily: number
          _digest: string
          _expires_at: string
          _job: string
          _kind: string
          _per_call: number
          _per_task: number
          _permit_id: string
          _renewals: number
          _signature_digest: string
        }
        Returns: string
      }
      jackboy_permit_stop_job: {
        Args: { _job: string; _kind: string; _reason: string }
        Returns: undefined
      }
      jackboy_permits_enforce: { Args: never; Returns: number }
      jackboy_safety_clear: { Args: never; Returns: boolean }
      jackboy_safety_enforce_freshness: { Args: never; Returns: string }
      jackboy_safety_halt: { Args: never; Returns: undefined }
      jackboy_safety_record: {
        Args: {
          _cancellation: string
          _code_enabled: boolean
          _code_stop: boolean
          _expires_at: string
          _nonce: string
          _observed_at: string
          _paused: boolean
          _proof_digest: string
          _reason: string
          _source: string
        }
        Returns: string
      }
      jackboy_safety_record_v2: {
        Args: {
          _active_permits: number
          _authorization_expires_at: string
          _autonomous_allowed: boolean
          _blocked_by: string
          _cancellation: string
          _code_enabled: boolean
          _code_stop: boolean
          _expires_at: string
          _manual_allowed: boolean
          _nonce: string
          _observed_at: string
          _paused: boolean
          _proof_digest: string
          _reason: string
          _source: string
        }
        Returns: string
      }
      list_invitations: {
        Args: never
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
          declined_at: string | null
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token_hash: string
        }[]
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_members: {
        Args: never
        Returns: {
          email: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      list_omni_agent_runs: {
        Args: { _project: string }
        Returns: {
          consent: boolean
          created_at: string
          error_message: string | null
          error_status: number | null
          finished_at: string | null
          gateway_run_id: string | null
          id: string
          input_tokens: number | null
          message: string
          model: string
          output_tokens: number | null
          owner_id: string
          project_id: string
          result: string
          status: string
          total_tokens: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_agent_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_api_key_create: {
        Args: {
          _days: number
          _key_hash: string
          _key_prefix: string
          _name: string
          _scopes: string[]
        }
        Returns: string
      }
      omni_api_key_revoke: { Args: { _id: string }; Returns: undefined }
      omni_api_key_rotate: {
        Args: { _id: string; _key_hash: string; _key_prefix: string }
        Returns: undefined
      }
      omni_api_key_verify: {
        Args: { _key_hash: string; _scope: string }
        Returns: string
      }
      omni_autonomy_end_all: {
        Args: { _agent: string; _reason: string }
        Returns: undefined
      }
      omni_code_halt: {
        Args: { _agent: string; _reason: string }
        Returns: undefined
      }
      omni_dock_approve: {
        Args: { _device: string; _permissions: string[] }
        Returns: {
          app_version: string
          approved_at: string | null
          approved_by: string | null
          branch_kind: string
          claimed_at: string
          id: string
          invite_id: string
          key_fingerprint: string
          label: string
          last_seen_at: string | null
          permissions: string[]
          platform: string
          public_key: Json
          reported_capabilities: string[]
          requested_permissions: string[]
          revision: number
          revoke_reason: string
          revoked_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_dock_devices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_dock_cancel_invite: { Args: { _id: string }; Returns: undefined }
      omni_dock_claim: {
        Args: {
          _app_version: string
          _capabilities: string[]
          _code_hash: string
          _fingerprint: string
          _label: string
          _platform: string
          _public_key: Json
        }
        Returns: Json
      }
      omni_dock_create_invite: {
        Args: {
          _code_hash: string
          _kind: string
          _minutes: number
          _requested: string[]
        }
        Returns: {
          branch_kind: string
          cancelled_at: string | null
          code_hash: string
          consumed_at: string | null
          consumed_device: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          requested_permissions: string[]
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_dock_invites"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_dock_engage_stop: { Args: { _device: string }; Returns: boolean }
      omni_dock_handoff_status: { Args: { _device: string }; Returns: Json }
      omni_dock_hold_task: {
        Args: {
          _agent: string
          _device: string
          _id: string
          _instructions: string
          _kind: string
          _project: string
          _repository: string
        }
        Returns: Json
      }
      omni_dock_log: {
        Args: {
          _detail: string
          _device: string
          _event: string
          _outcome: string
        }
        Returns: undefined
      }
      omni_dock_revoke: {
        Args: { _device: string; _reason: string }
        Returns: {
          app_version: string
          approved_at: string | null
          approved_by: string | null
          branch_kind: string
          claimed_at: string
          id: string
          invite_id: string
          key_fingerprint: string
          label: string
          last_seen_at: string | null
          permissions: string[]
          platform: string
          public_key: Json
          reported_capabilities: string[]
          requested_permissions: string[]
          revision: number
          revoke_reason: string
          revoked_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_dock_devices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_dock_set_permissions: {
        Args: { _device: string; _permissions: string[]; _revision: number }
        Returns: {
          app_version: string
          approved_at: string | null
          approved_by: string | null
          branch_kind: string
          claimed_at: string
          id: string
          invite_id: string
          key_fingerprint: string
          label: string
          last_seen_at: string | null
          permissions: string[]
          platform: string
          public_key: Json
          reported_capabilities: string[]
          requested_permissions: string[]
          revision: number
          revoke_reason: string
          revoked_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_dock_devices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_dock_touch: {
        Args: {
          _app_version: string
          _capabilities: string[]
          _device: string
          _event: string
          _nonce: string
        }
        Returns: Json
      }
      omni_dock_valid_permissions: { Args: { _p: string[] }; Returns: boolean }
      omni_memory_delete: {
        Args: { _agent: string; _id: string }
        Returns: boolean
      }
      omni_memory_list: {
        Args: { _agent: string }
        Returns: {
          agent_id: string
          body: string
          body_sha256: string
          created_at: string
          id: string
          kind: string
          owner_id: string
          source_kind: string
          source_ref: string
          title: string
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_agent_memories"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_memory_save: {
        Args: {
          _agent: string
          _body: string
          _kind: string
          _source_kind: string
          _source_ref: string
          _title: string
        }
        Returns: string
      }
      omni_memory_valid_agent: { Args: { _agent: string }; Returns: boolean }
      omni_social_transition: {
        Args: {
          _action: string
          _approve?: boolean
          _content?: Json
          _id?: string
          _project?: string
          _revision?: number
        }
        Returns: {
          content: Json
          created_at: string
          id: string
          owner_id: string
          project_id: string
          reviewed_at: string | null
          revision: number
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "omni_social_drafts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      omni_stop_engaged: { Args: never; Returns: boolean }
      omni_task_handoff_begin: {
        Args: { _digest: string; _kind: string; _task: string }
        Returns: {
          created_at: string
          created_by: string
          detail: string
          jackboy_job_id: string | null
          job_kind: string
          last_checked_at: string | null
          payload_digest: string
          status: string
          task_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_task_handoffs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_task_handoff_record: {
        Args: {
          _actor: string
          _detail: string
          _job: string
          _status: string
          _task: string
        }
        Returns: boolean
      }
      omni_terminal_cancel_task: {
        Args: { _id: string }
        Returns: {
          agent: string
          cancelled_at: string | null
          created_at: string
          created_by: string
          id: string
          instructions: string
          kind: string
          project_label: string
          repository: string | null
          source_device: string | null
          state: string
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_terminal_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_terminal_engage_stop: {
        Args: { _reason: string }
        Returns: {
          changed_at: string
          changed_by: string | null
          emergency_stop: boolean
          id: number
          reason: string
          revision: number
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_terminal_controls"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_terminal_queue_task: {
        Args: {
          _agent: string
          _id: string
          _instructions: string
          _kind: string
          _project: string
          _repository: string
        }
        Returns: {
          agent: string
          cancelled_at: string | null
          created_at: string
          created_by: string
          id: string
          instructions: string
          kind: string
          project_label: string
          repository: string | null
          source_device: string | null
          state: string
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_terminal_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_terminal_record: {
        Args: {
          _command: string
          _outcome: string
          _session: string
          _summary: string
        }
        Returns: string
      }
      omni_terminal_release_stop: {
        Args: { _reason: string }
        Returns: {
          changed_at: string
          changed_by: string | null
          emergency_stop: boolean
          id: number
          reason: string
          revision: number
        }[]
        SetofOptions: {
          from: "*"
          to: "omni_terminal_controls"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      omni_terminal_secret_like: { Args: { _text: string }; Returns: boolean }
      owner_mfa_consume_recovery_code: {
        Args: { _hash: string; _user: string }
        Returns: string
      }
      owner_mfa_finish_recovery: {
        Args: { _hash: string; _ok: boolean; _removed: number; _user: string }
        Returns: undefined
      }
      owner_mfa_recovery_status: {
        Args: never
        Returns: {
          created_at: string
          remaining: number
        }[]
      }
      owner_mfa_set_recovery_codes: {
        Args: { _hashes: string[] }
        Returns: number
      }
      razul_add_knowledge: {
        Args: {
          _body: string
          _namespace: string
          _retrieved_at: string
          _source_kind: string
          _source_ref: string
          _title: string
        }
        Returns: string
      }
      razul_configure: {
        Args: {
          _blocked_sources: string[]
          _coverage: string[]
          _retention_days: number
          _threshold: number
        }
        Returns: undefined
      }
      razul_decide_proposal: {
        Args: {
          _acknowledge: boolean
          _action: string
          _id: string
          _stage: number
        }
        Returns: undefined
      }
      razul_delete_knowledge: { Args: { _id: string }; Returns: undefined }
      razul_dispatch_scout: {
        Args: { _scout_type: string; _sentinel_id: string; _task: string }
        Returns: string
      }
      razul_enroll_sentinel: {
        Args: {
          _hours: number
          _name: string
          _scopes: string[]
          _token_hash: string
        }
        Returns: string
      }
      razul_increment_corroboration: {
        Args: { _url: string }
        Returns: undefined
      }
      razul_pause: { Args: { _reason: string }; Returns: undefined }
      razul_propose_manifest: {
        Args: {
          _changes: Json
          _escalations: Json
          _manifest: Json
          _note: string
          _static: Json
        }
        Returns: string
      }
      razul_resume: { Args: never; Returns: undefined }
      razul_revoke_sentinel: { Args: { _id: string }; Returns: undefined }
      razul_sentinel_verify: {
        Args: { _id: string; _kind: string; _token_hash: string }
        Returns: boolean
      }
      razul_set_subscription: {
        Args: {
          _agent: string
          _categories: string[]
          _enabled: boolean
          _floor: number
        }
        Returns: undefined
      }
      razul_upsert_passport: {
        Args: {
          _architecture: string
          _documentation_url: string
          _features: string[]
          _lessons: string[]
          _pending_tasks: string[]
          _permissions: string[]
          _project: string
          _provenance: string
          _purpose: string
          _resident_agent: string
          _status: string
          _tools: string[]
          _verified_tests: string[]
        }
        Returns: string
      }
      release_owned_knowledge_lease: {
        Args: { _owner: string }
        Returns: boolean
      }
      release_owned_razul_lease: { Args: { _owner: string }; Returns: boolean }
      remove_member: { Args: { _user_id: string }; Returns: undefined }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      start_omni_agent_run: {
        Args: {
          _consent: boolean
          _id: string
          _message: string
          _project: string
        }
        Returns: {
          consent: boolean
          created_at: string
          error_message: string | null
          error_status: number | null
          finished_at: string | null
          gateway_run_id: string | null
          id: string
          input_tokens: number | null
          message: string
          model: string
          output_tokens: number | null
          owner_id: string
          project_id: string
          result: string
          status: string
          total_tokens: number | null
        }
        SetofOptions: {
          from: "*"
          to: "omni_agent_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "tester"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "tester"],
    },
  },
} as const
