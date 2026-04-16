import { useState } from 'react'
import CategoryRow from './CategoryRow'
import type { Account } from './Sidebar'
import type { Transaction, CategoryGroup } from '../data/mockData'

export type CreditPlanType = 'lump' | 'monthly' | 'minimum'
export interface CreditPlan {
  type: CreditPlanType
  amount?: number  // used for 'monthly' only
}

interface CreditViewProps {
  accounts: Account[]
  closedAccountIds: Set<string>
  transactions: Transaction[]
  budgetGroupsWithActivity: CategoryGroup[]
  onAssignedChange: (catId: string, value: number) => void
  moneyToBudget: number
  budgetMonth: { year: number; month: number }
  onPrev: () => void
  onNext: () => void
  onGoToCurrent: () => void
  futureBudgeted: number
  onResetAssigned: () => void
  creditPlans: Record<string, CreditPlan>
  onCreditPlanChange: (accountId: string, plan: CreditPlan) => void
  gradientColors: string[]
}

const CC_GROUP_ID = 'cc-payments-group'
const CC_GROUP_NAME = 'Credit Card Payments'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

function workingBalance(accountId: string, transactions: Transaction[]): number {
  return transactions
    .filter(t => t.accountId === accountId)
    .reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0)
}

export default function CreditView({
  accounts,
  closedAccountIds,
  transactions,
  budgetGroupsWithActivity,
  onAssignedChange,
  creditPlans,
  onCreditPlanChange,
}: CreditViewProps) {
  const openCreditAccounts = accounts.filter(
    a => a.type === 'credit' && !closedAccountIds.has(a.id)
  )

  const ccGroup = budgetGroupsWithActivity.find(
    g => g.id === CC_GROUP_ID || g.name === CC_GROUP_NAME
  )

  // local state for monthly amount inputs
  const [monthlyInputs, setMonthlyInputs] = useState<Record<string, string>>({})

  const getPlan = (accountId: string): CreditPlan =>
    creditPlans[accountId] ?? { type: 'lump' }

  const estimatedMinimum = (balance: number): number => {
    const pct = Math.abs(balance) * 0.02
    return Math.max(25, pct)
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-main)' }}>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Section A — Credit Cards */}
        <section>
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-faint)' }}
          >
            Credit Cards
          </p>

          {openCreditAccounts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
              No open credit card accounts.
            </p>
          ) : (
            <div className="space-y-3">
              {openCreditAccounts.map(account => {
                const balance = workingBalance(account.id, transactions)
                const plan = getPlan(account.id)
                const isNegative = balance < 0

                return (
                  <div
                    key={account.id}
                    className="rounded-xl p-4"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '12px',
                    }}
                  >
                    {/* Account name + balance */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base">💳</span>
                        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {account.name}
                        </span>
                      </div>
                      <span
                        className="text-sm font-semibold"
                        style={{ color: isNegative ? '#f87171' : 'var(--text-secondary)' }}
                      >
                        {isNegative ? `-${fmt(balance)}` : fmt(balance)}
                      </span>
                    </div>

                    {/* Plan selector pills */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {(
                        [
                          { type: 'lump' as const, label: 'Pay Off Now' },
                          { type: 'monthly' as const, label: 'Monthly' },
                          { type: 'minimum' as const, label: 'Minimum' },
                        ] as const
                      ).map(opt => {
                        const active = plan.type === opt.type
                        return (
                          <button
                            key={opt.type}
                            onClick={() =>
                              onCreditPlanChange(account.id, { type: opt.type, amount: plan.amount })
                            }
                            className="text-sm font-medium px-3 py-1.5 transition-all"
                            style={{
                              borderRadius: '20px',
                              background: active
                                ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                                : 'var(--bg-hover)',
                              color: active ? 'white' : 'var(--text-secondary)',
                              border: active ? 'none' : '1px solid var(--color-border)',
                              boxShadow: active ? '0 2px 10px rgba(109,40,217,0.3)' : 'none',
                            }}
                          >
                            {opt.label}
                          </button>
                        )
                      })}

                      {/* Monthly amount input */}
                      {plan.type === 'monthly' && (
                        <div
                          className="flex items-center gap-1 px-2 py-1"
                          style={{
                            borderRadius: '20px',
                            background: 'var(--bg-hover)',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>$</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            className="text-sm bg-transparent outline-none w-20"
                            style={{ color: 'var(--text-primary)' }}
                            value={monthlyInputs[account.id] ?? (plan.amount != null ? plan.amount.toString() : '')}
                            onChange={e => setMonthlyInputs(prev => ({ ...prev, [account.id]: e.target.value }))}
                            onBlur={e => {
                              const val = parseFloat(e.target.value.replace(/[^0-9.]/g, ''))
                              const amount = isNaN(val) ? 0 : val
                              onCreditPlanChange(account.id, { type: 'monthly', amount })
                              setMonthlyInputs(prev => ({ ...prev, [account.id]: amount.toString() }))
                            }}
                          />
                          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>/mo</span>
                        </div>
                      )}
                    </div>

                    {/* Info line */}
                    {plan.type === 'lump' && balance !== 0 && (
                      <p className="text-xs mt-2.5" style={{ color: 'var(--text-faint)' }}>
                        Target this month:{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {fmt(Math.abs(balance))}
                        </span>
                      </p>
                    )}
                    {plan.type === 'minimum' && balance < 0 && (
                      <p className="text-xs mt-2.5" style={{ color: 'var(--text-faint)' }}>
                        Estimated minimum:{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {fmt(estimatedMinimum(balance))}
                        </span>
                        {' '}(~2% of balance, min $25)
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Section B — CC Payment Categories */}
        {ccGroup && ccGroup.categories.length > 0 && (
          <section>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: 'var(--text-faint)' }}
            >
              Payments
            </p>

            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '12px',
              }}
            >
              {/* Table header */}
              <div
                className="flex items-center px-4 py-2 text-xs font-semibold uppercase tracking-wider"
                style={{
                  color: 'var(--text-faint)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div className="flex-1">Name</div>
                <div style={{ width: '128px', textAlign: 'right', paddingRight: '16px' }}>Assigned</div>
                <div style={{ width: '128px', textAlign: 'right', paddingRight: '16px' }}>Activity</div>
                <div style={{ width: '128px', textAlign: 'right' }}>Available</div>
              </div>

              {/* Category rows */}
              <div className="py-1">
                {ccGroup.categories.map((cat, idx) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    isSelected={false}
                    onSelect={() => {}}
                    onEmojiChange={() => {}}
                    onAssignedChange={val => onAssignedChange(cat.id, val)}
                    catIndex={idx}
                    onCatDragStart={() => {}}
                    onCatDragOver={() => {}}
                    onCatDragEnd={() => {}}
                    isDraggingOver={false}
                    isCCPayment={true}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
