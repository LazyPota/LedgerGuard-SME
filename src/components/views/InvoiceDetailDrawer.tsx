import React from 'react';
import { InvoiceRecord } from '@/contracts/ledgerGuardContract';
import { Drawer } from '../common/Drawer';
import { OperationalStateBadge } from '../common/OperationalStateBadge';
import { PermissionTierBadge } from '../common/PermissionTierBadge';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { UntrustedDocumentField } from '../common/UntrustedDocumentField';
import { formatDate, formatHash } from '@/utils/formatters';
import {
  Building,
  Layers,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';

interface InvoiceDetailDrawerProps {
  invoice: InvoiceRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateTo3WayMatch: (invoiceId: string) => void;
  onNavigateToDiscrepancy: (invoiceId: string) => void;
  onNavigateToApproval: (invoiceId: string) => void;
}

export const InvoiceDetailDrawer: React.FC<InvoiceDetailDrawerProps> = ({
  invoice,
  isOpen,
  onClose,
  onNavigateTo3WayMatch,
  onNavigateToDiscrepancy,
  onNavigateToApproval,
}) => {
  if (!invoice) return null;

  const ext = invoice.extraction;
  const match = invoice.three_way_match;
  const isQuarantined =
    invoice.operational_state === 'BLOCKED_DISCREPANCY' ||
    invoice.operational_state === 'BLOCKED_SECURITY_VIOLATION';
  const isEligibleApproval =
    invoice.operational_state === 'PENDING_HITL_TIER_3' ||
    invoice.operational_state === 'STAGED_TIER_2_ELIGIBLE';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={`Invoice Inspector — ${invoice.invoice_number}`}
      subtitle={`Document SHA-256: ${formatHash(invoice.document_sha256, 12, 8)}`}
      width="2xl"
    >
      <div className="space-y-6 text-xs font-sans" data-testid="invoice-detail-drawer">
        {/* Status & Tier Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-850 border border-slate-800">
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
              Operational Lifecycle State
            </span>
            <OperationalStateBadge state={invoice.operational_state} size="md" />
          </div>
          <div>
            <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
              Permission Boundary
            </span>
            <PermissionTierBadge tier={invoice.permission_tier} />
          </div>
        </div>

        {/* Financial Header Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 font-mono">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Total Claimed</span>
            <span className="text-base font-bold text-slate-100">
              <CurrencyDisplay amount={ext.total_claimed} />
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Net Due Date</span>
            <span className="text-slate-200 font-semibold">{formatDate(ext.net_due_date)}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Discount Terms</span>
            <span className="text-emerald-400 font-semibold">
              {ext.early_discount_pct !== '0.00'
                ? `${ext.early_discount_pct}% / ${ext.early_discount_days}d`
                : 'None (Net 30)'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase">Referenced PO</span>
            <span className="text-indigo-300 font-semibold">{ext.referenced_po_id || '—'}</span>
          </div>
        </div>

        {/* Counterparty & Vendor Master Attestation */}
        <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-slate-200 font-semibold border-b border-slate-800 pb-2">
            <Building className="w-4 h-4 text-emerald-400" />
            <span>Counterparty & Vendor Master Verification</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[11px] text-slate-400 block">Claimed Legal Entity:</span>
              <span className="font-medium text-slate-200">{ext.vendor_name_claimed}</span>
              <span className="font-mono text-[10px] text-slate-400 block">ID: {ext.vendor_id_claimed}</span>
            </div>

            <div>
              <span className="text-[11px] text-slate-400 block">Immutable Vendor Master Match:</span>
              <span className="font-medium text-slate-200">{match.vendor_master_check.legal_name}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {match.vendor_master_check.iban_exact_match ? (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    IBAN Match: {match.vendor_master_check.approved_iban_masked}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-mono text-crimson-400 font-bold bg-crimson-950/60 px-1.5 py-0.5 rounded border border-crimson-800">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    IBAN MISMATCH! Claimed: {ext.iban_claimed} vs Approved: {match.vendor_master_check.approved_iban_masked}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Line Items & AI Semantic SKU Mapping Table */}
        <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-slate-200 font-semibold">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Extracted Line Items & Semantic Unit Mappings</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {ext.line_items.length} line item(s)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                  <th className="py-2 px-2">Billed Description</th>
                  <th className="py-2 px-2">Mapped PO SKU</th>
                  <th className="py-2 px-2 text-right">Multiplier</th>
                  <th className="py-2 px-2 text-right">Qty</th>
                  <th className="py-2 px-2 text-right">Unit Price</th>
                  <th className="py-2 px-2 text-right">Line Total</th>
                  <th className="py-2 px-2 text-center">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {ext.line_items.map((line) => (
                  <tr key={line.line_id} className="hover:bg-slate-850/40 font-mono">
                    <td className="py-2.5 px-2 font-sans text-slate-200">
                      <div>{line.raw_description}</div>
                      <div className="text-[10px] text-slate-400 font-mono">ID: {line.line_id}</div>
                    </td>
                    <td className="py-2.5 px-2 text-indigo-300 font-semibold">
                      {line.mapped_po_sku}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-400">
                      {line.unit_conversion_multiplier}x
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300">
                      {line.quantity_billed}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-300">
                      <CurrencyDisplay amount={line.unit_price_billed} />
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-100 font-semibold">
                      <CurrencyDisplay amount={line.line_total_billed} />
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-semibold">
                        {(line.mapping_confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* OWASP ASI01 Isolated Monospace Document Field */}
        <div>
          <UntrustedDocumentField
            value={ext.raw_untrusted_memo}
            label="Raw Extracted Document Memo (ASI01 Monospace Sandbox)"
            isSuspicious={ext.suspicious_instructions_detected}
            securityNote={
              ext.suspicious_instructions_detected
                ? 'CRITICAL OWASP ASI01 ALERT: Memo contains instruction override / IBAN reroute commands. Stripped and quarantined from solver execution.'
                : 'Escaped plain text. HTML tags and code blocks rendered harmlessly.'
            }
          />
        </div>

        {/* Quick Navigation Action Buttons */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={() => onNavigateTo3WayMatch(invoice.invoice_id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
          >
            <span>Inspect 3-Way Match</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          {isQuarantined && (
            <button
              onClick={() => onNavigateToDiscrepancy(invoice.invoice_id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-amber-950 hover:bg-amber-900 border border-amber-600 text-amber-200 font-semibold text-xs transition-colors"
            >
              <span>Review Discrepancy / Fraud</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {isEligibleApproval && (
            <button
              onClick={() => onNavigateToApproval(invoice.invoice_id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow transition-colors"
            >
              <span>Open HITL Sign-off</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
};
