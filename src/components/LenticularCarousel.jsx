import { useRef, useState } from 'react'
import { formatPhp } from '../currency.js'

export default function LenticularCarousel({ drinks, onAdd }) {
  const trackRef = useRef(null)
  const [flipped, setFlipped] = useState({})
  const move = (direction) => trackRef.current?.scrollBy({ left: direction * 340, behavior: 'smooth' })

  return (
    <div className="lenticular-carousel">
      <div className="carousel-controls" aria-label="Carousel controls">
        <button type="button" onClick={() => move(-1)} aria-label="Scroll drinks left">←</button>
        <button type="button" onClick={() => move(1)} aria-label="Scroll drinks right">→</button>
      </div>
      <div className="carousel-track" ref={trackRef} role="list" aria-label="Best-selling drinks">
        {drinks.map((drink, index) => {
          const isFlipped = Boolean(flipped[drink.id])
          return (
            <article className={`drink-card ${isFlipped ? 'is-flipped' : ''}`} role="listitem" key={drink.id}>
              <div className="drink-card__inner">
                <div className="drink-card__face drink-card__front">
                  <img src={drink.image} alt={drink.imageAlt} loading="lazy" />
                  <div className="drink-card__shade" />
                  <span className="drink-card__number">0{index + 1} / 0{drinks.length}</span>
                  <div className="drink-card__front-copy">
                    <span>{drink.note}</span>
                    <h3>{drink.name}</h3>
                    <button type="button" onClick={() => setFlipped((state) => ({ ...state, [drink.id]: true }))} aria-label={`Turn over ${drink.name} card`}>
                      Take a closer look <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                </div>
                <div className="drink-card__face drink-card__back" aria-hidden={!isFlipped}>
                  <span className="drink-card__back-eyebrow">{drink.note}</span>
                  <button className="drink-card__flip-back" type="button" tabIndex={isFlipped ? 0 : -1} onClick={() => setFlipped((state) => ({ ...state, [drink.id]: false }))} aria-label={`Turn ${drink.name} card back`}>↶</button>
                  <h3>{drink.name}</h3>
                  <p>{drink.description}</p>
                  <div className="drink-card__bottom">
                    <span className="drink-card__price">{formatPhp(drink.price)}</span>
                    <button type="button" className="button button--cream button--small" tabIndex={isFlipped ? 0 : -1} onClick={() => onAdd(drink)}>Add to bag <span aria-hidden="true">+</span></button>
                  </div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
