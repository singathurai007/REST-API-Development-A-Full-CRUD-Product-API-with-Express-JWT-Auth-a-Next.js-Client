'use client';

// A minimal but accessible-ish dialog.
//
//   * Renders nothing when `open` is false.
//   * Closes on Escape and on overlay click.
//   * Locks background scroll while open.
//   * Exposes role="dialog", aria-modal and labelled title.

import { useEffect } from 'react';

export default function Modal({ open, title, children, footer, onClose }) {
  // Close on Escape + lock body scroll while the dialog is open.
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onMouseDown={() => onClose?.()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={() => onClose?.()}
            aria-label="Close dialog"
          >
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
