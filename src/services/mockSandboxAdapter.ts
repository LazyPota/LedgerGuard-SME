import {
  HealthStatusResponse,
  TreasurySummaryResponse,
  InvoiceRecord,
  IngestInvoiceRequest,
  SubmitApprovalDecisionRequest,
  TriggerAutoExecutionRequest,
  ExecutionReceipt,
  ForensicDecisionEnvelope,
  VerifyChainResponse,
  DisputeDraftResponse,
  ApiErrorEnvelope,
} from '@/contracts/ledgerGuardContract';
import {
  BENCHMARK_INVOICES,
  INITIAL_TREASURY_SUMMARY,
  INITIAL_AUDIT_ENVELOPES,
} from './benchmarkData';

export class MockSandboxAdapter {
  private invoices: InvoiceRecord[] = [];
  private treasury: TreasurySummaryResponse;
  private executions: ExecutionReceipt[] = [];
  private envelopes: ForensicDecisionEnvelope[] = [];
  private idempotencyStore = new Map<string, ExecutionReceipt>();
  private executionCounter = 99200;

  constructor() {
    this.treasury = JSON.parse(JSON.stringify(INITIAL_TREASURY_SUMMARY));
    this.invoices = JSON.parse(JSON.stringify(BENCHMARK_INVOICES));
    this.envelopes = JSON.parse(JSON.stringify(INITIAL_AUDIT_ENVELOPES));
  }

  public async getHealth(): Promise<HealthStatusResponse> {
    return {
      status: 'ok',
      execution_mode: 'OFFLINE_DETERMINISTIC_MOCK',
      llm_extractor_mode: 'DETERMINISTIC_FIXTURE_REPLAY',
      database_connected: true,
      audit_chain_valid: true,
      as_of_timestamp_utc: new Date().toISOString(),
    };
  }

  public async getTreasurySummary(): Promise<TreasurySummaryResponse> {
    return JSON.parse(JSON.stringify(this.treasury));
  }

  public async getInvoices(): Promise<InvoiceRecord[]> {
    return JSON.parse(JSON.stringify(this.invoices));
  }

  public async getInvoice(invoiceId: string): Promise<InvoiceRecord | null> {
    const inv = this.invoices.find((i) => i.invoice_id === invoiceId);
    return inv ? JSON.parse(JSON.stringify(inv)) : null;
  }

  public async ingestBenchmarkBatch(): Promise<InvoiceRecord[]> {
    this.invoices = JSON.parse(JSON.stringify(BENCHMARK_INVOICES));
    return this.getInvoices();
  }

