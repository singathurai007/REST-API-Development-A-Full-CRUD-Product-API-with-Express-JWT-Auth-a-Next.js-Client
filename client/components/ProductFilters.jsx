'use client';

// Filter bar for the products list.
//
// Every control here maps directly to a QUERY PARAM on GET /products:
//   search, category, minPrice, maxPrice, inStock, sort, order, limit.
// The parent owns the state; this component just emits partial updates.

export const CATEGORIES = ['electronics', 'furniture', 'stationery', 'clothing', 'grocery'];

export const SORT_FIELDS = ['name', 'price', 'stock', 'createdAt', 'updatedAt'];

export const LIMIT_OPTIONS = [5, 10, 20, 50];

export default function ProductFilters({ value, onChange, onReset, disabled = false }) {
  // Helper so each control only has to describe the field it changes.
  const set = (patch) => onChange({ ...value, page: 1, ...patch });

  return (
    <section className="filters card" aria-label="Product filters">
      <div className="filters__grid">
        <label className="field">
          <span className="field__label">Search</span>
          <input
            type="search"
            className="input"
            placeholder="Name or description…"
            value={value.search}
            disabled={disabled}
            onChange={(e) => set({ search: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">Category</span>
          <select
            className="input"
            value={value.category}
            disabled={disabled}
            onChange={(e) => set({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Min price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input"
            placeholder="0"
            value={value.minPrice}
            disabled={disabled}
            onChange={(e) => set({ minPrice: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">Max price</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input"
            placeholder="Any"
            value={value.maxPrice}
            disabled={disabled}
            onChange={(e) => set({ maxPrice: e.target.value })}
          />
        </label>

        <label className="field">
          <span className="field__label">Sort by</span>
          <select
            className="input"
            value={value.sort}
            disabled={disabled}
            onChange={(e) => set({ sort: e.target.value })}
          >
            <option value="">Default</option>
            {SORT_FIELDS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Order</span>
          <select
            className="input"
            value={value.order}
            disabled={disabled}
            onChange={(e) => set({ order: e.target.value })}
          >
            <option value="asc">asc</option>
            <option value="desc">desc</option>
          </select>
        </label>

        <label className="field">
          <span className="field__label">Per page</span>
          <select
            className="input"
            value={value.limit}
            disabled={disabled}
            onChange={(e) => set({ limit: Number(e.target.value) })}
          >
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={Boolean(value.inStock)}
            disabled={disabled}
            onChange={(e) => set({ inStock: e.target.checked ? true : '' })}
          />
          <span>In stock only</span>
        </label>

        <div className="filters__actions">
          <button type="button" className="btn btn--ghost" onClick={onReset} disabled={disabled}>
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}
