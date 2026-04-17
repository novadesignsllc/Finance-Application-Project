import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Sidebar from './components/Sidebar'
import type { Account } from './components/Sidebar'
import BudgetHeader from './components/BudgetHeader'
import BudgetTable from './components/BudgetTable'
import InspectorPanel from './components/InspectorPanel'
import TransactionView from './components/TransactionView'
import CreditView from './components/CreditView'
import type { CreditPlan } from './components/CreditView'
import LoginPage from './components/LoginPage'
import { supabase } from './lib/supabase'
import { loadAll, seedDefaultBudget, saveAccount, setAccountClosed, removeAccount, saveGroups, saveAssigned, saveTransaction, removeTransaction } from './lib/db'
import { mockBudgetData } from './data/mockData'
import type { CategoryGroup, Transaction, CategoryPlan } from './data/mockData'
import type { Session } from '@supabase/supabase-js'

const MIN_WIDTH = 200
const MAX_WIDTH = 256
const DEFAULT_WIDTH = 256

function buildGradient(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const stops = colors.map((c, i) => `${c} ${Math.round(i / (colors.length - 1) * 100)}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

const CC_GROUP_ID = 'cc-payments-group'
const CC_GROUP_NAME = 'Credit Card Payments'

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings',  label: 'Savings'  },
  { value: 'credit',   label: 'Credit Card' },
]

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session)).catch(() => setSession(null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (session === null) return <LoginPage />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthGate>
      <BudgetApp />
    </AuthGate>
  )
}

function BudgetApp() {
  const [activeView, setActiveView] = useState('budget')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isDark, setIsDark] = useState(true)
  const [gradientColors, setGradientColors] = useState<string[]>(() => {
    try { const s = localStorage.getItem('gradientColors'); return s ? JSON.parse(s) : ['#6d28d9', '#4338ca', '#1d4ed8', '#0369a1'] }
    catch { return ['#6d28d9', '#4338ca', '#1d4ed8', '#0369a1'] }
  })
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [resizeHovered, setResizeHovered] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [closedAccountIds, setClosedAccountIds] = useState<Set<string>>(new Set())
  const [budgetGroups, setBudgetGroups] = useState<CategoryGroup[]>([])
  const [budgetMonth, setBudgetMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
  const [monthlyAssigned, setMonthlyAssigned] = useState<Record<string, Record<string, number>>>({})
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBalance, setNewBalance] = useState('')
  const [newType, setNewType] = useState('checking')
  const [loading, setLoading] = useState(true)
  const [creditPlans, setCreditPlans] = useState<Record<string, CreditPlan>>(() => {
    try { const s = localStorage.getItem('creditPlans'); return s ? JSON.parse(s) : {} }
    catch { return {} }
  })
  const isResizing = useRef(false)
  const userId = useRef<string | null>(null)
  const dataLoaded = useRef(false)

  // ── Load all data on mount ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      userId.current = user.id
      try {
        const data = await loadAll(user.id)
        // New user: seed default budget template
        if (data.budgetGroups.length === 0) {
          const seeded = await seedDefaultBudget(user.id, mockBudgetData)
          setBudgetGroups(seeded)
        } else {
          setBudgetGroups(data.budgetGroups)
        }
        setAccounts(data.accounts)
        setTransactions(data.transactions)
        setClosedAccountIds(data.closedAccountIds)
        setMonthlyAssigned(data.monthlyAssigned)
      } catch (e) {
        console.error('Failed to load data:', e)
      } finally {
        dataLoaded.current = true
        setLoading(false)
      }
    })
  }, [])

  // ── Sync transactions to Supabase on change ─────────────────────
  const prevTransactions = useRef<Transaction[]>([])
  useEffect(() => {
    if (!dataLoaded.current || !userId.current) return
    const uid = userId.current
    const prev = prevTransactions.current
    const curr = transactions

    const catNameToId = new Map<string, string>()
    budgetGroups.forEach(g => g.categories.forEach(c => catNameToId.set(c.name, c.id)))

    const changed = curr.filter(tx => {
      const old = prev.find(p => p.id === tx.id)
      return !old || JSON.stringify(old) !== JSON.stringify(tx)
    })
    const deleted = prev.filter(p => !curr.find(c => c.id === p.id))

    changed.forEach(tx => saveTransaction(uid, tx, catNameToId).catch(console.error))
    deleted.forEach(tx => removeTransaction(tx.id).catch(console.error))
    prevTransactions.current = curr
  }, [transactions])

  // ── Sync groups/categories to Supabase on change (debounced) ───
  const groupsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!dataLoaded.current || !userId.current) return
    const uid = userId.current
    if (groupsSaveTimer.current) clearTimeout(groupsSaveTimer.current)
    groupsSaveTimer.current = setTimeout(() => {
      saveGroups(uid, budgetGroups).catch(console.error)
    }, 600)
  }, [budgetGroups])

  // ── Auto-sync Credit Card Payment categories ───────────────────
  useEffect(() => {
    if (!dataLoaded.current) return
    const openCC = accounts.filter(a => a.type === 'credit' && !closedAccountIds.has(a.id))
    setBudgetGroups(prev => {
      const existing = prev.find(g => g.id === CC_GROUP_ID)
      if (openCC.length === 0) {
        return existing ? prev.filter(g => g.id !== CC_GROUP_ID) : prev
      }
      const desiredCats = openCC.map(a => {
        const found = existing?.categories.find(c => c.id === `cc-payment-${a.id}`)
        return found ?? { id: `cc-payment-${a.id}`, name: a.name, emoji: '💳', assigned: 0, activity: 0, available: 0 }
      })
      const alreadySynced = existing &&
        existing.categories.length === desiredCats.length &&
        desiredCats.every((c, i) => existing.categories[i]?.id === c.id && existing.categories[i]?.name === c.name)
      if (alreadySynced) return prev
      const newGroup = { id: CC_GROUP_ID, name: CC_GROUP_NAME, categories: desiredCats }
      return existing ? prev.map(g => g.id === CC_GROUP_ID ? newGroup : g) : [newGroup, ...prev]
    })
  }, [accounts, closedAccountIds])

  const monthKey = `${budgetMonth.year}-${String(budgetMonth.month).padStart(2, '0')}`

  const prevMonth = () => setBudgetMonth(m => m.month === 1 ? { year: m.year - 1, month: 12 } : { ...m, month: m.month - 1 })
  const nextMonth = () => setBudgetMonth(m => m.month === 12 ? { year: m.year + 1, month: 1 } : { ...m, month: m.month + 1 })

  const onPlanChange = (catId: string, plan: CategoryPlan | undefined) => {
    setBudgetGroups(prev => prev.map(g => ({
      ...g,
      categories: g.categories.map(c => c.id === catId ? { ...c, plan } : c),
    })))
  }

  const onAssignedChange = (catId: string, value: number) => {
    setMonthlyAssigned(prev => ({
      ...prev,
      [monthKey]: { ...prev[monthKey], [catId]: value },
    }))
    if (userId.current) saveAssigned(userId.current, catId, monthKey, value).catch(console.error)
  }

  // Build ordered list of month keys from Jan 2026 up to and including budgetMonth
  const monthSequence = useMemo(() => {
    const months: string[] = []
    let y = 2026, m = 1
    while (y < budgetMonth.year || (y === budgetMonth.year && m <= budgetMonth.month)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`)
      m++; if (m > 12) { m = 1; y++ }
    }
    return months
  }, [budgetMonth])

  // Compute activity/available with rollover — available from month N carries into month N+1
  const budgetGroupsWithActivity = useMemo(() => {
    // Build map of CC payment category ID → account ID for special activity calculation
    const ccPaymentMap = new Map<string, string>()
    accounts.filter(a => a.type === 'credit').forEach(a => ccPaymentMap.set(`cc-payment-${a.id}`, a.id))

    // Build sidebar account order for CC category sorting
    const accountOrder = new Map<string, number>()
    accounts.forEach((a, i) => accountOrder.set(a.id, i))

    return budgetGroups.map(g => {
      const computedCats = g.categories.map(c => {
        let carryover = 0
        let assigned = 0
        let activity = 0
        let available = 0

        for (const mk of monthSequence) {
          const [mkYear, mkMonth] = mk.split('-').map(Number)
          assigned = monthlyAssigned[mk]?.[c.id] ?? 0

          if (ccPaymentMap.has(c.id)) {
            // CC payment category: activity derived from the card's own transactions
            const accountId = ccPaymentMap.get(c.id)!
            const ccTxs = transactions.filter(t => {
              if (t.accountId !== accountId) return false
              const parts = t.date.split('/')
              return parseInt(parts[2]) === mkYear && parseInt(parts[0]) === mkMonth
            })
            activity = ccTxs.reduce((sum, t) => {
              if (t.payee === 'Starting Balance') return sum - (t.outflow ?? 0) // pre-existing debt
              if (t.outflow != null) return sum + t.outflow  // CC purchase → earmark for payment
              if (t.inflow != null) return sum - t.inflow    // payment made → reduces earmark
              return sum
            }, 0)
          } else {
            const catTxs = transactions.filter(t => {
              if (t.category !== c.name || t.payee === 'Starting Balance') return false
              const parts = t.date.split('/')
              return parseInt(parts[2]) === mkYear && parseInt(parts[0]) === mkMonth
            })
            activity = catTxs.reduce((sum, t) => sum + (t.inflow ?? 0) - (t.outflow ?? 0), 0)
          }

          available = carryover + assigned + activity
          carryover = available
        }

        // Plan status — is this month's assignment meeting the plan?
        let planMet: boolean | null = null
        const plan = c.plan
        if (plan) {
          if (plan.type === 'build') {
            planMet = assigned >= (plan.monthlyAmount ?? 0)
          } else if (plan.type === 'spending') {
            planMet = assigned >= (plan.monthlyAmount ?? 0) && available >= 0
          } else if (plan.type === 'savings' && plan.goalAmount && plan.goalDate) {
            const today = new Date()
            const goal = new Date(plan.goalDate)
            const monthsLeft = Math.max(1, (goal.getFullYear() - today.getFullYear()) * 12 + (goal.getMonth() - today.getMonth()))
            const needed = plan.goalAmount / monthsLeft
            planMet = assigned >= needed
          }
        }

        return { ...c, assigned, activity, available, overspent: available < 0, planMet }
      })

      // Keep CC payment categories in sidebar account order
      if (g.id === CC_GROUP_ID) {
        computedCats.sort((a, b) => {
          const aAccId = a.id.replace('cc-payment-', '')
          const bAccId = b.id.replace('cc-payment-', '')
          return (accountOrder.get(aAccId) ?? 999) - (accountOrder.get(bAccId) ?? 999)
        })
      }

      return { ...g, categories: computedCats }
    })
  }, [budgetGroups, transactions, budgetMonth, monthlyAssigned, monthSequence, accounts])

  const selectedCategory = budgetGroupsWithActivity.flatMap(g => g.categories).find(c => c.id === selectedCategoryId) ?? null

  const totalCash = accounts
    .filter(a => !closedAccountIds.has(a.id) && a.type !== 'credit')
    .reduce((sum, a) => sum + transactions.filter(t => t.accountId === a.id).reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0), 0)

  const totalAssigned = budgetGroupsWithActivity.flatMap(g => g.categories).reduce((s, c) => s + c.assigned, 0)
  const moneyToBudget = totalCash - totalAssigned

  // Sum of assigned across all months strictly after budgetMonth
  const futureBudgeted = useMemo(() => {
    let total = 0
    for (const mk of Object.keys(monthlyAssigned)) {
      const [mkY, mkM] = mk.split('-').map(Number)
      const isAfter = mkY > budgetMonth.year || (mkY === budgetMonth.year && mkM > budgetMonth.month)
      if (isAfter) {
        total += Object.values(monthlyAssigned[mk]).reduce((s, v) => s + v, 0)
      }
    }
    return total
  }, [monthlyAssigned, budgetMonth])

  const onResetAssigned = () => {
    setMonthlyAssigned(prev => {
      const next = { ...prev }
      delete next[monthKey]
      return next
    })
  }

  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing.current) return
    setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX)))
  }, [])

  const onMouseUp = useCallback(() => {
    if (!isResizing.current) return
    isResizing.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // Escape closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
      if (e.key === 'Enter' && showAddAccount) handleAddAccount()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showAddAccount, newName, newBalance, newType])

  const openModal = () => {
    setNewName('')
    setNewBalance('')
    setNewType('checking')
    setShowAddAccount(true)
  }

  const closeModal = () => setShowAddAccount(false)

  const handleAddAccount = () => {
    if (!newName.trim()) return
    const balance = parseFloat(newBalance.replace(/[^0-9.-]/g, '')) || 0
    const account: Account = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      type: newType,
    }
    const isCredit = newType === 'credit'
    const startingTx: Transaction = {
      id: crypto.randomUUID(),
      accountId: account.id,
      date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
      payee: 'Starting Balance',
      category: 'Money To Budget',
      memo: '',
      outflow: isCredit ? Math.abs(balance) : null,
      inflow: isCredit ? null : balance,
      cleared: true,
    }
    setAccounts(prev => {
      const next = [...prev, account]
      if (userId.current) saveAccount(userId.current, account, next.length - 1).catch(console.error)
      return next
    })
    setTransactions(prev => [...prev, startingTx])
    closeModal()
    setSelectedAccountId(account.id)
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center" style={{ background: '#0f0d1a' }}>
      <div className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
    </div>
  )

  return (
    <div
      data-theme={isDark ? 'dark' : 'light'}
      className="flex h-screen overflow-hidden relative"
      style={{ background: 'var(--bg-main)' }}
    >
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        isDark={isDark}
        onThemeToggle={() => setIsDark(p => !p)}
        gradientColors={gradientColors}
        onGradientChange={colors => { setGradientColors(colors); localStorage.setItem('gradientColors', JSON.stringify(colors)) }}
        width={sidebarWidth}
        selectedAccountId={selectedAccountId}
        onAccountSelect={setSelectedAccountId}
        onAddAccount={openModal}
        accounts={accounts}
        onAccountsChange={setAccounts}
        transactions={transactions}
        closedAccountIds={closedAccountIds}
      />

      {/* Resize handle */}
      <div
        className="absolute top-0 bottom-0 z-50"
        style={{ left: sidebarWidth - 3, width: '10px', cursor: 'col-resize' }}
        onMouseDown={onResizeMouseDown}
        onMouseEnter={() => setResizeHovered(true)}
        onMouseLeave={() => setResizeHovered(false)}
      >
        <div
          className="absolute inset-y-0 transition-opacity duration-150"
          style={{
            left: '4px',
            width: '2px',
            borderRadius: '2px',
            background: 'linear-gradient(to bottom, rgba(167,139,250,0.9), rgba(59,130,246,0.7), rgba(14,165,233,0.5))',
            opacity: resizeHovered || isResizing.current ? 1 : 0,
          }}
        />
      </div>

      {/* Gradient border wrapper */}
      <div
        className="flex-1 min-w-0"
        style={{
          padding: '9px',
          background: buildGradient(gradientColors),
          backgroundAttachment: 'fixed',
        }}
      >
        <div
          className="flex flex-col h-full overflow-hidden"
          style={{ background: 'var(--bg-main)', borderRadius: '10px' }}
        >
          {!selectedAccountId && activeView !== 'credit' && (
            <BudgetHeader
              budgetMonth={budgetMonth}
              onPrev={prevMonth}
              onNext={nextMonth}
              onGoToCurrent={() => setBudgetMonth({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })}
              moneyToBudget={moneyToBudget}
              futureBudgeted={futureBudgeted}
              onResetAssigned={onResetAssigned}
            />
          )}

          <div className="flex flex-1 min-h-0">
            {selectedAccountId ? (
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <TransactionView
                  accountId={selectedAccountId}
                  accounts={accounts}
                  transactions={transactions}
                  onTransactionsChange={setTransactions}
                  onCloseAccount={id => {
                    setClosedAccountIds(prev => new Set([...prev, id]))
                    setSelectedAccountId(null)
                    if (userId.current) setAccountClosed(id, true).catch(console.error)
                  }}
                  budgetGroups={budgetGroups}
                  gradientColors={gradientColors}
                  onRenameAccount={(id, name) => {
                    setAccounts(prev => prev.map(a => a.id === id ? { ...a, name } : a))
                    if (userId.current) {
                      const updated = accounts.find(a => a.id === id)
                      if (updated) saveAccount(userId.current, { ...updated, name }, accounts.findIndex(a => a.id === id)).catch(console.error)
                    }
                  }}
                  onDeleteAccount={id => {
                    setAccounts(prev => prev.filter(a => a.id !== id))
                    setClosedAccountIds(prev => { const n = new Set(prev); n.delete(id); return n })
                    setSelectedAccountId(null)
                    removeAccount(id).catch(console.error)
                  }}
                />
              </div>
            ) : activeView === 'credit' ? (
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
              <CreditView
                accounts={accounts}
                closedAccountIds={closedAccountIds}
                transactions={transactions}
                creditPlans={creditPlans}
                onCreditPlanChange={(id, plan) => {
                  setCreditPlans(prev => {
                    const next = { ...prev, [id]: plan }
                    localStorage.setItem('creditPlans', JSON.stringify(next))
                    return next
                  })
                }}
                gradientColors={gradientColors}
              />
              </div>
            ) : (
              <>
                <BudgetTable
                  selectedId={selectedCategoryId}
                  onSelect={id => setSelectedCategoryId(prev => prev === id ? null : id)}
                  groups={budgetGroupsWithActivity}
                  onGroupsChange={setBudgetGroups}
                  onAssignedChange={onAssignedChange}
                  ccGroupId={CC_GROUP_ID}
                />
                <InspectorPanel category={selectedCategory} onPlanChange={onPlanChange} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddAccount && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={closeModal}
        >
          <div
            className="rounded-2xl p-6 w-full max-w-sm mx-4"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(109,40,217,0.3)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Add Account</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-faint)' }}>Enter your account details below.</p>

            {/* Account Name */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Account Name
              </label>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Chase Checking"
                className="w-full px-3 py-2.5 text-sm rounded-xl outline-none"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--text-primary)',
                }}
                onFocus={e => (e.currentTarget.style.border = '1px solid rgba(109,40,217,0.5)')}
                onBlur={e => (e.currentTarget.style.border = '1px solid var(--color-border)')}
              />
            </div>

            {/* Account Type */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                Account Type
              </label>
              <div className="flex gap-2">
                {ACCOUNT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setNewType(t.value)}
                    className="flex-1 py-2.5 text-sm font-medium transition-all"
                    style={{
                      borderRadius: '12px',
                      background: newType === t.value
                        ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                        : 'var(--bg-hover)',
                      color: newType === t.value ? 'white' : 'var(--text-secondary)',
                      boxShadow: newType === t.value ? '0 4px 14px rgba(109,40,217,0.35)' : undefined,
                      border: newType === t.value ? 'none' : '1px solid var(--color-border)',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Starting Balance */}
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-faint)' }}>
                {newType === 'credit' ? 'Current Balance Owed' : 'Starting Balance'}
              </label>
              <div
                className="flex items-center px-3 rounded-xl"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span className="text-sm mr-1" style={{ color: 'var(--text-faint)' }}>$</span>
                <input
                  value={newBalance}
                  onChange={e => setNewBalance(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  min="0"
                  step="0.01"
                  className="flex-1 py-2.5 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--text-primary)' }}
                  onFocus={e => (e.currentTarget.parentElement!.style.border = '1px solid rgba(109,40,217,0.5)')}
                  onBlur={e => (e.currentTarget.parentElement!.style.border = '1px solid var(--color-border)')}
                />
              </div>
              {newType === 'credit' && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
                  Enter how much you currently owe.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 text-sm font-medium transition-all"
                style={{ borderRadius: '12px', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              >
                Cancel
              </button>
              <button
                onClick={handleAddAccount}
                disabled={!newName.trim()}
                className="flex-1 py-2.5 text-sm font-semibold transition-all active:scale-95"
                style={{
                  borderRadius: '12px',
                  background: newName.trim()
                    ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                    : 'var(--bg-hover)',
                  boxShadow: newName.trim() ? '0 4px 14px rgba(109,40,217,0.35)' : undefined,
                  color: newName.trim() ? 'white' : 'var(--text-faint)',
                  cursor: newName.trim() ? 'pointer' : 'not-allowed',
                }}
                onMouseEnter={e => { if (newName.trim()) e.currentTarget.style.boxShadow = '0 6px 20px rgba(109,40,217,0.5)' }}
                onMouseLeave={e => { if (newName.trim()) e.currentTarget.style.boxShadow = '0 4px 14px rgba(109,40,217,0.35)' }}
              >
                Add Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
