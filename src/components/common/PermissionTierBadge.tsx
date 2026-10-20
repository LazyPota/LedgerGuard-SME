import React from 'react';
import { PermissionTier } from '@/contracts/ledgerGuardContract';

interface PermissionTierBadgeProps {
  tier: PermissionTier;
  className?: string;
}

const TIER_CONFIGS: Record<PermissionTier, { label: string; badgeClass: string }> = {
  TIER_0_READ: {
    label: 'TIER 0: READ-ONLY',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
  },
  TIER_1_STAGING: {
    label: 'TIER 1: STAGING',
    badgeClass: 'bg-slate-800/90 text-indigo-300 border-indigo-800',
  },
  TIER_2_BOUNDED_AUTO: {
    label: 'TIER 2: BOUNDED AUTO (≤$2.5k)',
    badgeClass: 'bg-indigo-950 text-indigo-300 border-indigo-600',
  },
  TIER_3_HITL_REQUIRED: {
    label: 'TIER 3: HITL REQUIRED',
    badgeClass: 'bg-amber-950 text-amber-300 border-amber-600 font-semibold',
  },
  TIER_4_FORBIDDEN: {
    label: 'TIER 4: FORBIDDEN',
    badgeClass: 'bg-crimson-950 text-crimson-300 border-crimson-600 font-bold',
  },
};

export const PermissionTierBadge: React.FC<PermissionTierBadgeProps> = ({
  tier,
  className = '',
}) => {
  const config = TIER_CONFIGS[tier] || {
    label: tier,
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono border rounded tracking-wide ${config.badgeClass} ${className}`}
      data-testid="permission-tier-badge"
      data-tier={tier}
    >
      {config.label}
    </span>
  );
};