  public async ingestCustomInvoice(req: IngestInvoiceRequest): Promise<InvoiceRecord> {
    const customId = `INV-2026-${Math.floor(100 + Math.random() * 900)}`;
    const newInvoice: InvoiceRecord = {
      invoice_id: customId,
      invoice_number: `INV-CUSTOM-${Math.floor(1000 + Math.random() * 9000)}`,
      document_sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
      operational_state: 'PROPOSED',
      permission_tier: 'TIER_1_STAGING',
      extraction: {
        vendor_id_claimed: 'VND-CUSTOM-001',
        vendor_name_claimed: 'Custom Test Supplier Corp',
        iban_claimed: 'US89CITI00005521',
        currency: 'USD',
        issue_date: new Date().toISOString().split('T')[0],
        net_due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        net_due_days: 30,
        early_discount_pct: '0.00',
        early_discount_days: 0,
        early_discount_deadline: null,
        referenced_po_id: 'PO-2026-CUSTOM',
        subtotal_claimed: '5000.00',
        tax_claimed: '0.00',
        total_claimed: '5000.00',
        raw_untrusted_memo: req.raw_payload ? JSON.stringify(req.raw_payload) : 'Custom ingested invoice payload.',
        suspicious_instructions_detected: false,
        line_items: [
          {
            line_id: `L-${customId}-1`,
            raw_description: 'Custom Supplies and Hardware Units',
            mapped_po_sku: 'SKU-CUSTOM-HARDWARE',
            unit_conversion_multiplier: '1',
            quantity_billed: '10',
            unit_price_billed: '500.00',
            line_total_billed: '5000.00',
            mapping_confidence: 0.95,
            lexical_overlap_score: 0.92,
          },
        ],
      },
      three_way_match: {
        purchase_order: {
          po_id: 'PO-2026-CUSTOM',
          vendor_id: 'VND-CUSTOM-001',
          order_date: new Date().toISOString().split('T')[0],
          status: 'OPEN_CONFIRMED',
          line_items: [
            {
              sku: 'SKU-CUSTOM-HARDWARE',
              description: 'Custom Supplies and Hardware Units',
              unit_of_measure: 'EA',
              quantity_ordered: '10',
              unit_price_contracted: '500.00',
              line_total: '5000.00',
            },
          ],
        },
        goods_receipt_note: {
          grn_id: 'GRN-2026-CUSTOM',
          po_id: 'PO-2026-CUSTOM',
          received_date: new Date().toISOString().split('T')[0],
          warehouse_verified_by: 'Inspector General',
          line_items: [
            {
              sku: 'SKU-CUSTOM-HARDWARE',
              quantity_received: '10',
              quantity_accepted: '10',
              condition_notes: 'All items verified.',
            },
          ],
        },
        vendor_master_check: {
          vendor_id: 'VND-CUSTOM-001',
          legal_name: 'Custom Test Supplier Corp',
          approved_iban_masked: 'US89CITI****5521',
          iban_exact_match: true,
          bank_change_requested_in_invoice: false,
        },
        reconciliation_findings: {
          overall_match_status: 'VERIFIED_ELIGIBLE',
          math_reconciled: true,
          computed_subtotal: '5000.00',
          computed_tax: '0.00',
          computed_total: '5000.00',
          discrepancies: [],
          security_flags: [],
        },
      },
      liquidity_decision: {
        recommended_strategy: 'DEFER_TO_NET_DUE_DATE',
        nominal_invoice_amount: '5000.00',
        discounted_payment_amount: '5000.00',
        gross_discount_amount: '0.00',
        discount_effective_apr_pct: '0.00',
        discount_effective_ear_pct: '0.00',
        selected_payment_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        requires_credit_bridge: false,
        matched_credit_facility_id: null,
        bridge_draw_amount: '0.00',
        bridge_duration_days: 0,
        bridge_interest_and_fee_cost: '0.00',
        net_economic_benefit: '0.00',
        post_action_min_30d_cash: '72200.00',
        respects_payroll_floor: true,
        deterministic_rationale: 'Verified custom 3-way match. Staged for disbursement review.',
      },
    };

    this.invoices.push(newInvoice);
    return JSON.parse(JSON.stringify(newInvoice));
  }

