# QuantProp India 🇮🇳

> **Self-Hosted, 100% Free Indian F&O Strategy Lab & Prop Firm Evaluation Simulator**  
> Strictly zero paid APIs or subscriptions required. Built for Nifty, Bank Nifty, FinNifty, and Sensex.

---

## 🌟 Key Functional Modules (Holistic MVP)

### 1. 🛡️ FTMO/Topstep-Grade Prop Firm Challenge Engine
* **Evaluation Tiers**: ₹5 Lakhs Starter, ₹10 Lakhs Pro, ₹25 Lakhs Elite, and Instant Funded models.
* **Drawdown Governance**:
  * **Daily Loss Limit (5%)**: Dynamically evaluated against day's opening equity.
  * **Trailing Drawdown (10%)**: High-Water Mark (HWM) trailing floor that locks at breakeven once in profit.
* **Auto-Liquidation Guardian**: Immediate hard breach execution if trailing floor or daily loss is breached.
* **Consistency Rule Engine**: Enforces max 35% profit contribution from any single trading day.
* **Phase Progression**: Automatic promotion (Phase 1 → Phase 2 → Funded) with institutional certificates.
* **Simulated Payout Desk**: Simulates 80/20 and 90/10 profit split withdrawals on funded accounts.

### 2. 📊 Opstra / Sensibull Style Options Strategy Builder
* **Black-Scholes Mathematical Engine**: Vectorized analytical pricing with dividend yield & Indian risk-free rate ($r = 6.8\%$).
* **Real-Time Greeks**: Net Delta ($\Delta$), Gamma ($\Gamma$), Theta ($\Theta$ in ₹/day decay), and Vega ($\nu$ in ₹/1% IV).
* **Interactive Payoff Diagram**: Expiry payoff curve + Target date ($T+N$) curve with zero and spot reference lines.
* **What-If Scenario Sandbox**: Interactive sliders for Underlying Spot shift, Days to Expiry, and IV spikes/crush.
* **Strategy Presets**: Short Straddle, Short Strangle, Iron Condor, Bull Call Spread, etc.
* **Direct Deployment**: 1-click execution to push the modeled multi-leg basket directly into your active Prop Challenge account!

### 3. ⚡ AlgoTest / StockMock Style 1-Minute Backtester
* **Rule-Based Engine**: Backtests 9:20 straddles, strangles, and custom offset legs across real 1-minute historical data.
* **Risk Management Rules**: Stop loss by percentage, points, and lock & trail trailing stop losses.
* **Indian Statutory Friction**: Accurately deducts STT, Exchange Turnover charges, GST, SEBI fees, Stamp Duty, and Brokerage on every leg.
* **Analytics**: Post-tax Net P&L, Win Rate %, Profit Factor, Max Drawdown, Equity Curve, and trade-by-trade audit log.

### 4. ⏱️ 1-Minute Historical Market Replay
* **Tape Player**: Play, Pause, Step (+1 min), and speed controls (1x, 5x, 15x, 30x) over 375-minute intraday sessions.
* **Diverse Market Regimes**:
  * Range-bound expiry (Theta decay test)
  * Trend day morning breakout
  * 0-DTE 2:00 PM gamma blast reversal
* **Virtual Execution Pad**: Buy/Sell ATM CE and PE during replay with real-time MTM updates.
* **Real-Time Breach Test**: If your trades breach daily loss or max trailing DD during replay, the Liquidation Bot squares you off live on screen!

### 5. 🧮 Indian SEBI / NSE F&O Regulatory Cost Engine
* Itemized calculations for STT, NSE/BSE Exchange charges, SEBI turnover fees, Stamp duty, GST (18%), and Brokerage (Flat ₹20 or ₹0 Shoonya model).
* Calculates exact **breakeven points** required per lot to cover friction.

---

## 🚀 Instant Vercel Deployment (100% Free)

This project is built on **Next.js 14 App Router** and requires **zero external cloud servers or databases** to run the full MVP.

1. **Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of QuantProp India"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
2. **Deploy on Vercel**:
   * Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
   * Import your GitHub repository.
   * Framework Preset: **Next.js** (detected automatically).
   * Click **Deploy**!

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open in browser
http://localhost:3000
```

---

## 🔌 Free Data Sourcing & Shoonya (Finvasia) Integration

The project includes an abstract data layer:
1. **Out-of-the-Box**: Bundled with calibrated historical 1-minute data sessions and synthetic live option chain generator.
2. **Shoonya Free API Adapter (`lib/data/shoonyaAdapter.ts`)**: When you have a free Shoonya account, simply plug in your credentials to stream live ticks and fetch historical minute candles directly with ₹0 broker charges.
