export const DEFAULT_REVENUE_SHARING = { ownerPercent: 10, adminPercent: 10, therapistPercent: 80, trigger: 'PAYMENT_RECEIVED' }
export const cents = value => Math.round(Number(value || 0) * 100)
export const moneyString = value => (value / 100).toFixed(2)
// Largest remainder keeps every cent accounted for, including fractional percentages.
export function splitRevenue(baseCents, policy) {
  const keys = ['owner', 'admin', 'therapist']
  const portions = keys.map((key, index) => {
    const numerator = BigInt(baseCents) * BigInt(Math.round(Number(policy[`${key}Percent`]) * 100))
    return { key, index, amount: Number(numerator / 10000n), remainder: Number(numerator % 10000n) }
  })
  let remainder = baseCents - portions.reduce((n, p) => n + p.amount, 0)
  for (const portion of [...portions].sort((a, b) => b.remainder - a.remainder || a.index - b.index)) if (remainder-- > 0) portion.amount++
  return Object.fromEntries(portions.map(p => [`${p.key}Amount`, moneyString(p.amount)]))
}
export function collectedServiceCents(order, paidCents) {
  const base = Math.max(0, cents(order.subtotal) - cents(order.discount))
  const total = cents(order.total)
  if (!total) return 0
  return Number((BigInt(base) * BigInt(Math.min(total, Math.max(0, paidCents))) + BigInt(Math.floor(total / 2))) / BigInt(total))
}
