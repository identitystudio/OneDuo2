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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_jobs: {
        Row: {
          api_key_id: string | null
          artifact_url: string | null
          callback_response_status: number | null
          callback_sent_at: string | null
          callback_url: string | null
          client_metadata: Json | null
          course_id: string | null
          created_at: string | null
          error_message: string | null
          id: string
          pdf_url: string | null
          progress: number | null
          progress_step: string | null
          status: string | null
          updated_at: string | null
          video_url: string
        }
        Insert: {
          api_key_id?: string | null
          artifact_url?: string | null
          callback_response_status?: number | null
          callback_sent_at?: string | null
          callback_url?: string | null
          client_metadata?: Json | null
          course_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          pdf_url?: string | null
          progress?: number | null
          progress_step?: string | null
          status?: string | null
          updated_at?: string | null
          video_url: string
        }
        Update: {
          api_key_id?: string | null
          artifact_url?: string | null
          callback_response_status?: number | null
          callback_sent_at?: string | null
          callback_url?: string | null
          client_metadata?: Json | null
          course_id?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          pdf_url?: string | null
          progress?: number | null
          progress_step?: string | null
          status?: string | null
          updated_at?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_jobs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_jobs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_jobs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          active: boolean | null
          created_at: string | null
          credits_remaining: number | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rate_limit_per_hour: number | null
          user_id: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          credits_remaining?: number | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          rate_limit_per_hour?: number | null
          user_id?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          credits_remaining?: number | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_hour?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          api_key_id: string | null
          cost_cents: number | null
          created_at: string | null
          endpoint: string
          id: string
          job_id: string | null
          request_metadata: Json | null
          response_status: number | null
          video_duration_seconds: number | null
        }
        Insert: {
          api_key_id?: string | null
          cost_cents?: number | null
          created_at?: string | null
          endpoint: string
          id?: string
          job_id?: string | null
          request_metadata?: Json | null
          response_status?: number | null
          video_duration_seconds?: number | null
        }
        Update: {
          api_key_id?: string | null
          cost_cents?: number | null
          created_at?: string | null
          endpoint?: string
          id?: string
          job_id?: string | null
          request_metadata?: Json | null
          response_status?: number | null
          video_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_gates: {
        Row: {
          active: boolean | null
          approver_roles: string[] | null
          auto_approve_conditions: Json | null
          created_at: string
          entity_types: string[]
          gate_name: string
          id: string
          operation_pattern: string
          requires_approval: boolean | null
          timeout_minutes: number | null
        }
        Insert: {
          active?: boolean | null
          approver_roles?: string[] | null
          auto_approve_conditions?: Json | null
          created_at?: string
          entity_types: string[]
          gate_name: string
          id?: string
          operation_pattern: string
          requires_approval?: boolean | null
          timeout_minutes?: number | null
        }
        Update: {
          active?: boolean | null
          approver_roles?: string[] | null
          auto_approve_conditions?: Json | null
          created_at?: string
          entity_types?: string[]
          gate_name?: string
          id?: string
          operation_pattern?: string
          requires_approval?: boolean | null
          timeout_minutes?: number | null
        }
        Relationships: []
      }
      artifact_access_log: {
        Row: {
          access_type: string
          accessed_at: string | null
          accessor_hash: string | null
          course_id: string
          download_completed: boolean | null
          download_source: string | null
          id: string
          ip_address: string | null
          module_id: string | null
          referrer: string | null
          session_fingerprint: string | null
          user_agent: string | null
        }
        Insert: {
          access_type: string
          accessed_at?: string | null
          accessor_hash?: string | null
          course_id: string
          download_completed?: boolean | null
          download_source?: string | null
          id?: string
          ip_address?: string | null
          module_id?: string | null
          referrer?: string | null
          session_fingerprint?: string | null
          user_agent?: string | null
        }
        Update: {
          access_type?: string
          accessed_at?: string | null
          accessor_hash?: string | null
          course_id?: string
          download_completed?: boolean | null
          download_source?: string | null
          id?: string
          ip_address?: string | null
          module_id?: string | null
          referrer?: string | null
          session_fingerprint?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      artifact_frames: {
        Row: {
          artifact_id: string
          confidence_level: string
          confidence_score: number
          created_at: string | null
          cursor_pause: boolean | null
          frame_index: number
          id: string
          is_critical: boolean | null
          lingering_frame: boolean | null
          ocr_text: string | null
          screenshot_url: string | null
          text_selected: boolean | null
          timestamp_ms: number
          zoom_focus: boolean | null
        }
        Insert: {
          artifact_id: string
          confidence_level?: string
          confidence_score?: number
          created_at?: string | null
          cursor_pause?: boolean | null
          frame_index: number
          id?: string
          is_critical?: boolean | null
          lingering_frame?: boolean | null
          ocr_text?: string | null
          screenshot_url?: string | null
          text_selected?: boolean | null
          timestamp_ms: number
          zoom_focus?: boolean | null
        }
        Update: {
          artifact_id?: string
          confidence_level?: string
          confidence_score?: number
          created_at?: string | null
          cursor_pause?: boolean | null
          frame_index?: number
          id?: string
          is_critical?: boolean | null
          lingering_frame?: boolean | null
          ocr_text?: string | null
          screenshot_url?: string | null
          text_selected?: boolean | null
          timestamp_ms?: number
          zoom_focus?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "artifact_frames_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "transformation_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      character_insights: {
        Row: {
          confidence: number
          created_at: string
          id: string
          insight_key: string
          insight_type: string
          insight_value: string
          learned_from: string | null
          series_id: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          insight_key: string
          insight_type: string
          insight_value: string
          learned_from?: string | null
          series_id?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          insight_key?: string
          insight_type?: string
          insight_value?: string
          learned_from?: string | null
          series_id?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      constraint_violations: {
        Row: {
          actual_state: Json
          constraint_name: string
          detected_at: string
          entity_id: string
          entity_type: string
          expected_state: Json
          id: string
          resolution_frame_id: string | null
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          violation_type: string
        }
        Insert: {
          actual_state: Json
          constraint_name: string
          detected_at?: string
          entity_id: string
          entity_type: string
          expected_state: Json
          id?: string
          resolution_frame_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          violation_type: string
        }
        Update: {
          actual_state?: Json
          constraint_name?: string
          detected_at?: string
          entity_id?: string
          entity_type?: string
          expected_state?: Json
          id?: string
          resolution_frame_id?: string | null
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "constraint_violations_resolution_frame_id_fkey"
            columns: ["resolution_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      course_chats: {
        Row: {
          content: string
          course_id: string
          created_at: string
          frame_references: Json | null
          id: string
          role: string
        }
        Insert: {
          content: string
          course_id: string
          created_at?: string
          frame_references?: Json | null
          id?: string
          role: string
        }
        Update: {
          content?: string
          course_id?: string
          created_at?: string
          frame_references?: Json | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_chats_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_chats_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          ai_context: string | null
          audio_events: Json | null
          checksum_verified: boolean | null
          chunk_count: number | null
          chunked: boolean | null
          completed_at: string | null
          completed_chunks: number | null
          completed_gifs: number | null
          course_id: string
          created_at: string
          email_sent_at: string | null
          error_message: string | null
          estimated_completion_time: string | null
          frame_urls: Json | null
          gif_storage_paths: Json | null
          heartbeat_at: string | null
          id: string
          last_error: string | null
          module_files: Json | null
          module_number: number
          processing_started_at: string | null
          processing_state: string | null
          progress: number
          progress_step: string | null
          prosody_annotations: Json | null
          purge_frame_id: string | null
          purged: boolean | null
          purged_at: string | null
          purged_by: string | null
          retry_count: number | null
          source_purged_at: string | null
          source_videos: Json | null
          status: string
          step_completed: Json | null
          stitch_status: string | null
          stitched_video_url: string | null
          storage_path: string | null
          title: string
          total_frames: number | null
          total_gifs: number | null
          transcript: Json | null
          updated_at: string
          upload_checksum: string | null
          video_duration_seconds: number | null
          video_url: string
        }
        Insert: {
          ai_context?: string | null
          audio_events?: Json | null
          checksum_verified?: boolean | null
          chunk_count?: number | null
          chunked?: boolean | null
          completed_at?: string | null
          completed_chunks?: number | null
          completed_gifs?: number | null
          course_id: string
          created_at?: string
          email_sent_at?: string | null
          error_message?: string | null
          estimated_completion_time?: string | null
          frame_urls?: Json | null
          gif_storage_paths?: Json | null
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          module_files?: Json | null
          module_number: number
          processing_started_at?: string | null
          processing_state?: string | null
          progress?: number
          progress_step?: string | null
          prosody_annotations?: Json | null
          purge_frame_id?: string | null
          purged?: boolean | null
          purged_at?: string | null
          purged_by?: string | null
          retry_count?: number | null
          source_purged_at?: string | null
          source_videos?: Json | null
          status?: string
          step_completed?: Json | null
          stitch_status?: string | null
          stitched_video_url?: string | null
          storage_path?: string | null
          title: string
          total_frames?: number | null
          total_gifs?: number | null
          transcript?: Json | null
          updated_at?: string
          upload_checksum?: string | null
          video_duration_seconds?: number | null
          video_url: string
        }
        Update: {
          ai_context?: string | null
          audio_events?: Json | null
          checksum_verified?: boolean | null
          chunk_count?: number | null
          chunked?: boolean | null
          completed_at?: string | null
          completed_chunks?: number | null
          completed_gifs?: number | null
          course_id?: string
          created_at?: string
          email_sent_at?: string | null
          error_message?: string | null
          estimated_completion_time?: string | null
          frame_urls?: Json | null
          gif_storage_paths?: Json | null
          heartbeat_at?: string | null
          id?: string
          last_error?: string | null
          module_files?: Json | null
          module_number?: number
          processing_started_at?: string | null
          processing_state?: string | null
          progress?: number
          progress_step?: string | null
          prosody_annotations?: Json | null
          purge_frame_id?: string | null
          purged?: boolean | null
          purged_at?: string | null
          purged_by?: string | null
          retry_count?: number | null
          source_purged_at?: string | null
          source_videos?: Json | null
          status?: string
          step_completed?: Json | null
          stitch_status?: string | null
          stitched_video_url?: string | null
          storage_path?: string | null
          title?: string
          total_frames?: number | null
          total_gifs?: number | null
          transcript?: Json | null
          updated_at?: string
          upload_checksum?: string | null
          video_duration_seconds?: number | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_modules_purge_frame_id_fkey"
            columns: ["purge_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      course_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          course_id: string
          created_at: string
          id: string
          module_index: number | null
          notes: string | null
          step_description: string | null
          step_number: number
          step_title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          module_index?: number | null
          notes?: string | null
          step_description?: string | null
          step_number: number
          step_title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          module_index?: number | null
          notes?: string | null
          step_description?: string | null
          step_number?: number
          step_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_progress_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          ai_context: string | null
          artifact_schema_version: number | null
          audio_events: Json | null
          batch_id: string | null
          canonical_artifact_id: string | null
          chunk_count: number | null
          chunked: boolean | null
          chunking_strategy: string | null
          completed_at: string | null
          completed_chunks: number | null
          completed_gifs: number | null
          completed_modules: number | null
          constraint_status: string | null
          content_attestation_at: string | null
          content_attestation_ip: string | null
          course_files: Json | null
          created_at: string
          current_frame_id: string | null
          density_mode: string
          description: string | null
          email: string
          email_hash: string | null
          error_message: string | null
          estimated_completion_time: string | null
          estimated_cost_cents: number | null
          fix_attempts: number | null
          fps_target: number
          frame_urls: Json | null
          gif_storage_paths: Json | null
          governance_locked: boolean | null
          id: string
          is_multi_module: boolean | null
          last_constraint_check: string | null
          last_fix_strategy: string | null
          last_heartbeat_at: string | null
          max_retries: number | null
          merged_course_mode: boolean | null
          module_count: number | null
          modules: Json | null
          owner_notified_at: string | null
          pdf_revision_pending: boolean | null
          processed_frames: number | null
          processing_started_at: string | null
          progress: number
          progress_step: string | null
          project_id: string | null
          prosody_annotations: Json | null
          purge_frame_id: string | null
          purged: boolean | null
          purged_at: string | null
          purged_by: string | null
          retry_count: number | null
          send_per_module_emails: boolean | null
          share_enabled: boolean | null
          share_token: string | null
          source_purged_at: string | null
          started_at: string | null
          status: string
          storage_path: string | null
          team_notification_email: string | null
          team_notification_role: string | null
          team_notified_at: string | null
          title: string
          total_frames: number | null
          total_gifs: number | null
          transcript: Json | null
          updated_at: string
          user_id: string | null
          video_duration_seconds: number | null
          video_filename: string | null
          video_url: string | null
        }
        Insert: {
          ai_context?: string | null
          artifact_schema_version?: number | null
          audio_events?: Json | null
          batch_id?: string | null
          canonical_artifact_id?: string | null
          chunk_count?: number | null
          chunked?: boolean | null
          chunking_strategy?: string | null
          completed_at?: string | null
          completed_chunks?: number | null
          completed_gifs?: number | null
          completed_modules?: number | null
          constraint_status?: string | null
          content_attestation_at?: string | null
          content_attestation_ip?: string | null
          course_files?: Json | null
          created_at?: string
          current_frame_id?: string | null
          density_mode?: string
          description?: string | null
          email: string
          email_hash?: string | null
          error_message?: string | null
          estimated_completion_time?: string | null
          estimated_cost_cents?: number | null
          fix_attempts?: number | null
          fps_target?: number
          frame_urls?: Json | null
          gif_storage_paths?: Json | null
          governance_locked?: boolean | null
          id?: string
          is_multi_module?: boolean | null
          last_constraint_check?: string | null
          last_fix_strategy?: string | null
          last_heartbeat_at?: string | null
          max_retries?: number | null
          merged_course_mode?: boolean | null
          module_count?: number | null
          modules?: Json | null
          owner_notified_at?: string | null
          pdf_revision_pending?: boolean | null
          processed_frames?: number | null
          processing_started_at?: string | null
          progress?: number
          progress_step?: string | null
          project_id?: string | null
          prosody_annotations?: Json | null
          purge_frame_id?: string | null
          purged?: boolean | null
          purged_at?: string | null
          purged_by?: string | null
          retry_count?: number | null
          send_per_module_emails?: boolean | null
          share_enabled?: boolean | null
          share_token?: string | null
          source_purged_at?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          team_notification_email?: string | null
          team_notification_role?: string | null
          team_notified_at?: string | null
          title: string
          total_frames?: number | null
          total_gifs?: number | null
          transcript?: Json | null
          updated_at?: string
          user_id?: string | null
          video_duration_seconds?: number | null
          video_filename?: string | null
          video_url?: string | null
        }
        Update: {
          ai_context?: string | null
          artifact_schema_version?: number | null
          audio_events?: Json | null
          batch_id?: string | null
          canonical_artifact_id?: string | null
          chunk_count?: number | null
          chunked?: boolean | null
          chunking_strategy?: string | null
          completed_at?: string | null
          completed_chunks?: number | null
          completed_gifs?: number | null
          completed_modules?: number | null
          constraint_status?: string | null
          content_attestation_at?: string | null
          content_attestation_ip?: string | null
          course_files?: Json | null
          created_at?: string
          current_frame_id?: string | null
          density_mode?: string
          description?: string | null
          email?: string
          email_hash?: string | null
          error_message?: string | null
          estimated_completion_time?: string | null
          estimated_cost_cents?: number | null
          fix_attempts?: number | null
          fps_target?: number
          frame_urls?: Json | null
          gif_storage_paths?: Json | null
          governance_locked?: boolean | null
          id?: string
          is_multi_module?: boolean | null
          last_constraint_check?: string | null
          last_fix_strategy?: string | null
          last_heartbeat_at?: string | null
          max_retries?: number | null
          merged_course_mode?: boolean | null
          module_count?: number | null
          modules?: Json | null
          owner_notified_at?: string | null
          pdf_revision_pending?: boolean | null
          processed_frames?: number | null
          processing_started_at?: string | null
          progress?: number
          progress_step?: string | null
          project_id?: string | null
          prosody_annotations?: Json | null
          purge_frame_id?: string | null
          purged?: boolean | null
          purged_at?: string | null
          purged_by?: string | null
          retry_count?: number | null
          send_per_module_emails?: boolean | null
          share_enabled?: boolean | null
          share_token?: string | null
          source_purged_at?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          team_notification_email?: string | null
          team_notification_role?: string | null
          team_notified_at?: string | null
          title?: string
          total_frames?: number | null
          total_gifs?: number | null
          transcript?: Json | null
          updated_at?: string
          user_id?: string | null
          video_duration_seconds?: number | null
          video_filename?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_canonical_artifact_id_fkey"
            columns: ["canonical_artifact_id"]
            isOneToOne: false
            referencedRelation: "transformation_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_current_frame_id_fkey"
            columns: ["current_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_purge_frame_id_fkey"
            columns: ["purge_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_queue: {
        Row: {
          can_retry: boolean | null
          created_at: string | null
          entity_id: string
          entity_type: string
          failure_context: Json | null
          failure_reason: string
          id: string
          last_retry_at: string | null
          max_retries: number | null
          original_payload: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number | null
        }
        Insert: {
          can_retry?: boolean | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          failure_context?: Json | null
          failure_reason: string
          id?: string
          last_retry_at?: string | null
          max_retries?: number | null
          original_payload?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
        }
        Update: {
          can_retry?: boolean | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          failure_context?: Json | null
          failure_reason?: string
          id?: string
          last_retry_at?: string | null
          max_retries?: number | null
          original_payload?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          clicked: boolean | null
          created_at: string
          email_number: number
          id: string
          opened: boolean | null
          resend_id: string | null
          sent_at: string
          subscriber_id: string
        }
        Insert: {
          clicked?: boolean | null
          created_at?: string
          email_number: number
          id?: string
          opened?: boolean | null
          resend_id?: string | null
          sent_at?: string
          subscriber_id: string
        }
        Update: {
          clicked?: boolean | null
          created_at?: string
          email_number?: number
          id?: string
          opened?: boolean | null
          resend_id?: string | null
          sent_at?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "email_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      email_subscribers: {
        Row: {
          created_at: string
          current_tag: Database["public"]["Enums"]["subscriber_tag"]
          email: string
          first_name: string | null
          id: string
          next_email_at: string | null
          optin_date: string
          optin_source: Database["public"]["Enums"]["optin_source"]
          purchase_date: string | null
          purchased: boolean
          sequence_day: number | null
          unsubscribed: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_tag?: Database["public"]["Enums"]["subscriber_tag"]
          email: string
          first_name?: string | null
          id?: string
          next_email_at?: string | null
          optin_date?: string
          optin_source?: Database["public"]["Enums"]["optin_source"]
          purchase_date?: string | null
          purchased?: boolean
          sequence_day?: number | null
          unsubscribed?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_tag?: Database["public"]["Enums"]["subscriber_tag"]
          email?: string
          first_name?: string | null
          id?: string
          next_email_at?: string | null
          optin_date?: string
          optin_source?: Database["public"]["Enums"]["optin_source"]
          purchase_date?: string | null
          purchased?: boolean
          sequence_day?: number | null
          unsubscribed?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          attempt_number: number
          course_id: string | null
          created_at: string
          error_message: string
          error_type: string
          fix_attempted: boolean
          fix_strategy: string | null
          fix_succeeded: boolean | null
          id: string
          module_id: string | null
          step: string
        }
        Insert: {
          attempt_number?: number
          course_id?: string | null
          created_at?: string
          error_message: string
          error_type: string
          fix_attempted?: boolean
          fix_strategy?: string | null
          fix_succeeded?: boolean | null
          id?: string
          module_id?: string | null
          step: string
        }
        Update: {
          attempt_number?: number
          course_id?: string | null
          created_at?: string
          error_message?: string
          error_type?: string
          fix_attempted?: boolean
          fix_strategy?: string | null
          fix_succeeded?: boolean | null
          id?: string
          module_id?: string | null
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_logs_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_frames: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          constraint_violations: Json | null
          executed: boolean | null
          executed_at: string | null
          frame_type: string
          id: string
          initiated_at: string
          initiated_by: string
          metadata: Json | null
          proposed_state: Json
          target_entity: string
          target_operation: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          constraint_violations?: Json | null
          executed?: boolean | null
          executed_at?: string | null
          frame_type: string
          id?: string
          initiated_at?: string
          initiated_by: string
          metadata?: Json | null
          proposed_state: Json
          target_entity: string
          target_operation: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          constraint_violations?: Json | null
          executed?: boolean | null
          executed_at?: string | null
          frame_type?: string
          id?: string
          initiated_at?: string
          initiated_by?: string
          metadata?: Json | null
          proposed_state?: Json
          target_entity?: string
          target_operation?: string
        }
        Relationships: []
      }
      gif_segments: {
        Row: {
          created_at: string
          file_size_bytes: number | null
          frame_count: number | null
          id: string
          segment_number: number
          storage_path: string
          video_source_id: string
        }
        Insert: {
          created_at?: string
          file_size_bytes?: number | null
          frame_count?: number | null
          id?: string
          segment_number: number
          storage_path: string
          video_source_id: string
        }
        Update: {
          created_at?: string
          file_size_bytes?: number | null
          frame_count?: number | null
          id?: string
          segment_number?: number
          storage_path?: string
          video_source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gif_segments_video_source_id_fkey"
            columns: ["video_source_id"]
            isOneToOne: false
            referencedRelation: "video_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      health_metrics: {
        Row: {
          id: string
          metric_name: string
          metric_value: number
          recorded_at: string | null
          tags: Json | null
        }
        Insert: {
          id?: string
          metric_name: string
          metric_value: number
          recorded_at?: string | null
          tags?: Json | null
        }
        Update: {
          id?: string
          metric_name?: string
          metric_value?: number
          recorded_at?: string | null
          tags?: Json | null
        }
        Relationships: []
      }
      implementation_steps: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          artifact_id: string
          created_at: string
          extracted_by: string
          extraction_confidence: number | null
          id: string
          is_enforceable: boolean | null
          rejection_reason: string | null
          source_frame_id: string | null
          step_description: string | null
          step_number: number
          step_title: string
          timestamp_end_ms: number | null
          timestamp_start_ms: number | null
          updated_at: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          artifact_id: string
          created_at?: string
          extracted_by?: string
          extraction_confidence?: number | null
          id?: string
          is_enforceable?: boolean | null
          rejection_reason?: string | null
          source_frame_id?: string | null
          step_description?: string | null
          step_number: number
          step_title: string
          timestamp_end_ms?: number | null
          timestamp_start_ms?: number | null
          updated_at?: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          artifact_id?: string
          created_at?: string
          extracted_by?: string
          extraction_confidence?: number | null
          id?: string
          is_enforceable?: boolean | null
          rejection_reason?: string | null
          source_frame_id?: string | null
          step_description?: string | null
          step_number?: number
          step_title?: string
          timestamp_end_ms?: number | null
          timestamp_start_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "implementation_steps_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "transformation_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implementation_steps_source_frame_id_fkey"
            columns: ["source_frame_id"]
            isOneToOne: false
            referencedRelation: "artifact_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      job_logs: {
        Row: {
          created_at: string
          error_reason: string | null
          error_stack: string | null
          id: string
          job_id: string
          level: string
          message: string | null
          metadata: Json | null
          step: string
        }
        Insert: {
          created_at?: string
          error_reason?: string | null
          error_stack?: string | null
          id?: string
          job_id: string
          level?: string
          message?: string | null
          metadata?: Json | null
          step: string
        }
        Update: {
          created_at?: string
          error_reason?: string | null
          error_stack?: string | null
          id?: string
          job_id?: string
          level?: string
          message?: string | null
          metadata?: Json | null
          step?: string
        }
        Relationships: []
      }
      job_verifications: {
        Row: {
          checks: Json
          course_id: string
          failed_critical: string[]
          id: string
          job_id: string | null
          step: string
          verified: boolean
          verified_at: string
          verified_by: string
        }
        Insert: {
          checks?: Json
          course_id: string
          failed_critical?: string[]
          id?: string
          job_id?: string | null
          step: string
          verified?: boolean
          verified_at?: string
          verified_by?: string
        }
        Update: {
          checks?: Json
          course_id?: string
          failed_critical?: string[]
          id?: string
          job_id?: string | null
          step?: string
          verified?: boolean
          verified_at?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_verifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "processing_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      mock_orders: {
        Row: {
          amount: number
          created_at: string
          email: string
          id: string
          plan: string
          subscriber_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          email: string
          id?: string
          plan: string
          subscriber_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          email?: string
          id?: string
          plan?: string
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mock_orders_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "email_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      module_leases: {
        Row: {
          acquired_at: string
          course_id: string
          created_at: string
          expires_at: string
          id: string
          module_id: string
          released_at: string | null
          worker_id: string
        }
        Insert: {
          acquired_at?: string
          course_id: string
          created_at?: string
          expires_at: string
          id?: string
          module_id: string
          released_at?: string | null
          worker_id: string
        }
        Update: {
          acquired_at?: string
          course_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          module_id?: string
          released_at?: string | null
          worker_id?: string
        }
        Relationships: []
      }
      module_processing_steps: {
        Row: {
          attempt_number: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          module_id: string
          output_data: Json | null
          started_at: string | null
          status: string | null
          step_name: string
        }
        Insert: {
          attempt_number?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          module_id: string
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_name: string
        }
        Update: {
          attempt_number?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          module_id?: string
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          step_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_processing_steps_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_auto_fixes: {
        Row: {
          auto_fixed: boolean
          course_id: string | null
          detected_at: string
          fix_applied: string | null
          fixed_at: string | null
          id: string
          issue_description: string
          issue_type: string
          metadata: Json | null
          pattern_count: number
          severity: string
          user_email: string | null
        }
        Insert: {
          auto_fixed?: boolean
          course_id?: string | null
          detected_at?: string
          fix_applied?: string | null
          fixed_at?: string | null
          id?: string
          issue_description: string
          issue_type: string
          metadata?: Json | null
          pattern_count?: number
          severity?: string
          user_email?: string | null
        }
        Update: {
          auto_fixed?: boolean
          course_id?: string | null
          detected_at?: string
          fix_applied?: string | null
          fixed_at?: string | null
          id?: string
          issue_description?: string
          issue_type?: string
          metadata?: Json | null
          pattern_count?: number
          severity?: string
          user_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ops_auto_fixes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_auto_fixes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_patterns: {
        Row: {
          auto_fix_available: boolean
          auto_fix_strategy: string | null
          first_seen: string
          id: string
          last_auto_fix_at: string | null
          last_seen: string
          metadata: Json | null
          occurrence_count: number
          pattern_description: string
          pattern_key: string
        }
        Insert: {
          auto_fix_available?: boolean
          auto_fix_strategy?: string | null
          first_seen?: string
          id?: string
          last_auto_fix_at?: string | null
          last_seen?: string
          metadata?: Json | null
          occurrence_count?: number
          pattern_description: string
          pattern_key: string
        }
        Update: {
          auto_fix_available?: boolean
          auto_fix_strategy?: string | null
          first_seen?: string
          id?: string
          last_auto_fix_at?: string | null
          last_seen?: string
          metadata?: Json | null
          occurrence_count?: number
          pattern_description?: string
          pattern_key?: string
        }
        Relationships: []
      }
      page_visits: {
        Row: {
          id: string
          page: string
          source: string | null
          visited_at: string
          visitor_id: string | null
        }
        Insert: {
          id?: string
          page: string
          source?: string | null
          visited_at?: string
          visitor_id?: string | null
        }
        Update: {
          id?: string
          page?: string
          source?: string | null
          visited_at?: string
          visitor_id?: string | null
        }
        Relationships: []
      }
      processing_concurrency: {
        Row: {
          active_jobs: number | null
          id: string
          last_updated: string | null
          user_email: string
        }
        Insert: {
          active_jobs?: number | null
          id?: string
          last_updated?: string | null
          user_email: string
        }
        Update: {
          active_jobs?: number | null
          id?: string
          last_updated?: string | null
          user_email?: string
        }
        Relationships: []
      }
      processing_events: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: []
      }
      processing_queue: {
        Row: {
          approval_frame_id: string | null
          attempt_count: number
          claimed_by: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          error_message: string | null
          id: string
          initiated_by_frame_id: string | null
          max_attempts: number
          metadata: Json | null
          purge_frame_id: string | null
          purged: boolean | null
          purged_at: string | null
          purged_by: string | null
          requires_approval: boolean | null
          started_at: string | null
          status: string
          step: string
          verification_status: string | null
          visibility_timeout: string | null
        }
        Insert: {
          approval_frame_id?: string | null
          attempt_count?: number
          claimed_by?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          initiated_by_frame_id?: string | null
          max_attempts?: number
          metadata?: Json | null
          purge_frame_id?: string | null
          purged?: boolean | null
          purged_at?: string | null
          purged_by?: string | null
          requires_approval?: boolean | null
          started_at?: string | null
          status?: string
          step: string
          verification_status?: string | null
          visibility_timeout?: string | null
        }
        Update: {
          approval_frame_id?: string | null
          attempt_count?: number
          claimed_by?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          initiated_by_frame_id?: string | null
          max_attempts?: number
          metadata?: Json | null
          purge_frame_id?: string | null
          purged?: boolean | null
          purged_at?: string | null
          purged_by?: string | null
          requires_approval?: boolean | null
          started_at?: string | null
          status?: string
          step?: string
          verification_status?: string | null
          visibility_timeout?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "processing_queue_approval_frame_id_fkey"
            columns: ["approval_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_initiated_by_frame_id_fkey"
            columns: ["initiated_by_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processing_queue_purge_frame_id_fkey"
            columns: ["purge_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purge_audit_log: {
        Row: {
          course_id: string | null
          created_at: string | null
          file_hash: string | null
          file_size_bytes: number | null
          id: string
          module_id: string | null
          purge_method: string
          purged_at: string | null
          storage_path: string
          verified: boolean | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string | null
          file_hash?: string | null
          file_size_bytes?: number | null
          id?: string
          module_id?: string | null
          purge_method?: string
          purged_at?: string | null
          storage_path: string
          verified?: boolean | null
        }
        Update: {
          course_id?: string | null
          created_at?: string | null
          file_hash?: string | null
          file_size_bytes?: number | null
          id?: string
          module_id?: string | null
          purge_method?: string
          purged_at?: string | null
          storage_path?: string
          verified?: boolean | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action_type: string
          created_at: string
          id: string
          ip_address: string | null
          request_count: number
          session_id: string
          window_start: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          request_count?: number
          session_id: string
          window_start?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          request_count?: number
          session_id?: string
          window_start?: string
        }
        Relationships: []
      }
      reasoning_logs: {
        Row: {
          analysis_focus: string
          artifact_id: string
          concern_level: string
          confidence_score: number | null
          created_at: string
          decision_notes: string | null
          human_decision: string
          id: string
          intent_frame_id: string | null
          recommendation: string | null
          source_label: string
          source_role: string | null
          source_type: string
          summary: string
          superseded_by: string | null
        }
        Insert: {
          analysis_focus: string
          artifact_id: string
          concern_level?: string
          confidence_score?: number | null
          created_at?: string
          decision_notes?: string | null
          human_decision?: string
          id?: string
          intent_frame_id?: string | null
          recommendation?: string | null
          source_label: string
          source_role?: string | null
          source_type: string
          summary: string
          superseded_by?: string | null
        }
        Update: {
          analysis_focus?: string
          artifact_id?: string
          concern_level?: string
          confidence_score?: number | null
          created_at?: string
          decision_notes?: string | null
          human_decision?: string
          id?: string
          intent_frame_id?: string | null
          recommendation?: string | null
          source_label?: string
          source_role?: string | null
          source_type?: string
          summary?: string
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reasoning_logs_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "transformation_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reasoning_logs_intent_frame_id_fkey"
            columns: ["intent_frame_id"]
            isOneToOne: false
            referencedRelation: "artifact_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reasoning_logs_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "reasoning_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      state_transitions: {
        Row: {
          entity_id: string
          entity_type: string
          frame_id: string
          from_state: Json
          id: string
          occurred_at: string
          reversal_frame_id: string | null
          reversible: boolean | null
          to_state: Json
          transition_type: string
          triggered_by: string
        }
        Insert: {
          entity_id: string
          entity_type: string
          frame_id: string
          from_state: Json
          id?: string
          occurred_at?: string
          reversal_frame_id?: string | null
          reversible?: boolean | null
          to_state: Json
          transition_type: string
          triggered_by: string
        }
        Update: {
          entity_id?: string
          entity_type?: string
          frame_id?: string
          from_state?: Json
          id?: string
          occurred_at?: string
          reversal_frame_id?: string | null
          reversible?: boolean | null
          to_state?: Json
          transition_type?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_transitions_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_transitions_reversal_frame_id_fkey"
            columns: ["reversal_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      step_completions: {
        Row: {
          completed_at: string | null
          completion_notes: string | null
          created_at: string
          id: string
          skip_frame_id: string | null
          skip_reason: string | null
          skipped_prerequisites: boolean
          status: string
          step_id: string
          updated_at: string
          user_id: string
          verification_evidence: string | null
        }
        Insert: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          id?: string
          skip_frame_id?: string | null
          skip_reason?: string | null
          skipped_prerequisites?: boolean
          status?: string
          step_id: string
          updated_at?: string
          user_id: string
          verification_evidence?: string | null
        }
        Update: {
          completed_at?: string | null
          completion_notes?: string | null
          created_at?: string
          id?: string
          skip_frame_id?: string | null
          skip_reason?: string | null
          skipped_prerequisites?: boolean
          status?: string
          step_id?: string
          updated_at?: string
          user_id?: string
          verification_evidence?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "step_completions_skip_frame_id_fkey"
            columns: ["skip_frame_id"]
            isOneToOne: false
            referencedRelation: "execution_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_completions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "implementation_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      step_constraints: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          constraint_description: string
          constraint_title: string
          constraint_type: string
          created_at: string
          extraction_confidence: number | null
          id: string
          severity: string
          source_frame_id: string | null
          source_text: string | null
          source_timestamp_ms: number | null
          step_id: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          constraint_description: string
          constraint_title: string
          constraint_type: string
          created_at?: string
          extraction_confidence?: number | null
          id?: string
          severity?: string
          source_frame_id?: string | null
          source_text?: string | null
          source_timestamp_ms?: number | null
          step_id: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          constraint_description?: string
          constraint_title?: string
          constraint_type?: string
          created_at?: string
          extraction_confidence?: number | null
          id?: string
          severity?: string
          source_frame_id?: string | null
          source_text?: string | null
          source_timestamp_ms?: number | null
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_constraints_source_frame_id_fkey"
            columns: ["source_frame_id"]
            isOneToOne: false
            referencedRelation: "artifact_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_constraints_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "implementation_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      step_dependencies: {
        Row: {
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          condition_description: string | null
          condition_expression: string | null
          created_at: string
          dependency_type: string
          dependent_step_id: string
          id: string
          prerequisite_step_id: string
        }
        Insert: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          condition_description?: string | null
          condition_expression?: string | null
          created_at?: string
          dependency_type?: string
          dependent_step_id: string
          id?: string
          prerequisite_step_id: string
        }
        Update: {
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          condition_description?: string | null
          condition_expression?: string | null
          created_at?: string
          dependency_type?: string
          dependent_step_id?: string
          id?: string
          prerequisite_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "step_dependencies_dependent_step_id_fkey"
            columns: ["dependent_step_id"]
            isOneToOne: false
            referencedRelation: "implementation_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "step_dependencies_prerequisite_step_id_fkey"
            columns: ["prerequisite_step_id"]
            isOneToOne: false
            referencedRelation: "implementation_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          course_id: string | null
          created_at: string
          id: string
          resolution_summary: string | null
          status: string
          updated_at: string
          user_email: string
          user_id: string | null
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          id?: string
          resolution_summary?: string | null
          status?: string
          updated_at?: string
          user_email: string
          user_id?: string | null
        }
        Update: {
          course_id?: string | null
          created_at?: string
          id?: string
          resolution_summary?: string | null
          status?: string
          updated_at?: string
          user_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_conversations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          email_sent_at: string | null
          emailed_to_user: boolean
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          email_sent_at?: string | null
          emailed_to_user?: boolean
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          email_sent_at?: string | null
          emailed_to_user?: boolean
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      tag_history: {
        Row: {
          changed_at: string
          id: string
          new_tag: Database["public"]["Enums"]["subscriber_tag"]
          old_tag: Database["public"]["Enums"]["subscriber_tag"] | null
          reason: string | null
          subscriber_id: string
        }
        Insert: {
          changed_at?: string
          id?: string
          new_tag: Database["public"]["Enums"]["subscriber_tag"]
          old_tag?: Database["public"]["Enums"]["subscriber_tag"] | null
          reason?: string | null
          subscriber_id: string
        }
        Update: {
          changed_at?: string
          id?: string
          new_tag?: Database["public"]["Enums"]["subscriber_tag"]
          old_tag?: Database["public"]["Enums"]["subscriber_tag"] | null
          reason?: string | null
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_history_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "email_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      transformation_artifacts: {
        Row: {
          created_at: string | null
          duration_seconds: number
          frame_count: number
          id: string
          key_moments: number
          status: string
          storage_path: string | null
          updated_at: string | null
          user_id: string
          video_title: string
          video_url: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number
          frame_count?: number
          id?: string
          key_moments?: number
          status?: string
          storage_path?: string | null
          updated_at?: string | null
          user_id: string
          video_title: string
          video_url: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number
          frame_count?: number
          id?: string
          key_moments?: number
          status?: string
          storage_path?: string | null
          updated_at?: string | null
          user_id?: string
          video_title?: string
          video_url?: string
        }
        Relationships: []
      }
      verification_approvals: {
        Row: {
          action: string
          artifact_id: string
          created_at: string | null
          frame_id: string
          id: string
          payload_canonical: string | null
          payload_signature: string | null
          reason: string | null
          signature_verified: boolean | null
          user_id: string
        }
        Insert: {
          action: string
          artifact_id: string
          created_at?: string | null
          frame_id: string
          id?: string
          payload_canonical?: string | null
          payload_signature?: string | null
          reason?: string | null
          signature_verified?: boolean | null
          user_id: string
        }
        Update: {
          action?: string
          artifact_id?: string
          created_at?: string | null
          frame_id?: string
          id?: string
          payload_canonical?: string | null
          payload_signature?: string | null
          reason?: string | null
          signature_verified?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_approvals_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "transformation_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_approvals_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "artifact_frames"
            referencedColumns: ["id"]
          },
        ]
      }
      video_chunks: {
        Row: {
          artifact_data: Json | null
          attempt_count: number | null
          chunk_index: number
          completed_at: string | null
          course_id: string | null
          created_at: string | null
          duration_seconds: number | null
          end_seconds: number
          error_message: string | null
          frame_count: number | null
          frame_urls: Json | null
          id: string
          locked_at: string | null
          metadata: Json | null
          module_id: string | null
          pdf_storage_path: string | null
          processing_started_at: string | null
          start_seconds: number
          status: string
          total_chunks: number
          transcript: Json | null
          updated_at: string | null
          worker_id: string | null
        }
        Insert: {
          artifact_data?: Json | null
          attempt_count?: number | null
          chunk_index: number
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          end_seconds: number
          error_message?: string | null
          frame_count?: number | null
          frame_urls?: Json | null
          id?: string
          locked_at?: string | null
          metadata?: Json | null
          module_id?: string | null
          pdf_storage_path?: string | null
          processing_started_at?: string | null
          start_seconds: number
          status?: string
          total_chunks: number
          transcript?: Json | null
          updated_at?: string | null
          worker_id?: string | null
        }
        Update: {
          artifact_data?: Json | null
          attempt_count?: number | null
          chunk_index?: number
          completed_at?: string | null
          course_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          end_seconds?: number
          error_message?: string | null
          frame_count?: number | null
          frame_urls?: Json | null
          id?: string
          locked_at?: string | null
          metadata?: Json | null
          module_id?: string | null
          pdf_storage_path?: string | null
          processing_started_at?: string | null
          start_seconds?: number
          status?: string
          total_chunks?: number
          transcript?: Json | null
          updated_at?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_chunks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_chunks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "public_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_chunks_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      video_processing_queue: {
        Row: {
          attempt_count: number
          chunk_id: string | null
          completed_at: string | null
          completed_segments: Json | null
          created_at: string
          error_message: string | null
          expected_frames: number | null
          id: string
          is_chunk: boolean | null
          job_id: string
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          metadata: Json | null
          next_retry_at: string | null
          parent_job_id: string | null
          processed_frames: number | null
          processing_phase: string | null
          segment_count: number | null
          segment_pdfs: Json | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          video_duration_seconds: number | null
          video_path: string
        }
        Insert: {
          attempt_count?: number
          chunk_id?: string | null
          completed_at?: string | null
          completed_segments?: Json | null
          created_at?: string
          error_message?: string | null
          expected_frames?: number | null
          id?: string
          is_chunk?: boolean | null
          job_id: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json | null
          next_retry_at?: string | null
          parent_job_id?: string | null
          processed_frames?: number | null
          processing_phase?: string | null
          segment_count?: number | null
          segment_pdfs?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          video_duration_seconds?: number | null
          video_path: string
        }
        Update: {
          attempt_count?: number
          chunk_id?: string | null
          completed_at?: string | null
          completed_segments?: Json | null
          created_at?: string
          error_message?: string | null
          expected_frames?: number | null
          id?: string
          is_chunk?: boolean | null
          job_id?: string
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          metadata?: Json | null
          next_retry_at?: string | null
          parent_job_id?: string | null
          processed_frames?: number | null
          processing_phase?: string | null
          segment_count?: number | null
          segment_pdfs?: Json | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          video_duration_seconds?: number | null
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_processing_queue_chunk_id_fkey"
            columns: ["chunk_id"]
            isOneToOne: false
            referencedRelation: "video_chunks"
            referencedColumns: ["id"]
          },
        ]
      }
      video_sources: {
        Row: {
          content_type: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          filename: string
          id: string
          job_id: string
          status: Database["public"]["Enums"]["video_status"]
          storage_path: string | null
          transcript: Json | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          filename: string
          id?: string
          job_id: string
          status?: Database["public"]["Enums"]["video_status"]
          storage_path?: string | null
          transcript?: Json | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          filename?: string
          id?: string
          job_id?: string
          status?: Database["public"]["Enums"]["video_status"]
          storage_path?: string | null
          transcript?: Json | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      wardrobe_items: {
        Row: {
          category: string | null
          color_palette: string[] | null
          created_at: string
          description: string | null
          filename: string
          id: string
          session_id: string
          storage_path: string
          style_tags: string[] | null
        }
        Insert: {
          category?: string | null
          color_palette?: string[] | null
          created_at?: string
          description?: string | null
          filename: string
          id?: string
          session_id: string
          storage_path: string
          style_tags?: string[] | null
        }
        Update: {
          category?: string | null
          color_palette?: string[] | null
          created_at?: string
          description?: string | null
          filename?: string
          id?: string
          session_id?: string
          storage_path?: string
          style_tags?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      download_analytics: {
        Row: {
          course_id: string | null
          download_date: string | null
          downloads: number | null
          total_accesses: number | null
          unique_ips: number | null
          unique_users: number | null
          url_generations: number | null
        }
        Relationships: []
      }
      public_courses: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          is_multi_module: boolean | null
          module_count: number | null
          share_enabled: boolean | null
          share_token: string | null
          status: string | null
          title: string | null
          video_duration_seconds: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_multi_module?: boolean | null
          module_count?: number | null
          share_enabled?: boolean | null
          share_token?: string | null
          status?: string | null
          title?: string | null
          video_duration_seconds?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_multi_module?: boolean | null
          module_count?: number | null
          share_enabled?: boolean | null
          share_token?: string | null
          status?: string | null
          title?: string | null
          video_duration_seconds?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      acquire_module_lease: {
        Args: {
          p_course_id: string
          p_lease_duration_seconds?: number
          p_module_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      add_to_dead_letter_queue: {
        Args: {
          p_can_retry?: boolean
          p_context?: Json
          p_entity_id: string
          p_entity_type: string
          p_failure_reason: string
        }
        Returns: string
      }
      auto_recover_stalled_jobs: {
        Args: { p_max_jobs?: number }
        Returns: {
          details: Json
          failed_count: number
          recovered_count: number
        }[]
      }
      can_finalize_artifact: {
        Args: { p_artifact_id: string }
        Returns: boolean
      }
      can_progress_to_step: {
        Args: { p_step_id: string; p_user_id: string }
        Returns: {
          allowed: boolean
          blocking_constraints: string[]
          missing_prerequisites: string[]
          requires_frame: boolean
        }[]
      }
      can_start_job: { Args: { p_user_email: string }; Returns: boolean }
      check_api_rate_limit: {
        Args: { p_api_key_id: string }
        Returns: {
          allowed: boolean
          limit_value: number
          requests_used: number
          reset_at: string
        }[]
      }
      check_chunks_complete: {
        Args: { p_course_id: string; p_module_id?: string }
        Returns: {
          all_complete: boolean
          completed_chunks: number
          failed_chunks: number
          total_chunks: number
        }[]
      }
      check_pipeline_health: {
        Args: never
        Returns: {
          critical_violations_count: number
          failed_verifications_count: number
          healthy: boolean
          oldest_stuck_job_hours: number
          stuck_pending_count: number
          stuck_processing_count: number
        }[]
      }
      check_rate_limit: {
        Args: {
          p_action_type: string
          p_max_requests?: number
          p_session_id: string
          p_window_minutes?: number
        }
        Returns: boolean
      }
      check_rate_limit_with_ip: {
        Args: {
          p_action_type: string
          p_ip_address: string
          p_max_requests?: number
          p_session_id: string
          p_window_minutes?: number
        }
        Returns: boolean
      }
      claim_processing_job: {
        Args: { p_visibility_seconds?: number; p_worker_id: string }
        Returns: {
          attempt_number: number
          course_id: string
          job_id: string
          metadata: Json
          step: string
        }[]
      }
      claim_video_job: {
        Args: { p_lock_duration_seconds?: number; p_worker_id: string }
        Returns: {
          attempt_count: number
          job_id: string
          metadata: Json
          user_id: string
          video_path: string
        }[]
      }
      cleanup_old_data: {
        Args: never
        Returns: {
          dlq_deleted: number
          events_deleted: number
          rate_limits_deleted: number
        }[]
      }
      complete_implementation_step: {
        Args: {
          p_completion_notes?: string
          p_skip_frame_id?: string
          p_skip_prerequisites?: boolean
          p_skip_reason?: string
          p_step_id: string
          p_user_id: string
        }
        Returns: {
          completion_id: string
          error_message: string
          success: boolean
        }[]
      }
      complete_module_step: {
        Args: { p_module_id: string; p_output_data?: Json; p_step_name: string }
        Returns: undefined
      }
      complete_processing_job: {
        Args: { p_job_id: string; p_worker_id: string }
        Returns: boolean
      }
      complete_step_and_queue_next: {
        Args: {
          p_course_id: string
          p_job_id: string
          p_next_metadata?: Json
          p_next_step?: string
        }
        Returns: undefined
      }
      complete_video_job: {
        Args: { p_error?: string; p_job_id: string; p_success: boolean }
        Returns: boolean
      }
      count_active_module_jobs: {
        Args: { p_course_id: string }
        Returns: number
      }
      decrement_active_jobs: {
        Args: { p_user_email: string }
        Returns: undefined
      }
      detect_concurrency_drift: {
        Args: never
        Returns: {
          actual_count: number
          reported_count: number
          user_email: string
        }[]
      }
      detect_stalled_modules: {
        Args: never
        Returns: {
          course_id: string
          current_state: string
          module_id: string
          stalled_since: string
        }[]
      }
      detect_stuck_intermediate_states: {
        Args: never
        Returns: {
          course_id: string
          course_status: string
          last_completed_step: string
          next_step: string
          stuck_since: string
        }[]
      }
      emit_processing_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_payload?: Json
        }
        Returns: string
      }
      enqueue_video_job: {
        Args: {
          p_job_id: string
          p_metadata?: Json
          p_user_id?: string
          p_video_path: string
        }
        Returns: string
      }
      extend_job_visibility: {
        Args: {
          p_job_id: string
          p_visibility_seconds?: number
          p_worker_id: string
        }
        Returns: boolean
      }
      fail_processing_job: {
        Args: {
          p_error_message: string
          p_job_id: string
          p_should_retry?: boolean
          p_worker_id: string
        }
        Returns: boolean
      }
      get_course_by_share_token: {
        Args: { p_share_token: string }
        Returns: {
          created_at: string
          description: string
          id: string
          is_multi_module: boolean
          module_count: number
          title: string
          video_duration_seconds: number
        }[]
      }
      get_pending_events: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          payload: Json
        }[]
      }
      hash_email: { Args: { p_email: string }; Returns: string }
      increment_active_jobs: {
        Args: { p_user_email: string }
        Returns: undefined
      }
      increment_rate_limit: {
        Args: { p_action_type: string; p_session_id: string }
        Returns: undefined
      }
      increment_rate_limit_with_ip: {
        Args: {
          p_action_type: string
          p_ip_address: string
          p_session_id: string
        }
        Returns: undefined
      }
      is_step_completed: {
        Args: { p_module_id: string; p_step_name: string }
        Returns: boolean
      }
      log_api_usage: {
        Args: {
          p_api_key_id: string
          p_cost_cents?: number
          p_endpoint: string
          p_job_id: string
          p_metadata?: Json
          p_response_status?: number
          p_video_duration?: number
        }
        Returns: string
      }
      log_job_event: {
        Args: {
          p_error_reason?: string
          p_error_stack?: string
          p_job_id: string
          p_level?: string
          p_message?: string
          p_metadata?: Json
          p_step: string
        }
        Returns: string
      }
      mark_event_processed: { Args: { p_event_id: string }; Returns: undefined }
      mark_module_email_sent: {
        Args: { p_module_id: string }
        Returns: boolean
      }
      queue_parallel_modules: {
        Args: { p_course_id: string; p_max_parallel?: number }
        Returns: {
          module_number: number
          queued: boolean
        }[]
      }
      record_metric: {
        Args: { p_name: string; p_tags?: Json; p_value: number }
        Returns: undefined
      }
      regenerate_share_token: { Args: { p_course_id: string }; Returns: string }
      release_module_lease: {
        Args: { p_module_id: string; p_worker_id: string }
        Returns: undefined
      }
      renew_module_lease: {
        Args: {
          p_lease_duration_seconds?: number
          p_module_id: string
          p_worker_id: string
        }
        Returns: boolean
      }
      reset_stalled_module: { Args: { p_module_id: string }; Returns: boolean }
      toggle_course_sharing: {
        Args: { p_course_id: string; p_enabled: boolean }
        Returns: boolean
      }
      track_pattern: {
        Args: {
          p_auto_fix_available?: boolean
          p_auto_fix_strategy?: string
          p_description: string
          p_pattern_key: string
        }
        Returns: undefined
      }
      transition_module_state: {
        Args: {
          p_from_state: string
          p_module_id: string
          p_step_data?: Json
          p_to_state: string
        }
        Returns: boolean
      }
      update_course_heartbeat: {
        Args: { p_course_id: string }
        Returns: undefined
      }
      update_module_heartbeat: {
        Args: { p_module_id: string }
        Returns: undefined
      }
      user_owns_course: { Args: { p_course_id: string }; Returns: boolean }
      user_owns_course_by_hash: {
        Args: { p_course_id: string }
        Returns: boolean
      }
      user_owns_course_secure: {
        Args: { p_course_id: string }
        Returns: boolean
      }
      user_owns_course_strict: {
        Args: { p_course_id: string }
        Returns: boolean
      }
      user_owns_support_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      validate_api_key: {
        Args: { p_key_hash: string }
        Returns: {
          credits: number
          is_active: boolean
          key_id: string
          key_name: string
          rate_limit: number
          user_id: string
        }[]
      }
      verify_course_outputs: {
        Args: { p_course_id: string }
        Returns: {
          failed_checks: string[]
          frame_count: number
          has_transcript: boolean
          verified: boolean
        }[]
      }
      verify_frame_upload: {
        Args: { p_frame_count: number; p_frame_urls: Json; p_module_id: string }
        Returns: boolean
      }
      watchdog_repair_stalled: {
        Args: never
        Returns: {
          details: Json
          repaired_count: number
          terminal_count: number
        }[]
      }
    }
    Enums: {
      job_status: "queued" | "processing" | "completed" | "failed"
      optin_source: "homepage" | "vsl_page"
      subscriber_tag: "in_sequence" | "hot_lead" | "cold_lead" | "customer"
      video_status:
        | "pending"
        | "transcribing"
        | "extracting"
        | "generating_gifs"
        | "completed"
        | "failed"
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
  public: {
    Enums: {
      job_status: ["queued", "processing", "completed", "failed"],
      optin_source: ["homepage", "vsl_page"],
      subscriber_tag: ["in_sequence", "hot_lead", "cold_lead", "customer"],
      video_status: [
        "pending",
        "transcribing",
        "extracting",
        "generating_gifs",
        "completed",
        "failed",
      ],
    },
  },
} as const
