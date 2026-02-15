-- Migration: Add PM working memory table (0173)
-- Enables durable, queryable working memory for PM agent conversations
-- Working memory accumulates key facts (goals, requirements, constraints, decisions, etc.)
-- and is automatically updated as conversations grow

create table if not exists public.hal_pm_working_memory (
  project_id text not null,
  agent text not null default 'project-manager',
  summary text not null default '',
  goals text not null default '',
  requirements text not null default '',
  constraints text not null default '',
  decisions text not null default '',
  assumptions text not null default '',
  open_questions text not null default '',
  glossary_terms text not null default '',
  stakeholders text not null default '',
  last_updated timestamptz not null default now(),
  through_sequence int not null default 0,
  primary key (project_id, agent)
);

create index if not exists hal_pm_wm_project_agent
  on public.hal_pm_working_memory (project_id, agent);

comment on table public.hal_pm_working_memory is 'Durable working memory for PM agent conversations. Stores accumulated key facts (goals, requirements, constraints, decisions, etc.) that persist across sessions and enable long conversations without performance degradation.';
comment on column public.hal_pm_working_memory.summary is 'Concise summary of the working memory content';
comment on column public.hal_pm_working_memory.goals is 'Project goals discussed in the conversation';
comment on column public.hal_pm_working_memory.requirements is 'Requirements identified during the conversation';
comment on column public.hal_pm_working_memory.constraints is 'Constraints and limitations discussed';
comment on column public.hal_pm_working_memory.decisions is 'Key decisions made during the conversation';
comment on column public.hal_pm_working_memory.assumptions is 'Assumptions made or identified';
comment on column public.hal_pm_working_memory.open_questions is 'Open questions that need answers';
comment on column public.hal_pm_working_memory.glossary_terms is 'Terminology and definitions used in the conversation';
comment on column public.hal_pm_working_memory.stakeholders is 'Stakeholders mentioned or involved';
comment on column public.hal_pm_working_memory.last_updated is 'Timestamp when working memory was last updated';
comment on column public.hal_pm_working_memory.through_sequence is 'Last message sequence number included in this working memory';
