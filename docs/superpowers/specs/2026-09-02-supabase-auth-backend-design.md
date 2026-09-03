# StockPilot — Real Backend: Auth + Supabase + Real Data (Design Spec)

**Date:** 2026-09-02
**Status:** Approved for planning
**Author:** brainstorming session

## 1. Overview

Turn the StockPilot hackathon demo into a real, working, database-backed app:

1. **Auth** — email/password sign-up & login via Supabase Auth.
2. **Database** — Supabase (hosted cloud project named `StockPilot`) holding both the real stock data (imported from the 10 scraped CSVs) and all per-user data (portfolio, transactions, watchlist, alerts).
3. **Wire the app to real data** — replace the faked quote source and the `localStorage` portfolio with Supabase-backed real data, keeping the app visually "alive" via the existing cosmetic price drift.

This phase is the **backbone only**. Making the WebMCP analysis tools compute from real data is explicitly deferred to a fast-follow.

### Goals

- Users can sign up / log in with email + password.
- Stock prices, charts, and history reflect the real imported CSV data.
- Portfolio, watchlist, and alerts persist per-user in Supabase and survive across sessions/devices.
- Public pages remain browsable without login; only personal features require auth.
- The app is self-contained: no external market API required at runtime.

### Non-goals (this phase)

- Real-time / live price feed (Finnhub WebSocket or polling). Prices are the latest CSV close + cosmetic drift.
- Making analysis tools real (`detect_chart_pattern`, `backtest_strategy`, `get_support_resistance`, `get_earnings_calendar` stay seeded).
- OAuth / social login.
- Any change to SEC-filings or WebMCP code (see Constraints).

## 2. Hard constraints

**Do NOT modify these files/folders** (explicit user rule):

- `lib/webmcp.ts`
- `components/webmcp-panel.tsx`
- `app/sec-filings/`
- `app/api/sec/`
- `components/stocks/sec-filings-panel.tsx`

Design consequences:

- The WebMCP tools call `usePortfolioStore.getState().buyStock(...)` (and `sellStock`, `toggleFavorite`, `setAlert`) **synchronously** and use the return value immediately. Therefore the store's method signatures **must stay synchronous and return the same `{ success, message }` shape**. Persistence to Supabase happens as a **background (fire-and-forget) write-through** after the synchronous optimistic local update.
- The WebMCP tools call `getStockQuote` / `getMultipleQuotes` from `lib/finnhub/client.ts`. We swap the _internals_ of those functions to read from Supabase. The file `lib/finnhub/client.ts` is NOT off-limits, so this is allowed and requires no change to `webmcp.ts`.
- The pre-existing SSRF issue in `app/api/sec/report/route.ts` is out of scope (folder is off-limits).

## 3. Architecture & data flow

```
                    ┌─────────────────────────────┐
                    │  Supabase (cloud: StockPilot)│
                    │  - Auth (email/password)     │
                    │  - stocks, stock_prices      │  (public read)
                    │  - profiles, holdings,       │  (per-user, RLS)
                    │    transactions, watchlist,  │
                    │    price_alerts              │
                    └──────────────┬──────────────┘
                                   │ supabase-js (@supabase/ssr)
             ┌─────────────────────┼──────────────────────┐
             │                     │                       │
     lib/finnhub/client.ts   lib/portfolio-store.ts   lib/supabase/queries.ts
     (quote source →         (Zustand, optimistic     (typed data access:
      latest close from       sync + background         prices, holdings,
      stock_prices)           write-through)            watchlist, alerts)
             │                     │                       │
             ▼                     ▼                       ▼
     useLiveMarketQuotes /    app/page.tsx, pages,   login/signup pages,
     useMarketTicker          WebMCP tools (unchanged) middleware, top-bar
```

- **Quotes:** "current price" = most recent `close` for a symbol; "previous close" = the prior trading day's `close`; `change`/`percentChange` computed from those. The existing `applyMicroDrift` cosmetic ticker in `lib/use-live-quotes.ts` stays on top, so the UI still animates.
- **Charts:** the main candlestick chart is a **TradingView embedded widget** (`components/stocks/stock-chart.tsx`) that fetches its own real data — left unchanged. The compare page currently reads CSV history via `/api/ohlcv`; it **will be repointed to read from Supabase `stock_prices`**, making the database the single source of truth for all price data. The `ohclv/` folder becomes purely the seed source for the import script.
- **Personal data:** loaded from Supabase into the Zustand store on login; mutations update the store synchronously and write through to Supabase in the background.

