import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExecutionHistoryView } from '../ExecutionHistoryView';
import { ForensicAuditTrailView } from '../ForensicAuditTrailView';
import { SecurityDiagnosticsView } from '../SecurityDiagnosticsView';
import {
  BENCHMARK_INVOICES,
  INITIAL_AUDIT_ENVELOPES,
} from '@/services/benchmarkData';
import { ExecutionReceipt } from '@/contracts/ledgerGuardContract';

const MOCK_EXECUTIONS: ExecutionReceipt[] = [
  {
    execution_id: 'SBX-PAY-101',
    credit_draw_execution_id: 'SBX-LOC-101',
    execution_environment: 'SANDBOX_SIMULATION',
    invoice_id: 'INV-2026-101',
    status: 'SIMULATED_EXECUTED',
    idempotency_key: 'idemp_test_101',
    pre_execution_cash_balance: '65400.00',
    disbursed_amount: '39200.00',
    credit_drawn_amount: '12000.00',
    post_execution_cash_balance: '38200.00',
    post_state_invariant_verified: true,
    executed_at_utc: '2026-11-09T14:30:00Z',
    decision_envelope_trace_id: 'trc_20261109_001',
  },
  {
    execution_id: 'SBX-PAY-102',
    credit_draw_execution_id: null,
    execution_environment: 'SANDBOX_SIMULATION',
    invoice_id: 'INV-2026-101',
    status: 'IDEMPOTENT_REPLAY_NOOP',
    idempotency_key: 'idemp_test_102',
    pre_execution_cash_balance: '38200.00',
    disbursed_amount: '0.00',
    credit_drawn_amount: '0.00',
    post_execution_cash_balance: '38200.00',
    post_state_invariant_verified: true,
    executed_at_utc: '2026-11-09T14:31:00Z',
    decision_envelope_trace_id: 'trc_20261109_001',
  },
];

