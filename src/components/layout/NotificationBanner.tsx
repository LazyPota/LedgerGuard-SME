import React from 'react';
import { AlertTriangle, ShieldAlert, Info, X } from 'lucide-react';
import { ApiErrorEnvelope } from '@/contracts/ledgerGuardContract';

interface NotificationBannerProps {
  error: ApiErrorEnvelope | null;
  onDismiss: () => void;
}

export const NotificationBanner: React.FC<NotificationBannerProps> = ({
  error,
  onDismiss,
}) => {
  if (!error) return null;

  const isCritical = error.severity === 'CRITICAL_SECURITY';
  const isError = error.severity === 'ERROR';

  let borderClass = 'border-amber-600 bg-amber-950/80 text-amber-200';
  let icon = <Info className="w-5 h-5 text-amber-400 shrink-0" />;

  if (isCritical) {
    borderClass = 'border-crimson-600 bg-crimson-950 text-crimson-200';
    icon = <ShieldAlert className="w-5 h-5 text-crimson-400 shrink-0" />;
  } else if (isError) {
    borderClass = 'border-crimson-700/80 bg-slate-900 text-slate-200';
    icon = <AlertTriangle className="w-5 h-5 text-crimson-400 shrink-0" />;
  }

  return (
    <div
      className={`mx-6 mt-4 p-4 rounded-lg border flex items-start justify-between gap-3 shadow-lg ${borderClass}`}
      data-testid="notification-banner"
      role="alert"
    >
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase tracking-wider">
              [{error.error_code}]
            </span>
            <span className="text-sm font-semibold">{error.message}</span>
          </div>

          <div className="mt-2 text-xs flex flex-wrap gap-x-4 gap-y-1 font-mono text-slate-300">
            <span>
              Trace ID: <strong className="text-indigo-300">{error.trace_id}</strong>
            </span>
            {error.violated_policy_rule && (
              <span>
                Violated Policy:{' '}
                <strong className="text-amber-300">{error.violated_policy_rule}</strong>
              </span>
            )}
            <span>
              Recoverable: <strong>{error.recoverable ? 'YES' : 'NO'}</strong>
            </span>
          </div>

          {error.suggested_operator_action && (
            <p className="mt-2 text-xs font-sans text-slate-300 bg-black/30 p-2 rounded border border-white/10">
              <span className="font-semibold text-amber-400">Operator Remediation: </span>
              {error.suggested_operator_action}
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onDismiss}
        className="p-1 text-slate-400 hover:text-slate-100 rounded transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
