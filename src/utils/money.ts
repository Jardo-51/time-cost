export function formatMoney (amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    // Custom currency codes may not be valid ISO 4217 for Intl.
    const n = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
    return `${n} ${currency}`
  }
}
