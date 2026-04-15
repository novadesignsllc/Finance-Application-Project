import { useState, useEffect } from 'react'
import type { Category, CategoryPlan, PlanType } from '../data/mockData'

interface InspectorPanelProps {
  category: Category | null
  onPlanChange: (catId: string, plan: CategoryPlan | undefined) => void
}

const PLAN_TYPES: { type: PlanType; label: string; icon: string; description: string }[] = [
  { type: 'build',    label: 'Build Over Time',    icon: '📈', description: 'Assign a set amount each month toward this category.' },
  { type: 'savings',  label: 'Savings Goal',       icon: '🎯', description: 'Reach a specific amount by a target date.' },
  { type: 'spending', label: 'Spending Target',    icon: '💳', description: 'Set a monthly spending limit for this category.' },
]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function InspectorPanel({ category, onPlanChange }: InspectorPanelProps) {
  const [makingPlan, setMakingPlan] = useState(false)
  const [selectedType, setSelectedType] = useState<PlanType | null>(null)
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [goalAmount, setGoalAmount] = useState('')
  const [goalDate, setGoalDate] = useState('')

  // Reset plan editor when category changes
  useEffect(() => {
    setMakingPlan(false)
    setSelectedType(null)
    setMonthlyAmount('')
    setGoalAmount('')
    setGoalDate('')
  }, [category?.id])

  // Pre-fill when editing existing plan
  const startEditing = () => {
    if (category?.plan) {
      setSelectedType(category.plan.type)
      setMonthlyAmount(category.plan.monthlyAmount?.toString() ?? '')
      setGoalAmount(category.plan.goalAmount?.toString() ?? '')
      setGoalDate(category.plan.goalDate ?? '')
    } else {
      setSelectedType(null)
      setMonthlyAmount('')
      setGoalAmount('')
      setGoalDate('')
    }
    setMakingPlan(true)
  }

  const savePlan = () => {
    if (!category || !selectedType) return
    const plan: CategoryPlan = { type: selectedType }
    if (selectedType === 'build') {
      plan.monthlyAmount = parseFloat(monthlyAmount) || 0
    } else if (selectedType === 'spending') {
      plan.monthlyAmount = parseFloat(monthlyAmount) || 0
    } else if (selectedType === 'savings') {
      plan.goalAmount = parseFloat(goalAmount) || 0
      plan.goalDate = goalDate
    }
    onPlanChange(category.id, plan)
    setMakingPlan(false)
  }

  const removePlan = () => {
    if (!category) return
    onPlanChange(category.id, undefined)
    setMakingPlan(false)
  }

  // Compute monthly needed for savings goal
  const monthlyNeeded = (() => {
    if (selectedType !== 'savings' || !goalAmount || !goalDate) return null
    const today = new Date()
    const goal = new Date(goalDate)
    const months = Math.max(1, (goal.getFullYear() - today.getFullYear()) * 12 + (goal.getMonth() - today.getMonth()))
    return parseFloat(goalAmount) / months
  })()

  if (!category) {
    return (
      <aside
        className="w-64 flex-shrink-0 flex flex-col items-center justify-center p-6"
        style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--color-border)' }}
      >
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
            <span className="text-2xl">◈</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-faint)' }}>Select a category to see details</p>
        </div>
      </aside>
    )
  }

  const plan = category.plan

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--color-border)' }}
    >
      {/* Category header */}
      <div className="p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{category.emoji}</span>
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{category.name}</h3>
        </div>
        {category.overspent && (
          <span className="inline-flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
            ⚠ Overspent
          </span>
        )}
      </div>

      {/* This Month */}
      <div className="p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
          This Month
        </p>
        <div className="space-y-2">
          {[
            { label: 'Assigned', value: category.assigned, color: '#a78bfa' },
            { label: 'Activity',  value: category.activity,  color: 'var(--text-secondary)' },
            { label: 'Available', value: category.available, color: category.planMet === false || category.overspent ? '#f87171' : category.planMet === true ? '#34d399' : category.available > 0 ? '#34d399' : 'var(--text-secondary)' },
          ].map(item => (
            <div key={item.label} className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{item.label}</span>
              <span className="text-xs font-medium" style={{ color: item.color }}>{fmt(item.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Make A Plan */}
      <div className="p-4 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
          Make A Plan
        </p>

        {!makingPlan ? (
          <>
            {/* Show existing plan summary */}
            {plan ? (
              <div
                className="rounded-xl p-3 mb-3 space-y-1"
                style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: '#c4b5fd' }}>
                    {PLAN_TYPES.find(p => p.type === plan.type)?.icon} {PLAN_TYPES.find(p => p.type === plan.type)?.label}
                  </span>
                </div>
                {plan.type === 'build' && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {fmt(plan.monthlyAmount ?? 0)} / month
                  </p>
                )}
                {plan.type === 'spending' && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Target: {fmt(plan.monthlyAmount ?? 0)} / month
                  </p>
                )}
                {plan.type === 'savings' && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {fmt(plan.goalAmount ?? 0)} by {plan.goalDate ? new Date(plan.goalDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
                  </p>
                )}
                {category.planMet === false && (
                  <p className="text-xs text-red-400 flex items-center gap-1 mt-1">⚠ Not on track this month</p>
                )}
                {category.planMet === true && (
                  <p className="text-xs flex items-center gap-1 mt-1" style={{ color: '#34d399' }}>✓ On track</p>
                )}
              </div>
            ) : (
              <p className="text-xs mb-3" style={{ color: 'var(--text-faint)' }}>No plan set</p>
            )}

            <button
              onClick={startEditing}
              className="w-full py-2 rounded-xl border border-dashed text-xs font-medium transition-all"
              style={{ borderColor: 'rgba(139,92,246,0.3)', color: '#a78bfa' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(109,40,217,0.1)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
            >
              {plan ? '✎ Edit Plan' : '+ Set a Plan'}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            {/* Plan type selector */}
            <div className="space-y-1.5">
              {PLAN_TYPES.map(pt => (
                <button
                  key={pt.type}
                  onClick={() => setSelectedType(pt.type)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                  style={{
                    background: selectedType === pt.type ? 'rgba(109,40,217,0.18)' : 'var(--bg-hover)',
                    border: selectedType === pt.type ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent',
                  }}
                >
                  <span className="text-base mt-0.5">{pt.icon}</span>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: selectedType === pt.type ? '#c4b5fd' : 'var(--text-primary)' }}>
                      {pt.label}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{pt.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Plan-specific inputs */}
            {selectedType === 'build' && (
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-faint)' }}>Monthly amount</label>
                <div className="flex items-center rounded-xl px-3 py-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--color-border)' }}>
                  <span className="text-xs mr-1" style={{ color: 'var(--text-faint)' }}>$</span>
                  <input
                    autoFocus
                    type="number" min="0" step="0.01"
                    value={monthlyAmount}
                    onChange={e => setMonthlyAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}

            {selectedType === 'spending' && (
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-faint)' }}>Monthly spending target</label>
                <div className="flex items-center rounded-xl px-3 py-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--color-border)' }}>
                  <span className="text-xs mr-1" style={{ color: 'var(--text-faint)' }}>$</span>
                  <input
                    autoFocus
                    type="number" min="0" step="0.01"
                    value={monthlyAmount}
                    onChange={e => setMonthlyAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            )}

            {selectedType === 'savings' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-faint)' }}>Goal amount</label>
                  <div className="flex items-center rounded-xl px-3 py-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--color-border)' }}>
                    <span className="text-xs mr-1" style={{ color: 'var(--text-faint)' }}>$</span>
                    <input
                      autoFocus
                      type="number" min="0" step="0.01"
                      value={goalAmount}
                      onChange={e => setGoalAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--text-faint)' }}>Target date</label>
                  <input
                    type="date"
                    value={goalDate}
                    onChange={e => setGoalDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg-hover)', border: '1px solid var(--color-border)', color: 'var(--text-primary)' }}
                  />
                </div>
                {monthlyNeeded !== null && (
                  <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Monthly needed</p>
                    <p className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>{fmt(monthlyNeeded)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMakingPlan(false)}
                className="flex-1 py-2 text-xs font-medium rounded-xl transition-all"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              >
                Cancel
              </button>
              <button
                onClick={savePlan}
                disabled={!selectedType}
                className="flex-1 py-2 text-xs font-semibold rounded-xl transition-all active:scale-95"
                style={{
                  background: selectedType ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'var(--bg-hover)',
                  color: selectedType ? 'white' : 'var(--text-faint)',
                  boxShadow: selectedType ? '0 4px 14px rgba(109,40,217,0.35)' : undefined,
                  cursor: selectedType ? 'pointer' : 'not-allowed',
                }}
              >
                Save Plan
              </button>
            </div>

            {/* Remove plan */}
            {plan && (
              <button
                onClick={removePlan}
                className="w-full py-1.5 text-xs transition-all"
                style={{ color: 'var(--text-faint)', borderRadius: '8px' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)' }}
              >
                Remove plan
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
