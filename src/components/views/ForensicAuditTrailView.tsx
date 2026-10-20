import React, { useState } from 'react';
import {
  ForensicDecisionEnvelope,
  VerifyChainResponse,
  ExecutionReceipt,
} from '@/contracts/ledgerGuardContract';
import { apiClient } from '@/services/apiClient';
import { formatHash } from '@/utils/formatters';
import {
  Binary,
  CheckCircle2,
  AlertTriangle,
  Download,
  Link,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface ForensicAuditTrailViewProps {
  envelopes: ForensicDecisionEnvelope[];
  executions: ExecutionReceipt[];
  targetTraceId?: string;
}

export const ForensicAuditTrailView: React.FC<ForensicAuditTrailViewProps> = ({
  envelopes,
  executions,
  targetTraceId,
}) => {
  const [verificationResult, setVerificationResult] = useState<VerifyChainResponse | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(targetTraceId || null);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await apiClient.verifyAuditChain();
      setVerificationResult(res);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportExecutionLog = () => {
    const jsonlContent = executions
      .map((item) => JSON.stringify(item))
      .join('\n');
    downloadFile(jsonlContent, 'sandbox_execution_log.jsonl', 'application/x-ndjson');
  };

  const handleExportAuditLog = () => {
    const jsonlContent = envelopes
      .map((item) => JSON.stringify(item))
      .join('\n');
    downloadFile(jsonlContent, 'forensic_audit_log.jsonl', 'application/x-ndjson');
  };

  const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" data-testid="forensic-audit-trail-view">
      {/* Top Controls: Verification & JSONL Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-4 rounded-lg border border-slate-800">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Binary className="w-4 h-4 text-emerald-400" />
            <span>Cryptographic Decision Envelopes ($G_t$) & Hash Chain</span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono text-xs">
              {envelopes.length} Envelopes
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable SHA-256 state transitions guaranteeing non-repudiation for audit and competition scoring
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Live Hash Chain Verifier Button */}
          <button
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-mono shadow transition-colors disabled:opacity-50"
            data-testid="verify-chain-btn"
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>Verify SHA-256 Chain</span>
          </button>

          {/* Export JSONL Buttons */}
          <button
            onClick={handleExportAuditLog}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono transition-colors"
            data-testid="export-audit-jsonl-btn"
            title="Download forensic_audit_log.jsonl deliverable"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export forensic_audit_log.jsonl</span>
          </button>

          <button
            onClick={handleExportExecutionLog}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono transition-colors"
            data-testid="export-execution-jsonl-btn"
            title="Download sandbox_execution_log.jsonl deliverable"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export sandbox_execution_log.jsonl</span>
          </button>
        </div>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-4 rounded-lg border font-mono text-xs space-y-2 ${
            verificationResult.valid
              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
              : 'bg-crimson-950/80 border-crimson-600 text-crimson-200'
          }`}
          data-testid="verification-result-banner"
        >
          <div className="flex items-center justify-between font-bold text-sm">
            <span className="flex items-center gap-2">
              {verificationResult.valid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-crimson-400" />
              )}
              {verificationResult.message}
            </span>
            <span className="text-xs bg-black/40 px-2 py-0.5 rounded">
              Status: {verificationResult.valid ? 'VALIDATED' : 'TAMPER_DETECTED'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-emerald-800/60 text-[11px] text-slate-300">
            <div>
              Genesis Hash ($G_0$):{' '}
              <strong className="text-indigo-300 font-mono">
                {formatHash(verificationResult.genesis_hash, 16, 8)}
              </strong>
            </div>
            <div>
              Latest Head Hash ($G_t$):{' '}
              <strong className="text-emerald-300 font-mono">
                {formatHash(verificationResult.latest_hash, 16, 8)}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Hash-Chained Timeline of Decision Envelopes */}
      <div className="space-y-4">
        {envelopes.map((env, index) => {
          const isExpanded = expandedTraceId === env.trace_id;
          const isGenesis = index === 0;

          return (
            <div
              key={env.trace_id}
              className={`rounded-lg border bg-slate-900 transition-all ${
                env.opa_policy_verdict === 'ALLOW' || env.opa_policy_verdict === 'ALLOW_WITH_VALID_HUMAN_SIGNATURE'
                  ? 'border-slate-800'
                  : 'border-crimson-800/80 bg-crimson-950/20'
              }`}
              data-testid={`envelope-card-${env.trace_id}`}
            >
              {/* Header Row */}
              <div
                onClick={() => setExpandedTraceId(isExpanded ? null : env.trace_id)}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-slate-850/50 transition-colors"
                data-testid={`envelope-header-${env.trace_id}`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-mono text-xs font-bold text-slate-300">
                    G{index}
                  </span>

                  <div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-slate-100 text-xs">{env.trace_id}</span>
                      <span className="text-[10px] text-slate-400">
                        {env.timestamp_utc.replace('T', ' ').slice(0, 19)} UTC
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                      <span>Actor: <strong className="text-slate-300">{env.actor_identity}</strong></span>
                      <span>•</span>
                      <span>Tier: <strong className="text-indigo-300">{env.permission_tier}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      env.opa_policy_verdict.startsWith('ALLOW')
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                        : 'bg-crimson-950 text-crimson-300 border-crimson-700'
                    }`}
                  >
                    {env.opa_policy_verdict}
                  </span>

                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Cryptographic Hash Chaining Link Strip */}
              <div className="px-4 py-2 bg-slate-950/80 border-t border-b border-slate-800/80 font-mono text-[10px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 truncate max-w-sm">
                  <Link className="w-3 h-3 text-slate-500 shrink-0" />
                  <span>Prev:</span>
                  <span className="text-slate-300 truncate">
                    {isGenesis ? '00000000000000000000000000000000 (GENESIS)' : env.previous_envelope_hash}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 truncate max-w-sm">
                  <span>Curr:</span>
                  <span className="text-emerald-400 font-bold truncate">
                    {env.current_envelope_hash}
                  </span>
                </div>
              </div>

              {/* Expanded JSON Inspector */}
              {isExpanded && (
                <div className="p-4 space-y-3 bg-slate-950 border-t border-slate-800 text-xs font-mono">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Input Document SHA-256</span>
                      <span className="text-slate-200 select-all">{env.input_document_sha256}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Envelope Schema Version</span>
                      <span className="text-slate-200">{env.envelope_version}</span>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-850">
                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">3-Way Match Summary Payload</span>
                      <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto">
                        {JSON.stringify(env.three_way_match_summary, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Working Capital Optimization Summary</span>
                      <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto">
                        {JSON.stringify(env.working_capital_optimization_summary, null, 2)}
                      </pre>
                    </div>

                    <div>
                      <span className="text-slate-400 text-[10px] block uppercase">Sandbox Execution Verification Proof</span>
                      <pre className="p-2.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto">
                        {JSON.stringify(env.sandbox_execution_verification, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
