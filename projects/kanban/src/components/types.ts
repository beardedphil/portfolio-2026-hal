/** Supabase agent_artifacts table row (0082) */
export type SupabaseAgentArtifactRow = {
  artifact_id: string
  ticket_pk: string
  repo_full_name: string
  agent_type: 'implementation' | 'qa' | 'human-in-the-loop' | 'other'
  title: string
  body_md: string
  created_at: string
  updated_at: string
}

/** Supabase ticket_attachments table row (0092) */
export type TicketAttachment = {
  pk: string
  ticket_pk: string
  ticket_id: string
  filename: string
  mime_type: string
  data_url: string
  file_size: number | null
  created_at: string
}
