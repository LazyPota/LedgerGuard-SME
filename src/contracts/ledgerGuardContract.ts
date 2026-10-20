/**
 * LedgerGuard-SME Shared Integration Contract
 * 2026 Shenzhen International FinTech Competition — Topic E: SME Finance Copilot
 *
 * All monetary values, deltas, yields, and cash trajectories are strictly typed
 * as exact decimal strings to prevent browser IEEE-754 floating-point inaccuracies.
 */

export type OperationalState =
  | 'PROPOSED'
  | 'STAGED_TIER_2_ELIGIBLE'
  | 'PENDING_HITL_TIER_3'
  | 'BLOCKED_DISCREPANCY'
  | 'BLOCKED_SECURITY_VIOLATION'
  | 'APPROVED_AWAITING_EXECUTION'
  | 'SIMULATED_EXECUTED'
  | 'EXTERNALLY_EXECUTED'
  | 'FAILED_OR_ROLLED_BACK';

export type PermissionTier =
  | 'TIER_0_READ'
  | 'TIER_1_STAGING'
  | 'TIER_2_BOUNDED_AUTO'
  | 'TIER_3_HITL_REQUIRED'
  | 'TIER_4_FORBIDDEN';

export type ExecutionMode = 'LIVE_BACKEND_SANDBOX' | 'OFFLINE_DETERMINISTIC_MOCK' | 'LOCAL_SIMULATED_LEDGER';
export type LLMExtractorMode = 'LIVE_STRUCTURED_OUTPUT' | 'DETERMINISTIC_FIXTURE_REPLAY';
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'SGD' | 'CNY';

export interface HealthStatusResponse {
  status: 'ok' | 'degraded' | 'offline_mock';
  execution_mode: ExecutionMode;
  llm_extractor_mode?: LLMExtractorMode;
  offline_mode?: boolean;
  policy_version?: string;
  database_connected?: boolean;
  audit_chain_valid?: boolean;
  as_of_timestamp_utc?: string;
}

export interface DailyCashPoint {
  day_index: number;
  date: string; // YYYY-MM-DD
  baseline_cash: string;
  optimized_cash: string;
  payroll_floor: string;
  inflows: string;
  outflows: string;
  credit_draw: string;
  credit_balance: string;
  event_label: string | null;
}

export interface CreditFacilityRecord {
  facility_id: string;
  name: string;
  facility_type: 'REVOLVING_LOC' | 'DYNAMIC_DISCOUNTING_SCF' | 'SHORT_TERM_LOAN';
  credit_limit: string;
  available_capacity: string;
  apr_pct: string;
  drawdown_fee_pct: string;
  covenant_current_ratio_min: string;
  current_ratio_actual: string;
  covenant_compliant: boolean;
  recommended_by_optimizer: boolean;
  covenant_dscr_min?: string;
  dscr_actual?: string;
}

export interface TreasurySummaryResponse {
  currency: CurrencyCode;
  current_cash_balance: string;
  payroll_reserve_floor: string;
  next_payroll_date: string;
  next_payroll_amount: string;
  min_projected_30d_cash_baseline: string;
  min_projected_30d_cash_optimized: string;
  total_verified_payables_30d: string;
  total_quarantined_payables: string;
  net_30d_discount_savings_available: string;
  daily_cash_trajectory: DailyCashPoint[];
  credit_facilities: CreditFacilityRecord[];
}

export interface InvoiceLineItem {
  line_id: string;
  raw_description: string;
  mapped_po_sku: string;
  unit_conversion_multiplier: string;
  quantity_billed: string;
  unit_price_billed: string;
  line_total_billed: string;
  mapping_confidence: number;
  lexical_overlap_score: number;
}