## 4. Database schema (Postgres / Supabase)

All tables created via a SQL migration in `supabase/migrations/`. Row-Level Security enabled on every table.

### Public-read reference data (readable by `anon` + `authenticated`)

```sql
create table stocks (
  symbol      text primary key,
  name        text not null,
  sector      text,
  exchange    text default 'NASDAQ',
  currency    text default 'USD'
);

create table stock_prices (
  symbol   text not null references stocks(symbol) on delete cascade,
  date     date not null,
  open     numeric not null,
  high     numeric not null,
  low      numeric not null,
  close    numeric not null,
  volume   bigint not null,
  primary key (symbol, date)
);
create index stock_prices_symbol_date_idx on stock_prices (symbol, date desc);

-- RLS: public read only, no writes from clients
alter table stocks enable row level security;
alter table stock_prices enable row level security;
create policy "public read stocks" on stocks for select using (true);
create policy "public read stock_prices" on stock_prices for select using (true);
```

### Per-user data (RLS scoped to `auth.uid()`)

```sql
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  virtual_balance numeric not null default 100000,
  created_at      timestamptz not null default now()
);

create table holdings (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  symbol             text not null,
  company_name       text,
  quantity           numeric not null,
  average_buy_price  numeric not null,
  unique (user_id, symbol)
);

create table transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  type        text not null check (type in ('buy','sell')),
  quantity    numeric not null,
  price       numeric not null,
  created_at  timestamptz not null default now()
);

create table watchlist (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users(id) on delete cascade,
  symbol   text not null,
  unique (user_id, symbol)
);

create table price_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  symbol        text not null,
  target_price  numeric not null,
  condition     text not null check (condition in ('above','below')),
  triggered     boolean not null default false,
  created_at    timestamptz not null default now()
);
```

RLS policies for each per-user table follow the same pattern:

```sql
alter table <t> enable row level security;
create policy "own rows" on <t>
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- (profiles uses id instead of user_id)
```

### Auto-create profile on signup (trigger)

