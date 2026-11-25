-- RiskLens database (Supabase / PostgreSQL)
-- Run this once in Supabase: SQL Editor -> New query -> paste everything -> Run.
-- It creates the tables from the class diagram in the SRS (Appendix B.2),
-- and the security rules that enforce the roles (FR 5.2, rule 5.3),
-- append-only inspections (NFR 4) and logged-in-only access (NFR 8).

-- ---------- tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  email text not null unique,
  role text not null check (role in ('ADMIN', 'INSPECTOR')),
  assigned_district text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  weights jsonb not null default '{"siteType":1,"violations":1,"waterDistance":1,"inspectionAge":1}',
  overdue_threshold_days int not null default 365 check (overdue_threshold_days between 30 and 1095),
  updated_at timestamptz,
  updated_by uuid references public.profiles (id)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.sites (
  id text primary key,
  name text not null check (char_length(name) between 3 and 100),
  district text not null,
  site_type text not null,
  project_scale text not null check (project_scale in ('SMALL', 'MEDIUM', 'LARGE')),
  distance_to_water_metres numeric check (distance_to_water_metres >= 0),
  latitude numeric check (latitude between -90 and 90),
  longitude numeric check (longitude between -180 and 180),
  prior_violations int not null default 0 check (prior_violations >= 0),
  prior_inspection_date date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspections (
  id text primary key,
  site_id text not null references public.sites (id),
  visit_date date not null,
  outcome text not null check (outcome in ('PASS', 'VIOLATION')),
  notes text not null default '' check (char_length(notes) <= 2000),
  inspector_id uuid not null references public.profiles (id),
  inspector_name text not null,
  recorded_at timestamptz not null,           -- when the inspector saved it (on the device)
  synced_at timestamptz not null default now(), -- when it reached the database
  score_before int,
  score_after int
);

create table if not exists public.violations (
  id bigint generated always as identity primary key,
  inspection_id text not null references public.inspections (id),
  position int not null default 0,
  category text not null,
  severity text not null check (severity in ('MINOR', 'MAJOR', 'CRITICAL')),
  description text not null check (char_length(description) between 5 and 1000)
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references public.profiles (id),
  user_name text not null,
  action text not null,
  detail text not null default ''
);

create index if not exists inspections_site_idx on public.inspections (site_id);
create index if not exists violations_inspection_idx on public.violations (inspection_id);

-- ---------- helper functions ----------

-- The role of the logged-in user, or null if they have no active account.
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'ADMIN', false)
$$;

-- True only before the first account has been set up.
create or replace function public.no_users_yet() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles)
$$;

-- Inspection records can never be changed or deleted (NFR 4), not even by
-- an administrator or directly in the database.
create or replace function public.block_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Inspection records are append-only and cannot be changed or deleted.';
end
$$;

drop trigger if exists inspections_append_only on public.inspections;
create trigger inspections_append_only before update or delete on public.inspections
  for each row execute function public.block_changes();
drop trigger if exists violations_append_only on public.violations;
create trigger violations_append_only before update or delete on public.violations
  for each row execute function public.block_changes();

-- Saves an inspection and its violations together, so a violation can
-- never be saved without its inspection or the other way round.
-- Safe to call twice with the same id (used when re-sending after being offline).
create or replace function public.record_inspection(p jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v jsonb;
  i int := 0;
begin
  if exists (select 1 from public.inspections where id = p->>'id') then
    return; -- already saved
  end if;
  insert into public.inspections (id, site_id, visit_date, outcome, notes, inspector_id, inspector_name, recorded_at, score_before, score_after)
  values (p->>'id', p->>'siteId', (p->>'visitDate')::date, p->>'outcome', coalesce(p->>'notes', ''),
          auth.uid(), p->>'inspectorName', (p->>'recordedAt')::timestamptz,
          (p->>'scoreBefore')::int, (p->>'scoreAfter')::int);
  for v in select * from jsonb_array_elements(coalesce(p->'violations', '[]'::jsonb)) loop
    insert into public.violations (inspection_id, position, category, severity, description)
    values (p->>'id', i, v->>'category', v->>'severity', v->>'description');
    i := i + 1;
  end loop;
end
$$;

-- ---------- security rules (row level security) ----------

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.sites enable row level security;
alter table public.inspections enable row level security;
alter table public.violations enable row level security;
alter table public.activity enable row level security;

-- Remove old versions of the rules so this script can be run again.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('profiles', 'settings', 'sites', 'inspections', 'violations', 'activity') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$$;

-- Users: any active user can see the list (names on inspections);
-- the very first account sets itself up as administrator; after that
-- only administrators add or change accounts. Nobody deletes accounts.
create policy "profiles: read" on public.profiles for select to authenticated
  using (public.my_role() is not null or id = auth.uid());
create policy "profiles: first admin" on public.profiles for insert to authenticated
  with check (public.no_users_yet() and id = auth.uid() and role = 'ADMIN');
create policy "profiles: admin adds" on public.profiles for insert to authenticated
  with check (public.is_admin());
create policy "profiles: admin changes" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Scoring settings: everyone reads, only administrators change (rule 5.3).
create policy "settings: read" on public.settings for select to authenticated
  using (public.my_role() is not null);
create policy "settings: admin changes" on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Sites: everyone reads, administrators add and edit (FR 1.1, FR 1.2). No deleting.
create policy "sites: read" on public.sites for select to authenticated
  using (public.my_role() is not null);
create policy "sites: admin adds" on public.sites for insert to authenticated
  with check (public.is_admin());
create policy "sites: admin edits" on public.sites for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Inspections and violations: everyone reads (FR 6.1); only inspectors add,
-- and only under their own name (FR 2.1, FR 5.2). No updates or deletes (NFR 4).
create policy "inspections: read" on public.inspections for select to authenticated
  using (public.my_role() is not null);
create policy "inspections: inspector adds" on public.inspections for insert to authenticated
  with check (public.my_role() = 'INSPECTOR' and inspector_id = auth.uid());
create policy "violations: read" on public.violations for select to authenticated
  using (public.my_role() is not null);
create policy "violations: inspector adds" on public.violations for insert to authenticated
  with check (exists (select 1 from public.inspections i where i.id = inspection_id and i.inspector_id = auth.uid()));

-- Activity log: administrators read; every user adds their own entries.
create policy "activity: admin reads" on public.activity for select to authenticated
  using (public.is_admin());
create policy "activity: add own" on public.activity for insert to authenticated
  with check (public.my_role() is not null and user_id = auth.uid());

-- Logged-out visitors get nothing (NFR 8).
revoke all on all tables in schema public from anon;
grant select, insert, update on public.profiles, public.settings, public.sites, public.activity to authenticated;
grant select, insert on public.inspections, public.violations to authenticated;
grant execute on function public.record_inspection(jsonb), public.my_role(), public.is_admin(), public.no_users_yet() to authenticated;
revoke execute on function public.record_inspection(jsonb) from anon;
-- The login page asks this before anyone has logged in, to know whether to show first-time setup.
grant execute on function public.no_users_yet() to anon;
