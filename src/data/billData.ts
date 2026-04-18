export type BillFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface Bill {
  id: string
  name: string
  emoji: string
  accountId: string   // '' = unassigned
  frequency: BillFrequency
  amount: number
  dueDate: string     // YYYY-MM-DD anchor date (last/first due date)
  linkedTransactionId?: string  // set once a transaction has been auto-created
}

export function getNextPaymentDate(dueDate: string, frequency: BillFrequency): Date | null {
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let d = new Date(dueDate + 'T00:00:00')
  let safety = 0
  while (d < today && safety < 400) {
    switch (frequency) {
      case 'daily':     d.setDate(d.getDate() + 1); break
      case 'weekly':    d.setDate(d.getDate() + 7); break
      case 'monthly':   d.setMonth(d.getMonth() + 1); break
      case 'quarterly': d.setMonth(d.getMonth() + 3); break
      case 'yearly':    d.setFullYear(d.getFullYear() + 1); break
    }
    safety++
  }
  return d
}

export function formatNextDate(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const label = `${months[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() !== today.getFullYear() ? `${label} '${String(d.getFullYear()).slice(2)}` : label
}

export function nextDateUrgency(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days === 0) return '#f87171'   // today — red
  if (days <= 3)  return '#fb923c'   // ≤3 days — orange
  if (days <= 7)  return '#fbbf24'   // ≤1 week — yellow
  return 'var(--text-faint)'
}

export interface BillGroup {
  id: string
  name: string
  bills: Bill[]
  collapsed?: boolean
}

export function toMonthly(amount: number, freq: BillFrequency): number {
  switch (freq) {
    case 'daily':     return amount * 30
    case 'weekly':    return amount * (52 / 12)
    case 'monthly':   return amount
    case 'quarterly': return amount / 3
    case 'yearly':    return amount / 12
  }
}

export const FREQ_CONFIG: Record<BillFrequency, { label: string; color: string; bg: string; border: string }> = {
  daily:     { label: 'Daily',     color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',   border: 'rgba(96,165,250,0.3)'   },
  weekly:    { label: 'Weekly',    color: '#c084fc', bg: 'rgba(192,132,252,0.12)',  border: 'rgba(192,132,252,0.3)'  },
  monthly:   { label: 'Monthly',   color: '#34d399', bg: 'rgba(52,211,153,0.12)',   border: 'rgba(52,211,153,0.3)'   },
  quarterly: { label: 'Quarterly', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',   border: 'rgba(251,191,36,0.3)'   },
  yearly:    { label: 'Yearly',    color: '#f97316', bg: 'rgba(249,115,22,0.12)',   border: 'rgba(249,115,22,0.3)'   },
}

export const EMOJI_PRESETS = [
  '🏠','🏡','🏢','🏗️','🏦','🏥','🏋️','🏫',
  '⚡','💧','🔥','🌊','🌐','📡','📺','🔌',
  '📱','💻','🤖','📷','🎧','🖨️','⌨️','🖥️',
  '🎬','🎵','🎮','📚','🎭','🎨','🎯','🎲',
  '🚗','🚌','✈️','🚂','🛵','⛽','🚘','🛞',
  '🛒','☕','🍕','🥗','🍔','🛍️','🧴','👕',
  '💳','💰','💵','📈','🏆','🎁','🐾','🌿',
  '💊','🩺','🦷','🧬','🛡️','🔔','📋','❤️',
]

export const mockBillGroups: BillGroup[] = [
  {
    id: 'bg-needs',
    name: 'Needs',
    bills: [
      { id: 'bill-rent',     name: 'Rent / Mortgage',  emoji: '🏠', accountId: '', frequency: 'monthly',   amount: 1800.00, dueDate: '2026-04-01' },
      { id: 'bill-electric', name: 'Electric & Gas',   emoji: '⚡', accountId: '', frequency: 'monthly',   amount: 97.50,   dueDate: '2026-04-10' },
      { id: 'bill-internet', name: 'Internet',          emoji: '🌐', accountId: '', frequency: 'monthly',   amount: 69.99,   dueDate: '2026-04-15' },
      { id: 'bill-phone',    name: 'Phone',             emoji: '📱', accountId: '', frequency: 'monthly',   amount: 45.00,   dueDate: '2026-04-01' },
      { id: 'bill-medical',  name: 'Medical Payment',  emoji: '🏥', accountId: '', frequency: 'monthly',   amount: 150.00,  dueDate: '2026-04-20' },
      { id: 'bill-insurance',name: 'Insurance',         emoji: '🛡️', accountId: '', frequency: 'monthly',   amount: 220.00,  dueDate: '2026-04-05' },
    ],
  },
  {
    id: 'bg-wants',
    name: 'Wants',
    bills: [
      { id: 'bill-netflix',  name: 'Netflix',           emoji: '🎬', accountId: '', frequency: 'monthly',   amount: 15.99,   dueDate: '2026-04-23' },
      { id: 'bill-disney',   name: 'Disney+',           emoji: '🏰', accountId: '', frequency: 'monthly',   amount: 13.99,   dueDate: '2026-04-12' },
      { id: 'bill-spotify',  name: 'Spotify',           emoji: '🎵', accountId: '', frequency: 'monthly',   amount: 9.99,    dueDate: '2026-04-08' },
      { id: 'bill-claude',   name: 'Claude Pro',        emoji: '🤖', accountId: '', frequency: 'monthly',   amount: 20.00,   dueDate: '2026-04-15' },
    ],
  },
]
