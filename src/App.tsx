import React, { useState, useEffect, useCallback } from 'react';
import { AppHeader } from './components/layout/AppHeader';
import { AppSidebar, ActiveViewId } from './components/layout/AppSidebar';
import { NotificationBanner } from './components/layout/NotificationBanner';
import { apiClient } from './services/apiClient';
import {
  InvoiceRecord,
  TreasurySummaryResponse,
  ExecutionReceipt,
  ForensicDecisionEnvelope,
  ApiErrorEnvelope,
} from './contracts/ledgerGuardContract';
import { CurrencyDisplay } from './components/common/CurrencyDisplay';
import { OverviewDashboardView } from './components/views/OverviewDashboardView';
import { InvoiceIntakeListView } from './components/views/InvoiceIntakeListView';
import { InvoiceDetailDrawer } from './components/views/InvoiceDetailDrawer';
import { ThreeWayMatchMatrixView } from './components/views/ThreeWayMatchMatrixView';
import { DiscrepancyReviewView } from './components/views/DiscrepancyReviewView';
import { LiquidityExplanationView } from './components/views/LiquidityExplanationView';
import { ApprovalQueueView } from './components/views/ApprovalQueueView';
import { ExecutionHistoryView } from './components/views/ExecutionHistoryView';
import { ForensicAuditTrailView } from './components/views/ForensicAuditTrailView';
import { SecurityDiagnosticsView } from './components/views/SecurityDiagnosticsView';
import { ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ActiveViewId>('overview');
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [treasury, setTreasury] = useState<TreasurySummaryResponse | null>(null);
  const [executions, setExecutions] = useState<ExecutionReceipt[]>([]);
  const [envelopes, setEnvelopes] = useState<ForensicDecisionEnvelope[]>([]);
  const [targetAuditTraceId, setTargetAuditTraceId] = useState<string | undefined>(undefined);
  const [activeError, setActiveError] = useState<ApiErrorEnvelope | null>(null);
  const [_isLoading, setIsLoading] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);

  // Inspector Drawer State
  const [inspectedInvoice, setInspectedInvoice] = useState<InvoiceRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);

  // 3-Way Match Selected Invoice
  const [selectedMatchInvoiceId, setSelectedMatchInvoiceId] = useState<string | undefined>(undefined);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [invData, trsData, execData, envData] = await Promise.all([
        apiClient.getInvoices(),
        apiClient.getTreasurySummary(),
        apiClient.getExecutions(),
        apiClient.getAuditEnvelopes(),
      ]);
      setInvoices(invData);
      setTreasury(trsData);
      setExecutions(execData);
      setEnvelopes(envData);
      if (invData.length > 0 && !selectedMatchInvoiceId) {
        setSelectedMatchInvoiceId(invData[0].invoice_id);
      }
    } catch (err) {
      setActiveError(apiClient.normalizeError(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedMatchInvoiceId]);

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

  const handleIngestBatch = async () => {
    setIsIngesting(true);
    try {
      await apiClient.ingestBenchmarkBatch();
      await loadData();
    } catch (err) {
      setActiveError(apiClient.normalizeError(err));
    } finally {
      setIsIngesting(false);
    }
  };

  const handleIngestCustom = async (payload: any) => {
    try {
      const newInv = await apiClient.ingestCustomInvoice({
        document_source: 'UPLOADED_JSON_PDF',
        raw_payload: payload,
      });
      await loadData();
      setInspectedInvoice(newInv);
      setIsDrawerOpen(true);
    } catch (err) {
      setActiveError(apiClient.normalizeError(err));
    }
  };

  const handleInspectInvoice = (inv: InvoiceRecord) => {
    setInspectedInvoice(inv);
    setIsDrawerOpen(true);
  };

  const handleNavigateTo3WayMatch = (invoiceId: string) => {
    setSelectedMatchInvoiceId(invoiceId);
    setActiveView('three_way_match');
    setIsDrawerOpen(false);
  };

  const handleNavigateToDiscrepancy = (_invoiceId: string) => {
    setActiveView('discrepancy');
    setIsDrawerOpen(false);
  };

  const handleNavigateToApproval = (_invoiceId: string) => {
    setActiveView('approval');
    setIsDrawerOpen(false);
  };

  const handleNavigateToAudit = (traceId?: string) => {
    setTargetAuditTraceId(traceId);
    setActiveView('audit');
    setIsDrawerOpen(false);
  };

  const handleNavigateToExecutions = () => {
    setActiveView('executions');
    setIsDrawerOpen(false);
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
          {/* Top Operational Context Header */}
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

          {/* View Routing */}
          {activeView === 'overview' && (
            <OverviewDashboardView
              treasury={treasury}
              invoices={invoices}
              onNavigate={setActiveView}
            />
          )}

          {activeView === 'intake' && (
            <InvoiceIntakeListView
              invoices={invoices}
              onSelectInvoice={handleInspectInvoice}
              onNavigateTo3WayMatch={handleNavigateTo3WayMatch}
              onIngestBatch={handleIngestBatch}
              onIngestCustom={handleIngestCustom}
              isIngesting={isIngesting}
            />
          )}

          {activeView === 'three_way_match' && (
            <ThreeWayMatchMatrixView
              invoices={invoices}
              selectedInvoiceId={selectedMatchInvoiceId}
              onSelectInvoiceId={setSelectedMatchInvoiceId}
              onNavigateToDiscrepancy={handleNavigateToDiscrepancy}
              onNavigateToApproval={handleNavigateToApproval}
            />
          )}

          {activeView === 'discrepancy' && (
            <DiscrepancyReviewView
              invoices={invoices}
              onRefreshData={loadData}
              onNavigateTo3WayMatch={handleNavigateTo3WayMatch}
            />
          )}

          {activeView === 'liquidity' && (
            <LiquidityExplanationView
              treasury={treasury}
              invoices={invoices}
              onNavigateToApproval={handleNavigateToApproval}
            />
          )}

          {activeView === 'approval' && (
            <ApprovalQueueView
              invoices={invoices}
              onRefreshData={loadData}
              onNavigateTo3WayMatch={handleNavigateTo3WayMatch}
            />
          )}

          {activeView === 'executions' && (
            <ExecutionHistoryView
              executions={executions}
              onNavigateToAudit={handleNavigateToAudit}
              onRefreshData={loadData}
            />
          )}

          {activeView === 'audit' && (
            <ForensicAuditTrailView
              envelopes={envelopes}
              executions={executions}
              targetTraceId={targetAuditTraceId}
            />
          )}

          {activeView === 'security_diagnostics' && (
            <SecurityDiagnosticsView
              invoices={invoices}
              onRefreshData={loadData}
              onNavigateToAudit={handleNavigateToAudit}
              onNavigateToExecutions={handleNavigateToExecutions}
            />
          )}

          {/* Architectural Security Notice Banner */}
          <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 flex items-start gap-3 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-200">LedgerGuard-SME Production Copilot Engine Active. </span>
              Zero Frontend Financial Arithmetic strictly applied. Tabular-nums formatted. OWASP ASI01 sandboxed field containers, anti-rubber-stamp confirmation gates, and SHA-256 cryptographic non-repudiation audit trail verified.
            </div>
          </div>
        </main>
      </div>

      {/* Invoice Detail Inspector Drawer */}
      <InvoiceDetailDrawer
        invoice={inspectedInvoice}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onNavigateTo3WayMatch={handleNavigateTo3WayMatch}
        onNavigateToDiscrepancy={handleNavigateToDiscrepancy}
        onNavigateToApproval={handleNavigateToApproval}
      />
    </div>
  );
};
