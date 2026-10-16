import { useMemo, useState } from 'react'
import { MENU_CATEGORIES } from '../menu-data.js'
import { formatPhp } from '../currency.js'

export default function FullMenu({ drinks, onAdd }) {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0])
  const visibleDrinks = useMemo(
    () => activeCategory === MENU_CATEGORIES[0]
      ? drinks
      : drinks.filter((drink) => drink.category === activeCategory),
    [activeCategory, drinks],
  )

  return (
    <section className="full-menu section-pad" id="full-menu" aria-labelledby="full-menu-heading">
      <div className="section-heading full-menu__heading">
        <div>
          <p className="eyebrow"><span className="eyebrow__mark" /> Beyond the regulars</p>
          <h2 id="full-menu-heading">Room for<br /><em>one more?</em></h2>
        </div>
        <p className="section-heading__note">The rest of the counter, from espresso-bar classics to something a little unexpected.</p>
      </div>

      <div className="menu-filters" role="group" aria-label="Filter drinks by category">
        {MENU_CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={`menu-filter${activeCategory === category ? ' is-active' : ''}`}
            aria-pressed={activeCategory === category}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="menu-grid" aria-live="polite" aria-atomic="false">
        {visibleDrinks.map((drink, index) => (
          <article className="menu-card" key={drink.id}>
            <div className={`menu-card__art menu-card__art--${drink.art}`}>
              {drink.image
                ? <img className="menu-card__photo" src={drink.image} alt={drink.imageAlt || `${drink.name}, freshly prepared`} loading="lazy" decoding="async" />
                : <span className="menu-card__art-cup" aria-hidden="true"><i /><b /></span>}
              <span className="menu-card__art-index" aria-hidden="true">S&amp;S · {String(index + 5).padStart(2, '0')}</span>
              <span className="menu-card__art-note" aria-hidden="true">SLOW<br />POUR</span>
            </div>
            <div className="menu-card__body">
              <div className="menu-card__topline"><span>{drink.category}</span><span>{formatPhp(drink.price)}</span></div>
              <h3>{drink.name}</h3>
              <p>{drink.description}</p>
              <button className="menu-card__add" type="button" onClick={() => onAdd(drink)} aria-label={`Add ${drink.name} for ${formatPhp(drink.price)} to your bag`}>
                Add to bag <span aria-hidden="true">＋</span>
              </button>
            </div>
          </article>
        ))}
      </div>
      {visibleDrinks.length === 0 && <p className="menu-empty">There are no drinks in this category just now.</p>}
    </section>
  )
}
