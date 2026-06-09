-- Tactical COP — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- https://supabase.com/dashboard/project/_/sql

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Missions ────────────────────────────────────────────────
create table if not exists missions (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  created_by uuid references auth.users(id),
  status     text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now()
);

-- ── Mission members ─────────────────────────────────────────
create table if not exists mission_members (
  mission_id    uuid not null references missions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  callsign      text not null,
  role          text not null default 'editor'
                  check (role in ('commander','editor','viewer')),
  unit_id       uuid,                      -- Phase 3: org hierarchy
  duty_position text,                      -- e.g. '6','S3','XO'
  joined_at     timestamptz not null default now(),
  primary key (mission_id, user_id)
);

-- ── Org units (Phase 3) ─────────────────────────────────────
create table if not exists org_units (
  id           uuid primary key default uuid_generate_v4(),
  mission_id   uuid not null references missions(id) on delete cascade,
  name         text not null,
  echelon      text,  -- squad/platoon/company/battalion/brigade
  parent_unit_id uuid references org_units(id)
);

-- ── Nets / channels (Phase 3) ───────────────────────────────
create table if not exists nets (
  id         uuid primary key default uuid_generate_v4(),
  mission_id uuid not null references missions(id) on delete cascade,
  name       text not null,
  type       text default 'command'  -- command, admin-log, o-and-i
);

create table if not exists net_members (
  net_id  uuid not null references nets(id) on delete cascade,
  user_id uuid references auth.users(id),
  unit_id uuid references org_units(id),
  primary key (net_id, coalesce(user_id::text,''), coalesce(unit_id::text,''))
);

-- ── Layers ──────────────────────────────────────────────────
create table if not exists layers (
  id         uuid primary key default uuid_generate_v4(),
  mission_id uuid not null references missions(id) on delete cascade,
  name       text not null,
  visibility boolean not null default true,
  owner_role text default 'editor'
);

