import { describe, it, expect } from 'vitest';
import {
  HealthStatusResponseSchema,
  TreasurySummaryResponseSchema,
  InvoiceRecordSchema,
  ExecutionReceiptSchema,
  ForensicDecisionEnvelopeSchema,
  ApiErrorEnvelopeSchema,
} from '../ledgerGuardSchemas';
import {
  BENCHMARK_INVOICES,
  INITIAL_TREASURY_SUMMARY,
  INITIAL_AUDIT_ENVELOPES,
} from '@/services/benchmarkData';

describe('LedgerGuard Contract & Zod Schemas', () => {
  it('validates benchmark treasury summary against TreasurySummaryResponseSchema', () => {
    const parseResult = TreasurySummaryResponseSchema.safeParse(INITIAL_TREASURY_SUMMARY);
    expect(parseResult.success).toBe(true);
    if (parseResult.success) {
      expect(parseResult.data.currency).toBe('USD');
      expect(parseResult.data.current_cash_balance).toBe('77200.00');
      expect(parseResult.data.payroll_reserve_floor).toBe('50000.00');
    }
  });

  it('validates all 5 benchmark invoices against InvoiceRecordSchema', () => {
    expect(BENCHMARK_INVOICES.length).toBe(5);
    for (const invoice of BENCHMARK_INVOICES) {
      const result = InvoiceRecordSchema.safeParse(invoice);
      expect(result.success, `Invoice ${invoice.invoice_id} failed schema validation: ${JSON.stringify(result.error?.format())}`).toBe(true);
    }
  });

  it('validates initial audit envelopes against ForensicDecisionEnvelopeSchema', () => {
    for (const env of INITIAL_AUDIT_ENVELOPES) {
      const result = ForensicDecisionEnvelopeSchema.safeParse(env);
      expect(result.success).toBe(true);
    }
  });

  it('validates HealthStatusResponseSchema', () => {
    const validHealth = {
      status: 'ok',
      execution_mode: 'LIVE_BACKEND_SANDBOX',
      llm_extractor_mode: 'LIVE_STRUCTURED_OUTPUT',
      database_connected: true,
      audit_chain_valid: true,
      as_of_timestamp_utc: new Date().toISOString(),
    };
    expect(HealthStatusResponseSchema.safeParse(validHealth).success).toBe(true);

    const invalidHealth = {
      status: 'invalid_status',
      execution_mode: 'UNKNOWN',
    };
    expect(HealthStatusResponseSchema.safeParse(invalidHealth).success).toBe(false);
  });

  it('validates ExecutionReceiptSchema and checks discriminated status', () => {
    const validReceipt = {
      execution_id: 'SBX-PAY-99201',
      credit_draw_execution_id: 'SBX-LOC-44102',
      execution_environment: 'SANDBOX_SIMULATION',
      invoice_id: 'INV-2026-101',
      status: 'SIMULATED_EXECUTED',
      idempotency_key: 'idemp_test_123',
      pre_execution_cash_balance: '77200.00',
      disbursed_amount: '39200.00',
      credit_drawn_amount: '12000.00',
      post_execution_cash_balance: '50000.00',
      post_state_invariant_verified: true,
      executed_at_utc: new Date().toISOString(),
      decision_envelope_trace_id: 'trc_test_001',
    };
    const parsed = ExecutionReceiptSchema.safeParse(validReceipt);
    expect(parsed.success).toBe(true);
  });

  it('validates ApiErrorEnvelopeSchema', () => {
    const errorEnvelope = {
      error_code: 'ERR_ATOMIC_ROLLBACK_COMPLETED',
      message: 'Simulated mid-flight transaction conflict detected.',
      severity: 'ERROR',
      trace_id: 'trc_rollback_123',
      violated_policy_rule: 'POLICY_ACID_POST_STATE_INVARIANT',
      suggested_operator_action: 'Check covenants',
      recoverable: true,
    };
    expect(ApiErrorEnvelopeSchema.safeParse(errorEnvelope).success).toBe(true);
  });
});
