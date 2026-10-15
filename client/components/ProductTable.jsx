'use client';

// Products table.
//
// Demonstrates AUTHENTICATION vs AUTHORIZATION in the UI: the View action is
// always available, but Edit / Delete are rendered ONLY when the signed-in
// user's role is "admin". A regular user gets a read-only table.

import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/format';

export default function ProductTable({ products, user, onEdit, onDelete, busyId }) {
  const isAdmin = user?.role === 'admin';

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Category</th>
            <th scope="col" className="num">Price</th>
            <th scope="col" className="num">Stock</th>
            <th scope="col">Updated</th>
            <th scope="col" className="actions-col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const lowStock = product.stock > 0 && product.stock <= 10;
            const outOfStock = product.stock === 0;
            return (
              <tr key={product.id} className={busyId === product.id ? 'row--busy' : ''}>
                <td>
                  <Link href={`/products/${product.id}`} className="link-strong">
                    {product.name}
                  </Link>
                  {product.description ? (
                    <div className="muted truncate">{product.description}</div>
                  ) : null}
                </td>
                <td>
                  <span className="badge badge--category">{product.category}</span>
                </td>
                <td className="num">{formatCurrency(product.price)}</td>
                <td className="num">
                  <span
                    className={
                      'badge ' +
                      (outOfStock
                        ? 'badge--danger'
                        : lowStock
                          ? 'badge--warn'
                          : 'badge--ok')
                    }
                  >
                    {outOfStock ? 'Out of stock' : `${product.stock} in stock`}
                  </span>
                </td>
                <td className="muted">{formatDate(product.updatedAt)}</td>
                <td className="actions-col">
                  <div className="row-actions">
                    {/* PATH PARAM demo: the id is part of the URL. */}
                    <Link href={`/products/${product.id}`} className="btn btn--ghost btn--sm">
                      View
                    </Link>

                    {/* Admin-only actions (authorization). */}
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => onEdit(product)}
                          disabled={busyId === product.id}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => onDelete(product)}
                          disabled={busyId === product.id}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
