-- Migration: Add PM working memory table (0173)
-- Enables durable, queryable working memory for PM agent conversations

create table if not exists public.hal_pm_working_memory (
  project_id text not null,
  agent text not null default 'project-manager',
  summary text not null default '',
  goals text[] default array[]::text[],
  requirements text[] default array[]::text[],
  constraints text[] default array[]::text[],
  decisions text[] default array[]::text[],
  assumptions text[] default array[]::text[],
  open_questions text[] default array[]::text[],
  glossary jsonb default '{}'::jsonb, -- Map of term -> definition
  stakeholders text[] default array[]::text[],
  through_sequence int not null default 0, -- Last message sequence included in this memory
  updated_at timestamptz not null default now(),
  primary key (project_id, agent)
);

create index if not exists hal_pm_wm_project_agent
  on public.hal_pm_working_memory (project_id, agent);

comment on table public.hal_pm_working_memory is 'Durable working memory for PM agent conversations. Accumulates key facts, decisions, and context from conversations to enable long-running chats without performance degradation.';
comment on column public.hal_pm_working_memory.summary is 'Concise summary of the conversation context and key points';
comment on column public.hal_pm_working_memory.goals is 'Array of project goals discussed in the conversation';
comment on column public.hal_pm_working_memory.requirements is 'Array of requirements identified in the conversation';
comment on column public.hal_pm_working_memory.constraints is 'Array of constraints mentioned in the conversation';
comment on column public.hal_pm_working_memory.decisions is 'Array of decisions made during the conversation';
comment on column public.hal_pm_working_memory.assumptions is 'Array of assumptions stated or implied in the conversation';
comment on column public.hal_pm_working_memory.open_questions is 'Array of open questions that need to be resolved';
comment on column public.hal_pm_working_memory.glossary is 'JSON object mapping terms to their definitions (e.g., {"term": "definition"})';
comment on column public.hal_pm_working_memory.stakeholders is 'Array of stakeholders mentioned in the conversation';
comment on column public.hal_pm_working_memory.through_sequence is 'Last message sequence number included in this working memory snapshot';
comment on column public.hal_pm_working_memory.updated_at is 'Timestamp when this working memory was last updated';
