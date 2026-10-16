import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatPhp } from '../currency.js'
import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  deleteInventoryItem,
  getInventoryItems,
  getInventoryLastError,
  getInventoryStorageMode,
  getInventorySummary,
  getStockStatus,
  getStockTone,
  saveInventoryItem,
  subscribeToInventory,
} from '../inventory.js'

const BLANK_ITEM = { name: '', category: INVENTORY_CATEGORIES[0], quantity: '', unit: 'kg', unitCost: '', minimumLevel: '' }

function MetricCard({ icon, label, value, note, featured = false }) {
  return (
    <article className={`asp-metric${featured ? ' asp-metric--featured' : ''}`}>
      <div className="asp-metric__top"><span className="asp-metric__icon" aria-hidden="true">{icon}</span><span className="asp-metric__label">{label}</span></div>
      <strong className="asp-metric__value">{value}</strong>
      <span className="asp-metric__note">{note}</span>
    </article>
  )
}

function StockBadge({ status }) {
  return <span className={`asp-status asp-stock asp-stock--${getStockTone(status)}`}>{status}</span>
}

function Field({ label, error, children }) {
  return (
    <label className={`asp-inv-field${error ? ' asp-inv-field--error' : ''}`}>
      <span>{label}</span>
      {children}
      {error && <small className="asp-inv-field__error">{error}</small>}
    </label>
  )
}

