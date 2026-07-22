-- ReformerX Member App — production schema (matches the app store 1:1)
-- Run once in the Supabase SQL editor.
-- Access model: the Next.js server talks to this database with the service-role
-- key only. RLS is enabled with no public policies, so nothing is readable from
-- browsers — every table is deny-all except for the server.

-- ============ Core ============

create table members (
  id text primary key,                      -- "m-sb-303", "m-you", ...
  name text not null,
  email text not null,
  qr_code text not null unique,             -- doubles as referral code
  membership_type text not null default 'Member',
  membership_expires timestamptz not null default 'epoch',
  joined_at timestamptz not null default now(),
  simplybook_id text unique,
  referred_by text references members(id),
  avatar_color text
);

create table instructors (
  id text primary key,                      -- "i-sb-6"
  name text not null,
  role text
);

create table classes (
  id text primary key,                      -- "c-sb-<service>-<iso>"
  title text not null,
  instructor_id text references instructors(id),
  starts_at timestamptz not null,
  duration_min int not null default 50
);

create table bookings (
  id text primary key,                      -- "b-sb-<id>"
  member_id text not null references members(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  source text not null default 'simplybook',
  canceled boolean not null default false,
  unique (member_id, class_id)
);

create table check_ins (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  at timestamptz not null default now(),
  unique (member_id, class_id)              -- once per class, enforced by the DB
);

-- ============ Gamification ============

create table challenges (
  id text primary key,
  name text not null,
  emoji text default '🏆',
  description text,
  type text not null check (type in ('class_count','streak_days','instructor_variety','lifetime_count','referrals','monthly_count')),
  goal int not null,
  start_date timestamptz,
  end_date timestamptz,
  reward text not null default '',
  reward_emoji text default '🎁',
  spring_color text default 'red',
  leaderboard boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table challenge_progress (
  member_id text not null references members(id) on delete cascade,
  challenge_id text not null references challenges(id) on delete cascade,
  progress int not null default 0,
  joined_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (member_id, challenge_id)
);

create table earned_badges (
  member_id text not null references members(id) on delete cascade,
  badge_id text not null,                   -- badge ids live in app code
  earned_at timestamptz not null default now(),
  primary key (member_id, badge_id)
);

create table earned_rewards (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  challenge_id text not null,
  challenge_name text not null,             -- snapshot
  reward text not null,                     -- snapshot
  reward_emoji text not null default '🎁',
  earned_at timestamptz not null default now(),
  status text not null default 'earned' check (status in ('earned','ready','collected','declined')),
  decided_at timestamptz,
  unique (member_id, challenge_id)
);

create table notifications (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  text text not null,
  at timestamptz not null default now(),
  read boolean not null default false
);

create table push_subscriptions (
  id text primary key,
  member_id text not null references members(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create table announcements (
  id text primary key,
  text text not null,
  at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value jsonb not null
);
insert into settings values
  ('studio_code', '"RX-STUDIO-CHECKIN"'),
  ('leaderboards_enabled', 'true');

-- ============ Lock everything down (server-only access) ============

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
-- No policies are created on purpose: anon/authenticated roles can read nothing.
-- The Next.js server uses the service-role key, which bypasses RLS.

-- ============ Indexes ============

create index idx_checkins_member on check_ins(member_id, at);
create index idx_bookings_member on bookings(member_id);
create index idx_bookings_class on bookings(class_id);
create index idx_classes_start on classes(starts_at);
create index idx_notifications_member on notifications(member_id, at desc);
create index idx_rewards_status on earned_rewards(status);
create index idx_members_simplybook on members(simplybook_id);
