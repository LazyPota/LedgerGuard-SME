import { z } from 'zod';

export const OperationalStateSchema = z.enum([
  'PROPOSED',
  'STAGED_TIER_2_ELIGIBLE',
  'PENDING_HITL_TIER_3',
  'BLOCKED_DISCREPANCY',
  'BLOCKED_SECURITY_VIOLATION',
  'APPROVED_AWAITING_EXECUTION',
  'SIMULATED_EXECUTED',
  'EXTERNALLY_EXECUTED',
  'FAILED_OR_ROLLED_BACK',
]);

export const PermissionTierSchema = z.enum([
  'TIER_0_READ',
  'TIER_1_STAGING',
  'TIER_2_BOUNDED_AUTO',
  'TIER_3_HITL_REQUIRED',
  'TIER_4_FORBIDDEN',
]);

export const ExecutionModeSchema = z.enum([
  'LIVE_BACKEND_SANDBOX',
  'OFFLINE_DETERMINISTIC_MOCK',
  'LOCAL_SIMULATED_LEDGER',
]);

export const LLMExtractorModeSchema = z.enum([
  'LIVE_STRUCTURED_OUTPUT',
  'DETERMINISTIC_FIXTURE_REPLAY',
]);

export const CurrencyCodeSchema = z.enum(['USD', 'EUR', 'GBP', 'SGD', 'CNY']);

export const HealthStatusResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'offline_mock']),
  execution_mode: ExecutionModeSchema,
  llm_extractor_mode: LLMExtractorModeSchema.optional(),
  offline_mode: z.boolean().optional(),
  policy_version: z.string().optional(),
  database_connected: z.boolean().optional(),
  audit_chain_valid: z.boolean().optional(),
  as_of_timestamp_utc: z.string().optional(),
});

export const DailyCashPointSchema = z.object({
  day_index: z.number(),
  date: z.string(),
  baseline_cash: z.string(),
  optimized_cash: z.string(),
  payroll_floor: z.string(),
  inflows: z.string(),
  outflows: z.string(),
  credit_draw: z.string(),
  credit_balance: z.string(),
  event_label: z.string().nullable(),
});

export const CreditFacilityRecordSchema = z.object({
  facility_id: z.string(),
  name: z.string(),
  facility_type: z.enum(['REVOLVING_LOC', 'DYNAMIC_DISCOUNTING_SCF', 'SHORT_TERM_LOAN']),
  credit_limit: z.string(),
  available_capacity: z.string(),
  apr_pct: z.string(),
  drawdown_fee_pct: z.string(),
  covenant_current_ratio_min: z.string(),
  current_ratio_actual: z.string(),
  covenant_compliant: z.boolean(),
  recommended_by_optimizer: z.boolean(),
  covenant_dscr_min: z.string().optional(),
  dscr_actual: z.string().optional(),
});

export const TreasurySummaryResponseSchema = z.object({
  currency: CurrencyCodeSchema,
  current_cash_balance: z.string(),
  payroll_reserve_floor: z.string(),
  next_payroll_date: z.string(),
  next_payroll_amount: z.string(),
  min_projected_30d_cash_baseline: z.string(),
  min_projected_30d_cash_optimized: z.string(),
  total_verified_payables_30d: z.string(),
  total_quarantined_payables: z.string(),
  net_30d_discount_savings_available: z.string(),
  daily_cash_trajectory: z.array(DailyCashPointSchema),
  credit_facilities: z.array(CreditFacilityRecordSchema),
});

export const InvoiceLineItemSchema = z.object({
  line_id: z.string(),
  raw_description: z.string(),
  mapped_po_sku: z.string(),
  unit_conversion_multiplier: z.string(),
  quantity_billed: z.string(),
  unit_price_billed: z.string(),
  line_total_billed: z.string(),
  mapping_confidence: z.number(),
  lexical_overlap_score: z.number(),
});

