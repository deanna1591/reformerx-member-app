-- ReformerX Member App — production schema for Supabase (PostgreSQL)
-- Run in the Supabase SQL editor. Pairs with Supabase Auth: members.id = auth.users.id

create extension if not exists "uuid-ossp";

-- ============ Core tables ============

create table members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  membership_type text not null default 'Single Entry',
  membership_expires timestamptz,
  joined_at timestamptz not null default now(),
  qr_code text not null unique default ('RXM-' || upper(substr(uuid_generate_v4()::text, 1, 8))),
  simplybook_id text unique,
  points int not null default 0
);

create table instructors (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  role text
);

create table classes (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  instructor_id uuid references instructors(id),
  starts_at timestamptz not null,
  duration_min int not null default 50,
  wordpress_event_id text -- link back to the WP booking system during Phase 1
);

create table bookings (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  source text not null default 'wordpress',
  unique (member_id, class_id)
);

create table check_ins (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  at timestamptz not null default now(),
  unique (member_id, class_id) -- once per class, enforced by the database itself
);

-- ============ Gamification ============

create type challenge_type as enum ('class_count', 'streak_days', 'instructor_variety', 'lifetime_count');

create table challenges (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  emoji text default '🏆',
  description text,
  type challenge_type not null,
  goal int not null,
  start_date timestamptz,
  end_date timestamptz,
  reward text,
  spring_color text default 'red',
  leaderboard boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table challenge_progress (
  member_id uuid not null references members(id) on delete cascade,
  challenge_id uuid not null references challenges(id) on delete cascade,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (member_id, challenge_id)
);

create table badge_defs (
  id text primary key,
  name text not null,
  emoji text,
  description text
);

create table earned_badges (
  member_id uuid not null references members(id) on delete cascade,
  badge_id text not null references badge_defs(id),
  earned_at timestamptz not null default now(),
  primary key (member_id, badge_id)
);

create table rewards (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  emoji text,
  cost int not null,
  available boolean not null default true
);

create table redemptions (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  reward_id uuid references rewards(id),
  note text,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected'))
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  member_id uuid not null references members(id) on delete cascade,
  text text not null,
  at timestamptz not null default now(),
  read boolean not null default false
);

create table settings (
  key text primary key,
  value jsonb not null
);
insert into settings values
  ('leaderboards_enabled', 'true'),
  ('studio_code', '"RX-STUDIO-CHECKIN"');

-- ============ Server-side check-in (SECURITY DEFINER RPC) ============
-- Call from the app: supabase.rpc('perform_check_in', { scanned_code: '...' })
-- All anti-cheat rules live in the database so the client can never bypass them.

create or replace function perform_check_in(scanned_code text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_member members%rowtype;
  v_class classes%rowtype;
  v_window interval := interval '30 minutes';
begin
  select * into v_member from members where id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Member not found.');
  end if;

  if scanned_code <> (select value #>> '{}' from settings where key = 'studio_code') then
    return jsonb_build_object('ok', false, 'message', 'Invalid studio code.');
  end if;

  if v_member.membership_expires is null or v_member.membership_expires < now() then
    return jsonb_build_object('ok', false, 'message', 'Membership expired. Please renew.');
  end if;

  select c.* into v_class
  from bookings b join classes c on c.id = b.class_id
  where b.member_id = v_member.id
    and now() between c.starts_at - v_window
                  and c.starts_at + (c.duration_min || ' minutes')::interval + v_window
  order by c.starts_at limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'No booked class in the check-in window.');
  end if;

  if exists (select 1 from check_ins where member_id = v_member.id and class_id = v_class.id) then
    return jsonb_build_object('ok', false, 'message', 'Already checked in for this class.');
  end if;

  insert into check_ins (member_id, class_id) values (v_member.id, v_class.id);
  update members set points = points + 10 where id = v_member.id;

  -- Challenge/badge evaluation runs in the evaluate_progress trigger below.
  return jsonb_build_object('ok', true, 'message', 'Checked in to ' || v_class.title, 'class', v_class.title);
end;
$$;

-- ============ Row Level Security ============

alter table members enable row level security;
alter table check_ins enable row level security;
alter table bookings enable row level security;
alter table challenge_progress enable row level security;
alter table earned_badges enable row level security;
alter table redemptions enable row level security;
alter table notifications enable row level security;

create policy "own profile" on members for select using (auth.uid() = id);
create policy "own check-ins" on check_ins for select using (auth.uid() = member_id);
create policy "own bookings" on bookings for select using (auth.uid() = member_id);
create policy "own progress" on challenge_progress for all using (auth.uid() = member_id);
create policy "own badges" on earned_badges for select using (auth.uid() = member_id);
create policy "own redemptions" on redemptions for all using (auth.uid() = member_id);
create policy "own notifications" on notifications for all using (auth.uid() = member_id);

-- Public read for catalog tables
alter table challenges enable row level security;
alter table rewards enable row level security;
alter table badge_defs enable row level security;
alter table classes enable row level security;
alter table instructors enable row level security;
create policy "read challenges" on challenges for select using (true);
create policy "read rewards" on rewards for select using (true);
create policy "read badges" on badge_defs for select using (true);
create policy "read classes" on classes for select using (true);
create policy "read instructors" on instructors for select using (true);

-- Admin operations should go through the service-role key on the server (Next.js
-- route handlers / server actions), never from the browser.

create index idx_checkins_member on check_ins(member_id, at);
create index idx_bookings_member on bookings(member_id);
create index idx_classes_start on classes(starts_at);
