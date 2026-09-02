# StockPilot

**A virtual stock-trading dashboard that turns itself into a set of tools an AI agent can drive — built for the WebMCP hackathon.**

StockPilot is a [Next.js](https://nextjs.org) app that looks like a professional trading terminal (live tickers, charts, portfolio, watchlist, news, IPOs, SEC filings), but its real purpose is to expose ~38 in-page **[WebMCP](https://github.com/webmachinelearning/webmcp) tools**. When you run it in a browser that supports the experimental WebMCP API, any AI model on the page can call these tools to search stocks, analyze charts, place virtual trades, manage a portfolio, and navigate the app — all client-side.

All trading is **simulated** with a virtual $100,000 balance. No real money, no brokerage account. Market quotes/news come from real APIs (Finnhub / Twelve Data); the technical-analysis tools return deterministic, seeded demo data (see [Caveats](#caveats)).

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Running it on any laptop](#running-it-on-any-laptop)
- [Enabling WebMCP in the browser](#enabling-webmcp-in-the-browser)
- [WebMCP tool reference](#webmcp-tool-reference)
- [Project structure](#project-structure)
- [How data flows](#how-data-flows)
- [Caveats](#caveats)

---

## Features

- **Dashboard** — portfolio overview, live watchlist, and favorites with a "1-second live price" ticker.
- **Virtual trading** — buy/sell with a $100k paper balance, persisted to `localStorage`.
- **Markets, News, IPOs, SEC filings, Compare, Learn** pages.
- **Per-stock detail pages** with TradingView-style charts.
- **Admin diagnostics page** (`/admin`) showing Finnhub API call stats.
- **WebMCP tool registry** — the headline feature: 38 tools across 7 categories, auto-registered on page load.

## Tech stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS v4**
- **Zustand** (portfolio state, persisted to `localStorage`)
- **TanStack Query** (data fetching / polling)
- **lightweight-charts** + TradingView widgets, **Recharts**, **Framer Motion**, **driver.js** (guided tour), **sonner** (toasts)
- Market data via **Finnhub** and **Twelve Data** REST APIs, proxied through Next.js route handlers

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

Create a file named `.env` in the project root:

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

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server at `localhost:3000` |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (Vitest) |

---

## Enabling WebMCP in the browser

The trading UI works in any modern browser. To let an **AI agent call the tools**, you need a browser that exposes the experimental WebMCP API (`document.modelContext`):

1. Use **Chrome Canary** (or a Chromium build with the flag).
2. Open `chrome://flags/#enable-webmcp-testing` and set it to **Enabled**, then restart.
3. Load **http://localhost:3000**. The **AI Tools · WebMCP** panel shows a green **"WebMCP Active"** badge and a toast confirming the tools were registered.

If the badge reads **"WebMCP Inactive"**, the API isn't present — the flag isn't enabled or the browser doesn't support it. The rest of the app still works normally; only agent tool-calling is unavailable.

Registration happens automatically on page load (`components/providers.tsx`), and you can re-trigger it with the **Register Tools** button in the WebMCP panel.

---

## WebMCP tool reference

Tools are defined in [`lib/webmcp.ts`](lib/webmcp.ts) and registered via `document.modelContext.registerTool(...)`. Each returns a `{ content: [{ type: "text", text: "<JSON>" }] }` payload. **38 tools across 7 categories.**

### 📈 Market Data

| Tool | Description | Key params |
|---|---|---|
| `search_stock` | Search the curated stock universe by symbol or company name. | `query` |
| `get_stock_details` | Full quote + company profile + metadata for a ticker. | `symbol` |
| `get_stock_news` | Latest news articles for a stock. | `symbol`, `days?` |
| `get_market_news_summary` | Digest of general market news. | `category?` (`general\|forex\|crypto\|merger`) |
| `rank_stocks` | Rank the universe by a metric. | `metric` (`performance\|volume\|price`), `limit?` |
| `screen_stocks` | Filter stocks by price/%-change/sector. | `minPrice?`, `maxPrice?`, `minPercentChange?`, `maxPercentChange?`, `sector?`, `limit?` |
| `get_sector_performance` | Average performance by sector. | — |
| `get_market_sentiment` | Fear/Greed-style sentiment score (0–100) from price momentum. | — |
| `get_top_performers` | Top N gainers or losers. | `limit?`, `direction?` (`gainers\|losers`) |
| `compare_stocks` | Compare 2–5 stocks side by side. | `symbols[]` |
| `get_correlation` | Estimated price correlation between two stocks (from beta/sector). | `symbol1`, `symbol2` |

### 🧩 Chart Patterns

| Tool | Description | Key params |
|---|---|---|
| `detect_chart_pattern` | Detect a technical pattern (head & shoulders, ABCD, XABCD, cypher, triangles, double top/bottom, three drives, …). | `symbol`, `pattern` |
| `detect_elliott_wave` | Detect an Elliott Wave structure (impulse 1-2-3-4-5, ABC, triangle, WXY, WXYXZ). | `symbol`, `wave_type` |
| `get_support_resistance` | Compute S1–S3 / R1–R3 levels and pivot. | `symbol` |
| `get_trend_direction` | Uptrend / Downtrend / Sideways with strength + advice. | `symbol` |

### 💼 Portfolio

| Tool | Description | Key params |
|---|---|---|
| `get_portfolio` | Full virtual portfolio: balance, holdings, transactions. | — |
| `analyze_portfolio` | Total value, P&L, return %, per-holding breakdown. | — |
| `get_portfolio_risk` | Concentration, diversification score, estimated beta, sector exposure. | — |
| `buy_stock` | Simulate buying shares with virtual funds. | `symbol`, `quantity` |
| `sell_stock` | Simulate selling shares. | `symbol`, `quantity` |
| `auto_invest` | Spread a budget across stocks by strategy. | `budget`, `strategy` (`momentum\|diversified\|conservative\|aggressive`), `stock_count?` |
| `optimize_portfolio` | Suggest an allocation for a budget + risk level. | `budget`, `risk_level?` |
| `rebalance_portfolio` | Suggest actions to equal-weight holdings. | — |
| `calculate_position_size` | Position size from account risk % and stop-loss. | `symbol`, `risk_percent`, `stop_loss_price` |
| `calculate_profit_loss` | P&L for a position given entry price + quantity. | `symbol`, `entry_price`, `quantity` |
| `suggest_diversification` | Suggest stocks in sectors you don't hold. | — |
| `reset_portfolio` | Reset to the starting $100,000 balance. | — |

### 🔔 Watchlist & Alerts

| Tool | Description | Key params |
|---|---|---|
| `get_watchlist` | Return favorited stocks with live quotes. | — |
| `add_to_watchlist` | Add a symbol to the watchlist. | `symbol` |
| `remove_from_watchlist` | Remove a symbol from the watchlist. | `symbol` |
| `set_price_alert` | Set a virtual price alert. | `symbol`, `target_price`, `condition` (`above\|below`) |
| `get_price_alerts` | List active alerts, checked against live prices. | — |

### 🤖 AI Strategy

| Tool | Description | Key params |
|---|---|---|
| `backtest_strategy` | Simulate a strategy on a stock (SMA crossover, RSI mean-revert, buy & hold). | `symbol`, `strategy`, `initial_capital?` |

### 🧭 Navigation

| Tool | Description | Key params |
|---|---|---|
| `navigate_to` | Navigate to any StockPilot page. | `path` |
| `open_stock` | Open a stock's detail page. | `symbol` |
| `open_compare` | Open the compare page, optionally pre-filled. | `symbols?[]` |

### 🎓 Education

| Tool | Description | Key params |
|---|---|---|
| `start_beginner_tutorial` | Guided tutorial on a topic (intro, candlesticks, portfolio, risk, technicals, fundamentals, Elliott waves, patterns). | `topic` |
| `get_earnings_calendar` | Simulated upcoming earnings dates for the universe. | — |

---

## Project structure

```
app/
  api/
    finnhub/route.ts        # Server-side Finnhub proxy (hides API key, logs calls)
    twelve-data/route.ts    # Twelve Data proxy
    market/catalog/route.ts # Symbol catalog
    ohlcv/route.ts          # Reads local CSV OHLCV data
    sec/report/route.ts     # Fetches an SEC report by URL
  admin/                    # API diagnostics dashboard
  compare/ ipos/ learn/ markets/ news/ orders/
  portfolio/ sec-filings/ watchlist/ stock/[symbol]/
  page.tsx                  # Home dashboard
  layout.tsx                # App shell (sidebar + top bar)
components/
  webmcp-panel.tsx          # WebMCP status + tool registry UI
  providers.tsx             # Registers WebMCP tools on mount
  layout/ portfolio/ stocks/ comparison/ ui/
lib/
  webmcp.ts                 # ★ All 38 WebMCP tool definitions
  portfolio-store.ts        # Zustand store (virtual balance, holdings, alerts)
  finnhub/client.ts         # Client-side wrappers around /api/finnhub
  twelve-data/              # Twelve Data client, cache, transformers, types
  use-live-quotes.ts        # 30s fetch + 1s cosmetic price drift
  fallback-data.ts          # Synthetic prices when no API key
```

## How data flows

1. Components/hooks call helpers in `lib/finnhub/client.ts`, which fetch from the local `/api/finnhub` route.
2. `app/api/finnhub/route.ts` attaches the server-side `FINNHUB_API_KEY` and proxies to Finnhub, so the key never reaches the browser.
3. `lib/use-live-quotes.ts` refetches quotes every **30s** and applies a small random drift every **1s** to animate prices.
4. Portfolio actions mutate the **Zustand** store, persisted to `localStorage` under `stockpilot-portfolio`.
5. WebMCP tools call these same helpers/store, so an agent and the UI share one source of truth.

## Caveats

- **Simulated analysis:** `detect_chart_pattern`, `detect_elliott_wave`, `get_support_resistance`, `backtest_strategy`, `get_correlation`, and `get_earnings_calendar` return **deterministic, seeded demo values** derived from the ticker symbol — they do not analyze real price history. Great for demos; not real trading signals.
- **Cosmetic "live" ticks:** the 1-second price movement is randomized drift, not real tick data.
- **Not financial advice.** Paper-trading demo only.

---

Built for the WebMCP hackathon. Contributions and feedback welcome.
