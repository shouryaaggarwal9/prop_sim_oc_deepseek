import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QuantProp India | Prop Firm & Indian Options Strategy Simulator',
  description:
    'Self-hosted Indian F&O strategy builder with Black-Scholes greeks, a one-minute expiry backtester, a market replay tape and an FTMO-style prop firm evaluation engine.',
  applicationName: 'QuantProp India',
  keywords: [
    'Indian options',
    'NIFTY',
    'BANKNIFTY',
    'Black-Scholes',
    'options greeks',
    'prop firm challenge simulator',
    'backtesting',
  ],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0b0f19] text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}