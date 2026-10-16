# QuantProp India 🇮🇳

> **Self-hosted, zero-dependency Indian F&O strategy lab & prop firm evaluation simulator.**
> Built for NIFTY, BANKNIFTY, FINNIFTY and SENSEX. No paid APIs, no database, no broker connection.

Everything runs in the browser. State persists to `localStorage`, so a refresh mid-challenge does not wipe your account.

---

## Stack

| Package | Version | Notes |
|---|---|---|
| Next.js | 16.4.1 | App Router, Turbopack |
| React / React DOM | 19.3.1 | |
| Tailwind CSS | 4.3.3 | CSS-first `@theme`, no `tailwind.config.js` |
| Recharts | 3.10.1 | |
| lucide-react | 1.57.0 | |
| TypeScript | 6.0.3 | See the note below |
| ESLint | 9.39.5 | Flat config, `eslint-config-next@16` |
| Vitest | 5.0.4 | 127 unit tests over the engine layer |

> **Why TypeScript 6.0.3 and not 7.x?**
> TypeScript 7.0.2 is the current `latest` tag, but `typescript-eslint@8` — which
> `eslint-config-next@16` depends on — declares a peer range of `>=4.8.4 <6.1.0`.
> Using 7.x leaves a permanently invalid peer tree that breaks `npm ci`. 6.0.3 is the
> newest stable release the entire toolchain supports. Re-check once
> `typescript-eslint` widens its range.

### Known accepted advisory

`npm audit` reports one transitive **dev-only** chain:
`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`
(CVE-2026-93687, stack-exhaustion DoS via deeply nested glob patterns).
It has **no patched release upstream**, and npm's suggested `audit fix --force`
would resolve it by downgrading `eslint-config-next` to 14.x — reintroducing the
critical Next.js remote-code-execution advisories. The risk is not accepted
blindly: the vulnerable code path only runs on glob patterns supplied by this
project's own lint config, never by untrusted input.

---

## Modules

### 1. 🛡️ Prop firm evaluation engine
* **Tiers**: ₹5L Starter, ₹10L Pro, ₹25L Elite, plus an Instant Funded simulation.
* **Daily loss limit** — evaluated against the **day's opening equity**, and reset by
  the *End Trading Day* action or automatically when the calendar date rolls over.
* **Trailing drawdown** — high-water-mark floor that locks at break-even once in profit.
* **Consistency rule** — no single day may exceed a configured share of the phase
  target. Evaluated against real closed-day history; the dashboard shows
  *awaiting closed days* rather than a green tick when there is no data.
* **Phase progression** — PHASE_1 → PHASE_2 → FUNDED, each phase restarting with a
  clean balance, day counter and history.
* **Payout desk** — simulated profit-split withdrawals, validated against available
  profit and the trailing floor.

### 2. 📊 Options strategy builder
* **Black-Scholes-Merton** with continuous dividend yield.
* Live **Δ / Γ / Θ / Vega / Rho**, plus a volatility smile so OTM puts carry the
  skew real markets show.
* **One pricing source.** Presets, the option chain and the payoff engine all read
  the same pricer, so a given strike can never display two different premiums.
* Exact **max profit / max loss** computed from the structure's critical points
  rather than sampled off the chart, so a bounded structure is never reported as
  clipped or unlimited.
* Expiry and forward payoff curves, breakevens, probability of profit, SPAN estimate.
* What-if sandbox for target spot, target date and IV shift.

### 3. ⚡ 1-minute expiry backtester
* Rule-based engine over deterministic synthetic expiry tapes.
* **Strike offsets are real** — an OTM strangle genuinely trades the OTM contract,
  priced per bar against that bar's spot and the time left in the session.
* Stop-loss, **trailing stop** and take-profit per leg, with stops assumed to fill
  before targets when a minute bar could satisfy both.
* Full Indian statutory cost model applied on **both** sides of every leg.
* Real metrics: net/gross P&L, win rate, profit factor, Sharpe, max drawdown.
  **Metrics that cannot be computed are reported as `null`, never as a constant.**

### 4. ⏱️ Market replay
* Play / pause / step / scrub a 375-minute expiry session at 1×–30×.
* Four regimes: range-bound expiry, trend day, 0-DTE gamma blast, high-beta bank session.
* Virtual execution pad against a live prop challenge; the tape halts the moment the
  account breaches.

### 5. 🧮 Regulatory cost engine
Itemised STT, exchange transaction charges, SEBI turnover fee, stamp duty, GST and
brokerage — for a single order **and** for a full round trip, with the exact
breakeven premium move each implies.

> Rates reflect the position after the **October 2024** merger of SEBI's IPFT into
> the exchange transaction charge. Contract specifications (lot size, strike ladder)
> are centralised in `lib/types/index.ts` under `INSTRUMENTS`.
> **Verify both against the latest NSE/BSE circular before relying on them.**

---

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |

---

## Project layout

```
app/                     routes, layout, error boundaries, icon
components/              UI (one file per module)
  ui/Modal.tsx           accessible dialog: focus trap, Escape, aria-modal
lib/
  types/                 shared types + INSTRUMENTS (single source of truth)
  engine/                pure, framework-free domain logic
    blackScholes.ts      pricing, greeks, implied vol (Newton + bisection)
    pricing.ts           volatility smile, option chain, tick rounding
    strategySimulator.ts payoff, breakevens, PoP, margin, extremes
    propRisk.ts          drawdown governance, phase progression, payouts
    backtester.ts        event-driven session backtester
    indianTaxes.ts       statutory cost model
  data/                  deterministic synthetic tapes
  hooks/                 usePersistentState (useSyncExternalStore)
tests/                   127 unit tests over lib/
```

The `lib/engine` layer is deliberately free of React and of DOM APIs, which is why
it can be tested directly and why `npm test` runs in a Node environment.

---

## Deployment

Push to GitHub and import into Vercel; the Next.js preset is detected
automatically. `next build` emits a static `/` route plus error and not-found
boundaries, so no server runtime, database or environment variable is required.

---

## Disclaimer

Simulated trading and educational tooling. The prop firm rules are modelled on
published two-phase structures but are illustrative and do not represent any
specific firm. Market data is synthetic. **Not investment advice.**