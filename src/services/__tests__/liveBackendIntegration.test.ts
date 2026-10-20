import { describe, it, expect, beforeAll } from 'vitest';
import { apiClient } from '../apiClient';
import {
  HealthStatusResponseSchema,
  TreasurySummaryResponseSchema,
  InvoiceRecordSchema,
  ForensicDecisionEnvelopeSchema,
  VerifyChainResponseSchema,
} from '@/contracts/ledgerGuardSchemas';

describe('Live FastAPI Backend Integration Tests', () => {
  beforeAll(async () => {
    // Switch apiClient to Live Backend Sandbox mode
    apiClient.setExecutionMode('LIVE_BACKEND_SANDBOX');
  });

  it('GET /api/v1/health returns valid schema and confirms database and audit chain status', async () => {
    const health = await apiClient.getHealth();
    expect(health.execution_mode).toBe('LIVE_BACKEND_SANDBOX');
    expect(health.database_connected).toBe(true);
    expect(health.audit_chain_valid).toBe(true);
    expect(health.policy_version).toBeDefined();

    // Validate with Zod schema
    const parseResult = HealthStatusResponseSchema.safeParse(health);
    expect(parseResult.success).toBe(true);
  });

  it('POST /api/v1/invoices/ingest ingests benchmark batch into live SQLite backend', async () => {
    const invoices = await apiClient.ingestBenchmarkBatch();
    expect(invoices.length).toBeGreaterThanOrEqual(1);

    // Validate each returned invoice against the strict TypeScript Zod schema
    for (const inv of invoices) {
      const parseResult = InvoiceRecordSchema.safeParse(inv);
      if (!parseResult.success) {
        console.error('Invoice validation failed for:', inv.invoice_id, parseResult.error);
      }
      expect(parseResult.success).toBe(true);
    }
  });

  it('GET /api/v1/invoices returns all ingested records', async () => {
    const invoices = await apiClient.getInvoices();
    expect(invoices.length).toBeGreaterThanOrEqual(1);
    expect(invoices.some((i) => i.invoice_id === 'INV-2026-101')).toBe(true);
  });

  it('GET /api/v1/invoices/{invoice_id} fetches specific invoice record', async () => {
    const inv = await apiClient.getInvoice('INV-2026-101');
    expect(inv).not.toBeNull();
    expect(inv?.invoice_number).toBe('INV-101');
    expect(inv?.extraction.total_claimed).toBe('40000.00');
  });

  it('GET /api/v1/treasury/summary returns 30-day trajectory and liquidity facilities', async () => {
    const treasury = await apiClient.getTreasurySummary();
    expect(treasury.currency).toBe('USD');
    expect(treasury.payroll_reserve_floor).toBe('50000.00');
    expect(treasury.daily_cash_trajectory.length).toBeGreaterThan(0);
    expect(treasury.credit_facilities.length).toBeGreaterThan(0);

    const parseResult = TreasurySummaryResponseSchema.safeParse(treasury);
    expect(parseResult.success).toBe(true);
  });

  it('GET /api/v1/audit/envelopes returns cryptographic decision envelopes', async () => {
    const envelopes = await apiClient.getAuditEnvelopes();
    expect(envelopes.length).toBeGreaterThanOrEqual(1);

    for (const env of envelopes) {
      const parseResult = ForensicDecisionEnvelopeSchema.safeParse(env);
      if (!parseResult.success) {
        console.error('Envelope validation failed:', env.trace_id, parseResult.error);
      }
      expect(parseResult.success).toBe(true);
    }
  });

  it('POST /api/v1/audit/verify-chain confirms SHA-256 chain validity in SQLite', async () => {
    const verifyRes = await apiClient.verifyAuditChain();
    expect(verifyRes.valid).toBe(true);
    expect(verifyRes.envelopes_checked).toBeGreaterThanOrEqual(1);

    const parseResult = VerifyChainResponseSchema.safeParse(verifyRes);
    expect(parseResult.success).toBe(true);
  });

  it('submits human approval decision and verifies execution status', async () => {
    const invoiceId = 'INV-2026-101';
    const idempotencyKey = 'idemp_live_test_001';

    const decisionResult = await apiClient.submitApprovalDecision({
      approval_id: `ACT-${invoiceId}`,
      invoice_id: invoiceId,
      decision: 'APPROVE_EXECUTION',
      approver_id: 'mgr_01',
      approver_role: 'FINANCE_MANAGER',
      confirmed_total_amount: '39200.00',
      confirmed_iban_tail: '4829',
      reviewer_notes: 'Verified against PO and treasury policy.',
      idempotency_key: idempotencyKey,
    });

    expect(decisionResult.status).toBe('APPROVED');
  });

  it('GET /api/v1/executions lists committed sandbox executions from live SQLite', async () => {
    const executions = await apiClient.getExecutions();
    expect(executions.length).toBeGreaterThanOrEqual(1);
    expect(executions.some((e) => e.invoice_id === 'INV-2026-101')).toBe(true);
    expect(executions[0].execution_environment).toBe('SANDBOX_SIMULATION');
    expect(executions[0].status).toBe('SIMULATED_EXECUTED');
    expect(executions[0].post_state_invariant_verified).toBe(true);
  });
});
