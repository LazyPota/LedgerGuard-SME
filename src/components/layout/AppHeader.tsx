import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  RotateCcw,
  Server,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { apiClient } from '@/services/apiClient';
import { ExecutionMode, VerifyChainResponse } from '@/contracts/ledgerGuardContract';

interface AppHeaderProps {
  onBatchReset: () => void;
  isResetting?: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onBatchReset,
  isResetting = false,
}) => {
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(
    apiClient.getExecutionMode()
  );
  const [chainVerification, setChainVerification] = useState<VerifyChainResponse | null>(null);
  const [isVerifyingChain, setIsVerifyingChain] = useState<boolean>(false);

  useEffect(() => {
    const unsub = apiClient.onModeChange((newMode) => {
      setExecutionMode(newMode);
    });
    // Check initial chain integrity
    apiClient.verifyAuditChain().then((res) => setChainVerification(res));
    return unsub;
  }, []);

  const handleToggleMode = () => {
    const newMode: ExecutionMode =
      executionMode === 'OFFLINE_DETERMINISTIC_MOCK'
        ? 'LIVE_BACKEND_SANDBOX'
        : 'OFFLINE_DETERMINISTIC_MOCK';
    apiClient.setExecutionMode(newMode);
  };

  const handleVerifyChain = async () => {
    setIsVerifyingChain(true);
    try {
      const res = await apiClient.verifyAuditChain();
      setChainVerification(res);
    } finally {
      setIsVerifyingChain(false);
    }
  };

  const isMock = executionMode === 'OFFLINE_DETERMINISTIC_MOCK';

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between z-20 shrink-0">
      {/* Brand & Mission Title */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center shadow-md shadow-emerald-950/40">
            <ShieldCheck className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 tracking-tight text-base">
                LedgerGuard<span className="text-emerald-400">-SME</span>
              </span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/80 rounded">
                TOPIC E
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-sans hidden sm:block">
              Autonomous AP Verification & Working-Capital Copilot
            </p>
          </div>
        </div>
      </div>

      {/* Center/Right Operational Status & Controls */}
      <div className="flex items-center gap-3">
        {/* Environment Pill (Clickable toggle between Mock and Live Backend) */}
        <button
          onClick={handleToggleMode}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-mono transition-all ${
            isMock
              ? 'bg-indigo-950/70 border-indigo-700/80 text-indigo-200 hover:bg-indigo-900/60'
              : 'bg-emerald-950/70 border-emerald-600 text-emerald-200 hover:bg-emerald-900/60'
          }`}
          title="Click to toggle between Offline Deterministic Demo Fixture and Live Backend Sandbox"
          data-testid="environment-pill"
        >
          {isMock ? (
            <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          ) : (
            <Server className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold">
            {isMock
              ? 'DEMO FIXTURE ADAPTER (Offline Mode)'
              : 'SANDBOX SIMULATION LEDGER (FastAPI/SQLite)'}
          </span>
          <span className="text-[10px] bg-slate-900/80 px-1.5 py-0.2 rounded text-slate-400 border border-slate-700">
            Switch
          </span>
        </button>

        {/* Audit Chain Verifier Pill */}
        <button
          onClick={handleVerifyChain}
          disabled={isVerifyingChain}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-700/80 bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-mono transition-colors"
          title="Verify cryptographic SHA-256 hash continuity across decision envelopes"
          data-testid="audit-chain-pill"
        >
          {chainVerification?.valid ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          )}
          <span>
            SHA-256 Audit Chain:{' '}
            <strong className="text-emerald-400">
              {chainVerification?.valid
                ? `VALID (${chainVerification.envelopes_checked} Envelopes)`
                : 'CHECKING'}
            </strong>
          </span>
        </button>

        {/* Demo Batch Reset Button */}
        <button
          onClick={onBatchReset}
          disabled={isResetting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs font-sans shadow-sm transition-all disabled:opacity-50"
          title="Reset and replay the full 5-invoice SME competition benchmark scenarios"
          data-testid="reset-batch-btn"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Reset & Run Demo Batch</span>
          <span className="sm:hidden">Reset</span>
          <Sparkles className="w-3 h-3 text-slate-950/70" />
        </button>
      </div>
    </header>
  );
};
