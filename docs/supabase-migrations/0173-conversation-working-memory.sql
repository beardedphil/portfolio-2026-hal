-- Migration: Add hal_conversation_working_memory table (0173)
-- Enables durable, queryable working memory for PM agent conversations
-- Stores structured facts (goals, requirements, constraints, decisions, etc.) that persist across sessions

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
  last_updated_at timestamptz not null default now(),
  through_sequence int not null default 0, -- Last sequence number processed for this memory
  primary key (project_id, agent)
);

create index if not exists hal_conv_wm_project_agent
  on public.hal_conversation_working_memory (project_id, agent);

comment on table public.hal_conversation_working_memory is 'Durable working memory for PM agent conversations. Stores structured facts extracted from conversation history to enable long conversations without performance degradation.';
comment on column public.hal_conversation_working_memory.summary is 'Concise summary of the conversation context';
comment on column public.hal_conversation_working_memory.goals is 'Array of project goals discussed in the conversation';
comment on column public.hal_conversation_working_memory.requirements is 'Array of requirements identified';
comment on column public.hal_conversation_working_memory.constraints is 'Array of constraints or limitations';
comment on column public.hal_conversation_working_memory.decisions is 'Array of decisions made during the conversation';
comment on column public.hal_conversation_working_memory.assumptions is 'Array of assumptions stated or implied';
comment on column public.hal_conversation_working_memory.open_questions is 'Array of open questions that need answers';
comment on column public.hal_conversation_working_memory.glossary is 'JSON object mapping terms to definitions';
comment on column public.hal_conversation_working_memory.stakeholders is 'Array of stakeholders mentioned';
comment on column public.hal_conversation_working_memory.through_sequence is 'Last message sequence number that was processed when generating this memory';