  public async submitApprovalDecision(
    req: SubmitApprovalDecisionRequest
  ): Promise<{ status: string; receipt?: ExecutionReceipt; envelope?: ForensicDecisionEnvelope }> {
    const invoice = this.invoices.find((i) => i.invoice_id === req.invoice_id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${req.invoice_id}`);
    }

    if (req.decision === 'REJECT_AND_QUARANTINE') {
      invoice.operational_state = 'BLOCKED_DISCREPANCY';
      return { status: 'REJECTED_AND_QUARANTINED' };
    }

    if (req.decision === 'ESCALATE_VENDOR_DISPUTE') {
      invoice.operational_state = 'BLOCKED_DISCREPANCY';
      return { status: 'DISPUTE_ESCALATED' };
    }

    // Idempotency check
    if (this.idempotencyStore.has(req.idempotency_key)) {
      const existing = this.idempotencyStore.get(req.idempotency_key)!;
      return {
        status: 'IDEMPOTENT_REPLAY_NOOP',
        receipt: { ...existing, status: 'IDEMPOTENT_REPLAY_NOOP' },
      };
    }

    this.executionCounter += 1;
    const executionId = `SBX-PAY-${this.executionCounter}`;
    const creditDrawId = invoice.liquidity_decision.requires_credit_bridge
      ? `SBX-LOC-${this.executionCounter - 55100}`
      : null;

    const preBalance = this.treasury.current_cash_balance;
    const preNum = parseFloat(preBalance);
    const disburseNum = parseFloat(invoice.liquidity_decision.discounted_payment_amount);
    const drawNum = parseFloat(invoice.liquidity_decision.bridge_draw_amount);
    const postNum = preNum - disburseNum + drawNum;
    const postBalance = postNum.toFixed(2);

    this.treasury.current_cash_balance = postBalance;
    invoice.operational_state = 'SIMULATED_EXECUTED';

    const traceId = `trc_20261110_${Math.floor(1000 + Math.random() * 9000)}`;

    const receipt: ExecutionReceipt = {
      execution_id: executionId,
      credit_draw_execution_id: creditDrawId,
      execution_environment: 'SANDBOX_SIMULATION',
      invoice_id: invoice.invoice_id,
      status: 'SIMULATED_EXECUTED',
      idempotency_key: req.idempotency_key,
      pre_execution_cash_balance: preBalance,
      disbursed_amount: invoice.liquidity_decision.discounted_payment_amount,
      credit_drawn_amount: invoice.liquidity_decision.bridge_draw_amount,
      post_execution_cash_balance: postBalance,
      post_state_invariant_verified: true,
      executed_at_utc: new Date().toISOString(),
      decision_envelope_trace_id: traceId,
    };

    this.executions.unshift(receipt);
    this.idempotencyStore.set(req.idempotency_key, receipt);

    const prevHash = this.envelopes[this.envelopes.length - 1]?.current_envelope_hash || '0000000000000000000000000000000000000000000000000000000000000000';
    const newEnvelope: ForensicDecisionEnvelope = {
      envelope_version: '1.0.0',
      trace_id: traceId,
      timestamp_utc: new Date().toISOString(),
      previous_envelope_hash: prevHash,
      current_envelope_hash: this.generateSimulatedHash(prevHash + invoice.document_sha256 + req.approver_id),
      input_document_sha256: invoice.document_sha256,
      actor_identity: `human:${req.approver_id}:${req.approver_role}`,
      permission_tier: 'TIER_3_HITL_REQUIRED',
      opa_policy_verdict: 'ALLOW_WITH_VALID_HUMAN_SIGNATURE',
      three_way_match_summary: {
        invoice_id: invoice.invoice_id,
        status: 'VERIFIED_ELIGIBLE',
      },
      working_capital_optimization_summary: {
        strategy: invoice.liquidity_decision.recommended_strategy,
        disbursed: receipt.disbursed_amount,
        bridge_drawn: receipt.credit_drawn_amount,
      },
      sandbox_execution_verification: {
        execution_id: receipt.execution_id,
        post_balance: receipt.post_execution_cash_balance,
        invariant_pass: true,
      },
    };

    this.envelopes.push(newEnvelope);

    return {
      status: 'SIMULATED_EXECUTED',
      receipt,
      envelope: newEnvelope,
    };
  }

  public async triggerTier2AutoExecution(
    req: TriggerAutoExecutionRequest
  ): Promise<ExecutionReceipt> {
    const invoice = this.invoices.find((i) => i.invoice_id === req.invoice_id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${req.invoice_id}`);
    }

    if (invoice.permission_tier !== 'TIER_2_BOUNDED_AUTO') {
      throw new Error(`Invoice ${invoice.invoice_id} is not eligible for Tier-2 bounded auto-execution.`);
    }

    // Idempotency check
    if (this.idempotencyStore.has(req.idempotency_key)) {
      const existing = this.idempotencyStore.get(req.idempotency_key)!;
      return {
        ...existing,
        status: 'IDEMPOTENT_REPLAY_NOOP',
      };
    }

    this.executionCounter += 1;
    const executionId = `SBX-PAY-${this.executionCounter}`;

    const preBalance = this.treasury.current_cash_balance;
    const preNum = parseFloat(preBalance);
    const disburseNum = parseFloat(invoice.liquidity_decision.discounted_payment_amount);
    const postBalance = (preNum - disburseNum).toFixed(2);

    this.treasury.current_cash_balance = postBalance;
    invoice.operational_state = 'SIMULATED_EXECUTED';

    const traceId = `trc_20261109_${Math.floor(1000 + Math.random() * 9000)}`;

    const receipt: ExecutionReceipt = {
      execution_id: executionId,
      credit_draw_execution_id: null,
      execution_environment: 'SANDBOX_SIMULATION',
      invoice_id: invoice.invoice_id,
      status: 'SIMULATED_EXECUTED',
      idempotency_key: req.idempotency_key,
      pre_execution_cash_balance: preBalance,
      disbursed_amount: invoice.liquidity_decision.discounted_payment_amount,
      credit_drawn_amount: '0.00',
      post_execution_cash_balance: postBalance,
      post_state_invariant_verified: true,
      executed_at_utc: new Date().toISOString(),
      decision_envelope_trace_id: traceId,
    };

    this.executions.unshift(receipt);
    this.idempotencyStore.set(req.idempotency_key, receipt);

