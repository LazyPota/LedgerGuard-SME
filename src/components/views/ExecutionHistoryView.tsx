import React, { useState } from 'react';
import { ExecutionReceipt } from '@/contracts/ledgerGuardContract';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { Card } from '../common/Card';
import { formatHash } from '@/utils/formatters';
import {
  Receipt,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Server,
  ArrowRight,
} from 'lucide-react';

interface ExecutionHistoryViewProps {
  executions: ExecutionReceipt[];
  onNavigateToAudit: (traceId: string) => void;
  onRefreshData: () => Promise<void>;
}

export const ExecutionHistoryView: React.FC<ExecutionHistoryViewProps> = ({
  executions,
  onNavigateToAudit,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filteredExecutions = executions.filter((rec) => {
    if (filterStatus === 'SIMULATED_EXECUTED') return rec.status === 'SIMULATED_EXECUTED';
    if (filterStatus === 'IDEMPOTENT_REPLAY') return rec.status === 'IDEMPOTENT_REPLAY_NOOP';
    if (filterStatus === 'FAILED_ROLLBACK') return rec.status === 'FAILED_ROLLED_BACK';
    return true;
  });

  return (
    <div className="space-y-6" data-testid="execution-history-view">
      {/* Non-Negotiable Operational Honesty Banner */}
      <div className="p-4 rounded-lg bg-indigo-950/40 border border-indigo-700/80 flex items-start gap-3">
        <Server className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase text-indigo-300">
              OPERATIONAL ENVIRONMENT NOTICE: SANDBOX SIMULATION LEDGER
            </span>
            <span className="px-1.5 py-0.2 rounded bg-indigo-900 border border-indigo-500 text-[10px] font-mono text-indigo-200">
              ACID SQLITE
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed font-sans">
            Transactions committed below reflect <strong>local sandbox ledger mutations</strong> with atomic post-state invariant checks. In compliance with Rule 4 (Strict Operational State Honesty), these vouchers are <strong>never represented as live external bank transfers</strong>.
          </p>
        </div>
      </div>

      {/* Filter Bar & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 p-3.5 rounded-lg border border-slate-800">
        <div className="flex items-center gap-2 text-xs font-mono">
          <Receipt className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-slate-200 uppercase">
            Committed Sandbox Receipts ({executions.length} Total)
          </span>
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          {[
            { id: 'ALL', label: `All (${executions.length})` },
            { id: 'SIMULATED_EXECUTED', label: 'Executed' },
            { id: 'IDEMPOTENT_REPLAY', label: 'Idempotent Replays' },
            { id: 'FAILED_ROLLBACK', label: 'Rollbacks' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterStatus(pill.id)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                filterStatus === pill.id
                  ? 'bg-emerald-600 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Receipts Table */}
      <Card
        title="ACID Sandbox Ledger Execution Journal"
        subtitle="Cryptographically trace every disbursement, credit draw, and idempotency replay key"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono" data-testid="executions-table">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px]">
                <th className="py-2.5 px-3">Receipt / Execution ID</th>
                <th className="py-2.5 px-3">Invoice & Rail</th>
                <th className="py-2.5 px-3 text-right">Pre Cash</th>
                <th className="py-2.5 px-3 text-right">Disbursed</th>
                <th className="py-2.5 px-3 text-right">Credit Draw</th>
                <th className="py-2.5 px-3 text-right">Post Cash</th>
                <th className="py-2.5 px-3">Invariant Check</th>
                <th className="py-2.5 px-3">Status Badge</th>
                <th className="py-2.5 px-3 text-center">Audit Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredExecutions.map((rec) => {
                const isSuccess = rec.status === 'SIMULATED_EXECUTED';
                const isIdempotent = rec.status === 'IDEMPOTENT_REPLAY_NOOP';
                const isRollback = rec.status === 'FAILED_ROLLED_BACK';

                return (
                  <tr
                    key={rec.execution_id + rec.idempotency_key}
                    className="hover:bg-slate-850/60 transition-colors"
                    data-testid={`execution-row-${rec.execution_id}`}
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-100">{rec.execution_id}</div>
                      <div className="text-[10px] text-slate-500 font-sans">
                        {rec.executed_at_utc.replace('T', ' ').slice(0, 19)} UTC
                      </div>
                    </td>

                    <td className="py-3 px-3 font-sans">
                      <div className="font-semibold text-slate-200">{rec.invoice_id}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        ENV: {rec.execution_environment}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right text-slate-300">
                      <CurrencyDisplay amount={rec.pre_execution_cash_balance} />
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-slate-100">
                      {parseFloat(rec.disbursed_amount) > 0 ? (
                        <span className="text-crimson-400">
                          -<CurrencyDisplay amount={rec.disbursed_amount} />
                        </span>
                      ) : (
                        '$0.00'
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {rec.credit_draw_execution_id ? (
                        <div className="text-indigo-300 font-semibold">
                          <div>+<CurrencyDisplay amount={rec.credit_drawn_amount} /></div>
                          <div className="text-[9px] text-indigo-400">{rec.credit_draw_execution_id}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-bold text-emerald-400">
                      <CurrencyDisplay amount={rec.post_execution_cash_balance} />
                    </td>

                    <td className="py-3 px-3">
                      {rec.post_state_invariant_verified ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>PASS (ACID)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-crimson-400 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>FAIL</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {isSuccess && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 text-[10px] font-bold">
                          SIMULATED EXECUTED
                        </span>
                      )}
                      {isIdempotent && (
                        <span className="px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700 text-[10px] font-semibold flex items-center gap-1 w-fit">
                          <RotateCcw className="w-3 h-3" />
                          IDEMPOTENT REPLAY
                        </span>
                      )}
                      {isRollback && (
                        <span className="px-2 py-0.5 rounded-full bg-crimson-950 text-crimson-300 border border-crimson-700 text-[10px] font-bold">
                          ATOMIC ROLLBACK
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => onNavigateToAudit(rec.decision_envelope_trace_id)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-100 text-[11px] inline-flex items-center gap-1 transition-colors"
                        title="Inspect Decision Envelope in Audit Trail"
                      >
                        <span>{formatHash(rec.decision_envelope_trace_id, 8, 4)}</span>
                        <ArrowRight className="w-3 h-3 text-indigo-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredExecutions.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 font-mono text-xs">
                    No transactions matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
