# HAL conversation storage (Supabase)

When a project has a database attached (Supabase), HAL stores full conversation history here. The LLM receives a **bounded context pack** (summary of earlier conversation + recent messages within a **character budget**), not the full history, so conversations can run indefinitely without stalling.

**Content-based cap:** The "recent conversation" section is limited by **character count** (e.g. 12,000 characters, ~3k tokens), not by message count. That way a few long technical messages don’t dominate, and many short messages (e.g. about color scheme) can all fit.

**Summarization:** HAL is free to use the configured external LLM (OpenAI) to summarize older conversation turns when building the context pack. When the full history exceeds the recent-character budget, HAL calls the same model to summarize the older part; that summary is stored in `hal_conversation_summaries` and reused until new messages require an updated summary. This keeps prompt size bounded while preserving context.

Run this SQL in your project's Supabase SQL editor.

## hal_conversation_messages

Full transcript per project and agent.

```sql
create table if not exists public.hal_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  agent text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now(),
  sequence int not null,
  images jsonb -- Array of image attachments: [{"dataUrl": "data:image/...", "filename": "image.png", "mimeType": "image/png"}, ...]
);

create index if not exists hal_conv_msg_project_agent_seq
  on public.hal_conversation_messages (project_id, agent, sequence);
```

- `project_id`: project identifier (e.g. folder name when using "Connect Project Folder").
- `agent`: `project-manager`, `implementation-agent`, or `standup`.
- `sequence`: order of the message in that conversation (0, 1, 2, …).

## hal_conversation_summaries

Rolling summary of older messages so the context pack stays bounded. One row per (project_id, agent); updated when new messages push the "recent" window (character-bounded) forward so that older content needs a fresh summary.

```sql
create table if not exists public.hal_conversation_summaries (
  project_id text not null,
  agent text not null,
  summary_text text not null,
  through_sequence int not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, agent)
);
```

- `summary_text`: short summary of messages with `sequence < through_sequence`.
- `through_sequence`: this summary covers messages where `sequence < through_sequence`.

## hal_conversation_working_memory

Durable, queryable working memory for PM agent conversations. Stores structured facts (goals, requirements, constraints, decisions, etc.) extracted from conversation history. This enables long conversations without performance degradation by providing a compact, queryable summary of key facts.

```sql
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
```

- `summary`: Concise summary of the conversation context
- `goals`: Array of project goals discussed
- `requirements`: Array of requirements identified
- `constraints`: Array of constraints or limitations
- `decisions`: Array of decisions made during the conversation
- `assumptions`: Array of assumptions stated or implied
- `open_questions`: Array of open questions that need answers
- `glossary`: JSON object mapping terms to definitions
- `stakeholders`: Array of stakeholders mentioned
- `through_sequence`: Last message sequence number that was processed when generating this memory

## RLS (optional)

If you use Row Level Security, allow anon to read/write these tables for the app (same as your tickets/kanban usage), or restrict by `project_id` if you have per-project auth.
