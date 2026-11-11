
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "appointments": {
                  Row: {
                    "created_at": string,"created_by": string | null,"customer_id": string,"external_ref": string | null,"id": string,"note": string | null,"organization_id": string,"scheduled_at": string,"source": string,"status": string,"store_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id": string,"external_ref"?: string | null,"id"?: string,"note"?: string | null,"organization_id": string,"scheduled_at": string,"source"?: string,"status"?: string,"store_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"external_ref"?: string | null,"id"?: string,"note"?: string | null,"organization_id"?: string,"scheduled_at"?: string,"source"?: string,"status"?: string,"store_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "appointments_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "appointments_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"changes": NonNullable<Json>,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"organization_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"changes"?: NonNullable<Json>,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"organization_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"changes"?: NonNullable<Json>,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"organization_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_records": {
                  Row: {
                    "channel": string,"customer_id": string,"id": string,"note": string | null,"organization_id": string,"recorded_at": string,"recorded_by": string | null,"source": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel"?: string,"customer_id": string,"id"?: string,"note"?: string | null,"organization_id": string,"recorded_at"?: string,"recorded_by"?: string | null,"source"?: string,"status": string
                  }
                  Update: {
                    "channel"?: string,"customer_id"?: string,"id"?: string,"note"?: string | null,"organization_id"?: string,"recorded_at"?: string,"recorded_by"?: string | null,"source"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_records_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "consent_records_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"contact_logs": {
                  Row: {
                    "channel": string,"contacted_at": string,"content": string | null,"created_at": string,"customer_id": string,"external_message_id": string | null,"id": string,"organization_id": string,"outcome": string,"staff_id": string | null,"store_id": string,"task_id": string | null,"template_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"contacted_at"?: string,"content"?: string | null,"created_at"?: string,"customer_id": string,"external_message_id"?: string | null,"id"?: string,"organization_id": string,"outcome": string,"staff_id"?: string | null,"store_id": string,"task_id"?: string | null,"template_id"?: string | null
                  }
                  Update: {
                    "channel"?: string,"contacted_at"?: string,"content"?: string | null,"created_at"?: string,"customer_id"?: string,"external_message_id"?: string | null,"id"?: string,"organization_id"?: string,"outcome"?: string,"staff_id"?: string | null,"store_id"?: string,"task_id"?: string | null,"template_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_logs_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "contact_logs_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "contact_logs_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "contact_logs_organization_id_template_id_fkey"
      columns: ["organization_id","template_id"]
isOneToOne: false
      referencedRelation: "message_templates"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "contact_logs_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_logs_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "followup_tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_notes": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"customer_id": string,"id": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"customer_id": string,"id"?: string,"organization_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"customer_id"?: string,"id"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_notes_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "customer_notes_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"customer_tags": {
                  Row: {
                    "created_at": string,"customer_id": string,"organization_id": string,"tag_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"customer_id": string,"organization_id": string,"tag_id": string
                  }
                  Update: {
                    "created_at"?: string,"customer_id"?: string,"organization_id"?: string,"tag_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_tags_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "customer_tags_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "customer_tags_organization_id_tag_id_fkey"
      columns: ["organization_id","tag_id"]
isOneToOne: false
      referencedRelation: "tags"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "anonymized_at": string | null,"assigned_staff_id": string | null,"contact_status": string,"created_at": string,"created_by": string | null,"customer_code": string,"deleted_at": string | null,"email": string | null,"family_name": string,"family_name_kana": string,"first_visit_on": string | null,"given_name": string,"given_name_kana": string,"id": string,"last_visit_on": string | null,"organization_id": string,"phone": string | null,"search_text": string | null,"store_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anonymized_at"?: string | null,"assigned_staff_id"?: string | null,"contact_status"?: string,"created_at"?: string,"created_by"?: string | null,"customer_code"?: string,"deleted_at"?: string | null,"email"?: string | null,"family_name": string,"family_name_kana"?: string,"first_visit_on"?: string | null,"given_name"?: string,"given_name_kana"?: string,"id"?: string,"last_visit_on"?: string | null,"organization_id": string,"phone"?: string | null,"search_text"?: never,"store_id": string,"updated_at"?: string
                  }
                  Update: {
                    "anonymized_at"?: string | null,"assigned_staff_id"?: string | null,"contact_status"?: string,"created_at"?: string,"created_by"?: string | null,"customer_code"?: string,"deleted_at"?: string | null,"email"?: string | null,"family_name"?: string,"family_name_kana"?: string,"first_visit_on"?: string | null,"given_name"?: string,"given_name_kana"?: string,"id"?: string,"last_visit_on"?: string | null,"organization_id"?: string,"phone"?: string | null,"search_text"?: never,"store_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_assigned_staff_id_fkey"
      columns: ["assigned_staff_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"followup_rules": {
                  Row: {
                    "assignee_strategy": string,"created_at": string,"created_by": string | null,"default_template_id": string | null,"due_in_days": number,"id": string,"is_active": boolean,"max_lookback_days": number,"name": string,"offset_days": number,"organization_id": string,"priority": string,"rule_type": string,"store_id": string | null,"task_kind": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignee_strategy"?: string,"created_at"?: string,"created_by"?: string | null,"default_template_id"?: string | null,"due_in_days"?: number,"id"?: string,"is_active"?: boolean,"max_lookback_days"?: number,"name": string,"offset_days": number,"organization_id": string,"priority"?: string,"rule_type": string,"store_id"?: string | null,"task_kind"?: string,"updated_at"?: string
                  }
                  Update: {
                    "assignee_strategy"?: string,"created_at"?: string,"created_by"?: string | null,"default_template_id"?: string | null,"due_in_days"?: number,"id"?: string,"is_active"?: boolean,"max_lookback_days"?: number,"name"?: string,"offset_days"?: number,"organization_id"?: string,"priority"?: string,"rule_type"?: string,"store_id"?: string | null,"task_kind"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "followup_rules_organization_id_default_template_id_fkey"
      columns: ["organization_id","default_template_id"]
isOneToOne: false
      referencedRelation: "message_templates"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "followup_rules_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "followup_rules_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"followup_tasks": {
                  Row: {
                    "assigned_to": string | null,"close_reason": string | null,"completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string | null,"customer_id": string,"due_on": string,"id": string,"organization_id": string,"period_key": string | null,"priority": string,"result_note": string | null,"rule_id": string | null,"status": string,"store_id": string,"task_kind": string,"template_id": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"close_reason"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id": string,"due_on": string,"id"?: string,"organization_id": string,"period_key"?: string | null,"priority"?: string,"result_note"?: string | null,"rule_id"?: string | null,"status"?: string,"store_id": string,"task_kind"?: string,"template_id"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"close_reason"?: string | null,"completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"due_on"?: string,"id"?: string,"organization_id"?: string,"period_key"?: string | null,"priority"?: string,"result_note"?: string | null,"rule_id"?: string | null,"status"?: string,"store_id"?: string,"task_kind"?: string,"template_id"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "followup_tasks_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "followup_tasks_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "followup_tasks_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "followup_tasks_organization_id_rule_id_fkey"
      columns: ["organization_id","rule_id"]
isOneToOne: false
      referencedRelation: "followup_rules"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "followup_tasks_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "followup_tasks_organization_id_template_id_fkey"
      columns: ["organization_id","template_id"]
isOneToOne: false
      referencedRelation: "message_templates"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"import_jobs": {
                  Row: {
                    "created_at": string,"created_by": string | null,"error_rows": number,"errors": NonNullable<Json>,"file_name": string | null,"id": string,"inserted_rows": number,"kind": string,"organization_id": string,"status": string,"store_id": string,"total_rows": number,"updated_rows": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"error_rows"?: number,"errors"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"inserted_rows"?: number,"kind": string,"organization_id": string,"status"?: string,"store_id": string,"total_rows"?: number,"updated_rows"?: number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"error_rows"?: number,"errors"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"inserted_rows"?: number,"kind"?: string,"organization_id"?: string,"status"?: string,"store_id"?: string,"total_rows"?: number,"updated_rows"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "import_jobs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "import_jobs_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"organization_id": string,"role": string,"status": string,"store_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id": string,"role": string,"status"?: string,"store_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"organization_id"?: string,"role"?: string,"status"?: string,"store_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"message_templates": {
                  Row: {
                    "body": string,"category": string,"created_at": string,"created_by": string | null,"id": string,"is_archived": boolean,"name": string,"organization_id": string,"store_id": string | null,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"category": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_archived"?: boolean,"name": string,"organization_id": string,"store_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "body"?: string,"category"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_archived"?: boolean,"name"?: string,"organization_id"?: string,"store_id"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_templates_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_templates_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"organization_counters": {
                  Row: {
                    "customer_seq": number,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "customer_seq"?: number,"organization_id": string
                  }
                  Update: {
                    "customer_seq"?: number,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_counters_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address": string | null,"contact_email": string | null,"created_at": string,"id": string,"limits": NonNullable<Json>,"name": string,"phone": string | null,"settings": NonNullable<Json>,"slug": string,"status": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"contact_email"?: string | null,"created_at"?: string,"id"?: string,"limits"?: NonNullable<Json>,"name": string,"phone"?: string | null,"settings"?: NonNullable<Json>,"slug": string,"status"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"contact_email"?: string | null,"created_at"?: string,"id"?: string,"limits"?: NonNullable<Json>,"name"?: string,"phone"?: string | null,"settings"?: NonNullable<Json>,"slug"?: string,"status"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "granted_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"stores": {
                  Row: {
                    "address": string | null,"code": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"organization_id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"organization_id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"organization_id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stores_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"organization_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"display_name": string,"email": string,"id": string,"is_active": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"email"?: string,"id": string,"is_active"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"email"?: string,"id"?: string,"is_active"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"visits": {
                  Row: {
                    "created_at": string,"created_by": string | null,"customer_id": string,"id": string,"menu_label": string | null,"organization_id": string,"source": string,"staff_id": string | null,"store_id": string,"visited_on": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id": string,"id"?: string,"menu_label"?: string | null,"organization_id": string,"source"?: string,"staff_id"?: string | null,"store_id": string,"visited_on": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"customer_id"?: string,"id"?: string,"menu_label"?: string | null,"organization_id"?: string,"source"?: string,"staff_id"?: string | null,"store_id"?: string,"visited_on"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "visits_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customer_overview"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "visits_organization_id_customer_id_fkey"
      columns: ["organization_id","customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "visits_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "visits_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "customer_overview": {
                  Row: {
                    "assigned_staff_id": string | null,"contact_status": string,"created_at": string,"customer_code": string,"email": string | null,"family_name": string,"family_name_kana": string,"first_visit_on": string | null,"given_name": string,"given_name_kana": string,"id": string,"last_visit_on": string | null,"next_appointment_at": string | null,"open_task_count": number | null,"organization_id": string,"overdue_task_count": number | null,"phone": string | null,"search_text": string | null,"store_id": string,"tag_ids": (string)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                           "assigned_staff_id"?: string | null,"contact_status"?: string | null,"created_at"?: string | null,"customer_code"?: string | null,"email"?: string | null,"family_name"?: string | null,"family_name_kana"?: string | null,"first_visit_on"?: string | null,"given_name"?: string | null,"given_name_kana"?: string | null,"id"?: string | null,"last_visit_on"?: string | null,"next_appointment_at"?: never,"open_task_count"?: never,"organization_id"?: string | null,"overdue_task_count"?: never,"phone"?: string | null,"search_text"?: string | null,"store_id"?: string | null,"tag_ids"?: never
                         }
                        Update: {
                           "assigned_staff_id"?: string | null,"contact_status"?: string | null,"created_at"?: string | null,"customer_code"?: string | null,"email"?: string | null,"family_name"?: string | null,"family_name_kana"?: string | null,"first_visit_on"?: string | null,"given_name"?: string | null,"given_name_kana"?: string | null,"id"?: string | null,"last_visit_on"?: string | null,"next_appointment_at"?: never,"open_task_count"?: never,"organization_id"?: string | null,"overdue_task_count"?: never,"phone"?: string | null,"search_text"?: string | null,"store_id"?: string | null,"tag_ids"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "customers_assigned_staff_id_fkey"
      columns: ["assigned_staff_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customers_organization_id_store_id_fkey"
      columns: ["organization_id","store_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                }
          }
          Functions: {
            "analytics_summary":
{ Args: { "p_as_of": string,"p_from": string,"p_org": string,"p_to": string }; Returns: {
              "appointment_confirmed_count": number,"done_count": number,"not_applicable_count": number,"overdue_count": number,"revisit_confirmed_count": number,"store_id": string,"store_name": string,"target_count": number
            }[]
                           },
"anonymize_customer":
{ Args: { "p_customer": string }; Returns: undefined
                           },
"dashboard_summary":
{ Args: { "p_as_of": string,"p_org": string }; Returns: Json
                           },
"followup_customer_snapshots":
{ Args: { "p_as_of": string,"p_org": string }; Returns: {
              "assigned_staff_id": string,"contact_status": string,"customer_id": string,"first_visit_on": string,"is_deleted": boolean,"last_followup_on": string,"last_visit_on": string,"next_appointment_at": string,"store_id": string
            }[]
                           },
"log_audit_event":
{ Args: { "org": string,"p_action": string,"p_details"?: Json,"p_entity_id"?: string,"p_entity_type": string }; Returns: undefined
                           },
"platform_audit_logs":
{ Args: { "p_limit"?: number }; Returns: {
              "action": string,"actor_user_id": string,"changes": Json,"created_at": string,"entity_id": string,"entity_type": string,"id": number
            }[]
                           },
"platform_create_organization":
{ Args: { "p_name": string,"p_slug": string,"p_timezone"?: string }; Returns: string
                           },
"platform_org_summaries":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"customer_count": number,"id": string,"member_count": number,"name": string,"slug": string,"status": string,"store_count": number
            }[]
                           },
"platform_set_organization_status":
{ Args: { "p_org": string,"p_status": string }; Returns: undefined
                           },
"record_task_action":
{ Args: { "p_channel"?: string,"p_content"?: string,"p_note"?: string,"p_outcome"?: string,"p_status": string,"p_task": string,"p_template"?: string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