export const InvoiceExtractionSchema = z.object({
  vendor_id_claimed: z.string(),
  vendor_name_claimed: z.string(),
  iban_claimed: z.string(),
  currency: CurrencyCodeSchema,
  issue_date: z.string(),
  net_due_date: z.string(),
  net_due_days: z.number(),
  early_discount_pct: z.string(),
  early_discount_days: z.number(),
  early_discount_deadline: z.string().nullable(),
  referenced_po_id: z.string(),
  subtotal_claimed: z.string(),
  tax_claimed: z.string(),
  total_claimed: z.string(),
  raw_untrusted_memo: z.string(),
  suspicious_instructions_detected: z.boolean(),
  line_items: z.array(InvoiceLineItemSchema),
});

export const DiscrepancyFindingSchema = z.object({
  code: z.enum([
    'QUANTITY_EXCEEDS_GRN',
    'PRICE_EXCEEDS_PO',
    'MATH_EXTENSION_ERROR',
    'DUPLICATE_INVOICE_HASH',
    'MISSING_GRN',
    'LOW_LEXICAL_OVERLAP',
  ]),
  severity: z.enum(['WARNING', 'HIGH', 'CRITICAL']),
  line_sku: z.string().optional(),
  expected_value: z.string(),
  actual_value: z.string(),
  financial_impact_delta: z.string(),
  explanation: z.string(),
});

export const SecurityFindingSchema = z.object({
  owasp_id: z.enum(['ASI01_GOAL_HIJACK', 'ASI02_TOOL_MISUSE', 'BEC_IBAN_SWAP']),
  severity: z.literal('CRITICAL'),
  trigger_excerpt_escaped: z.string(),
  policy_rule_id: z.string(),
  action_taken: z.string(),
});

export const ReconciliationFindingsSchema = z.object({
  overall_match_status: z.enum([
    'VERIFIED_ELIGIBLE',
    'QUARANTINED_DISCREPANCY',
    'PENDING_GRN_ATTESTATION',
    'BLOCKED_SECURITY_VIOLATION',
  ]),
  math_reconciled: z.boolean(),
  computed_subtotal: z.string(),
  computed_tax: z.string(),
  computed_total: z.string(),
  discrepancies: z.array(DiscrepancyFindingSchema),
  security_flags: z.array(SecurityFindingSchema),
});

export const POLineItemSchema = z.object({
  sku: z.string(),
  description: z.string(),
  unit_of_measure: z.string(),
  quantity_ordered: z.string(),
  unit_price_contracted: z.string(),
  line_total: z.string(),
});

export const PurchaseOrderRecordSchema = z.object({
  po_id: z.string(),
  vendor_id: z.string(),
  order_date: z.string(),
  status: z.string(),
  line_items: z.array(POLineItemSchema),
});

export const GRNLineItemSchema = z.object({
  sku: z.string(),
  quantity_received: z.string(),
  quantity_accepted: z.string(),
  condition_notes: z.string(),
});

export const GoodsReceiptNoteRecordSchema = z.object({
  grn_id: z.string(),
  po_id: z.string(),
  received_date: z.string(),
  warehouse_verified_by: z.string(),
  line_items: z.array(GRNLineItemSchema),
});

export const VendorMasterCheckSchema = z.object({
  vendor_id: z.string(),
  legal_name: z.string(),
  approved_iban_masked: z.string(),
  iban_exact_match: z.boolean(),
  bank_change_requested_in_invoice: z.boolean(),
});

export const ThreeWayMatchRecordSchema = z.object({
  purchase_order: PurchaseOrderRecordSchema.nullable(),
  goods_receipt_note: GoodsReceiptNoteRecordSchema.nullable(),
  vendor_master_check: VendorMasterCheckSchema,
  reconciliation_findings: ReconciliationFindingsSchema,
});

