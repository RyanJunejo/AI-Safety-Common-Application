-- SafetyApps public beta.
--
-- public.catalog_items      Public, read-only catalog synced daily from AISafety.com.
-- public.accounts           One row per signed-in person: alert opt-in and preferences.
-- public.saved_opportunities, public.followed_programs
--                           Saved listing IDs and followed recurring programs.
-- internal.*                Sync runs, catalog events, family reviews, and the alert
--                           outbox. Only the server (the database owner) reads these.
--
-- Accounts hold no name or application data: the email lives in auth.users, and the
-- tables below hold preferences and IDs. Row level security limits every account table
-- to its owner. Supabase grants new public tables to anon and authenticated by default,
-- so each table's grants are reset explicitly.

create schema if not exists internal;
revoke all on schema internal from public;

-- ---------------------------------------------------------------- Catalog

create table public.catalog_items (
  id text primary key,
  kind text not null check (kind in ('program', 'course', 'job', 'community')),
  status text not null check (status in ('open', 'upcoming', 'closed', 'recurring', 'ongoing', 'unknown')),
  deadline date,
  family_link text not null check (family_link in ('family', 'linked', 'review', 'none')),
  family_id text,
  -- The normalized listing (src/catalog/types.ts), without its long description.
  data jsonb not null,
  description text,
  content_hash text not null,
  -- False once the listing drops out of the source feed.
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);
create index catalog_items_active_kind on public.catalog_items (active, kind);
create index catalog_items_family on public.catalog_items (family_id) where family_id is not null;

alter table public.catalog_items enable row level security;
create policy "Anyone can read the catalog" on public.catalog_items for select to anon, authenticated using (true);
revoke all on public.catalog_items from anon, authenticated;
grant select on public.catalog_items to anon, authenticated;

create table internal.sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  -- The first successful import describes the existing catalog; it sends no alerts.
  baseline boolean not null default false,
  stats jsonb not null default '{}',
  error text
);
-- One sync at a time.
create unique index sync_runs_one_running on internal.sync_runs ((true)) where status = 'running';
create index sync_runs_started on internal.sync_runs (started_at desc);

create table internal.catalog_events (
  id bigint generated always as identity primary key,
  sync_run_id bigint not null references internal.sync_runs (id) on delete cascade,
  opportunity_id text not null references public.catalog_items (id) on delete cascade,
  type text not null check (type in ('listed', 'opened', 'closed', 'deadline-changed', 'removed', 'relisted')),
  day date not null,
  at timestamptz not null default now(),
  baseline boolean not null default false,
  details jsonb not null default '{}'
);
create index catalog_events_day on internal.catalog_events (day);

-- Cohorts that might belong to a recurring program, waiting for a person to decide.
create table internal.family_reviews (
  opportunity_id text primary key references public.catalog_items (id) on delete cascade,
  candidates text[] not null,
  status text not null default 'pending' check (status in ('pending', 'linked', 'standalone')),
  family_id text,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz not null default now(),
  check ((status = 'linked') = (family_id is not null))
);

create function public.catalog_synced_at() returns timestamptz
language sql stable security definer set search_path = ''
as $$ select max(finished_at) from internal.sync_runs where status = 'succeeded' $$;
revoke all on function public.catalog_synced_at() from public;
grant execute on function public.catalog_synced_at() to anon, authenticated;

-- ---------------------------------------------------------------- Accounts

create table public.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Alerts need a separate, explicit opt-in after sign-in.
  alerts_enabled boolean not null default false,
  alerts_enabled_at timestamptz,
  kinds text[] not null default array['program', 'course', 'job', 'community'],
  focus text[] not null default array['technical', 'governance', 'general'],
  any_location boolean not null default true,
  countries text[] not null default '{}',
  remote boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kinds_known check (kinds <@ array['program', 'course', 'job', 'community']),
  constraint focus_known check (focus <@ array['technical', 'governance', 'general']),
  constraint countries_limit check (cardinality(countries) <= 60)
);

