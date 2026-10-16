const INVENTORY_STORAGE_KEY = 'sable-stem-inventory-v1'
const INVENTORY_CHANGED_EVENT = 'sable-stem-inventory-changed'

export const INVENTORY_CATEGORIES = ['Coffee', 'Dairy', 'Sweeteners', 'Syrups', 'Powders', 'Packaging']
export const INVENTORY_UNITS = ['kg', 'g', 'L', 'ml', 'bottle', 'pack', 'piece']

// Starter stock for a small coffee bar. Seeded the first time the page opens.
export const SAMPLE_INVENTORY = [
  { name: 'Coffee beans', category: 'Coffee', quantity: 12, unit: 'kg', unitCost: 620, minimumLevel: 5 },
  { name: 'Fresh milk', category: 'Dairy', quantity: 8, unit: 'L', unitCost: 68, minimumLevel: 6 },
  { name: 'White sugar', category: 'Sweeteners', quantity: 9, unit: 'kg', unitCost: 45, minimumLevel: 3 },
  { name: 'Vanilla syrup', category: 'Syrups', quantity: 4, unit: 'bottle', unitCost: 210, minimumLevel: 2 },
  { name: 'Chocolate powder', category: 'Powders', quantity: 3, unit: 'kg', unitCost: 340, minimumLevel: 2 },
  { name: 'Paper cups (12 oz)', category: 'Packaging', quantity: 240, unit: 'piece', unitCost: 6.5, minimumLevel: 100 },
  { name: 'Cup lids (12 oz)', category: 'Packaging', quantity: 180, unit: 'piece', unitCost: 3, minimumLevel: 200 },
  { name: 'Plastic straws', category: 'Packaging', quantity: 0, unit: 'piece', unitCost: 1.2, minimumLevel: 200 },
]

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// In Stock > minimum level, Low Stock at or below minimum level, Out of Stock at zero.
export function getStockStatus(quantity, minimumLevel) {
  const onHand = Number(quantity)
  const minimum = Number(minimumLevel)
  if (!Number.isFinite(onHand) || onHand <= 0) return 'Out of Stock'
  if (Number.isFinite(minimum) && onHand <= minimum) return 'Low Stock'
  return 'In Stock'
}

export function getStockTone(status) {
  if (status === 'Out of Stock') return 'out'
  if (status === 'Low Stock') return 'low'
  return 'in'
}

export function getInventorySummary(items = []) {
  let low = 0
  let out = 0
  for (const item of items) {
    const status = getStockStatus(item.quantity, item.minimumLevel)
    if (status === 'Low Stock') low += 1
    else if (status === 'Out of Stock') out += 1
  }
  return { total: items.length, low, out, stockValue: items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitCost || 0), 0) }
}

// Checks a submitted form. Returns { ok, value, errors } and never saves invalid data.
export function validateInventoryItem(payload = {}) {
  const errors = {}
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const category = typeof payload.category === 'string' ? payload.category.trim() : ''
  const unit = typeof payload.unit === 'string' ? payload.unit.trim() : ''

  if (!name) errors.name = 'Enter the item name.'
  else if (name.length < 2) errors.name = 'Item name must be at least 2 characters.'
  else if (name.length > 80) errors.name = 'Item name must be 80 characters or fewer.'

  if (!category) errors.category = 'Choose a category.'
  else if (!INVENTORY_CATEGORIES.includes(category)) errors.category = 'Choose one of the listed categories.'

  if (!unit) errors.unit = 'Choose a unit.'
  else if (!INVENTORY_UNITS.includes(unit)) errors.unit = 'Choose one of the listed units.'

  const quantity = Number(payload.quantity)
  if (payload.quantity === '' || payload.quantity === null || payload.quantity === undefined || !Number.isFinite(quantity)) {
    errors.quantity = 'Enter a quantity.'
  } else if (quantity < 0) {
    errors.quantity = 'Quantity cannot be negative.'
  } else if (quantity > 1_000_000) {
    errors.quantity = 'Quantity is too large.'
  }

  const minimumLevel = Number(payload.minimumLevel)
  if (payload.minimumLevel === '' || payload.minimumLevel === null || payload.minimumLevel === undefined || !Number.isFinite(minimumLevel)) {
    errors.minimumLevel = 'Enter a minimum stock level.'
  } else if (minimumLevel < 0) {
    errors.minimumLevel = 'Minimum stock level cannot be negative.'
  } else if (!Number.isInteger(minimumLevel)) {
    errors.minimumLevel = 'Minimum stock level must be a whole number.'
  }

  const unitCost = Number(payload.unitCost)
  if (payload.unitCost === '' || payload.unitCost === null || payload.unitCost === undefined || !Number.isFinite(unitCost)) {
    errors.unitCost = 'Enter a unit cost.'
  } else if (unitCost < 0) {
    errors.unitCost = 'Unit cost cannot be negative.'
  } else if (unitCost > 1_000_000) {
    errors.unitCost = 'Unit cost is too large.'
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: {
      name,
      category,
      unit,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      minimumLevel: Number.isFinite(minimumLevel) ? minimumLevel : 0,
      unitCost: Number.isFinite(unitCost) ? unitCost : 0,
    },
  }
}

function normaliseItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const quantity = Number(raw.quantity)
  const unitCost = Number(raw.unitCost)
  const minimumLevel = Number(raw.minimumLevel)
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
    name,
    category: INVENTORY_CATEGORIES.includes(raw.category) ? raw.category : 'Packaging',
    unit: INVENTORY_UNITS.includes(raw.unit) ? raw.unit : 'piece',
    quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
    unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0,
    minimumLevel: Number.isFinite(minimumLevel) && minimumLevel >= 0 ? Math.floor(minimumLevel) : 0,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  }
}

function readLocalItems() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(INVENTORY_STORAGE_KEY) || 'null')
    if (!Array.isArray(parsed)) return null
    return parsed.map(normaliseItem).filter(Boolean)
  } catch {
    return null
  }
}

function writeLocalItems(items) {
  try {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items))
    return true
  } catch {
    return false
  }
}

function announceChange() {
  try { window.dispatchEvent(new Event(INVENTORY_CHANGED_EVENT)) } catch { /* Storage or events unavailable. */ }
}

function seedLocalItems() {
  const seeded = SAMPLE_INVENTORY.map((item) => ({ id: makeId(), ...item, updatedAt: new Date().toISOString() }))
  writeLocalItems(seeded)
  return seeded
}

// 'database' once the server API answers, otherwise 'browser' (localStorage).
let storageMode = 'browser'

export function getInventoryStorageMode() {
  return storageMode
}

// Local development: sent as the X-Admin-Token header when ADMIN_API_TOKEN is configured.
const adminToken = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_API_TOKEN) || ''

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      ...(options?.headers || {}),
    },
  })
  if (response.status === 404) return { unavailable: true }
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    const message = typeof data?.error === 'string' ? data.error : 'The inventory service is unavailable.'
    return { error: message, status: response.status }
  }
  return { data }
}

// Why the last API attempt fell back to browser storage, so the page can explain it.
let lastApiError = ''

export function getInventoryLastError() {
  return lastApiError
}

export async function getInventoryItems() {
  // Try the server database first; fall back to this browser when it is not configured.
  try {
    const result = await requestJson('/api/inventory')
    if (result.data && Array.isArray(result.data.items)) {
      storageMode = 'database'
      lastApiError = ''
      const items = result.data.items.map(normaliseItem).filter(Boolean)
      writeLocalItems(items)
      return items
    }
    lastApiError = result.error || ''
  } catch {
    // No server running. Continue with the browser copy.
    lastApiError = ''
  }

  storageMode = 'browser'
  const existing = readLocalItems()
  if (existing) return existing
  return seedLocalItems()
}

export async function saveInventoryItem(payload, existingId = null) {
  const { ok, errors, value } = validateInventoryItem(payload)
  if (!ok) {
    const error = new Error('Please correct the highlighted fields.')
    error.fieldErrors = errors
    throw error
  }

  const items = await getInventoryItems()
  const updatedAt = new Date().toISOString()

  if (existingId) {
    const index = items.findIndex((item) => item.id === existingId)
    if (index < 0) throw new Error('That inventory item no longer exists.')
    items[index] = { ...items[index], ...value, updatedAt }
  } else {
    items.unshift({ id: makeId(), ...value, updatedAt })
  }

  if (storageMode === 'database') {
    const result = await requestJson(existingId ? `/api/inventory/${existingId}` : '/api/inventory', {
      method: existingId ? 'PUT' : 'POST',
      body: JSON.stringify(value),
    })
    if (result.error) throw new Error(result.error)
  }

  writeLocalItems(items)
  announceChange()
  return items
}

export async function deleteInventoryItem(id) {
  const items = await getInventoryItems()
  const next = items.filter((item) => item.id !== id)
  if (next.length === items.length) throw new Error('That inventory item no longer exists.')

  if (storageMode === 'database') {
    const result = await requestJson(`/api/inventory/${id}`, { method: 'DELETE' })
    if (result.error) throw new Error(result.error)
  }

  writeLocalItems(next)
  announceChange()
  return next
}

export function subscribeToInventory(callback) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(INVENTORY_CHANGED_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(INVENTORY_CHANGED_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}
