-- Migration: Add PM working memory table (0173)
-- Stores structured working memory for PM agent conversations to enable unlimited-length conversations

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
  glossary text[] default array[]::text[], -- Array of "term: definition" strings
  stakeholders text[] default array[]::text[],
  updated_at timestamptz not null default now(),
  last_sequence int not null default 0, -- Last message sequence number used to generate this memory
  primary key (project_id, agent)
);

create index if not exists hal_pm_wm_project_agent
  on public.hal_pm_working_memory (project_id, agent);

comment on table public.hal_pm_working_memory is 'Structured working memory for PM agent conversations. Automatically updated as conversations grow to maintain context without full transcript.';
comment on column public.hal_pm_working_memory.summary is 'Concise summary of the conversation and project context';
comment on column public.hal_pm_working_memory.goals is 'Array of project goals discussed';
comment on column public.hal_pm_working_memory.requirements is 'Array of requirements identified';
comment on column public.hal_pm_working_memory.constraints is 'Array of constraints or limitations';
comment on column public.hal_pm_working_memory.decisions is 'Array of decisions made during conversation';
comment on column public.hal_pm_working_memory.assumptions is 'Array of assumptions stated';
comment on column public.hal_pm_working_memory.open_questions is 'Array of open questions or unresolved items';
comment on column public.hal_pm_working_memory.glossary is 'Array of "term: definition" strings for project-specific terminology';
comment on column public.hal_pm_working_memory.stakeholders is 'Array of stakeholders mentioned';
comment on column public.hal_pm_working_memory.last_sequence is 'Last message sequence number that was processed to generate this working memory';
