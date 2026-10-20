import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperationalStateBadge } from '../OperationalStateBadge';
import { OperationalState } from '@/contracts/ledgerGuardContract';

describe('OperationalStateBadge Discriminated Lifecycle Badges', () => {
  const allStates: OperationalState[] = [
    'PROPOSED',
    'STAGED_TIER_2_ELIGIBLE',
    'PENDING_HITL_TIER_3',
    'BLOCKED_DISCREPANCY',
    'BLOCKED_SECURITY_VIOLATION',
    'APPROVED_AWAITING_EXECUTION',
    'SIMULATED_EXECUTED',
    'EXTERNALLY_EXECUTED',
    'FAILED_OR_ROLLED_BACK',
  ];

  it.each(allStates)('renders correct badge for %s state', (state) => {
    const { unmount } = render(<OperationalStateBadge state={state} />);
    const badge = screen.getByTestId('operational-state-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('data-state', state);
    unmount();
  });
});
