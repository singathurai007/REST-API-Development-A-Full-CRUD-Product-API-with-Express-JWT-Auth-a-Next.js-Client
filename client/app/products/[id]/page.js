'use client';

// Product detail page (route: "/products/[id]").
//
// Demonstrates PATH PARAMS: the `id` is read from the dynamic route segment
// (`params.id`) and used as `GET /products/:id`. A malformed id returns
// 400 INVALID_ID and an unknown id returns 404 PRODUCT_NOT_FOUND — both are
// shown with their raw status code.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/components/AuthProvider';
import Alert from '@/components/Alert';
import Modal from '@/components/Modal';
import ProductForm, { diffFields, WRITABLE_FIELDS } from '@/components/ProductForm';
import { api, ApiClientError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

function ProductDetail({ id }) {
  const { user, isAdmin, logout } = useAuth();
  const router = useRouter();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null); // 'edit' | 'delete' | null
  const [deleting, setDeleting] = useState(false);

  const handleAuthError = useCallback(
    (err) => {
      if (err instanceof ApiClientError && err.status === 401) {
        logout();
        router.replace('/login');
        return true;
      }
      return false;
    },
    [logout, router],
  );

  // PATH PARAM in action: fetch a single resource by id.
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProduct(id);
      setProduct(res?.data ?? null);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id, handleAuthError]);

  useEffect(() => {
    load();
  }, [load]);

  // Update via PUT (full replace) or PATCH (partial) based on the diff.
  const handleEditSubmit = async (values) => {
    try {
      const changed = diffFields(values, product);
      const changedKeys = Object.keys(changed);

      if (changedKeys.length === 0) {
        setModal(null);
        setNotice({ variant: 'info', title: 'No changes', message: 'Nothing to update.' });
        return;
      }

      if (changedKeys.length < WRITABLE_FIELDS.length) {
        const res = await api.updateProduct(id, changed); // PATCH
        setNotice({
          variant: 'success',
          title: '200 OK',
          message: `Updated via PATCH (${changedKeys.join(', ')}). ${res?.message ?? ''}`.trim(),
        });
      } else {
        const res = await api.replaceProduct(id, values); // PUT
        setNotice({
          variant: 'success',
          title: '200 OK',
          message: `Updated via PUT (full replace). ${res?.message ?? ''}`.trim(),
        });
      }
      setModal(null);
      await load();
    } catch (err) {
      handleAuthError(err);
      throw err; // rendered inline by ProductForm
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.deleteProduct(id); // DELETE /products/:id
      router.replace('/');
    } catch (err) {
      setModal(null);
      if (handleAuthError(err)) return;
      setError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <div>
        <Link href="/" className="muted">
          ← Back to products
        </Link>
      </div>

      {notice ? (
        <Alert variant={notice.variant} title={notice.title} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      ) : null}

      {error ? (
        <Alert
          variant="error"
          title={
            error.status === 404
              ? '404 — product not found'
              : error.status === 400
                ? '400 — invalid id'
                : 'Request failed'
          }
          actions={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
                Retry
              </button>
              <Link href="/" className="btn btn--ghost btn--sm">
                Back to list
              </Link>
            </div>
          }
        >
          {error.toDisplayString ? error.toDisplayString() : error.message}
        </Alert>
      ) : null}

      {loading ? (
        <div className="page-state">
          <div className="spinner" aria-hidden="true" />
          <p>Loading product…</p>
        </div>
      ) : !product ? null : (
        <div className="card">
          <div className="page-head">
            <div>
              <h1>{product.name}</h1>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span className="badge badge--category">{product.category}</span>
                <span
                  className={
                    'badge ' +
                    (product.stock === 0
                      ? 'badge--danger'
                      : product.stock <= 10
                        ? 'badge--warn'
                        : 'badge--ok')
                  }
                >
                  {product.stock === 0 ? 'Out of stock' : `${product.stock} in stock`}
                </span>
              </div>
            </div>

            {/* Authorization: admin-only actions. */}
            {isAdmin ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setModal('edit')}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={() => setModal('delete')}
                >
                  Delete
                </button>
              </div>
            ) : (
              <span className="badge badge--role badge--user">read-only ({user?.role})</span>
            )}
          </div>

          <div className="detail-grid">
            <div className="detail-item">
              <div className="detail-item__label">Price</div>
              <div className="detail-item__value">{formatCurrency(product.price)}</div>
            </div>
            <div className="detail-item">
              <div className="detail-item__label">Stock</div>
              <div className="detail-item__value">{product.stock}</div>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <div className="detail-item__label">Description</div>
              <div className="detail-item__value">{product.description || '—'}</div>
            </div>
            <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
              <div className="detail-item__label">Tags</div>
              <div className="detail-item__value">
                {Array.isArray(product.tags) && product.tags.length > 0 ? (
                  <span style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {product.tags.map((tag) => (
                      <span key={tag} className="badge">
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : (
                  '—'
                )}
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-item__label">ID (path param)</div>
              <div className="detail-item__value">
                <code>{product.id}</code>
              </div>
            </div>
            <div className="detail-item">
              <div className="detail-item__label">Created</div>
              <div className="detail-item__value">{formatDate(product.createdAt)}</div>
            </div>
            <div className="detail-item">
              <div className="detail-item__label">Updated</div>
              <div className="detail-item__value">{formatDate(product.updatedAt)}</div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={modal === 'edit'}
        title="Edit product"
        onClose={() => setModal(null)}
      >
        <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
          Changed fields are sent as a partial <code>PATCH</code>; a full change
          uses <code>PUT</code>.
        </p>
        <ProductForm
          mode="edit"
          product={product}
          onSubmit={handleEditSubmit}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <Modal
        open={modal === 'delete'}
        title="Delete product"
        onClose={() => setModal(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setModal(null)}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p>
          Delete <strong>{product?.name}</strong>? This sends{' '}
          <code>DELETE /products/{id}</code> and cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

export default function Page({ params }) {
  return (
    <AuthGuard>
      <ProductDetail id={params.id} />
    </AuthGuard>
  );
}
