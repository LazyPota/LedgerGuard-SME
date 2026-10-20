import { describe, it, expect, beforeEach } from 'vitest';
import { MockSandboxAdapter } from '../mockSandboxAdapter';

describe('MockSandboxAdapter Deterministic State Machine', () => {
  let adapter: MockSandboxAdapter;

  beforeEach(() => {
    adapter = new MockSandboxAdapter();
  });

  it('initializes with 5 benchmark invoices and correct starting states', async () => {
    const invoices = await adapter.getInvoices();
    expect(invoices).toHaveLength(5);

    const inv101 = invoices.find((i) => i.invoice_number === 'INV-101');
    const inv102 = invoices.find((i) => i.invoice_number === 'INV-102');
    const inv103 = invoices.find((i) => i.invoice_number === 'INV-103');
    const inv104 = invoices.find((i) => i.invoice_number === 'INV-104');
    const inv105 = invoices.find((i) => i.invoice_number === 'INV-105');

    expect(inv101?.operational_state).toBe('PENDING_HITL_TIER_3');
    expect(inv102?.operational_state).toBe('BLOCKED_DISCREPANCY');
    expect(inv103?.operational_state).toBe('PENDING_HITL_TIER_3');
    expect(inv104?.operational_state).toBe('BLOCKED_SECURITY_VIOLATION');
    expect(inv105?.operational_state).toBe('STAGED_TIER_2_ELIGIBLE');
  });

  it('executes Tier-2 bounded auto-execution for INV-105 and verifies cash deduction', async () => {
    const preTreasury = await adapter.getTreasurySummary();
    expect(preTreasury.current_cash_balance).toBe('77200.00');

    const receipt = await adapter.triggerTier2AutoExecution({
      invoice_id: 'INV-2026-105',
      idempotency_key: 'idemp_tier2_test_1',
      operator_id: 'op_auto_001',
    });

    expect(receipt.status).toBe('SIMULATED_EXECUTED');
    expect(receipt.disbursed_amount).toBe('1800.00');
    expect(receipt.post_execution_cash_balance).toBe('75400.00');
    expect(receipt.post_state_invariant_verified).toBe(true);

    const postTreasury = await adapter.getTreasurySummary();
    expect(postTreasury.current_cash_balance).toBe('75400.00');

    const updatedInv = await adapter.getInvoice('INV-2026-105');
    expect(updatedInv?.operational_state).toBe('SIMULATED_EXECUTED');
  });

  it('enforces idempotency replay protection: identical idempotency_key prevents double-deduction', async () => {
    const key = 'idemp_duplicate_safe_key_999';

    // First execution
    const firstReceipt = await adapter.triggerTier2AutoExecution({
      invoice_id: 'INV-2026-105',
      idempotency_key: key,
      operator_id: 'op_auto_001',
    });
    expect(firstReceipt.status).toBe('SIMULATED_EXECUTED');
    expect(firstReceipt.post_execution_cash_balance).toBe('75400.00');

    // Duplicate execution with same idempotency key
    const duplicateReceipt = await adapter.triggerTier2AutoExecution({
      invoice_id: 'INV-2026-105',
      idempotency_key: key,
      operator_id: 'op_auto_001',
    });
    expect(duplicateReceipt.status).toBe('IDEMPOTENT_REPLAY_NOOP');
    expect(duplicateReceipt.execution_id).toBe(firstReceipt.execution_id);

    // Cash balance MUST NOT be deducted twice
    const treasury = await adapter.getTreasurySummary();
    expect(treasury.current_cash_balance).toBe('75400.00');
  });

  it('processes Tier-3 HITL approval for INV-101 with LOC bridge financing and cash floor preservation', async () => {
    const key = 'idemp_hitl_101_approval';
    const result = await adapter.submitApprovalDecision({
      approval_id: 'APP-101',
      invoice_id: 'INV-2026-101',
      decision: 'APPROVE_EXECUTION',
      approver_id: 'usr_controller_01',
      approver_role: 'FINANCE_MANAGER',
      confirmed_total_amount: '39200.00',
      confirmed_iban_tail: '4829',
      reviewer_notes: 'Verified 3-way match, WeBank credit bridge approved.',
      idempotency_key: key,
    });

    expect(result.status).toBe('SIMULATED_EXECUTED');
    expect(result.receipt).toBeDefined();
    // Pre $77,200.00 - Disburse $39,200.00 + Draw $12,000.00 = $50,000.00
    expect(result.receipt?.post_execution_cash_balance).toBe('50000.00');
    expect(result.receipt?.credit_draw_execution_id).toContain('SBX-LOC-');

    const treasury = await adapter.getTreasurySummary();
    expect(treasury.current_cash_balance).toBe('50000.00');
  });

  it('generates a formal vendor debit note for INV-102 quantity overbill discrepancy', async () => {
    const debitNote = await adapter.generateDebitNote('INV-2026-102');
    expect(debitNote.invoice_id).toBe('INV-2026-102');
    expect(debitNote.referenced_po_id).toBe('PO-2026-882');
    expect(debitNote.referenced_grn_id).toBe('GRN-2026-405');
    expect(debitNote.total_billed_amount).toBe('25000.00');
    expect(debitNote.adjusted_payable_amount).toBe('21000.00');
    expect(debitNote.debit_note_delta).toBe('+4000.00');
    expect(debitNote.draft_letter_markdown).toContain('FORMAL VENDOR DEBIT NOTE');
  });

  it('attests warehouse GRN for INV-103 and resolves missing GRN discrepancy', async () => {
    const updated = await adapter.attestWarehouseGrn('INV-2026-103');
    expect(updated.three_way_match.goods_receipt_note).not.toBeNull();
    expect(updated.three_way_match.reconciliation_findings.overall_match_status).toBe('VERIFIED_ELIGIBLE');
    expect(updated.three_way_match.reconciliation_findings.discrepancies).toHaveLength(0);
    expect(updated.operational_state).toBe('STAGED_TIER_2_ELIGIBLE');
  });

  it('simulates atomic rollback without altering cash balance', async () => {
    const preTreasury = await adapter.getTreasurySummary();
    const result = await adapter.simulateAtomicRollback('INV-2026-105');

    expect(result.receipt.status).toBe('FAILED_ROLLED_BACK');
    expect(result.receipt.post_execution_cash_balance).toBe(preTreasury.current_cash_balance);
    expect(result.error.error_code).toBe('ERR_ATOMIC_ROLLBACK_COMPLETED');
    expect(result.error.recoverable).toBe(true);

    const postTreasury = await adapter.getTreasurySummary();
    expect(postTreasury.current_cash_balance).toBe(preTreasury.current_cash_balance);
  });

  it('verifies SHA-256 cryptographic audit chain continuity', async () => {
    const verification = await adapter.verifyAuditChain();
    expect(verification.valid).toBe(true);
    expect(verification.envelopes_checked).toBeGreaterThanOrEqual(4);
    expect(verification.tamper_detected_at_trace_id).toBeNull();
  });
});
