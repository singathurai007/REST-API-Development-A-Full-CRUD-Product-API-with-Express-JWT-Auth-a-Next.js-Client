'use client';

// Products dashboard (route: "/").
//
// REST concepts demonstrated on this screen:
//   * GET /products with QUERY PARAMS (pagination, search, category, price
//     range, sort, order, inStock) driven straight from the filter bar.
//   * POST /products (create) and PUT/PATCH /products/:id (update) through a
//     modal + form, with the JSON request body built by ProductForm.
//   * DELETE /products/:id with a confirmation modal.
//   * HTTP status codes surfaced in alerts (200/201 success, 401/403/422 errors).
//   * Authentication (bearer token) vs authorization (admin-only actions).
//   * Any 401 clears the token and redirects to /login.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { useAuth } from '@/components/AuthProvider';
import Alert from '@/components/Alert';
import Modal from '@/components/Modal';
import ProductFilters from '@/components/ProductFilters';
import ProductTable from '@/components/ProductTable';
import ProductForm, { diffFields, WRITABLE_FIELDS } from '@/components/ProductForm';
import Pagination from '@/components/Pagination';
import { api, ApiClientError } from '@/lib/api';

const DEFAULT_FILTERS = {
  search: '',
  category: '',
  minPrice: '',
  maxPrice: '',
  sort: '',
  order: 'desc',
  inStock: '',
  limit: 10,
  page: 1,
};

/** Builds the query object for GET /products, dropping empty values. */
function buildQuery(f) {
  return {
    page: f.page,
    limit: f.limit,
    search: f.search.trim(),
    category: f.category,
    minPrice: f.minPrice,
    maxPrice: f.maxPrice,
    inStock: f.inStock ? 'true' : '',
    sort: f.sort,
    order: f.order,
  };
}

