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
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          church_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          creation_request_id: string | null
          description: string | null
          duplicated_from_activity_id: string | null
          ends_at: string | null
          id: string
          location_text: string | null
          occurrence_date: string | null
          organizer_person_id: string | null
          published_at: string | null
          published_by: string | null
          recurrence_rule: string | null
          schedule_kind: Database["public"]["Enums"]["activity_schedule_kind"]
          series_id: string | null
          series_modified: boolean
          series_structure_modified: boolean
          starts_at: string | null
          status: Database["public"]["Enums"]["activity_status"]
          status_before_archive:
            Database["public"]["Enums"]["activity_status"] | null
          template_id: string | null
          timezone: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          creation_request_id?: string | null
          description?: string | null
          duplicated_from_activity_id?: string | null
          ends_at?: string | null
          id?: string
          location_text?: string | null
          occurrence_date?: string | null
          organizer_person_id?: string | null
          published_at?: string | null
          published_by?: string | null
          recurrence_rule?: string | null
          schedule_kind?: Database["public"]["Enums"]["activity_schedule_kind"]
          series_id?: string | null
          series_modified?: boolean
          series_structure_modified?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          status_before_archive?:
            Database["public"]["Enums"]["activity_status"] | null
          template_id?: string | null
          timezone: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          creation_request_id?: string | null
          description?: string | null
          duplicated_from_activity_id?: string | null
          ends_at?: string | null
          id?: string
          location_text?: string | null
          occurrence_date?: string | null
          organizer_person_id?: string | null
          published_at?: string | null
          published_by?: string | null
          recurrence_rule?: string | null
          schedule_kind?: Database["public"]["Enums"]["activity_schedule_kind"]
          series_id?: string | null
          series_modified?: boolean
          series_structure_modified?: boolean
          starts_at?: string | null
          status?: Database["public"]["Enums"]["activity_status"]
          status_before_archive?:
            Database["public"]["Enums"]["activity_status"] | null
          template_id?: string | null
          timezone?: string
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["activity_visibility"]
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
            foreignKeyName: "activities_duplicated_from_fkey"
            columns: ["duplicated_from_activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activities_organizer_membership_fkey"
            columns: ["church_id", "organizer_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "activities_organizer_person_id_fkey"
            columns: ["organizer_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_series_fkey"
            columns: ["series_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_series"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activities_template_fkey"
            columns: ["template_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_templates"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_admin_notes: {
        Row: {
          activity_id: string
          church_id: string
          created_at: string
          notes: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_id: string
          church_id: string
          created_at?: string
          notes: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_id?: string
          church_id?: string
          created_at?: string
          notes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_admin_notes_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_admin_notes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_assignment_notes: {
        Row: {
          assignment_id: string
          church_id: string
          note: string
          person_id: string
          updated_at: string
        }
        Insert: {
          assignment_id: string
          church_id: string
          note: string
          person_id: string
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          church_id?: string
          note?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_assignment_notes_assignment_id_church_id_fkey"
            columns: ["assignment_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_assignments"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_assignment_notes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_assignments: {
        Row: {
          acknowledged_warnings: string[]
          activity_id: string
          activity_position_id: string | null
          cancel_cause: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          church_id: string
          confirmed_ends_at: string | null
          confirmed_starts_at: string | null
          created_at: string
          created_by: string | null
          eligibility_blocking: string[]
          eligibility_checked_at: string
          eligibility_warnings: string[]
          id: string
          person_id: string
          position_name: string
          reconfirmation_requested_at: string | null
          responded_at: string | null
          responded_by: string | null
          response_source:
            | Database["public"]["Enums"]["activity_assignment_response_source"]
            | null
          sent_at: string | null
          sent_by: string | null
          service_area_id: string | null
          status: Database["public"]["Enums"]["activity_assignment_status"]
          substituted_at: string | null
          substitutes_assignment_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          acknowledged_warnings?: string[]
          activity_id: string
          activity_position_id?: string | null
          cancel_cause?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id: string
          confirmed_ends_at?: string | null
          confirmed_starts_at?: string | null
          created_at?: string
          created_by?: string | null
          eligibility_blocking?: string[]
          eligibility_checked_at?: string
          eligibility_warnings?: string[]
          id?: string
          person_id: string
          position_name: string
          reconfirmation_requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_source?:
            | Database["public"]["Enums"]["activity_assignment_response_source"]
            | null
          sent_at?: string | null
          sent_by?: string | null
          service_area_id?: string | null
          status?: Database["public"]["Enums"]["activity_assignment_status"]
          substituted_at?: string | null
          substitutes_assignment_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          acknowledged_warnings?: string[]
          activity_id?: string
          activity_position_id?: string | null
          cancel_cause?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id?: string
          confirmed_ends_at?: string | null
          confirmed_starts_at?: string | null
          created_at?: string
          created_by?: string | null
          eligibility_blocking?: string[]
          eligibility_checked_at?: string
          eligibility_warnings?: string[]
          id?: string
          person_id?: string
          position_name?: string
          reconfirmation_requested_at?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_source?:
            | Database["public"]["Enums"]["activity_assignment_response_source"]
            | null
          sent_at?: string | null
          sent_by?: string | null
          service_area_id?: string | null
          status?: Database["public"]["Enums"]["activity_assignment_status"]
          substituted_at?: string | null
          substitutes_assignment_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_assignments_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_assignments_activity_position_id_church_id_fkey"
            columns: ["activity_position_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_positions"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_assignments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_assignments_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "activity_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_assignments_substitutes_fkey"
            columns: ["substitutes_assignment_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_assignments"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_plan_items: {
        Row: {
          activity_id: string
          church_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          item_type: Database["public"]["Enums"]["activity_plan_item_type"]
          notes: string | null
          responsible_person_id: string | null
          responsible_text: string | null
          sort_order: number
          start_offset_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          church_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          item_type?: Database["public"]["Enums"]["activity_plan_item_type"]
          notes?: string | null
          responsible_person_id?: string | null
          responsible_text?: string | null
          sort_order: number
          start_offset_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          church_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          item_type?: Database["public"]["Enums"]["activity_plan_item_type"]
          notes?: string | null
          responsible_person_id?: string | null
          responsible_text?: string | null
          sort_order?: number
          start_offset_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_plan_items_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_plan_items_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_plan_items_church_id_responsible_person_id_fkey"
            columns: ["church_id", "responsible_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "activity_plan_items_responsible_person_id_fkey"
            columns: ["responsible_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_position_requirements: {
        Row: {
          activity_id: string
          activity_position_id: string
          catalog_snapshot: Json | null
          church_id: string
          created_at: string
          created_by: string | null
          credential_type_id: string | null
          disabled: boolean
          id: string
          min_level: Database["public"]["Enums"]["qualification_level"] | null
          min_operational_level:
            Database["public"]["Enums"]["service_operational_level"] | null
          origin: Database["public"]["Enums"]["activity_requirement_origin"]
          qualification_id: string | null
          requirement_type: Database["public"]["Enums"]["position_requirement_type"]
          requires_current_validity: boolean
          source_requirement_id: string | null
          strictness: Database["public"]["Enums"]["position_requirement_strictness"]
          updated_at: string
        }
        Insert: {
          activity_id: string
          activity_position_id: string
          catalog_snapshot?: Json | null
          church_id: string
          created_at?: string
          created_by?: string | null
          credential_type_id?: string | null
          disabled?: boolean
          id?: string
          min_level?: Database["public"]["Enums"]["qualification_level"] | null
          min_operational_level?:
            Database["public"]["Enums"]["service_operational_level"] | null
          origin: Database["public"]["Enums"]["activity_requirement_origin"]
          qualification_id?: string | null
          requirement_type: Database["public"]["Enums"]["position_requirement_type"]
          requires_current_validity?: boolean
          source_requirement_id?: string | null
          strictness?: Database["public"]["Enums"]["position_requirement_strictness"]
          updated_at?: string
        }
        Update: {
          activity_id?: string
          activity_position_id?: string
          catalog_snapshot?: Json | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          credential_type_id?: string | null
          disabled?: boolean
          id?: string
          min_level?: Database["public"]["Enums"]["qualification_level"] | null
          min_operational_level?:
            Database["public"]["Enums"]["service_operational_level"] | null
          origin?: Database["public"]["Enums"]["activity_requirement_origin"]
          qualification_id?: string | null
          requirement_type?: Database["public"]["Enums"]["position_requirement_type"]
          requires_current_validity?: boolean
          source_requirement_id?: string | null
          strictness?: Database["public"]["Enums"]["position_requirement_strictness"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_position_requirement_activity_position_id_church__fkey"
            columns: ["activity_position_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_positions"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_position_requirement_credential_type_id_church_id_fkey"
            columns: ["credential_type_id", "church_id"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_position_requirements_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_position_requirements_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_position_requirements_qualification_id_church_id_fkey"
            columns: ["qualification_id", "church_id"]
            isOneToOne: false
            referencedRelation: "qualifications"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_position_requirements_source_requirement_id_fkey"
            columns: ["source_requirement_id"]
            isOneToOne: false
            referencedRelation: "position_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_positions: {
        Row: {
          activity_id: string
          activity_service_area_id: string
          catalog_snapshot: Json | null
          church_id: string
          created_at: string
          created_by: string | null
          critical: boolean
          description: string | null
          id: string
          max_people: number | null
          min_people: number
          name: string
          notes: string | null
          requires_autonomous_person: boolean
          service_area_id: string | null
          service_position_id: string | null
          snapshot_taken_at: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          activity_id: string
          activity_service_area_id: string
          catalog_snapshot?: Json | null
          church_id: string
          created_at?: string
          created_by?: string | null
          critical?: boolean
          description?: string | null
          id?: string
          max_people?: number | null
          min_people?: number
          name: string
          notes?: string | null
          requires_autonomous_person?: boolean
          service_area_id?: string | null
          service_position_id?: string | null
          snapshot_taken_at?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          activity_id?: string
          activity_service_area_id?: string
          catalog_snapshot?: Json | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          critical?: boolean
          description?: string | null
          id?: string
          max_people?: number | null
          min_people?: number
          name?: string
          notes?: string | null
          requires_autonomous_person?: boolean
          service_area_id?: string | null
          service_position_id?: string | null
          snapshot_taken_at?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_positions_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_positions_activity_service_area_id_church_id_fkey"
            columns: ["activity_service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_service_areas"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_positions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_positions_service_position_id_church_id_fkey"
            columns: ["service_position_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_positions"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_series: {
        Row: {
          archived_at: string | null
          church_id: string
          created_at: string
          created_by: string | null
          creation_request_id: string | null
          duration_minutes: number
          frequency: Database["public"]["Enums"]["activity_recurrence_frequency"]
          id: string
          interval_count: number
          local_start_time: string
          month_day: number | null
          month_day_fallback: string
          month_weekday: number | null
          monthly_mode:
            Database["public"]["Enums"]["activity_monthly_mode"] | null
          occurrence_count: number | null
          rrule: string | null
          split_from_series_id: string | null
          starts_on: string
          timezone: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          until_date: string | null
          updated_at: string
          week_of_month: number | null
          weekdays: number[] | null
        }
        Insert: {
          archived_at?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          creation_request_id?: string | null
          duration_minutes: number
          frequency: Database["public"]["Enums"]["activity_recurrence_frequency"]
          id?: string
          interval_count?: number
          local_start_time: string
          month_day?: number | null
          month_day_fallback?: string
          month_weekday?: number | null
          monthly_mode?:
            Database["public"]["Enums"]["activity_monthly_mode"] | null
          occurrence_count?: number | null
          rrule?: string | null
          split_from_series_id?: string | null
          starts_on: string
          timezone: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          until_date?: string | null
          updated_at?: string
          week_of_month?: number | null
          weekdays?: number[] | null
        }
        Update: {
          archived_at?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          creation_request_id?: string | null
          duration_minutes?: number
          frequency?: Database["public"]["Enums"]["activity_recurrence_frequency"]
          id?: string
          interval_count?: number
          local_start_time?: string
          month_day?: number | null
          month_day_fallback?: string
          month_weekday?: number | null
          monthly_mode?:
            Database["public"]["Enums"]["activity_monthly_mode"] | null
          occurrence_count?: number | null
          rrule?: string | null
          split_from_series_id?: string | null
          starts_on?: string
          timezone?: string
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          until_date?: string | null
          updated_at?: string
          week_of_month?: number | null
          weekdays?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_series_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_series_split_from_fkey"
            columns: ["split_from_series_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_series"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_service_areas: {
        Row: {
          activity_id: string
          area_campus_id: string | null
          area_name: string
          church_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          requirement: Database["public"]["Enums"]["activity_area_requirement"]
          service_area_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          activity_id: string
          area_campus_id?: string | null
          area_name: string
          church_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          requirement?: Database["public"]["Enums"]["activity_area_requirement"]
          service_area_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          activity_id?: string
          area_campus_id?: string | null
          area_name?: string
          church_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          requirement?: Database["public"]["Enums"]["activity_area_requirement"]
          service_area_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_service_areas_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_service_areas_area_campus_id_church_id_fkey"
            columns: ["area_campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_service_areas_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_service_areas_service_area_id_church_id_fkey"
            columns: ["service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_substitution_requests: {
        Row: {
          activity_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          candidate_assignment_id: string | null
          church_id: string
          completed_at: string | null
          id: string
          original_assignment_id: string
          requested_at: string
          requested_by: string | null
          requested_by_self: boolean
          status: Database["public"]["Enums"]["activity_substitution_status"]
          updated_at: string
        }
        Insert: {
          activity_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          candidate_assignment_id?: string | null
          church_id: string
          completed_at?: string | null
          id?: string
          original_assignment_id: string
          requested_at?: string
          requested_by?: string | null
          requested_by_self: boolean
          status?: Database["public"]["Enums"]["activity_substitution_status"]
          updated_at?: string
        }
        Update: {
          activity_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          candidate_assignment_id?: string | null
          church_id?: string
          completed_at?: string | null
          id?: string
          original_assignment_id?: string
          requested_at?: string
          requested_by?: string | null
          requested_by_self?: boolean
          status?: Database["public"]["Enums"]["activity_substitution_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_substitution_requests_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_substitution_requests_candidate_fkey"
            columns: ["candidate_assignment_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_assignments"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_substitution_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_substitution_requests_original_fkey"
            columns: ["original_assignment_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_assignments"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_template_areas: {
        Row: {
          church_id: string
          created_at: string
          id: string
          notes: string | null
          requirement: Database["public"]["Enums"]["activity_area_requirement"]
          service_area_id: string
          sort_order: number
          template_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          notes?: string | null
          requirement?: Database["public"]["Enums"]["activity_area_requirement"]
          service_area_id: string
          sort_order?: number
          template_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          requirement?: Database["public"]["Enums"]["activity_area_requirement"]
          service_area_id?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_template_areas_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_template_areas_service_area_id_church_id_fkey"
            columns: ["service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_template_areas_template_id_church_id_fkey"
            columns: ["template_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_templates"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_template_plan_items: {
        Row: {
          church_id: string
          created_at: string
          duration_minutes: number | null
          id: string
          item_type: Database["public"]["Enums"]["activity_plan_item_type"]
          notes: string | null
          responsible_text: string | null
          sort_order: number
          start_offset_minutes: number | null
          template_id: string
          title: string
        }
        Insert: {
          church_id: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          item_type?: Database["public"]["Enums"]["activity_plan_item_type"]
          notes?: string | null
          responsible_text?: string | null
          sort_order: number
          start_offset_minutes?: number | null
          template_id: string
          title: string
        }
        Update: {
          church_id?: string
          created_at?: string
          duration_minutes?: number | null
          id?: string
          item_type?: Database["public"]["Enums"]["activity_plan_item_type"]
          notes?: string | null
          responsible_text?: string | null
          sort_order?: number
          start_offset_minutes?: number | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_template_plan_items_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_template_plan_items_template_id_church_id_fkey"
            columns: ["template_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_templates"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_template_positions: {
        Row: {
          church_id: string
          created_at: string
          critical: boolean
          description: string | null
          id: string
          max_people: number | null
          min_people: number
          name: string
          requires_autonomous_person: boolean
          service_position_id: string | null
          sort_order: number
          template_area_id: string
          template_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          critical?: boolean
          description?: string | null
          id?: string
          max_people?: number | null
          min_people?: number
          name: string
          requires_autonomous_person?: boolean
          service_position_id?: string | null
          sort_order?: number
          template_area_id: string
          template_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          critical?: boolean
          description?: string | null
          id?: string
          max_people?: number | null
          min_people?: number
          name?: string
          requires_autonomous_person?: boolean
          service_position_id?: string | null
          sort_order?: number
          template_area_id?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_template_positions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_template_positions_service_position_id_church_id_fkey"
            columns: ["service_position_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_positions"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_template_positions_template_area_id_church_id_fkey"
            columns: ["template_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_template_areas"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_template_positions_template_id_church_id_fkey"
            columns: ["template_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activity_templates"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      activity_templates: {
        Row: {
          active: boolean
          archived_at: string | null
          archived_by: string | null
          campus_id: string | null
          church_id: string
          created_at: string
          created_by: string | null
          default_duration_minutes: number | null
          default_local_start_time: string | null
          default_title: string | null
          description: string | null
          id: string
          location_text: string | null
          name: string
          notes: string | null
          schedule_kind: Database["public"]["Enums"]["activity_schedule_kind"]
          sort_order: number
          type: Database["public"]["Enums"]["activity_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["activity_visibility"]
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          default_duration_minutes?: number | null
          default_local_start_time?: string | null
          default_title?: string | null
          description?: string | null
          id?: string
          location_text?: string | null
          name: string
          notes?: string | null
          schedule_kind?: Database["public"]["Enums"]["activity_schedule_kind"]
          sort_order?: number
          type: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          default_duration_minutes?: number | null
          default_local_start_time?: string | null
          default_title?: string | null
          description?: string | null
          id?: string
          location_text?: string | null
          name?: string
          notes?: string | null
          schedule_kind?: Database["public"]["Enums"]["activity_schedule_kind"]
          sort_order?: number
          type?: Database["public"]["Enums"]["activity_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["activity_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "activity_templates_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "activity_templates_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
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
      church_onboarding: {
        Row: {
          church_id: string
          completed_at: string | null
          completed_steps: Database["public"]["Enums"]["church_onboarding_step"][]
          created_at: string
          current_step: Database["public"]["Enums"]["church_onboarding_step"]
          dismissed_at: string | null
          id: string
          metadata: Json
          started_at: string
          updated_at: string
          version: number
        }
        Insert: {
          church_id: string
          completed_at?: string | null
          completed_steps?: Database["public"]["Enums"]["church_onboarding_step"][]
          created_at?: string
          current_step?: Database["public"]["Enums"]["church_onboarding_step"]
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          updated_at?: string
          version?: number
        }
        Update: {
          church_id?: string
          completed_at?: string | null
          completed_steps?: Database["public"]["Enums"]["church_onboarding_step"][]
          created_at?: string
          current_step?: Database["public"]["Enums"]["church_onboarding_step"]
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          started_at?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "church_onboarding_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
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
          source: Database["public"]["Enums"]["person_source"]
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
          source?: Database["public"]["Enums"]["person_source"]
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
          source?: Database["public"]["Enums"]["person_source"]
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
        Relationships: [
          {
            foreignKeyName: "churches_subscription_id_fk"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      credential_types: {
        Row: {
          active: boolean
          archived_at: string | null
          church_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          requires_expiry: boolean
          sensitive: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          church_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          requires_expiry?: boolean
          sensitive?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          church_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          requires_expiry?: boolean
          sensitive?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credential_types_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
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
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_person_id: string | null
          church_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          person_id: string | null
          revoked_at: string | null
          role_key: string
          status: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_person_id?: string | null
          church_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          person_id?: string | null
          revoked_at?: string | null
          role_key: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_person_id?: string | null
          church_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          person_id?: string | null
          revoked_at?: string | null
          role_key?: string
          status?: Database["public"]["Enums"]["invitation_status"]
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_person_id_fk"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
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
          email_normalized: string | null
          first_name: string
          id: string
          last_name: string | null
          locale: string | null
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          preferred_name: string | null
          source: Database["public"]["Enums"]["person_source"]
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
          email_normalized?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          locale?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          preferred_name?: string | null
          source?: Database["public"]["Enums"]["person_source"]
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
          email_normalized?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          locale?: string | null
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          preferred_name?: string | null
          source?: Database["public"]["Enums"]["person_source"]
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
      person_credentials: {
        Row: {
          church_id: string
          created_at: string
          credential_type_id: string
          expires_at: string | null
          id: string
          issued_at: string | null
          person_id: string
          reference: string | null
          status: Database["public"]["Enums"]["credential_status"]
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          church_id: string
          created_at?: string
          credential_type_id: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          person_id: string
          reference?: string | null
          status?: Database["public"]["Enums"]["credential_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          church_id?: string
          created_at?: string
          credential_type_id?: string
          expires_at?: string | null
          id?: string
          issued_at?: string | null
          person_id?: string
          reference?: string | null
          status?: Database["public"]["Enums"]["credential_status"]
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_credentials_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_credentials_credential_type_id_church_id_fkey"
            columns: ["credential_type_id", "church_id"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "person_credentials_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_qualifications: {
        Row: {
          church_id: string
          created_at: string
          expires_at: string | null
          id: string
          level: Database["public"]["Enums"]["qualification_level"]
          notes: string | null
          person_id: string
          qualification_id: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          church_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          level?: Database["public"]["Enums"]["qualification_level"]
          notes?: string | null
          person_id: string
          qualification_id: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          church_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          level?: Database["public"]["Enums"]["qualification_level"]
          notes?: string | null
          person_id?: string
          qualification_id?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_qualifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_qualifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_qualifications_qualification_id_church_id_fkey"
            columns: ["qualification_id", "church_id"]
            isOneToOne: false
            referencedRelation: "qualifications"
            referencedColumns: ["id", "church_id"]
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
      platform_operators: {
        Row: {
          created_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      position_requirements: {
        Row: {
          church_id: string
          created_at: string
          credential_type_id: string | null
          id: string
          min_level: Database["public"]["Enums"]["qualification_level"] | null
          min_operational_level:
            | Database["public"]["Enums"]["service_operational_level"]
            | null
          qualification_id: string | null
          requirement_type: Database["public"]["Enums"]["position_requirement_type"]
          requires_current_validity: boolean
          service_position_id: string
          strictness: Database["public"]["Enums"]["position_requirement_strictness"]
        }
        Insert: {
          church_id: string
          created_at?: string
          credential_type_id?: string | null
          id?: string
          min_level?: Database["public"]["Enums"]["qualification_level"] | null
          min_operational_level?:
            | Database["public"]["Enums"]["service_operational_level"]
            | null
          qualification_id?: string | null
          requirement_type: Database["public"]["Enums"]["position_requirement_type"]
          requires_current_validity?: boolean
          service_position_id: string
          strictness?: Database["public"]["Enums"]["position_requirement_strictness"]
        }
        Update: {
          church_id?: string
          created_at?: string
          credential_type_id?: string | null
          id?: string
          min_level?: Database["public"]["Enums"]["qualification_level"] | null
          min_operational_level?:
            | Database["public"]["Enums"]["service_operational_level"]
            | null
          qualification_id?: string | null
          requirement_type?: Database["public"]["Enums"]["position_requirement_type"]
          requires_current_validity?: boolean
          service_position_id?: string
          strictness?: Database["public"]["Enums"]["position_requirement_strictness"]
        }
        Relationships: [
          {
            foreignKeyName: "position_requirements_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_requirements_credential_type_id_church_id_fkey"
            columns: ["credential_type_id", "church_id"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "position_requirements_qualification_id_church_id_fkey"
            columns: ["qualification_id", "church_id"]
            isOneToOne: false
            referencedRelation: "qualifications"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "position_requirements_service_position_id_church_id_fkey"
            columns: ["service_position_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_positions"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      qualifications: {
        Row: {
          active: boolean
          archived_at: string | null
          category: string | null
          church_id: string
          created_at: string
          description: string | null
          expiry_required: boolean
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          category?: string | null
          church_id: string
          created_at?: string
          description?: string | null
          expiry_required?: boolean
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          category?: string | null
          church_id?: string
          created_at?: string
          description?: string | null
          expiry_required?: boolean
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_slugs: {
        Row: {
          slug: string
        }
        Insert: {
          slug: string
        }
        Update: {
          slug?: string
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
      service_area_leaders: {
        Row: {
          campus_id: string | null
          church_id: string
          created_at: string
          ends_at: string | null
          id: string
          is_primary: boolean
          person_id: string
          service_area_id: string
          starts_at: string
        }
        Insert: {
          campus_id?: string | null
          church_id: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_primary?: boolean
          person_id: string
          service_area_id: string
          starts_at?: string
        }
        Update: {
          campus_id?: string | null
          church_id?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_primary?: boolean
          person_id?: string
          service_area_id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_area_leaders_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "service_area_leaders_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_area_leaders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_area_leaders_service_area_id_church_id_fkey"
            columns: ["service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      service_area_members: {
        Row: {
          church_id: string
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          level: Database["public"]["Enums"]["service_operational_level"]
          notes: string | null
          person_id: string
          service_area_id: string
          status: Database["public"]["Enums"]["service_area_member_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          level?: Database["public"]["Enums"]["service_operational_level"]
          notes?: string | null
          person_id: string
          service_area_id: string
          status?: Database["public"]["Enums"]["service_area_member_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          level?: Database["public"]["Enums"]["service_operational_level"]
          notes?: string | null
          person_id?: string
          service_area_id?: string
          status?: Database["public"]["Enums"]["service_area_member_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_area_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_area_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_area_members_service_area_id_church_id_fkey"
            columns: ["service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      service_area_templates: {
        Row: {
          description: string | null
          icon: string | null
          key: string
          name: string
          sort_order: number
        }
        Insert: {
          description?: string | null
          icon?: string | null
          key: string
          name: string
          sort_order?: number
        }
        Update: {
          description?: string | null
          icon?: string | null
          key?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      service_areas: {
        Row: {
          accent_color: string | null
          active: boolean
          archived_at: string | null
          archived_by: string | null
          campus_id: string | null
          church_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_areas_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "service_areas_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      service_positions: {
        Row: {
          active: boolean
          archived_at: string | null
          archived_by: string | null
          campus_id: string | null
          church_id: string
          created_at: string
          critical: boolean
          description: string | null
          id: string
          max_people: number | null
          min_people: number
          name: string
          requires_autonomous_person: boolean
          service_area_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id: string
          created_at?: string
          critical?: boolean
          description?: string | null
          id?: string
          max_people?: number | null
          min_people?: number
          name: string
          requires_autonomous_person?: boolean
          service_area_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id?: string
          created_at?: string
          critical?: boolean
          description?: string | null
          id?: string
          max_people?: number | null
          min_people?: number
          name?: string
          requires_autonomous_person?: boolean
          service_area_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_positions_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "service_positions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_positions_service_area_id_church_id_fkey"
            columns: ["service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      service_team_members: {
        Row: {
          church_id: string
          created_at: string
          id: string
          is_leader: boolean
          joined_at: string
          left_at: string | null
          person_id: string
          service_team_id: string
          sort_order: number
          status: Database["public"]["Enums"]["service_area_member_status"]
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          is_leader?: boolean
          joined_at?: string
          left_at?: string | null
          person_id: string
          service_team_id: string
          sort_order?: number
          status?: Database["public"]["Enums"]["service_area_member_status"]
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          is_leader?: boolean
          joined_at?: string
          left_at?: string | null
          person_id?: string
          service_team_id?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["service_area_member_status"]
        }
        Relationships: [
          {
            foreignKeyName: "service_team_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_team_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_team_members_service_team_id_church_id_fkey"
            columns: ["service_team_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_teams"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      service_teams: {
        Row: {
          active: boolean
          archived_at: string | null
          archived_by: string | null
          campus_id: string | null
          church_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          service_area_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          service_area_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          church_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          service_area_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_teams_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "service_teams_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_teams_service_area_id_church_id_fkey"
            columns: ["service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_customer_external_id: string | null
          billing_provider: string | null
          cancel_at: string | null
          cancelled_at: string | null
          church_id: string
          created_at: string
          id: string
          metadata: Json
          plan_key: string
          renews_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_customer_external_id?: string | null
          billing_provider?: string | null
          cancel_at?: string | null
          cancelled_at?: string | null
          church_id: string
          created_at?: string
          id?: string
          metadata?: Json
          plan_key?: string
          renews_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_customer_external_id?: string | null
          billing_provider?: string | null
          cancel_at?: string | null
          cancelled_at?: string | null
          church_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          plan_key?: string
          renews_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
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
      accept_invitation: {
        Args: {
          p_first_name: string
          p_last_name: string
          p_phone?: string
          p_token: string
        }
        Returns: {
          church_id: string
          person_id: string
        }[]
      }
      accept_person_invitation: {
        Args: { p_token: string }
        Returns: {
          out_church_id: string
          out_person_id: string
        }[]
      }
      activities_structure_status: {
        Args: { p_activity_ids: string[] }
        Returns: {
          activity_id: string
          blocking: number
          warnings: number
        }[]
      }
      activity_assignment_recorded_warnings: {
        Args: { p_activity_id: string }
        Returns: {
          acknowledged_warnings: string[]
          assignment_id: string
          eligibility_warnings: string[]
        }[]
      }
      activity_assignment_review: {
        Args: { p_activity_id: string }
        Returns: {
          assignment_id: string
          blocking: string[]
          warnings: string[]
        }[]
      }
      activity_capabilities: { Args: { p_activity_id: string }; Returns: Json }
      activity_creation_scopes: { Args: { p_church_id: string }; Returns: Json }
      activity_dashboard: { Args: { p_church_id: string }; Returns: Json }
      activity_position_coverage: {
        Args: { p_activity_id: string }
        Returns: {
          activity_position_id: string
          activity_service_area_id: string
          assigned_count: number
          coverage_status: string
          expected_count: number
          max_people: number
          min_people: number
          pending_count: number
          proposed_count: number
        }[]
      }
      activity_position_effective_requirements: {
        Args: { p_activity_position_id: string }
        Returns: {
          activity_id: string
          activity_position_id: string
          catalog_snapshot: Json | null
          church_id: string
          created_at: string
          created_by: string | null
          credential_type_id: string | null
          disabled: boolean
          id: string
          min_level: Database["public"]["Enums"]["qualification_level"] | null
          min_operational_level:
            Database["public"]["Enums"]["service_operational_level"] | null
          origin: Database["public"]["Enums"]["activity_requirement_origin"]
          qualification_id: string | null
          requirement_type: Database["public"]["Enums"]["position_requirement_type"]
          requires_current_validity: boolean
          source_requirement_id: string | null
          strictness: Database["public"]["Enums"]["position_requirement_strictness"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "activity_position_requirements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      activity_staffing_summary: {
        Args: { p_activity_ids: string[] }
        Returns: {
          activity_id: string
          confirmed: number
          pending: number
          positions: number
          positions_requiring_people: number
          proposed: number
          uncovered_positions: number
        }[]
      }
      activity_structure_issues: {
        Args: { p_activity_id: string }
        Returns: {
          activity_position_id: string
          activity_service_area_id: string
          code: string
          severity: string
        }[]
      }
      add_activity_area: {
        Args: {
          p_activity_id: string
          p_include_positions?: boolean
          p_notes?: string
          p_requirement?: Database["public"]["Enums"]["activity_area_requirement"]
          p_service_area_id: string
        }
        Returns: Json
      }
      add_activity_plan_item: {
        Args: { p_activity_id: string; p_input: Json }
        Returns: string
      }
      add_activity_position: {
        Args: { p_activity_service_area_id: string; p_input: Json }
        Returns: string
      }
      apply_activity_structure_to_series: {
        Args: { p_activity_id: string; p_scope: string }
        Returns: number
      }
      assisted_provision_church: {
        Args: {
          p_country: string
          p_currency: string
          p_locale: string
          p_module_keys?: string[]
          p_name: string
          p_owner_email: string
          p_slug: string
          p_timezone: string
        }
        Returns: {
          church_id: string
          invitation_id: string
          invitation_token: string
        }[]
      }
      cancel_activity_assignment: {
        Args: { p_assignment_id: string; p_expected_version?: number }
        Returns: Json
      }
      cancel_substitution_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      create_activity: {
        Args: { p_church_id: string; p_input: Json }
        Returns: Json
      }
      create_activity_assignment: {
        Args: {
          p_activity_position_id: string
          p_input?: Json
          p_person_id: string
        }
        Returns: Json
      }
      create_person: {
        Args: {
          p_birth_date?: string
          p_campus_id?: string
          p_church_id: string
          p_email?: string
          p_first_name: string
          p_last_name?: string
          p_phone?: string
          p_preferred_name?: string
          p_relationship?: string
          p_tag_ids?: string[]
        }
        Returns: string
      }
      duplicate_activity: {
        Args: { p_activity_id: string; p_input?: Json }
        Returns: Json
      }
      duplicate_activity_template: {
        Args: { p_name?: string; p_template_id: string }
        Returns: string
      }
      eligible_people_for_position: {
        Args: { p_church_id: string; p_service_position_id: string }
        Returns: {
          person_id: string
          reasons: string[]
          status: Database["public"]["Enums"]["eligibility_status"]
        }[]
      }
      evaluate_person_eligibility: {
        Args: {
          p_church_id: string
          p_person_id: string
          p_service_position_id: string
        }
        Returns: {
          reasons: string[]
          status: Database["public"]["Enums"]["eligibility_status"]
        }[]
      }
      find_potential_duplicate_people: {
        Args: {
          p_birth_date?: string
          p_church_id: string
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_phone?: string
        }
        Returns: {
          out_email: string
          out_first_name: string
          out_last_name: string
          out_match_type: string
          out_person_id: string
          out_phone: string
        }[]
      }
      has_capability: {
        Args: {
          p_capability: string
          p_church_id: string
          p_scope_id?: string
          p_scope_type?: string
        }
        Returns: boolean
      }
      invite_existing_person: {
        Args: {
          p_church_id: string
          p_email: string
          p_person_id: string
          p_role_key?: string
        }
        Returns: {
          out_invitation_id: string
          out_invitation_token: string
        }[]
      }
      module_enabled: {
        Args: { p_church_id: string; p_module_key: string }
        Returns: boolean
      }
      my_respondable_assignments_count: {
        Args: { p_church_id: string }
        Returns: number
      }
      preview_activity_recurrence: {
        Args: { p_church_id: string; p_input: Json }
        Returns: {
          ends_at: string
          occurrence_date: string
          starts_at: string
        }[]
      }
      preview_assignment_eligibility: {
        Args: { p_activity_position_id: string; p_person_id: string }
        Returns: {
          blocking: string[]
          warnings: string[]
        }[]
      }
      propose_substitution_candidate: {
        Args: {
          p_acknowledged_warnings?: string[]
          p_person_id: string
          p_request_id: string
        }
        Returns: Json
      }
      provision_church: {
        Args: {
          p_campus_address?: string
          p_campus_city?: string
          p_campus_name?: string
          p_campus_postal_code?: string
          p_campus_province?: string
          p_country: string
          p_currency: string
          p_idempotency_key?: string
          p_locale: string
          p_module_keys?: string[]
          p_name: string
          p_owner_email: string
          p_owner_first_name: string
          p_owner_last_name: string
          p_owner_phone?: string
          p_slug: string
          p_timezone: string
        }
        Returns: {
          campus_id: string
          church_id: string
          onboarding_id: string
          person_id: string
        }[]
      }
      record_assignment_response: {
        Args: {
          p_assignment_id: string
          p_expected_version?: number
          p_response: string
        }
        Returns: Json
      }
      remove_activity_area: {
        Args: { p_activity_service_area_id: string }
        Returns: undefined
      }
      remove_activity_plan_item: {
        Args: { p_plan_item_id: string }
        Returns: undefined
      }
      remove_activity_position: {
        Args: { p_activity_position_id: string }
        Returns: undefined
      }
      remove_activity_position_requirement: {
        Args: { p_requirement_id: string }
        Returns: undefined
      }
      reorder_activity_plan_items: {
        Args: { p_activity_id: string; p_item_ids: string[] }
        Returns: undefined
      }
      request_assignment_substitution: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      respond_activity_assignment: {
        Args: {
          p_assignment_id: string
          p_expected_version?: number
          p_note?: string
          p_response: string
        }
        Returns: Json
      }
      save_activity_position_requirement: {
        Args: {
          p_activity_position_id: string
          p_input: Json
          p_requirement_id: string
        }
        Returns: string
      }
      save_activity_template: {
        Args: { p_church_id: string; p_input: Json; p_template_id: string }
        Returns: string
      }
      send_activity_assignments: {
        Args: { p_activity_id: string; p_assignment_ids?: string[] }
        Returns: Json
      }
      set_activity_template_archived: {
        Args: { p_archived: boolean; p_template_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slug_available: { Args: { p_slug: string }; Returns: boolean }
      slugify: { Args: { p_input: string }; Returns: string }
      transition_activity_status: {
        Args: {
          p_activity_id: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["activity_status"]
        }
        Returns: Database["public"]["Enums"]["activity_status"]
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_activity: {
        Args: { p_activity_id: string; p_input: Json }
        Returns: Json
      }
      update_activity_area: {
        Args: { p_activity_service_area_id: string; p_input: Json }
        Returns: undefined
      }
      update_activity_plan_item: {
        Args: { p_input: Json; p_plan_item_id: string }
        Returns: undefined
      }
      update_activity_position: {
        Args: { p_activity_position_id: string; p_input: Json }
        Returns: undefined
      }
      update_activity_series: {
        Args: { p_activity_id: string; p_input: Json; p_scope: string }
        Returns: Json
      }
      update_activity_series_rule: {
        Args: { p_activity_id: string; p_input: Json }
        Returns: Json
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_church_id: string
          p_correlation_id?: string
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
        }
        Returns: string
      }
    }
    Enums: {
      activity_area_requirement: "required" | "optional"
      activity_assignment_response_source: "self" | "representative"
      activity_assignment_status:
        | "proposed"
        | "pending"
        | "accepted"
        | "declined"
        | "cancelled"
        | "substituted"
      activity_monthly_mode: "day_of_month" | "nth_weekday"
      activity_plan_item_type:
        | "section"
        | "song"
        | "speech"
        | "prayer"
        | "announcement"
        | "media"
        | "transition"
        | "custom"
      activity_recurrence_frequency: "weekly" | "monthly"
      activity_requirement_origin: "inherited" | "added"
      activity_schedule_kind: "timed" | "flexible"
      activity_status:
        | "draft"
        | "planned"
        | "published"
        | "cancelled"
        | "completed"
        | "archived"
      activity_substitution_status: "open" | "completed" | "cancelled"
      activity_type:
        | "service"
        | "meeting"
        | "event"
        | "course_session"
        | "group_meeting"
        | "rehearsal"
        | "task"
        | "shift"
      activity_visibility: "private" | "leaders" | "members" | "public_future"
      church_module_status: "enabled" | "disabled" | "trial" | "suspended"
      church_onboarding_step:
        | "account"
        | "church"
        | "campus"
        | "profile"
        | "branding"
        | "modules"
        | "finish"
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
      credential_status:
        | "pending"
        | "valid"
        | "expired"
        | "rejected"
        | "revoked"
      custom_field_type:
        | "text"
        | "number"
        | "date"
        | "boolean"
        | "select"
        | "multi_select"
      eligibility_status: "eligible" | "eligible_with_warning" | "not_eligible"
      file_classification: "public" | "internal" | "personal" | "restricted"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      job_status: "queued" | "processing" | "succeeded" | "failed"
      person_source:
        | "manual"
        | "import"
        | "registration"
        | "invitation"
        | "integration"
      position_requirement_strictness: "required" | "recommended"
      position_requirement_type:
        | "qualification"
        | "credential"
        | "minimum_level"
      qualification_level: "basic" | "intermediate" | "advanced" | "expert"
      service_area_member_status:
        | "active"
        | "training"
        | "inactive"
        | "suspended"
      service_operational_level:
        | "trainee"
        | "assisted"
        | "autonomous"
        | "leader"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "suspended"
        | "cancelled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_area_requirement: ["required", "optional"],
      activity_assignment_response_source: ["self", "representative"],
      activity_assignment_status: [
        "proposed",
        "pending",
        "accepted",
        "declined",
        "cancelled",
        "substituted",
      ],
      activity_monthly_mode: ["day_of_month", "nth_weekday"],
      activity_plan_item_type: [
        "section",
        "song",
        "speech",
        "prayer",
        "announcement",
        "media",
        "transition",
        "custom",
      ],
      activity_recurrence_frequency: ["weekly", "monthly"],
      activity_requirement_origin: ["inherited", "added"],
      activity_schedule_kind: ["timed", "flexible"],
      activity_status: [
        "draft",
        "planned",
        "published",
        "cancelled",
        "completed",
        "archived",
      ],
      activity_substitution_status: ["open", "completed", "cancelled"],
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
      activity_visibility: ["private", "leaders", "members", "public_future"],
      church_module_status: ["enabled", "disabled", "trial", "suspended"],
      church_onboarding_step: [
        "account",
        "church",
        "campus",
        "profile",
        "branding",
        "modules",
        "finish",
      ],
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
      credential_status: ["pending", "valid", "expired", "rejected", "revoked"],
      custom_field_type: [
        "text",
        "number",
        "date",
        "boolean",
        "select",
        "multi_select",
      ],
      eligibility_status: ["eligible", "eligible_with_warning", "not_eligible"],
      file_classification: ["public", "internal", "personal", "restricted"],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      job_status: ["queued", "processing", "succeeded", "failed"],
      person_source: [
        "manual",
        "import",
        "registration",
        "invitation",
        "integration",
      ],
      position_requirement_strictness: ["required", "recommended"],
      position_requirement_type: [
        "qualification",
        "credential",
        "minimum_level",
      ],
      qualification_level: ["basic", "intermediate", "advanced", "expert"],
      service_area_member_status: [
        "active",
        "training",
        "inactive",
        "suspended",
      ],
      service_operational_level: [
        "trainee",
        "assisted",
        "autonomous",
        "leader",
      ],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "suspended",
        "cancelled",
      ],
    },
  },
} as const

