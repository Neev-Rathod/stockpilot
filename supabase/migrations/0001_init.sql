-- StockPilot initial schema: stock data + per-user portfolio, watchlist, alerts.
-- Apply via the Supabase SQL Editor (paste and run) or the Supabase CLI.

-- ─────────────────────────────────────────────────────────────────────────
-- Reference data (public read)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.stocks (
  symbol   text primary key,
  name     text not null,
  sector   text,
  exchange text default 'NASDAQ',
  currency text default 'USD'
);

create table if not exists public.stock_prices (
  symbol text   not null references public.stocks(symbol) on delete cascade,
  date   date   not null,
  open   numeric not null,
  high   numeric not null,
  low    numeric not null,
  close  numeric not null,
  volume bigint  not null,
  primary key (symbol, date)
);

create index if not exists stock_prices_symbol_date_idx
  on public.stock_prices (symbol, date desc);

-- Latest close + previous close per symbol, for computing quotes in one query.
create or replace view public.latest_prices
with (security_invoker = on) as
with ranked as (
  select
    p.symbol, p.date, p.open, p.high, p.low, p.close, p.volume,
    row_number() over (partition by p.symbol order by p.date desc) as rn
  from public.stock_prices p
)
select
  cur.symbol,
  s.name     as company_name,
  s.sector   as sector,
  s.currency as currency,
  cur.date, cur.open, cur.high, cur.low, cur.close, cur.volume,
  prev.close as previous_close
from ranked cur
join public.stocks s on s.symbol = cur.symbol
left join ranked prev on prev.symbol = cur.symbol and prev.rn = 2
where cur.rn = 1;

alter table public.stocks       enable row level security;
alter table public.stock_prices enable row level security;

drop policy if exists "public read stocks" on public.stocks;
create policy "public read stocks" on public.stocks for select using (true);

drop policy if exists "public read stock_prices" on public.stock_prices;
create policy "public read stock_prices" on public.stock_prices for select using (true);

grant select on public.stocks, public.stock_prices, public.latest_prices
  to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Per-user data (row-level security scoped to auth.uid())
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  virtual_balance numeric not null default 100000,
  created_at      timestamptz not null default now()
);

create table if not exists public.holdings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  symbol            text not null,
  company_name      text,
  quantity          numeric not null,
  average_buy_price numeric not null,
  unique (user_id, symbol)
);

create table if not exists public.transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  type       text not null check (type in ('buy','sell')),
  quantity   numeric not null,
  price      numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol  text not null,
  unique (user_id, symbol)
);

create table if not exists public.price_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  symbol       text not null,
  target_price numeric not null,
  condition    text not null check (condition in ('above','below')),
  triggered    boolean not null default false,
  created_at   timestamptz not null default now()
);

alter table public.profiles     enable row level security;
alter table public.holdings     enable row level security;
alter table public.transactions enable row level security;
alter table public.watchlist    enable row level security;
alter table public.price_alerts enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own holdings" on public.holdings;
create policy "own holdings" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own watchlist" on public.watchlist;
create policy "own watchlist" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own alerts" on public.price_alerts;
create policy "own alerts" on public.price_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete
  on public.profiles, public.holdings, public.transactions,
     public.watchlist, public.price_alerts
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Auto-create a $100k profile when a user signs up
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, virtual_balance)
  values (new.id, new.email, 100000)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
