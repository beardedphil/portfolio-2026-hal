-- Migration: Add PM working memory table (0173)
-- Enables durable, queryable working memory for PM agent conversations

create table if not exists public.hal_pm_working_memory (
  project_id text not null,
  conversation_id text not null default 'project-manager-1',
  summary text,
  goals text[],
  requirements text[],
  constraints text[],
  decisions text[],
  assumptions text[],
  open_questions text[],
  glossary jsonb, -- { term: definition }
  stakeholders text[],
  last_updated timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  primary key (project_id, conversation_id)
);

create index if not exists hal_pm_working_memory_project_id_idx on public.hal_pm_working_memory(project_id);
create index if not exists hal_pm_working_memory_conversation_id_idx on public.hal_pm_working_memory(conversation_id);
create index if not exists hal_pm_working_memory_last_updated_idx on public.hal_pm_working_memory(last_updated);

comment on table public.hal_pm_working_memory is 'Durable working memory for PM agent conversations. Accumulates key facts, decisions, and context over long conversations.';
comment on column public.hal_pm_working_memory.project_id is 'Project identifier (repo full name)';
comment on column public.hal_pm_working_memory.conversation_id is 'Conversation identifier (e.g., project-manager-1)';
comment on column public.hal_pm_working_memory.summary is 'Concise summary of the conversation context';
comment on column public.hal_pm_working_memory.goals is 'Array of project goals discussed';
comment on column public.hal_pm_working_memory.requirements is 'Array of requirements identified';
comment on column public.hal_pm_working_memory.constraints is 'Array of constraints mentioned';
comment on column public.hal_pm_working_memory.decisions is 'Array of decisions made';
comment on column public.hal_pm_working_memory.assumptions is 'Array of assumptions noted';
comment on column public.hal_pm_working_memory.open_questions is 'Array of open questions';
comment on column public.hal_pm_working_memory.glossary is 'JSON object mapping terms to definitions';
comment on column public.hal_pm_working_memory.stakeholders is 'Array of stakeholders mentioned';
comment on column public.hal_pm_working_memory.last_updated is 'Timestamp of last update';
comment on column public.hal_pm_working_memory.created_at is 'Timestamp of creation';
