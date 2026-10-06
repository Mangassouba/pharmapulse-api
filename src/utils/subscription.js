export const TRIAL_DAYS    = 30
export const DEFAULT_PLAN  = 'STARTER'
export const CURRENCY      = 'MRU'
export const MONTHLY_PRICE = 1500
export const DURATIONS     = [1, 2, 5, 8, 12] // months

export function subscriptionAmount(months) {
  return months * MONTHLY_PRICE
}
export const TRIAL_REMINDER_DAYS = [7, 1] // reminder emails sent N days before the trial ends

// Mobile-money payment details, shown in the welcome email (same values as the front: src/config/payment.js)
export const PAYMENT_NUMBER  = '44896920'
export const PAYMENT_METHODS = ['Bankily', 'Masrvi']
