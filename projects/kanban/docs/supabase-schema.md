# Supabase Schema (0020)

Run these in the Supabase SQL editor when setting up a new project.

## tickets (0011)

```sql
create table if not exists public.tickets (
  id text primary key,
  filename text not null,
  title text not null,
  body_md text not null,
  kanban_column_id text null,
  kanban_position int null,
  kanban_moved_at timestamptz null,
  updated_at timestamptz not null default now()
);
```

## kanban_columns (0020)

```sql
create table if not exists public.kanban_columns (
  id text primary key,
  title text not null,
  position int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

When `kanban_columns` is empty, the app initializes it with: Unassigned, To-do, Doing, Done (positions 0–3).
