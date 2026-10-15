'use client';

// Dismissible alert used to surface API successes and errors.
//
// The `error` variant typically receives the string produced by
// `ApiClientError.toDisplayString()` which includes the raw HTTP status code,
// e.g. "403 FORBIDDEN - Only admins can perform this action".

const ICONS = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export default function Alert({
  variant = 'info',
  title,
  children,
  onDismiss,
  actions,
}) {
  const kind = ['success', 'error', 'info'].includes(variant) ? variant : 'info';

  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="alert__icon" aria-hidden="true">
        {ICONS[kind]}
      </span>
      <div className="alert__content">
        {title ? <strong className="alert__title">{title}</strong> : null}
        {children ? <div className="alert__body">{children}</div> : null}
        {actions ? <div className="alert__actions">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="alert__close"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