describe('Stage 6 Feature Views (Views 7, 8, and 9)', () => {
  beforeEach(() => {
    // Mock Blob and object URL for JSONL export tests and prevent jsdom navigation error
    window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  describe('View 7: ExecutionHistoryView', () => {
    it('renders execution receipts and displays operational honesty notice', () => {
      const handleNavigateAudit = vi.fn();
      const handleRefresh = vi.fn();

      render(
        <ExecutionHistoryView
          executions={MOCK_EXECUTIONS}
          onNavigateToAudit={handleNavigateAudit}
          onRefreshData={handleRefresh}
        />
      );

      // Operational Honesty banner check
      expect(
        screen.getByText(/OPERATIONAL ENVIRONMENT NOTICE: SANDBOX SIMULATION LEDGER/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/never represented as live external bank transfers/i)
      ).toBeInTheDocument();

      // Table rows rendering
      expect(screen.getByTestId('execution-row-SBX-PAY-101')).toBeInTheDocument();
      expect(screen.getByTestId('execution-row-SBX-PAY-102')).toBeInTheDocument();
      expect(screen.getByText(/SIMULATED EXECUTED/i)).toBeInTheDocument();
      expect(screen.getAllByText(/IDEMPOTENT REPLAY/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/PASS \(ACID\)/i).length).toBe(2);

      // Trace link click
      const traceButtons = screen.getAllByTitle(/Inspect Decision Envelope in Audit Trail/i);
      expect(traceButtons.length).toBeGreaterThanOrEqual(1);
      fireEvent.click(traceButtons[0]);
      expect(handleNavigateAudit).toHaveBeenCalledWith('trc_20261109_001');
    });

    it('filters execution rows by status', () => {
      render(
        <ExecutionHistoryView
          executions={MOCK_EXECUTIONS}
          onNavigateToAudit={vi.fn()}
          onRefreshData={vi.fn()}
        />
      );

      // Filter by Idempotent Replays
      const replayFilterBtn = screen.getByRole('button', { name: /Idempotent Replays/i });
      fireEvent.click(replayFilterBtn);

      expect(screen.queryByText(/SIMULATED EXECUTED/i)).not.toBeInTheDocument();
      expect(screen.getAllByText(/IDEMPOTENT REPLAY/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('View 8: ForensicAuditTrailView', () => {
    it('renders cryptographic decision envelopes and handles hash chain verification', async () => {
      render(
        <ForensicAuditTrailView
          envelopes={INITIAL_AUDIT_ENVELOPES}
          executions={MOCK_EXECUTIONS}
        />
      );

      // Verify envelope count and header
      expect(
        screen.getByText(/Cryptographic Decision Envelopes/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/GENESIS/i)).toBeInTheDocument();

      // Click Verify SHA-256 Chain button
      const verifyBtn = screen.getByTestId('verify-chain-btn');
      fireEvent.click(verifyBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Cryptographic SHA-256 chain verified/i)
        ).toBeInTheDocument();
      });
    });

    it('triggers JSONL download exports for executions and envelopes', () => {
      render(
        <ForensicAuditTrailView
          envelopes={INITIAL_AUDIT_ENVELOPES}
          executions={MOCK_EXECUTIONS}
        />
      );

      const exportAuditBtn = screen.getByTestId('export-audit-jsonl-btn');
      fireEvent.click(exportAuditBtn);

      expect(window.URL.createObjectURL).toHaveBeenCalled();
      expect(window.URL.revokeObjectURL).toHaveBeenCalled();

      const exportExecBtn = screen.getByTestId('export-execution-jsonl-btn');
      fireEvent.click(exportExecBtn);

      expect(window.URL.createObjectURL).toHaveBeenCalledTimes(2);
    });

    it('expands envelope JSON inspection details', () => {
      render(
        <ForensicAuditTrailView
          envelopes={INITIAL_AUDIT_ENVELOPES}
          executions={MOCK_EXECUTIONS}
        />
      );

      const expandBtn = screen.getByTestId(`envelope-header-${INITIAL_AUDIT_ENVELOPES[0].trace_id}`);
      fireEvent.click(expandBtn);

      expect(screen.getByText(/3-Way Match Summary Payload/i)).toBeInTheDocument();
      expect(screen.getByText(/Working Capital Optimization Summary/i)).toBeInTheDocument();
      expect(screen.getByText(/Sandbox Execution Verification Proof/i)).toBeInTheDocument();
    });
  });

  describe('View 9: SecurityDiagnosticsView', () => {
    it('renders threat matrix and active containment layers', () => {
      render(
        <SecurityDiagnosticsView
          invoices={BENCHMARK_INVOICES}
          onRefreshData={vi.fn()}
        />
      );

      expect(screen.getByText(/Security Diagnostics, Threat Matrix & Failure Injection/i)).toBeInTheDocument();
      expect(screen.getByText('OWASP ASI01')).toBeInTheDocument();
      expect(screen.getByText('OWASP ASI02')).toBeInTheDocument();
      expect(screen.getByText('OWASP ASI09')).toBeInTheDocument();
      expect(screen.getByText('OWASP LLM02')).toBeInTheDocument();
      expect(screen.getByText(/Vendor Bank Account Tamper Defense Active/i)).toBeInTheDocument();
    });

    it('triggers TC-05 mid-transaction failure injection and displays atomic rollback receipt', async () => {
      const handleRefresh = vi.fn().mockResolvedValue(undefined);

      render(
        <SecurityDiagnosticsView
          invoices={BENCHMARK_INVOICES}
          onRefreshData={handleRefresh}
        />
      );

      const simulateBtn = screen.getByTestId('simulate-failure-btn');
      fireEvent.click(simulateBtn);

      await waitFor(() => {
        // Structured error envelope banner
        expect(screen.getByTestId('error-envelope-banner')).toBeInTheDocument();
        expect(screen.getByText(/ERR_ATOMIC_ROLLBACK_COMPLETED/i)).toBeInTheDocument();
        expect(screen.getByText(/POLICY_ACID_POST_STATE_INVARIANT/i)).toBeInTheDocument();

        // Rollback proof receipt
        expect(screen.getByTestId('rollback-receipt-proof')).toBeInTheDocument();
        expect(screen.getAllByText(/FAILED_ROLLED_BACK/i).length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText(/ACID VERIFIED/i)).toBeInTheDocument();
      });

      expect(handleRefresh).toHaveBeenCalled();
    });

    it('verifies SHA-256 chain via quick diagnostic button', async () => {
      render(
        <SecurityDiagnosticsView
          invoices={BENCHMARK_INVOICES}
          onRefreshData={vi.fn()}
        />
      );

      const verifyQuickBtn = screen.getByTestId('verify-chain-quick-btn');
      fireEvent.click(verifyQuickBtn);

      await waitFor(() => {
        expect(screen.getByTestId('chain-quick-result')).toBeInTheDocument();
        expect(screen.getByText(/Cryptographic SHA-256 chain verified/i)).toBeInTheDocument();
      });
    });
  });
});
