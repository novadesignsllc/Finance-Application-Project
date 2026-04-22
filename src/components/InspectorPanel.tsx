import { useState, useEffect } from 'react'
import type { Category, CategoryPlan, PlanType } from '../data/mockData'
import DatePickerButton from './DatePickerButton'

interface InspectorPanelProps {
  category: Category | null
  onPlanChange: (catId: string, plan: CategoryPlan | undefined) => void
  onAssignedChange: (catId: string, value: number) => void
  onDebtPayoffChange: (catId: string, date: string | undefined) => void
  onDeleteCategory: (catId: string) => void
  onRenameCategory: (catId: string, name: string) => void
  monthlyAssigned: Record<string, Record<string, number>>
  budgetMonth: { year: number; month: number }
}

const PLAN_TYPES: { type: PlanType; label: string; icon: string; description: string }[] = [
  { type: 'build',    label: 'Build Over Time',    icon: '📈', description: 'Assign a set amount each month toward this category.' },
  { type: 'savings',  label: 'Savings Goal',       icon: '🎯', description: 'Reach a specific amount by a target date.' },
  { type: 'spending', label: 'Spending Target',    icon: '💳', description: 'Set a monthly spending limit for this category.' },
]

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const MONTH_LETTERS = ['J','F','M','A','M','J','J','A','S','O','N','D']

