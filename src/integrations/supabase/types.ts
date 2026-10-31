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
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token_hash?: string
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
      list_invitations: {
        Args: never
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string
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
      razul_configure: {
        Args: {
          _blocked_sources: string[]
          _coverage: string[]
          _retention_days: number
          _threshold: number
        }
        Returns: undefined
      }
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
      razul_resume: { Args: never; Returns: undefined }
      razul_revoke_sentinel: { Args: { _id: string }; Returns: undefined }
      razul_sentinel_verify: {
        Args: { _id: string; _kind: string; _token_hash: string }
        Returns: boolean
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
