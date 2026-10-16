import { createLocalOrder } from './local-orders.js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LenticularCarousel from './components/LenticularCarousel.jsx'
import PeekRating from './components/PeekRating.jsx'
import StaggeredMenu from './components/StaggeredMenu.jsx'
import TextLoop from './components/TextLoop.jsx'
import FullMenu from './components/FullMenu.jsx'
import CartDrawer from './components/CartDrawer.jsx'
import OrderReceiptDialog from './components/OrderReceiptDialog.jsx'
import AdminSalesPage from './components/AdminSalesPage.jsx'
import { BESTSELLERS, MENU_BY_ID, OTHER_DRINKS } from './menu-data.js'
import { formatPhp } from './currency.js'

const menuItems = [
  { label: 'Home', ariaLabel: 'Go to home', link: '#top' },
  { label: 'Best sellers', ariaLabel: 'Explore best-selling drinks', link: '#best-sellers' },
  { label: 'Full menu', ariaLabel: 'Explore the rest of the drinks menu', link: '#full-menu' },
  { label: 'Our story', ariaLabel: 'Read our story', link: '#story' },
  { label: 'Contact', ariaLabel: 'Contact Sable & Stem', link: '#contact' },
]

const CART_STORAGE_KEY = 'sable-stem-cart-v1'

function readStoredCart() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) || '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {}
    return Object.fromEntries(Object.entries(saved).filter(([id, quantity]) => MENU_BY_ID[id] && Number.isInteger(quantity) && quantity > 0 && quantity <= 20))
  } catch {
    return {}
  }
}