    const prevHash = this.envelopes[this.envelopes.length - 1]?.current_envelope_hash || '0000000000000000000000000000000000000000000000000000000000000000';
    const newEnvelope: ForensicDecisionEnvelope = {
      envelope_version: '1.0.0',
      trace_id: traceId,
      timestamp_utc: new Date().toISOString(),
      previous_envelope_hash: prevHash,
      current_envelope_hash: this.generateSimulatedHash(prevHash + invoice.document_sha256 + req.operator_id),
      input_document_sha256: invoice.document_sha256,
      actor_identity: `agent:bounded-auto-executor:${req.operator_id}`,
      permission_tier: 'TIER_2_BOUNDED_AUTO',
      opa_policy_verdict: 'ALLOW',
      three_way_match_summary: {
        invoice_id: invoice.invoice_id,
        amount: receipt.disbursed_amount,
      },
      working_capital_optimization_summary: {
        strategy: 'DEFER_TO_NET_DUE_DATE',
      },
      sandbox_execution_verification: {
        execution_id: receipt.execution_id,
        invariant_pass: true,
      },
    };

    this.envelopes.push(newEnvelope);

    return receipt;
  }

  public async getExecutions(): Promise<ExecutionReceipt[]> {
    return JSON.parse(JSON.stringify(this.executions));
  }

  public async getAuditEnvelopes(): Promise<ForensicDecisionEnvelope[]> {
    return JSON.parse(JSON.stringify(this.envelopes));
  }

  public async verifyAuditChain(): Promise<VerifyChainResponse> {
    if (this.envelopes.length === 0) {
      return {
        valid: true,
        envelopes_checked: 0,
        genesis_hash: 'none',
        latest_hash: 'none',
        tamper_detected_at_trace_id: null,
        message: 'Chain is empty but valid.',
      };
    }

    let valid = true;
    let tamperTrace: string | null = null;

    for (let i = 1; i < this.envelopes.length; i++) {
      const prev = this.envelopes[i - 1];
      const curr = this.envelopes[i];
      if (curr.previous_envelope_hash !== prev.current_envelope_hash) {
        valid = false;
        tamperTrace = curr.trace_id;
        break;
      }
    }

    return {
      valid,
      envelopes_checked: this.envelopes.length,
      genesis_hash: this.envelopes[0].current_envelope_hash,
      latest_hash: this.envelopes[this.envelopes.length - 1].current_envelope_hash,
      tamper_detected_at_trace_id: tamperTrace,
      message: valid
        ? `Cryptographic SHA-256 chain verified. All ${this.envelopes.length} decision envelopes intact.`
        : `Hash chain mismatch detected at envelope trace: ${tamperTrace}`,
    };
  }

  public async generateDebitNote(invoiceId: string): Promise<DisputeDraftResponse> {
    const invoice = this.invoices.find((i) => i.invoice_id === invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    const po = invoice.three_way_match.purchase_order;
    const grn = invoice.three_way_match.goods_receipt_note;
    const delta = invoice.three_way_match.reconciliation_findings.discrepancies[0]?.financial_impact_delta || '0.00';

    return {
      dispute_id: `DISP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      invoice_id: invoice.invoice_id,
      vendor_id: invoice.extraction.vendor_id_claimed,
      vendor_legal_name: invoice.three_way_match.vendor_master_check.legal_name,
      dispute_reason: 'Quantity billed exceeds goods received and accepted on warehouse inspection.',
      referenced_po_id: po?.po_id || 'UNKNOWN_PO',
      referenced_grn_id: grn?.grn_id || 'UNKNOWN_GRN',
      total_billed_amount: invoice.extraction.total_claimed,
      adjusted_payable_amount: invoice.three_way_match.reconciliation_findings.computed_total,
      debit_note_delta: delta,
      draft_letter_markdown: `**FORMAL VENDOR DEBIT NOTE & BILLING DISPUTE NOTICE**\n\n**To:** Accounts Receivable, ${invoice.three_way_match.vendor_master_check.legal_name}\n**From:** AP Treasury Operations, LedgerGuard-SME\n**Date:** ${new Date().toISOString().split('T')[0]}\n**Subject:** Invoice Discrepancy Notification for ${invoice.invoice_number}\n\nDear Partner,\n\nOur automated 3-way reconciliation audit has identified a line-item billing discrepancy between your invoice **${invoice.invoice_number}** and warehouse receiving record **${grn?.grn_id}** associated with **${po?.po_id}**.\n\n- **Billed Amount:** $${invoice.extraction.total_claimed}\n- **Verified Received Value:** $${invoice.three_way_match.reconciliation_findings.computed_total}\n- **Debit Adjustment (Overbill):** $${delta}\n\nPlease issue an amended commercial invoice or debit memorandum in the amount of **$${delta}** to reconcile accounts.\n\nSincerely,\nAP Controller, LedgerGuard-SME`,
      generated_at_utc: new Date().toISOString(),
    };
  }

  public async attestWarehouseGrn(invoiceId: string): Promise<InvoiceRecord> {
    const invoice = this.invoices.find((i) => i.invoice_id === invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    invoice.three_way_match.goods_receipt_note = {
      grn_id: `GRN-2026-${Math.floor(400 + Math.random() * 90)}`,
      po_id: invoice.extraction.referenced_po_id,
      received_date: new Date().toISOString().split('T')[0],
      warehouse_verified_by: 'Dock Supervisor (Attested via LedgerGuard)',
      line_items: [
        {
          sku: invoice.extraction.line_items[0].mapped_po_sku,
          quantity_received: invoice.extraction.line_items[0].quantity_billed,
          quantity_accepted: invoice.extraction.line_items[0].quantity_billed,
          condition_notes: 'Attested and verified by warehouse lead in sandbox.',
        },
      ],
    };

    invoice.three_way_match.reconciliation_findings.overall_match_status = 'VERIFIED_ELIGIBLE';
    invoice.three_way_match.reconciliation_findings.discrepancies = [];
    invoice.operational_state = 'STAGED_TIER_2_ELIGIBLE';
    invoice.permission_tier = 'TIER_2_BOUNDED_AUTO';

    return JSON.parse(JSON.stringify(invoice));
  }

  public async simulateAtomicRollback(invoiceId: string): Promise<{ receipt: ExecutionReceipt; error: ApiErrorEnvelope }> {
    const invoice = this.invoices.find((i) => i.invoice_id === invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${invoiceId}`);
    }

    const initialCash = this.treasury.current_cash_balance;
    this.executionCounter += 1;
    const executionId = `SBX-ERR-${this.executionCounter}`;
    const traceId = `trc_rollback_${Math.floor(1000 + Math.random() * 9000)}`;

    const rollbackReceipt: ExecutionReceipt = {
      execution_id: executionId,
      credit_draw_execution_id: null,
      execution_environment: 'SANDBOX_SIMULATION',
      invoice_id: invoice.invoice_id,
      status: 'FAILED_ROLLED_BACK',
      idempotency_key: `idemp_err_${Date.now()}`,
      pre_execution_cash_balance: initialCash,
      disbursed_amount: '0.00',
      credit_drawn_amount: '0.00',
      post_execution_cash_balance: initialCash, // Cash balance unchanged!
      post_state_invariant_verified: true,
      executed_at_utc: new Date().toISOString(),
      decision_envelope_trace_id: traceId,
      failure_reason: 'Simulated mid-transaction lock conflict & post-state covenant floor breach tripped.',
    };

    this.executions.unshift(rollbackReceipt);

    const errorEnvelope: ApiErrorEnvelope = {
      error_code: 'ERR_ATOMIC_ROLLBACK_COMPLETED',
      message: 'Simulated mid-flight transaction conflict detected. All database writes aborted and sandbox cash state atomically preserved.',
      severity: 'ERROR',
      trace_id: traceId,
      violated_policy_rule: 'POLICY_ACID_POST_STATE_INVARIANT',
      suggested_operator_action: 'Verify liquidity facility covenants or retry execution after queue clears.',
      recoverable: true,
    };

    return { receipt: rollbackReceipt, error: errorEnvelope };
  }

  public async resetBenchmarkBatch(): Promise<void> {
    this.treasury = JSON.parse(JSON.stringify(INITIAL_TREASURY_SUMMARY));
    this.invoices = JSON.parse(JSON.stringify(BENCHMARK_INVOICES));
    this.envelopes = JSON.parse(JSON.stringify(INITIAL_AUDIT_ENVELOPES));
    this.executions = [];
    this.idempotencyStore.clear();
  }

  private generateSimulatedHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `${hex}a59c72e410d8f288b431e6702c5f1e8a93cb0248e58dae21976a440e29b1`;
  }
}

export const mockSandboxAdapter = new MockSandboxAdapter();
