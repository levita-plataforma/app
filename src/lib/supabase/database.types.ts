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
            | Database["public"]["Enums"]["activity_status"]
            | null
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
            | Database["public"]["Enums"]["activity_status"]
            | null
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
            | Database["public"]["Enums"]["activity_status"]
            | null
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
            | Database["public"]["Enums"]["service_operational_level"]
            | null
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
            | Database["public"]["Enums"]["service_operational_level"]
            | null
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
            | Database["public"]["Enums"]["service_operational_level"]
            | null
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
            | Database["public"]["Enums"]["activity_monthly_mode"]
            | null
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
            | Database["public"]["Enums"]["activity_monthly_mode"]
            | null
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
            | Database["public"]["Enums"]["activity_monthly_mode"]
            | null
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
      communication_category_preferences: {
        Row: {
          category: Database["public"]["Enums"]["communication_purpose"]
          church_id: string
          opted_out: boolean
          person_id: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["communication_purpose"]
          church_id: string
          opted_out?: boolean
          person_id: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["communication_purpose"]
          church_id?: string
          opted_out?: boolean
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_category_preferences_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_category_preferences_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "communication_category_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_recipients: {
        Row: {
          attempt_count: number
          channel: Database["public"]["Enums"]["notification_channel"]
          church_id: string
          communication_id: string
          created_at: string
          excluded_reason: string | null
          failed_at: string | null
          failure_code: string | null
          failure_kind:
            | Database["public"]["Enums"]["communication_failure_kind"]
            | null
          id: string
          person_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["communication_recipient_status"]
          unsubscribe_token: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          church_id: string
          communication_id: string
          created_at?: string
          excluded_reason?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_kind?:
            | Database["public"]["Enums"]["communication_failure_kind"]
            | null
          id?: string
          person_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["communication_recipient_status"]
          unsubscribe_token?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          church_id?: string
          communication_id?: string
          created_at?: string
          excluded_reason?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_kind?:
            | Database["public"]["Enums"]["communication_failure_kind"]
            | null
          id?: string
          person_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["communication_recipient_status"]
          unsubscribe_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_recipients_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_recipients_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "communication_recipients_communication_id_church_id_fkey"
            columns: ["communication_id", "church_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      communication_segments: {
        Row: {
          archived_at: string | null
          church_id: string
          created_at: string
          created_by_person_id: string | null
          description: string | null
          id: string
          name: string
          rules: Json
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          church_id: string
          created_at?: string
          created_by_person_id?: string | null
          description?: string | null
          id?: string
          name: string
          rules: Json
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          church_id?: string
          created_at?: string
          created_by_person_id?: string | null
          description?: string | null
          id?: string
          name?: string
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_segments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          archived_at: string | null
          body: string
          category: string | null
          church_id: string
          created_at: string
          created_by_person_id: string | null
          id: string
          name: string
          placeholders_allowed: string[]
          subject: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          category?: string | null
          church_id: string
          created_at?: string
          created_by_person_id?: string | null
          id?: string
          name: string
          placeholders_allowed?: string[]
          subject?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          category?: string | null
          church_id?: string
          created_at?: string
          created_by_person_id?: string | null
          id?: string
          name?: string
          placeholders_allowed?: string[]
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          archived_at: string | null
          body_template: string
          channels: Database["public"]["Enums"]["notification_channel"][]
          church_id: string
          created_at: string
          created_by_person_id: string | null
          id: string
          materialized_at: string | null
          purpose: Database["public"]["Enums"]["communication_purpose"]
          scheduled_at: string | null
          segment_id: string | null
          segment_rules_snapshot: Json | null
          sent_at: string | null
          status: Database["public"]["Enums"]["communication_status"]
          subject: string | null
          template_id: string | null
          title: string
          updated_at: string
          updated_by_person_id: string | null
        }
        Insert: {
          archived_at?: string | null
          body_template: string
          channels: Database["public"]["Enums"]["notification_channel"][]
          church_id: string
          created_at?: string
          created_by_person_id?: string | null
          id?: string
          materialized_at?: string | null
          purpose?: Database["public"]["Enums"]["communication_purpose"]
          scheduled_at?: string | null
          segment_id?: string | null
          segment_rules_snapshot?: Json | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject?: string | null
          template_id?: string | null
          title: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Update: {
          archived_at?: string | null
          body_template?: string
          channels?: Database["public"]["Enums"]["notification_channel"][]
          church_id?: string
          created_at?: string
          created_by_person_id?: string | null
          id?: string
          materialized_at?: string | null
          purpose?: Database["public"]["Enums"]["communication_purpose"]
          scheduled_at?: string | null
          segment_id?: string | null
          segment_rules_snapshot?: Json | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject?: string | null
          template_id?: string | null
          title?: string
          updated_at?: string
          updated_by_person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_segment_id_fkey"
            columns: ["segment_id", "church_id"]
            isOneToOne: false
            referencedRelation: "communication_segments"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "communications_template_id_fkey"
            columns: ["template_id", "church_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      consent_definitions: {
        Row: {
          active: boolean
          body: string
          church_id: string
          created_at: string
          id: string
          key: string
          purpose_type: string
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          body: string
          church_id: string
          created_at?: string
          id?: string
          key: string
          purpose_type: string
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          body?: string
          church_id?: string
          created_at?: string
          id?: string
          key?: string
          purpose_type?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "consent_definitions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          church_id: string
          consent_definition_id: string
          consent_version: number
          given: boolean
          id: string
          origin: string
          person_id: string | null
          recorded_at: string
          registration_id: string | null
        }
        Insert: {
          church_id: string
          consent_definition_id: string
          consent_version: number
          given?: boolean
          id?: string
          origin: string
          person_id?: string | null
          recorded_at?: string
          registration_id?: string | null
        }
        Update: {
          church_id?: string
          consent_definition_id?: string
          consent_version?: number
          given?: boolean
          id?: string
          origin?: string
          person_id?: string | null
          recorded_at?: string
          registration_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_consent_definition_id_church_id_fkey"
            columns: ["consent_definition_id", "church_id"]
            isOneToOne: false
            referencedRelation: "consent_definitions"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "consent_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_registration_id_church_id_fkey"
            columns: ["registration_id", "church_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      course_cohorts: {
        Row: {
          allows_requests: boolean
          archived_at: string | null
          archived_by: string | null
          campus_id: string | null
          capacity: number | null
          church_id: string
          course_id: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          id: string
          name: string
          notes: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["course_cohort_status"]
          updated_at: string
        }
        Insert: {
          allows_requests?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          capacity?: number | null
          church_id: string
          course_id: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          name: string
          notes?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["course_cohort_status"]
          updated_at?: string
        }
        Update: {
          allows_requests?: boolean
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          capacity?: number | null
          church_id?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          id?: string
          name?: string
          notes?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["course_cohort_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_cohorts_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_cohorts_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "course_cohorts_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_cohorts_course_id_church_id_fkey"
            columns: ["course_id", "church_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "course_cohorts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          church_id: string
          cohort_id: string
          completed_at: string | null
          completed_by: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          drop_reason: string | null
          dropped_at: string | null
          enrolled_at: string | null
          id: string
          person_id: string
          request_message: string | null
          requested_at: string | null
          status: Database["public"]["Enums"]["course_enrollment_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          cohort_id: string
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          drop_reason?: string | null
          dropped_at?: string | null
          enrolled_at?: string | null
          id?: string
          person_id: string
          request_message?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["course_enrollment_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          cohort_id?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          drop_reason?: string | null
          dropped_at?: string | null
          enrolled_at?: string | null
          id?: string
          person_id?: string
          request_message?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["course_enrollment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "course_enrollments_cohort_id_church_id_fkey"
            columns: ["cohort_id", "church_id"]
            isOneToOne: false
            referencedRelation: "course_cohorts"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "course_enrollments_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      course_session_attendance: {
        Row: {
          church_id: string
          course_session_id: string
          created_at: string
          id: string
          notes: string | null
          person_id: string
          recorded_at: string
          recorded_by: string | null
          status: Database["public"]["Enums"]["group_attendance_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          course_session_id: string
          created_at?: string
          id?: string
          notes?: string | null
          person_id: string
          recorded_at?: string
          recorded_by?: string | null
          status: Database["public"]["Enums"]["group_attendance_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          course_session_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          person_id?: string
          recorded_at?: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["group_attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_session_attendance_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_session_attendance_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "course_session_attendance_course_session_id_church_id_fkey"
            columns: ["course_session_id", "church_id"]
            isOneToOne: false
            referencedRelation: "course_sessions"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "course_session_attendance_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_session_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      course_sessions: {
        Row: {
          activity_id: string
          attendance_recorded_at: string | null
          attendance_recorded_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          church_id: string
          cohort_id: string
          created_at: string
          created_by: string | null
          id: string
          session_number: number
          topic: string | null
          updated_at: string
        }
        Insert: {
          activity_id: string
          attendance_recorded_at?: string | null
          attendance_recorded_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id: string
          cohort_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          session_number: number
          topic?: string | null
          updated_at?: string
        }
        Update: {
          activity_id?: string
          attendance_recorded_at?: string | null
          attendance_recorded_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id?: string
          cohort_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          session_number?: number
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_sessions_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "course_sessions_attendance_recorded_by_fkey"
            columns: ["attendance_recorded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_sessions_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_sessions_cohort_id_church_id_fkey"
            columns: ["cohort_id", "church_id"]
            isOneToOne: false
            referencedRelation: "course_cohorts"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "course_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          church_id: string
          completion_attendance_ratio: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          session_count: number | null
          status: Database["public"]["Enums"]["course_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          church_id: string
          completion_attendance_ratio?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          session_count?: number | null
          status?: Database["public"]["Enums"]["course_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          church_id?: string
          completion_attendance_ratio?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          session_count?: number | null
          status?: Database["public"]["Enums"]["course_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
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
      events: {
        Row: {
          activity_id: string
          archived_at: string | null
          archived_by: string | null
          cancellation_policy: string | null
          capacity: number | null
          church_id: string
          confirmation_message: string | null
          contact_email: string | null
          contact_phone: string | null
          cover_file_id: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          form_id: string | null
          id: string
          max_waitlist: number | null
          public_description: string | null
          public_slug: string
          registration_closes_at: string | null
          registration_enabled: boolean
          registration_opens_at: string | null
          registration_status_override: string | null
          registration_type: Database["public"]["Enums"]["event_registration_type"]
          short_description: string | null
          updated_at: string
          visibility: string
          waitlist_enabled: boolean
        }
        Insert: {
          activity_id: string
          archived_at?: string | null
          archived_by?: string | null
          cancellation_policy?: string | null
          capacity?: number | null
          church_id: string
          confirmation_message?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cover_file_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          form_id?: string | null
          id?: string
          max_waitlist?: number | null
          public_description?: string | null
          public_slug: string
          registration_closes_at?: string | null
          registration_enabled?: boolean
          registration_opens_at?: string | null
          registration_status_override?: string | null
          registration_type?: Database["public"]["Enums"]["event_registration_type"]
          short_description?: string | null
          updated_at?: string
          visibility?: string
          waitlist_enabled?: boolean
        }
        Update: {
          activity_id?: string
          archived_at?: string | null
          archived_by?: string | null
          cancellation_policy?: string | null
          capacity?: number | null
          church_id?: string
          confirmation_message?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          cover_file_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          form_id?: string | null
          id?: string
          max_waitlist?: number | null
          public_description?: string | null
          public_slug?: string
          registration_closes_at?: string | null
          registration_enabled?: boolean
          registration_opens_at?: string | null
          registration_status_override?: string | null
          registration_type?: Database["public"]["Enums"]["event_registration_type"]
          short_description?: string | null
          updated_at?: string
          visibility?: string
          waitlist_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
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
      form_fields: {
        Row: {
          archived_at: string | null
          church_id: string
          classification: Database["public"]["Enums"]["form_field_classification"]
          created_at: string
          form_id: string
          help_text: string | null
          id: string
          key: string
          label: string
          options: Json | null
          required: boolean
          sort_order: number
          type: Database["public"]["Enums"]["form_field_type"]
          updated_at: string
          validation: Json
        }
        Insert: {
          archived_at?: string | null
          church_id: string
          classification?: Database["public"]["Enums"]["form_field_classification"]
          created_at?: string
          form_id: string
          help_text?: string | null
          id?: string
          key: string
          label: string
          options?: Json | null
          required?: boolean
          sort_order?: number
          type: Database["public"]["Enums"]["form_field_type"]
          updated_at?: string
          validation?: Json
        }
        Update: {
          archived_at?: string | null
          church_id?: string
          classification?: Database["public"]["Enums"]["form_field_classification"]
          created_at?: string
          form_id?: string
          help_text?: string | null
          id?: string
          key?: string
          label?: string
          options?: Json | null
          required?: boolean
          sort_order?: number
          type?: Database["public"]["Enums"]["form_field_type"]
          updated_at?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_fields_form_id_church_id_fkey"
            columns: ["form_id", "church_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      form_submission_answers: {
        Row: {
          church_id: string
          classification: Database["public"]["Enums"]["form_field_classification"]
          field_key: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          id: string
          submission_id: string
          value: Json
        }
        Insert: {
          church_id: string
          classification: Database["public"]["Enums"]["form_field_classification"]
          field_key: string
          field_type: Database["public"]["Enums"]["form_field_type"]
          id?: string
          submission_id: string
          value: Json
        }
        Update: {
          church_id?: string
          classification?: Database["public"]["Enums"]["form_field_classification"]
          field_key?: string
          field_type?: Database["public"]["Enums"]["form_field_type"]
          id?: string
          submission_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "form_submission_answers_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submission_answers_submission_id_church_id_fkey"
            columns: ["submission_id", "church_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          church_id: string
          event_id: string | null
          fields_snapshot: Json
          form_id: string
          form_version: number
          id: string
          person_id: string | null
          registration_id: string | null
          status: string
          submitted_at: string
          submitted_by_user: string | null
        }
        Insert: {
          church_id: string
          event_id?: string | null
          fields_snapshot: Json
          form_id: string
          form_version: number
          id?: string
          person_id?: string | null
          registration_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by_user?: string | null
        }
        Update: {
          church_id?: string
          event_id?: string | null
          fields_snapshot?: Json
          form_id?: string
          form_version?: number
          id?: string
          person_id?: string | null
          registration_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_event_id_church_id_fkey"
            columns: ["event_id", "church_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_church_id_fkey"
            columns: ["form_id", "church_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "form_submissions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          active: boolean
          archived_at: string | null
          church_id: string
          created_at: string
          created_by: string | null
          current_version: number
          description: string | null
          id: string
          name: string
          purpose: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          id?: string
          name: string
          purpose: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          id?: string
          name?: string
          purpose?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      group_attendance: {
        Row: {
          church_id: string
          created_at: string
          group_meeting_id: string
          id: string
          is_guest: boolean
          notes: string | null
          person_id: string
          recorded_at: string
          recorded_by: string | null
          status: Database["public"]["Enums"]["group_attendance_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          group_meeting_id: string
          id?: string
          is_guest?: boolean
          notes?: string | null
          person_id: string
          recorded_at?: string
          recorded_by?: string | null
          status: Database["public"]["Enums"]["group_attendance_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          group_meeting_id?: string
          id?: string
          is_guest?: boolean
          notes?: string | null
          person_id?: string
          recorded_at?: string
          recorded_by?: string | null
          status?: Database["public"]["Enums"]["group_attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_attendance_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_attendance_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "group_attendance_group_meeting_id_church_id_fkey"
            columns: ["group_meeting_id", "church_id"]
            isOneToOne: false
            referencedRelation: "group_meetings"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "group_attendance_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_attendance_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      group_join_requests: {
        Row: {
          church_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          group_id: string
          id: string
          message: string | null
          person_id: string
          status: Database["public"]["Enums"]["group_join_request_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          group_id: string
          id?: string
          message?: string | null
          person_id: string
          status?: Database["public"]["Enums"]["group_join_request_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          group_id?: string
          id?: string
          message?: string | null
          person_id?: string
          status?: Database["public"]["Enums"]["group_join_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_join_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "group_join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_join_requests_group_id_church_id_fkey"
            columns: ["group_id", "church_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "group_join_requests_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      group_leaders: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          group_id: string
          id: string
          person_id: string
          role: Database["public"]["Enums"]["group_leader_role"]
          starts_at: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          group_id: string
          id?: string
          person_id: string
          role?: Database["public"]["Enums"]["group_leader_role"]
          starts_at?: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          group_id?: string
          id?: string
          person_id?: string
          role?: Database["public"]["Enums"]["group_leader_role"]
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_leaders_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_leaders_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "group_leaders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_leaders_group_id_church_id_fkey"
            columns: ["group_id", "church_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "group_leaders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      group_meetings: {
        Row: {
          activity_id: string
          attendance_recorded_at: string | null
          attendance_recorded_by: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          church_id: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          attendance_recorded_at?: string | null
          attendance_recorded_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          attendance_recorded_at?: string | null
          attendance_recorded_by?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_meetings_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "group_meetings_attendance_recorded_by_fkey"
            columns: ["attendance_recorded_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_meetings_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_meetings_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_meetings_group_id_church_id_fkey"
            columns: ["group_id", "church_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      group_members: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          joined_at: string
          left_at: string | null
          left_reason: string | null
          person_id: string
          status: Database["public"]["Enums"]["group_member_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          left_reason?: string | null
          person_id: string
          status?: Database["public"]["Enums"]["group_member_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          left_reason?: string | null
          person_id?: string
          status?: Database["public"]["Enums"]["group_member_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "group_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_church_id_fkey"
            columns: ["group_id", "church_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "group_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      group_types: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          church_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_types_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_types_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          age_segment: string | null
          archived_at: string | null
          archived_by: string | null
          campus_id: string | null
          capacity: number | null
          church_id: string
          created_at: string
          created_by: string | null
          description: string | null
          group_type_id: string | null
          id: string
          join_policy: Database["public"]["Enums"]["group_join_policy"]
          meeting_location_text: string | null
          meeting_schedule_text: string | null
          name: string
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["group_visibility"]
        }
        Insert: {
          age_segment?: string | null
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          capacity?: number | null
          church_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type_id?: string | null
          id?: string
          join_policy?: Database["public"]["Enums"]["group_join_policy"]
          meeting_location_text?: string | null
          meeting_schedule_text?: string | null
          name: string
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["group_visibility"]
        }
        Update: {
          age_segment?: string | null
          archived_at?: string | null
          archived_by?: string | null
          campus_id?: string | null
          capacity?: number | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          group_type_id?: string | null
          id?: string
          join_policy?: Database["public"]["Enums"]["group_join_policy"]
          meeting_location_text?: string | null
          meeting_schedule_text?: string | null
          name?: string
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["group_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "groups_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "groups_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_group_type_id_church_id_fkey"
            columns: ["group_type_id", "church_id"]
            isOneToOne: false
            referencedRelation: "group_types"
            referencedColumns: ["id", "church_id"]
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
      kid_checkins: {
        Row: {
          authorized_pickup_id: string | null
          checked_in_at: string
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          church_id: string
          created_at: string
          id: string
          incident_flag: boolean
          kid_person_id: string
          notes: string | null
          pickup_person_snapshot: string | null
          pickup_token_hash: string
          room_id: string
          session_id: string
          status: Database["public"]["Enums"]["kid_checkin_status"]
          updated_at: string
        }
        Insert: {
          authorized_pickup_id?: string | null
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          church_id: string
          created_at?: string
          id?: string
          incident_flag?: boolean
          kid_person_id: string
          notes?: string | null
          pickup_person_snapshot?: string | null
          pickup_token_hash: string
          room_id: string
          session_id: string
          status?: Database["public"]["Enums"]["kid_checkin_status"]
          updated_at?: string
        }
        Update: {
          authorized_pickup_id?: string | null
          checked_in_at?: string
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          church_id?: string
          created_at?: string
          id?: string
          incident_flag?: boolean
          kid_person_id?: string
          notes?: string | null
          pickup_person_snapshot?: string | null
          pickup_token_hash?: string
          room_id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["kid_checkin_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_checkins_authorized_pickup_id_church_id_fkey"
            columns: ["authorized_pickup_id", "church_id"]
            isOneToOne: false
            referencedRelation: "kid_pickup_authorizations"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "kid_checkins_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_checkins_church_id_kid_person_id_fkey"
            columns: ["church_id", "kid_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kid_checkins_kid_person_id_fkey"
            columns: ["kid_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_checkins_room_id_church_id_fkey"
            columns: ["room_id", "church_id"]
            isOneToOne: false
            referencedRelation: "kids_rooms"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "kid_checkins_session_id_church_id_fkey"
            columns: ["session_id", "church_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      kid_guardians: {
        Row: {
          active: boolean
          can_view: boolean
          church_id: string
          created_at: string
          created_by: string | null
          emergency_contact: boolean
          guardian_person_id: string
          id: string
          kid_person_id: string
          legal_guardian: boolean
          relationship_type: string
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          can_view?: boolean
          church_id: string
          created_at?: string
          created_by?: string | null
          emergency_contact?: boolean
          guardian_person_id: string
          id?: string
          kid_person_id: string
          legal_guardian?: boolean
          relationship_type: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          can_view?: boolean
          church_id?: string
          created_at?: string
          created_by?: string | null
          emergency_contact?: boolean
          guardian_person_id?: string
          id?: string
          kid_person_id?: string
          legal_guardian?: boolean
          relationship_type?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_guardians_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_guardians_church_id_guardian_person_id_fkey"
            columns: ["church_id", "guardian_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kid_guardians_church_id_kid_person_id_fkey"
            columns: ["church_id", "kid_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kid_guardians_guardian_person_id_fkey"
            columns: ["guardian_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_guardians_kid_person_id_fkey"
            columns: ["kid_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_pickup_authorizations: {
        Row: {
          authorization_type: Database["public"]["Enums"]["pickup_authorization_type"]
          authorized_name_snapshot: string
          authorized_person_id: string | null
          church_id: string
          created_at: string
          created_by: string | null
          id: string
          kid_person_id: string
          notes: string | null
          one_time: boolean
          relation_text: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: Database["public"]["Enums"]["pickup_authorization_status"]
          updated_at: string
          used_at: string | null
          used_checkin_id: string | null
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          authorization_type?: Database["public"]["Enums"]["pickup_authorization_type"]
          authorized_name_snapshot: string
          authorized_person_id?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kid_person_id: string
          notes?: string | null
          one_time?: boolean
          relation_text?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["pickup_authorization_status"]
          updated_at?: string
          used_at?: string | null
          used_checkin_id?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          authorization_type?: Database["public"]["Enums"]["pickup_authorization_type"]
          authorized_name_snapshot?: string
          authorized_person_id?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kid_person_id?: string
          notes?: string | null
          one_time?: boolean
          relation_text?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: Database["public"]["Enums"]["pickup_authorization_status"]
          updated_at?: string
          used_at?: string | null
          used_checkin_id?: string | null
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kid_pickup_authorizations_authorized_person_id_fkey"
            columns: ["authorized_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_pickup_authorizations_church_id_authorized_person_id_fkey"
            columns: ["church_id", "authorized_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kid_pickup_authorizations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kid_pickup_authorizations_church_id_kid_person_id_fkey"
            columns: ["church_id", "kid_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kid_pickup_authorizations_kid_person_id_fkey"
            columns: ["kid_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      kid_pickup_overrides: {
        Row: {
          checkin_id: string
          church_id: string
          created_at: string
          id: string
          operator_person_id: string | null
          pickup_person_name: string
          reason: string
        }
        Insert: {
          checkin_id: string
          church_id: string
          created_at?: string
          id?: string
          operator_person_id?: string | null
          pickup_person_name: string
          reason: string
        }
        Update: {
          checkin_id?: string
          church_id?: string
          created_at?: string
          id?: string
          operator_person_id?: string | null
          pickup_person_name?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "kid_pickup_overrides_checkin_id_church_id_fkey"
            columns: ["checkin_id", "church_id"]
            isOneToOne: false
            referencedRelation: "kid_checkins"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "kid_pickup_overrides_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_incidents: {
        Row: {
          actions_taken: string | null
          church_id: string
          created_at: string
          description: string
          guardian_notified_at: string | null
          id: string
          incident_type: Database["public"]["Enums"]["kids_incident_type"]
          kid_person_id: string
          occurred_at: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          severity: Database["public"]["Enums"]["kids_incident_severity"]
          status: Database["public"]["Enums"]["kids_incident_status"]
          updated_at: string
        }
        Insert: {
          actions_taken?: string | null
          church_id: string
          created_at?: string
          description: string
          guardian_notified_at?: string | null
          id?: string
          incident_type?: Database["public"]["Enums"]["kids_incident_type"]
          kid_person_id: string
          occurred_at?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          severity?: Database["public"]["Enums"]["kids_incident_severity"]
          status?: Database["public"]["Enums"]["kids_incident_status"]
          updated_at?: string
        }
        Update: {
          actions_taken?: string | null
          church_id?: string
          created_at?: string
          description?: string
          guardian_notified_at?: string | null
          id?: string
          incident_type?: Database["public"]["Enums"]["kids_incident_type"]
          kid_person_id?: string
          occurred_at?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          severity?: Database["public"]["Enums"]["kids_incident_severity"]
          status?: Database["public"]["Enums"]["kids_incident_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_incidents_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_incidents_church_id_kid_person_id_fkey"
            columns: ["church_id", "kid_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kids_incidents_kid_person_id_fkey"
            columns: ["kid_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_incidents_session_id_church_id_fkey"
            columns: ["session_id", "church_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      kids_profiles: {
        Row: {
          active: boolean
          archived_at: string | null
          church_id: string
          created_at: string
          id: string
          medical_alert_flag: boolean
          person_id: string
          preferred_name: string | null
          status: Database["public"]["Enums"]["kids_profile_status"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          church_id: string
          created_at?: string
          id?: string
          medical_alert_flag?: boolean
          person_id: string
          preferred_name?: string | null
          status?: Database["public"]["Enums"]["kids_profile_status"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          church_id?: string
          created_at?: string
          id?: string
          medical_alert_flag?: boolean
          person_id?: string
          preferred_name?: string | null
          status?: Database["public"]["Enums"]["kids_profile_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_profiles_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_profiles_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: true
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kids_profiles_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_required_credentials: {
        Row: {
          active: boolean
          church_id: string
          created_at: string
          credential_type_id: string
          id: string
          required: boolean
        }
        Insert: {
          active?: boolean
          church_id: string
          created_at?: string
          credential_type_id: string
          id?: string
          required?: boolean
        }
        Update: {
          active?: boolean
          church_id?: string
          created_at?: string
          credential_type_id?: string
          id?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "kids_required_credentials_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_required_credentials_credential_type_id_church_id_fkey"
            columns: ["credential_type_id", "church_id"]
            isOneToOne: false
            referencedRelation: "credential_types"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      kids_rooms: {
        Row: {
          active: boolean
          age_max_months: number | null
          age_min_months: number | null
          archived_at: string | null
          campus_id: string | null
          capacity: number
          church_id: string
          created_at: string
          description: string | null
          id: string
          location_text: string | null
          min_adults: number
          name: string
          ratio_children_per_adult: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          age_max_months?: number | null
          age_min_months?: number | null
          archived_at?: string | null
          campus_id?: string | null
          capacity: number
          church_id: string
          created_at?: string
          description?: string | null
          id?: string
          location_text?: string | null
          min_adults?: number
          name: string
          ratio_children_per_adult?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          age_max_months?: number | null
          age_min_months?: number | null
          archived_at?: string | null
          campus_id?: string | null
          capacity?: number
          church_id?: string
          created_at?: string
          description?: string | null
          id?: string
          location_text?: string | null
          min_adults?: number
          name?: string
          ratio_children_per_adult?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_rooms_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "kids_rooms_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_sensitive_notes: {
        Row: {
          accessibility_notes: string | null
          church_id: string
          emergency_notes: string | null
          kid_person_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          church_id: string
          emergency_notes?: string | null
          kid_person_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          church_id?: string
          emergency_notes?: string | null
          kid_person_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kids_sensitive_notes_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_sensitive_notes_church_id_kid_person_id_fkey"
            columns: ["church_id", "kid_person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kids_sensitive_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      kids_session_staff: {
        Row: {
          checked_in_at: string | null
          checked_in_by: string | null
          checked_out_at: string | null
          church_id: string
          created_at: string
          eligibility_reasons: string[]
          eligible_at_assignment: boolean
          id: string
          person_id: string
          role: Database["public"]["Enums"]["kids_staff_role"]
          session_id: string
          updated_at: string
        }
        Insert: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          church_id: string
          created_at?: string
          eligibility_reasons?: string[]
          eligible_at_assignment?: boolean
          id?: string
          person_id: string
          role?: Database["public"]["Enums"]["kids_staff_role"]
          session_id: string
          updated_at?: string
        }
        Update: {
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          church_id?: string
          created_at?: string
          eligibility_reasons?: string[]
          eligible_at_assignment?: boolean
          id?: string
          person_id?: string
          role?: Database["public"]["Enums"]["kids_staff_role"]
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_session_staff_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_session_staff_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "kids_session_staff_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_session_staff_session_id_church_id_fkey"
            columns: ["session_id", "church_id"]
            isOneToOne: false
            referencedRelation: "kids_sessions"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      kids_sessions: {
        Row: {
          activity_id: string
          campus_id: string | null
          church_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          opened_at: string | null
          opened_by: string | null
          room_id: string
          status: Database["public"]["Enums"]["kids_session_status"]
          updated_at: string
        }
        Insert: {
          activity_id: string
          campus_id?: string | null
          church_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          opened_by?: string | null
          room_id: string
          status?: Database["public"]["Enums"]["kids_session_status"]
          updated_at?: string
        }
        Update: {
          activity_id?: string
          campus_id?: string | null
          church_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          opened_at?: string | null
          opened_by?: string | null
          room_id?: string
          status?: Database["public"]["Enums"]["kids_session_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kids_sessions_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "kids_sessions_campus_id_church_id_fkey"
            columns: ["campus_id", "church_id"]
            isOneToOne: false
            referencedRelation: "campuses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "kids_sessions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kids_sessions_room_id_church_id_fkey"
            columns: ["room_id", "church_id"]
            isOneToOne: false
            referencedRelation: "kids_rooms"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          church_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["learning_path_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["learning_path_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["learning_path_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_paths_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_paths_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          community_size: string | null
          created_at: string
          email: string
          id: string
          kind: string
          message: string | null
          name: string
          organization: string | null
        }
        Insert: {
          community_size?: string | null
          created_at?: string
          email: string
          id?: string
          kind: string
          message?: string | null
          name: string
          organization?: string | null
        }
        Update: {
          community_size?: string | null
          created_at?: string
          email?: string
          id?: string
          kind?: string
          message?: string | null
          name?: string
          organization?: string | null
        }
        Relationships: []
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
      notification_deliveries: {
        Row: {
          attempts: number
          channel: Database["public"]["Enums"]["notification_channel"]
          church_id: string
          claimed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          notification_id: string
          person_id: string
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          channel: Database["public"]["Enums"]["notification_channel"]
          church_id: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id: string
          person_id: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          channel?: Database["public"]["Enums"]["notification_channel"]
          church_id?: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id?: string
          person_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_notification_id_church_id_fkey"
            columns: ["notification_id", "church_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "notification_deliveries_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          attempts: number
          church_id: string
          created_at: string
          entity_id: string
          entity_type: string
          entity_version: number | null
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          occurred_at: string
          payload: Json
          processed_at: string | null
          recipient_person_ids: string[]
        }
        Insert: {
          attempts?: number
          church_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          entity_version?: number | null
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          recipient_person_ids?: string[]
        }
        Update: {
          attempts?: number
          church_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          entity_version?: number | null
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          recipient_person_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          church_id: string
          enabled: boolean
          person_id: string
          updated_at: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          church_id: string
          enabled?: boolean
          person_id: string
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          church_id?: string
          enabled?: boolean
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "notification_preferences_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          activity_id: string | null
          body: string
          church_id: string
          created_at: string
          entity_id: string
          entity_type: string
          event_id: string
          event_type: string
          id: string
          person_id: string
          read_at: string | null
          title: string
        }
        Insert: {
          activity_id?: string | null
          body: string
          church_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_id: string
          event_type: string
          id?: string
          person_id: string
          read_at?: string | null
          title: string
        }
        Update: {
          activity_id?: string | null
          body?: string
          church_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_id?: string
          event_type?: string
          id?: string
          person_id?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_activity_id_church_id_fkey"
            columns: ["activity_id", "church_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "notifications_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "notifications_event_id_church_id_fkey"
            columns: ["event_id", "church_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "notifications_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      path_steps: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          church_id: string
          course_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_required: boolean
          kind: Database["public"]["Enums"]["path_step_kind"]
          learning_path_id: string
          step_order: number
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          church_id: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_required?: boolean
          kind?: Database["public"]["Enums"]["path_step_kind"]
          learning_path_id: string
          step_order: number
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          church_id?: string
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_required?: boolean
          kind?: Database["public"]["Enums"]["path_step_kind"]
          learning_path_id?: string
          step_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "path_steps_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "path_steps_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "path_steps_course_id_church_id_fkey"
            columns: ["course_id", "church_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "path_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "path_steps_learning_path_id_church_id_fkey"
            columns: ["learning_path_id", "church_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id", "church_id"]
          },
        ]
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
      person_path_progress: {
        Row: {
          church_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          learning_path_id: string
          note: string | null
          path_step_id: string
          person_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["path_progress_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          learning_path_id: string
          note?: string | null
          path_step_id: string
          person_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["path_progress_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          learning_path_id?: string
          note?: string | null
          path_step_id?: string
          person_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["path_progress_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_path_progress_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_path_progress_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "person_path_progress_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_path_progress_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_path_progress_learning_path_id_church_id_fkey"
            columns: ["learning_path_id", "church_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "person_path_progress_path_step_id_church_id_fkey"
            columns: ["path_step_id", "church_id"]
            isOneToOne: false
            referencedRelation: "path_steps"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "person_path_progress_person_id_fkey"
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
      person_serving_preferences: {
        Row: {
          church_id: string
          created_at: string
          id: string
          max_activities_per_month: number | null
          person_id: string
          service_area_id: string | null
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          id?: string
          max_activities_per_month?: number | null
          person_id: string
          service_area_id?: string | null
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          id?: string
          max_activities_per_month?: number | null
          person_id?: string
          service_area_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_serving_preferences_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_serving_preferences_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
          {
            foreignKeyName: "person_serving_preferences_service_area_id_church_id_fkey"
            columns: ["service_area_id", "church_id"]
            isOneToOne: false
            referencedRelation: "service_areas"
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
      person_unavailability_periods: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          person_id: string
          reason: string | null
          starts_at: string
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          person_id: string
          reason?: string | null
          starts_at: string
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          person_id?: string
          reason?: string | null
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_unavailability_periods_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_unavailability_periods_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
          },
        ]
      }
      person_unavailability_weekly: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          ends_time: string
          id: string
          person_id: string
          reason: string | null
          starts_time: string
          updated_at: string
          weekday: number
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          ends_time: string
          id?: string
          person_id: string
          reason?: string | null
          starts_time: string
          updated_at?: string
          weekday: number
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          ends_time?: string
          id?: string
          person_id?: string
          reason?: string | null
          starts_time?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_unavailability_weekly_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_unavailability_weekly_church_id_person_id_fkey"
            columns: ["church_id", "person_id"]
            isOneToOne: false
            referencedRelation: "church_people"
            referencedColumns: ["church_id", "person_id"]
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
      registration_attendees: {
        Row: {
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          attendee_type: Database["public"]["Enums"]["attendee_type"]
          checked_in_at: string | null
          checked_in_by: string | null
          church_id: string
          created_at: string
          event_id: string
          full_name: string
          id: string
          person_id: string | null
          registration_id: string
          updated_at: string
        }
        Insert: {
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          attendee_type?: Database["public"]["Enums"]["attendee_type"]
          checked_in_at?: string | null
          checked_in_by?: string | null
          church_id: string
          created_at?: string
          event_id: string
          full_name: string
          id?: string
          person_id?: string | null
          registration_id: string
          updated_at?: string
        }
        Update: {
          attendance_status?: Database["public"]["Enums"]["attendance_status"]
          attendee_type?: Database["public"]["Enums"]["attendee_type"]
          checked_in_at?: string | null
          checked_in_by?: string | null
          church_id?: string
          created_at?: string
          event_id?: string
          full_name?: string
          id?: string
          person_id?: string | null
          registration_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_attendees_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_attendees_event_id_church_id_fkey"
            columns: ["event_id", "church_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "registration_attendees_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_attendees_registration_id_church_id_fkey"
            columns: ["registration_id", "church_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id", "church_id"]
          },
        ]
      }
      registrations: {
        Row: {
          attendees_count: number
          cancel_reason: string | null
          cancel_token: string | null
          cancel_token_expires_at: string | null
          cancel_token_hash: string | null
          cancelled_at: string | null
          church_id: string
          confirmed_at: string | null
          created_by: string | null
          event_id: string
          form_submission_id: string | null
          id: string
          idempotency_key: string | null
          primary_email: string
          primary_name: string
          primary_person_id: string | null
          primary_phone: string | null
          registered_at: string
          registration_code: string
          registration_type: Database["public"]["Enums"]["event_registration_type"]
          source: Database["public"]["Enums"]["registration_source"]
          status: Database["public"]["Enums"]["registration_status"]
          updated_at: string
          waitlist_position: number | null
        }
        Insert: {
          attendees_count?: number
          cancel_reason?: string | null
          cancel_token?: string | null
          cancel_token_expires_at?: string | null
          cancel_token_hash?: string | null
          cancelled_at?: string | null
          church_id: string
          confirmed_at?: string | null
          created_by?: string | null
          event_id: string
          form_submission_id?: string | null
          id?: string
          idempotency_key?: string | null
          primary_email: string
          primary_name: string
          primary_person_id?: string | null
          primary_phone?: string | null
          registered_at?: string
          registration_code: string
          registration_type?: Database["public"]["Enums"]["event_registration_type"]
          source?: Database["public"]["Enums"]["registration_source"]
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string
          waitlist_position?: number | null
        }
        Update: {
          attendees_count?: number
          cancel_reason?: string | null
          cancel_token?: string | null
          cancel_token_expires_at?: string | null
          cancel_token_hash?: string | null
          cancelled_at?: string | null
          church_id?: string
          confirmed_at?: string | null
          created_by?: string | null
          event_id?: string
          form_submission_id?: string | null
          id?: string
          idempotency_key?: string | null
          primary_email?: string
          primary_name?: string
          primary_person_id?: string | null
          primary_phone?: string | null
          registered_at?: string
          registration_code?: string
          registration_type?: Database["public"]["Enums"]["event_registration_type"]
          source?: Database["public"]["Enums"]["registration_source"]
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_church_id_fkey"
            columns: ["event_id", "church_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "registrations_form_submission_id_church_id_fkey"
            columns: ["form_submission_id", "church_id"]
            isOneToOne: false
            referencedRelation: "form_submissions"
            referencedColumns: ["id", "church_id"]
          },
          {
            foreignKeyName: "registrations_primary_person_id_fkey"
            columns: ["primary_person_id"]
            isOneToOne: false
            referencedRelation: "people"
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
            | Database["public"]["Enums"]["service_operational_level"]
            | null
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
      add_group_leader: {
        Args: {
          p_group_id: string
          p_person_id: string
          p_role?: Database["public"]["Enums"]["group_leader_role"]
        }
        Returns: string
      }
      add_group_member: {
        Args: { p_group_id: string; p_input?: Json; p_person_id: string }
        Returns: string
      }
      admin_cancel_registration: {
        Args: { p_reason?: string; p_registration_id: string }
        Returns: {
          promoted_count: number
          registration_id: string
          status: Database["public"]["Enums"]["registration_status"]
        }[]
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
      cancel_cohort_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: undefined
      }
      cancel_communication: {
        Args: { p_communication_id: string }
        Returns: undefined
      }
      cancel_group_join_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      cancel_group_meeting: {
        Args: { p_group_meeting_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_registration_by_token: {
        Args: { p_cancel_token: string; p_reason?: string }
        Returns: {
          promoted_count: number
          registration_id: string
          status: Database["public"]["Enums"]["registration_status"]
        }[]
      }
      cancel_substitution_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      checkin_attendee: {
        Args: { p_attendee_id: string }
        Returns: {
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          attendee_id: string
          checked_in_at: string
        }[]
      }
      claim_notification_deliveries: {
        Args: { p_channel: string; p_limit?: number }
        Returns: {
          activity_id: string
          attempts: number
          body: string
          channel: string
          church_id: string
          delivery_id: string
          entity_id: string
          entity_type: string
          notification_id: string
          person_id: string
          scheduled_for: string
          title: string
        }[]
      }
      cohort_completion_suggestions: {
        Args: { p_cohort_id: string }
        Returns: {
          attendance_ratio: number
          display_name: string
          enrollment_id: string
          person_id: string
          sessions_attended: number
          sessions_total: number
          suggested: boolean
        }[]
      }
      cohort_notes: { Args: { p_cohort_id: string }; Returns: string }
      communication_metrics: {
        Args: { p_communication_id: string }
        Returns: Json
      }
      complete_cohort_enrollment: {
        Args: { p_enrollment_id: string; p_note?: string }
        Returns: undefined
      }
      complete_notification_delivery: {
        Args: { p_delivery_id: string; p_error?: string; p_status: string }
        Returns: Json
      }
      count_my_unread_notifications: {
        Args: { p_church_id: string }
        Returns: number
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
      create_cohort: {
        Args: { p_course_id: string; p_input: Json }
        Returns: string
      }
      create_communication: {
        Args: {
          p_body_template: string
          p_channels: Database["public"]["Enums"]["notification_channel"][]
          p_church_id: string
          p_purpose: Database["public"]["Enums"]["communication_purpose"]
          p_rules: Json
          p_segment_id?: string
          p_service_area_id?: string
          p_subject: string
          p_template_id?: string
          p_title: string
        }
        Returns: string
      }
      create_group: {
        Args: { p_church_id: string; p_input: Json }
        Returns: string
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
      cron_materialize_communication: {
        Args: { p_communication_id: string }
        Returns: Json
      }
      cron_send_communication: {
        Args: { p_batch_limit?: number; p_communication_id: string }
        Returns: Json
      }
      delete_my_unavailability_period: { Args: { p_id: string }; Returns: Json }
      delete_my_weekly_unavailability: { Args: { p_id: string }; Returns: Json }
      discipleship_metrics: { Args: { p_church_id: string }; Returns: Json }
      drop_cohort_enrollment: {
        Args: { p_enrollment_id: string; p_reason?: string }
        Returns: undefined
      }
      due_scheduled_communications: {
        Args: { p_limit?: number }
        Returns: {
          id: string
        }[]
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
      end_group_leadership: {
        Args: { p_group_id: string; p_person_id: string }
        Returns: undefined
      }
      enqueue_due_reminders: { Args: never; Returns: Json }
      enroll_person_in_cohort: {
        Args: { p_cohort_id: string; p_person_id: string }
        Returns: string
      }
      escalate_uncovered_positions: { Args: never; Returns: Json }
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
      event_registration_status: {
        Args: { p_event_id: string }
        Returns: Database["public"]["Enums"]["event_registration_status"]
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
      group_metrics: { Args: { p_church_id: string }; Returns: Json }
      group_roster: {
        Args: { p_group_id: string }
        Returns: {
          contact_visible: boolean
          display_name: string
          email: string
          joined_at: string
          person_id: string
          phone: string
          role: string
          status: string
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
      kids_add_session_staff: {
        Args: { p_person_id: string; p_role?: string; p_session_id: string }
        Returns: string
      }
      kids_authorized_pickups: {
        Args: { p_church_id: string; p_kid_person_id: string }
        Returns: {
          authorization_type: Database["public"]["Enums"]["pickup_authorization_type"]
          authorized_name_snapshot: string
          id: string
          relation_text: string
        }[]
      }
      kids_checkin: {
        Args: { p_kid_person_id: string; p_session_id: string }
        Returns: {
          checkin_id: string
          pickup_code: string
          replayed: boolean
        }[]
      }
      kids_checkout: {
        Args: {
          p_authorized_pickup_id?: string
          p_override_reason?: string
          p_pickup_code: string
          p_pickup_person_name: string
          p_session_id: string
        }
        Returns: {
          authorized: boolean
          checkin_id: string
          status: Database["public"]["Enums"]["kid_checkin_status"]
        }[]
      }
      kids_lookup_pickup: {
        Args: { p_pickup_code: string; p_session_id: string }
        Returns: {
          checkin_id: string
          kid_name: string
          kid_person_id: string
          medical_alert: boolean
          room_name: string
        }[]
      }
      kids_remove_session_staff: {
        Args: { p_reason?: string; p_staff_id: string }
        Returns: undefined
      }
      kids_room_ratio_status: {
        Args: { p_session_id: string }
        Returns: {
          children_checked_in: number
          max_children_for_current_staff: number
          min_adults_required: number
          ratio_children_per_adult: number
          staff_checked_in: number
          state: Database["public"]["Enums"]["kids_ratio_state"]
        }[]
      }
      kids_save_sensitive_notes: {
        Args: {
          p_accessibility_notes: string
          p_church_id: string
          p_emergency_notes: string
          p_kid_person_id: string
        }
        Returns: undefined
      }
      kids_staff_check_in: { Args: { p_staff_id: string }; Returns: undefined }
      kids_staff_check_out: { Args: { p_staff_id: string }; Returns: undefined }
      kids_staff_eligibility: {
        Args: { p_campus_id?: string; p_church_id: string; p_person_id: string }
        Returns: {
          eligible: boolean
          reasons: string[]
        }[]
      }
      list_group_meetings: {
        Args: {
          p_from?: string
          p_group_id: string
          p_limit?: number
          p_to?: string
        }
        Returns: {
          activity_id: string
          attendance_count: number
          attendance_recorded_at: string
          cancellation_reason: string
          cancelled_at: string
          ends_at: string
          group_meeting_id: string
          location_text: string
          starts_at: string
          timezone: string
          title: string
        }[]
      }
      list_my_communication_category_preferences: {
        Args: { p_church_id: string }
        Returns: {
          category: Database["public"]["Enums"]["communication_purpose"]
          opted_out: boolean
        }[]
      }
      list_my_notifications: {
        Args: { p_church_id: string; p_limit?: number; p_only_unread?: boolean }
        Returns: {
          activity_id: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          read_at: string
          title: string
        }[]
      }
      mark_all_notifications_read: {
        Args: { p_church_id: string }
        Returns: Json
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      materialize_communication: {
        Args: { p_communication_id: string }
        Returns: Json
      }
      module_enabled: {
        Args: { p_church_id: string; p_module_key: string }
        Returns: boolean
      }
      my_respondable_assignments_count: {
        Args: { p_church_id: string }
        Returns: number
      }
      notify_event_registrants: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_include_statuses?: Database["public"]["Enums"]["registration_status"][]
          p_key_suffix?: string
        }
        Returns: number
      }
      notify_group_members: {
        Args: {
          p_event_type: string
          p_extra?: Json
          p_group_id: string
          p_key_suffix?: string
        }
        Returns: number
      }
      pending_send_communications: {
        Args: { p_limit?: number }
        Returns: {
          id: string
        }[]
      }
      person_path_progress_view: {
        Args: { p_learning_path_id: string; p_person_id: string }
        Returns: {
          archived: boolean
          completed_at: string
          is_required: boolean
          kind: Database["public"]["Enums"]["path_step_kind"]
          path_step_id: string
          status: Database["public"]["Enums"]["path_progress_status"]
          step_order: number
          title: string
        }[]
      }
      people_birth_dates: {
        Args: { p_church_id: string; p_person_ids: string[] }
        Returns: {
          birth_date: string
          person_id: string
        }[]
      }
      person_contact: {
        Args: { p_church_id: string; p_person_id: string }
        Returns: {
          birth_date: string
          can_read_contact: boolean
          email: string
          notes: string
          person_id: string
          phone: string
        }[]
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
      preview_communication_segment: {
        Args: {
          p_channels: Database["public"]["Enums"]["notification_channel"][]
          p_church_id: string
          p_rules: Json
        }
        Returns: Json
      }
      process_notification_events: { Args: { p_limit?: number }; Returns: Json }
      promote_waitlist: { Args: { p_event_id: string }; Returns: number }
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
      public_consent_definitions: {
        Args: { p_church_slug: string }
        Returns: {
          body: string
          consent_key: string
          purpose_type: string
          title: string
          version: number
        }[]
      }
      public_event_by_slug: {
        Args: { p_church_slug: string; p_event_slug: string }
        Returns: {
          capacity: number
          church_name: string
          confirmed_count: number
          contact_email: string
          contact_phone: string
          cover_image_url: string
          ends_at: string
          event_id: string
          location_text: string
          public_description: string
          registration_status: Database["public"]["Enums"]["event_registration_status"]
          registration_type: Database["public"]["Enums"]["event_registration_type"]
          short_description: string
          starts_at: string
          timezone: string
          title: string
        }[]
      }
      public_form_fields: {
        Args: { p_event_id: string }
        Returns: {
          field_key: string
          help_text: string
          label: string
          options: Json
          required: boolean
          sort_order: number
          type: Database["public"]["Enums"]["form_field_type"]
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
      record_group_attendance: {
        Args: { p_entries: Json; p_group_meeting_id: string }
        Returns: number
      }
      record_session_attendance: {
        Args: { p_entries: Json; p_session_id: string }
        Returns: number
      }
      register_for_event: {
        Args: {
          p_answers?: Json
          p_attendees?: Json
          p_consents?: Json
          p_event_id: string
          p_idempotency_key?: string
          p_primary_email: string
          p_primary_name: string
          p_primary_person_id?: string
          p_primary_phone?: string
          p_registration_type: Database["public"]["Enums"]["event_registration_type"]
        }
        Returns: {
          cancel_token: string
          registration_code: string
          registration_id: string
          replayed: boolean
          status: Database["public"]["Enums"]["registration_status"]
          waitlist_position: number
        }[]
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
      remove_group_member: {
        Args: { p_group_id: string; p_input?: Json; p_person_id: string }
        Returns: undefined
      }
      reorder_activity_plan_items: {
        Args: { p_activity_id: string; p_item_ids: string[] }
        Returns: undefined
      }
      reorder_path_steps: {
        Args: { p_learning_path_id: string; p_step_ids: string[] }
        Returns: number
      }
      request_assignment_substitution: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      request_cohort_enrollment: {
        Args: { p_cohort_id: string; p_message?: string }
        Returns: string
      }
      request_group_join: {
        Args: { p_group_id: string; p_message?: string }
        Returns: string
      }
      reschedule_cohort_session: {
        Args: { p_input: Json; p_session_id: string }
        Returns: undefined
      }
      reschedule_group_meeting: {
        Args: { p_group_meeting_id: string; p_input: Json }
        Returns: undefined
      }
      resolve_cohort_enrollment: {
        Args: { p_accept: boolean; p_enrollment_id: string; p_note?: string }
        Returns: undefined
      }
      resolve_group_join_request: {
        Args: { p_accept: boolean; p_note?: string; p_request_id: string }
        Returns: undefined
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
      save_communication_segment: {
        Args: { p_church_id: string; p_input: Json }
        Returns: string
      }
      save_communication_template: {
        Args: { p_church_id: string; p_input: Json }
        Returns: string
      }
      save_course: {
        Args: { p_church_id: string; p_input: Json }
        Returns: string
      }
      save_group_type: {
        Args: { p_church_id: string; p_input: Json }
        Returns: string
      }
      save_learning_path: {
        Args: { p_church_id: string; p_input: Json }
        Returns: string
      }
      save_path_step: {
        Args: { p_input: Json; p_learning_path_id: string }
        Returns: string
      }
      schedule_cohort_session: {
        Args: { p_cohort_id: string; p_input: Json }
        Returns: Json
      }
      schedule_communication: {
        Args: { p_communication_id: string; p_scheduled_at: string }
        Returns: undefined
      }
      schedule_group_meeting: {
        Args: { p_group_id: string; p_input: Json }
        Returns: Json
      }
      send_activity_assignments: {
        Args: { p_activity_id: string; p_assignment_ids?: string[] }
        Returns: Json
      }
      send_communication: {
        Args: { p_batch_limit?: number; p_communication_id: string }
        Returns: Json
      }
      set_activity_template_archived: {
        Args: { p_archived: boolean; p_template_id: string }
        Returns: undefined
      }
      set_communication_category_preference: {
        Args: {
          p_category: Database["public"]["Enums"]["communication_purpose"]
          p_church_id: string
          p_opted_out: boolean
        }
        Returns: undefined
      }
      set_communication_segment_archived: {
        Args: { p_archived: boolean; p_segment_id: string }
        Returns: undefined
      }
      set_communication_template_archived: {
        Args: { p_archived: boolean; p_template_id: string }
        Returns: undefined
      }
      set_course_archived: {
        Args: { p_archived: boolean; p_course_id: string }
        Returns: undefined
      }
      set_group_archived: {
        Args: { p_archived: boolean; p_group_id: string }
        Returns: undefined
      }
      set_group_status: {
        Args: {
          p_group_id: string
          p_status: Database["public"]["Enums"]["group_status"]
        }
        Returns: undefined
      }
      set_group_type_archived: {
        Args: { p_archived: boolean; p_group_type_id: string }
        Returns: undefined
      }
      set_my_notification_preference: {
        Args: { p_channel: string; p_enabled: boolean }
        Returns: Json
      }
      set_my_serving_preference: {
        Args: {
          p_church_id: string
          p_max_activities_per_month?: number
          p_service_area_id?: string
        }
        Returns: Json
      }
      set_my_unavailability_period: { Args: { p_input: Json }; Returns: Json }
      set_my_weekly_unavailability: { Args: { p_input: Json }; Returns: Json }
      set_path_step_archived: {
        Args: { p_archived: boolean; p_path_step_id: string }
        Returns: undefined
      }
      set_person_path_step: {
        Args: {
          p_note?: string
          p_path_step_id: string
          p_person_id: string
          p_status: Database["public"]["Enums"]["path_progress_status"]
        }
        Returns: string
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slug_available: { Args: { p_slug: string }; Returns: boolean }
      slugify: { Args: { p_input: string }; Returns: string }
      submit_marketing_lead: {
        Args: {
          p_community_size: string
          p_email: string
          p_kind: string
          p_message: string
          p_name: string
          p_organization: string
        }
        Returns: string
      }
      transition_activity_status: {
        Args: {
          p_activity_id: string
          p_reason?: string
          p_to: Database["public"]["Enums"]["activity_status"]
        }
        Returns: Database["public"]["Enums"]["activity_status"]
      }
      unaccent: { Args: { "": string }; Returns: string }
      undo_checkin_attendee: {
        Args: { p_attendee_id: string }
        Returns: {
          attendance_status: Database["public"]["Enums"]["attendance_status"]
          attendee_id: string
        }[]
      }
      unsubscribe_by_token: { Args: { p_token: string }; Returns: Json }
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
      update_cohort: {
        Args: { p_cohort_id: string; p_input: Json }
        Returns: undefined
      }
      update_communication: {
        Args: {
          p_body_template?: string
          p_channels?: Database["public"]["Enums"]["notification_channel"][]
          p_communication_id: string
          p_purpose?: Database["public"]["Enums"]["communication_purpose"]
          p_subject?: string
          p_title?: string
        }
        Returns: undefined
      }
      update_group: {
        Args: { p_group_id: string; p_input: Json }
        Returns: undefined
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
      attendance_status:
        | "registered"
        | "checked_in"
        | "attended"
        | "no_show"
        | "cancelled"
      attendee_type: "adult" | "minor"
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
      communication_failure_kind: "temporary" | "permanent"
      communication_purpose:
        | "institutional"
        | "operational"
        | "services"
        | "groups"
        | "events"
        | "discipleship"
        | "kids"
        | "pastoral"
        | "system"
      communication_recipient_status:
        | "pending"
        | "queued"
        | "sent"
        | "failed"
        | "suppressed"
        | "excluded"
      communication_status:
        | "draft"
        | "scheduled"
        | "processing"
        | "queued"
        | "sent"
        | "partially_sent"
        | "failed"
        | "cancelled"
      course_cohort_status:
        | "planned"
        | "open"
        | "running"
        | "finished"
        | "cancelled"
      course_enrollment_status:
        | "requested"
        | "enrolled"
        | "completed"
        | "dropped"
        | "rejected"
      course_status: "draft" | "active" | "archived"
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
      event_registration_source_hint: "public" | "authenticated" | "admin"
      event_registration_status:
        | "disabled"
        | "scheduled"
        | "open"
        | "full"
        | "closed"
      event_registration_type: "individual" | "household" | "group"
      file_classification: "public" | "internal" | "personal" | "restricted"
      form_field_classification:
        | "normal"
        | "personal"
        | "sensitive"
        | "restricted"
      form_field_type:
        | "text"
        | "textarea"
        | "email"
        | "phone"
        | "number"
        | "date"
        | "select"
        | "multi_select"
        | "checkbox"
        | "boolean"
        | "address"
      group_attendance_status: "present" | "absent" | "excused"
      group_join_policy: "open_request" | "invite_only"
      group_join_request_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "cancelled"
      group_leader_role: "leader" | "coleader"
      group_member_status: "active" | "left" | "removed"
      group_status: "active" | "paused" | "closed"
      group_visibility: "listed" | "private"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      job_status: "queued" | "processing" | "succeeded" | "failed"
      kid_checkin_status: "checked_in" | "checked_out" | "cancelled"
      kids_incident_severity: "low" | "medium" | "high"
      kids_incident_status: "open" | "resolved"
      kids_incident_type:
        | "minor"
        | "medical"
        | "behavioral"
        | "security"
        | "pickup"
        | "other"
      kids_profile_status: "active" | "inactive" | "archived"
      kids_ratio_state: "safe" | "warning" | "blocked"
      kids_session_status: "scheduled" | "open" | "closed" | "cancelled"
      kids_staff_role: "lead" | "assistant" | "support"
      learning_path_status: "draft" | "active" | "archived"
      notification_channel: "inapp" | "email" | "push"
      notification_delivery_status: "queued" | "sent" | "failed" | "suppressed"
      path_progress_status: "pending" | "in_progress" | "completed" | "skipped"
      path_step_kind: "course" | "manual"
      person_source:
        | "manual"
        | "import"
        | "registration"
        | "invitation"
        | "integration"
      pickup_authorization_status:
        | "active"
        | "expired"
        | "revoked"
        | "used"
        | "pending"
      pickup_authorization_type: "permanent" | "date_range" | "one_time"
      position_requirement_strictness: "required" | "recommended"
      position_requirement_type:
        | "qualification"
        | "credential"
        | "minimum_level"
      qualification_level: "basic" | "intermediate" | "advanced" | "expert"
      registration_source: "public" | "authenticated" | "admin"
      registration_status:
        | "pending"
        | "confirmed"
        | "waitlisted"
        | "cancelled"
        | "declined"
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
      attendance_status: [
        "registered",
        "checked_in",
        "attended",
        "no_show",
        "cancelled",
      ],
      attendee_type: ["adult", "minor"],
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
      communication_failure_kind: ["temporary", "permanent"],
      communication_purpose: [
        "institutional",
        "operational",
        "services",
        "groups",
        "events",
        "discipleship",
        "kids",
        "pastoral",
        "system",
      ],
      communication_recipient_status: [
        "pending",
        "queued",
        "sent",
        "failed",
        "suppressed",
        "excluded",
      ],
      communication_status: [
        "draft",
        "scheduled",
        "processing",
        "queued",
        "sent",
        "partially_sent",
        "failed",
        "cancelled",
      ],
      course_cohort_status: [
        "planned",
        "open",
        "running",
        "finished",
        "cancelled",
      ],
      course_enrollment_status: [
        "requested",
        "enrolled",
        "completed",
        "dropped",
        "rejected",
      ],
      course_status: ["draft", "active", "archived"],
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
      event_registration_source_hint: ["public", "authenticated", "admin"],
      event_registration_status: [
        "disabled",
        "scheduled",
        "open",
        "full",
        "closed",
      ],
      event_registration_type: ["individual", "household", "group"],
      file_classification: ["public", "internal", "personal", "restricted"],
      form_field_classification: [
        "normal",
        "personal",
        "sensitive",
        "restricted",
      ],
      form_field_type: [
        "text",
        "textarea",
        "email",
        "phone",
        "number",
        "date",
        "select",
        "multi_select",
        "checkbox",
        "boolean",
        "address",
      ],
      group_attendance_status: ["present", "absent", "excused"],
      group_join_policy: ["open_request", "invite_only"],
      group_join_request_status: [
        "pending",
        "accepted",
        "rejected",
        "cancelled",
      ],
      group_leader_role: ["leader", "coleader"],
      group_member_status: ["active", "left", "removed"],
      group_status: ["active", "paused", "closed"],
      group_visibility: ["listed", "private"],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      job_status: ["queued", "processing", "succeeded", "failed"],
      kid_checkin_status: ["checked_in", "checked_out", "cancelled"],
      kids_incident_severity: ["low", "medium", "high"],
      kids_incident_status: ["open", "resolved"],
      kids_incident_type: [
        "minor",
        "medical",
        "behavioral",
        "security",
        "pickup",
        "other",
      ],
      kids_profile_status: ["active", "inactive", "archived"],
      kids_ratio_state: ["safe", "warning", "blocked"],
      kids_session_status: ["scheduled", "open", "closed", "cancelled"],
      kids_staff_role: ["lead", "assistant", "support"],
      learning_path_status: ["draft", "active", "archived"],
      notification_channel: ["inapp", "email", "push"],
      notification_delivery_status: ["queued", "sent", "failed", "suppressed"],
      path_progress_status: ["pending", "in_progress", "completed", "skipped"],
      path_step_kind: ["course", "manual"],
      person_source: [
        "manual",
        "import",
        "registration",
        "invitation",
        "integration",
      ],
      pickup_authorization_status: [
        "active",
        "expired",
        "revoked",
        "used",
        "pending",
      ],
      pickup_authorization_type: ["permanent", "date_range", "one_time"],
      position_requirement_strictness: ["required", "recommended"],
      position_requirement_type: [
        "qualification",
        "credential",
        "minimum_level",
      ],
      qualification_level: ["basic", "intermediate", "advanced", "expert"],
      registration_source: ["public", "authenticated", "admin"],
      registration_status: [
        "pending",
        "confirmed",
        "waitlisted",
        "cancelled",
        "declined",
      ],
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

