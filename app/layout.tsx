import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QuantProp India | Prop Firm & Indian Options Strategy Simulator',
  description: 'Self-hosted, 100% free Indian F&O strategy builder, Black-Scholes Greeks, 1-min backtester, and FTMO-style Prop firm evaluation engine.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0b0f19] text-slate-100 antialiased selection:bg-emerald-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}