export const LiquidityDecisionRecordSchema = z.object({
  recommended_strategy: z.enum([
    'CAPTURE_EARLY_DISCOUNT_SELF_FUNDED',
    'CAPTURE_EARLY_DISCOUNT_WITH_CREDIT_BRIDGE',
    'DEFER_TO_NET_DUE_DATE',
    'HOLD_QUARANTINED',
  ]),
  nominal_invoice_amount: z.string(),
  discounted_payment_amount: z.string(),
  gross_discount_amount: z.string(),
  discount_effective_apr_pct: z.string(),
  discount_effective_ear_pct: z.string(),
  selected_payment_date: z.string(),
  requires_credit_bridge: z.boolean(),
  matched_credit_facility_id: z.string().nullable(),
  bridge_draw_amount: z.string(),
  bridge_duration_days: z.number(),
  bridge_interest_and_fee_cost: z.string(),
  net_economic_benefit: z.string(),
  post_action_min_30d_cash: z.string(),
  respects_payroll_floor: z.boolean(),
  deterministic_rationale: z.string(),
});

export const InvoiceRecordSchema = z.object({
  invoice_id: z.string(),
  invoice_number: z.string(),
  document_sha256: z.string(),
  operational_state: OperationalStateSchema,
  permission_tier: PermissionTierSchema,
  extraction: InvoiceExtractionSchema,
  three_way_match: ThreeWayMatchRecordSchema,
  liquidity_decision: LiquidityDecisionRecordSchema,
});

export const SubmitApprovalDecisionRequestSchema = z.object({
  approval_id: z.string(),
  invoice_id: z.string(),
  decision: z.enum(['APPROVE_EXECUTION', 'REJECT_AND_QUARANTINE', 'ESCALATE_VENDOR_DISPUTE']),
  approver_id: z.string(),
  approver_role: z.enum(['FINANCE_MANAGER', 'TREASURY_CONTROLLER']),
  confirmed_total_amount: z.string(),
  confirmed_iban_tail: z.string(),
  reviewer_notes: z.string(),
  idempotency_key: z.string(),
});

export const ExecutionReceiptSchema = z.object({
  execution_id: z.string(),
  credit_draw_execution_id: z.string().nullable(),
  execution_environment: z.literal('SANDBOX_SIMULATION'),
  invoice_id: z.string(),
  status: z.enum(['SIMULATED_EXECUTED', 'IDEMPOTENT_REPLAY_NOOP', 'FAILED_ROLLED_BACK']),
  idempotency_key: z.string(),
  pre_execution_cash_balance: z.string(),
  disbursed_amount: z.string(),
  credit_drawn_amount: z.string(),
  post_execution_cash_balance: z.string(),
  post_state_invariant_verified: z.boolean(),
  executed_at_utc: z.string(),
  decision_envelope_trace_id: z.string(),
  failure_reason: z.string().optional(),
});

export const ForensicDecisionEnvelopeSchema = z.object({
  envelope_version: z.literal('1.0.0'),
  trace_id: z.string(),
  timestamp_utc: z.string(),
  previous_envelope_hash: z.string(),
  current_envelope_hash: z.string(),
  input_document_sha256: z.string(),
  actor_identity: z.string(),
  permission_tier: PermissionTierSchema,
  opa_policy_verdict: z.enum([
    'ALLOW',
    'ALLOW_WITH_VALID_HUMAN_SIGNATURE',
    'DENY_SECURITY_POLICY',
    'DENY_DISCREPANCY',
  ]),
  three_way_match_summary: z.record(z.unknown()),
  working_capital_optimization_summary: z.record(z.unknown()),
  sandbox_execution_verification: z.record(z.unknown()),
});

export const ApiErrorEnvelopeSchema = z.object({
  error_code: z.string(),
  message: z.string(),
  severity: z.enum(['WARNING', 'ERROR', 'CRITICAL_SECURITY']),
  trace_id: z.string(),
  violated_policy_rule: z.string().optional(),
  suggested_operator_action: z.string(),
  recoverable: z.boolean(),
});
