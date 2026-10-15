// A tiny set of formatting helpers used across the UI.
// Keeping them here avoids repeating `Intl` boilerplate in every component.

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** Formats a number as US dollars, e.g. 29.99 -> "$29.99". */
export function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return currencyFormatter.format(Number(value));
}

/** Formats an ISO date string into a short, readable date-time. */
export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formats a number with thousands separators. */
export function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return new Intl.NumberFormat('en-US').format(Number(value));
}