export default function InspectorPanel({ category, onPlanChange, onAssignedChange, onDebtPayoffChange, onDeleteCategory, onRenameCategory, monthlyAssigned, budgetMonth }: InspectorPanelProps) {
  const [makingPlan, setMakingPlan] = useState(false)
  const [selectedType, setSelectedType] = useState<PlanType | null>(null)
  const [monthlyAmount, setMonthlyAmount] = useState('')
  const [goalAmount, setGoalAmount] = useState('')
  const [goalDate, setGoalDate] = useState('')
  const [editingDebtPayoff, setEditingDebtPayoff] = useState(false)
  const [debtPayoffInput, setDebtPayoffInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  // Reset plan editor when category changes
  useEffect(() => {
    setMakingPlan(false)
    setSelectedType(null)
    setMonthlyAmount('')
    setGoalAmount('')
    setGoalDate('')
    setEditingDebtPayoff(false)
    setDebtPayoffInput('')
    setConfirmDelete(false)
    setEditingName(false)
    setNameValue('')
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

  const commitRename = () => {
    if (!category) return
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== category.name) onRenameCategory(category.id, trimmed)
    setEditingName(false)
  }

  const savePlan = () => {
    if (!category || !selectedType) return
    // Preserve existing startDate when editing; set to current month when creating
    const existingStart = category.plan?.startDate
    const currentMonthKey = `${budgetMonth.year}-${String(budgetMonth.month).padStart(2, '0')}`
    const plan: CategoryPlan = { type: selectedType, startDate: existingStart ?? currentMonthKey }
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

  const isCCPayment = category.ccStartingBalance !== undefined
  const plan = category.plan

  // ── CC payment category view ──────────────────────────────────────────────
  if (isCCPayment) {
    const startingBalance = category.ccStartingBalance ?? 0
    const uncovered = category.ccStartingUncovered ?? 0
    const hasUncoveredBalance = uncovered > 0
    return (
      <aside
        className="w-64 flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div className="p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">💳</span>
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{category.name}</h3>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Credit card payment</span>
        </div>

        {/* Starting balance warning — only shown while uncovered */}
        {hasUncoveredBalance && (
          <div
            className="mx-4 mt-4 rounded-xl p-3 space-y-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">⚠</span>
              <p className="text-xs font-semibold" style={{ color: '#f87171' }}>Starting balance needs funding</p>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-faint)' }}>Starting balance</span>
              <span style={{ color: 'var(--text-secondary)' }}>{fmt(startingBalance)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--text-faint)' }}>Still needed</span>
              <span style={{ color: '#f87171', fontWeight: 600 }}>{fmt(uncovered)}</span>
            </div>
            <button
              onClick={() => onAssignedChange(category.id, category.assigned + uncovered)}
              className="w-full py-1.5 text-xs font-semibold rounded-lg mt-1 transition-all active:scale-95"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)' }}
            >
              Auto Assign {fmt(uncovered)}
            </button>
          </div>
        )}

        {/* Card balance vs available coverage */}
        {(() => {
          const cardBalance = category.ccAccountBalance ?? 0
          const avail = category.available
          const gap = cardBalance - avail
          const fullyCovered = avail >= cardBalance
          return cardBalance > 0 ? (
            <div
              className="mx-4 mt-4 rounded-xl p-3 space-y-2"
              style={{
                background: fullyCovered ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${fullyCovered ? 'rgba(52,211,153,0.25)' : 'rgba(239,68,68,0.25)'}`,
              }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{fullyCovered ? '✓' : '⚠'}</span>
                <p className="text-xs font-semibold" style={{ color: fullyCovered ? '#34d399' : '#f87171' }}>
                  {fullyCovered ? 'Fully covered' : `Short ${fmt(gap)}`}
                </p>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-faint)' }}>Card balance</span>
                <span style={{ color: 'var(--text-secondary)' }}>{fmt(cardBalance)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: 'var(--text-faint)' }}>Available to pay</span>
                <span style={{ color: avail >= cardBalance ? '#34d399' : avail > 0 ? '#eab308' : '#f87171', fontWeight: 600 }}>
                  {fmt(avail)}
                </span>
              </div>
            </div>
          ) : null
        })()}

        {/* This month stats */}
        <div className="p-4 mt-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
            This Month
          </p>
          <div className="space-y-2">
            {[
              { label: 'Manually Allocated', value: category.assigned, color: '#a78bfa' },
              { label: 'Funded from Budget',  value: (category.ccFunding ?? []).reduce((s, f) => s + f.amount, 0), color: '#34d399' },
              { label: 'Spending',           value: category.activity,  color: '#f87171' },
              { label: 'Available to Pay',   value: category.available, color: category.available > 0 ? '#34d399' : category.available < 0 ? '#f87171' : 'var(--text-secondary)' },
            ].map(item => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{item.label}</span>
                <span className="text-xs font-medium" style={{ color: item.color }}>
                  {item.label === 'Spending'
                    ? item.value === 0 ? fmt(0) : `-${fmt(Math.abs(item.value))}`
                    : fmt(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Funding breakdown */}
        {(category.ccFunding ?? []).length > 0 && (
          <div className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
              Funded By
            </p>
            <div className="space-y-1.5">
              {(category.ccFunding ?? []).map(f => {
                const full = f.amount >= f.total
                return (
                  <div key={f.categoryName} className="flex justify-between items-center gap-2">
                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{f.categoryName}</span>
                    <span className="text-xs font-medium flex-shrink-0 tabular-nums">
                      <span style={{ color: full ? '#34d399' : '#f87171' }}>{fmt(f.amount)}</span>
                      <span style={{ color: 'var(--text-faint)' }}> / </span>
                      <span style={{ color: '#34d399' }}>{fmt(f.total)}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Debt Payoff Plan */}
        <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
            Debt Payoff Plan
          </p>

          {editingDebtPayoff ? (
            <div className="space-y-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-faint)' }}>Target payoff date</label>
                <DatePickerButton
                  value={debtPayoffInput}
                  onChange={setDebtPayoffInput}
                  placeholder="Select target date"
                  className="w-full"
                />
              </div>
              {debtPayoffInput && (() => {
                const bal = category.ccAccountBalance ?? 0
                const payoff = new Date(debtPayoffInput + 'T00:00:00')
                const today = new Date()
                const months = Math.max(1, (payoff.getFullYear() - today.getFullYear()) * 12 + (payoff.getMonth() - today.getMonth()))
                const needed = bal / months
                return (
                  <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Monthly payment needed</p>
                    <p className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>{fmt(needed)} / month</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{months} month{months !== 1 ? 's' : ''} remaining</p>
                  </div>
                )
              })()}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditingDebtPayoff(false)}
                  className="flex-1 py-2 text-xs font-medium rounded-xl transition-all"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (debtPayoffInput) onDebtPayoffChange(category.id, debtPayoffInput)
                    setEditingDebtPayoff(false)
                  }}
                  disabled={!debtPayoffInput}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl transition-all active:scale-95"
                  style={{
                    background: debtPayoffInput ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'var(--bg-hover)',
                    color: debtPayoffInput ? 'white' : 'var(--text-faint)',
                  }}
                >
                  Save Plan
                </button>
              </div>
              {category.debtPayoffDate && (
                <button
                  onClick={() => { onDebtPayoffChange(category.id, undefined); setEditingDebtPayoff(false) }}
                  className="w-full py-1.5 text-xs transition-all"
                  style={{ color: 'var(--text-faint)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
                >
                  Remove plan
                </button>
              )}
            </div>
          ) : category.debtPayoffDate ? (() => {
            const bal = category.ccAccountBalance ?? 0
            const payoff = new Date(category.debtPayoffDate + 'T00:00:00')
            const today = new Date()
            const months = Math.max(1, (payoff.getFullYear() - today.getFullYear()) * 12 + (payoff.getMonth() - today.getMonth()))
            const needed = bal / months
            return (
              <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: '#c4b5fd' }}>🎯 Payoff Goal</span>
                  <button
                    onClick={() => { setDebtPayoffInput(category.debtPayoffDate!); setEditingDebtPayoff(true) }}
                    className="text-xs transition-all"
                    style={{ color: 'var(--text-faint)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
                  >
                    ✎ Edit
                  </button>
                </div>
                <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {fmt(needed)} / month
                </p>
                <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  {payoff.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · {months} month{months !== 1 ? 's' : ''} left
                </p>
                {category.planStatus === 'met' && (
                  <p className="text-xs mt-1" style={{ color: '#34d399' }}>✓ On track this month</p>
                )}
                {category.planStatus === 'under' && (
                  <p className="text-xs mt-1 text-red-400">⚠ Needs {fmt(needed - category.assigned)} more</p>
                )}
              </div>
            )
          })() : (
            <button
              onClick={() => { setDebtPayoffInput(''); setEditingDebtPayoff(true) }}
              className="w-full py-2 rounded-xl border border-dashed text-xs font-medium transition-all"
              style={{ borderColor: 'rgba(139,92,246,0.3)', color: '#a78bfa' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(109,40,217,0.1)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
            >
              + Set Payoff Goal
            </button>
          )}
        </div>
      </aside>
    )
  }

  // ── Regular category view ─────────────────────────────────────────────────
  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--color-border)' }}
    >
      {/* Category header */}
      <div className="p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{category.emoji}</span>
          {editingName ? (
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingName(false) }}
              className="flex-1 px-2 py-0.5 text-sm font-semibold rounded-lg outline-none"
              style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.5)', color: 'var(--text-primary)' }}
            />
          ) : (
            <button
              className="group flex items-center gap-1 text-left"
              onClick={() => { setNameValue(category.name); setEditingName(true) }}
              title="Click to rename"
            >
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{category.name}</h3>
              <span className="text-xs opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: 'var(--text-faint)' }}>✎</span>
            </button>
          )}
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
            { label: 'Allocated', value: category.assigned, color: '#a78bfa' },
            { label: 'Activity',  value: category.activity,  color: 'var(--text-faint)' },
            { label: 'Available', value: category.available, color: category.planStatus === 'under' || category.overspent ? '#f87171' : category.planStatus === 'over' ? '#eab308' : category.planStatus === 'met' ? '#34d399' : category.available > 0 ? '#34d399' : 'var(--text-secondary)' },
          ].map(item => (
            <div key={item.label} className="flex justify-between items-center">
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{item.label}</span>
              <span className="text-xs font-medium" style={{ color: item.color }}>{fmt(item.value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Make A Plan */}
      <div className="p-4 flex-1" style={{ paddingBottom: 0 }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
          Make A Plan
        </p>

        {!makingPlan ? (
          <>
            {/* Show existing plan summary */}
            {plan ? (
              <div
                className="rounded-xl p-3 mb-3"
                style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: '#c4b5fd' }}>
                    {PLAN_TYPES.find(p => p.type === plan.type)?.icon} {PLAN_TYPES.find(p => p.type === plan.type)?.label}
                  </span>
                </div>

                {/* Savings: monthly needed + goal */}
                {plan.type === 'savings' && (() => {
                  const goalAmt = plan.goalAmount ?? 0
                  const goalDt = plan.goalDate ? new Date(plan.goalDate + 'T00:00:00') : null
                  const startDt = plan.startDate
                    ? (() => { const [sy, sm] = plan.startDate!.split('-').map(Number); return new Date(sy, sm - 1) })()
                    : new Date(budgetMonth.year, budgetMonth.month - 1)
                  const totalMonths = goalDt
                    ? Math.max(1, (goalDt.getFullYear() - startDt.getFullYear()) * 12 + (goalDt.getMonth() - startDt.getMonth()))
                    : 1
                  const needed = goalAmt / totalMonths
                  return (
                    <>
                      <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                        {fmt(needed)} / month
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                        {fmt(goalAmt)} by {goalDt ? goalDt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    </>
                  )
                })()}

                {/* Build: monthly amount + progress bar */}
                {plan.type === 'build' && (() => {
                  const target = plan.monthlyAmount ?? 0
                  const assigned = category.assigned
                  const pct = target > 0 ? Math.min(100, (assigned / target) * 100) : 0
                  const met = assigned >= target && target > 0
                  return (
                    <>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {fmt(target)} / month
                      </p>
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color: 'var(--text-faint)' }}>This month</span>
                          <span style={{ color: met ? '#34d399' : 'var(--text-secondary)' }}>
                            {fmt(assigned)} / {fmt(target)}
                          </span>
                        </div>
                        <div className="rounded-full overflow-hidden" style={{ height: '5px', background: 'rgba(255,255,255,0.08)' }}>
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${pct}%`,
                              background: met ? '#34d399' : 'linear-gradient(90deg, #7c3aed, #2563eb)',
                            }}
                          />
                        </div>
                      </div>
                    </>
                  )
                })()}

                {/* Spending: target */}
                {plan.type === 'spending' && (
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Target: {fmt(plan.monthlyAmount ?? 0)} / month
                  </p>
                )}

                {/* Status badge */}
                {category.planStatus === 'under' && (
                  <p className="text-xs text-red-400 flex items-center gap-1 mt-1.5">⚠ Not on track this month</p>
                )}
                {category.planStatus === 'over' && (
                  <p className="text-xs flex items-center gap-1 mt-1.5" style={{ color: '#eab308' }}>⚠ Over target — spending covered</p>
                )}
                {category.planStatus === 'met' && (
                  <p className="text-xs flex items-center gap-1 mt-1.5" style={{ color: '#34d399' }}>✓ On track</p>
                )}

                {/* Monthly calendar (savings + build only) */}
                {plan.startDate && (plan.type === 'savings' || plan.type === 'build') && (() => {
                  const [startY, startM] = plan.startDate!.split('-').map(Number)
                  let endYear: number, endMonth: number
                  if (plan.type === 'savings' && plan.goalDate) {
                    const d = new Date(plan.goalDate + 'T00:00:00')
                    endYear = d.getFullYear(); endMonth = d.getMonth() + 1
                  } else {
                    // Build: 12 months from start
                    let y = startY, m = startM + 11
                    while (m > 12) { m -= 12; y++ }
                    endYear = y; endMonth = m
                  }
                  const months: string[] = []
                  let y = startY, m = startM
                  while ((y < endYear || (y === endYear && m <= endMonth)) && months.length < 36) {
                    months.push(`${y}-${String(m).padStart(2, '0')}`)
                    m++; if (m > 12) { m = 1; y++ }
                  }
                  const totalMo = months.length
                  const monthlyRequired = plan.type === 'savings'
                    ? (plan.goalAmount ?? 0) / Math.max(1, totalMo)
                    : (plan.monthlyAmount ?? 0)
                  const half = Math.ceil(months.length / 2)
                  const col1 = months.slice(0, half)
                  const col2 = months.slice(half)
                  return (
                    <div className="mt-3 pt-2" style={{ borderTop: '1px solid rgba(139,92,246,0.15)' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)', letterSpacing: '0.06em' }}>
                        Timeline
                      </p>
                      <div className="flex gap-1.5">
                        {[col1, col2].map((col, ci) => (
                          <div key={ci} className="flex-1 space-y-1">
                            {col.map(mk => {
                              const [, mm] = mk.split('-').map(Number)
                              const assigned = monthlyAssigned[mk]?.[category.id] ?? 0
                              const met = monthlyRequired > 0 && assigned >= monthlyRequired
                              return (
                                <div
                                  key={mk}
                                  className="flex flex-col items-center py-1 rounded-lg"
                                  style={{ background: met ? 'rgba(52,211,153,0.08)' : 'rgba(248,113,113,0.06)' }}
                                >
                                  <span className="text-xs leading-none" style={{ color: 'var(--text-faint)', fontSize: '10px' }}>
                                    {MONTH_LETTERS[mm - 1]}
                                  </span>
                                  <span className="leading-none mt-0.5" style={{ color: met ? '#34d399' : '#f87171', fontSize: '10px' }}>
                                    {met ? '✓' : '✗'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
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
                  <DatePickerButton
                    value={goalDate}
                    onChange={setGoalDate}
                    placeholder="Select target date"
                    className="w-full"
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

      {/* Rename + Delete — only for regular (non-bill) categories */}
      {!category.id.startsWith('bill-category-') && (
        <div className="px-4 py-4 space-y-1" style={{ borderTop: '1px solid var(--color-border)', marginTop: 'auto' }}>
          {/* Rename button */}
          {!category.id.startsWith('cc-payment-') && (
            editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingName(false) }}
                placeholder="Category name…"
                className="w-full px-3 py-1.5 text-xs rounded-lg outline-none mb-1"
                style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.5)', color: 'var(--text-primary)' }}
              />
            ) : (
              <button
                onClick={() => { setNameValue(category.name); setEditingName(true) }}
                className="w-full py-1.5 text-xs font-medium rounded-lg transition-all"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent' }}
              >
                Rename Category
              </button>
            )
          )}
          {confirmDelete ? (
            <div className="rounded-xl p-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#f87171' }}>Delete this category?</p>
              <p className="text-xs mb-3" style={{ color: 'var(--text-faint)' }}>
                Removes the category and all its allocations. Transactions keep their category name but won't match a budget group.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.6)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                >Cancel</button>
                <button
                  onClick={() => onDeleteCategory(category.id)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{ background: 'rgba(239,68,68,0.75)', color: 'white' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.9)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.75)')}
                >Delete</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-1.5 text-xs font-medium rounded-lg transition-all"
              style={{ color: 'rgba(239,68,68,0.6)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(239,68,68,0.6)'; e.currentTarget.style.background = 'transparent' }}
            >
              Delete Category
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
