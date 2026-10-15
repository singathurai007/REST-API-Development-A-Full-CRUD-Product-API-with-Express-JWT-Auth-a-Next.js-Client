'use client';

// Pagination driven entirely by the `meta` object returned by the API:
//   meta = { page, limit, total, totalPages, hasNext, hasPrev }
//
// Displays "Page x of y" and disables the buttons at the bounds.

import { formatNumber } from '@/lib/format';

export default function Pagination({ meta, onChange, disabled = false }) {
  if (!meta) return null;

  const { page, totalPages, total, hasNext, hasPrev } = meta;
  const canPrev = hasPrev && !disabled;
  const canNext = hasNext && !disabled;

  return (
    <div className="pagination">
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => onChange(page - 1)}
        disabled={!canPrev}
      >
        ← Prev
      </button>

      <span className="pagination__info">
        Page <strong>{page}</strong> of <strong>{totalPages || 1}</strong>
        <span className="pagination__total"> · {formatNumber(total || 0)} items</span>
      </span>

      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => onChange(page + 1)}
        disabled={!canNext}
      >
        Next →
      </button>
    </div>
  );
}
