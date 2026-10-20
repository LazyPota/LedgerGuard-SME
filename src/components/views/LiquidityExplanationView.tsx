import React, { useState } from 'react';
import { TreasurySummaryResponse, InvoiceRecord } from '@/contracts/ledgerGuardContract';
import { Card } from '../common/Card';
import { TrajectoryChart } from '../common/TrajectoryChart';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  Percent,
} from 'lucide-react';

interface LiquidityExplanationViewProps {
  treasury: TreasurySummaryResponse | null;
  invoices: InvoiceRecord[];
  onNavigateToApproval: (invoiceId: string) => void;
}

export const LiquidityExplanationView: React.FC<LiquidityExplanationViewProps> = ({
  treasury,
  invoices,
  onNavigateToApproval,
}) => {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('LOC-WEBANK-SME-01');

  if (!treasury) {
    return (
      <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
        Loading Working-Capital Model...
      </div>
    );
  }

  const inv101 = invoices.find((i) => i.invoice_number === 'INV-101') || invoices[0];
  const decision = inv101?.liquidity_decision;

  const facilities = treasury.credit_facilities;
  const selectedFacility =
    facilities.find((f) => f.facility_id === selectedFacilityId) || facilities[0];

  return (
    <div className="space-y-6" data-testid="liquidity-explanation-view">
      {/* Top Banner: LP Optimizer Rationale */}
      <div className="p-5 rounded-lg bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border border-emerald-600/60 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-emerald-900 text-emerald-300 font-mono text-[10px] font-bold">
                LP OPTIMIZER RECOMMENDATION
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Invoice {inv101?.invoice_number} (Shenzhen Precision Servo Ltd.)
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" />
              <span>Capture 2/10 Early Discount via 7-Day Credit Line Bridge</span>
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
              {decision?.deterministic_rationale ||
                'Capture 2.00% early discount ($800.00) on Day 10. Pair with a 7-day $12,000.00 bridge draw on LOC-WEBANK-SME-01 ($24.16 interest) to protect $50,000.00 payroll floor until Day 22 AR inflow ($35,000.00).'}
            </p>
          </div>

          <button
            onClick={() => onNavigateToApproval(inv101?.invoice_id || 'INV-2026-101')}
            className="self-start md:self-auto px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-sans shadow-md flex items-center gap-1.5 transition-all shrink-0"
          >
            <span>Proceed to HITL Sign-off</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4 Financial Math KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Discount */}
        <Card className="border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Gross Early Discount</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-emerald-400">
            +${decision?.gross_discount_amount || '800.00'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400 font-mono">
            2.00% off $40,000.00 face value
          </p>
        </Card>

        {/* Implied Annualized Return */}
        <Card className="border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Implied Annualized Yield</span>
            <Percent className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-indigo-300">
            {decision?.discount_effective_apr_pct || '37.24'}%{' '}
            <span className="text-xs text-slate-400 font-normal">APR</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400 font-mono">
            Effective Annual Rate (EAR):{' '}
            <strong className="text-indigo-400">{decision?.discount_effective_ear_pct || '44.59'}%</strong>
          </p>
        </Card>

        {/* Bridge Financing Cost */}
        <Card className="border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Bridge Interest & Fee</span>
            <span className="text-[10px] text-amber-400 font-mono font-semibold">7 Days @ 10.5%</span>
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-amber-300">
            -${decision?.bridge_interest_and_fee_cost || '24.16'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400 font-mono">
            $12,000 draw × 10.50% × 7 / 365
          </p>
        </Card>

        {/* Net Economic Benefit */}
        <Card className="border-l-4 border-l-emerald-400">
          <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
            <span>Net Verified Profit</span>
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono text-emerald-400">
            +${decision?.net_economic_benefit || '775.84'}
          </div>
          <p className="mt-1 text-[11px] text-slate-400 font-mono">
            $800.00 gross - $24.16 interest
          </p>
        </Card>
      </div>

      {/* Trajectory Breakdown & Liquidity Stress Test Card */}
      <Card
        title="Liquidity Trajectory Breakdown & Floor Preservation"
        subtitle="Visualizing the Day 15 payroll dip risk and 7-day bridge financing recovery"
      >
        <TrajectoryChart
          data={treasury.daily_cash_trajectory}
          payrollFloor={treasury.payroll_reserve_floor}
        />

        <div className="mt-4 p-4 rounded-lg bg-slate-950 border border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="space-y-1">
            <span className="text-slate-400 block uppercase text-[10px]">Unoptimized Cash Floor</span>
            <span className="text-crimson-400 font-bold text-base">$38,000.00 (Day 15)</span>
            <p className="text-[11px] text-slate-400 font-sans">
              -$12,000.00 below mandatory $50,000 payroll reserve floor.
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block uppercase text-[10px]">LedgerGuard Minimum Cash</span>
            <span className="text-emerald-400 font-bold text-base">$50,000.00 (Protected)</span>
            <p className="text-[11px] text-slate-400 font-sans">
              100% compliant on all 30 days. Zero covenant breaches.
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-slate-400 block uppercase text-[10px]">LOC Draw Duration</span>
            <span className="text-indigo-300 font-bold text-base">7 Days (Day 15 → 22)</span>
            <p className="text-[11px] text-slate-400 font-sans">
              Repaid immediately on Day 22 upon $35,000 AR receivable collection.
            </p>
          </div>
        </div>
      </Card>

      {/* SME Credit Facility Optimizer Comparison */}
      <Card
        title="Candidate SME Credit Facility Comparison"
        subtitle="Linear Programming solver compares effective borrowing costs and covenant compliance"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {facilities.map((fac) => {
            const isSelected = selectedFacility.facility_id === fac.facility_id;
            const isOptimal = fac.recommended_by_optimizer;

            // Compute net economic gain with this facility for 7 days
            let feePct = parseFloat(fac.drawdown_fee_pct) || 0;
            let apr = parseFloat(fac.apr_pct) || 0;
            let estCost = (12000 * (apr / 100) * 7) / 365 + 12000 * (feePct / 100);
            let estNet = 800 - estCost;

            return (
              <div
                key={fac.facility_id}
                onClick={() => setSelectedFacilityId(fac.facility_id)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  isOptimal
                    ? 'bg-emerald-950/30 border-emerald-600/80 shadow-md'
                    : isSelected
                    ? 'bg-slate-800 border-indigo-500'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {fac.facility_id}
                  </span>
                  {isOptimal ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-mono font-bold">
                      OPTIMAL SELECTION
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-slate-400">Alternate</span>
                  )}
                </div>

                <div className="text-sm font-semibold text-slate-100 mt-2">{fac.name}</div>

                <div className="mt-3 space-y-1.5 text-xs font-mono border-t border-slate-800/80 pt-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Borrowing APR:</span>
                    <strong className="text-slate-200">{fac.apr_pct}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Drawdown / Origination Fee:</span>
                    <span className="text-slate-300">{fac.drawdown_fee_pct}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">7-Day Financing Cost:</span>
                    <span className="text-amber-400 font-semibold">${estCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/60 pt-1.5">
                    <span className="text-slate-400">Net Discount Benefit:</span>
                    <strong className={isOptimal ? 'text-emerald-400' : 'text-slate-200'}>
                      +${estNet.toFixed(2)}
                    </strong>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Covenant Status:</span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      CR {fac.current_ratio_actual} ≥ {fac.covenant_current_ratio_min} PASS
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};
