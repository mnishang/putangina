import { useLayoutEffect, useMemo, useRef } from 'react'
import { gsap } from 'gsap'

export default function TextLoop({
  text = 'SLOW MORNINGS ✦ GOOD COFFEE',
  shape = 'wave',
  speed = 62,
  direction = 'forward',
  separator = '✦',
  curviness = 40,
  tilt = 0,
  fontSize = 30,
  fontWeight = 700,
  letterSpacing = 2,
  uppercase = true,
  color = '#fbedcb',
  ribbon = true,
  ribbonColor = '#622628',
  ribbonWidth = 76,
  edgeFade = 0.12,
  pauseOnHover = true,
  outline = false,
  className = '',
  style = {},
}) {
  const rootRef = useRef(null)
  const trackRef = useRef(null)
  const phrase = useMemo(() => {
    const label = uppercase ? String(text).toUpperCase() : String(text)
    return separator ? `${label}  ${separator}  ` : `${label}     `
  }, [text, separator, uppercase])

  useLayoutEffect(() => {
    const root = rootRef.current
    const track = trackRef.current
    if (!root || !track) return undefined

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) return undefined

    const duration = Math.max(11, 1240 / Math.max(24, speed))
    const tween = gsap.to(track, {
      xPercent: direction === 'reverse' ? 0 : -50,
      duration,
      ease: 'none',
      repeat: -1,
    })
    const pause = () => tween.timeScale(0.18)
    const resume = () => tween.timeScale(1)
    if (pauseOnHover) {
      root.addEventListener('pointerenter', pause)
      root.addEventListener('pointerleave', resume)
      root.addEventListener('focusin', pause)
      root.addEventListener('focusout', resume)
    }
    return () => {
      tween.kill()
      root.removeEventListener('pointerenter', pause)
      root.removeEventListener('pointerleave', resume)
      root.removeEventListener('focusin', pause)
      root.removeEventListener('focusout', resume)
    }
  }, [direction, pauseOnHover, speed])

  const items = Array.from({ length: 8 }, (_, index) => (
    <span className="text-loop__item" key={index} aria-hidden="true">{phrase}</span>
  ))

  return (
    <div
      ref={rootRef}
      className={`text-loop ${ribbon ? 'text-loop--ribbon' : ''} text-loop--${shape} ${className}`.trim()}
      style={{
        '--loop-color': color,
        '--loop-ribbon': ribbonColor,
        '--loop-size': `${fontSize}px`,
        '--loop-weight': fontWeight,
        '--loop-spacing': `${letterSpacing}px`,
        '--loop-ribbon-height': `${ribbonWidth}px`,
        '--loop-tilt': `${tilt}deg`,
        '--loop-fade': `${Math.max(0, Math.min(0.4, edgeFade)) * 100}%`,
        '--loop-outline': outline ? 'transparent' : color,
        '--loop-outline-stroke': outline ? color : 'transparent',
        '--loop-curviness': `${curviness}px`,
        ...style,
      }}
      role="img"
      aria-label={text}
    >
      <div className="text-loop__viewport">
        <div ref={trackRef} className="text-loop__track">
          <div className="text-loop__run">{items}</div>
          <div className="text-loop__run" aria-hidden="true">{items}</div>
        </div>
      </div>
    </div>
  )
}
