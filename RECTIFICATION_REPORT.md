# Code Review & Rectification Report — QuantProp India

**Subject:** commit `78a7898` *"feat: complete holistic MVP for QuantProp India"*
**Reviewed:** 2026-10-15 · Next.js 14.2.15 / React 18.3.1 / Node 22.14 / Windows
**Method:** static review, live browser testing (Chrome, DevTools automation), and a 130-test suite written against the existing domain logic.

---

## 1. Executive summary

The original submission was **functionally non-compliant with its own headline feature**. The README advertises a "Prop Challenge Engine" with "Phase Progression: automatic promotion (Phase 1 → Phase 2 → Funded)". That promotion was **mathematically unreachable**, and this was not an edge case — it was unreachable from every account state, at every tier, on every code path.

The financial-maths layer, by contrast, was **genuinely good**: the Indian statutory cost model reproduces hand-checked figures exactly, and Black-Scholes respected put-call parity. The problems were concentrated in **wiring, labelling, packaging and currency** — not in the difficult mathematics.

Three of the most serious findings were **fabricated output presented as computed metrics**. A hardcoded `sharpeRatio: 1.84` was rendered as though calculated. Profitable trades were labelled `STOP LOSS`. An entire risk rule was a green checkmark that could never go red.

| Gate | Before | After |
|---|---|---|
| `npm audit` (production) | **1 critical + 1 high** — 2× unauthenticated RCE | **0** |
| `npm test` | did not exist | **130 passing** |
| `npm run lint` | **broken** — prompts interactively, exits 1 | exit 0 |
| `npm run typecheck` | 0 errors (loose config) | 0 errors (under `verbatimModuleSyntax` + `noUncheckedIndexedAccess`) |
| Production build | passed | passes on Next 16.4.1 + Turbopack |
| Console errors (all 5 tabs) | 0 | 0 |
| Unused imports | **26** | 0 |
| Files changed | — | 29 modified, 5 deleted, 13 added (+11,891 / −4,268) |

---

## 2. Critical findings

### 2.1 The prop challenge could never be passed — dead import

`lib/engine/propRisk.ts:161` gated promotion on:

```ts
if (totalProfit >= targetAmount && account.tradingDays >= account.ruleConfig.minTradingDays)
```

`tradingDays` was incremented in exactly one place — `rollOverTradingDay()` — which was **imported at `app/page.tsx:12` and never called**. It existed only as an unused import.

Consequences, all cascading from this single omission:

| Behaviour | Actual state |
|---|---|
| `PHASE_1 → PHASE_2 → FUNDED` | **Unreachable** |
| Certificates, confetti, payout desk | Unreachable (except via the "Instant Funded" preset) |
| `startingDayEquity` never advances | "Daily Loss Limit" was actually a **max-loss-from-inception** limit; it never reset daily |
| `dailyPnLHistory` never appended | **Consistency rule was vacuous** — `[].some(...)` is always `false` |
| Consistency dashboard badge | Hardcoded `bg-emerald-500/20` at `PropFirmDashboard.tsx:290` — a permanent green tick implying compliance with zero data |

Browser-verified before the fix: `Trading Days: 0 / 3 days` persisted across every interaction on every tier.

### 2.2 Two unauthenticated remote-code-execution advisories

`npm audit` on the original tree:

```
next 0.9.9 - 16.3.0-preview.10   Severity: critical
  ├─ GHSA-p293-qw3h-jr36  Unauthenticated Remote Code Execution on Windows-hosted servers
  ├─ GHSA-2xp9-vwfh-vxw4  Unauthenticated RCE in Image Optimization API (AVIF)
  ├─ GHSA-955p-x3mx-jcvp  Unauthenticated disclosure of internal Server Function endpoints
  └─ +31 DoS / cache-poisoning / SSRF / XSS advisories
postcss <=8.5.22              Severity: high
```

`next` was pinned at `14.2.15` — 20 patch releases behind its own `14.2.35` line, and two majors behind current. One advisory is specifically **Windows-hosted** RCE, matching the stated target environment.

**Result after upgrade to 16.4.1: `found 0 vulnerabilities`.**

### 2.3 Fabricated metrics presented as computed

**`lib/engine/backtester.ts:174`**

```ts
sharpeRatio: 1.84, // annualized estimate
```

A hardcoded constant, rendered in the UI as `Sharpe ~1.84`. Browser-verified: entering an invalid entry time produced **0 trades**, and the UI still displayed `Sharpe ~1.84`. It also persisted unchanged across two entirely different strategies.

