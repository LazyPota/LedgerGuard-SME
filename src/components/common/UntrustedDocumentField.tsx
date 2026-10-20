import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

interface UntrustedDocumentFieldProps {
  value: string;
  label?: string;
  isSuspicious?: boolean;
  securityNote?: string;
  className?: string;
}

/**
 * OWASP ASI01 & XSS Isolation Component.
 *
 * Renders raw invoice descriptions, vendor notes, payment memos, and OCR text
 * strictly as escaped plain text inside a visually demarcated container.
 * NEVER renders raw HTML, markdown tags, or dynamic evaluations.
 */
export const UntrustedDocumentField: React.FC<UntrustedDocumentFieldProps> = ({
  value,
  label = 'Raw Extracted Document Memo',
  isSuspicious = false,
  securityNote,
  className = '',
}) => {
  return (
    <div
      className={`rounded border text-xs font-mono transition-colors ${
        isSuspicious
          ? 'bg-crimson-950/40 border-crimson-600/80 text-crimson-200'
          : 'bg-slate-900 border-slate-700/80 text-slate-300'
      } ${className}`}
      data-testid="untrusted-document-field"
    >
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b text-[10px] uppercase tracking-wider font-sans font-medium ${
          isSuspicious
            ? 'bg-crimson-950/70 border-crimson-700/60 text-crimson-300'
            : 'bg-slate-850 border-slate-700/70 text-slate-400'
        }`}
      >
        <span className="flex items-center gap-1.5">
          {isSuspicious ? (
            <ShieldAlert className="w-3.5 h-3.5 text-crimson-400 shrink-0" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <span>{label}</span>
        </span>
        <span className="font-mono text-[9px] text-slate-400 bg-slate-950/60 px-1.5 py-0.5 rounded">
          {isSuspicious ? 'ASI01 ALERT' : 'ESCAPED PLAIN TEXT'}
        </span>
      </div>

      <div className="p-3 whitespace-pre-wrap break-words leading-relaxed select-text">
        {/* Rendered as plain text node only - never through dangerouslySetInnerHTML */}
        {value || '—'}
      </div>

      {(isSuspicious || securityNote) && (
        <div className="px-3 py-1.5 bg-slate-950/60 border-t border-slate-800 text-[11px] font-sans flex items-start gap-1.5 text-amber-300/90">
          <span className="font-semibold text-amber-400 uppercase text-[10px]">Policy Note:</span>
          <span>{securityNote || 'Suspicious instructions detected in document excerpt. Field quarantined from autonomous action.'}</span>
        </div>
      )}
    </div>
  );
};
