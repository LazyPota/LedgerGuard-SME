import React from 'react';
import { TreasurySummaryResponse, InvoiceRecord } from '@/contracts/ledgerGuardContract';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { Card } from '../common/Card';
import { TrajectoryChart } from '../common/TrajectoryChart';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

interface OverviewDashboardViewProps {
  treasury: TreasurySummaryResponse | null;
  invoices: InvoiceRecord[];
  onNavigate: (viewId: any) => void;
}

export const OverviewDashboardView: React.FC<OverviewDashboardViewProps> = ({
  treasury,
  invoices,
  onNavigate,
}) => {
  if (!treasury) {
    return (
      <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
        Loading Treasury Model & Cash Trajectory...
      </div>
    );
  }

  const quarantinedCount = invoices.filter(
    (i) => i.operational_state === 'BLOCKED_DISCREPANCY'
  ).length;
  const securityBlockedCount = invoices.filter(
    (i) => i.operational_state === 'BLOCKED_SECURITY_VIOLATION'
  ).length;

  return (
    <div className="space-y-6" data-testid="overview-dashboard-view">
      {/* 4 Top KPI Cards with Provenance Tooltips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Operating Cash vs Payroll Floor */}
        <Card className="border-l-4 border-l-emerald-500 relative group">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Operating Cash Balance</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono">
            <CurrencyDisplay amount={treasury.current_cash_balance} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono border-t border-slate-800/80 pt-2 text-slate-400">
            <span>Payroll Reserve Floor:</span>
            <span className="text-amber-400 font-semibold">
              ${treasury.payroll_reserve_floor}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400 font-sans">
            Next payroll: {treasury.next_payroll_date} (${treasury.next_payroll_amount})
          </p>
        </Card>

        {/* KPI 2: Verified Payables */}
        <Card className="border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Verified Payables (30d)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
              2 Matched
            </span>
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-indigo-300">
            <CurrencyDisplay amount={treasury.total_verified_payables_30d} />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono border-t border-slate-800/80 pt-2 text-slate-400">
            <span>Quarantined Payables:</span>
            <span className="text-amber-400 font-semibold">
              ${treasury.total_quarantined_payables}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400 font-sans">
            Clean 3-way matches ready for scheduling
          </p>
        </Card>

        {/* KPI 3: Net Early-Discount Savings */}
        <Card className="border-l-4 border-l-emerald-400">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Net Early-Pay Arbitrage</span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-emerald-400">
            <CurrencyDisplay
              amount={treasury.net_30d_discount_savings_available}
              isDelta={true}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono border-t border-slate-800/80 pt-2 text-slate-400">
            <span>Gross Early Discount:</span>
            <span className="text-emerald-400">+$800.00 (INV-101)</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400 font-sans">
            LOC bridge interest: -$24.16 (7 days @ 10.5% APR)
          </p>
        </Card>

        {/* KPI 4: Security & Policy Blocks */}
        <Card className="border-l-4 border-l-crimson-500">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Active Policy Blocks</span>
            <ShieldAlert className="w-3.5 h-3.5 text-crimson-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-crimson-400">
            {securityBlockedCount + quarantinedCount}{' '}
            <span className="text-sm font-normal text-slate-400 font-sans">Flagged Invoices</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-mono border-t border-slate-800/80 pt-2 text-slate-400">
            <span>ASI01 / IBAN Swap:</span>
            <span className="text-crimson-400 font-bold">{securityBlockedCount} Critical</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400 font-sans">
            {quarantinedCount} PO/GRN quantity & missing GRN discrepancies
          </p>
        </Card>
      </div>

      {/* Interactive 30-Day Cash Trajectory & Reserve Floor Chart */}
      <Card
        title="30-Day Liquidity Trajectory & Payroll Reserve Floor Stress Test"
        subtitle="Comparing unoptimized early-pay deficit against LedgerGuard-SME bridge financing optimizer"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('liquidity')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1"
            >
              <span>View Liquidity Breakdown</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        }
      >
        <TrajectoryChart
          data={treasury.daily_cash_trajectory}
          payrollFloor={treasury.payroll_reserve_floor}
        />

        {/* Analytical Explanation of the Trajectory */}
        <div className="mt-4 p-4 rounded-lg bg-slate-950/70 border border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-crimson-400 font-semibold font-mono">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Unoptimized Path Risk (Red Dashed Line):</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              If the SME captures the 2% discount on <code className="text-slate-200 font-mono">INV-101</code> ($39,200.00) on Day 10 from cash-on-hand, the subsequent mandatory payroll run on Day 15 ($39,200.00) drops operating cash to <strong>$38,000.00</strong>—breaching the <strong>$50,000.00 payroll reserve floor</strong> by $12,000.00 until customer receivables land on Day 22.
            </p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold font-mono">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>LedgerGuard-SME Solution (Emerald Solid Line):</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              The deterministic LP optimizer pairs the Day-10 early payment with a <strong>7-day $12,000.00 bridge draw</strong> on facility <code className="text-indigo-300 font-mono">LOC-WEBANK-SME-01</code> (Day 15 to Day 22). Cash balance never drops below <strong>$50,000.00</strong>, interest cost is only <strong>$24.16</strong>, and net profit is <strong>+$775.84</strong>.
            </p>
          </div>
        </div>
      </Card>

      {/* SME Credit Facility Matcher Table */}
      <Card
        title="SME Credit Facility Evaluation & Covenant Compliance"
        subtitle="Comparing approved credit facilities against balance sheet covenants and drawdown costs"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans" data-testid="facilities-table">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[11px]">
                <th className="py-2.5 px-3">Facility Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Limit</th>
                <th className="py-2.5 px-3 text-right">Available</th>
                <th className="py-2.5 px-3 text-right">APR</th>
                <th className="py-2.5 px-3">Covenant Check</th>
                <th className="py-2.5 px-3">Optimizer Selection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {treasury.credit_facilities.map((fac) => (
                <tr
                  key={fac.facility_id}
                  className={`hover:bg-slate-850/50 transition-colors ${
                    fac.recommended_by_optimizer ? 'bg-emerald-950/20' : ''
                  }`}
                  data-testid={`facility-row-${fac.facility_id}`}
                >
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-200">{fac.name}</div>
                    <div className="text-[10px] font-mono text-slate-400">{fac.facility_id}</div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-300">
                    {fac.facility_type === 'REVOLVING_LOC' && 'Revolving Credit Line'}
                    {fac.facility_type === 'DYNAMIC_DISCOUNTING_SCF' && 'Dynamic SCF'}
                    {fac.facility_type === 'SHORT_TERM_LOAN' && 'Short-Term Loan'}
                  </td>
                  <td className="py-3 px-3 text-right font-mono">
                    <CurrencyDisplay amount={fac.credit_limit} />
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-400">
                    <CurrencyDisplay amount={fac.available_capacity} />
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-200 font-semibold">
                    {fac.apr_pct}%
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-slate-300">
                        CR {fac.current_ratio_actual} ≥ {fac.covenant_current_ratio_min}
                      </span>
                      <span className="text-emerald-400 font-semibold">[PASS]</span>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    {fac.recommended_by_optimizer ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 border border-emerald-600 font-mono text-[11px] font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        RECOMMENDED (LOWEST COST)
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono text-[11px]">Alternate</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