function Dashboard() {
  const { user, isAdmin, logout } = useAuth();
  const router = useRouter();

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [products, setProducts] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // { variant, title, message }
  const [modal, setModal] = useState(null); // { type, product }
  const [busyId, setBusyId] = useState(null);

  // Central 401 handling: drop the token and bounce to the login page.
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

  // ---- fetch the list (GET /products + query string) ----------------------
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listProducts(buildQuery(filters));
      setProducts(Array.isArray(res?.data) ? res.data : []);
      setMeta(res?.meta ?? null);
    } catch (err) {
      if (handleAuthError(err)) return;
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [filters, handleAuthError]);

  // Refetch whenever the filters change (debounced so typing isn't chatty).
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  // ---- create / update (POST, PUT or PATCH) -------------------------------
  const handleFormSubmit = async (values) => {
    const isEdit = modal?.type === 'edit';
    try {
      if (!isEdit) {
        // POST /products -> 201 Created
        const res = await api.createProduct(values);
        setNotice({
          variant: 'success',
          title: '201 Created',
          message: `Product "${res?.data?.name ?? values.name}" was created.`,
        });
      } else {
        const original = modal.product;
        const changed = diffFields(values, original);
        const changedKeys = Object.keys(changed);

        if (changedKeys.length === 0) {
          setModal(null);
          setNotice({ variant: 'info', title: 'No changes', message: 'Nothing to update.' });
          return;
        }

        // If only a subset of fields changed we use PATCH (partial update);
        // otherwise we fall back to PUT (full replace) which requires the
        // full representation.
        const isStrictSubset = changedKeys.length < WRITABLE_FIELDS.length;

        if (isStrictSubset) {
          // PATCH /products/:id
          const res = await api.updateProduct(original.id, changed);
          setNotice({
            variant: 'success',
            title: '200 OK',
            message: `Updated via PATCH (${changedKeys.join(', ')}). ${
              res?.message ?? ''
            }`.trim(),
          });
        } else {
          // PUT /products/:id
          const res = await api.replaceProduct(original.id, values);
          setNotice({
            variant: 'success',
            title: '200 OK',
            message: `Updated via PUT (full replace). ${res?.message ?? ''}`.trim(),
          });
        }
      }

      setModal(null);
      await load();
    } catch (err) {
      handleAuthError(err);
      throw err; // let ProductForm render the error inline (incl. 422 details)
    }
  };

  // ---- delete (DELETE /products/:id) --------------------------------------
  const handleConfirmDelete = async () => {
    const target = modal?.product;
    if (!target) return;
    setBusyId(target.id);
    try {
      const res = await api.deleteProduct(target.id);
      setNotice({
        variant: 'success',
        title: '200 OK',
        message: res?.message ?? `Product "${target.name}" was deleted.`,
      });
      setModal(null);
      await load();
    } catch (err) {
      setModal(null);
      if (handleAuthError(err)) return;
      setError(err);
    } finally {
      setBusyId(null);
    }
  };

  const summary = useMemo(() => {
    if (!meta) return null;
    return `${products.length} shown · ${meta.total} total`;
  }, [products.length, meta]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p className="muted">
            Dashboard backed by <code>GET /products</code>. Filters map to query
            parameters.
          </p>
        </div>
        {/* Authorization: only admins may create. */}
        {isAdmin ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setModal({ type: 'create', product: null })}
          >
            + New product
          </button>
        ) : null}
      </div>

      {/* Read-only banner for the "user" role — the authorization demo. */}
      {!isAdmin ? (
        <Alert variant="info" title="Read-only access">
          You are signed in as <strong>{user?.role}</strong>. Creating, editing and
          deleting products requires the <code>admin</code> role — those requests
          would return <code>403 FORBIDDEN</code>.
        </Alert>
      ) : null}

      {notice ? (
        <Alert
          variant={notice.variant}
          title={notice.title}
          onDismiss={() => setNotice(null)}
        >
          {notice.message}
        </Alert>
      ) : null}

      {error ? (
        <Alert
          variant="error"
          title="Request failed"
          actions={
            <button type="button" className="btn btn--ghost btn--sm" onClick={load}>
              Retry
            </button>
          }
        >
          {/* Raw status code made explicit, e.g. "422 VALIDATION_ERROR - …". */}
          {error.toDisplayString ? error.toDisplayString() : String(error.message)}
        </Alert>
      ) : null}

      <ProductFilters value={filters} onChange={setFilters} onReset={resetFilters} />

      {summary ? <div className="muted">{summary}</div> : null}

      {loading ? (
        <div className="table-wrap" aria-busy="true" aria-label="Loading products">
          <div className="skeleton-table">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" />
            ))}
          </div>
        </div>
      ) : error ? null : products.length === 0 ? (
        <div className="card empty">
          <div className="empty__icon" aria-hidden="true">
            🔍
          </div>
          <h3>No products found</h3>
          <p className="muted">Try adjusting or resetting the filters.</p>
          <button type="button" className="btn btn--ghost" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      ) : (
        <ProductTable
          products={products}
          user={user}
          busyId={busyId}
          onEdit={(product) => setModal({ type: 'edit', product })}
          onDelete={(product) => setModal({ type: 'delete', product })}
        />
      )}

      <Pagination
        meta={meta}
        disabled={loading}
        onChange={(page) => setFilters((f) => ({ ...f, page }))}
      />

      {/* Create / Edit dialog */}
      <Modal
        open={modal?.type === 'create' || modal?.type === 'edit'}
        title={modal?.type === 'edit' ? 'Edit product' : 'New product'}
        onClose={() => setModal(null)}
      >
        {modal?.type === 'edit' ? (
          <p className="muted" style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Editing submits a full <code>PUT</code> replace — or a partial{' '}
            <code>PATCH</code> when only some fields changed. PATCH is recommended
            for small updates.
          </p>
        ) : null}
        <ProductForm
          mode={modal?.type === 'edit' ? 'edit' : 'create'}
          product={modal?.product}
          onSubmit={handleFormSubmit}
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* Delete confirmation dialog */}
      <Modal
        open={modal?.type === 'delete'}
        title="Delete product"
        onClose={() => setModal(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setModal(null)}
              disabled={Boolean(busyId)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={handleConfirmDelete}
              disabled={Boolean(busyId)}
            >
              {busyId ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        <p>
          Are you sure you want to delete{' '}
          <strong>{modal?.product?.name}</strong>? This sends{' '}
          <code>DELETE /products/{modal?.product?.id}</code> and cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  );
}
