'use client';

import React, { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { PropFirmDashboard } from '@/components/PropFirmDashboard';
import { StrategyBuilder } from '@/components/StrategyBuilder';
import { BacktesterView } from '@/components/BacktesterView';
import { MarketReplayView } from '@/components/MarketReplayView';
import { TaxCalculatorView } from '@/components/TaxCalculatorModal';
import { AccountModal } from '@/components/AccountModal';
import { PropAccount, Position } from '@/lib/types';
import { createPropAccount, evaluatePropRisk, rollOverTradingDay } from '@/lib/engine/propRisk';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'PROP' | 'STRATEGY' | 'BACKTEST' | 'REPLAY' | 'TAXES'>('PROP');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState<boolean>(false);

  // Initialize account with ₹10 Lakhs Pro Challenge
  const [account, setAccount] = useState<PropAccount>(() => {
    return createPropAccount('Quant Trader', 'pro-10l', false);
  });

  const [positions, setPositions] = useState<Position[]>([]);

  // Periodically evaluate open positions & risk
  useEffect(() => {
    const unrealized = positions.reduce((acc, p) => acc + p.unrealizedPnL, 0);
    const riskCheck = evaluatePropRisk(account, unrealized);

    if (riskCheck.hasBreached && account.status !== 'FAILED') {
      // Auto-liquidation
      setPositions([]);
      setAccount(riskCheck.updatedAccount);
    } else if (riskCheck.hasPassedPhase && account.status !== 'PASSED') {
      setAccount(riskCheck.updatedAccount);
    }
  }, [positions]);

  // Handle Strategy Deployment into Prop Account
  const handleDeployStrategy = (newPositions: Position[]) => {
    setPositions((prev) => [...prev, ...newPositions]);
    // Switch to Prop Terminal to see the deployed trades
    setActiveTab('PROP');
  };

  // Square off single position
  const handleSquareOffPosition = (positionId: string) => {
    const pos = positions.find((p) => p.id === positionId);
    if (!pos) return;

    const realized = pos.unrealizedPnL;
    const newPositions = positions.filter((p) => p.id !== positionId);
    setPositions(newPositions);

    setAccount((prev) => {
      const newBal = prev.currentBalance + realized;
      return {
        ...prev,
        currentBalance: newBal,
        currentEquity: newBal + newPositions.reduce((acc, p) => acc + p.unrealizedPnL, 0),
        highWaterMark: Math.max(prev.highWaterMark, newBal),
      };
    });
  };

  // Square off all positions
  const handleSquareOffAll = () => {
    const totalUnrealized = positions.reduce((acc, p) => acc + p.unrealizedPnL, 0);
    setPositions([]);
    setAccount((prev) => {
      const newBal = prev.currentBalance + totalUnrealized;
      return {
        ...prev,
        currentBalance: newBal,
        currentEquity: newBal,
        highWaterMark: Math.max(prev.highWaterMark, newBal),
      };
    });
  };

  // Reset Account after breach or retake
  const handleResetAccount = () => {
    setPositions([]);
    setAccount(createPropAccount(account.traderName, account.ruleConfig.id, account.phase === 'FUNDED'));
  };

  // Payout request
  const handleRequestPayout = (payoutAmount: number) => {
    setAccount((prev) => ({
      ...prev,
      currentBalance: prev.currentBalance - payoutAmount,
      currentEquity: prev.currentEquity - payoutAmount,
    }));
  };

  // Switch or create new account
  const handleSelectPreset = (traderName: string, presetId: string, instantFunded: boolean) => {
    setPositions([]);
    setAccount(createPropAccount(traderName, presetId, instantFunded));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0b0f19]">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        account={account}
        onNewAccount={() => setIsAccountModalOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {activeTab === 'PROP' && (
          <PropFirmDashboard
            account={account}
            positions={positions}
            onSquareOffPosition={handleSquareOffPosition}
            onSquareOffAll={handleSquareOffAll}
            onResetAccount={handleResetAccount}
            onRequestPayout={handleRequestPayout}
          />
        )}

        {activeTab === 'STRATEGY' && (
          <StrategyBuilder onDeployStrategy={handleDeployStrategy} />
        )}

        {activeTab === 'BACKTEST' && (
          <BacktesterView />
        )}

        {activeTab === 'REPLAY' && (
          <MarketReplayView
            propAccount={account}
            onUpdatePropAccount={setAccount}
          />
        )}

        {activeTab === 'TAXES' && (
          <TaxCalculatorView />
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        QuantProp India • Open-Source Indian Derivatives & Prop Firm Simulator • Zero Paid APIs Required
      </footer>

      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        onSelectPreset={handleSelectPreset}
      />
    </div>
  );
}
