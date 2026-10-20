import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverviewDashboardView } from '../OverviewDashboardView';
import { InvoiceIntakeListView } from '../InvoiceIntakeListView';
import { ThreeWayMatchMatrixView } from '../ThreeWayMatchMatrixView';
import { InvoiceDetailDrawer } from '../InvoiceDetailDrawer';
import {
  BENCHMARK_INVOICES,
  INITIAL_TREASURY_SUMMARY,
} from '@/services/benchmarkData';

describe('Stage 4 Feature Views (Views 1, 2, and 3)', () => {
  describe('View 1: OverviewDashboardView', () => {
    it('renders top KPI cards with accurate decimal values', () => {
      const handleNavigate = vi.fn();
      render(
        <OverviewDashboardView
          treasury={INITIAL_TREASURY_SUMMARY}
          invoices={BENCHMARK_INVOICES}
          onNavigate={handleNavigate}
        />
      );

      // Current cash balance $77,200.00 and floor $50,000.00
      expect(screen.getByText('$77,200.00')).toBeInTheDocument();
      expect(screen.getAllByText('$50,000.00').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('$41,000.00')).toBeInTheDocument();
      expect(screen.getByText('$775.84')).toBeInTheDocument();

      // Trajectory Chart should be rendered
      expect(screen.getByTestId('trajectory-chart')).toBeInTheDocument();

      // Facilities table with WeBank recommended
      expect(screen.getByText('WeBank SME Liquidity Line (Revolving Credit)')).toBeInTheDocument();
      expect(screen.getByText('RECOMMENDED (LOWEST COST)')).toBeInTheDocument();
    });
  });

  describe('View 2: InvoiceIntakeListView & Drawer', () => {
    it('renders all benchmark invoices and filters by operational state', () => {
      const handleSelect = vi.fn();
      const handleNavigateMatch = vi.fn();
      const handleBatch = vi.fn();
      const handleCustom = vi.fn();

      render(
        <InvoiceIntakeListView
          invoices={BENCHMARK_INVOICES}
          onSelectInvoice={handleSelect}
          onNavigateTo3WayMatch={handleNavigateMatch}
          onIngestBatch={handleBatch}
          onIngestCustom={handleCustom}
        />
      );

      expect(screen.getByTestId('intake-row-INV-101')).toBeInTheDocument();
      expect(screen.getByTestId('intake-row-INV-102')).toBeInTheDocument();
      expect(screen.getByTestId('intake-row-INV-103')).toBeInTheDocument();
      expect(screen.getByTestId('intake-row-INV-104')).toBeInTheDocument();
      expect(screen.getByTestId('intake-row-INV-105')).toBeInTheDocument();

      // Filter to discrepancy only
      const discrepancyFilter = screen.getByText(/Discrepancy \(TC-02\)/i);
      fireEvent.click(discrepancyFilter);

      expect(screen.getByTestId('intake-row-INV-102')).toBeInTheDocument();
      expect(screen.queryByTestId('intake-row-INV-101')).not.toBeInTheDocument();
    });

    it('searches invoices by text', () => {
      render(
        <InvoiceIntakeListView
          invoices={BENCHMARK_INVOICES}
          onSelectInvoice={() => {}}
          onNavigateTo3WayMatch={() => {}}
          onIngestBatch={async () => {}}
          onIngestCustom={async () => {}}
        />
      );

      const searchInput = screen.getByPlaceholderText(/Search invoices/i);
      fireEvent.change(searchInput, { target: { value: 'Delta' } });

      expect(screen.getByTestId('intake-row-INV-102')).toBeInTheDocument();
      expect(screen.queryByTestId('intake-row-INV-101')).not.toBeInTheDocument();
    });

    it('renders InvoiceDetailDrawer with untrusted memo and SKU mappings', () => {
      const inv104 = BENCHMARK_INVOICES.find((i) => i.invoice_number === 'INV-104')!;
      render(
        <InvoiceDetailDrawer
          invoice={inv104}
          isOpen={true}
          onClose={() => {}}
          onNavigateTo3WayMatch={() => {}}
          onNavigateToDiscrepancy={() => {}}
          onNavigateToApproval={() => {}}
        />
      );

      expect(screen.getByText(/Invoice Inspector — INV-104/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ASI01 ALERT/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/GB88HACK99999999/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('View 3: ThreeWayMatchMatrixView', () => {
    it('renders 4-column reconciliation matrix for INV-101 with $0.00 delta match', () => {
      render(
        <ThreeWayMatchMatrixView
          invoices={BENCHMARK_INVOICES}
          selectedInvoiceId="INV-2026-101"
          onSelectInvoiceId={() => {}}
          onNavigateToDiscrepancy={() => {}}
          onNavigateToApproval={() => {}}
        />
      );

      expect(screen.getByText('$0.00 Match')).toBeInTheDocument();
      expect(screen.getAllByText(/PO-2026-881/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/GRN-2026-402/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/EXACT MATCH \(VERIFIED\)/i)).toBeInTheDocument();
    });

    it('renders quantity overbill discrepancy for INV-102 (+8 units / +$4,000.00)', () => {
      render(
        <ThreeWayMatchMatrixView
          invoices={BENCHMARK_INVOICES}
          selectedInvoiceId="INV-2026-102"
          onSelectInvoiceId={() => {}}
          onNavigateToDiscrepancy={() => {}}
          onNavigateToApproval={() => {}}
        />
      );

      expect(screen.getByText('+8 units / +$4,000.00 Overbill')).toBeInTheDocument();
      expect(screen.getAllByText(/PO-2026-882/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/GRN-2026-405/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/OVERALL VERDICT: QUARANTINED_DISCREPANCY/i)).toBeInTheDocument();
    });
  });
});
