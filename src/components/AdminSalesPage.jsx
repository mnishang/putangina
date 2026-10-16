import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatPhp } from '../currency.js'
import { getDashboardOrders } from '../local-orders.js'
import { getInventoryItems, getStockStatus, subscribeToInventory } from '../inventory.js'
import AdminInventoryPanel from './AdminInventoryPanel.jsx'

const AUTH_KEY = 'sable-stem-admin-session-v1'
const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'root'
const numberFormat = new Intl.NumberFormat('en-PH')
const dayFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
const fullDateFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
const NAVIGATION = [
  { id: 'dashboard', icon: '⌂', label: 'Overview' },
  { id: 'sales', icon: '▤', label: 'Sales Records' },
  { id: 'inventory', icon: '✳', label: 'Inventory' },
  { id: 'analytics', icon: '↗', label: 'Sales Trends' },
  { id: 'recommendations', icon: '✦', label: 'Recommendations' },
]

function dateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getDailyRevenue(days = 7, orders = []) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (days - index - 1))
    const key = dateKey(date)
    const amount = orders.reduce((sum, order) => dateKey(order.createdAt) === key ? sum + Number(order.total || 0) : sum, 0)
    return { key, label: dayFormat.format(date), amount }
  })
}

function getPopularDrinks(orders = []) {
  const totals = new Map()
  for (const order of orders) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const productId = item.productId || item.name || item.productName || 'drink'
      const name = item.name || item.productName || 'Coffee drink'
      const current = totals.get(productId) || { productId, name, units: 0, revenue: 0 }
      const quantity = Number(item.quantity) || 0
      current.units += quantity
      current.revenue += Number(item.lineTotal) || (Number(item.unitPrice) || 0) * quantity
      totals.set(productId, current)
    }
  }
  return [...totals.values()].sort((left, right) => right.units - left.units)
}

function getMetrics(orders = []) {
  const revenue = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
  const drinksSold = orders.reduce((sum, order) => sum + (Array.isArray(order.items) ? order.items.reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0) : 0), 0)
  const popularDrinks = getPopularDrinks(orders)
  return { revenue, drinksSold, transactions: orders.length, bestSeller: popularDrinks[0] || null, popularDrinks }
}

function formatOrderDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : fullDateFormat.format(date)
}

function AdminLogin({ onLogin }) {
  const [username, setUsername] = useState(ADMIN_USERNAME)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    if (username.trim().toLowerCase() !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
      setError('Incorrect username or password.')
      return
    }
    setError('')
    onLogin()
  }

  return (
    <main className="asp-login">
      <div className="asp-login__card">
        <a className="asp-login__back" href="/">← Back to the coffee shop</a>
        <a className="asp-login__brand" href="/" aria-label="Sable & Stem Coffee home">
          <img src="/sable-stem-logo.svg" alt="Sable & Stem Coffee" />
        </a>
        <p className="asp-eyebrow">STORE ADMINISTRATION</p>
        <h1>A thoughtful<br />look at <em>the numbers.</em></h1>
        <p className="asp-login__intro">Sign in to manage the Sable &amp; Stem storefront and review orders.</p>
        <form className="asp-login__form" onSubmit={submit}>
          <label htmlFor="asp-username">Username</label>
          <input id="asp-username" type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          <label htmlFor="asp-password">Password</label>
          <input id="asp-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          {error && <p className="asp-error" role="alert">{error}</p>}
          <button className="asp-button asp-button--primary" type="submit">Enter the dashboard <span aria-hidden="true">↗</span></button>
        </form>
      </div>
      <aside className="asp-login__art" aria-hidden="true">
        <div className="asp-login__sun">✳</div>
        <div className="asp-login__quote"><span>THE ROASTERY NOTE · 01</span><strong>Numbers tell<br />a story. <em>Care</em><br />makes it worth<br />telling.</strong><i>Slowly made, gladly shared.</i></div>
      </aside>
    </main>
  )
}

function MetricCard({ icon, label, value, note, featured = false }) {
  return (
    <article className={`asp-metric${featured ? ' asp-metric--featured' : ''}`}>
      <div className="asp-metric__top"><span className="asp-metric__icon" aria-hidden="true">{icon}</span><span className="asp-metric__label">{label}</span></div>
      <strong className="asp-metric__value">{value}</strong>
      <span className="asp-metric__note">{note}</span>
    </article>
  )
}

function EmptyState({ title, children }) {
  return <div className="asp-empty-state"><span aria-hidden="true">✳</span><div><h2>{title}</h2><p>{children}</p></div></div>
}

