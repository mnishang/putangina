const pesoNumber = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatPhp(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return '₱0'
  return `₱${pesoNumber.format(value)}`
}
