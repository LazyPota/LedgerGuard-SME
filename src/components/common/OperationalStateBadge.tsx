import React from 'react';
import { OperationalState } from '@/contracts/ledgerGuardContract';

interface OperationalStateBadgeProps {
  state: OperationalState;
  className?: string;
  size?: 'sm' | 'md';
}

interface StateConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
}

const STATE_CONFIGS: Record<OperationalState, StateConfig> = {
  PROPOSED: {
    label: 'PROPOSED',
    badgeClass: 'bg-slate-800/80 text-slate-300 border-slate-700',
    dotClass: 'bg-slate-400',
  },
  STAGED_TIER_2_ELIGIBLE: {
    label: 'STAGED (TIER 2 ELIGIBLE)',
    badgeClass: 'bg-indigo-950/60 text-indigo-300 border-indigo-700/60',
    dotClass: 'bg-indigo-400 animate-pulse',
  },
  PENDING_HITL_TIER_3: {
    label: 'PENDING HITL (TIER 3)',
    badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-600/70',
    dotClass: 'bg-amber-400',
  },
  BLOCKED_DISCREPANCY: {
    label: 'BLOCKED: DISCREPANCY',
    badgeClass: 'bg-amber-950/80 text-amber-200 border-amber-600',
    dotClass: 'bg-amber-500',
  },
  BLOCKED_SECURITY_VIOLATION: {
    label: 'BLOCKED: SECURITY VIOLATION',
    badgeClass: 'bg-crimson-950 text-crimson-200 border-crimson-600 shadow-sm shadow-crimson-950',
    dotClass: 'bg-crimson-500 animate-ping',
  },
  APPROVED_AWAITING_EXECUTION: {
    label: 'APPROVED (AWAITING EXECUTION)',
    badgeClass: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60',
    dotClass: 'bg-emerald-400',
  },
  SIMULATED_EXECUTED: {
    label: 'SIMULATED EXECUTED [SANDBOX]',
    badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/80 font-mono',
    dotClass: 'bg-emerald-400',
  },
  EXTERNALLY_EXECUTED: {
    label: 'EXTERNALLY EXECUTED (RAIL)',
    badgeClass: 'bg-blue-950 text-blue-300 border-blue-500',
    dotClass: 'bg-blue-400',
  },
  FAILED_OR_ROLLED_BACK: {
    label: 'FAILED / ROLLED BACK (ATOMIC)',
    badgeClass: 'bg-crimson-950 text-crimson-300 border-crimson-700 font-mono',
    dotClass: 'bg-crimson-400',
  },
};

export const OperationalStateBadge: React.FC<OperationalStateBadgeProps> = ({
  state,
  className = '',
  size = 'md',
}) => {
  const config = STATE_CONFIGS[state] || {
    label: state,
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    dotClass: 'bg-slate-400',
  };

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs'
      : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-full ${config.badgeClass} ${sizeClasses} ${className}`}
      data-testid="operational-state-badge"
      data-state={state}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
      <span>{config.label}</span>
    </span>
  );
};
