# Roadmap — QuantProp India

**Created:** 2026-10-16 · **Baseline:** Next.js 16.4.1 · React 19.3.1 · TS 6.0.3 · 145 tests · 0 prod vulnerabilities · 0 lint/tsc errors

## Decisions this roadmap is built on

Recorded so a future session doesn't re-litigate them:

1. **Data:** synthetic by default, with an optional live adapter behind an interface. Zero-config must always work.
2. **Audience:** public portfolio / open-source. Credibility and first impressions matter; no user accounts.
3. **Cadence:** a few hours per week. **Every milestone must fit in one sitting** and be independently shippable.

## Guiding constraints

Because of (3), two rules govern everything below:

- **Start only what you can finish.** A half-done refactor is worse than no refactor when you see it once a fortnight.
- **Protect before you build.** The 43 uncommitted files are currently the single largest risk to this project.

---

## Phase 0 — Lock it in
**⏱ One session. Do this before anything else.**

The rectification is real, tested, and entirely uncommitted. It is one `git reset` away from being lost.

- [x] Review the rectification diff, then commit it as a single well-described change
- [ ] Tag `v1.1.0`
- [ ] Add `.github/workflows/ci.yml` — `typecheck`, `lint`, `test`, `build`, `npm audit --omit=dev`
- [ ] Add `.github/dependabot.yml` for npm (weekly patch/minor groups)
- [ ] Start `CHANGELOG.md` (Keep a Changelog format)

**Done when:** the tag is pushed, CI is green on it, and Dependabot has opened its first PR.

> ⚠️ CI must run `npm audit --omit=dev` as a **separate non-blocking job**. Failing the build over the known dev-only `braces` advisory trains you to ignore CI.

---

## Phase 1 — Close the test gap that actually bit us
**⏱ Two sessions. Highest-value engineering spend in this roadmap.**

The evidence justifies this precisely: **130 engine tests caught zero of the five integration defects I fixed.** All five surfaced only through browser testing — an infinite render loop, a payout desk that rejected every payout, a withdrawal that instantly failed the account, an over-broad status check, and dead positions.

A future regression in those same areas will be found the same expensive way.

- [ ] Component-test the risk pipeline (`applyRiskGuard` + `commit` in `app/page.tsx`) — where 4 of 5 bugs lived
- [ ] Component-test `usePersistentState` — the snapshot-cache invariant is subtle enough to regress silently
- [ ] One Playwright smoke spec: load → each of the 5 tabs → deploy a structure → confirm live marking → End Trading Day → assert the day counter advances

**Done when:** the smoke spec catches a deliberately re-introduced dead import.

---

## Phase 2 — The data layer
**⏱ Three to four sessions. The biggest architectural change.**

Today `lib/data/sampleHistoricalData.ts` exports a module-scope constant that generates **1,500 bars on both the server and the client** — shipped in the main bundle for a tab most visitors never open.

**Target shape:**

```
lib/data/
  provider.ts          interface: listSessions(), getCandles(symbol, range), getChain(symbol, expiry)
  synthetic/           existing generator, moved behind the interface, lazily generated
  shoonya/             free zero-brokerage Indian feed
  index.ts             resolves the active provider, falls back to synthetic on any failure
```

- [ ] Extract the `MarketDataProvider` interface; move the existing generator behind it, **lazily** so sessions are only built when the replay tab opens
- [ ] Add a settings panel for live-provider credentials
- [ ] Implement the Shoonya adapter (free tier, no brokerage, Indian exchange coverage)
- [ ] Wire the fallback path and surface which provider is active in the UI

**Security constraint — decide this before writing any adapter code:**

> Credentials stay **in the browser** (`localStorage`) and the app talks **directly** to the broker's API. No server proxy, no credential forwarding to our own backend. This keeps the deployment static and means we never hold anyone's broker credentials.
> Mitigating factor to document: anything in `localStorage` is readable by any script on the origin. Say this plainly in the README rather than implying it is bank-grade.

**Done when:** the app is fully functional with no credentials, and adding a credential switches the replay source without any UI change elsewhere.

---

## Phase 3 — Financial depth
**⏱ Four to five sessions. Correctness and honesty of the numbers.**

The weakest remaining part of the model, in order of severity:

