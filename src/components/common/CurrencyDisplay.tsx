import React from 'react';
import { formatCurrency } from '@/utils/formatters';

interface CurrencyDisplayProps {
  amount: string | number;
  currency?: string;
  className?: string;
  variant?: 'neutral' | 'positive' | 'negative' | 'subtle';
  isDelta?: boolean;
}

export const CurrencyDisplay: React.FC<CurrencyDisplayProps> = ({
  amount,
  currency = 'USD',
  className = '',
  variant = 'neutral',
  isDelta = false,
}) => {
  const formatted = formatCurrency(amount, currency);
  const isPositiveDelta = isDelta && String(amount).startsWith('+');
  const isNegativeDelta = isDelta && String(amount).startsWith('-');

  let colorClasses = 'text-slate-100';
  if (variant === 'positive' || isPositiveDelta) {
    colorClasses = 'text-emerald-400 font-semibold';
  } else if (variant === 'negative' || isNegativeDelta) {
    colorClasses = 'text-crimson-400 font-semibold';
  } else if (variant === 'subtle') {
    colorClasses = 'text-slate-400';
  }

  return (
    <span
      className={`font-mono tabular-nums tracking-tight ${colorClasses} ${className}`}
      data-testid="currency-display"
    >
      {isPositiveDelta && !formatted.startsWith('+') ? `+${formatted}` : formatted}
    </span>
  );
};
