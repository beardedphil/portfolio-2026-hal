-- Migration: Add working memory table for PM conversations (0173)
-- Enables structured, queryable working memory for long PM conversations

create table if not exists public.hal_conversation_working_memory (
  project_id text not null,
  agent text not null,
  summary text not null default '',
  goals text[] default array[]::text[],
  requirements text[] default array[]::text[],
  constraints text[] default array[]::text[],
  decisions text[] default array[]::text[],
  assumptions text[] default array[]::text[],
  open_questions text[] default array[]::text[],
  glossary jsonb default '{}'::jsonb, -- Map of term -> definition
  stakeholders text[] default array[]::text[],
  updated_at timestamptz not null default now(),
  through_sequence int not null default 0, -- Last message sequence included in this memory
  primary key (project_id, agent)
);

create index if not exists hal_conv_wm_project_agent
  on public.hal_conversation_working_memory (project_id, agent);

comment on table public.hal_conversation_working_memory is 'Structured working memory for PM conversations: goals, requirements, constraints, decisions, assumptions, open questions, glossary, and stakeholders. Automatically updated as conversations grow.';
comment on column public.hal_conversation_working_memory.summary is 'Concise summary of the conversation context';
comment on column public.hal_conversation_working_memory.goals is 'Array of project goals discussed';
comment on column public.hal_conversation_working_memory.requirements is 'Array of requirements identified';
comment on column public.hal_conversation_working_memory.constraints is 'Array of constraints mentioned';
comment on column public.hal_conversation_working_memory.decisions is 'Array of decisions made';
comment on column public.hal_conversation_working_memory.assumptions is 'Array of assumptions stated';
comment on column public.hal_conversation_working_memory.open_questions is 'Array of open questions';
comment on column public.hal_conversation_working_memory.glossary is 'JSON object mapping terms to definitions';
comment on column public.hal_conversation_working_memory.stakeholders is 'Array of stakeholders mentioned';
comment on column public.hal_conversation_working_memory.through_sequence is 'Last message sequence number included in this working memory';
