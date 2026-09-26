const formatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

export function formatMoneyInput(value) {
  if (value === null || value === undefined || value === '') return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? formatter.format(amount) : ''
}

export function parseMoneyInput(value) {
  let text = String(value ?? '').trim().replace(/^Rp\.?\s*/i, '').replace(/\s/g, '')
  if (!text) return { amount: null, text: '', valid: true }
  // Accept ungrouped decimal-dot pastes as well as Indonesian decimal commas.
  // A three-digit suffix after a dot is always an Indonesian thousands group.
  if (/^\d+\.\d{0,2}$/.test(text)) text = text.replace('.', ',')
  if (!/^\d+(?:\.\d{3})*(?:,\d{0,2})?$/.test(text)) return { amount: null, text: String(value), valid: false }
  const [integer, fraction] = text.replaceAll('.', '').split(',')
  const digits = integer.replace(/^0+(?=\d)/, '')
  const amount = Number(digits + (fraction === undefined ? '' : '.' + fraction))
  if (!Number.isFinite(amount)) return { amount: null, text: String(value), valid: false }
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return { amount, text: grouped + (fraction === undefined ? '' : ',' + fraction), valid: true }
}