create function internal.touch_account() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.alerts_enabled and (tg_op = 'INSERT' or not old.alerts_enabled) then
    new.alerts_enabled_at := now();
  elsif not new.alerts_enabled then
    new.alerts_enabled_at := null;
  end if;
  return new;
end $$;
create trigger touch_account before insert or update on public.accounts
for each row execute function internal.touch_account();

alter table public.accounts enable row level security;
create policy "Read own account" on public.accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Update own account" on public.accounts for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.accounts from anon, authenticated;
grant select on public.accounts to authenticated;
grant update (alerts_enabled, kinds, focus, any_location, countries, remote) on public.accounts to authenticated;

-- Creates the signed-in person's account on first sign-in, with alerts off.
create function public.ensure_account() returns public.accounts
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  acct public.accounts;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.accounts (user_id) values (me) on conflict (user_id) do nothing;
  select * into acct from public.accounts where user_id = me;
  return acct;
end $$;
revoke all on function public.ensure_account() from public, anon;
grant execute on function public.ensure_account() to authenticated;

create table public.saved_opportunities (
  user_id uuid not null default auth.uid() references public.accounts (user_id) on delete cascade,
  opportunity_id text not null check (char_length(opportunity_id) between 1 and 100),
  saved_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

create table public.followed_programs (
  user_id uuid not null default auth.uid() references public.accounts (user_id) on delete cascade,
  program_id text not null check (char_length(program_id) between 1 and 100),
  followed_at timestamptz not null default now(),
  primary key (user_id, program_id)
);

-- Keeps lists to a reasonable size.
create function internal.limit_rows() returns trigger
language plpgsql set search_path = ''
as $$
declare
  n int;
begin
  if tg_table_name = 'saved_opportunities' then
    select count(*) into n from public.saved_opportunities where user_id = new.user_id;
  else
    select count(*) into n from public.followed_programs where user_id = new.user_id;
  end if;
  if n >= 500 then
    raise exception 'List is full (500 items)' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger limit_saved before insert on public.saved_opportunities
for each row execute function internal.limit_rows();
create trigger limit_followed before insert on public.followed_programs
for each row execute function internal.limit_rows();

alter table public.saved_opportunities enable row level security;
create policy "Own saved list" on public.saved_opportunities for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.saved_opportunities from anon, authenticated;
grant select, insert, delete on public.saved_opportunities to authenticated;

alter table public.followed_programs enable row level security;
create policy "Own followed programs" on public.followed_programs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.followed_programs from anon, authenticated;
grant select, insert, delete on public.followed_programs to authenticated;

-- ---------------------------------------------------------------- Alerts

create table internal.alert_runs (
  id bigint generated always as identity primary key,
  day date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  -- True when the day's catalog sync failed, so no alerts about new listings were planned.
  suppressed boolean not null default false,
  planned_at timestamptz,
  stats jsonb not null default '{}',
  error text
);
create index alert_runs_day on internal.alert_runs (day);

-- Every email is written here first, then sent. The unique delivery key makes a
-- duplicate cron run a no-op, and is also the provider's idempotency key.
create table internal.alert_outbox (
  id bigint generated always as identity primary key,
  delivery_key text not null unique,
  user_id uuid references auth.users (id) on delete cascade,
  kind text not null,
  to_email text not null,
  subject text not null,
  html text not null,
  text_body text not null,
  unsubscribe_url text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'expired')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  expires_at timestamptz not null,
  -- When a send first ended without a definite answer (a timeout, a 5xx, or a crash
  -- mid-send), so the email may have gone out. The provider only deduplicates a key for
  -- 24 hours, so such an email is not retried after that.
  uncertain_since timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now()
);
create index alert_outbox_due on internal.alert_outbox (status, next_attempt_at);

-- Which items each person has been told about, so no alert repeats.
create table internal.alert_ledger (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_key text not null,
  delivery_key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

alter table internal.sync_runs enable row level security;
alter table internal.catalog_events enable row level security;
alter table internal.family_reviews enable row level security;
alter table internal.alert_runs enable row level security;
alter table internal.alert_outbox enable row level security;
alter table internal.alert_ledger enable row level security;
revoke all on all tables in schema internal from public, anon, authenticated;
