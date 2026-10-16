const LOCAL_ORDERS_KEY = 'sable-stem-local-order-records-v2'
const ORDER_CREATED_EVENT = 'sable-stem-local-order-created'

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1))
    const unitPrice = Math.max(0, Math.round(Number(item.unitPrice ?? item.price) || 0))
    const productId = String(item.productId ?? item.id ?? '')
    const productName = String(item.productName ?? item.name ?? item.title ?? 'Coffee drink')
    return { productId, productName, name: productName, unitPrice, quantity, lineTotal: unitPrice * quantity }
  }).filter((item) => item.quantity > 0 && item.productName)
}

export async function createLocalOrder({ items = [], customer = {}, fulfillment = 'Pickup' } = {}) {
  const cleanItems = normalizeItems(items)
  if (!cleanItems.length) throw new Error('Your bag is empty. Add a drink before checkout.')

  const customerName = String(customer.customerName ?? customer.name ?? '').trim()
  const contactNumber = String(customer.contactNumber ?? customer.phoneNumber ?? customer.phone ?? customer.mobile ?? '').trim()
  const pickupNote = String(customer.pickupNote ?? '').trim()

  const now = new Date()
  const localOrderNumber = `SS-${now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  let orderNumber = localOrderNumber
  let createdAt = now.toISOString()
  let savedToDatabase = false

  // Save to the database first when the API server (server.mjs) is running.
  // When it is not, the browser copy below still keeps a record of the order.
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName,
        contactNumber,
        pickupNote,
        consent: customer.consent === true,
        fulfillment: 'pickup',
        items: cleanItems.map((line) => ({ productId: line.productId, quantity: line.quantity })),
      }),
    })
    if (response.ok) {
      const data = await response.json()
      if (data?.orderNumber) {
        orderNumber = data.orderNumber
        createdAt = data.placedAt || createdAt
        savedToDatabase = true
      }
    } else {
      const data = await response.json().catch(() => null)
      console.warn('[orders] not saved to the database:', data?.error || `HTTP ${response.status}`)
    }
  } catch {
    // No API server reachable. Continue with the browser record.
  }

  const total = cleanItems.reduce((sum, item) => sum + item.lineTotal, 0)
  const order = {
    orderNumber,
    createdAt,
    placedAt: createdAt,
    customerName,
    contactNumber,
    status: 'Recorded',
    fulfillment,
    paymentStatus: 'Not paid online',
    items: cleanItems,
    subtotal: total,
    pickupFee: 0,
    total,
  }

  let savedLocally = false
  try {
    const current = JSON.parse(window.localStorage.getItem(LOCAL_ORDERS_KEY) || '[]')
    const safeCurrent = Array.isArray(current) ? current : []
    const storedOrder = { ...order }
    delete storedOrder.placedAt
    delete storedOrder.paymentStatus
    window.localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify([storedOrder, ...safeCurrent].slice(0, 200)))
    savedLocally = true
    window.dispatchEvent(new Event(ORDER_CREATED_EVENT))
  } catch {
    // Keep the on-screen receipt available if browser storage is unavailable.
  }

  return { ...order, savedLocally, savedToDatabase }
}

export function getDashboardOrders() {
  if (typeof window === 'undefined') return []
  let savedOrders = []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_ORDERS_KEY) || '[]')
    if (Array.isArray(parsed)) {
      savedOrders = parsed.filter((order) => order && typeof order.orderNumber === 'string' && Array.isArray(order.items) && Number.isFinite(Number(order.total)))
    }
  } catch {
    savedOrders = []
  }
  return savedOrders.sort((left, right) => new Date(right.createdAt || right.placedAt).getTime() - new Date(left.createdAt || left.placedAt).getTime())
}
