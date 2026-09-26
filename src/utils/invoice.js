/**
 * Generate a unique invoice number: INV-YYYYMMDD-XXXX
 */
export function generateInvoiceNumber(prefix = 'INV') {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const rand = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}-${y}${m}${d}-${rand}`
}

/**
 * Calculate total from items array
 * items: [{quantity, price, discount?}]
 */
export function calcTotal(items) {
  return items.reduce((sum, item) => {
    const lineTotal = item.quantity * parseFloat(item.price)
    const disc = parseFloat(item.discount || 0)
    return sum + lineTotal - disc
  }, 0)
}
