import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { MENU_BY_ID } from './src/menu-data.js'

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production')
const portArgument = process.argv.find((argument) => argument.startsWith('--port='))
const port = Number(portArgument?.slice('--port='.length) || process.env.PORT || 5173)
const hostArgument = process.argv.find((argument) => argument.startsWith('--host='))
const host = hostArgument?.slice('--host='.length) || (isProduction ? '0.0.0.0' : '127.0.0.1')
const sessionCookieName = 'webdev_app_session'
const stateCookieName = 'sable_oauth_nonce'
const stateMacCookieName = 'sable_oauth_state_mac'
const databaseUrl = process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL
const jwtSecret = process.env.MANUS_JWT_SECRET
const appId = process.env.MANUS_PROJECT_ID
// Local development only: when set, this shared token replaces Manus OAuth for admin API calls.
const localAdminToken = process.env.ADMIN_API_TOKEN
let pool
let vite

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(data))
}

function sendRedirect(response, location, extraHeaders = {}) {
  response.writeHead(302, { Location: location, 'Cache-Control': 'no-store', ...extraHeaders })
  response.end()
}

function cookiesFrom(request) {
  const result = Object.create(null)
  for (const entry of (request.headers.cookie || '').split(';')) {
    const separator = entry.indexOf('=')
    if (separator < 0) continue
    const name = entry.slice(0, separator).trim()
    const value = entry.slice(separator + 1).trim()
    try { result[name] = decodeURIComponent(value) } catch { result[name] = value }
  }
  return result
}

function secureCompare(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function signedValue(value, secret = jwtSecret) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function signJwt(payload) {
  if (!jwtSecret) throw new ApiError(503, 'Admin sign-in is not configured for this project.')
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const content = `${header}.${body}`
  return `${content}.${signedValue(content)}`
}

function verifyJwt(token) {
  if (!jwtSecret || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerPart, bodyPart, signature] = parts
  const content = `${headerPart}.${bodyPart}`
  if (!secureCompare(signedValue(content), signature)) return null
  try {
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(bodyPart, 'base64url').toString('utf8'))
    if (header.alg !== 'HS256' || payload.appId !== appId) return null
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null
    if (typeof payload.openId !== 'string' || !payload.openId) return null
    return payload
  } catch {
    return null
  }
}

async function readJson(request, limit = 24_000) {
  let size = 0
  const chunks = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > limit) throw new ApiError(413, 'The submitted order is too large.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiError(400, 'Please check the order details and try again.')
  }
}

function requiredText(value, label, minLength, maxLength) {
  if (typeof value !== 'string') throw new ApiError(400, `${label} is required.`)
  const cleaned = value.trim()
  if (cleaned.length < minLength || cleaned.length > maxLength) {
    throw new ApiError(400, `${label} must be between ${minLength} and ${maxLength} characters.`)
  }
  return cleaned
}

function getDatabasePool() {
  if (pool) return pool
  if (!databaseUrl) throw new ApiError(503, 'The order database is not connected to this runtime.')

  const parsed = new URL(databaseUrl)
  if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mariadb:') {
    throw new ApiError(503, 'The configured order database URL is not a MySQL connection.')
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!parsed.hostname || !parsed.username || !databaseName) {
    throw new ApiError(503, 'The configured order database connection is incomplete.')
  }

  const sslMode = (parsed.searchParams.get('ssl-mode') || parsed.searchParams.get('sslmode') || parsed.searchParams.get('ssl') || 'required').toLowerCase()
  const connectionOptions = {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: databaseName,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    decimalNumbers: true,
  }
  if (!['false', '0', 'disable', 'disabled'].includes(sslMode)) {
    connectionOptions.ssl = { rejectUnauthorized: true }
  }

  pool = import('mysql2/promise').then((mysqlModule) => {
    const mysql = mysqlModule.createPool ? mysqlModule : mysqlModule.default
    if (!mysql?.createPool) throw new Error('The MySQL driver does not expose createPool.')
    return mysql.createPool(connectionOptions)
  })
  return pool
}

