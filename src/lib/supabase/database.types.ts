export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          campus_id: string | null
          church_id: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          organizer_person_id: string | null
          recurrence_rule: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["activity_status"]
          timezone: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          organizer_person_id?: string | null
          recurrence_rule?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          timezone?: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          organizer_person_id?: string | null
          recurrence_rule?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          timezone?: string
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activities_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organizer_person_id_fkey"
            columns: ["organizer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_person_id: string | null
          actor_user_id: string | null
          church_id: string | null
          correlation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          origin: string | null
          support_session_id: string | null
        }
        Insert: {
          action: string
          actor_person_id?: string | null
          actor_user_id?: string | null
          church_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          origin?: string | null
          support_session_id?: string | null
        }
        Update: {
          action?: string
          actor_person_id?: string | null
          actor_user_id?: string | null
          church_id?: string | null
          correlation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          origin?: string | null
          support_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_support_session_id_fkey"
            columns: ["support_session_id"]
            isOneToOne: false
            referencedRelation: "support_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      campuses: {
        Row: {
          address: string | null
          archived_at: string | null
          archived_by: string | null
          church_id: string
          created_at: string
          id: string
          is_primary: boolean
          name: string
          public_email: string | null
          public_phone: string | null
          slug: string
          sort_order: number
          status: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          church_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name: string
          public_email?: string | null
          public_phone?: string | null
          slug: string
          sort_order?: number
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          archived_by?: string | null
          church_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          name?: string
          public_email?: string | null
          public_phone?: string | null
          slug?: string
          sort_order?: number
          status?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campuses_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      capabilities: {
        Row: {
          description: string
          key: string
          module_key: string | null
        }
        Insert: {
          description: string
          key: string
          module_key?: string | null
        }
        Update: {
          description?: string
          key?: string
          module_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      church_entitlement_overrides: {
        Row: {
          capability: string
          church_id: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          limit_value: number | null
          reason: string
        }
        Insert: {
          capability: string
          church_id: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          limit_value?: number | null
          reason: string
        }
        Update: {
          capability?: string
          church_id?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          limit_value?: number | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_entitlement_overrides_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_feature_flags: {
        Row: {
          church_id: string
          enabled: boolean
          flag_key: string
          id: string
          updated_at: string
        }
        Insert: {
          church_id: string
          enabled: boolean
          flag_key: string
          id?: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          enabled?: boolean
          flag_key?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_feature_flags_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_feature_flags_flag_key_fkey"
            columns: ["flag_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      church_modules: {
        Row: {
          church_id: string
          created_at: string
          disabled_at: string | null
          enabled_at: string | null
          id: string
          module_key: string
          status: Database["public"]["Enums"]["church_module_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          disabled_at?: string | null
          enabled_at?: string | null
          id?: string
          module_key: string
          status?: Database["public"]["Enums"]["church_module_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          disabled_at?: string | null
          enabled_at?: string | null
          id?: string
          module_key?: string
          status?: Database["public"]["Enums"]["church_module_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_modules_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_modules_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["key"]
          },
        ]
      }
      church_people: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          church_id: string
          created_at: string
          directory_visible: boolean
          id: string
          joined_at: string
          person_id: string
          primary_campus_id: string | null
          relationship: Database["public"]["Enums"]["church_people_relationship"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          church_id: string
          created_at?: string
          directory_visible?: boolean
          id?: string
          joined_at?: string
          person_id: string
          primary_campus_id?: string | null
          relationship?: Database["public"]["Enums"]["church_people_relationship"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          church_id?: string
          created_at?: string
          directory_visible?: boolean
          id?: string
          joined_at?: string
          person_id?: string
          primary_campus_id?: string | null
          relationship?: Database["public"]["Enums"]["church_people_relationship"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_people_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_people_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_people_primary_campus_id_church_id_fkey"
            columns: ["primary_campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      church_people_roles: {
        Row: {
          church_id: string
          church_people_id: string
          created_at: string
          granted_by: string | null
          id: string
          role_key: string
          scope_id: string | null
          scope_type: string
        }
        Insert: {
          church_id: string
          church_people_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          role_key: string
          scope_id?: string | null
          scope_type?: string
        }
        Update: {
          church_id?: string
          church_people_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          role_key?: string
          scope_id?: string | null
          scope_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_people_roles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_people_roles_church_people_id_church_id_fkey"
            columns: ["church_people_id", "church_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "church_people_roles_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      churches: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          branding: Json
          created_at: string
          currency: string
          id: string
          locale: string
          name: string
          settings: Json
          slug: string
          status: Database["public"]["Enums"]["church_status"]
          subscription_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          branding?: Json
          created_at?: string
          currency?: string
          id?: string
          locale?: string
          name: string
          settings?: Json
          slug: string
          status?: Database["public"]["Enums"]["church_status"]
          subscription_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          branding?: Json
          created_at?: string
          currency?: string
          id?: string
          locale?: string
          name?: string
          settings?: Json
          slug?: string
          status?: Database["public"]["Enums"]["church_status"]
          subscription_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_field_definitions: {
        Row: {
          archived_at: string | null
          church_id: string
          created_at: string
          entity_type: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id: string
          is_sensitive: boolean
          min_visibility: string
          name: string
          options: Json | null
          sort_order: number
        }
        Insert: {
          archived_at?: string | null
          church_id: string
          created_at?: string
          entity_type: string
          field_type: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_sensitive?: boolean
          min_visibility?: string
          name: string
          options?: Json | null
          sort_order?: number
        }
        Update: {
          archived_at?: string | null
          church_id?: string
          created_at?: string
          entity_type?: string
          field_type?: Database["public"]["Enums"]["custom_field_type"]
          id?: string
          is_sensitive?: boolean
          min_visibility?: string
          name?: string
          options?: Json | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          church_id: string
          created_at: string
          entity_id: string
          entity_type: string
          field_definition_id: string
          id: string
          updated_at: string
          value: Json
        }
        Insert: {
          church_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          field_definition_id: string
          id?: string
          updated_at?: string
          value: Json
        }
        Update: {
          church_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          field_definition_id?: string
          id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_field_definition_id_church_id_fkey"
            columns: ["field_definition_id", "church_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          actor_person_id: string | null
          attempts: number
          church_id: string
          correlation_id: string | null
          created_at: string
          entity_type: string
          expires_at: string | null
          filters: Json
          finished_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          result_file_id: string | null
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          actor_person_id?: string | null
          attempts?: number
          church_id: string
          correlation_id?: string | null
          created_at?: string
          entity_type: string
          expires_at?: string | null
          filters?: Json
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          result_file_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          actor_person_id?: string | null
          attempts?: number
          church_id?: string
          correlation_id?: string | null
          created_at?: string
          entity_type?: string
          expires_at?: string | null
          filters?: Json
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          result_file_id?: string | null
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          default_enabled: boolean
          description: string
          key: string
          owner: string | null
          retirement_planned_at: string | null
        }
        Insert: {
          created_at?: string
          default_enabled?: boolean
          description: string
          key: string
          owner?: string | null
          retirement_planned_at?: string | null
        }
        Update: {
          created_at?: string
          default_enabled?: boolean
          description?: string
          key?: string
          owner?: string | null
          retirement_planned_at?: string | null
        }
        Relationships: []
      }
      files: {
        Row: {
          bucket: string
          checksum: string | null
          church_id: string
          classification: Database["public"]["Enums"]["file_classification"]
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          mime_type: string | null
          object_path: string
          owner_person_id: string | null
          retention_until: string | null
          size_bytes: number | null
          status: string
        }
        Insert: {
          bucket: string
          checksum?: string | null
          church_id: string
          classification?: Database["public"]["Enums"]["file_classification"]
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          object_path: string
          owner_person_id?: string | null
          retention_until?: string | null
          size_bytes?: number | null
          status?: string
        }
        Update: {
          bucket?: string
          checksum?: string | null
          church_id?: string
          classification?: Database["public"]["Enums"]["file_classification"]
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          mime_type?: string | null
          object_path?: string
          owner_person_id?: string | null
          retention_until?: string | null
          size_bytes?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          church_id: string
          created_at: string
          household_id: string
          id: string
          is_primary_contact: boolean
          person_id: string
          relationship_type: string
        }
        Insert: {
          church_id: string
          created_at?: string
          household_id: string
          id?: string
          is_primary_contact?: boolean
          person_id: string
          relationship_type: string
        }
        Update: {
          church_id?: string
          created_at?: string
          household_id?: string
          id?: string
          is_primary_contact?: boolean
          person_id?: string
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_household_id_church_id_fkey"
            columns: ["household_id", "church_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "household_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          church_id: string
          created_at: string
          id: string
          name: string
          primary_address: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          church_id: string
          created_at?: string
          id?: string
          name: string
          primary_address?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          church_id?: string
          created_at?: string
          id?: string
          name?: string
          primary_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "households_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          actor_person_id: string | null
          attempts: number
          church_id: string
          correlation_id: string | null
          created_at: string
          entity_type: string
          errors: Json
          finished_at: string | null
          id: string
          idempotency_key: string | null
          last_error: string | null
          mapping: Json
          progress: Json
          scheduled_at: string
          source_file_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          actor_person_id?: string | null
          attempts?: number
          church_id: string
          correlation_id?: string | null
          created_at?: string
          entity_type: string
          errors?: Json
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          mapping?: Json
          progress?: Json
          scheduled_at?: string
          source_file_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          actor_person_id?: string | null
          attempts?: number
          church_id?: string
          correlation_id?: string | null
          created_at?: string
          entity_type?: string
          errors?: Json
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          mapping?: Json
          progress?: Json
          scheduled_at?: string
          source_file_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          description: string | null
          is_active: boolean
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          is_active?: boolean
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          is_active?: boolean
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      people: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          avatar_file_id: string | null
          birth_date: string | null
          created_at: string
          directory_visible: boolean
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          locale: string | null
          notes: string | null
          phone: string | null
          preferred_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_file_id?: string | null
          birth_date?: string | null
          created_at?: string
          directory_visible?: boolean
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          locale?: string | null
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          avatar_file_id?: string | null
          birth_date?: string | null
          created_at?: string
          directory_visible?: boolean
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          locale?: string | null
          notes?: string | null
          phone?: string | null
          preferred_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_avatar_file_fk"
            columns: ["avatar_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      person_tags: {
        Row: {
          church_id: string
          created_at: string
          id: string
          person_id: string
          tag_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          person_id: string
          tag_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          person_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_tags_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_tags_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_tags_tag_id_church_id_fkey"
            columns: ["tag_id", "church_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          capability: string
          created_at: string
          id: string
          limit_value: number | null
          plan_key: string
        }
        Insert: {
          capability: string
          created_at?: string
          id?: string
          limit_value?: number | null
          plan_key: string
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          limit_value?: number | null
          plan_key?: string
        }
        Relationships: []
      }
      role_capabilities: {
        Row: {
          capability_key: string
          role_key: string
        }
        Insert: {
          capability_key: string
          role_key: string
        }
        Update: {
          capability_key?: string
          role_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_capabilities_capability_key_fkey"
            columns: ["capability_key"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_capabilities_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      roles: {
        Row: {
          description: string | null
          is_system: boolean
          key: string
          name: string
        }
        Insert: {
          description?: string | null
          is_system?: boolean
          key: string
          name: string
        }
        Update: {
          description?: string | null
          is_system?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      support_sessions: {
        Row: {
          capabilities: string[]
          church_id: string
          created_at: string
          expires_at: string
          id: string
          operator_user_id: string
          reason: string
          revoked_at: string | null
          started_at: string
        }
        Insert: {
          capabilities?: string[]
          church_id: string
          created_at?: string
          expires_at?: string
          id?: string
          operator_user_id: string
          reason: string
          revoked_at?: string | null
          started_at?: string
        }
        Update: {
          capabilities?: string[]
          church_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          operator_user_id?: string
          reason?: string
          revoked_at?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          archived_at: string | null
          church_id: string
          color: string | null
          created_at: string
          id: string
          name: string
        }
        Insert: {
          archived_at?: string | null
          church_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          archived_at?: string | null
          church_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints_outbound: {
        Row: {
          church_id: string
          consecutive_failures: number
          created_at: string
          events: string[]
          id: string
          is_active: boolean
          secret_ref: string
          updated_at: string
          url: string
        }
        Insert: {
          church_id: string
          consecutive_failures?: number
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          secret_ref: string
          updated_at?: string
          url: string
        }
        Update: {
          church_id?: string
          consecutive_failures?: number
          created_at?: string
          events?: string[]
          id?: string
          is_active?: boolean
          secret_ref?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_outbound_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events_inbound: {
        Row: {
          attempts: number
          church_id: string | null
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          received_at: string
          signature_verified: boolean
          status: Database["public"]["Enums"]["job_status"]
        }
        Insert: {
          attempts?: number
          church_id?: string | null
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          provider: string
          provider_event_id: string
          received_at?: string
          signature_verified?: boolean
          status?: Database["public"]["Enums"]["job_status"]
        }
        Update: {
          attempts?: number
          church_id?: string | null
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
          signature_verified?: boolean
          status?: Database["public"]["Enums"]["job_status"]
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_inbound_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_capability: {
        Args: {
          p_capability: string
          p_church_id: string
          p_scope_id?: string
          p_scope_type?: string
        }
        Returns: boolean
      }
      module_enabled: {
        Args: { p_church_id: string; p_module_key: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_status:
        | "draft"
        | "published"
        | "cancelled"
        | "completed"
        | "archived"
      activity_type:
        | "service"
        | "meeting"
        | "event"
        | "course_session"
        | "group_meeting"
        | "rehearsal"
        | "task"
        | "shift"
      church_module_status: "enabled" | "disabled" | "trial" | "suspended"
      church_people_relationship:
        | "visitor"
        | "connected"
        | "member"
        | "server"
        | "leader"
        | "external"
        | "inactive"
      church_status:
        | "provisioning"
        | "trial"
        | "active"
        | "past_due"
        | "suspended"
        | "cancelling"
        | "archived"
      custom_field_type:
        | "text"
        | "number"
        | "date"
        | "boolean"
        | "select"
        | "multi_select"
      file_classification: "public" | "internal" | "personal" | "restricted"
      job_status: "queued" | "processing" | "succeeded" | "failed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_status: [
        "draft",
        "published",
        "cancelled",
        "completed",
        "archived",
      ],
      activity_type: [
        "service",
        "meeting",
        "event",
        "course_session",
        "group_meeting",
        "rehearsal",
        "task",
        "shift",
      ],
      church_module_status: ["enabled", "disabled", "trial", "suspended"],
      church_people_relationship: [
        "visitor",
        "connected",
        "member",
        "server",
        "leader",
        "external",
        "inactive",
      ],
      church_status: [
        "provisioning",
        "trial",
        "active",
        "past_due",
        "suspended",
        "cancelling",
        "archived",
      ],
      custom_field_type: [
        "text",
        "number",
        "date",
        "boolean",
        "select",
        "multi_select",
      ],
      file_classification: ["public", "internal", "personal", "restricted"],
      job_status: ["queued", "processing", "succeeded", "failed"],
    },
  },
} as const