-- ── Units (tactical markers) ─────────────────────────────────
create table if not exists units (
  id         uuid primary key default uuid_generate_v4(),
  mission_id uuid not null references missions(id) on delete cascade,
  sidc       text not null,              -- MIL-STD-2525D SIDC
  callsign   text,
  affiliation text generated always as (substr(sidc,2,1)) stored,
  echelon    text,
  higher_hq  text,
  lat        double precision not null,
  lng        double precision not null,
  notes      text,
  locked     boolean default false,
  layer_id   uuid references layers(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ── Graphics (lines, areas) ──────────────────────────────────
create table if not exists graphics (
  id         uuid primary key default uuid_generate_v4(),
  mission_id uuid not null references missions(id) on delete cascade,
  type       text,                        -- line, area, phase-line, objective …
  geometry   jsonb not null,              -- GeoJSON geometry object
  style      jsonb default '{}',
  label      text,
  phase      int,                         -- Phase 4: phase-of-operation tag
  layer_id   uuid references layers(id),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ── Messages (Phase 3) ───────────────────────────────────────
create table if not exists messages (
  id         uuid primary key default uuid_generate_v4(),
  mission_id uuid not null references missions(id) on delete cascade,
  net_id     uuid references nets(id),
  from_user  uuid references auth.users(id),
  body       text not null,
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now()
);

create table if not exists message_receipts (
  message_id uuid not null references messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  status     text not null default 'sent' check (status in ('sent','delivered','read','acknowledged')),
  ts         timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ── Reports (Phase 3) ────────────────────────────────────────
create table if not exists reports (
  id             uuid primary key default uuid_generate_v4(),
  mission_id     uuid not null references missions(id) on delete cascade,
  user_id        uuid references auth.users(id),
  net_id         uuid references nets(id),
  format         text,                   -- sitrep, spotrep, frago, salute …
  fields         jsonb default '{}',
  lat            double precision,
  lng            double precision,
  linked_unit_id uuid references units(id),
  created_at     timestamptz not null default now()
);

-- ── Position history (Phase 2, optional) ────────────────────
create table if not exists position_history (
  id         bigserial primary key,
  mission_id uuid not null references missions(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  lat        double precision not null,
  lng        double precision not null,
  heading    double precision,
  speed      double precision,
  ts         timestamptz not null default now()
);

-- ── Audit log ────────────────────────────────────────────────
create table if not exists events (
  id          bigserial primary key,
  mission_id  uuid references missions(id) on delete cascade,
  user_id     uuid references auth.users(id),
  action      text not null,            -- create/update/delete
  entity_type text not null,            -- unit/graphic/message/report
  entity_id   text,
  payload     jsonb,
  created_at  timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists units_mission    on units    (mission_id);
create index if not exists graphics_mission on graphics (mission_id);
create index if not exists messages_net     on messages (net_id);
create index if not exists pos_hist_mission on position_history (mission_id, ts desc);

-- ── Row Level Security ───────────────────────────────────────
alter table missions        enable row level security;
alter table mission_members enable row level security;
alter table org_units       enable row level security;
alter table nets            enable row level security;
alter table net_members     enable row level security;
alter table layers          enable row level security;
alter table units           enable row level security;
alter table graphics        enable row level security;
alter table messages        enable row level security;
alter table message_receipts enable row level security;
alter table reports         enable row level security;
alter table position_history enable row level security;
alter table events          enable row level security;

-- Helper: is the current user a member of a mission?
create or replace function is_mission_member(mid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from mission_members
    where mission_id = mid and user_id = auth.uid()
  );
$$;

-- Helper: what is the current user's role in a mission?
create or replace function mission_role(mid uuid)
returns text language sql security definer as $$
  select role from mission_members
  where mission_id = mid and user_id = auth.uid()
  limit 1;
$$;

-- Missions: readable/writable by members; create by anyone authenticated
create policy "missions_select" on missions for select
  using (is_mission_member(id));
create policy "missions_insert" on missions for insert
  with check (auth.uid() is not null);
create policy "missions_update" on missions for update
  using (mission_role(id) = 'commander');

-- Mission members: see your own mission's roster; commanders manage
create policy "mm_select" on mission_members for select
  using (is_mission_member(mission_id));
create policy "mm_insert" on mission_members for insert
  with check (auth.uid() is not null);
create policy "mm_update" on mission_members for update
  using (mission_role(mission_id) in ('commander'));
create policy "mm_delete" on mission_members for delete
  using (user_id = auth.uid() or mission_role(mission_id) = 'commander');

-- Units: members read; editors/commanders write
create policy "units_select" on units for select
  using (is_mission_member(mission_id));
create policy "units_insert" on units for insert
  with check (is_mission_member(mission_id) and mission_role(mission_id) in ('commander','editor'));
create policy "units_update" on units for update
  using (is_mission_member(mission_id) and mission_role(mission_id) in ('commander','editor'));
create policy "units_delete" on units for delete
  using (is_mission_member(mission_id) and mission_role(mission_id) in ('commander','editor'));

-- Graphics: same as units
create policy "graphics_select" on graphics for select
  using (is_mission_member(mission_id));
create policy "graphics_insert" on graphics for insert
  with check (is_mission_member(mission_id) and mission_role(mission_id) in ('commander','editor'));
create policy "graphics_update" on graphics for update
  using (is_mission_member(mission_id) and mission_role(mission_id) in ('commander','editor'));
create policy "graphics_delete" on graphics for delete
  using (is_mission_member(mission_id) and mission_role(mission_id) in ('commander','editor'));

-- Messages / reports: members read; members write to their nets
create policy "msgs_select"   on messages for select using (is_mission_member(mission_id));
create policy "msgs_insert"   on messages for insert with check (is_mission_member(mission_id));
create policy "reports_select" on reports for select using (is_mission_member(mission_id));
create policy "reports_insert" on reports for insert with check (is_mission_member(mission_id));

-- Position history: members read their mission's history
create policy "pos_select" on position_history for select using (is_mission_member(mission_id));
create policy "pos_insert" on position_history for insert with check (is_mission_member(mission_id));

-- Events: append-only audit; members read
create policy "events_select" on events for select using (is_mission_member(mission_id));
create policy "events_insert" on events for insert with check (is_mission_member(mission_id));

-- Enable Realtime for the two hot tables
alter publication supabase_realtime add table units;
alter publication supabase_realtime add table graphics;
alter publication supabase_realtime add table messages;