Now computed from per-trade returns, and **returns `null` — never a fabricated number** — when fewer than two trades exist or the return series has no dispersion.

---

## 3. Functional defects

### 3.1 `strikeOffset` was never read — the "OTM Strangle" traded ATM

`lib/engine/backtester.ts:29,51` unconditionally read `bar.ceLtp` / `bar.peLtp`, which are always the at-the-money premiums. The `strikeOffset` field was declared in `BacktestRule` and referenced nowhere.

Consequence: the **"9:20 OTM Short Strangle" preset backtested an ATM straddle**, and the trade log labelled every leg `NIFTY CE ATM`. `targetPct` (take-profit) was likewise declared and never implemented.

Verified fixed: the strangle now logs `NIFTY 25150 CE (2x OTM)` / `NIFTY 24950 PE (2x OTM)` at genuinely different strikes from the ATM preset, with its own Sharpe (7.19 vs 2.60).

### 3.2 Profitable trades labelled `STOP LOSS`

The trailing-stop exit reused `'STOP_LOSS'`, because `ExitReason` had no `'TRAILING'` variant. The original run:

```
NIFTY CE ATM SELL  09:20 @ ₹200.96  11:02 @ ₹184.23  STOP LOSS  +₹771.86
NIFTY PE ATM SELL  09:20 @ ₹194.32  11:46 @ ₹123.27  STOP LOSS  +₹3,490.15
```

**Five of six legs were winners, all rendered with an amber `STOP LOSS` badge.** The P&L arithmetic was correct; only the label lied. Added `'TRAILING_STOP'`, and there is now a test asserting the invariant: a hard `STOP_LOSS` can never be a winning trade.

### 3.3 Silent failure on invalid input

Entry/exit times were unvalidated `<input type="text">`. Entering `99:99` caused `findIndex` to return `-1`, silently yielding **0 trades, an empty log and all-zero KPIs with no message to the user**. Now validated inline, with the Run button disabled and the specific error shown.

### 3.4 Deployed positions never moved

`handleDeployStrategy` created positions with `unrealizedPnL: 0`, and **nothing ever marked them**. The "Deploy to Prop Account" feature — a headline item in the original README — produced a permanently static, meaningless book.

Fixed by deriving marks during render from a mean-reverting synthetic spot clock, using the same Black-Scholes pricer as everything else.

### 3.5 Lot sizes wrong, with a silent fallback

`underlying === 'BANKNIFTY' ? 15 : 40` — the trailing `: 40` swallowed `FINNIFTY` and `SENSEX`.

| Index | Original | Correct |
|---|---|---|
| NIFTY | 50 | **75** |
| BANKNIFTY | 15 | **30** |
| FINNIFTY | **40** | **65** |
| SENSEX | **40** | **20** |

Browser-confirmed the original rendered `Lot Size: 40` for SENSEX. Now centralised in `INSTRUMENTS` (`lib/types/index.ts`) as a single source of truth.

### 3.6 Three conflicting implied-volatility sources

The same strike displayed three different prices depending on where you looked:

| Source | IV model | NIFTY 25250 CE |
|---|---|---|
| Strategy presets | fixed `% of spot` | ₹88 |
| Option-chain drawer | flat 15% | ₹82 |
| `/api/nse/option-chain` | skewed `14.5 + \|i\|·0.2` | — |

The presets priced calls and puts identically, ignoring put skew entirely. All three now route through one `lib/engine/pricing.ts` with a single volatility smile.

### 3.7 Preset legs were dead state

`StrategyBuilder.tsx:56-83` declared carefully chosen legs (₹85 CE / ₹90 PE), but the `[underlying]` effect at line 86 **fires on mount** and immediately overwrote them via `applyPreset('STRANGLE')`. The authored defaults never rendered.

### 3.8 Equities could never diverge correctly

`MarketReplayView` tracked realised P&L in local state and folded it into equity via `evaluatePropRisk`, while `currentBalance` was never updated. Browser-observed: `Equity: ₹10,05,733` alongside `Bal: ₹10,00,000`, permanently unreconciled.

---

## 4. Presentation defects

| Location | Defect |
|---|---|
| `PropFirmDashboard.tsx:271` | `₹{formatINR(...)}` rendered **`Daily Loss: ₹₹50,000 max`** — visible double currency symbol |
| `PropFirmDashboard.tsx:56-57` | Funded accounts showed `Profit Target (0%)` → **"N/A left to target"** with a 100% green bar. Replaced with a Withdrawable Profit card |
| `PropFirmDashboard.tsx:290` | Consistency badge hardcoded green regardless of data |
| `BacktesterView.tsx` | `Profit Factor` computed from **gross** P&L while the KPI above it showed net — presented as adjacent comparable figures |
| `backtester.ts:151-160` | Max drawdown measured on **session closes only**, so intra-day drawdown was invisible (reported `₹0 / 0%` on a run containing a losing day) |
| `TaxCalculatorModal.tsx:25` | "Breakeven Points" used **one-way** cost, understating the true round-trip breakeven |

