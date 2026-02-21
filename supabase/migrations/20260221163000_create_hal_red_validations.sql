-- Ticket: RED validation v1 (Option A)
--
-- Goal:
-- - Keep RED documents immutable (no updates to hal_red_documents)
-- - Track validation outcome separately via hal_red_validations
-- - Make get_latest_valid_red depend on validation rows (result = 'valid')

create extension if not exists pgcrypto;

-- Validation result enum (separate from red_validation_status on the RED row)
do $$
begin
  create type red_validation_result as enum ('valid', 'invalid');
exception
  when duplicate_object then null;
end
$$;

create table if not exists hal_red_validations (
  validation_id uuid primary key default gen_random_uuid(),
  red_id uuid not null,
  result red_validation_result not null,
  created_at timestamptz not null default now(),
  created_by text,
  notes text,

  constraint hal_red_validations_red_fk
    foreign key (red_id) references hal_red_documents(red_id) on delete cascade,
  constraint hal_red_validations_red_id_key unique (red_id)
);

create index if not exists idx_hal_red_validations_red_id on hal_red_validations(red_id);
create index if not exists idx_hal_red_validations_result on hal_red_validations(result);
create index if not exists idx_hal_red_validations_created_at on hal_red_validations(created_at desc);

alter table hal_red_validations enable row level security;

-- Allow anon read/insert for now (matches hal_red_documents policies)
do $$
begin
  create policy "Allow anon read red validations"
    on hal_red_validations
    for select
    using (true);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy "Allow anon insert red validations"
    on hal_red_validations
    for insert
    with check (true);
exception
  when duplicate_object then null;
end
$$;

-- Update latest-valid function to use validations table.
create or replace function get_latest_valid_red(
  p_repo_full_name text,
  p_ticket_pk uuid
)
returns table (
  red_id uuid,
  repo_full_name text,
  ticket_pk uuid,
  version integer,
  red_json jsonb,
  content_checksum text,
  validation_status red_validation_status,
  created_at timestamptz,
  created_by text,
  artifact_id uuid
) as $$
begin
  return query
  select
    r.red_id,
    r.repo_full_name,
    r.ticket_pk,
    r.version,
    r.red_json,
    r.content_checksum,
    'valid'::red_validation_status as validation_status,
    r.created_at,
    r.created_by,
    r.artifact_id
  from hal_red_documents r
  join hal_red_validations v
    on v.red_id = r.red_id
   and v.result = 'valid'
  where r.repo_full_name = p_repo_full_name
    and r.ticket_pk = p_ticket_pk
  order by r.version desc, r.created_at desc
  limit 1;
end;
$$ language plpgsql stable;

