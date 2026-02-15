-- Ticket 0663: PM conversation thread persistence
--
-- Goal:
-- - Map HAL conversation threads to Cursor agent IDs
-- - Enable multi-turn PM conversations by reusing the same Cursor agent
-- - Support restarting conversations (clearing the mapping)

create table if not exists public.hal_pm_conversation_threads (
  project_id text not null,
  conversation_id text not null, -- e.g., "project-manager-1"
  cursor_agent_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, conversation_id)
);

create index if not exists hal_pm_conv_threads_project_idx
  on public.hal_pm_conversation_threads (project_id);

create index if not exists hal_pm_conv_threads_agent_idx
  on public.hal_pm_conversation_threads (cursor_agent_id);

drop trigger if exists hal_pm_conv_threads_touch on public.hal_pm_conversation_threads;
create trigger hal_pm_conv_threads_touch
before update on public.hal_pm_conversation_threads
for each row execute function public.hal_touch_updated_at();

alter table public.hal_pm_conversation_threads disable row level security;