---

## 5. Dead code and package hygiene

| Item | Detail |
|---|---|
| `lib/data/shoonyaAdapter.ts` | **106 lines, zero importers.** README advertised it as a working integration. No API route, no env plumbing, `totpSecret` in a class field |
| `app/api/nse/option-chain/route.ts` | **Zero callers.** Hardcoded `24-OCT-2024` expiries; echoed raw user input (`?underlying=bogus` → `"underlying": "bogus"`) while serving NIFTY data |
| `cn()` in `lib/utils.ts` | Never called — every component hand-rolled `className` template strings instead |
| `clsx`, `tailwind-merge` | **Unused dependencies** as a direct consequence |
| Unused imports | **26** across 8 files (`RotateCcw`, `Percent`, `CheckCircle`, `XCircle`, `Clock`, `FastForward`, `calculateGreeks`, `Sparkles`, `Info`, `ChevronDown`, `HelpCircle`, `ShieldCheck`, `UserCheck`, …) |
| `OptionLeg.currentPrice`, `targetSpotPrice` | Written, never read |
| `globals.css` HSL theme + `tailwind.config.js` extensions | Full shadcn-style token set (`--card`, `--primary`, `--radius`) — **every token unused**, verified by grep |
| README claims | "Interactive sliders for Underlying Spot shift, Days to Expiry, and IV spikes/crush" — **the spot-shift slider did not exist** |

---

## 6. Missing engineering fundamentals

| Gap | Detail |
|---|---|
| **No tests at all** | Four pure, framework-free engines with zero unit tests |
| **`npm run lint` broken** | No ESLint dependency, no config → `next lint` prompted interactively and exited 1. **CI could never lint.** |
| No error boundaries | Any render throw blanked the page to Next's default error screen |
| No persistence | No `localStorage` — a refresh mid-challenge wiped the account |
| Accessibility | Verified absent: modals had no `role="dialog"`, `aria-modal`, `aria-labelledby`; **Escape did not close them**; every `<input type="range">` and `<select>` had no accessible name |
| `tsconfig` `target: "es5"` | Legacy default in a modern-only app |
| No `engines` / `packageManager` | No cross-machine reproducibility |
| No favicon / `metadataBase` | Browsers 404'd the favicon |
| `next.config` | Minimal; no `poweredByHeader` control |

---

## 7. Dependency currency

| Package | Was | Now | Gap closed |
|---|---|---|---|
| `next` | 14.2.15 | **16.4.1** | 2 majors, +20 patches |
| `react` / `react-dom` | 18.3.1 | **19.3.1** | 1 major |
| `recharts` | 2.13.0 | **3.10.1** | 1 major |
| `lucide-react` | 0.453.0 | **1.57.0** | 1 major |
| `tailwindcss` | 3.4.14 | **4.3.3** | 1 major (CSS-first config) |
| `tailwind-merge` | 2.5.4 | **3.7.0** | 1 major (now actually used) |
| `typescript` | 5.6.3 | **6.0.3** | see note |
| `postcss` | 8.4.47 | **8.5.30** | fixes high-severity advisory |
| `eslint` | *absent* | **9.39.5** | restores CI linting |
| `vitest` | *absent* | **5.0.4** | test infrastructure |

**Deliberate deviations from `latest`, both documented in the README:**

- **TypeScript 6.0.3, not 7.0.2.** TS 7 is the current `latest`, but `typescript-eslint@8` — pulled in by `eslint-config-next@16` — declares a peer range of `>=4.8.4 <6.1.0`. Selecting 7.x leaves a permanently invalid peer tree that **breaks `npm ci`**. 6.0.3 is the newest stable release the entire toolchain supports.
- **ESLint 9.39.5, not 10.12.0.** `eslint-config-next@16`'s bundled `eslint-plugin-react`, `-jsx-a11y` and `-import` all cap at `^9`; npm flagged 10.x as `invalid`.

Both were chosen for a clean `npm ls` over a version number, and both are noted in the README with the upgrade condition.

### Known accepted residual risk

