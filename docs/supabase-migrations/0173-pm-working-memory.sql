-- Migration: Add PM working memory table (0173)
-- Enables durable, queryable working memory for PM agent conversations

create table if not exists public.hal_pm_working_memory (
  project_id text not null,
  conversation_id text not null, -- e.g., "project-manager-1"
  summary text not null default '',
  goals text[] default array[]::text[],
  requirements text[] default array[]::text[],
  constraints text[] default array[]::text[],
  decisions text[] default array[]::text[],
  assumptions text[] default array[]::text[],
  open_questions text[] default array[]::text[],
  glossary jsonb default '{}'::jsonb, -- Map of term -> definition
  stakeholders text[] default array[]::text[],
  last_updated_at timestamptz not null default now(),
  last_sequence int not null default 0, -- Last message sequence this memory covers
  primary key (project_id, conversation_id)
);

create index if not exists hal_pm_wm_project_conv
  on public.hal_pm_working_memory (project_id, conversation_id);

comment on table public.hal_pm_working_memory is 'Durable working memory for PM agent conversations. Accumulates key facts (goals, requirements, constraints, decisions, etc.) and is automatically updated as conversations grow.';
comment on column public.hal_pm_working_memory.summary is 'Concise summary of the conversation context';
comment on column public.hal_pm_working_memory.goals is 'Array of project goals discussed';
comment on column public.hal_pm_working_memory.requirements is 'Array of requirements identified';
comment on column public.hal_pm_working_memory.constraints is 'Array of constraints mentioned';
comment on column public.hal_pm_working_memory.decisions is 'Array of decisions made';
comment on column public.hal_pm_working_memory.assumptions is 'Array of assumptions noted';
comment on column public.hal_pm_working_memory.open_questions is 'Array of open questions';
comment on column public.hal_pm_working_memory.glossary is 'Map of terminology/terms to definitions';
comment on column public.hal_pm_working_memory.stakeholders is 'Array of stakeholders mentioned';
comment on column public.hal_pm_working_memory.last_sequence is 'Last message sequence number this memory covers';
