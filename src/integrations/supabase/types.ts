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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