```sql
create function public.handle_new_user() returns trigger
  language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, virtual_balance)
  values (new.id, new.email, 100000);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

## 5. Auth flow

- **Pages:** `app/login/page.tsx` and `app/signup/page.tsx` — email/password forms, inline validation, `sonner` toasts on error, redirect to `/` (or the originally-requested page) on success.
- **Session:** `@supabase/ssr` with cookie-based sessions. `middleware.ts` refreshes the session on each request and enforces gating.
- **Gating:** middleware protects `/portfolio`, `/watchlist`, `/orders`. All other routes stay public. If a logged-out user triggers a trade (buy/sell modal), they get a toast prompting sign-in and are routed to `/login`.
- **Top bar:** `components/layout/site-top-bar.tsx` gains a user area — shows the logged-in email + a "Sign out" button; shows "Sign in" when logged out.
- **Email confirmation:** disabled in Supabase Auth settings for the demo (so judges can sign up and use immediately). Documented in setup steps.

## 6. Portfolio store refactor

`lib/portfolio-store.ts`:

- Remove `persist(localStorage)`.
- Add a `hydrateFromSupabase(userId)` action called after login (loads `profiles.virtual_balance`, `holdings`, `transactions`, `watchlist`, `price_alerts` into the store) and a `clear()` action called on logout.
- `buyStock` / `sellStock` / `toggleFavorite` / `setAlert` / `removeAlert` / `resetPortfolio` keep their **synchronous** signatures and return shapes. Each:
  1. computes the new state and updates the Zustand store immediately (optimistic), then
  2. fires an async Supabase write-through (insert/update/delete) without blocking; on failure it logs and shows a toast (best-effort; state can be re-hydrated on reload).
- **Extract pure logic:** buy/sell math (balance checks, average-price recompute, quantity validation) moves into `lib/portfolio-logic.ts` as pure functions, unit-tested, and reused by the store. No behavior change to the existing rules.

## 7. Quote source swap

`lib/finnhub/client.ts`:

- Reimplement `getStockQuote(symbol)` and `getMultipleQuotes(symbols)` to read from Supabase `stock_prices` (latest two rows per symbol) + `stocks` (for `companyName`, currency), instead of calling `/api/finnhub`.
- Compute `price` (latest close), `previousClose` (prior close), `change`, `percentChange`, `open/high/low` (from the latest row), `volume` (latest row).
- Unknown symbols (not in the 10-symbol dataset) return `null` / are filtered out — callers already handle empty results gracefully.
- Keep the exported types (`MarketQuote`, etc.) identical so downstream code and the WebMCP tools are unaffected.
- The `/api/finnhub` route and the `FINNHUB_API_KEY` env var become unused but are left in place (harmless; enables a future live-feed fast-follow).

## 8. Symbol-set reconciliation

Our dataset has exactly 10 symbols: **AAPL, AMD, AMZN, CSCO, META, MSFT, NFLX, QCOM, SBUX, TSLA**.

- `lib/use-market-ticker.ts` `DEFAULT_SYMBOLS` currently lists `ADBE, BTCUSD, EURUSD` etc. → update to the 10 real symbols.
- `app/page.tsx` ticker switcher lists `NVDA, BTCUSD` (not in dataset) → update to symbols we have.
- `lib/webmcp.ts` `STOCK_UNIVERSE` references symbols we don't have (GOOGL, NVDA, JPM, V, JNJ, WMT, XOM, BRK.B, UNH, LLY). **This file is off-limits**, so those specific tool calls will return empty/zero quotes. Accepted as a known limitation this phase; revisit in the analysis fast-follow. `getMultipleQuotes` must degrade gracefully (skip unknown symbols) rather than error.
- `stocks` table seeded with sector metadata for the 10 symbols so sector-based tools that _do_ use our symbols still work.

## 9. CSV import

- One-time Node script `scripts/import-csv-to-supabase.mjs` using the Supabase **service-role** key (server-side only).
- Reads each file in `ohclv/`, parses the columns `Date (MM/DD/YYYY), Close/Last ($), Volume, Open ($), High ($), Low ($)`, strips `$`/commas, converts date to ISO, and upserts into `stocks` (one row per symbol with name+sector) and `stock_prices` (batched inserts, ~2,510 rows/symbol, ~25k total).
- Idempotent (upsert on conflict) so it can be re-run safely.

## 10. Environment & setup (documented for the user)

New `.env` values:

```
NEXT_PUBLIC_SUPABASE_URL=...        # from Supabase project settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   # public anon key
SUPABASE_SERVICE_ROLE_KEY=...       # secret; used ONLY by the import script
```

Setup order the user runs (with commands provided during implementation):

1. Create/confirm the `StockPilot` cloud project (done).
2. Disable email confirmation in Auth settings (demo).
3. Apply the SQL migration (via Supabase SQL editor or CLI).
4. Run the import script to load the CSVs.
5. `npm run dev`.

New dependencies: `@supabase/supabase-js`, `@supabase/ssr`.

## 11. Testing strategy

- **Unit (TDD):** `lib/portfolio-logic.ts` (buy/sell math, validation, average-price) and the quote-computation helper (latest/prev close → change/percent). These are pure and high-value.
- **Manual smoke test** against the real Supabase project: sign up → land with $100k empty → buy a stock → reload (persists) → add to watchlist → set alert → sign out → sign in (state restored) → log-out browse of public pages still works.
- No E2E harness this phase (hackathon timeline); manual checklist documented.

## 12. Rollout order (implementation phases)

1. **Schema + import** — migration + `import-csv-to-supabase.mjs`; verify data queryable in Supabase.
2. **Quote source swap** — repoint `lib/finnhub/client.ts` to Supabase; verify quotes/charts show real numbers while logged out; reconcile symbol sets.
3. **Auth** — `@supabase/ssr` client/server helpers, `login`/`signup` pages, `middleware.ts` gating, top-bar user menu.
4. **Supabase-backed personal data** — refactor `portfolio-store.ts` (hydrate on login, optimistic + background write-through), extract `portfolio-logic.ts`, wire watchlist + alerts.
5. **Polish** — logged-out trade prompts, empty states, README update.

## 13. Risks & open questions

- **WebMCP symbols without data** return empty quotes (accepted, file off-limits).
- **Background write-through failures** could drift local vs. server state; mitigated by re-hydration on reload and error toasts. Acceptable for demo.
- **Service-role key** must never reach the client — used only in the Node import script; documented clearly.

```

```
