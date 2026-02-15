-- Migration: Add PM working memory table (0173)
-- Enables durable, queryable working memory for PM conversations

create table if not exists public.hal_pm_working_memory (
  project_id text not null,
  conversation_id text not null, -- e.g., "project-manager-1"
  summary text not null default '',
  goals text not null default '',
  requirements text not null default '',
  constraints text not null default '',
  decisions text not null default '',
  assumptions text not null default '',
  open_questions text not null default '',
  glossary_terms text not null default '', -- JSON array of {term, definition}
  last_updated timestamptz not null default now(),
  through_sequence int not null default 0, -- Last message sequence included in this memory
  primary key (project_id, conversation_id)
);

create index if not exists hal_pm_wm_project_conv
  on public.hal_pm_working_memory (project_id, conversation_id);

comment on table public.hal_pm_working_memory is 'Durable working memory for PM agent conversations. Stores key facts, decisions, and context that persists across long conversations.';
comment on column public.hal_pm_working_memory.conversation_id is 'Conversation identifier (e.g., "project-manager-1")';
comment on column public.hal_pm_working_memory.summary is 'Concise summary of the conversation and project context';
comment on column public.hal_pm_working_memory.goals is 'Project goals and objectives discussed';
comment on column public.hal_pm_working_memory.requirements is 'Requirements and specifications mentioned';
comment on column public.hal_pm_working_memory.constraints is 'Technical or business constraints identified';
comment on column public.hal_pm_working_memory.decisions is 'Key decisions made during the conversation';
comment on column public.hal_pm_working_memory.assumptions is 'Assumptions and premises established';
comment on column public.hal_pm_working_memory.open_questions is 'Open questions or unresolved items';
comment on column public.hal_pm_working_memory.glossary_terms is 'JSON array of terminology definitions: [{"term": "...", "definition": "..."}, ...]';
comment on column public.hal_pm_working_memory.through_sequence is 'Last message sequence number included in this working memory';