function ItemForm({ open, item, saving, errors, onChange, onCancel, onSubmit }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => dialogRef.current?.querySelector('input, select')?.focus(), 30)

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onCancel?.()
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll('input, select, button:not([disabled])')
        if (!focusable?.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [open, onCancel])

  if (!open) return null
  const isEdit = Boolean(item)

  return (
    <div className="asp-receipt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel?.() }}>
      <form className="asp-inv-form" role="dialog" aria-modal="true" aria-labelledby="asp-inv-form-title" onSubmit={onSubmit} ref={dialogRef} noValidate>
        <div className="asp-inv-form__head">
          <div>
            <span className="asp-section-kicker">{isEdit ? 'EDIT ITEM' : 'NEW ITEM'}</span>
            <h2 id="asp-inv-form-title">{isEdit ? 'Update ' : 'Add '} <em>stock</em></h2>
          </div>
          <button className="asp-receipt__close" type="button" onClick={onCancel} aria-label="Close form">×</button>
        </div>

        <div className="asp-inv-form__grid">
          <Field label="Item name" name="name" error={errors.name}>
            <input name="name" value={item.name} onChange={onChange} placeholder="e.g. Coffee beans" maxLength={80} disabled={saving} required />
          </Field>
          <Field label="Category" name="category" error={errors.category}>
            <select name="category" value={item.category} onChange={onChange} disabled={saving} required>
              {INVENTORY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </Field>
          <Field label="Quantity on hand" name="quantity" error={errors.quantity}>
            <input name="quantity" type="number" min="0" step="any" inputMode="decimal" value={item.quantity} onChange={onChange} placeholder="0" disabled={saving} required />
          </Field>
          <Field label="Unit" name="unit" error={errors.unit}>
            <select name="unit" value={item.unit} onChange={onChange} disabled={saving} required>
              {INVENTORY_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          </Field>
          <Field label="Unit cost (₱)" name="unitCost" error={errors.unitCost}>
            <input name="unitCost" type="number" min="0" step="any" inputMode="decimal" value={item.unitCost} onChange={onChange} placeholder="0" disabled={saving} required />
          </Field>
          <Field label="Minimum stock level" name="minimumLevel" error={errors.minimumLevel}>
            <input name="minimumLevel" type="number" min="0" step="1" inputMode="numeric" value={item.minimumLevel} onChange={onChange} placeholder="0" disabled={saving} required />
          </Field>
        </div>

        <p className="asp-inv-form__hint">Stock status updates itself: above the minimum is <strong>In Stock</strong>, at or below it is <strong>Low Stock</strong>, and zero is <strong>Out of Stock</strong>.</p>

        <div className="asp-inv-form__actions">
          <button className="asp-button asp-button--ghost" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="asp-button asp-button--primary" type="submit" disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add item')}</button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDelete({ item, onCancel, onConfirm }) {
  useEffect(() => {
    if (!item) return undefined
    const handleKeyDown = (event) => { if (event.key === 'Escape') onCancel?.() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [item, onCancel])

  if (!item) return null
  return (
    <div className="asp-receipt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel?.() }}>
      <section className="asp-inv-confirm" role="alertdialog" aria-modal="true" aria-labelledby="asp-inv-confirm-title">
        <span className="asp-inv-confirm__icon" aria-hidden="true">✳</span>
        <h2 id="asp-inv-confirm-title">Remove <em>{item.name}</em>?</h2>
        <p>This deletes the item from your inventory list. You can add it again later if you need to.</p>
        <div className="asp-inv-form__actions">
          <button className="asp-button asp-button--ghost" type="button" onClick={onCancel}>Keep item</button>
          <button className="asp-button asp-button--danger" type="button" onClick={onConfirm}>Yes, delete it</button>
        </div>
      </section>
    </div>
  )
}

export default function AdminInventoryPanel() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [storageMode, setStorageMode] = useState('browser')
  const [apiError, setApiError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(BLANK_ITEM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(() => {
    getInventoryItems()
      .then((next) => {
        setItems(next)
        setStorageMode(getInventoryStorageMode())
        setApiError(getInventoryLastError())
        setLoadError('')
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Inventory could not be loaded.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => subscribeToInventory(() => { setItems((current) => current.slice()) }), [])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const summary = useMemo(() => getInventorySummary(items), [items])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesSearch = !term || `${item.name} ${item.category}`.toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [items, search, category])

  const openAdd = () => { setEditing(null); setDraft(BLANK_ITEM); setFieldErrors({}); setFormOpen(true) }
  const openEdit = (item) => {
    setEditing(item)
    setDraft({ name: item.name, category: item.category, quantity: item.quantity, unit: item.unit, unitCost: item.unitCost, minimumLevel: item.minimumLevel })
    setFieldErrors({})
    setFormOpen(true)
  }
  const closeForm = () => { if (!saving) { setFormOpen(false); setEditing(null); setFieldErrors({}) } }

  const handleFieldChange = (event) => {
    const { name, value } = event.target
    setDraft((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setFieldErrors({})
    try {
      const next = await saveInventoryItem(draft, editing?.id || null)
      setItems(next)
      setNotice(editing ? `${draft.name || 'Item'} updated.` : `${draft.name || 'Item'} added to inventory.`)
      setFormOpen(false)
      setEditing(null)
    } catch (error) {
      if (error?.fieldErrors) setFieldErrors(error.fieldErrors)
      else setNotice(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const target = pendingDelete
    if (!target) return
    try {
      const next = await deleteInventoryItem(target.id)
      setItems(next)
      setNotice(`${target.name} removed.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Something went wrong.')
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div className="asp-page">
      <div className="asp-period-row">
        <div>
          <span className="asp-section-kicker">PRODUCTS &amp; INVENTORY</span>
          <span className="asp-period-caption">Ingredients and supplies on hand</span>
        </div>
        <span className="asp-date-badge">{storageMode === 'database' ? 'Saved to database' : 'Saved in this browser'}</span>
      </div>

      <section className="asp-metrics asp-metrics--three" aria-label="Inventory summary">
        <MetricCard icon="▤" label="Total Items" value={summary.total} note={`${formatPhp(summary.stockValue)} of stock`} featured />
        <MetricCard icon="!" label="Low Stock Items" value={summary.low} note="At or below the minimum" />
        <MetricCard icon="✕" label="Out of Stock Items" value={summary.out} note="Zero on hand" />
      </section>

      <section className="asp-panel asp-orders-panel">
        <div className="asp-panel__head">
          <div><span className="asp-section-kicker">THE STOCK ROOM</span><h2>Inventory <em>list</em></h2></div>
          <button className="asp-button asp-button--primary" type="button" onClick={openAdd}>Add Inventory <span aria-hidden="true">+</span></button>
        </div>

        <div className="asp-inv-toolbar">
          <label className="asp-search"><span aria-hidden="true">⌕</span><input aria-label="Search inventory" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search an item" /></label>
          <label className="asp-inv-filter">
            <span aria-hidden="true">▤</span>
            <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="All">All categories</option>
              {INVENTORY_CATEGORIES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>

        {loadError && <p className="asp-inv-note asp-inv-note--error" role="alert">{loadError}</p>}

        <div className="asp-table-wrap">
          <table className={`asp-table asp-inv-table${filtered.length ? '' : ' asp-table--empty'}`}>
            <thead>
              <tr><th>Item</th><th>Category</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Min level</th><th>Status</th><th><span className="asp-sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const status = getStockStatus(item.quantity, item.minimumLevel)
                return (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.category}</td>
                    <td className="asp-inv-qty">{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td className="asp-table__amount">{formatPhp(item.unitCost)}</td>
                    <td>{item.minimumLevel}</td>
                    <td><StockBadge status={status} /></td>
                    <td className="asp-inv-actions">
                      <button className="asp-text-button" type="button" onClick={() => openEdit(item)} disabled={loading}>Edit</button>
                      <button className="asp-text-button asp-text-button--danger" type="button" onClick={() => setPendingDelete(item)} disabled={loading}>Delete</button>
                    </td>
                  </tr>
                )
              })}
              {!loading && !filtered.length && (
                <tr><td colSpan="8" className="asp-table__empty">{items.length ? 'No items match your search or filter.' : 'No inventory items yet. Add your first one to get started.'}</td></tr>
              )}
              {loading && <tr><td colSpan="8" className="asp-table__empty">Loading inventory…</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {storageMode !== 'database' && (
        /admin token|ADMIN_API_TOKEN/i.test(apiError) ? (
          <p className="asp-inv-note asp-inv-note--error">
            <strong>Local admin token rejected.</strong> The database API is running, but the token did not match. Give <code>ADMIN_API_TOKEN</code> and <code>VITE_ADMIN_API_TOKEN</code> the same value in <code>.env</code>, then restart <code>npm run dev:local</code>.
          </p>
        ) : (
          <p className="asp-inv-note">
            <strong>Where is this saved?</strong> Your database is not connected yet, so inventory is stored in this browser only. Install MySQL, set <code>DATABASE_URL</code> in <code>.env</code>, then run <code>npm run dev:local</code> to save to the database.
          </p>
        )
      )}

      <ItemForm open={formOpen} item={draft} saving={saving} errors={fieldErrors} onChange={handleFieldChange} onCancel={closeForm} onSubmit={handleSubmit} />
      <ConfirmDelete item={pendingDelete} onCancel={() => setPendingDelete(null)} onConfirm={handleDelete} />
      <div className={`asp-inv-toast ${notice ? 'asp-inv-toast--visible' : ''}`} role="status">{notice}</div>
    </div>
  )
}
