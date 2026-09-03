# StockPilot

**A virtual stock-trading dashboard that turns itself into a set of tools an AI agent can drive — built for the WebMCP hackathon.**

StockPilot is a [Next.js](https://nextjs.org) app that looks like a professional trading terminal (charts, portfolio, watchlist, news, IPOs, SEC filings), but its real purpose is to expose **42 in-page [WebMCP](https://github.com/webmachinelearning/webmcp) tools**. When you run it in a browser that supports the experimental WebMCP API (e.g. ChatGPT's in-app browser), an AI agent on the page can call these tools to search stocks, run real technical analysis, place virtual trades, manage a portfolio, analyze SEC filings, and drive the UI live — all client-side.

All trading is **simulated** with a virtual $100,000 balance — no real money or brokerage. But the data is real: prices come from an imported ~10-year daily OHLCV dataset stored in **Supabase**, and the analysis tools (risk score, correlation, support/resistance, backtests, pattern detection) are **computed from that real history** — not seeded. Company news, SEC filings, and earnings come from **Finnhub**.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Running it on any laptop](#running-it-on-any-laptop)
- [Deploying to Vercel with GitHub Actions](#deploying-to-vercel-with-github-actions)
- [Enabling WebMCP in the browser](#enabling-webmcp-in-the-browser)
- [WebMCP tool reference](#webmcp-tool-reference)
- [Project structure](#project-structure)
- [How data flows](#how-data-flows)
- [Caveats](#caveats)

---

## Features

- **Auth + persistence** — email/password sign-in via Supabase; portfolio, watchlist, and alerts persist per-user.
- **Virtual trading** — buy/sell with a $100k paper balance.
- **Markets, News, IPOs, SEC filings, Compare, Learn** pages, plus per-stock detail pages.
- **Interactive charts** — one shared engine (candles / bars / line / area, indicators, drawings) across the whole app; multi-symbol compare with a color legend.
- **Admin diagnostics page** (`/admin`) showing Finnhub API call stats.
- **WebMCP tool registry** — the headline feature: 42 tools across 8 categories, auto-registered on page load.

## Tech stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4**
- **Supabase** (Postgres) — auth, per-user data, and the imported price dataset
- **Zustand** (client state) + **TanStack Query** (data fetching)
- **lightweight-charts** (charts) · **Recharts** (allocation) · **Framer Motion** · **driver.js** (tour) · **sonner** (toasts)
- **Finnhub** REST API (news, SEC filings, earnings, company profiles), proxied through Next.js route handlers

---

## Running it on any laptop

Works on macOS, Windows, and Linux. The steps are identical everywhere — only the terminal differs.

### 1. Prerequisites

- **[Node.js](https://nodejs.org) 20 or newer** (Next.js 16 / React 19 require it). Check with:
  ```bash
  node -v
  ```
- **npm** (bundled with Node). `yarn`, `pnpm`, or `bun` also work.
- **Git** (to clone the repo).

### 2. Get the code

```bash
git clone <your-repo-url> stockpilot
cd stockpilot
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create file named `.env` in the project root:

```env
# Supabase — required for auth, portfolio, and stock data.
# From your project: Supabase dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>   # secret — import script only

# Optional — powers the company-news feed (compare/news pages).
# Free key: https://finnhub.io/register
FINNHUB_API_KEY=your_finnhub_key_here
```

> The `NEXT_PUBLIC_SUPABASE_URL` must be the **base** project URL (`https://<ref>.supabase.co`) — **not** the REST endpoint that ends in `/rest/v1/`. `.env` is git-ignored — never commit real keys.
>
> You can sanity-check your keys with: `node --env-file=.env scripts/verify-supabase.mjs`

### 5. Set up the database (Supabase)

1. **Apply the schema.** In the Supabase dashboard → **SQL Editor** → New query → paste the contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**. This creates the stock + per-user tables, row-level security, the `latest_prices` view, and the "new user gets $100k" trigger.
2. **Disable email confirmation** (for demo convenience): **Authentication → Sign In / Providers → Email** → turn **off** "Confirm email", so new signups are logged in immediately.
3. **Import the stock data** from the local CSVs into the database (one-time):
   ```bash
   node --env-file=.env scripts/import-csv-to-supabase.mjs
   ```
   This loads ~25k daily OHLCV rows across the 10 symbols (AAPL, AMD, AMZN, CSCO, META, MSFT, NFLX, QCOM, SBUX, TSLA).

### 6. Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000**. Browse freely; click **Sign in** (top-right) to create an account and unlock the portfolio, watchlist, and alerts.

### 7. (Optional) Production build

```bash
npm run build
npm start
```

### Available scripts

| Command         | What it does                             |
| --------------- | ---------------------------------------- |
| `npm run dev`   | Start the dev server at `localhost:3000` |
| `npm run build` | Production build                         |
| `npm start`     | Serve the production build               |
| `npm run lint`  | Run ESLint                               |
| `npm test`      | Run unit tests (Vitest)                  |

## Deploying to Vercel with GitHub Actions

The workflow in [`.github/workflows/vercel.yml`](.github/workflows/vercel.yml) deploys automatically:

- pushes to `main` or `master` create production deployments;
- pull requests targeting `main` or `master` create preview deployments.

### 1. Create the Vercel project

Import this GitHub repository in [Vercel](https://vercel.com/new), keep the framework preset as **Next.js**, and do not commit the generated `.vercel` directory.

### 2. Add GitHub Actions secrets

In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:

| Secret              | Value                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`      | A token created in Vercel → Account Settings → Tokens                                 |
| `VERCEL_ORG_ID`     | The `orgId` from the Vercel project `.vercel/project.json` or Vercel project settings |
| `VERCEL_PROJECT_ID` | The `projectId` from the same file or Vercel project settings                         |

To obtain both IDs locally after linking the project, run `npx vercel link`, then inspect `.vercel/project.json`. The workflow creates its own temporary Vercel metadata during CI; `.vercel` remains ignored by Git.

### 3. Add Vercel environment variables

In **Vercel → Project → Settings → Environment Variables**, add the same application variables used locally: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `FINNHUB_API_KEY` if news data is enabled. Keep `SUPABASE_SERVICE_ROLE_KEY` out of the browser and only add it to Vercel if a server-side deployment path explicitly needs it.

After the secrets are present, merge or push to `main`/`master` to run the production deployment. GitHub Actions will show the Vercel CLI output and deployment URL in the workflow log.

---

## Enabling WebMCP in the browser

The trading UI works in any modern browser. To let an **AI agent call the tools**, you need a browser that exposes the experimental WebMCP API (`document.modelContext`):

1. Use **Chrome Canary** (or a Chromium build with the flag).
2. Open `chrome://flags/#enable-webmcp-testing` and set it to **Enabled**, then restart.
3. Load **http://localhost:3000**. The **AI Tools · WebMCP** panel shows a green **"WebMCP Active"** badge and a toast confirming the tools were registered.

If the badge reads **"WebMCP Inactive"**, the API isn't present — the flag isn't enabled or the browser doesn't support it. The rest of the app still works normally; only agent tool-calling is unavailable.

Registration happens automatically on page load (`components/providers.tsx`), and you can re-trigger it with the **Register Tools** button in the WebMCP panel.

---

## How WebMCP is implemented

Every capability the app exposes to an agent is registered on page load through the
browser's experimental WebMCP surface, `document.modelContext.registerTool(...)`.
The registration lives in [`lib/webmcp.ts`](lib/webmcp.ts) (driven from
[`components/providers.tsx`](components/providers.tsx)) and follows the standard shape:

```js
document.modelContext.registerTool({
  name: "analyze_sec_filings",
  description:
    "Fetch a company's most material SEC filing, open it in the report viewer, highlight the key passages, and return a risk score plus a fundamental snapshot.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Ticker symbol like AAPL" },
      highlight: {
        type: "array",
        items: { type: "string" },
        description: "Phrases to highlight in the report",
      },
    },
    required: ["symbol"],
  },
  execute: async (input) => {
    // …fetch data, compute analysis, drive the UI via a CustomEvent…
    return { content: [{ type: "text", text: "<JSON result>" }] };
  },
});
```

Registration is **idempotent** (guarded by a `Set` of registered names) so repeated
React mounts don't trigger duplicate-tool errors. Tools that change UI (SEC highlight,
compare sync) do so by dispatching browser `CustomEvent`s that the React pages listen for,
so a human and an agent share one live view.

## WebMCP tool reference

Tools are defined in [`lib/webmcp.ts`](lib/webmcp.ts) and registered via `document.modelContext.registerTool(...)`. Each returns a `{ content: [{ type: "text", text: "<JSON>" }] }` payload. **42 tools across 8 categories**, all computed from real Supabase / Finnhub data.

### 📈 Market Data

| Tool                      | Description                                                        | Key params                                                                              |
| ------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `search_stock`            | Search the curated stock universe by symbol or company name.       | `query`                                                                                 |
| `get_stock_details`       | Full quote + company profile + metadata for a ticker.              | `symbol`                                                                                |
| `get_stock_news`          | Latest news articles for a stock.                                  | `symbol`, `days?`                                                                       |
| `get_market_news_summary` | Digest of general market news.                                     | `category?` (`general\|forex\|crypto\|merger`)                                          |
| `rank_stocks`             | Rank the universe by a metric.                                     | `metric` (`performance\|volume\|price`), `limit?`                                       |
| `screen_stocks`           | Filter stocks by price/%-change/sector.                            | `minPrice?`, `maxPrice?`, `minPercentChange?`, `maxPercentChange?`, `sector?`, `limit?` |
| `get_sector_performance`  | Average performance by sector.                                     | —                                                                                       |
| `get_market_sentiment`    | Fear/Greed-style sentiment score (0–100) from price momentum.      | —                                                                                       |
| `get_top_performers`      | Top N gainers or losers.                                           | `limit?`, `direction?` (`gainers\|losers`)                                              |
| `compare_stocks`          | Compare 2–5 stocks side by side.                                   | `symbols[]`                                                                             |
| `get_correlation`         | Estimated price correlation between two stocks (from beta/sector). | `symbol1`, `symbol2`                                                                    |

### 🧩 Chart Patterns

| Tool                     | Description                                                                                                        | Key params            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `detect_chart_pattern`   | Detect a technical pattern (head & shoulders, ABCD, XABCD, cypher, triangles, double top/bottom, three drives, …). | `symbol`, `pattern`   |
| `detect_elliott_wave`    | Detect an Elliott Wave structure (impulse 1-2-3-4-5, ABC, triangle, WXY, WXYXZ).                                   | `symbol`, `wave_type` |
| `get_support_resistance` | Compute S1–S3 / R1–R3 levels and pivot.                                                                            | `symbol`              |
| `get_trend_direction`    | Uptrend / Downtrend / Sideways with strength + advice.                                                             | `symbol`              |

### 💼 Portfolio

| Tool                      | Description                                                            | Key params                                                                               |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `get_portfolio`           | Full virtual portfolio: balance, holdings, transactions.               | —                                                                                        |
| `analyze_portfolio`       | Total value, P&L, return %, per-holding breakdown.                     | —                                                                                        |
| `get_portfolio_risk`      | Concentration, diversification score, estimated beta, sector exposure. | —                                                                                        |
| `buy_stock`               | Simulate buying shares with virtual funds.                             | `symbol`, `quantity`                                                                     |
| `sell_stock`              | Simulate selling shares.                                               | `symbol`, `quantity`                                                                     |
| `auto_invest`             | Spread a budget across stocks by strategy.                             | `budget`, `strategy` (`momentum\|diversified\|conservative\|aggressive`), `stock_count?` |
| `optimize_portfolio`      | Suggest an allocation for a budget + risk level.                       | `budget`, `risk_level?`                                                                  |
| `rebalance_portfolio`     | Suggest actions to equal-weight holdings.                              | —                                                                                        |
| `calculate_position_size` | Position size from account risk % and stop-loss.                       | `symbol`, `risk_percent`, `stop_loss_price`                                              |
| `calculate_profit_loss`   | P&L for a position given entry price + quantity.                       | `symbol`, `entry_price`, `quantity`                                                      |
| `suggest_diversification` | Suggest stocks in sectors you don't hold.                              | —                                                                                        |
| `reset_portfolio`         | Reset to the starting $100,000 balance.                                | —                                                                                        |

### 🔔 Watchlist & Alerts

| Tool                    | Description                                      | Key params                                             |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| `get_watchlist`         | Return favorited stocks with live quotes.        | —                                                      |
| `add_to_watchlist`      | Add a symbol to the watchlist.                   | `symbol`                                               |
| `remove_from_watchlist` | Remove a symbol from the watchlist.              | `symbol`                                               |
| `set_price_alert`       | Set a virtual price alert.                       | `symbol`, `target_price`, `condition` (`above\|below`) |
| `get_price_alerts`      | List active alerts, checked against live prices. | —                                                      |

### 🤖 AI Strategy

| Tool                | Description                                                                  | Key params                               |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| `backtest_strategy` | Simulate a strategy on a stock (SMA crossover, RSI mean-revert, buy & hold). | `symbol`, `strategy`, `initial_capital?` |

### 🧭 Navigation

| Tool           | Description                                   | Key params   |
| -------------- | --------------------------------------------- | ------------ |
| `navigate_to`  | Navigate to any StockPilot page.              | `path`       |
| `open_stock`   | Open a stock's detail page.                   | `symbol`     |
| `open_compare` | Open the compare page, optionally pre-filled. | `symbols?[]` |

### 🎓 Education

| Tool                      | Description                                                                                                                             | Key params             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `start_beginner_tutorial` | Guided tutorial on a topic (intro, candlesticks, portfolio, risk, technicals, fundamentals, Elliott waves, patterns).                   | `topic`                |
| `get_earnings_calendar`   | Upcoming earnings dates for the universe — real, from Finnhub.                                                                          | —                      |
| `analyze_sec_filings`     | Open a company's most material SEC filing inline, highlight agent-chosen passages, and return a real risk score + fundamental snapshot. | `symbol`, `highlight?` |

---

## Project structure

```
app/
  api/
    finnhub/route.ts        # Server-side Finnhub proxy (hides API key)
    market/catalog/route.ts # Symbol search catalog
    sec/report/route.ts     # Fetches an SEC report (SEC-domain allowlisted)
  admin/                    # API diagnostics dashboard
  login/ signup/ alerts/    # Auth pages + price-alerts screen
  compare/ ipos/ learn/ markets/ news/ orders/
  portfolio/ sec-filings/ watchlist/ stock/[symbol]/
  page.tsx                  # Home dashboard
  layout.tsx                # App shell (sidebar + top bar)
proxy.ts                    # Session refresh + route gating (Next 16 "middleware")
components/
  webmcp-panel.tsx          # WebMCP status + tool registry UI
  providers.tsx             # Registers WebMCP tools + syncs auth → store
  comparison/               # Shared chart engine + compare dashboard
  layout/ portfolio/ stocks/ ui/
lib/
  webmcp.ts                 # ★ All 42 WebMCP tool definitions
  supabase/                 # browser client, typed queries, per-user persistence
  finnhub/client.ts         # Wrappers (quotes from Supabase; news/filings/earnings from Finnhub)
  ohlcv.ts                  # OHLCV history from Supabase (paginated)
  sec-analysis.ts, ta.ts    # Pure analysis math (risk, pivots, correlation, backtest) + tests
  indicators.ts             # SMA / EMA / RSI
  portfolio-store.ts        # Zustand store, hydrated from / written through to Supabase
supabase/migrations/        # SQL schema + RLS + signup trigger
scripts/import-csv-to-supabase.mjs  # One-time CSV → Supabase import
```

## How data flows

1. UI and WebMCP tools call helpers in `lib/supabase/queries.ts` and `lib/finnhub/client.ts`.
2. **Prices, charts, and analysis** read the imported OHLCV from Supabase (`stock_prices`); the latest close is the current price (no synthetic ticks).
3. **News, SEC filings, earnings, and profiles** proxy through `app/api/finnhub/route.ts`, which attaches the server-side `FINNHUB_API_KEY` so it never reaches the browser.
4. **Portfolio, watchlist, and alerts** live in the Zustand store, hydrated from and written through to Supabase per user (Row-Level Security).
5. WebMCP tools call these same helpers/store, so an agent and the UI share one live source of truth.

## Caveats

- **End-of-day data, no live feed:** prices are the latest close from the imported ~10-year dataset — there's no intraday streaming, so quotes don't tick in real time.
- **Pattern/Elliott detection is heuristic:** `detect_chart_pattern` and `detect_elliott_wave` read _real_ swing structure, but labelling patterns/waves is inherently subjective — treat them as signals, not certainties.
- **Not financial advice.** Paper-trading demo only.

---

Built for the WebMCP hackathon. Contributions and feedback welcome.