async function ensureSchema() {
  const db = await getDatabasePool()
  await db.query(`
    CREATE TABLE IF NOT EXISTS ss_schema_migrations (
      migration_id VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  const [appliedMigrations] = await db.execute(
    'SELECT migration_id FROM ss_schema_migrations WHERE migration_id = ? LIMIT 1',
    ['001_orders_and_items'],
  )
  if (appliedMigrations.length > 0) {
    await db.query('SELECT 1')
    return
  }
  await db.query(`
    CREATE TABLE IF NOT EXISTS ss_orders (
      order_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_number VARCHAR(40) NOT NULL UNIQUE,
      customer_name VARCHAR(80) NOT NULL,
      contact_number VARCHAR(24) NOT NULL,
      pickup_note VARCHAR(300) NOT NULL DEFAULT '',
      fulfillment VARCHAR(16) NOT NULL DEFAULT 'pickup',
      currency CHAR(3) NOT NULL DEFAULT 'PHP',
      total_amount DECIMAL(10,2) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'received',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX ss_orders_created_at_idx (created_at),
      INDEX ss_orders_status_created_idx (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await db.query(`
    CREATE TABLE IF NOT EXISTS ss_order_items (
      order_item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      product_id VARCHAR(64) NOT NULL,
      product_name VARCHAR(120) NOT NULL,
      unit_price DECIMAL(10,2) NOT NULL,
      quantity SMALLINT UNSIGNED NOT NULL,
      line_total DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX ss_order_items_product_idx (product_id),
      CONSTRAINT ss_order_items_order_fk FOREIGN KEY (order_id)
        REFERENCES ss_orders (order_id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  await db.execute('INSERT IGNORE INTO ss_schema_migrations (migration_id) VALUES (?)', ['001_orders_and_items'])

  const [inventoryApplied] = await db.execute(
    'SELECT migration_id FROM ss_schema_migrations WHERE migration_id = ? LIMIT 1',
    ['002_inventory'],
  )
  if (inventoryApplied.length === 0) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ss_inventory (
        inventory_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        external_id VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(80) NOT NULL,
        category VARCHAR(40) NOT NULL,
        quantity DECIMAL(12,3) NOT NULL DEFAULT 0,
        unit VARCHAR(20) NOT NULL,
        unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
        minimum_level INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX ss_inventory_category_idx (category),
        INDEX ss_inventory_name_idx (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    await db.execute('INSERT IGNORE INTO ss_schema_migrations (migration_id) VALUES (?)', ['002_inventory'])
  }
  await db.query('SELECT 1')
}

async function createOrder(request, response) {
  if (!databaseUrl) throw new ApiError(503, 'Online ordering is not available because the order database is not connected.')
  const contentType = String(request.headers['content-type'] || '').toLowerCase()
  if (!contentType.includes('application/json')) throw new ApiError(415, 'Orders must be submitted as JSON.')

  const body = await readJson(request)
  const customerName = requiredText(body.customerName, 'Your name', 2, 80)
  const contactNumber = requiredText(body.contactNumber, 'Contact number', 8, 24)
  if (body.consent !== true) throw new ApiError(400, 'Please agree to the order contact notice before submitting.')
  const digits = contactNumber.replace(/\D/g, '')
  if (digits.length < 8 || !/^[+()\d .-]+$/.test(contactNumber)) {
    throw new ApiError(400, 'Please enter a valid contact number.')
  }
  const pickupNote = typeof body.pickupNote === 'string' ? body.pickupNote.trim().slice(0, 300) : ''
  if (body.fulfillment !== 'pickup') throw new ApiError(400, 'Only pickup orders are available at this time.')
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    throw new ApiError(400, 'Add at least one drink before placing your order.')
  }

  const quantities = new Map()
  let totalQuantity = 0
  for (const item of body.items) {
    const productId = typeof item?.productId === 'string' ? item.productId : ''
    const quantity = Number(item?.quantity)
    if (!MENU_BY_ID[productId] || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new ApiError(400, 'One of the selected drinks or quantities is not valid.')
    }
    totalQuantity += quantity
    if (totalQuantity > 60) throw new ApiError(400, 'An order can include up to 60 drinks.')
    quantities.set(productId, (quantities.get(productId) || 0) + quantity)
  }

  const lines = [...quantities.entries()].map(([productId, quantity]) => {
    const product = MENU_BY_ID[productId]
    return { productId, productName: product.name, unitPrice: product.price, quantity, lineTotal: product.price * quantity }
  })
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const datePart = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const orderNumber = `SS-${datePart}-${randomBytes(4).toString('hex').toUpperCase()}`
  const db = await getDatabasePool()
  const connection = await db.getConnection()

  try {
    await connection.beginTransaction()
    const [orderResult] = await connection.execute(
      `INSERT INTO ss_orders (order_number, customer_name, contact_number, pickup_note, fulfillment, currency, total_amount, status)
       VALUES (?, ?, ?, ?, 'pickup', 'PHP', ?, 'received')`,
      [orderNumber, customerName, contactNumber, pickupNote, total],
    )
    for (const line of lines) {
      await connection.execute(
        `INSERT INTO ss_order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderResult.insertId, line.productId, line.productName, line.unitPrice, line.quantity, line.lineTotal],
      )
    }
    await connection.commit()
    sendJson(response, 201, {
      orderNumber,
      total,
      currency: 'PHP',
      status: 'received',
      placedAt: new Date().toISOString(),
      items: lines,
    })
  } catch (error) {
    try { await connection.rollback() } catch { /* Preserve the original database error. */ }
    console.error('[orders] create failed:', error?.code || 'database_error')
    throw new ApiError(500, 'We could not save your order just now. Please try again.')
  } finally {
    connection.release()
  }
}

