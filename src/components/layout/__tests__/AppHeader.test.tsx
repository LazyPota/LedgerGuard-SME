import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppHeader } from '../AppHeader';

describe('AppHeader Global Header Controls', () => {
  it('renders brand identity and competition topic', async () => {
    await act(async () => {
      render(<AppHeader onBatchReset={() => {}} />);
    });
    expect(screen.getByText('LedgerGuard')).toBeInTheDocument();
    expect(screen.getByText('TOPIC E')).toBeInTheDocument();
  });

  it('renders environment pill and allows toggling execution mode', async () => {
    await act(async () => {
      render(<AppHeader onBatchReset={() => {}} />);
    });
    const envPill = screen.getByTestId('environment-pill');
    expect(envPill).toBeInTheDocument();
    expect(envPill).toHaveTextContent('DEMO FIXTURE ADAPTER (Offline Mode)');

    // Click to toggle
    await act(async () => {
      fireEvent.click(envPill);
    });
    expect(envPill).toHaveTextContent('SANDBOX SIMULATION LEDGER (FastAPI/SQLite)');
  });

  it('calls onBatchReset callback when reset button is clicked', async () => {
    const handleReset = vi.fn();
    await act(async () => {
      render(<AppHeader onBatchReset={handleReset} />);
    });
    const resetBtn = screen.getByTestId('reset-batch-btn');
    await act(async () => {
      fireEvent.click(resetBtn);
    });
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