function Storefront() {
  const [cart, setCart] = useState(readStoredCart)
  const [cartOpen, setCartOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [rating, setRating] = useState(0)
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [receipt, setReceipt] = useState(null)

  useEffect(() => {
    try { window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)) } catch { /* Storage may be unavailable; the in-memory cart still works. */ }
  }, [cart])

  const cartItems = useMemo(() => Object.entries(cart)
    .map(([id, quantity]) => MENU_BY_ID[id] ? { ...MENU_BY_ID[id], quantity } : null)
    .filter(Boolean), [cart])
  const bagCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const closeCart = useCallback(() => setCartOpen(false), [])
  const dismissReceipt = useCallback(() => { setReceipt(null); setSubmitError(''); setCartOpen(false) }, [])

  const addToCart = (drink) => {
    setReceipt(null)
    setSubmitError('')
    setCart((current) => ({ ...current, [drink.id]: Math.min(20, (current[drink.id] || 0) + 1) }))
    setNotice(`${drink.name} added to your bag · ${formatPhp(drink.price)}`)
    setCartOpen(true)
    window.setTimeout(() => setNotice(''), 2800)
  }

  const setQuantity = (id, quantity) => {
    setCart((current) => {
      const next = { ...current }
      if (!Number.isInteger(quantity) || quantity <= 0) delete next[id]
      else next[id] = Math.min(20, quantity)
      return next
    })
    setSubmitError('')
  }

  const removeFromCart = (id) => {
    setCart((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
    setSubmitError('')
  }

  const placeOrder = async (customer) => {
    setSubmitError('')
    setSubmitting(true)
    try {
      const receiptData = await createLocalOrder({
        items: cartItems,
        customer,
        fulfillment: 'Pickup',
      })
      setCart({})
      setCartOpen(false)
      // The order is saved to the local sales records by createLocalOrder,
      // so the admin sales page picks it up automatically. The customer
      // simply sees their receipt here — no redirect to the admin login.
      setReceipt(receiptData)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not prepare the receipt.')
    } finally {
      setSubmitting(false)
    }
  }
  const subscribe = (event) => {
    event.preventDefault()
    if (email.trim()) setSubscribed(true)
  }

  return (
    <>
      <StaggeredMenu position="right" items={menuItems} displaySocials={false} displayItemNumbering menuButtonColor="#622628" openMenuButtonColor="#FBEDCB" changeMenuColorOnOpen colors={['#BF8B66', '#622628']} logoUrl="/sable-stem-logo.svg" accentColor="#BF8B66" />
      <button className="bag-status" type="button" onClick={() => { setReceipt(null); setCartOpen(true) }} aria-label={`Open shopping bag, ${bagCount} ${bagCount === 1 ? 'item' : 'items'}, total ${formatPhp(subtotal)}`}>
        <span className="bag-status__count" aria-hidden="true">{bagCount}</span>
        <span>{bagCount ? `Your bag · ${formatPhp(subtotal)}` : 'Your bag is waiting'}</span>
      </button>

      <main id="top">
        <section className="hero" aria-labelledby="hero-heading">
          <div className="hero__copy">
            <p className="eyebrow"><span className="eyebrow__mark" /> Your neighborhood, in a cup</p>
            <h1 id="hero-heading">A little more<br /><em>ritual</em> in every<br />morning.</h1>
            <p className="hero__description">Thoughtfully sourced, gently roasted, and made for the moments you want to keep.</p>
            <div className="hero__actions"><a className="button button--maroon" href="#full-menu">Explore the menu <span aria-hidden="true">↗</span></a><a className="text-link" href="#story">A note from our roastery <span aria-hidden="true">↓</span></a></div>
            <div className="hero__aside-note"><span>01</span> GOOD COFFEE, NO GRAND OCCASION REQUIRED.</div>
          </div>
          <div className="hero__visual" aria-label="Our coffee, made fresh" role="img">
            <div className="hero__image" /><div className="hero__image-wash" />
            <div className="hero__stamp"><span>ROASTED WITH</span><strong>care<br />&amp; time</strong><i>✳</i></div>
            <div className="hero__photo-caption"><span>THE DAILY POUR</span><span>01 / 04</span></div>
            <div className="hero__orbit" aria-hidden="true">SLOW DOWN · SIP WELL · STAY AWHILE ·</div>
          </div>
          <div className="hero__bottomline"><span>EST. WITH HEART, SERVED EVERYWHERE</span><span>SCROLL A LITTLE <b aria-hidden="true">↓</b></span></div>
        </section>

        <TextLoop text="Good days start here" shape="wave" speed={60} direction="forward" separator="✳" curviness={42} fontSize={28} fontWeight={700} letterSpacing={2.5} uppercase ribbon ribbonColor="#622628" ribbonWidth={76} edgeFade={0.09} pauseOnHover className="home-loop" />

        <section className="best-sellers section-pad" id="best-sellers" aria-labelledby="best-sellers-heading">
          <div className="section-heading"><div><p className="eyebrow"><span className="eyebrow__mark" /> The neighborhood favorites</p><h2 id="best-sellers-heading">The usuals?<br /><em>Never boring.</em></h2></div><p className="section-heading__note">A few lovely ways to meet your day. Turn a card over to find out what’s inside.</p></div>
          <LenticularCarousel drinks={BESTSELLERS} onAdd={addToCart} />
          <p className="carousel-hint"><span aria-hidden="true">↔</span> Swipe to wander · turn a card to add a favorite</p>
        </section>

        <FullMenu drinks={OTHER_DRINKS} onAdd={addToCart} />

        <section className="story" id="story" aria-labelledby="story-heading">
          <div className="story__image" role="img" aria-label="Coffee beans and a slow morning at the roastery" />
          <div className="story__copy"><p className="eyebrow eyebrow--light"><span className="eyebrow__mark" /> A note from the roastery</p><h2 id="story-heading">Good coffee<br />is a <em>small</em><br />kindness.</h2><p>We follow the beans back to the people and places that grew them. Then we roast in little batches, tasting as we go, until each cup feels like a deep breath.</p><a className="button button--cream" href="#contact">A little more about us <span aria-hidden="true">↗</span></a><div className="story__signature">Slowly made, <em>gladly shared.</em></div></div>
          <span className="story__seal" aria-hidden="true">S&amp;S<br /><small>GOOD THINGS INSIDE</small></span>
        </section>

        <section className="rating-section section-pad" aria-labelledby="rating-heading">
          <div className="rating-section__ornament" aria-hidden="true">✳</div>
          <div className="rating-section__copy"><p className="eyebrow"><span className="eyebrow__mark" /> Tell us how it felt</p><h2 id="rating-heading">Was your cup<br /><em>the good part?</em></h2><p>We make each one with care. A little note back helps us keep it that way.</p><PeekRating defaultValue={0} count={5} labels={['Not quite', 'Getting there', 'Lovely', 'So good', 'A new favorite']} activeColor="#BF8B66" idleColor="#C7AC8B" size={34} showTip allowClear onChange={setRating} ariaLabel="Rate your most recent Sable & Stem coffee" /><p className="rating-thanks" aria-live="polite">{rating ? `Thank you for the ${rating}-star kind of day.` : 'Pick a star to leave us a little love.'}</p></div>
          <div className="rating-section__photo"><img src="https://files.manuscdn.com/search-media/310519664024432982/YF5uw3KiJZOvtkccMYSwfx/KTD9YrpvmyH2yx8Coj9NqY.jpg" alt="A fresh coffee served with care" loading="lazy" /><span>THE LITTLE THINGS MATTER</span></div>
        </section>

        <section className="newsletter" id="contact" aria-labelledby="newsletter-heading">
          <div className="newsletter__copy"><p className="eyebrow eyebrow--light"><span className="eyebrow__mark" /> A good note now and then</p><h2 id="newsletter-heading">A little warmth<br />in your <em>inbox.</em></h2><p>New roasts, nice places, and the occasional reason to take the long way home.</p></div>
          <form className="newsletter__form" onSubmit={subscribe}><label htmlFor="newsletter-email">Your email, please</label><div className="newsletter__field"><input id="newsletter-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@somewhere.com" required aria-describedby="newsletter-feedback" /><button type="submit" aria-label="Subscribe to coffee notes">↗</button></div><p id="newsletter-feedback" className="newsletter__feedback" aria-live="polite">{subscribed ? 'You’re on the list. We’ll write when we have something good.' : 'Only good things. Unsubscribe whenever.'}</p></form>
          <div className="newsletter__sun" aria-hidden="true">✳</div>
        </section>
        <footer className="site-footer"><a href="#top" className="footer-logo"><img src="/sable-stem-logo.svg" alt="Sable & Stem Coffee" width="194" height="46" /></a><p>Made slowly, shared gladly.</p><a className="footer-top" href="#top">Back to the top ↑</a><a className="footer-admin" href="/admin">Store admin</a><span className="footer-copy">© 2026 SABLE &amp; STEM COFFEE</span></footer>
      </main>
      <CartDrawer
        open={cartOpen}
        items={cartItems}
        subtotal={subtotal}
        onClose={closeCart}
        onSetQuantity={setQuantity}
        onRemove={removeFromCart}
        onSubmitOrder={placeOrder}
        submitting={submitting}
        submitError={submitError}
      />
      <OrderReceiptDialog receipt={receipt} onClose={dismissReceipt} />
      <div className={`toast ${notice ? 'toast--visible' : ''}`} role="status">{notice}</div>
    </>
  )
}

export default function CommerceApp() {
  return window.location.pathname.startsWith('/admin') ? <AdminSalesPage /> : <Storefront />
}
