-- ─────────────────────────────────────────────────────────────────────────────
-- Finance App — missing persistence migrations
-- Run this entire script once in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add missing columns to categories
--    (plan: stores goal/spending plan as JSON; debt_payoff_date for CC payoff tracking;
--     archived flag for deleted bill categories)
alter table categories
  add column if not exists plan jsonb,
  add column if not exists debt_payoff_date date,
  add column if not exists archived boolean not null default false;

-- 2. Bill groups table
create table if not exists bill_groups (
  id          text        primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null default 'Bills',
  sort_order  int         not null default 0,
  collapsed   boolean     not null default false,
  created_at  timestamptz not null default now()
);

alter table bill_groups enable row level security;

drop policy if exists "Users manage own bill groups" on bill_groups;
create policy "Users manage own bill groups"
  on bill_groups for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Bills table
create table if not exists bills (
  id                    text        primary key,
  user_id               uuid        not null references auth.users(id) on delete cascade,
  group_id              text        not null references bill_groups(id) on delete cascade,
  name                  text        not null default '',
  emoji                 text        not null default '📋',
  account_id            text,
  frequency             text        not null default 'monthly',
  amount                numeric     not null default 0,
  due_date              date,
  linked_transaction_id text,
  sort_order            int         not null default 0,
  created_at            timestamptz not null default now()
);

alter table bills enable row level security;

drop policy if exists "Users manage own bills" on bills;
create policy "Users manage own bills"
  on bills for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
