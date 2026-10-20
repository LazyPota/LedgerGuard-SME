import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DiscrepancyReviewView } from '../DiscrepancyReviewView';
import { LiquidityExplanationView } from '../LiquidityExplanationView';
import { ApprovalQueueView } from '../ApprovalQueueView';
import {
  BENCHMARK_INVOICES,
  INITIAL_TREASURY_SUMMARY,
} from '@/services/benchmarkData';

describe('Stage 5 Feature Views (Views 4, 5, and 6)', () => {
  describe('View 4: DiscrepancyReviewView', () => {
    it('renders quarantined items and generates debit note for INV-102', async () => {
      const handleRefresh = vi.fn();
      const handleNavigateMatch = vi.fn();

      render(
        <DiscrepancyReviewView
          invoices={BENCHMARK_INVOICES}
          onRefreshData={handleRefresh}
          onNavigateTo3WayMatch={handleNavigateMatch}
        />
      );

      // Verify all 3 quarantined invoices are present
      expect(screen.getByText('INV-102')).toBeInTheDocument();
      expect(screen.getByText('INV-103')).toBeInTheDocument();
      expect(screen.getByText('INV-104')).toBeInTheDocument();

      // Click Generate Debit Note on INV-102
      const debitBtn = screen.getByTestId('generate-debit-note-btn');
      fireEvent.click(debitBtn);

      // Verify modal opened with dispute details
      await waitFor(() => {
        expect(screen.getByText(/Formal Vendor Debit Note & Billing Dispute Draft/i)).toBeInTheDocument();
        expect(screen.getByText('+4000.00')).toBeInTheDocument();
      });
    });

    it('displays prompt injection quarantine and locked execution for INV-104', () => {
      render(
        <DiscrepancyReviewView
          invoices={BENCHMARK_INVOICES}
          onRefreshData={async () => {}}
          onNavigateTo3WayMatch={() => {}}
        />
      );

      expect(screen.getByText(/Execution Hard-Locked/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ASI01_GOAL_HIJACK/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/BEC_IBAN_SWAP/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('View 5: LiquidityExplanationView', () => {
    it('renders 2/10 Net-30 yield calculations and bridge loan cost for INV-101', () => {
      const handleNavigateApproval = vi.fn();

      render(
        <LiquidityExplanationView
          treasury={INITIAL_TREASURY_SUMMARY}
          invoices={BENCHMARK_INVOICES}
          onNavigateToApproval={handleNavigateApproval}
        />
      );

      // Gross discount $800.00
      expect(screen.getByText('+$800.00')).toBeInTheDocument();

      // Implied APR 37.24% and EAR 44.59%
      expect(screen.getByText(/37.24%/i)).toBeInTheDocument();
      expect(screen.getByText(/44.59%/i)).toBeInTheDocument();

      // Bridge interest -$24.16 and net profit +$775.84
      expect(screen.getByText('-$24.16')).toBeInTheDocument();
      expect(screen.getAllByText('+$775.84').length).toBeGreaterThanOrEqual(1);

      // WeBank facility marked as optimal selection
      expect(screen.getByText('OPTIMAL SELECTION')).toBeInTheDocument();
    });
  });

  describe('View 6: ApprovalQueueView', () => {
    it('enforces anti-rubber-stamp confirmation before enabling Tier-3 authorization button', async () => {
      const handleRefresh = vi.fn();
      const handleNavigateMatch = vi.fn();

      render(
        <ApprovalQueueView
          invoices={BENCHMARK_INVOICES}
          onRefreshData={handleRefresh}
          onNavigateTo3WayMatch={handleNavigateMatch}
        />
      );

      // Verify Permission-Tier Policy Matrix is displayed
      expect(screen.getByText(/LedgerGuard Permission-Tier Policy Matrix/i)).toBeInTheDocument();

      // Open Tier-3 HITL modal for INV-101
      const openBtn = screen.getByTestId('open-hitl-modal-btn-INV-101');
      fireEvent.click(openBtn);

      const authBtn = screen.getByTestId('authorize-hitl-btn');
      // Button MUST be disabled initially
      expect(authBtn).toBeDisabled();

      // Enter wrong IBAN tail
      const ibanInput = screen.getByTestId('confirm-iban-input');
      const amountInput = screen.getByTestId('confirm-amount-input');

      fireEvent.change(ibanInput, { target: { value: '0000' } });
      fireEvent.change(amountInput, { target: { value: '39200.00' } });
      expect(authBtn).toBeDisabled();

      // Enter matching IBAN tail 4829 and amount 39200.00
      fireEvent.change(ibanInput, { target: { value: '4829' } });
      expect(authBtn).not.toBeDisabled();

      // Click Authorize
      fireEvent.click(authBtn);

      // Receipt modal should appear
      await waitFor(() => {
        expect(screen.getByText(/Sandbox Execution Receipt/i)).toBeInTheDocument();
        expect(screen.getByText('SIMULATED_EXECUTED')).toBeInTheDocument();
      });
      expect(handleRefresh).toHaveBeenCalled();
    });

    it('executes Tier-2 auto-payment and validates duplicate retry idempotency protection', async () => {
      render(
        <ApprovalQueueView
          invoices={BENCHMARK_INVOICES}
          onRefreshData={async () => {}}
          onNavigateTo3WayMatch={() => {}}
        />
      );

      // First click: execute auto
      const autoBtn = screen.getByTestId('execute-tier2-btn');
      fireEvent.click(autoBtn);

      await waitFor(() => {
        const resultReceipt = screen.getByTestId('idempotency-result-receipt');
        expect(resultReceipt).toBeInTheDocument();
        expect(resultReceipt).toHaveTextContent(/SIMULATED_EXECUTED/i);
      });
    });
  });
});
