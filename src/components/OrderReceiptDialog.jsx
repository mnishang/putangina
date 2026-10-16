import { useEffect, useRef } from 'react'
import { formatPhp } from '../currency.js'

function formatReceiptDate(value) {
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return 'Just now'
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date)
}

export default function OrderReceiptDialog({ receipt, onClose }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!receipt) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.querySelector('.asp-receipt__close')?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll('button:not([disabled])')
        if (!buttons?.length) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [receipt, onClose])

  if (!receipt) return null

  const items = (Array.isArray(receipt.items) ? receipt.items : []).map((item) => {
    const unitPrice = Number(item.unitPrice ?? item.price ?? 0)
    const quantity = Math.max(1, Number(item.quantity) || 1)
    return {
      name: item.productName ?? item.name ?? item.title ?? 'Coffee drink',
      unitPrice,
      quantity,
      lineTotal: Number(item.lineTotal ?? unitPrice * quantity),
    }
  })
  const subtotal = Number(receipt.subtotal ?? items.reduce((sum, item) => sum + item.lineTotal, 0))
  const pickupFee = Number(receipt.pickupFee || 0)
  const total = Number(receipt.total ?? subtotal + pickupFee)
  const localStatus = receipt.savedLocally === true
    ? 'Saved on this device'
    : receipt.savedLocally === false
      ? 'Shown for this session only'
      : (receipt.status || 'Order confirmed')

  return (
    <div className="asp-receipt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <section className="asp-receipt" role="dialog" aria-modal="true" aria-labelledby="asp-receipt-title" aria-describedby="asp-receipt-note" ref={dialogRef}>
        <button className="asp-receipt__close" type="button" onClick={onClose} aria-label="Close receipt">×</button>
        <div className="asp-receipt__brand"><img className="asp-receipt__logo" src="/sable-stem-logo.svg" alt="Sable &amp; Stem Coffee" width="152" height="34" /></div>
        <p className="asp-receipt__eyebrow">ORDER SUMMARY</p>
        <h2 id="asp-receipt-title">A little something <em>good.</em></h2>
        <p className="asp-receipt__thanks">Thank you for choosing Sable &amp; Stem.</p>

        <div className="asp-receipt__meta">
          <div><span>Order reference</span><strong>{receipt.orderNumber || '—'}</strong></div>
          <div><span>Date &amp; time</span><strong>{formatReceiptDate(receipt.placedAt || receipt.createdAt)}</strong></div>
          {receipt.customerName && <div><span>Prepared for</span><strong>{receipt.customerName}</strong></div>}
          {receipt.contactNumber && <div><span>Contact</span><strong>{receipt.contactNumber}</strong></div>}
          <div><span>Fulfilment</span><strong>{receipt.fulfillment || 'Pickup'}</strong></div>
          <div><span>Payment</span><strong>{receipt.paymentStatus || 'Not paid online'}</strong></div>
        </div>

        <div className="asp-receipt__items" aria-label="Ordered items">
          <div className="asp-receipt__items-head"><span>DRINK</span><span>QTY</span><span>AMOUNT</span></div>
          {items.map((item, index) => (
            <div className="asp-receipt__item" key={`${item.name}-${index}`}>
              <span><strong>{item.name}</strong><small>{formatPhp(item.unitPrice)} each</small></span>
              <span>{item.quantity}</span>
              <strong>{formatPhp(item.lineTotal)}</strong>
            </div>
          ))}
        </div>

        <div className="asp-receipt__totals">
          <div><span>Subtotal</span><strong>{formatPhp(subtotal)}</strong></div>
          <div><span>Pickup fee</span><strong>{pickupFee ? formatPhp(pickupFee) : '₱0'}</strong></div>
          <div className="asp-receipt__grand"><span>Total</span><strong>{formatPhp(total)}</strong></div>
        </div>

        <div className="asp-receipt__status"><span className="asp-receipt__status-dot" /><span><small>ORDER STATUS</small><strong>{localStatus}</strong></span></div>
        <p className="asp-receipt__note" id="asp-receipt-note">
          {receipt.savedLocally === true
            ? 'Your order has been recorded for the café. No payment was processed online — please pay on pickup.'
            : receipt.savedLocally === false
              ? 'This receipt is only on screen. No payment was processed, and the café has not received this order.'
              : 'Keep this order reference handy. Payment is not processed online.'}
        </p>
        <div className="asp-receipt__actions">
          <button className="asp-receipt__print" type="button" onClick={() => window.print()}>Print receipt</button>
          <button className="asp-receipt__done" type="button" onClick={onClose}>Back to the shop <span aria-hidden="true">↗</span></button>
        </div>
      </section>
    </div>
  )
}
