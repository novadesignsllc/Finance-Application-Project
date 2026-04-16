import { useState } from 'react'
import type { Account } from './Sidebar'
import type { Transaction } from '../data/mockData'

export type CreditPlanType = 'lump' | 'monthly' | 'minimum'
export interface CreditPlan {
  type: CreditPlanType
  amount?: number
  dueDate?: string // 'YYYY-MM-DD'
}

interface CreditViewProps {
  accounts: Account[]
  closedAccountIds: Set<string>
  transactions: Transaction[]
  creditPlans: Record<string, CreditPlan>
  onCreditPlanChange: (accountId: string, plan: CreditPlan) => void
  gradientColors: string[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

function workingBalance(accountId: string, transactions: Transaction[]): number {
  return transactions
    .filter(t => t.accountId === accountId)
    .reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0)
}

function buildGradient(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const stops = colors.map((c, i) => `${c} ${Math.round(i / (colors.length - 1) * 100)}%`)
  return `linear-gradient(135deg, ${stops.join(', ')})`
}

const PLAN_OPTIONS: { type: CreditPlanType; label: string; desc: string }[] = [
  { type: 'lump',    label: 'Pay Off Now',  desc: 'Pay the full balance this month' },
  { type: 'monthly', label: 'Fixed Monthly', desc: 'Pay a set amount each month'     },
  { type: 'minimum', label: 'Minimum',       desc: '~2% of balance (min $25)'        },
]

export default function CreditView({
  accounts,
  closedAccountIds,
  transactions,
  creditPlans,
  onCreditPlanChange,
  gradientColors,
}: CreditViewProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [draftPlan, setDraftPlan] = useState<CreditPlan | null>(null)

  const openCards = accounts.filter(a => a.type === 'credit' && !closedAccountIds.has(a.id))

  const openDetail = (id: string) => {
    setSelectedAccountId(id)
    setDraftPlan(creditPlans[id] ?? { type: 'lump' })
  }

  const closeDetail = () => {
    setSelectedAccountId(null)
    setDraftPlan(null)
  }

  const saveDetail = () => {
    if (selectedAccountId && draftPlan) {
      onCreditPlanChange(selectedAccountId, draftPlan)
    }
    closeDetail()
  }

  const selectedAccount = openCards.find(a => a.id === selectedAccountId)
  const selectedBalance = selectedAccountId ? workingBalance(selectedAccountId, transactions) : 0
  const estimatedMin = (bal: number) => Math.max(25, Math.abs(bal) * 0.02)

  const gradient = buildGradient(gradientColors)

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--bg-main)' }}>

