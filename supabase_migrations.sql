-- ─────────────────────────────────────────────────────────────────────────────
-- Finance App — missing persistence migrations
-- Run this entire script once in the Supabase SQL editor
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE / DROP IF EXISTS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Every table must have RLS enabled so users can only access their own rows.
-- Without this any authenticated user can read/write any other user's data.

alter table accounts       enable row level security;
alter table transactions   enable row level security;
alter table category_groups enable row level security;
alter table categories     enable row level security;
alter table budget_months  enable row level security;
alter table profiles       enable row level security;

drop policy if exists "Users manage own accounts"         on accounts;
drop policy if exists "Users manage own transactions"     on transactions;
drop policy if exists "Users manage own category groups"  on category_groups;
drop policy if exists "Users manage own categories"       on categories;
drop policy if exists "Users manage own budget months"    on budget_months;
drop policy if exists "Users manage own profile"          on profiles;

create policy "Users manage own accounts"
  on accounts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own transactions"
  on transactions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own category groups"
  on category_groups for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own categories"
  on categories for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own budget months"
  on budget_months for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own profile"
  on profiles for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Column additions ──────────────────────────────────────────────────────────

-- 1. Add missing columns to categories
--    (plan: stores goal/spending plan as JSON; debt_payoff_date for CC payoff tracking;
--     archived flag for deleted bill categories)
alter table categories
  add column if not exists plan jsonb,
  add column if not exists debt_payoff_date date,
  add column if not exists archived boolean not null default false;

-- 2. Add missing columns to transactions
--    (category_text: fallback for categories not in the budget table;
--     reconciled: lock flag; repeat: recurring interval; is_starting_balance: UI hint)
alter table transactions
  add column if not exists category_text text,
  add column if not exists reconciled boolean not null default false,
  add column if not exists repeat text,
  add column if not exists is_starting_balance boolean not null default false;

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
