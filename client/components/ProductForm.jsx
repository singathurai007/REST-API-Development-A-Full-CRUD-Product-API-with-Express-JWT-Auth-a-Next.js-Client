'use client';

// ProductForm is used for BOTH create (POST) and edit (PUT / PATCH).
//
// It demonstrates:
//   * REQUEST BODIES  - it builds the JSON payload sent to the API.
//   * CLIENT-SIDE validation - required fields are checked before we call the
//     API, so the user gets instant feedback.
//   * SERVER-SIDE validation - when the API replies 422 VALIDATION_ERROR it
//     includes `error.details = [{ field, in, message }]`; we merge those into
//     the same per-field error display.

import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from '@/components/ProductFilters';

const EMPTY = {
  name: '',
  description: '',
  price: '',
  category: '',
  stock: '',
  tags: '',
};

function toFormState(product) {
  if (!product) return EMPTY;
  return {
    name: product.name ?? '',
    description: product.description ?? '',
    price: product.price ?? '',
    category: product.category ?? '',
    stock: product.stock ?? '',
    tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
  };
}

/** Fields the API accepts on write operations (used for the PUT/PATCH diff). */
export const WRITABLE_FIELDS = ['name', 'description', 'price', 'category', 'stock', 'tags'];

/** Normalises a field value so numbers/arrays compare consistently. */
export function normalizeField(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value).trim();
}

/**
 * Returns the subset of `values` that differs from the original product.
 * Used to decide between a partial PATCH and a full PUT.
 */
export function diffFields(values, original) {
  const changed = {};
  for (const key of WRITABLE_FIELDS) {
    if (normalizeField(values[key]) !== normalizeField(original[key])) {
      changed[key] = values[key];
    }
  }
  return changed;
}

/** Turns the form state into the JSON body the API expects. */
export function toPayload(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: form.price === '' ? undefined : Number(form.price),
    category: form.category,
    stock: form.stock === '' ? 0 : Number(form.stock),
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export default function ProductForm({ mode = 'create', product, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => toFormState(product));
  const [clientErrors, setClientErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Re-sync when a different product is opened for editing.
  useEffect(() => {
    setForm(toFormState(product));
    setClientErrors({});
    setServerError(null);
  }, [product]);

  // Index the API's `error.details` array by field name for inline display.
  const serverFieldErrors = useMemo(() => {
    const map = {};
    const details = serverError?.details;
    if (Array.isArray(details)) {
      for (const d of details) {
        if (d && d.field) {
          if (!map[d.field]) map[d.field] = d.message;
        }
      }
    }
    return map;
  }, [serverError]);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  function validate() {
    const errors = {};
    // Required fields (mirrors the server contract for POST / PUT).
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (form.price === '' || Number.isNaN(Number(form.price))) {
      errors.price = 'Price must be a number.';
    } else if (Number(form.price) <= 0) {
      errors.price = 'Price must be greater than 0.';
    }
    if (!form.category) errors.category = 'Category is required.';
    if (form.stock !== '' && Number.isNaN(Number(form.stock))) {
      errors.stock = 'Stock must be a number.';
    } else if (form.stock !== '' && Number(form.stock) < 0) {
      errors.stock = 'Stock cannot be negative.';
    }
    return errors;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError(null);

    const errors = validate();
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      // Hand the JSON body up to the parent, which picks PUT vs PATCH.
      await onSubmit(toPayload(form));
    } catch (err) {
      // API/network errors are rendered inline (422 field errors especially).
      setServerError(err);
    } finally {
      setSubmitting(false);
    }
  }

  // Shown under a field when EITHER client or server complained about it.
  const fieldError = (name) => clientErrors[name] || serverFieldErrors[name];

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {serverError ? (
        <div className="form__server-error" role="alert">
          {/* Raw status code is shown explicitly, e.g. "422 VALIDATION_ERROR - …" */}
          <strong>{serverError.toDisplayString?.() ?? 'Request failed'}</strong>
          {Array.isArray(serverError.details) && serverError.details.length > 0 ? (
            <ul className="form__server-details">
              {serverError.details.map((d, i) => (
                <li key={`${d.field}-${i}`}>
                  <code>{d.field}</code>: {d.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <label className="field">
        <span className="field__label">
          Name <span className="req">*</span>
        </span>
        <input
          className={'input' + (fieldError('name') ? ' input--invalid' : '')}
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Wireless Mouse"
        />
        {fieldError('name') ? <span className="field__error">{fieldError('name')}</span> : null}
      </label>

      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          className="input"
          rows={3}
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="Short description…"
        />
      </label>

      <div className="form__row">
        <label className="field">
          <span className="field__label">
            Price <span className="req">*</span>
          </span>
          <input
            type="number"
            min="0"
            step="0.01"
            className={'input' + (fieldError('price') ? ' input--invalid' : '')}
            value={form.price}
            onChange={(e) => set({ price: e.target.value })}
            placeholder="0.00"
          />
          {fieldError('price') ? <span className="field__error">{fieldError('price')}</span> : null}
        </label>

        <label className="field">
          <span className="field__label">Stock</span>
          <input
            type="number"
            min="0"
            step="1"
            className={'input' + (fieldError('stock') ? ' input--invalid' : '')}
            value={form.stock}
            onChange={(e) => set({ stock: e.target.value })}
            placeholder="0"
          />
          {fieldError('stock') ? <span className="field__error">{fieldError('stock')}</span> : null}
        </label>
      </div>

      <label className="field">
        <span className="field__label">
          Category <span className="req">*</span>
        </span>
        <select
          className={'input' + (fieldError('category') ? ' input--invalid' : '')}
          value={form.category}
          onChange={(e) => set({ category: e.target.value })}
        >
          <option value="">Select a category…</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {fieldError('category') ? (
          <span className="field__error">{fieldError('category')}</span>
        ) : null}
      </label>

      <label className="field">
        <span className="field__label">Tags</span>
        <input
          className="input"
          value={form.tags}
          onChange={(e) => set({ tags: e.target.value })}
          placeholder="comma, separated, tags"
        />
        <span className="field__hint">Separate multiple tags with commas.</span>
      </label>

      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting
            ? 'Saving…'
            : mode === 'create'
              ? 'Create product'
              : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