      {/* Header */}
      <div
        className="flex-shrink-0 px-6 py-4"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--bg-surface)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Credit Cards</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
          {openCards.length} card{openCards.length !== 1 ? 's' : ''} · click a card to manage its payment plan
        </p>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {openCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-3xl">💳</span>
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No credit card accounts added yet.</p>
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {openCards.map(account => {
              const balance = workingBalance(account.id, transactions)
              const plan = creditPlans[account.id]
              const hasDebt = balance < 0

              return (
                <button
                  key={account.id}
                  onClick={() => openDetail(account.id)}
                  className="relative text-left overflow-hidden transition-all active:scale-[0.98]"
                  style={{
                    borderRadius: '16px',
                    background: gradient,
                    padding: '1px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.25)')}
                >
                  {/* Inner card */}
                  <div
                    className="relative flex flex-col h-full p-5"
                    style={{
                      borderRadius: '15px',
                      background: 'linear-gradient(135deg, rgba(15,13,26,0.92) 0%, rgba(20,18,35,0.88) 100%)',
                      backdropFilter: 'blur(12px)',
                      minHeight: '148px',
                    }}
                  >
                    {/* Chip icon */}
                    <div className="flex items-start justify-between mb-auto">
                      <div
                        className="w-8 h-6 rounded-md"
                        style={{ background: 'linear-gradient(135deg, #d4af37, #f5e06e)', opacity: 0.85 }}
                      />
                      {plan && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{
                            background: 'rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.6)',
                            border: '1px solid rgba(255,255,255,0.15)',
                          }}
                        >
                          {plan.type === 'lump' ? 'Pay Off' : plan.type === 'monthly' ? `$${plan.amount ?? 0}/mo` : 'Min'}
                        </span>
                      )}
                    </div>

                    {/* Balance */}
                    <div className="mt-4">
                      <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Current Balance</p>
                      <p
                        className="text-2xl font-bold"
                        style={{ color: hasDebt ? '#f87171' : '#34d399', letterSpacing: '-0.02em' }}
                      >
                        {hasDebt ? `-${fmt(balance)}` : fmt(balance)}
                      </p>
                    </div>

                    {/* Card name + due date */}
                    <div className="flex items-end justify-between mt-3">
                      <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
                        {account.name}
                      </p>
                      {plan?.dueDate && (
                        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          Due {new Date(plan.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedAccount && draftPlan && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={closeDetail}
        >
          <div
            className="w-full max-w-sm mx-4 rounded-2xl overflow-hidden"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(109,40,217,0.25)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal gradient header */}
            <div
              className="px-5 py-4"
              style={{ background: gradient }}
            >
              <p className="text-xs font-medium mb-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Payment Plan</p>
              <p className="text-lg font-bold text-white">{selectedAccount.name}</p>
              <p
                className="text-2xl font-bold mt-1"
                style={{ color: selectedBalance < 0 ? '#fca5a5' : '#6ee7b7' }}
              >
                {selectedBalance < 0 ? `-${fmt(selectedBalance)}` : fmt(selectedBalance)}
              </p>
            </div>

            <div className="p-5 flex flex-col gap-4">

              {/* Plan options */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
                  How to pay
                </p>
                <div className="flex flex-col gap-2">
                  {PLAN_OPTIONS.map(opt => {
                    const active = draftPlan.type === opt.type
                    return (
                      <button
                        key={opt.type}
                        onClick={() => setDraftPlan(d => ({ ...d!, type: opt.type }))}
                        className="flex items-center gap-3 px-4 py-3 text-left transition-all"
                        style={{
                          borderRadius: '12px',
                          background: active ? 'rgba(109,40,217,0.15)' : 'var(--bg-hover)',
                          border: active ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent',
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{
                            background: active ? gradient : 'var(--bg-raised)',
                            border: active ? 'none' : '2px solid var(--color-border)',
                          }}
                        >
                          {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium" style={{ color: active ? '#c4b5fd' : 'var(--text-primary)' }}>
                            {opt.label}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            {opt.type === 'lump'
                              ? `Full balance: ${fmt(Math.abs(selectedBalance))}`
                              : opt.type === 'minimum'
                              ? `Est. minimum: ${fmt(estimatedMin(selectedBalance))}`
                              : opt.desc}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Monthly amount input */}
              {draftPlan.type === 'monthly' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                    Monthly amount
                  </p>
                  <div
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      borderRadius: '10px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <span className="text-sm" style={{ color: 'var(--text-faint)' }}>$</span>
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={draftPlan.amount ?? ''}
                      onChange={e => {
                        const v = parseFloat(e.target.value)
                        setDraftPlan(d => ({ ...d!, amount: isNaN(v) ? undefined : v }))
                      }}
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                    <span className="text-xs" style={{ color: 'var(--text-faint)' }}>/mo</span>
                  </div>
                </div>
              )}

              {/* Due date */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                  Payment due date
                </p>
                <input
                  type="date"
                  value={draftPlan.dueDate ?? ''}
                  onChange={e => setDraftPlan(d => ({ ...d!, dueDate: e.target.value || undefined }))}
                  className="w-full px-3 py-2 text-sm rounded-xl outline-none"
                  style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--color-border)',
                    color: draftPlan.dueDate ? 'var(--text-primary)' : 'var(--text-faint)',
                    colorScheme: 'dark',
                  }}
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={closeDetail}
                  className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-all"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                >
                  Cancel
                </button>
                <button
                  onClick={saveDetail}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all"
                  style={{ background: gradient, color: 'white' }}
                >
                  Save Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