- [ ] **Replace the hardcoded margin proxy.** `strategySimulator.ts` uses flat ₹1,15,000/lot naked and ₹45,000/lot hedged. Make these a documented, configurable model and label them an *estimate* everywhere they surface.
- [ ] **Portfolio-level risk in the Prop Terminal** — net delta/vega across all open positions, and margin utilisation as a percentage of the account.
- [ ] **Stress testing** — what happens on a gap down, an IV spike, or a 3-sigma intraday move against the current book.
- [ ] **Position management** — add to position, partial exit, attach/modify a stop. All three are currently impossible.
- [ ] **Intra-day equity curve** in the Prop Terminal; drawdown is currently measured on session closes only and can read `₹0` on a losing day.

**Done when:** the margin estimate is labelled and parameterised, and a user can go flat-to-short from the Prop Terminal.

---

## Phase 4 — Product depth
**⏱ Four to six sessions. Optional — pick by what you personally use.**

- [ ] **Persist strategies.** Today there is exactly one `localStorage` key (`quantprop:state:v1` → account + positions). Rebuilding a strategy on refresh is pure friction.
- [x] **Trade ledger** — shipped. Every closed leg is journaled with its entry, exit,
  realised P&L, statutory cost and exit reason; the Prop Terminal shows win rate,
  profit factor and a daily realised-P&L chart
- [ ] Cross-session analytics over the ledger — it currently resets when a new account is started
- [ ] Export (CSV / print-to-PDF report) — the ledger is the natural data source
- [ ] Strategy comparison — overlay two structures' payoff curves
- [ ] Mobile pass (currently partial)

**Done when:** a built strategy survives a refresh and can be re-deployed in one click.

---

## Phase 5 — Portfolio polish
**⏱ Two to three sessions. Given decision (2), this is not vanity.**

For a public project, this is the work that converts "code exists" into "someone trusts it":

- [ ] Live Vercel URL + screenshots in the README hero
- [ ] `CONTRIBUTING.md` (setup, test, lint, architecture pointers)
- [ ] Measure and record the actual bundle size — Next 16 dropped the build-time figure, so measure with Lighthouse
- [ ] Accessibility audit with axe; keyboard-only pass over all five tabs
- [ ] Honest limitations section in the README

---

## Explicit non-goals

Scope creep is the main threat at this cadence. These are **not** worth it for a single-contributor public portfolio:

| Tempting | Why not |
|---|---|
| Auth / user accounts | Zero value without an audience that needs accounts |
| Database / cloud persistence | `localStorage` is sufficient; adds auth and cost |
| Payments / subscriptions | Turns a portfolio project into an obligation |
| Real-money order routing | Out of scope, legally sensitive, ruins the positioning |
| Microservices / backend | A static site does not need them |
| Native mobile apps | The web app already works in a browser |

---

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Dependabot opens an unvetted major upgrade | Certain | **Never merge a Dependabot major blind.** The ESLint 9/10 and TypeScript 6/7 forks in the rectification are the precedent — both needed a deliberate peer-dependency decision. |
| Live-data provider breaks or changes its API | Medium | Provider interface + synthetic fallback means the app never hard-fails |
| Credentials leak from `localStorage` | Medium | No server proxy, honest README warning, no analytics or third-party scripts |
| Scope creep | High | The non-goals table above; revisit it when tempted |
| Long hiatus → knowledge loss | High | Every milestone must be self-documenting; `CHANGELOG.md` doubles as a memory aid |

---

## Maintenance cadence

Steady-state after Phase 1, roughly monthly:

1. Triage Dependabot PRs (patch/minor auto-merge if CI is green; majors deliberate)
2. Re-run `npm audit --omit=dev` — target stays at zero
3. Add a test alongside each bug fix — the ratio that keeps defects from recurring

---

## Progress since this roadmap was written

- **Rectification committed and pushed** (`78a7898`, `65d7708`).
- **Trade ledger shipped** (Phase 4). All five close paths now funnel through one
  `closePositions` call; the Prop Terminal renders ledger stats and a daily
  realised-P&L chart. Two defects fell out of the work:
  - the day rollover recorded `0` for every day, which left the consistency rule
    vacuous in the running app even after the engine was fixed — it now records the
    day's actual realised P&L;
  - a risk-breach liquidation discarded the book's unrealised loss instead of
    realising it — it is now booked and journaled like any other close.

## Suggested immediate next action

> **Phase 0 remainder.** Tag `v1.1.0` and add CI (`typecheck` + `lint` + `test` +
> `build`, with `npm audit --omit=dev` as a separate non-blocking job). Then **Phase 1**
> — the component tests are still the highest-value engineering spend, because the five
> integration defects fixed in the rectification were all invisible to the engine tests.