`npm audit` (dev dependencies) still reports **5 high** for one transitive chain:
`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (CVE-2026-93687, stack-exhaustion DoS via deeply nested glob patterns).

It has **no patched release upstream**. npm's suggested `audit fix --force` resolves it by downgrading `eslint-config-next` to **14.x**, which would **reintroduce both critical RCE advisories**. Rejected. The risk is accepted knowingly: the vulnerable path only executes on glob patterns supplied by this project's own lint config, never by untrusted input.

---

## 8. Bugs found during rectification

Five defects were introduced or exposed **by my own changes**, caught by browser testing rather than review. Recording them because the original code is not the only thing that was wrong here:

1. **Infinite render loop.** `useSyncExternalStore` received a fresh `JSON.parse` reference on every call → `Maximum update depth exceeded`. Fixed with a snapshot cache keyed on the raw string.
2. **Payout desk rejected every payout.** `requestPayout` gated on `status === 'ACTIVE'`, but reaching FUNDED sets `PASSED` — so the desk the UI offered always failed.
3. **A legitimate withdrawal instantly failed the account**, because withdrawing ₹1,70,000 (8.5% of equity) tripped the 5% daily loss limit. A withdrawal is an account event, not a trading loss.
4. **`status !== 'ACTIVE'` wrongly halted a *passed funded* account** from trading.
5. **Deployed positions were dead**, per §3.4.

Each is fixed and covered by a regression test.

Two of my own test assumptions were also wrong and were corrected against the code rather than the reverse:
- Vega **falls** as expiry shortens near the money (it scales with `√T`), so my initial assertion was backwards.
- A short **strangle** has unlimited loss (the short call dominates as spot rises), and a short **put struck at zero** has *capped* loss. Net slope is the wrong test — only **net call exposure** determines unboundedness.

---

## 9. Test suite added

130 tests across 5 files, written against the *existing* domain logic to document correct behaviour:

| File | Tests | Covers |
|---|---|---|
| `tests/blackScholes.test.ts` | 23 | Put-call parity, greeks vs finite differences, IV round-trip, deep-ITM solver convergence |
| `tests/indianTaxes.test.ts` | 15 | STT sell-side-only, stamp duty buy-side-only, GST base, round-trip cost, hostile input |
| `tests/propRisk.test.ts` | 37 | Day rollover idempotency, daily vs trailing floor precedence, phase progression, consistency rule, payout validation |
| `tests/backtester.test.ts` | 24 | Clock validation, strike offsets, trailing-vs-hard stop labelling, Sharpe `null` cases |
| `tests/strategySimulator.test.ts` | 30 | Breakeven detection in both directions, exact max profit/loss, smile shape, put-call parity |

Notable invariants now enforced in CI, each of which was violated before:

- A profitable trade can **never** be labelled `STOP_LOSS`.
- Sharpe is `null` for 0 or 1 trades, and for zero-variance returns.
- A phase **cannot** be passed without its minimum trading days.
- Breakeven detection finds **both** crossings (the original found only the lower one for a short strangle).

---

## 10. What the original code did well

Recorded for fairness — these were correct and were preserved:

- **The Indian statutory cost model is exactly right.** Verified by hand: ₹120 × 100 → STT ₹7.50, exchange ₹6.00, SEBI ₹0.01, stamp ₹0.00, brokerage ₹20.00, GST ₹4.68, total **₹38.19**.
- **Black-Scholes respected put-call parity** and put/call delta mirroring to 6 decimal places.
- **The trailing high-water-mark logic was correct**, including the breakeven lock once in profit.
- **`lib/` was genuinely well-structured** — pure, framework-free, sensibly named. That structure is what made a 130-test suite writable in a single session; it was preserved, not redesigned.
- **The tax/GST/SEBI comments showed real domain research**, not guesswork.

The failure was in **verification, not construction**. Nobody had run the thing.

---

## 11. Recommendations for future work

1. **Write the tests first.** Every critical defect here was a missing assertion, not a missing feature.
2. **Never ship a hardcoded metric.** `sharpeRatio: 1.84` and the permanent-green consistency badge both arose from satisfying the *UI*, not the *domain*.
3. **Check every entry point.** Three dead imports (`rollOverTradingDay`, the API route, `shoonyaAdapter`) and an unused `cn()` all survived because nothing verified the wiring. A dead-import lint rule would have caught the first one immediately.
4. **Keep contract specs in one place.** Lot sizes in ternaries across three files cannot stay correct.
5. **Treat `npm run lint` as a gate.** It was broken in the committed state, so no lint signal ever existed.
6. **Verify claims in the README against the code.** Three advertised features (spot-shift slider, Shoonya adapter, one-click deployment) were hollow.