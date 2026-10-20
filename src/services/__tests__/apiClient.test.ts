import { describe, it, expect } from 'vitest';
import { ApiClient } from '../apiClient';

describe('ApiClient Dual-Mode Integration & Error Normalization', () => {
  it('defaults to OFFLINE_DETERMINISTIC_MOCK mode', () => {
    const client = new ApiClient();
    expect(client.getExecutionMode()).toBe('OFFLINE_DETERMINISTIC_MOCK');
  });

  it('notifies listeners when execution mode changes', () => {
    const client = new ApiClient();
    let currentMode = client.getExecutionMode();
    const unsubscribe = client.onModeChange((newMode) => {
      currentMode = newMode;
    });

    client.setExecutionMode('LIVE_BACKEND_SANDBOX');
    expect(currentMode).toBe('LIVE_BACKEND_SANDBOX');

    unsubscribe();
    client.setExecutionMode('OFFLINE_DETERMINISTIC_MOCK');
    // Listener should not be called after unsubscribe
    expect(currentMode).toBe('LIVE_BACKEND_SANDBOX');
  });

  it('retrieves health status accurately in mock mode', async () => {
    const client = new ApiClient();
    const health = await client.getHealth();
    expect(health.status).toBe('ok');
    expect(health.execution_mode).toBe('OFFLINE_DETERMINISTIC_MOCK');
    expect(health.database_connected).toBe(true);
    expect(health.audit_chain_valid).toBe(true);
  });

  it('normalizes arbitrary exceptions into typed ApiErrorEnvelope', () => {
    const client = new ApiClient();
    const error = new Error('Database connection refused');
    const normalized = client.normalizeError(error, 'trc_err_test_404');

    expect(normalized.error_code).toBe('ERR_OPERATION_FAILED');
    expect(normalized.message).toBe('Database connection refused');
    expect(normalized.severity).toBe('ERROR');
    expect(normalized.trace_id).toBe('trc_err_test_404');
    expect(normalized.recoverable).toBe(true);
  });

  it('preserves existing ApiErrorEnvelope objects when normalizing', () => {
    const client = new ApiClient();
    const customEnvelope = {
      error_code: 'POLICY_VIOLATION_ASI01',
      message: 'Prompt injection attempted',
      severity: 'CRITICAL_SECURITY' as const,
      trace_id: 'trc_sec_999',
      violated_policy_rule: 'RULE_ASI01_LOCK',
      suggested_operator_action: 'Quarantine document',
      recoverable: false,
    };

    const normalized = client.normalizeError(customEnvelope);
    expect(normalized).toEqual(customEnvelope);
  });
});