function DailyChart({ data }) {
  const max = Math.max(1, ...data.map((day) => day.amount))
  return (
    <div className="asp-chart" role="img" aria-label="Daily recorded order value for the last seven days">
      <div className="asp-chart__grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="asp-chart__bars">
        {data.map((day) => (
          <div className="asp-chart__day" key={day.key} title={`${day.label}: ${formatPhp(day.amount)}`}>
            <div className="asp-chart__track"><span className="asp-chart__bar" style={{ height: `${day.amount ? Math.max(7, (day.amount / max) * 100) : 0}%` }} /></div>
            <span className="asp-chart__label">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SalesTable({ orders, compact = false, search = '', onSearch }) {
  const filtered = orders.filter((order) => {
    const itemNames = (Array.isArray(order.items) ? order.items : []).map((item) => item.name || item.productName || '').join(' ')
    return `${order.orderNumber} ${order.customerName || ''} ${itemNames}`.toLowerCase().includes(search.trim().toLowerCase())
  })
  const rows = compact ? filtered.slice(0, 5) : filtered
  const emptyText = orders.length && search ? 'No orders match your search.' : 'No sales records yet. Homepage orders will appear here.'

  return (
    <>
      {!compact && <label className="asp-search"><span aria-hidden="true">⌕</span><input aria-label="Search sales records" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name, order or drink" /></label>}
      <div className="asp-table-wrap">
        <table className={`asp-table${rows.length ? '' : ' asp-table--empty'}`}>
          <thead><tr><th>Customer</th><th>Placed</th><th>Drinks</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((order) => {
              const status = order.status || 'Recorded'
              return (
                <tr key={order.orderNumber}>
                  <td><strong>{order.customerName || 'Walk-in customer'}</strong><small className="asp-table__ref">{order.orderNumber}</small></td>
                  <td>{formatOrderDate(order.createdAt)}</td>
                  <td>{(Array.isArray(order.items) ? order.items : []).map((item) => `${item.quantity}× ${item.name || item.productName}`).join(', ')}</td>
                  <td className="asp-table__amount">{formatPhp(Number(order.total) || 0)}</td>
                  <td><span className={`asp-status asp-status--${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span></td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan="5" className="asp-table__empty">{emptyText}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Dashboard({ onLogout }) {
  const [activeView, setActiveView] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/admin/sales' ? 'sales' : 'dashboard')
  const [search, setSearch] = useState('')
  const [orders, setOrders] = useState(() => getDashboardOrders())
  const [inventory, setInventory] = useState([])
  const refreshOrders = useCallback(() => setOrders(getDashboardOrders()), [])
  const refreshInventory = useCallback(() => {
    getInventoryItems().then(setInventory).catch(() => setInventory([]))
  }, [])

  useEffect(() => {
    window.addEventListener('storage', refreshOrders)
    window.addEventListener('sable-stem-local-order-created', refreshOrders)
    const handlePopState = () => setActiveView(window.location.pathname.replace(/\/+$/, '') === '/admin/sales' ? 'sales' : 'dashboard')
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('storage', refreshOrders)
      window.removeEventListener('sable-stem-local-order-created', refreshOrders)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [refreshOrders])

  useEffect(() => {
    refreshInventory()
    return subscribeToInventory(refreshInventory)
  }, [refreshInventory])

  const metrics = useMemo(() => getMetrics(orders), [orders])
  const dailyRevenue = useMemo(() => getDailyRevenue(7, orders), [orders])
  // Items that need reordering, sorted so the emptiest shelves come first.
  const stockAlerts = useMemo(() => inventory
    .filter((item) => getStockStatus(item.quantity, item.minimumLevel) !== 'In Stock')
    .sort((left, right) => Number(left.quantity) - Number(right.quantity))
    .slice(0, 5), [inventory])
  const section = NAVIGATION.find((item) => item.id === activeView) || NAVIGATION[0]
  const pageHeading = activeView === 'dashboard' ? 'The day, at a glance.' : section.label

  const changeView = (view) => {
    setActiveView(view)
    const path = view === 'sales' ? '/admin/sales' : '/admin'
    if (window.location.pathname !== path) window.history.pushState({ view }, '', path)
  }

  return (
    <div className="asp-shell">
      <aside className="asp-sidebar">
        <a className="asp-brand" href="/" aria-label="Sable & Stem Coffee home">
          <img className="asp-brand__image" src="/sable-stem-logo.svg" alt="Sable & Stem Coffee" />
        </a>
        <div className="asp-sidebar__label">STORE</div>
        <nav className="asp-nav" aria-label="Admin navigation">
          {NAVIGATION.map((item) => (
            <button className={`asp-nav__item${activeView === item.id ? ' is-active' : ''}`} key={item.id} type="button" onClick={() => changeView(item.id)} aria-current={activeView === item.id ? 'page' : undefined}>
              <span className="asp-nav__icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>{activeView === item.id && <i aria-hidden="true" />}
            </button>
          ))}
        </nav>
        <div className="asp-sidebar__bottom">
          <div className="asp-sidebar__note"><span>✳</span><p>Small data, thoughtful decisions.<br /><em>Every cup counts.</em></p></div>
          <button className="asp-nav__item asp-nav__logout" type="button" onClick={onLogout}><span className="asp-nav__icon" aria-hidden="true">↪</span><span>Log out</span></button>
          <a className="asp-nav__home" href="/">← Go back to the home page</a>
        </div>
      </aside>

      <main className="asp-main">
        <header className="asp-topbar">
          <div><p className="asp-eyebrow">SABLE &amp; STEM <span>/</span> {section.label.toUpperCase()}</p><h1>{pageHeading}</h1><p className="asp-topbar__sub">Orders, menu and daily trade.</p></div>
          <div className="asp-topbar__right">
            <button className="asp-refresh" type="button" onClick={refreshOrders}>Refresh records <span aria-hidden="true">↻</span></button>
            <div className="asp-user"><span className="asp-user__avatar">S</span><span><strong>Store admin</strong><small>Sable &amp; Stem</small></span></div>
          </div>
        </header>

        {activeView === 'dashboard' && (
          <div className="asp-page">
            <div className="asp-period-row"><div><span className="asp-section-kicker">ALL-TIME</span><span className="asp-period-caption">Recorded orders</span></div><span className="asp-date-badge">{numberFormat.format(orders.length)} orders</span></div>
            <section className="asp-metrics" aria-label="Recorded order summary">
              <MetricCard icon="₱" label="Recorded Sales" value={formatPhp(metrics.revenue)} note="From saved homepage orders" featured />
              <MetricCard icon="◌" label="Drinks Sold" value={numberFormat.format(metrics.drinksSold)} note="Units in recorded orders" />
              <MetricCard icon="▤" label="Orders" value={numberFormat.format(metrics.transactions)} note="Saved order records" />
              <MetricCard icon="✦" label="Most Ordered" value={metrics.bestSeller?.name || '—'} note={metrics.bestSeller ? `${numberFormat.format(metrics.bestSeller.units)} drinks` : 'No orders yet'} />
            </section>

            <section className="asp-dashboard-grid">
              <article className="asp-panel asp-panel--wide">
                <div className="asp-panel__head"><div><span className="asp-section-kicker">LAST SEVEN DAYS</span><h2>Recorded order <em>value</em></h2></div><span className="asp-panel__total">{formatPhp(dailyRevenue.reduce((sum, day) => sum + day.amount, 0))}</span></div>
                {orders.length ? <DailyChart data={dailyRevenue} /> : <EmptyState title="No order activity yet">Orders placed from the homepage will appear here.</EmptyState>}
              </article>
              <article className="asp-panel asp-best-card">
                <span className="asp-section-kicker">MOST ORDERED DRINK</span>
                {metrics.bestSeller ? <>
                  <div className="asp-best-card__star">✳</div>
                  <h2>{metrics.bestSeller.name}</h2>
                  <p className="asp-best-card__copy">Based on recorded homepage orders.</p>
                  <div className="asp-best-card__foot"><span>{numberFormat.format(metrics.bestSeller.units)} cups</span><span>{formatPhp(metrics.bestSeller.revenue)}</span></div>
                </> : <EmptyState title="No favorite yet">A most-ordered drink will appear after orders are recorded.</EmptyState>}
              </article>
            </section>

            <section className="asp-panel asp-orders-panel">
              <div className="asp-panel__head"><div><span className="asp-section-kicker">RECENT ORDERS</span><h2>Sales <em>records</em></h2></div><button className="asp-text-button" type="button" onClick={() => changeView('sales')}>See all records ↗</button></div>
              <SalesTable orders={orders} compact />
            </section>

            <section className="asp-panel asp-orders-panel">
              <div className="asp-panel__head"><div><span className="asp-section-kicker">STOCK ROOM</span><h2>Needs <em>attention</em></h2></div><button className="asp-text-button" type="button" onClick={() => changeView('inventory')}>Open inventory ↗</button></div>
              {stockAlerts.length ? (
                <div className="asp-stock-watch">
                  {stockAlerts.map((item) => {
                    const status = getStockStatus(item.quantity, item.minimumLevel)
                    const tone = status === 'Out of Stock' ? 'out' : 'low'
                    return (
                      <div className="asp-stock-watch__row" key={item.id}>
                        <span className={`asp-stock-dot asp-stock-dot--${tone}`} aria-hidden="true" />
                        <span className="asp-stock-watch__name">{item.name}<small>{item.category}</small></span>
                        <span className="asp-stock-watch__qty">{item.quantity} {item.unit}<small>min {item.minimumLevel}</small></span>
                        <span className={`asp-status asp-stock asp-stock--${tone}`}>{status}</span>
                      </div>
                    )
                  })}
                </div>
              ) : <EmptyState title="Every shelf looks stocked">Nothing is at or below its minimum level right now.</EmptyState>}
            </section>
          </div>
        )}

        {activeView === 'sales' && (
          <div className="asp-page">
            <div className="asp-period-row"><div><span className="asp-section-kicker">ORDER HISTORY</span><span className="asp-period-caption">{numberFormat.format(orders.length)} recorded orders</span></div></div>
            <section className="asp-panel"><div className="asp-panel__head"><div><span className="asp-section-kicker">THE ORDER BOOK</span><h2>Sales <em>records</em></h2></div><span className="asp-panel__total">{numberFormat.format(orders.length)} orders</span></div><SalesTable orders={orders} search={search} onSearch={setSearch} /></section>
          </div>
        )}

        {activeView === 'inventory' && <AdminInventoryPanel />}

        {activeView === 'analytics' && (
          <div className="asp-page">
            <div className="asp-period-row"><div><span className="asp-section-kicker">SALES TRENDS</span><span className="asp-period-caption">From recorded orders</span></div></div>
            {orders.length ? <>
              <section className="asp-panel"><div className="asp-panel__head"><div><span className="asp-section-kicker">LAST SEVEN DAYS</span><h2>Daily order <em>value</em></h2></div><span className="asp-panel__total">{formatPhp(dailyRevenue.reduce((sum, day) => sum + day.amount, 0))}</span></div><DailyChart data={dailyRevenue} /></section>
              <section className="asp-panel asp-top-products"><div className="asp-panel__head"><div><span className="asp-section-kicker">DRINKS ORDERED</span><h2>Popularity</h2></div></div>
                <div className="asp-popular-list">{metrics.popularDrinks.map((drink, index) => <div className="asp-popular-row" key={drink.productId}><span className="asp-popular-row__rank">{String(index + 1).padStart(2, '0')}</span><span className="asp-popular-row__name">{drink.name}<small>{numberFormat.format(drink.units)} cups · {formatPhp(drink.revenue)}</small></span><span className="asp-popular-row__track"><i style={{ width: `${Math.max(7, (drink.units / metrics.bestSeller.units) * 100)}%` }} /></span></div>)}</div>
              </section>
            </> : <section className="asp-panel"><EmptyState title="No sales trends yet">Recorded orders will appear here when they are placed from the homepage.</EmptyState></section>}
          </div>
        )}

        {activeView === 'recommendations' && (
          <div className="asp-page">
            <div className="asp-period-row"><div><span className="asp-section-kicker">RECOMMENDATIONS</span><span className="asp-period-caption">A clear space for future insights</span></div></div>
            <section className="asp-panel"><EmptyState title="No recommendations yet">This section is empty until there is order history to work from.</EmptyState></section>
          </div>
        )}

        <footer className="asp-footer"><span>SABLE &amp; STEM · MADE SLOWLY, SHARED GLADLY</span><a href="/">Return to the coffee shop ↑</a></footer>
      </main>
    </div>
  )
}

export default function AdminSalesPage() {
  const [authenticated, setAuthenticated] = useState(() => {
    try { return window.sessionStorage.getItem(AUTH_KEY) === 'signed-in' } catch { return false }
  })

  const signIn = () => {
    try { window.sessionStorage.setItem(AUTH_KEY, 'signed-in') } catch { /* The page can still open for this tab. */ }
    setAuthenticated(true)
  }

  const signOut = () => {
    try { window.sessionStorage.removeItem(AUTH_KEY) } catch { /* Ignore unavailable browser storage. */ }
    setAuthenticated(false)
  }

  return authenticated ? <Dashboard onLogout={signOut} /> : <AdminLogin onLogin={signIn} />
}
