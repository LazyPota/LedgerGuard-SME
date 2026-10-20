import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CurrencyDisplay } from '../CurrencyDisplay';

describe('CurrencyDisplay Tabular-Nums Formatting', () => {
  it('formats exact decimal string accurately without floating point math', () => {
    render(<CurrencyDisplay amount="77200.00" />);
    const el = screen.getByTestId('currency-display');
    expect(el).toHaveTextContent('$77,200.00');
    expect(el).toHaveClass('tabular-nums');
  });

  it('renders positive delta correctly with prefix', () => {
    render(<CurrencyDisplay amount="775.84" isDelta={true} variant="positive" />);
    const el = screen.getByTestId('currency-display');
    expect(el).toHaveTextContent('$775.84');
    expect(el).toHaveClass('text-emerald-400');
  });

  it('renders negative delta correctly', () => {
    render(<CurrencyDisplay amount="-4000.00" isDelta={true} variant="negative" />);
    const el = screen.getByTestId('currency-display');
    expect(el).toHaveTextContent('-$4,000.00');
    expect(el).toHaveClass('text-crimson-400');
  });
});
