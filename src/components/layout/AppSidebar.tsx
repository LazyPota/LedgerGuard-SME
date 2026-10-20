import React from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  GitCompare,
  AlertOctagon,
  TrendingUp,
  UserCheck,
  Receipt,
  Binary,
  ShieldAlert,
} from 'lucide-react';

export type ActiveViewId =
  | 'overview'
  | 'intake'
  | 'three_way_match'
  | 'discrepancy'
  | 'liquidity'
  | 'approval'
  | 'executions'
  | 'audit'
  | 'security_diagnostics';

interface AppSidebarProps {
  activeView: ActiveViewId;
  onSelectView: (view: ActiveViewId) => void;
  counts: {
    totalInvoices: number;
    quarantinedCount: number;
    securityBlockedCount: number;
    pendingApprovalCount: number;
    executedCount: number;
  };
}

interface NavItem {
  id: ActiveViewId;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeVariant?: 'neutral' | 'amber' | 'crimson' | 'emerald' | 'indigo';
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeView,
  onSelectView,
  counts,
}) => {
  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: 'Overview & 30d Cash',
      sublabel: 'Cash floor & financing optimizer',
      icon: LayoutDashboard,
    },
    {
      id: 'intake',
      label: 'Invoice Intake & Queue',
      sublabel: 'Batch ingestion & extracted fields',
      icon: FileSpreadsheet,
      badge: counts.totalInvoices,
      badgeVariant: 'neutral',
    },
    {
      id: 'three_way_match',
      label: '3-Way Match Matrix',
      sublabel: 'PO vs GRN vs Invoice audit',
      icon: GitCompare,
    },
    {
      id: 'discrepancy',
      label: 'Discrepancy & Fraud',
      sublabel: 'Debit notes & ASI01 quarantine',
      icon: AlertOctagon,
      badge: counts.quarantinedCount + counts.securityBlockedCount,
      badgeVariant: counts.securityBlockedCount > 0 ? 'crimson' : 'amber',
    },
    {
      id: 'liquidity',
      label: 'Early Pay & Liquidity',
      sublabel: '2/10 Net-30 yield & bridge loan',
      icon: TrendingUp,
    },
    {
      id: 'approval',
      label: 'HITL Approval Queue',
      sublabel: 'Permission Tiers 0–4 & sign-off',
      icon: UserCheck,
      badge: counts.pendingApprovalCount,
      badgeVariant: 'amber',
    },
    {
      id: 'executions',
      label: 'Sandbox Transactions',
      sublabel: 'Committed ledger receipts',
      icon: Receipt,
      badge: counts.executedCount,
      badgeVariant: 'emerald',
    },
    {
      id: 'audit',
      label: 'Forensic Audit Trail',
      sublabel: 'SHA-256 decision envelopes (Gt)',
      icon: Binary,
    },
    {
      id: 'security_diagnostics',
      label: 'Security & Rollback',
      sublabel: 'Atomic rollback diagnostic (TC-05)',
      icon: ShieldAlert,
    },
  ];

  return (
    <aside className="w-64 bg-slate-900/95 border-r border-slate-800 flex flex-col shrink-0">
      <div className="p-3">
        <div className="px-3 py-2 text-[11px] font-mono font-semibold tracking-wider text-slate-400 uppercase">
          Operations & Control
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            let badgeClass = 'bg-slate-800 text-slate-400';
            if (item.badgeVariant === 'amber') {
              badgeClass = 'bg-amber-950 text-amber-300 border border-amber-800/80';
            } else if (item.badgeVariant === 'crimson') {
              badgeClass = 'bg-crimson-950 text-crimson-300 border border-crimson-700 font-bold';
            } else if (item.badgeVariant === 'emerald') {
              badgeClass = 'bg-emerald-950 text-emerald-300 border border-emerald-800/80';
            } else if (item.badgeVariant === 'indigo') {
              badgeClass = 'bg-indigo-950 text-indigo-300 border border-indigo-800/80';
            }

            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                  isActive
                    ? 'bg-slate-800 text-slate-100 font-medium border border-slate-700/80 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                }`}
                data-testid={`nav-item-${item.id}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs truncate">{item.label}</div>
                    <div className="text-[10px] text-slate-400 truncate font-sans">
                      {item.sublabel}
                    </div>
                  </div>
                </div>

                {item.badge !== undefined &&
                  (typeof item.badge === 'number' ? item.badge > 0 : Boolean(item.badge)) && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full shrink-0 ${badgeClass}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info Box */}
      <div className="mt-auto p-4 border-t border-slate-800/80 bg-slate-950/40 text-[11px] text-slate-400">
        <div className="flex items-center justify-between text-[10px] font-mono mb-1">
          <span>OPERATOR SESSION</span>
          <span className="text-emerald-400">ACTIVE</span>
        </div>
        <p className="leading-tight text-slate-400">
          Enforcing strict Zero Frontend Arithmetic & OWASP ASI01 isolation.
        </p>
      </div>
    </aside>
  );
};