export interface InvoiceExtraction {
  vendor_id_claimed: string;
  vendor_name_claimed: string;
  iban_claimed: string;
  currency: CurrencyCode;
  issue_date: string;
  net_due_date: string;
  net_due_days: number;
  early_discount_pct: string;
  early_discount_days: number;
  early_discount_deadline: string | null;
  referenced_po_id: string;
  subtotal_claimed: string;
  tax_claimed: string;
  total_claimed: string;
  raw_untrusted_memo: string;
  suspicious_instructions_detected: boolean;
  line_items: InvoiceLineItem[];
}

export interface POLineItem {
  sku: string;
  description: string;
  unit_of_measure: string;
  quantity_ordered: string;
  unit_price_contracted: string;
  line_total: string;
}

export interface PurchaseOrderRecord {
  po_id: string;
  vendor_id: string;
  order_date: string;
  status: string;
  line_items: POLineItem[];
}

export interface GRNLineItem {
  sku: string;
  quantity_received: string;
  quantity_accepted: string;
  condition_notes: string;
}

export interface GoodsReceiptNoteRecord {
  grn_id: string;
  po_id: string;
  received_date: string;
  warehouse_verified_by: string;
  line_items: GRNLineItem[];
}

export interface VendorMasterCheck {
  vendor_id: string;
  legal_name: string;
  approved_iban_masked: string;
  iban_exact_match: boolean;
  bank_change_requested_in_invoice: boolean;
}

export interface DiscrepancyFinding {
  code:
    | 'QUANTITY_EXCEEDS_GRN'
    | 'PRICE_EXCEEDS_PO'
    | 'MATH_EXTENSION_ERROR'
    | 'DUPLICATE_INVOICE_HASH'
    | 'MISSING_GRN'
    | 'LOW_LEXICAL_OVERLAP';
  severity: 'WARNING' | 'HIGH' | 'CRITICAL';
  line_sku?: string;
  expected_value: string;
  actual_value: string;
  financial_impact_delta: string;
  explanation: string;
}

export interface SecurityFinding {
  owasp_id: 'ASI01_GOAL_HIJACK' | 'ASI02_TOOL_MISUSE' | 'BEC_IBAN_SWAP';
  severity: 'CRITICAL';
  trigger_excerpt_escaped: string;
  policy_rule_id: string;
  action_taken: string;
}

export interface ReconciliationFindings {
  overall_match_status:
    | 'VERIFIED_ELIGIBLE'
    | 'QUARANTINED_DISCREPANCY'
    | 'PENDING_GRN_ATTESTATION'
    | 'BLOCKED_SECURITY_VIOLATION';
  math_reconciled: boolean;
  computed_subtotal: string;
  computed_tax: string;
  computed_total: string;
  discrepancies: DiscrepancyFinding[];
  security_flags: SecurityFinding[];
}

export interface ThreeWayMatchRecord {
  purchase_order: PurchaseOrderRecord | null;
  goods_receipt_note: GoodsReceiptNoteRecord | null;
  vendor_master_check: VendorMasterCheck;
  reconciliation_findings: ReconciliationFindings;
}

export type LiquidityStrategy =
  | 'CAPTURE_EARLY_DISCOUNT_SELF_FUNDED'
  | 'CAPTURE_EARLY_DISCOUNT_WITH_CREDIT_BRIDGE'
  | 'DEFER_TO_NET_DUE_DATE'
  | 'HOLD_QUARANTINED';

export interface LiquidityDecisionRecord {
  recommended_strategy: LiquidityStrategy;
  nominal_invoice_amount: string;
  discounted_payment_amount: string;
  gross_discount_amount: string;
  discount_effective_apr_pct: string;
  discount_effective_ear_pct: string;
  selected_payment_date: string;
  requires_credit_bridge: boolean;
  matched_credit_facility_id: string | null;
  bridge_draw_amount: string;
  bridge_duration_days: number;
  bridge_interest_and_fee_cost: string;
  net_economic_benefit: string;
  post_action_min_30d_cash: string;
  respects_payroll_floor: boolean;
  deterministic_rationale: string;
}