function requireAdmin(request) {
  // Local development: a shared token in the .env file replaces the Manus OAuth sign-in.
  if (localAdminToken) {
    const expected = Buffer.from(localAdminToken)
    const provided = Buffer.from(String(request.headers['x-admin-token'] || ''))
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return { email: 'local-admin' }
    }
    throw new ApiError(401, 'The local admin token is missing or incorrect. Check ADMIN_API_TOKEN and VITE_ADMIN_API_TOKEN.')
  }
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  if (!adminEmail) throw new ApiError(503, 'The store administrator account has not been configured yet.')
  if (!jwtSecret || !appId) throw new ApiError(503, 'Admin sign-in is not configured for this project.')
  const token = cookiesFrom(request)[sessionCookieName]
  const session = verifyJwt(token)
  if (!session) throw new ApiError(401, 'Please sign in with the authorized store account.')
  if (String(session.email || '').trim().toLowerCase() !== adminEmail) {
    throw new ApiError(403, 'This account is not authorized to view store data.')
  }
  return session
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10)
}

function daysAgoUtc(days) {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - days)
  return date
}

async function adminSummary(request, response, url) {
  requireAdmin(request)
  const db = await getDatabasePool()
  const requestedDays = Number(url.searchParams.get('days'))
  const days = [7, 14, 30].includes(requestedDays) ? requestedDays : 14
  const startDate = dateOnly(daysAgoUtc(days - 1))
  const [metricRows] = await db.execute(
    `SELECT COUNT(*) AS totalOrders,
            COALESCE(SUM(total_amount), 0) AS orderValue,
            COALESCE(AVG(total_amount), 0) AS averageOrderValue
       FROM ss_orders
      WHERE created_at >= ? AND status <> 'cancelled'`,
    [`${startDate} 00:00:00`],
  )
  const [dailyRows] = await db.execute(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS orderDate,
            COALESCE(SUM(total_amount), 0) AS orderValue
       FROM ss_orders
      WHERE created_at >= ? AND status <> 'cancelled'
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY orderDate ASC`,
    [`${startDate} 00:00:00`],
  )
  const dailyByDate = new Map(dailyRows.map((row) => [String(row.orderDate).slice(0, 10), Number(row.orderValue || 0)]))
  const salesByDay = []
  for (let offset = 0; offset < days; offset += 1) {
    const date = daysAgoUtc(days - offset - 1)
    const key = dateOnly(date)
    salesByDay.push({ date: key, orderValue: dailyByDate.get(key) || 0 })
  }

  const [topDrinkRows] = await db.execute(
    `SELECT i.product_id AS productId,
            i.product_name AS name,
            COALESCE(SUM(i.quantity), 0) AS units,
            COALESCE(SUM(i.line_total), 0) AS orderValue
       FROM ss_order_items AS i
       INNER JOIN ss_orders AS o ON o.order_id = i.order_id
      WHERE o.created_at >= ? AND o.status <> 'cancelled'
      GROUP BY i.product_id, i.product_name
      ORDER BY units DESC, orderValue DESC
      LIMIT 5`,
    [`${startDate} 00:00:00`],
  )
  const [recentRows] = await db.execute(
    `SELECT order_number AS orderNumber,
            customer_name AS customerName,
            contact_number AS contactNumber,
            total_amount AS total,
            status,
            created_at AS createdAt
       FROM ss_orders
      ORDER BY created_at DESC
      LIMIT 20`,
  )
  const metric = metricRows[0] || {}
  sendJson(response, 200, {
    periodDays: days,
    metrics: {
      totalOrders: Number(metric.totalOrders || 0),
      orderValue: Number(metric.orderValue || 0),
      averageOrderValue: Number(metric.averageOrderValue || 0),
      currency: 'PHP',
    },
    salesByDay,
    topDrinks: topDrinkRows.map((row) => ({
      productId: row.productId,
      name: row.name,
      units: Number(row.units || 0),
      orderValue: Number(row.orderValue || 0),
    })),
    recentOrders: recentRows.map((row) => ({
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      contactNumber: row.contactNumber,
      total: Number(row.total || 0),
      status: row.status,
      createdAt: new Date(row.createdAt).toISOString(),
    })),
  })
}

// ---- Inventory (admin only) ----

const INVENTORY_CATEGORIES = ['Coffee', 'Dairy', 'Sweeteners', 'Syrups', 'Powders', 'Packaging']
const INVENTORY_UNITS = ['kg', 'g', 'L', 'ml', 'bottle', 'pack', 'piece']

function cleanInventoryPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new ApiError(400, 'Please send the inventory item as JSON.')
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (name.length < 2 || name.length > 80) throw new ApiError(400, 'Item name must be between 2 and 80 characters.')
  const category = String(payload.category || '')
  if (!INVENTORY_CATEGORIES.includes(category)) throw new ApiError(400, 'Please choose a valid category.')
  const unit = String(payload.unit || '')
  if (!INVENTORY_UNITS.includes(unit)) throw new ApiError(400, 'Please choose a valid unit.')

  const quantity = Number(payload.quantity)
  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) {
    throw new ApiError(400, 'Quantity must be a number of 0 or more.')
  }
  const unitCost = Number(payload.unitCost)
  if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 1_000_000) {
    throw new ApiError(400, 'Unit cost must be a number of 0 or more.')
  }
  const minimumLevel = Number(payload.minimumLevel)
  if (!Number.isInteger(minimumLevel) || minimumLevel < 0) {
    throw new ApiError(400, 'Minimum stock level must be a whole number of 0 or more.')
  }
  return { name, category, unit, quantity, unitCost, minimumLevel }
}

function rowToInventoryItem(row) {
  return {
    id: row.external_id,
    name: row.name,
    category: row.category,
    quantity: Number(row.quantity || 0),
    unit: row.unit,
    unitCost: Number(row.unitCost || 0),
    minimumLevel: Number(row.minimumLevel || 0),
    updatedAt: new Date(row.updatedAt).toISOString(),
  }
}

async function listInventory(request, response) {
  requireAdmin(request)
  const db = await getDatabasePool()
  const [rows] = await db.execute(
    'SELECT external_id, name, category, quantity, unit, unit_cost AS unitCost, minimum_level AS minimumLevel, updated_at AS updatedAt FROM ss_inventory ORDER BY name ASC',
  )
  sendJson(response, 200, { items: rows.map(rowToInventoryItem) })
}

async function createInventoryItem(request, response) {
  requireAdmin(request)
  const values = cleanInventoryPayload(await readJson(request))
  const externalId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const db = await getDatabasePool()
  await db.execute(
    'INSERT INTO ss_inventory (external_id, name, category, quantity, unit, unit_cost, minimum_level) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [externalId, values.name, values.category, values.quantity, values.unit, values.unitCost, values.minimumLevel],
  )
  response.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify({ id: externalId }))
}

async function updateInventoryItem(request, response, id) {
  requireAdmin(request)
  const values = cleanInventoryPayload(await readJson(request))
  const db = await getDatabasePool()
  const [result] = await db.execute(
    'UPDATE ss_inventory SET name = ?, category = ?, quantity = ?, unit = ?, unit_cost = ?, minimum_level = ? WHERE external_id = ?',
    [values.name, values.category, values.quantity, values.unit, values.unitCost, values.minimumLevel, id],
  )
  if (!result.affectedRows) throw new ApiError(404, 'That inventory item no longer exists.')
  sendJson(response, 200, { id })
}

async function deleteInventoryItem(request, response, id) {
  requireAdmin(request)
  const db = await getDatabasePool()
  const [result] = await db.execute('DELETE FROM ss_inventory WHERE external_id = ?', [id])
  if (!result.affectedRows) throw new ApiError(404, 'That inventory item no longer exists.')
  sendJson(response, 200, { id })
}

function requireOAuthConfiguration() {
  const missing = ['MANUS_PROJECT_ID', 'MANUS_JWT_SECRET', 'MANUS_OAUTH_PORTAL_URL', 'MANUS_OAUTH_API_URL', 'ADMIN_EMAIL']
    .filter((name) => !process.env[name])
  if (missing.length) throw new ApiError(503, 'Store admin sign-in is not configured yet.')
}

function getValidatedBrowserOrigin(request, url) {
  const requestedOrigin = url.searchParams.get('origin')
  const referer = request.headers.referer
  let actualOrigin = request.headers.origin || ''
  if (!actualOrigin && referer) {
    try { actualOrigin = new URL(referer).origin } catch { actualOrigin = '' }
  }
  if (!requestedOrigin || !actualOrigin || requestedOrigin !== actualOrigin) {
    throw new ApiError(400, 'Please open admin sign-in from the coffee-shop page.')
  }
  let parsed
  try { parsed = new URL(requestedOrigin) } catch { throw new ApiError(400, 'The sign-in origin is not valid.') }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== requestedOrigin) {
    throw new ApiError(400, 'The sign-in origin is not valid.')
  }
  return parsed.origin
}

function cookieHeader(name, value, maxAge, path = '/') {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`
}

function clearCookie(name, path = '/') {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=None`
}

function startOAuth(request, response, url) {
  requireOAuthConfiguration()
  const origin = getValidatedBrowserOrigin(request, url)
  const redirectUri = new URL('/api/auth/callback', origin).toString()
  const nonce = randomBytes(24).toString('base64url')
  const state = Buffer.from(JSON.stringify({ redirectUri, nonce }), 'utf8').toString('base64')
  const stateMac = signedValue(state)
  const authUrl = new URL(`${String(process.env.MANUS_OAUTH_PORTAL_URL).replace(/\/+$/, '')}/app-auth`)
  authUrl.searchParams.set('appId', process.env.MANUS_PROJECT_ID)
  authUrl.searchParams.set('redirectUri', redirectUri)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('responseType', 'code')
  const headers = {
    'Set-Cookie': [
      cookieHeader(stateCookieName, nonce, 600, '/api/auth/callback'),
      cookieHeader(stateMacCookieName, stateMac, 600, '/api/auth/callback'),
    ],
    'Cache-Control': 'no-store',
  }
  sendRedirect(response, authUrl.toString(), headers)
}

function parseBase64Json(value) {
  try { return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) } catch { return null }
}

async function exchangeOAuthCode(code, redirectUri) {
  const apiBase = String(process.env.MANUS_OAUTH_API_URL).replace(/\/+$/, '')
  const response = await fetch(`${apiBase}/webdev.v1.WebDevAuthPublicService/ExchangeToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      clientId: process.env.MANUS_PROJECT_ID,
      grantType: 'authorization_code',
      code,
      redirectUri,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.accessToken !== 'string') throw new Error('oauth_exchange_failed')
  return data.accessToken
}

