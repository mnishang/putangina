import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

export default function StaggeredMenu({
  position = 'right',
  colors = ['#bf8b66', '#fb edcb'.replace(' ', '')],
  items = [],
  socialItems = [],
  displaySocials = false,
  displayItemNumbering = true,
  className = '',
  logoUrl = '/sable-stem-logo.svg',
  menuButtonColor = '#622628',
  openMenuButtonColor = '#fbedcb',
  accentColor = '#bf8b66',
  changeMenuColorOnOpen = true,
  isFixed = true,
  closeOnClickAway = true,
  onMenuOpen,
  onMenuClose,
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const panelRef = useRef(null)
  const itemRefs = useRef([])
  const buttonRef = useRef(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return undefined
    const itemsToAnimate = itemRefs.current.filter(Boolean)
    const ctx = gsap.context(() => {
      gsap.set(panel, { xPercent: position === 'left' ? -104 : 104 })
      gsap.set(itemsToAnimate, { y: 24, opacity: 0 })
    }, wrapperRef)
    return () => ctx.revert()
  }, [position])

  useEffect(() => {
    const panel = panelRef.current
    const itemsToAnimate = itemRefs.current.filter(Boolean)
    if (!panel) return undefined
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    if (open) {
      timeline.to(panel, { xPercent: 0, duration: 0.68 })
        .to(itemsToAnimate, { y: 0, opacity: 1, duration: 0.5, stagger: 0.075 }, '-=0.32')
      onMenuOpen?.()
    } else {
      timeline.to(itemsToAnimate, { y: 18, opacity: 0, duration: 0.18, stagger: 0.025 })
        .to(panel, { xPercent: position === 'left' ? -104 : 104, duration: 0.48 }, '-=0.04')
      onMenuClose?.()
    }
    return () => timeline.kill()
  }, [open, position, onMenuOpen, onMenuClose])

  useEffect(() => {
    if (!open || !closeOnClickAway) return undefined
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeOnClickAway])

  const toggle = () => setOpen((current) => !current)
  const panelId = 'sable-staggered-panel'

  return (
    <div
      ref={wrapperRef}
      className={`staggered-menu-wrapper ${isFixed ? 'fixed-wrapper' : ''} ${className}`.trim()}
      data-position={position}
      data-open={open || undefined}
      style={{ '--menu-accent': accentColor, '--menu-closed': menuButtonColor, '--menu-open': openMenuButtonColor }}
    >
      <div className="sm-prelayers" aria-hidden="true">
        {colors.slice(0, 2).map((color, index) => <div className="sm-prelayer" key={index} style={{ backgroundColor: color }} />)}
      </div>
      <header className="staggered-menu-header">
        <a className="sm-logo" href="#top" aria-label="Sable & Stem Coffee home">
          <img src={logoUrl} alt="Sable & Stem Coffee" className="sm-logo-img" width="194" height="46" />
        </a>
        <button
          ref={buttonRef}
          className="sm-toggle"
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          style={{ color: changeMenuColorOnOpen && open ? openMenuButtonColor : menuButtonColor }}
        >
          <span className="sm-toggle-word" aria-hidden="true">{open ? 'Close' : 'Menu'}</span>
          <span className={`sm-icon ${open ? 'is-open' : ''}`} aria-hidden="true"><i /><i /></span>
        </button>
      </header>
      <aside
        id={panelId}
        ref={panelRef}
        className="staggered-menu-panel"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="sm-panel-inner">
          <p className="sm-panel-kicker">A little goodness, every day</p>
          <ul className={`sm-panel-list ${displayItemNumbering ? 'has-numbering' : ''}`}>
            {items.map((item, index) => (
              <li className="sm-panel-itemWrap" key={`${item.label}-${index}`}>
                <a
                  ref={(element) => { itemRefs.current[index] = element }}
                  className="sm-panel-item"
                  href={item.link}
                  aria-label={item.ariaLabel || item.label}
                  onClick={() => setOpen(false)}
                >
                  <span className="sm-panel-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="sm-panel-itemLabel">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
          {displaySocials && socialItems.length > 0 && (
            <div className="sm-socials">
              <p className="sm-socials-title">Find us elsewhere</p>
              <div className="sm-socials-list">
                {socialItems.map((item) => <a className="sm-socials-link" href={item.link} key={item.label}>{item.label}</a>)}
              </div>
            </div>
          )}
          <p className="sm-panel-foot">Made slowly, shared gladly. <span>© 2025 Sable & Stem</span></p>
        </div>
      </aside>
    </div>
  )
}
