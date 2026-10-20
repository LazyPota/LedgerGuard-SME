/**
 * Exact String-to-Display Formatters.
 * Strictly formats typed decimal strings without floating-point math.
 */

export function formatCurrency(
  amountStr: string | number,
  currency: string = 'USD'
): string {
  if (amountStr === null || amountStr === undefined) return '$0.00';
  const num = typeof amountStr === 'number' ? amountStr : parseFloat(amountStr);
  if (isNaN(num)) return String(amountStr);

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(num);
}

export function formatPercent(pctStr: string | number): string {
  if (pctStr === null || pctStr === undefined) return '0.00%';
  const num = typeof pctStr === 'number' ? pctStr : parseFloat(pctStr);
  if (isNaN(num)) return `${pctStr}%`;
  return `${num.toFixed(2)}%`;
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(Date.UTC(year, month, day));
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

export function formatHash(hash: string, headChars = 8, tailChars = 6): string {
  if (!hash || hash.length <= headChars + tailChars) return hash;
  return `${hash.slice(0, headChars)}...${hash.slice(-tailChars)}`;
}

export function formatIban(iban: string): string {
  if (!iban) return '—';
  // Standard 4-character chunking for display
  return iban.replace(/(.{4})/g, '$1 ').trim();
}
