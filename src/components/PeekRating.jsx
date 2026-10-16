import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { StarIcon } from '@hugeicons/core-free-icons'

export default function PeekRating({
  value: controlledValue,
  defaultValue = 0,
  onChange,
  count = 5,
  labels = ['Just okay', 'Nice', 'Lovely', 'Excellent', 'A new favorite'],
  activeColor = '#bf8b66',
  idleColor = '#b9a48b',
  size = 30,
  showTip = true,
  allowClear = true,
  readOnly = false,
  disabled = false,
  ariaLabel = 'Rate your coffee',
  className = '',
}) {
  const [innerValue, setInnerValue] = useState(defaultValue)
  const [preview, setPreview] = useState(null)
  const value = controlledValue ?? innerValue
  const shown = preview ?? value
  const commit = (next) => {
    const nextValue = allowClear && next === value ? 0 : next
    if (controlledValue === undefined) setInnerValue(nextValue)
    onChange?.(nextValue)
    setPreview(null)
  }
  const onKeyDown = (event) => {
    if (disabled || readOnly) return
    let next = value
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(count, value + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(allowClear ? 0 : 1, value - 1)
    else if (event.key === 'Home') next = allowClear ? 0 : 1
    else if (event.key === 'End') next = count
    else if (event.key === 'Backspace' || event.key === 'Delete') next = 0
    else return
    event.preventDefault()
    if (controlledValue === undefined) setInnerValue(next)
    onChange?.(next)
  }

  return (
    <div
      className={`peek-rating ${className}`.trim()}
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      style={{ '--rating-active': activeColor, '--rating-idle': idleColor, '--rating-size': `${size}px` }}
    >
      <div className="peek-rating__stars">
        {Array.from({ length: count }, (_, index) => {
          const rating = index + 1
          const lit = rating <= shown
          const label = labels[index] ?? `${rating} of ${count}`
          return (
            <button
              className="peek-rating__star"
              key={rating}
              type="button"
              role={readOnly ? undefined : 'radio'}
              aria-label={`${rating} of ${count}, ${label}`}
              aria-checked={readOnly ? undefined : value === rating}
              aria-pressed={readOnly ? undefined : value === rating}
              tabIndex={readOnly || disabled ? -1 : value === rating || (value === 0 && index === 0) ? 0 : -1}
              disabled={disabled || readOnly}
              onPointerEnter={() => !readOnly && !disabled && setPreview(rating)}
              onPointerLeave={() => setPreview(null)}
              onFocus={() => !readOnly && setPreview(rating)}
              onBlur={() => setPreview(null)}
              onClick={() => commit(rating)}
              style={{ '--star-index': index }}
            >
              <span className={`peek-rating__glyph ${lit ? 'is-lit' : ''}`}>
                <HugeiconsIcon icon={StarIcon} size={size} fill="currentColor" strokeWidth={1.5} />
              </span>
            </button>
          )
        })}
      </div>
      {showTip && preview !== null && !readOnly && (
        <span className="peek-rating__tip" aria-hidden="true">{labels[preview - 1] ?? `${preview} / ${count}`}</span>
      )}
      <span className="sr-only" aria-live="polite">{value ? `${value} out of ${count} stars selected` : 'No rating selected'}</span>
    </div>
  )
}
