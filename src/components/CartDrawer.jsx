import { useEffect, useRef } from 'react'
import { formatPhp } from '../currency.js'

export default function CartDrawer({
  open,
  items,
  subtotal,
  onClose,
  onSetQuantity,
  onRemove,
  onSubmitOrder,
  submitting,
  submitError,
}) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.querySelector('button, input')?.focus()
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  const handleSubmit = (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    onSubmitOrder({
      customerName: String(formData.get('customerName') || '').trim(),
      contactNumber: String(formData.get('contactNumber') || '').trim(),
      pickupNote: String(formData.get('pickupNote') || '').trim(),
      consent: formData.get('consent') === 'on',
    })
  }

  return (
    <div className="cart-overlay">
      <button className="cart-overlay__scrim" type="button" tabIndex={-1} aria-label="Close shopping bag" onClick={onClose} />
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-heading" ref={panelRef}>
        <div className="cart-drawer__header">
          <div><p className="eyebrow"><span className="eyebrow__mark" /> Your little good things</p><h2 id="cart-heading">Your <em>bag.</em></h2></div>
          <button className="cart-drawer__close" type="button" onClick={onClose} aria-label="Close shopping bag">×</button>
        </div>

        {items.length === 0 ? (
          <div className="cart-empty">
            <span className="cart-empty__flower" aria-hidden="true">✳</span>
            <h3>Nothing in your bag <em>just yet.</em></h3>
            <p>Find a favorite, add a little something, and it’ll be waiting here.</p>
            <button className="button button--maroon" type="button" onClick={onClose}>Keep browsing <span aria-hidden="true">↗</span></button>
          </div>
        ) : (
          <>
            <div className="cart-drawer__items" aria-label="Items in your bag">
              {items.map((item) => (
                <article className="cart-line" key={item.id}>
                  <div className={`cart-line__swatch cart-line__swatch--${item.art}`} aria-hidden="true">✳</div>
                  <div className="cart-line__details">
                    <h3>{item.name}</h3>
                    <p>{formatPhp(item.price)} each</p>
                    <div className="cart-line__controls">
                      <div className="quantity-control" aria-label={`Quantity for ${item.name}`}>
                        <button type="button" onClick={() => onSetQuantity(item.id, item.quantity - 1)} aria-label={`Decrease ${item.name} quantity`}>−</button>
                        <span aria-live="polite">{item.quantity}</span>
                        <button type="button" onClick={() => onSetQuantity(item.id, item.quantity + 1)} aria-label={`Increase ${item.name} quantity`} disabled={item.quantity >= 20}>＋</button>
                      </div>
                      <button className="cart-line__remove" type="button" onClick={() => onRemove(item.id)}>Remove</button>
                    </div>
                  </div>
                  <strong className="cart-line__total">{formatPhp(item.price * item.quantity)}</strong>
                </article>
              ))}
            </div>

            <div className="cart-summary">
              <div><span>Subtotal</span><strong>{formatPhp(subtotal)}</strong></div>
              <p>Pickup order · payment is handled separately at the café.</p>
              <form className="checkout-form" onSubmit={handleSubmit}>
                <p className="eyebrow"><span className="eyebrow__mark" /> Where should we find you?</p>
                <label htmlFor="order-customer-name">Your name</label>
                <input id="order-customer-name" name="customerName" autoComplete="name" minLength={2} maxLength={80} required placeholder="Name for the order" />
                <label htmlFor="order-contact-number">Contact number</label>
                <input id="order-contact-number" name="contactNumber" type="tel" autoComplete="tel" inputMode="tel" minLength={8} maxLength={24} required placeholder="e.g. 09XX XXX XXXX" />
                <label htmlFor="order-pickup-note">A note for the barista <span>(optional)</span></label>
                <textarea id="order-pickup-note" name="pickupNote" rows="2" maxLength={300} placeholder="Milk preference, pickup note…" />
                <label className="checkout-consent"><input type="checkbox" name="consent" required /> <span>I agree that Sable &amp; Stem may use my name and contact number to confirm this order.</span></label>
                {submitError && <p className="checkout-form__error" role="alert">{submitError}</p>}
                <button className="button button--maroon checkout-form__submit" type="submit" disabled={submitting}>
                  {submitting ? 'Sending your order…' : 'Place pickup order'} <span aria-hidden="true">↗</span>
                </button>
              </form>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