async function lookupOAuthUser(accessToken) {
  const apiBase = String(process.env.MANUS_OAUTH_API_URL).replace(/\/+$/, '')
  const response = await fetch(`${apiBase}/webdev.v1.WebDevAuthPublicService/GetUserInfo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ accessToken }),
    signal: AbortSignal.timeout(12_000),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || typeof data.openId !== 'string' || typeof data.email !== 'string') throw new Error('oauth_identity_failed')
  return data
}

async function finishOAuth(request, response, url) {
  const state = url.searchParams.get('state') || ''
  const savedNonce = cookiesFrom(request)[stateCookieName]
  const savedMac = cookiesFrom(request)[stateMacCookieName]
  const expectedMac = jwtSecret ? signedValue(state) : ''
  const stateData = parseBase64Json(state)
  const clearStateCookies = [
    clearCookie(stateCookieName, '/api/auth/callback'),
    clearCookie(stateMacCookieName, '/api/auth/callback'),
  ]
  if (!stateData || !stateData.redirectUri || !stateData.nonce || !secureCompare(stateData.nonce, savedNonce) || !secureCompare(expectedMac, savedMac)) {
    sendJson(response, 400, { error: 'The sign-in session expired. Please try again.' })
    return
  }

  let callbackOrigin
  try { callbackOrigin = new URL(stateData.redirectUri).origin } catch { callbackOrigin = '' }
  const code = url.searchParams.get('code')
  if (!callbackOrigin || !stateData.redirectUri.endsWith('/api/auth/callback') || !code) {
    sendJson(response, 400, { error: 'The sign-in callback was incomplete.' })
    return
  }

  try {
    requireOAuthConfiguration()
    const accessToken = await exchangeOAuthCode(code, stateData.redirectUri)
    const user = await lookupOAuthUser(accessToken)
    const allowedEmail = String(process.env.ADMIN_EMAIL).trim().toLowerCase()
    const userEmail = String(user.email).trim().toLowerCase()
    if (!allowedEmail || userEmail !== allowedEmail) {
      sendRedirect(response, new URL('/admin?error=not_authorized', callbackOrigin).toString(), { 'Set-Cookie': [...clearStateCookies, clearCookie(sessionCookieName)] })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const token = signJwt({
      appId,
      openId: user.openId,
      name: String(user.name || '').slice(0, 100),
      email: userEmail,
      iat: now,
      exp: now + (7 * 24 * 60 * 60),
    })
    sendRedirect(response, new URL('/admin', callbackOrigin).toString(), {
      'Set-Cookie': [...clearStateCookies, cookieHeader(sessionCookieName, token, 7 * 24 * 60 * 60)],
    })
  } catch (error) {
    console.error('[admin-auth] callback failed:', error?.message || 'auth_error')
    sendRedirect(response, new URL('/admin?error=sign_in_failed', callbackOrigin).toString(), { 'Set-Cookie': clearStateCookies })
  }
}

async function handleApi(request, response, url) {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { ok: true })
    return
  }
  if (url.pathname === '/api/orders' && request.method === 'POST') {
    await createOrder(request, response)
    return
  }
  if (url.pathname === '/api/admin/summary' && request.method === 'GET') {
    await adminSummary(request, response, url)
    return
  }
  if (url.pathname === '/api/inventory' && request.method === 'GET') {
    await listInventory(request, response)
    return
  }
  if (url.pathname === '/api/inventory' && request.method === 'POST') {
    await createInventoryItem(request, response)
    return
  }
  const inventoryMatch = url.pathname.match(/^\/api\/inventory\/([^/]+)$/)
  if (inventoryMatch) {
    const inventoryId = decodeURIComponent(inventoryMatch[1])
    if (request.method === 'PUT') {
      await updateInventoryItem(request, response, inventoryId)
      return
    }
    if (request.method === 'DELETE') {
      await deleteInventoryItem(request, response, inventoryId)
      return
    }
  }
  if (url.pathname === '/api/auth/login' && request.method === 'GET') {
    startOAuth(request, response, url)
    return
  }
  if (url.pathname === '/api/auth/callback' && request.method === 'GET') {
    await finishOAuth(request, response, url)
    return
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'GET') {
    sendRedirect(response, '/admin', { 'Set-Cookie': clearCookie(sessionCookieName) })
    return
  }
  sendJson(response, 404, { error: 'API endpoint not found.' })
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function serveProductionFile(request, response, pathname) {
  const publicRoot = resolve(process.cwd(), 'dist')
  let decoded
  try { decoded = decodeURIComponent(pathname) } catch { decoded = '/' }
  let filePath = resolve(publicRoot, `.${decoded}`)
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
    response.writeHead(400)
    response.end('Bad request')
    return
  }
  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = resolve(filePath, 'index.html')
  } catch {
    filePath = resolve(publicRoot, 'index.html')
  }
  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not_file')
    const cacheControl = filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
    })
    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
  }
}

async function main() {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a valid HTTP port between 1024 and 65535.')
  if (!databaseUrl) throw new Error('The managed order database is not available in this process environment.')
  await ensureSchema()

  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
    if (url.pathname.startsWith('/api/')) {
      handleApi(request, response, url).catch((error) => {
        if (response.headersSent) {
          response.destroy()
          return
        }
        if (error instanceof ApiError) sendJson(response, error.status, { error: error.message })
        else {
          console.error('[api] request failed:', error?.code || 'internal_error')
          sendJson(response, 500, { error: 'Something went wrong. Please try again.' })
        }
      })
      return
    }

    if (vite) {
      vite.middlewares(request, response, (error) => {
        if (error) {
          console.error('[vite] request failed:', error?.message || 'vite_error')
          if (!response.headersSent) {
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
            response.end('The page could not be loaded.')
          }
        }
      })
      return
    }
    serveProductionFile(request, response, url.pathname).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500)
        response.end('The page could not be loaded.')
      }
    })
  })

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite')
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server }, host },
      appType: 'spa',
    })
  }

  server.listen(port, host, () => {
    console.log(`Sable & Stem ${isProduction ? 'server' : 'local preview'} listening on http://${host}:${port}`)
  })

  const close = async () => {
    server.close()
    if (vite) await vite.close()
    const currentPool = await pool
    await currentPool.end()
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}

main().catch((error) => {
  console.error('[startup] Sable & Stem could not start:', error?.code || error?.message || 'startup_error')
  process.exitCode = 1
})
