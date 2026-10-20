import React, { useState } from 'react';
import { InvoiceRecord } from '@/contracts/ledgerGuardContract';
import { CurrencyDisplay } from '../common/CurrencyDisplay';
import { OperationalStateBadge } from '../common/OperationalStateBadge';
import { PermissionTierBadge } from '../common/PermissionTierBadge';
import { Card } from '../common/Card';
import { Modal } from '../common/Modal';
import { formatDate } from '@/utils/formatters';
import {
  FilePlus2,
  Search,
  Filter,
  Eye,
  GitCompare,
  Upload,
  CheckCircle2,
  AlertOctagon,
  ShieldAlert,
} from 'lucide-react';

interface InvoiceIntakeListViewProps {
  invoices: InvoiceRecord[];
  onSelectInvoice: (invoice: InvoiceRecord) => void;
  onNavigateTo3WayMatch: (invoiceId: string) => void;
  onIngestBatch: () => Promise<void>;
  onIngestCustom: (payload: any) => Promise<void>;
  isIngesting?: boolean;
}

export const InvoiceIntakeListView: React.FC<InvoiceIntakeListViewProps> = ({
  invoices,
  onSelectInvoice,
  onNavigateTo3WayMatch,
  onIngestBatch,
  onIngestCustom,
  isIngesting = false,
}) => {
  const [filterState, setFilterState] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [customPayloadText, setCustomPayloadText] = useState<string>('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Filter and search
  const filteredInvoices = invoices.filter((inv) => {
    // Status filter
    if (filterState === 'VERIFIED') {
      const isVerified =
        inv.three_way_match.reconciliation_findings.overall_match_status === 'VERIFIED_ELIGIBLE' ||
        inv.operational_state === 'SIMULATED_EXECUTED';
      if (!isVerified) return false;
    } else if (filterState === 'DISCREPANCY') {
      if (inv.operational_state !== 'BLOCKED_DISCREPANCY') return false;
    } else if (filterState === 'SECURITY_BLOCKED') {
      if (inv.operational_state !== 'BLOCKED_SECURITY_VIOLATION') return false;
    } else if (filterState === 'PENDING_HITL') {
      if (inv.operational_state !== 'PENDING_HITL_TIER_3') return false;
    } else if (filterState === 'TIER_2_AUTO') {
      if (inv.operational_state !== 'STAGED_TIER_2_ELIGIBLE') return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = inv.invoice_number.toLowerCase().includes(q);
      const matchVendor = inv.extraction.vendor_name_claimed.toLowerCase().includes(q);
      const matchPO = inv.extraction.referenced_po_id.toLowerCase().includes(q);
      const matchSKU = inv.extraction.line_items.some((l) =>
        l.mapped_po_sku.toLowerCase().includes(q)
      );
      return matchNum || matchVendor || matchPO || matchSKU;
    }

    return true;
  });

  const handleCustomSubmit = async () => {
    setCustomError(null);
    try {
      let parsed = null;
      if (customPayloadText.trim()) {
        parsed = JSON.parse(customPayloadText);
      }
      await onIngestCustom(parsed);
      setIsCustomModalOpen(false);
      setCustomPayloadText('');
    } catch (err: any) {
      setCustomError(err.message || 'Invalid JSON format in payload');
    }
  };

  const handleLoadSampleCustom = () => {
    const sample = {
      vendor_name: 'Apex Precision Tools Ltd.',
      invoice_number: 'INV-CUSTOM-772',
      amount: '5000.00',
      po_id: 'PO-2026-CUSTOM',
      memo: 'Sample uploaded commercial invoice for bench testing.',
    };
    setCustomPayloadText(JSON.stringify(sample, null, 2));
  };

  return (
    <div className="space-y-6" data-testid="invoice-intake-view">
      {/* Top Action Bar & Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-4 rounded-lg border border-slate-800">
        {/* Left: Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="text-slate-400 mr-1 flex items-center gap-1 text-[11px] uppercase">
            <Filter className="w-3.5 h-3.5" />
            Filter:
          </span>
          {[
            { id: 'ALL', label: `All (${invoices.length})` },
            { id: 'VERIFIED', label: 'Verified' },
            { id: 'DISCREPANCY', label: 'Discrepancy (TC-02)' },
            { id: 'SECURITY_BLOCKED', label: 'Security Block (TC-04)' },
            { id: 'PENDING_HITL', label: 'HITL Tier-3' },
            { id: 'TIER_2_AUTO', label: 'Tier-2 Auto' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterState(pill.id)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                filterState === pill.id
                  ? 'bg-emerald-600 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Right: Ingestion Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCustomModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Upload Custom JSON</span>
          </button>

          <button
            onClick={onIngestBatch}
            disabled={isIngesting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors disabled:opacity-50"
          >
            <FilePlus2 className={`w-3.5 h-3.5 ${isIngesting ? 'animate-spin' : ''}`} />
            <span>Ingest 5-Invoice Batch</span>
          </button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search invoices by number (INV-101), vendor name, PO ID, or SKU code..."
          className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-mono"
          >
            Clear
          </button>
        )}
      </div>

      {/* Invoice Queue Table */}
      <Card
        title={`Accounts Payable Intake Queue (${filteredInvoices.length} matching invoices)`}
        subtitle="Click any row to open the complete document extraction and semantic SKU mapping inspector"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans" data-testid="invoices-intake-table">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                <th className="py-2.5 px-3">Invoice #</th>
                <th className="py-2.5 px-3">Claimed Vendor</th>
                <th className="py-2.5 px-3">Dates</th>
                <th className="py-2.5 px-3 text-right">Total Billed</th>
                <th className="py-2.5 px-3">3-Way Match Verdict</th>
                <th className="py-2.5 px-3">Operational State</th>
                <th className="py-2.5 px-3">Permission Tier</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredInvoices.map((inv) => {
                const findings = inv.three_way_match.reconciliation_findings;
                const isMatchVerified = findings.overall_match_status === 'VERIFIED_ELIGIBLE';
                const isDiscrepancy = findings.overall_match_status === 'QUARANTINED_DISCREPANCY';
                const isSecurityBlocked = findings.overall_match_status === 'BLOCKED_SECURITY_VIOLATION';
                const isPendingGRN = findings.overall_match_status === 'PENDING_GRN_ATTESTATION';

                return (
                  <tr
                    key={inv.invoice_id}
                    onClick={() => onSelectInvoice(inv)}
                    className="hover:bg-slate-850/60 cursor-pointer transition-colors group"
                    data-testid={`intake-row-${inv.invoice_number}`}
                  >
                    <td className="py-3 px-3 font-mono font-medium text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {inv.invoice_number}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        PO: {inv.extraction.referenced_po_id || 'None'}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-200">
                        {inv.extraction.vendor_name_claimed}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        IBAN: {inv.three_way_match.vendor_master_check.approved_iban_masked}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                      <div>Due: {formatDate(inv.extraction.net_due_date)}</div>
                      <div className="text-[10px] text-slate-400">
                        {inv.extraction.early_discount_pct !== '0.00' ? (
                          <span className="text-emerald-400 font-semibold">
                            {inv.extraction.early_discount_pct}% {inv.extraction.early_discount_days}d Early
                          </span>
                        ) : (
                          `Net ${inv.extraction.net_due_days}d`
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-100">
                      <CurrencyDisplay amount={inv.extraction.total_claimed} />
                    </td>

                    <td className="py-3 px-3">
                      {isMatchVerified && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-700 text-emerald-300 font-mono text-[10px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          3-WAY MATCH VERIFIED
                        </span>
                      )}
                      {isDiscrepancy && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950 border border-amber-600 text-amber-200 font-mono text-[10px] font-semibold">
                          <AlertOctagon className="w-3 h-3 text-amber-400" />
                          QUARANTINED (+8 Units)
                        </span>
                      )}
                      {isSecurityBlocked && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-crimson-950 border border-crimson-600 text-crimson-200 font-mono text-[10px] font-bold">
                          <ShieldAlert className="w-3 h-3 text-crimson-400" />
                          ASI01 / IBAN BLOCKED
                        </span>
                      )}
                      {isPendingGRN && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[10px]">
                          AWAITING WAREHOUSE GRN
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <OperationalStateBadge state={inv.operational_state} size="sm" />
                    </td>

                    <td className="py-3 px-3">
                      <PermissionTierBadge tier={inv.permission_tier} />
                    </td>

                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectInvoice(inv)}
                          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                          title="Inspect Invoice Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onNavigateTo3WayMatch(inv.invoice_id)}
                          className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                          title="Open 3-Way Match Matrix"
                        >
                          <GitCompare className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Upload Custom Invoice Modal */}
      <Modal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        title="Ingest Custom Invoice Payload (Bench Test)"
        subtitle="Simulate ingestion of an ad-hoc commercial invoice JSON payload"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300 font-mono">Invoice JSON Payload:</span>
            <button
              onClick={handleLoadSampleCustom}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-mono underline"
            >
              Load Sample Test JSON
            </button>
          </div>

          <textarea
            rows={8}
            value={customPayloadText}
            onChange={(e) => setCustomPayloadText(e.target.value)}
            placeholder='{\n  "vendor_name": "Test Supplier",\n  "amount": "5000.00",\n  "po_id": "PO-2026-CUSTOM"\n}'
            className="w-full bg-slate-950 border border-slate-700 rounded p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
          />

          {customError && (
            <div className="p-2.5 rounded bg-crimson-950/80 border border-crimson-700 text-crimson-200 text-xs font-mono">
              {customError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              onClick={() => setIsCustomModalOpen(false)}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 text-xs font-mono hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomSubmit}
              className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-sans shadow"
            >
              Ingest & Run 3-Way Reconciliation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
