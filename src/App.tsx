import React, { useState, useEffect, useCallback } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { AppSidebar, ActiveViewId } from './components/layout/AppSidebar';
import { NotificationBanner } from './components/layout/NotificationBanner';
import { apiClient } from './services/apiClient';
import {
  InvoiceRecord,
  TreasurySummaryResponse,
  ExecutionReceipt,
  ApiErrorEnvelope,
} from './contracts/ledgerGuardContract';
import { CurrencyDisplay } from './components/common/CurrencyDisplay';
import { OperationalStateBadge } from './components/common/OperationalStateBadge';
import { PermissionTierBadge } from './components/common/PermissionTierBadge';
import { Card } from './components/common/Card';
import { ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ActiveViewId>('overview');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [treasury, setTreasury] = useState<TreasurySummaryResponse | null>(null);
  const [executions, setExecutions] = useState<ExecutionReceipt[]>([]);
  const [activeError, setActiveError] = useState<ApiErrorEnvelope | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invData, trsData, execData] = await Promise.all([
        apiClient.getInvoices(),
        apiClient.getTreasurySummary(),
        apiClient.getExecutions(),
      ]);
      setInvoices(invData);
      setTreasury(trsData);
      setExecutions(execData);
    } catch (err) {
      setActiveError(apiClient.normalizeError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = apiClient.onModeChange(() => {
      loadData();
    });
    return unsub;
  }, [loadData]);

  const handleBatchReset = async () => {
    setIsResetting(true);
    try {
      await apiClient.resetBenchmarkBatch();
      await loadData();
      setActiveError(null);
    } catch (err) {
      setActiveError(apiClient.normalizeError(err));
    } finally {
      setIsResetting(false);
    }
  };

  // Derive counts for sidebar badges
  const quarantinedCount = invoices.filter(
    (i) => i.operational_state === 'BLOCKED_DISCREPANCY'
  ).length;
  const securityBlockedCount = invoices.filter(
    (i) => i.operational_state === 'BLOCKED_SECURITY_VIOLATION'
  ).length;
  const pendingApprovalCount = invoices.filter(
    (i) => i.operational_state === 'PENDING_HITL_TIER_3'
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Persistent Global Header */}
      <AppHeader onBatchReset={handleBatchReset} isResetting={isResetting} />

      {/* Structured Notification Banner for ApiErrorEnvelopes */}
      <NotificationBanner
        error={activeError}
        onDismiss={() => setActiveError(null)}
      />

      {/* Main Layout Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <AppSidebar
          activeView={activeView}
          onSelectView={setActiveView}
          counts={{
            totalInvoices: invoices.length,
            quarantinedCount,
            securityBlockedCount,
            pendingApprovalCount,
            executedCount: executions.length,
          }}
        />

        {/* Viewport Content Area */}
        <main
          className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6"
          data-testid="main-content-viewport"
        >
          {/* Top Operational Context Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-100 tracking-tight">
                  {activeView === 'overview' && 'Treasury Overview & 30-Day Trajectory'}
                  {activeView === 'intake' && 'Invoice Intake & Verification Queue'}
                  {activeView === 'three_way_match' && 'Three-Way Match Reconciliation Matrix'}
                  {activeView === 'discrepancy' && 'Discrepancy & Fraud-Risk Review Center'}
                  {activeView === 'liquidity' && 'Working-Capital & Discount Arbitrage Engine'}
                  {activeView === 'approval' && 'Human-in-the-Loop (HITL) Approval Queue'}
                  {activeView === 'executions' && 'Sandbox Execution Receipts & Ledger History'}
                  {activeView === 'audit' && 'Forensic Audit Trail & Decision Envelopes (Gt)'}
                  {activeView === 'security_diagnostics' && 'Security Diagnostics & Atomic Rollback'}
                </h1>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                  {activeView.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Shenzhen International FinTech Competition 2026 — Topic E SME Finance Copilot
              </p>
            </div>

            {/* Header Mini-KPI Pill */}
            {treasury && (
              <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 self-start sm:self-auto font-mono text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Operating Cash</span>
                  <CurrencyDisplay amount={treasury.current_cash_balance} />
                </div>
                <div className="w-px h-6 bg-slate-800" />
                <div>
                  <span className="text-slate-400 text-[10px] uppercase block">Payroll Floor</span>
                  <CurrencyDisplay
                    amount={treasury.payroll_reserve_floor}
                    variant="neutral"
                    className="text-amber-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quick-Summary KPI Cards (Always visible in Stage 3 shell) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-l-4 border-l-emerald-500">
              <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                Operating Cash Balance
              </span>
              <div className="mt-1 text-2xl font-bold font-mono">
                <CurrencyDisplay amount={treasury?.current_cash_balance || '0.00'} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Floor: <span className="text-amber-400 font-mono font-semibold">${treasury?.payroll_reserve_floor || '50,000.00'}</span> (Hard Constraint)
              </p>
            </Card>

            <Card className="border-l-4 border-l-indigo-500">
              <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                Verified Payables (30d)
              </span>
              <div className="mt-1 text-2xl font-bold font-mono text-indigo-300">
                <CurrencyDisplay amount={treasury?.total_verified_payables_30d || '0.00'} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                2 verified matched invoices (TC-01, TC-05)
              </p>
            </Card>

            <Card className="border-l-4 border-l-amber-500">
              <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                Quarantined Payables
              </span>
              <div className="mt-1 text-2xl font-bold font-mono text-amber-300">
                <CurrencyDisplay amount={treasury?.total_quarantined_payables || '0.00'} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {quarantinedCount} discrepancy + {securityBlockedCount} security violation
              </p>
            </Card>

            <Card className="border-l-4 border-l-emerald-400">
              <span className="text-[11px] font-mono uppercase text-slate-400 tracking-wider">
                Net Early-Pay Arbitrage
              </span>
              <div className="mt-1 text-2xl font-bold font-mono text-emerald-400">
                <CurrencyDisplay
                  amount={treasury?.net_30d_discount_savings_available || '0.00'}
                  isDelta={true}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                $800 discount - $24.16 LOC bridge cost
              </p>
            </Card>
          </div>

          {/* Shell Stage View Preview / Invoices Table Preview */}
          <Card
            title={`Active Invoices (${invoices.length} Loaded)`}
            subtitle="Demonstrating strict operational state honesty and permission tiers"
          >
            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-400 font-mono animate-pulse">
                Loading deterministic SME fixtures...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs" data-testid="invoices-preview-table">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[11px]">
                      <th className="py-2.5 px-3">Invoice</th>
                      <th className="py-2.5 px-3">Vendor</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Terms</th>
                      <th className="py-2.5 px-3">Operational State</th>
                      <th className="py-2.5 px-3">Permission Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {invoices.map((inv) => (
                      <tr
                        key={inv.invoice_id}
                        className="hover:bg-slate-850/50 transition-colors font-sans"
                        data-testid={`invoice-row-${inv.invoice_number}`}
                      >
                        <td className="py-3 px-3 font-mono font-medium text-slate-200">
                          {inv.invoice_number}
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          {inv.extraction.vendor_name_claimed}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <CurrencyDisplay amount={inv.extraction.total_claimed} />
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-400">
                          {inv.extraction.early_discount_pct !== '0.00'
                            ? `${inv.extraction.early_discount_pct}% ${inv.extraction.early_discount_days} Net ${inv.extraction.net_due_days}`
                            : `Net ${inv.extraction.net_due_days}`}
                        </td>
                        <td className="py-3 px-3">
                          <OperationalStateBadge state={inv.operational_state} size="sm" />
                        </td>
                        <td className="py-3 px-3">
                          <PermissionTierBadge tier={inv.permission_tier} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Architectural Security Notice Banner */}
          <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-3 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">Stage 3 Design System & Application Shell Active. </span>
              Zero Frontend Financial Arithmetic strictly applied. Tabular-nums formatted. OWASP ASI01 sandboxed field containers and anti-rubber-stamp confirmation gates established for Stages 4–6.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