export interface InvoiceRecord {
  invoice_id: string;
  invoice_number: string;
  document_sha256: string;
  operational_state: OperationalState;
  permission_tier: PermissionTier;
  extraction: InvoiceExtraction;
  three_way_match: ThreeWayMatchRecord;
  liquidity_decision: LiquidityDecisionRecord;
}

export interface IngestInvoiceRequest {
  batch_id?: string;
  document_source: 'SEEDED_BENCHMARK_BATCH' | 'UPLOADED_JSON_PDF';
  raw_payload?: unknown;
}

export interface SubmitApprovalDecisionRequest {
  approval_id: string;
  invoice_id: string;
  decision: 'APPROVE_EXECUTION' | 'REJECT_AND_QUARANTINE' | 'ESCALATE_VENDOR_DISPUTE';
  approver_id: string;
  approver_role: 'FINANCE_MANAGER' | 'TREASURY_CONTROLLER';
  confirmed_total_amount: string;
  confirmed_iban_tail: string;
  reviewer_notes: string;
  idempotency_key: string;
}

export interface ApprovalQueueItem {
  approval_id: string;
  invoice_id: string;
  invoice_number: string;
  vendor_name: string;
  total_amount: string;
  permission_tier: PermissionTier;
  reason_required: string;
  staged_at_utc: string;
  suggested_action: string;
  bridge_facility_id: string | null;
  bridge_draw_amount: string | null;
}

export interface ExecutionReceipt {
  execution_id: string;
  credit_draw_execution_id: string | null;
  execution_environment: 'SANDBOX_SIMULATION';
  invoice_id: string;
  status: 'SIMULATED_EXECUTED' | 'IDEMPOTENT_REPLAY_NOOP' | 'FAILED_ROLLED_BACK';
  idempotency_key: string;
  pre_execution_cash_balance: string;
  disbursed_amount: string;
  credit_drawn_amount: string;
  post_execution_cash_balance: string;
  post_state_invariant_verified: boolean;
  executed_at_utc: string;
  decision_envelope_trace_id: string;
  failure_reason?: string;
}

export interface TriggerAutoExecutionRequest {
  invoice_id: string;
  idempotency_key: string;
  operator_id: string;
}

export interface ForensicDecisionEnvelope {
  envelope_version: '1.0.0';
  trace_id: string;
  timestamp_utc: string;
  previous_envelope_hash: string;
  current_envelope_hash: string;
  input_document_sha256: string;
  actor_identity: string;
  permission_tier: PermissionTier;
  opa_policy_verdict:
    | 'ALLOW'
    | 'ALLOW_WITH_VALID_HUMAN_SIGNATURE'
    | 'DENY_SECURITY_POLICY'
    | 'DENY_DISCREPANCY';
  three_way_match_summary: Record<string, unknown>;
  working_capital_optimization_summary: Record<string, unknown>;
  sandbox_execution_verification: Record<string, unknown>;
}

export interface VerifyChainResponse {
  valid: boolean;
  envelopes_checked: number;
  genesis_hash: string;
  latest_hash: string;
  tamper_detected_at_trace_id: string | null;
  message: string;
}

export interface ApiErrorEnvelope {
  error_code: string;
  message: string;
  severity: 'WARNING' | 'ERROR' | 'CRITICAL_SECURITY';
  trace_id: string;
  violated_policy_rule?: string;
  suggested_operator_action: string;
  recoverable: boolean;
}

export interface DisputeDraftResponse {
  dispute_id: string;
  invoice_id: string;
  vendor_id: string;
  vendor_legal_name: string;
  dispute_reason: string;
  referenced_po_id: string;
  referenced_grn_id: string;
  total_billed_amount: string;
  adjusted_payable_amount: string;
  debit_note_delta: string;
  draft_letter_markdown: string;
  generated_at_utc: string;
}
