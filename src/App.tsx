import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Sidebar from './components/Sidebar'
import type { Account } from './components/Sidebar'
import BudgetHeader from './components/BudgetHeader'
import BudgetTable from './components/BudgetTable'
import InspectorPanel from './components/InspectorPanel'
import TransactionView from './components/TransactionView'
import CreditView from './components/CreditView'
import AllTransactionsView from './components/AllTransactionsView'
import BillsView from './components/BillsView'
import IncomeView from './components/IncomeView'
import LoginPage from './components/LoginPage'
import OnboardingModal from './components/OnboardingModal'
import { supabase } from './lib/supabase'
import { loadAll, seedSampleData, resetUserData, saveAccount, setAccountClosed, removeAccount, saveGroups, saveAssigned, saveTransaction, removeTransaction, saveBillGroups, saveProfile, saveGradientColors, loadProfile, syncCCPaymentGroup, deleteCategory, deleteCategoryGroup } from './lib/db'
import type { CategoryGroup, Transaction, CategoryPlan } from './data/mockData'
import { toMonthly, getNextPaymentDate } from './data/billData'
import type { BillGroup, BillFrequency } from './data/billData'
import type { Session } from '@supabase/supabase-js'

const MIN_WIDTH = 200
const MAX_WIDTH = 256
const DEFAULT_WIDTH = 256

function buildGradient(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const stops = colors.map((c, i) => `${c} ${Math.round(i / (colors.length - 1) * 100)}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

// Suppress browser extension autofill (1Password, LastPass, etc.) on all
// non-password inputs across the app. Runs once on mount via MutationObserver.
function useDisableAutofill() {
  useEffect(() => {
    const stamp = (el: Element) => {
      if (!(el instanceof HTMLInputElement)) return
      if (el.type === 'password') return
      el.setAttribute('autocomplete', 'off')
      el.setAttribute('data-1p-ignore', 'true')
      el.setAttribute('data-lpignore', 'true')
      el.setAttribute('data-form-type', 'other')
    }
    document.querySelectorAll('input').forEach(stamp)
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node instanceof Element) {
            stamp(node)
            node.querySelectorAll('input').forEach(stamp)
          }
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
}

const CC_GROUP_ID = 'cc-payments-group'
const CC_GROUP_NAME = 'Credit Card Payments'
const BILLS_GROUP_ID = 'bills-budget-group'
const BILLS_GROUP_NAME = 'Bills'

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
  useDisableAutofill()
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
  const [dataReady, setDataReady] = useState(false)
  const [billGroups, setBillGroups] = useState<BillGroup[]>([])
  const [appToast, setAppToast] = useState<{ title: string; subtitle: string } | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const pendingSaves = useRef(0)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const trackSave = useCallback((p: Promise<unknown>) => {
    pendingSaves.current += 1
    setSaveStatus('saving')
    p.finally(() => {
      pendingSaves.current -= 1
      if (pendingSaves.current === 0) {
        setSaveStatus('saved')
        if (savedTimer.current) clearTimeout(savedTimer.current)
        savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000)
      }
    })
  }, [])

  const billLinkedTxIds = useMemo(
    () => new Set(billGroups.flatMap(g => g.bills.flatMap(b => b.linkedTransactionId ? [b.linkedTransactionId] : []))),
    [billGroups]
  )

  // Keep a ref to billGroups so the tx→bill sync effect can read current state synchronously
  const billGroupsRef = useRef(billGroups)
  useEffect(() => { billGroupsRef.current = billGroups }, [billGroups])

  // When bills change, archive budget categories for deleted bills that have transactions
  const handleBillGroupsChange = (newGroups: BillGroup[]) => {
    const oldBillIds = new Set(billGroups.flatMap(g => g.bills.map(b => b.id)))
    const newBillIds = new Set(newGroups.flatMap(g => g.bills.map(b => b.id)))
    const deletedIds = [...oldBillIds].filter(id => !newBillIds.has(id))

    if (deletedIds.length > 0) {
      setBudgetGroups(prev => {
        let next = prev
        for (const deletedId of deletedIds) {
          const catId = `bill-category-${deletedId}`
          const billCat = prev.flatMap(g => g.categories).find(c => c.id === catId)
          if (billCat) {
            const hasTxs = transactions.some(t => t.category === billCat.name)
            if (hasTxs) {
              next = next.map(g => ({
                ...g,
                categories: g.categories.map(c => c.id === catId ? { ...c, archived: true } : c),
              }))
            }
          }
        }
        return next
      })
    }

    setBillGroups(newGroups)
  }

  // Auto-dismiss app-level toast
  useEffect(() => {
    if (!appToast) return
    const t = setTimeout(() => setAppToast(null), 4000)
    return () => clearTimeout(t)
  }, [appToast])

  // Update a single transaction by id (used by BillsView to sync bill changes → linked tx)
  const handleUpdateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map(tx => tx.id === id ? { ...tx, ...updates } : tx))
  }, [])

  // Transaction → Bill sync: when a linked transaction is edited or deleted, reflect it in the bill
  useEffect(() => {
    if (!dataReady) return
    // Use ref so we read current state synchronously — updater functions run async in React 18
    const currentBills = billGroupsRef.current
    let anyUpdated = false
    const nextBills = currentBills.map(g => ({
      ...g,
      bills: g.bills.map(b => {
        if (!b.linkedTransactionId) return b
        const tx = transactions.find(t => t.id === b.linkedTransactionId)
        if (!tx) {
          // Linked transaction was deleted — unlink so next save can create a fresh one
          anyUpdated = true
          return { ...b, linkedTransactionId: undefined }
        }
        if (tx.outflow === null) return b
        const parts = tx.date.split('/')
        const isoDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
        // Only amount and date are user-editable from the transaction side
        if (tx.outflow === b.amount && isoDate === b.dueDate) return b
        anyUpdated = true
        return { ...b, amount: tx.outflow, dueDate: isoDate }
      }),
    }))
    if (anyUpdated) {
      setBillGroups(nextBills)
      setAppToast({ title: 'Bill synced', subtitle: 'Transaction changes reflected in your bill' })
    }
  }, [transactions, dataReady])

  const [showOnboarding, setShowOnboarding] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [displayName, setDisplayName] = useState('')

  const isResizing = useRef(false)
  const userId = useRef<string | null>(null)
  const dataLoaded = useRef(false)
  // accountId → real DB categoryId for CC payment categories
  const ccCatIds = useRef<Map<string, string>>(new Map())

  // ── Load all data on mount ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false)
        return
      }
      userId.current = user.id
      try {
        const [data, profile] = await Promise.all([loadAll(user.id), loadProfile(user.id)])
        if (profile.displayName) setDisplayName(profile.displayName)
        if (profile.gradientColors) {
          setGradientColors(profile.gradientColors)
          localStorage.setItem('gradientColors', JSON.stringify(profile.gradientColors))
        }

        // Sync CC payment categories to DB — wrapped in its own try/catch so any
        // failure here never blocks the main data load from setting state
        const ccAccounts = data.accounts.filter(a => a.type === 'credit')
        if (ccAccounts.length > 0) {
          try {
            const ids = await syncCCPaymentGroup(user.id, ccAccounts)
            ids.forEach((catId, accId) => ccCatIds.current.set(accId, catId))
          } catch (e) {
            console.error('syncCCPaymentGroup failed — CC allocations will not persist:', e)
          }
        }

        // New user: no data and onboarding not previously completed → show choice screen
        const onboardingDone = !!localStorage.getItem(`onboarding_complete_${user.id}`)
        const isNewUser = data.budgetGroups.length === 0 && data.accounts.length === 0 && !onboardingDone
        if (isNewUser) {
          setShowOnboarding(true)
        } else {
          // Filter out the CC payment group — it's rebuilt synthetically from accounts
          setBudgetGroups(data.budgetGroups.filter(g => g.name !== 'Credit Card Payments'))
        }
        setAccounts(data.accounts)
        setTransactions(data.transactions)
        setClosedAccountIds(data.closedAccountIds)
        setMonthlyAssigned(data.monthlyAssigned)
        setBillGroups(data.billGroups)
      } catch (e) {
        console.error('Failed to load data:', e)
      } finally {
        dataLoaded.current = true
        setDataReady(true)
        setLoading(false)
      }
    }).catch(e => {
      console.error('Failed to get user:', e)
      setLoading(false)
    })
  }, [])

  // ── Onboarding: user chose placeholder data or clean slate ──────
  async function handleOnboardingChoice(withPlaceholder: boolean, name: string) {
    const uid = userId.current
    if (!uid) return
    if (withPlaceholder) {
      setShowOnboarding(false)
      setSeeding(true)
      try {
        await resetUserData(uid)  // clear any partial data from a previous failed attempt
        await seedSampleData(uid)
        // Save profile after seeding succeeds so resetUserData can't race-delete it
        if (name) {
          setDisplayName(name)
          await saveProfile(uid, name)
        }
        localStorage.setItem(`onboarding_complete_${uid}`, 'true')
        window.location.reload()
      } catch (err) {
        console.error('seedSampleData failed:', err)
        setSeeding(false)
        setShowOnboarding(true)
      }
      return
    }
    // Clean slate path — no reset, just record the name and proceed
    if (name) {
      setDisplayName(name)
      saveProfile(uid, name).catch(console.error)
    }
    localStorage.setItem(`onboarding_complete_${uid}`, 'true')
    setShowOnboarding(false)
  }

  // ── Reset all account data (keeps auth, wipes everything else) ──
  async function handleResetAccount() {
    const uid = userId.current
    if (!uid) return
    await resetUserData(uid)
    localStorage.removeItem(`onboarding_complete_${uid}`)
    await supabase.auth.signOut()
  }

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

    changed.forEach(tx => trackSave(saveTransaction(uid, tx, catNameToId).catch(console.error)))
    deleted.forEach(tx => trackSave(removeTransaction(tx.id).catch(console.error)))
    prevTransactions.current = curr
  }, [transactions])

  // ── Sync groups/categories to Supabase on change (debounced) ───
  const groupsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!dataLoaded.current || !userId.current) return
    const uid = userId.current
    if (groupsSaveTimer.current) clearTimeout(groupsSaveTimer.current)
    groupsSaveTimer.current = setTimeout(() => {
      // Filter out synthetic groups (CC payments, bills) — these have non-UUID IDs
      // and are derived from account/bill state, not stored directly in the DB.
      const persistableGroups = budgetGroups.filter(
        g => g.id !== CC_GROUP_ID && g.id !== BILLS_GROUP_ID
      )
      trackSave(saveGroups(uid, persistableGroups).catch(console.error))
    }, 600)
  }, [budgetGroups])

  // ── Sync bills to Supabase on change (debounced) ─────────────────
  const billsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!dataLoaded.current || !userId.current) return
    const uid = userId.current
    if (billsSaveTimer.current) clearTimeout(billsSaveTimer.current)
    billsSaveTimer.current = setTimeout(() => {
      trackSave(saveBillGroups(uid, billGroups).catch(console.error))
    }, 600)
  }, [billGroups])

  // ── Bills → Budget group sync ──────────────────────────────────
  // When bills change, keep the locked "Bills" budget group in sync.
  // Archived categories (from deleted bills that had transactions) are preserved.
  useEffect(() => {
    if (!dataReady) return
    const allBills = billGroups.flatMap(g => g.bills)
    setBudgetGroups(prev => {
      const existing = prev.find(g => g.id === BILLS_GROUP_ID)
      const archivedCats = existing?.categories.filter(c => c.archived) ?? []

      if (allBills.length === 0 && archivedCats.length === 0) {
        return existing ? prev.filter(g => g.id !== BILLS_GROUP_ID) : prev
      }

      const activeCats = allBills.map(bill => {
        const catId = `bill-category-${bill.id}`
        const found = existing?.categories.find(c => c.id === catId)
        const plan = { type: 'bill' as const, monthlyAmount: toMonthly(bill.amount, bill.frequency), goalDate: bill.dueDate, billFrequency: bill.frequency }
        return found
          ? { ...found, name: bill.name, emoji: bill.emoji, plan }
          : { id: catId, name: bill.name, emoji: bill.emoji, assigned: 0, activity: 0, available: 0, plan }
      })

      const desiredCats = [...activeCats, ...archivedCats]

      const alreadySynced = existing &&
        existing.categories.length === desiredCats.length &&
        desiredCats.every((c, i) => {
          const ec = existing.categories[i]
          return ec?.id === c.id && ec?.name === c.name && ec?.emoji === c.emoji &&
            JSON.stringify(ec?.plan) === JSON.stringify(c.plan)
        })
      if (alreadySynced) return prev

      const newGroup = { id: BILLS_GROUP_ID, name: BILLS_GROUP_NAME, categories: desiredCats }
      if (!existing) {
        const ccIdx = prev.findIndex(g => g.id === CC_GROUP_ID)
        const insertAt = ccIdx >= 0 ? ccIdx + 1 : 0
        const next = [...prev]
        next.splice(insertAt, 0, newGroup)
        return next
      }
      return prev.map(g => g.id === BILLS_GROUP_ID ? newGroup : g)
    })
  }, [billGroups, dataReady])

  // ── Auto-sync Credit Card Payment categories ───────────────────
  useEffect(() => {
    if (!dataLoaded.current || !userId.current) return
    const uid = userId.current
    const openCC = accounts.filter(a => a.type === 'credit' && !closedAccountIds.has(a.id))

    const rebuild = () => setBudgetGroups(prev => {
      const existing = prev.find(g => g.id === CC_GROUP_ID)
      if (openCC.length === 0) {
        return existing ? prev.filter(g => g.id !== CC_GROUP_ID) : prev
      }
      const desiredCats = openCC.map(a => {
        // Use the real DB UUID if available, fall back to synthetic ID
        const realId = ccCatIds.current.get(a.id) ?? `cc-payment-${a.id}`
        const found = existing?.categories.find(c => c.id === realId)
        return found ?? { id: realId, name: a.name, emoji: '💳', assigned: 0, activity: 0, available: 0 }
      })
      const alreadySynced = existing &&
        existing.categories.length === desiredCats.length &&
        desiredCats.every((c, i) => existing.categories[i]?.id === c.id && existing.categories[i]?.name === c.name)
      if (alreadySynced) return prev
      const newGroup = { id: CC_GROUP_ID, name: CC_GROUP_NAME, categories: desiredCats }
      return existing ? prev.map(g => g.id === CC_GROUP_ID ? newGroup : g) : [newGroup, ...prev]
    })

    // If any CC account doesn't have a real DB category yet (e.g. newly added), sync first
    const missing = openCC.filter(a => !ccCatIds.current.has(a.id))
    if (missing.length > 0) {
      syncCCPaymentGroup(uid, openCC).then(newIds => {
        newIds.forEach((catId, accId) => ccCatIds.current.set(accId, catId))
        rebuild()
      })
    } else {
      rebuild()
    }
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

  const onDeleteGroup = (groupId: string) => {
    const group = budgetGroups.find(g => g.id === groupId)
    if (!group) return
    setBudgetGroups(prev => prev.filter(g => g.id !== groupId))
    setMonthlyAssigned(prev => {
      const next = { ...prev }
      for (const mk of Object.keys(next)) {
        for (const cat of group.categories) {
          if (cat.id in next[mk]) { next[mk] = { ...next[mk] }; delete next[mk][cat.id] }
        }
      }
      return next
    })
    if (userId.current) trackSave(deleteCategoryGroup(groupId, group.categories.map(c => c.id)).catch(console.error))
  }

  const onRenameCategory = (catId: string, name: string) => {
    setTransactions(prev => prev.map(tx => {
      const cat = budgetGroups.flatMap(g => g.categories).find(c => c.id === catId)
      return cat && tx.category === cat.name ? { ...tx, category: name } : tx
    }))
    setBudgetGroups(prev => prev.map(g => ({
      ...g,
      categories: g.categories.map(c => c.id === catId ? { ...c, name } : c),
    })))
  }

  const onDeleteCategory = (catId: string) => {
    setBudgetGroups(prev =>
      prev.map(g => ({ ...g, categories: g.categories.filter(c => c.id !== catId) }))
    )
    setMonthlyAssigned(prev => {
      const next = { ...prev }
      for (const mk of Object.keys(next)) {
        if (catId in next[mk]) {
          next[mk] = { ...next[mk] }
          delete next[mk][catId]
        }
      }
      return next
    })
    setSelectedCategoryId(null)
    if (userId.current) trackSave(deleteCategory(catId).catch(console.error))
  }

  const onDebtPayoffChange = (catId: string, date: string | undefined) => {
    setBudgetGroups(prev => prev.map(g => ({
      ...g,
      categories: g.categories.map(c => c.id === catId ? { ...c, debtPayoffDate: date } : c),
    })))
  }

  // Undo/redo stacks for allocation changes (session-local, not persisted)
  const undoStack = useRef<typeof monthlyAssigned[]>([])
  const redoStack = useRef<typeof monthlyAssigned[]>([])

  const onAssignedChange = (catId: string, value: number) => {
    undoStack.current.push(monthlyAssigned)
    redoStack.current = []
    setMonthlyAssigned(prev => ({
      ...prev,
      [monthKey]: { ...prev[monthKey], [catId]: value },
    }))
    if (userId.current) trackSave(saveAssigned(userId.current, catId, monthKey, value).catch(console.error))
  }

  const undoAssigned = useCallback(() => {
    if (undoStack.current.length === 0) return
    const snapshot = undoStack.current.pop()!
    redoStack.current.push(monthlyAssigned)
    setMonthlyAssigned(snapshot)
  }, [monthlyAssigned])

  const redoAssigned = useCallback(() => {
    if (redoStack.current.length === 0) return
    const snapshot = redoStack.current.pop()!
    undoStack.current.push(monthlyAssigned)
    setMonthlyAssigned(snapshot)
  }, [monthlyAssigned])

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
    // Build map of CC payment category ID → account ID for special activity calculation.
    // Use real DB UUIDs from ccCatIds when available; fall back to synthetic IDs for
    // any accounts not yet synced (e.g. before the first syncCCPaymentGroup resolves).
    const ccPaymentMap = new Map<string, string>()
    accounts.filter(a => a.type === 'credit').forEach(a => {
      const realId = ccCatIds.current.get(a.id)
      ccPaymentMap.set(realId ?? `cc-payment-${a.id}`, a.id)
    })

    // Build sidebar account order for CC category sorting
    const accountOrder = new Map<string, number>()
    accounts.forEach((a, i) => accountOrder.set(a.id, i))

    // Pre-compute which regular category IDs are underfunding a CC this month
    const ccUnderfundedCatIds = new Set<string>()
    {
      const [curYear, curMonth] = monthKey.split('-').map(Number)
      for (const account of accounts.filter(a => a.type === 'credit')) {
        const purchasesByCategory = new Map<string, number>()
        for (const tx of transactions) {
          if (tx.accountId !== account.id || tx.outflow == null || tx.payee === 'Starting Balance' || !tx.category) continue
          const parts = tx.date.split('/')
          if (parseInt(parts[2]) !== curYear || parseInt(parts[0]) !== curMonth) continue
          purchasesByCategory.set(tx.category, (purchasesByCategory.get(tx.category) ?? 0) + tx.outflow)
        }
        for (const [catName, purchaseTotal] of purchasesByCategory) {
          for (const grp of budgetGroups) {
            if (grp.id === CC_GROUP_ID) continue
            const found = grp.categories.find(cat => cat.name === catName)
            if (found) {
              const allocated = monthlyAssigned[monthKey]?.[found.id] ?? 0
              if (allocated < purchaseTotal) ccUnderfundedCatIds.add(found.id)
              break
            }
          }
        }
      }
    }

    return budgetGroups.map(g => {
      const computedCats = g.categories.map(c => {
        let carryover = 0
        let assigned = 0
        let activity = 0
        let available = 0

        // CC-specific: computed across all time, captured during loop
        let ccFundingThisMonth: { categoryName: string; amount: number; total: number }[] = []
        let ccTotalStartingBalance = 0
        let ccMonthPurchases = 0   // total purchases this month (for fully-funded check)
        let ccMonthFunded = 0      // total funded this month
        if (ccPaymentMap.has(c.id)) {
          const accountId = ccPaymentMap.get(c.id)!
          ccTotalStartingBalance = transactions
            .filter(t => t.accountId === accountId && t.payee === 'Starting Balance' && t.outflow != null)
            .reduce((s, t) => s + (t.outflow ?? 0), 0)
        }

        for (const mk of monthSequence) {
          const [mkYear, mkMonth] = mk.split('-').map(Number)
          assigned = monthlyAssigned[mk]?.[c.id] ?? 0

          if (ccPaymentMap.has(c.id)) {
            // CC payment category
            const accountId = ccPaymentMap.get(c.id)!
            const ccTxs = transactions.filter(t => {
              if (t.accountId !== accountId) return false
              const parts = t.date.split('/')
              return parseInt(parts[2]) === mkYear && parseInt(parts[0]) === mkMonth
            })

            const totalPurchases = ccTxs
              .filter(t => t.outflow != null && t.payee !== 'Starting Balance')
              .reduce((s, t) => s + (t.outflow ?? 0), 0)

            const totalPayments = ccTxs
              .filter(t => t.inflow != null)
              .reduce((s, t) => s + (t.inflow ?? 0), 0)

            // Activity: only purchases (spending) — payments are not activity
            activity = -totalPurchases

            // Coverage: CC purchases backed by their category's allocation this month
            const purchasesByCategory = new Map<string, number>()
            for (const tx of ccTxs) {
              if (tx.outflow != null && tx.payee !== 'Starting Balance' && tx.category) {
                purchasesByCategory.set(tx.category, (purchasesByCategory.get(tx.category) ?? 0) + tx.outflow)
              }
            }
            let coverage = 0
            for (const [catName, purchaseTotal] of purchasesByCategory) {
              let catId: string | null = null
              for (const grp of budgetGroups) {
                if (grp.id === CC_GROUP_ID) continue
                const found = grp.categories.find(cat => cat.name === catName)
                if (found) { catId = found.id; break }
              }
              const catAllocated = catId ? (monthlyAssigned[mk]?.[catId] ?? 0) : 0
              const funded = Math.min(purchaseTotal, Math.max(0, catAllocated))
              coverage += funded
              if (mk === monthKey) {
                ccMonthPurchases += purchaseTotal
                ccMonthFunded += funded
                if (purchaseTotal > 0) ccFundingThisMonth.push({ categoryName: catName, amount: funded, total: purchaseTotal })
              }
            }

            // Available: money set aside to pay off the balance.
            // = carryover + manually assigned + funded purchases - payments made
            // Starting balance is NOT subtracted — it must be covered by manual assignment
            // (tracked separately for the inspector warning).
            available = carryover + assigned + coverage - totalPayments
            carryover = available
          } else {
            const catTxs = transactions.filter(t => {
              if (t.category !== c.name || t.payee === 'Starting Balance') return false
              const parts = t.date.split('/')
              return parseInt(parts[2]) === mkYear && parseInt(parts[0]) === mkMonth
            })
            activity = catTxs.reduce((sum, t) => sum + (t.inflow ?? 0) - (t.outflow ?? 0), 0)
            available = carryover + assigned + activity
            carryover = available
          }
        }

        // Plan status — drives color coding of the available column
        let planStatus: 'met' | 'over' | 'under' | undefined
        const plan = c.plan
        if (plan) {
          if (plan.type === 'build') {
            // Red until monthly amount is assigned, then green
            planStatus = assigned >= (plan.monthlyAmount ?? 0) ? 'met' : 'under'
          } else if (plan.type === 'spending') {
            const target = plan.monthlyAmount ?? 0
            const spending = Math.abs(activity) // activity is negative for outflows
            if (spending > target) {
              // Spent more than target — red
              planStatus = 'under'
            } else if (assigned > target) {
              // Over-allocated vs target — yellow caution
              planStatus = 'over'
            } else if (assigned >= target) {
              // Exactly the right amount allocated, spending within target — green
              planStatus = 'met'
            }
            // else: under-allocated, no spending yet — no color override
          } else if (plan.type === 'savings' && plan.goalAmount && plan.goalDate) {
            // Green once monthly needed amount is assigned
            const today = new Date()
            const goal = new Date(plan.goalDate)
            const monthsLeft = Math.max(1, (goal.getFullYear() - today.getFullYear()) * 12 + (goal.getMonth() - today.getMonth()))
            const needed = plan.goalAmount / monthsLeft
            planStatus = assigned >= needed ? 'met' : 'under'
          } else if (plan.type === 'bill') {
            const needed = plan.monthlyAmount ?? 0
            if (assigned >= needed) {
              planStatus = 'met'   // green — fully funded
            } else if (plan.goalDate && plan.billFrequency) {
              const nextDate = getNextPaymentDate(plan.goalDate, plan.billFrequency as BillFrequency)
              if (nextDate) {
                const today = new Date(); today.setHours(0, 0, 0, 0)
                const days = Math.round((nextDate.getTime() - today.getTime()) / 86400000)
                planStatus = days <= 3 ? 'under' : 'over'  // red if due ≤3 days, yellow otherwise
              } else {
                planStatus = 'over'
              }
            } else {
              planStatus = 'over'
            }
          }
        }

        // Attach CC-specific fields for inspector panel and activity popup
        const ccExtra = ccPaymentMap.has(c.id) ? (() => {
          const accountId = ccPaymentMap.get(c.id)!
          const ccTotalAssigned = Object.values(monthlyAssigned)
            .reduce((s, cats) => s + (cats[c.id] ?? 0), 0)
          const _appToday = new Date(); _appToday.setHours(0, 0, 0, 0)
          const isPastDate = (d: string) => { const [m, dy, y] = d.split('/'); return new Date(+y, +m - 1, +dy) <= _appToday }
          const ccAccountBalance = Math.abs(
            transactions
              .filter(t => t.accountId === accountId && isPastDate(t.date))
              .reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0)
          )
          // Debt payoff plan drives planStatus for CC categories
          if (c.debtPayoffDate) {
            const today = new Date()
            const payoff = new Date(c.debtPayoffDate + 'T00:00:00')
            const monthsLeft = Math.max(1, (payoff.getFullYear() - today.getFullYear()) * 12 + (payoff.getMonth() - today.getMonth()))
            const monthlyNeeded = ccAccountBalance / monthsLeft
            planStatus = assigned >= monthlyNeeded ? 'met' : 'under'
          }
          return {
            ccStartingBalance: ccTotalStartingBalance,
            ccStartingUncovered: Math.max(0, ccTotalStartingBalance - ccTotalAssigned),
            ccFunding: ccFundingThisMonth,
            ccFullyFunded: ccMonthPurchases === 0 || ccMonthFunded >= ccMonthPurchases,
            ccAccountBalance,
          }
        })() : {}

        return {
          ...c, assigned, activity, available, overspent: available < 0, planStatus, ...ccExtra,
          causingCCUnderfunding: !ccPaymentMap.has(c.id) && ccUnderfundedCatIds.has(c.id),
        }
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
  }, [budgetGroups, transactions, budgetMonth, monthlyAssigned, monthSequence, accounts, monthKey])

  const selectedCategory = budgetGroupsWithActivity.flatMap(g => g.categories).find(c => c.id === selectedCategoryId) ?? null

  const _cashToday = new Date(); _cashToday.setHours(0, 0, 0, 0)
  const isTxPast = (d: string) => { const [m, dy, y] = d.split('/'); return new Date(+y, +m - 1, +dy) <= _cashToday }
  const totalCash = accounts
    .filter(a => !closedAccountIds.has(a.id) && a.type !== 'credit')
    .reduce((sum, a) => sum + transactions.filter(t => t.accountId === a.id && isTxPast(t.date)).reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0), 0)

  // Sum assignments across all months up to and including current month
  // (not just the current month — otherwise navigating to a new month resets the balance)
  const totalAssigned = useMemo(() => {
    let total = 0
    for (const [mk, cats] of Object.entries(monthlyAssigned)) {
      const [mkY, mkM] = mk.split('-').map(Number)
      if (mkY < budgetMonth.year || (mkY === budgetMonth.year && mkM <= budgetMonth.month)) {
        total += Object.values(cats).reduce((s, v) => s + v, 0)
      }
    }
    return total
  }, [monthlyAssigned, budgetMonth])
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

  // Global undo/redo for allocation changes
  // Skip when focus is inside an input/textarea so native text editing shortcuts are unaffected
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoAssigned() }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redoAssigned() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [undoAssigned, redoAssigned])

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
      category: 'Money To Allocate',
      memo: '',
      outflow: isCredit ? Math.abs(balance) : null,
      inflow: isCredit ? null : balance,
      cleared: true,
    }
    setAccounts(prev => {
      const next = [...prev, account]
      if (userId.current) trackSave(saveAccount(userId.current, account, next.length - 1).catch(console.error))
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

  if (seeding) return (
    <div className="flex h-screen flex-col items-center justify-center gap-4" style={{ background: '#0f0d1a' }}>
      <div
        className="h-8 w-8 rounded-full border-2 border-transparent animate-spin"
        style={{ borderTopColor: '#6d28d9', borderRightColor: '#3b82f6' }}
      />
      <div className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>Setting up your budget…</div>
    </div>
  )

  if (showOnboarding) return (
    <OnboardingModal onChoice={handleOnboardingChoice} isDark={isDark} />
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
        onGradientChange={colors => {
          setGradientColors(colors)
          localStorage.setItem('gradientColors', JSON.stringify(colors))
          if (userId.current) trackSave(saveGradientColors(userId.current, colors).catch(console.error))
        }}
        width={sidebarWidth}
        selectedAccountId={selectedAccountId}
        onAccountSelect={setSelectedAccountId}
        onAddAccount={openModal}
        accounts={accounts}
        onAccountsChange={setAccounts}
        transactions={transactions}
        closedAccountIds={closedAccountIds}
        onResetAccount={handleResetAccount}
        displayName={displayName}
        onDisplayNameChange={name => {
          setDisplayName(name)
          if (userId.current) trackSave(saveProfile(userId.current, name).catch(console.error))
        }}
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
          {!selectedAccountId && activeView !== 'credit' && activeView !== 'all-transactions' && activeView !== 'bills' && activeView !== 'income' && (
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
                    if (userId.current) trackSave(setAccountClosed(id, true).catch(console.error))
                  }}
                  budgetGroups={budgetGroups}
                  gradientColors={gradientColors}
                  billLinkedTxIds={billLinkedTxIds}
                  onRenameAccount={(id, name) => {
                    setAccounts(prev => prev.map(a => a.id === id ? { ...a, name } : a))
                    if (userId.current) {
                      const updated = accounts.find(a => a.id === id)
                      if (updated) trackSave(saveAccount(userId.current, { ...updated, name }, accounts.findIndex(a => a.id === id)).catch(console.error))
                    }
                  }}
                  onDeleteAccount={id => {
                    setAccounts(prev => prev.filter(a => a.id !== id))
                    setClosedAccountIds(prev => { const n = new Set(prev); n.delete(id); return n })
                    setSelectedAccountId(null)
                    trackSave(removeAccount(id).catch(console.error))
                  }}
                />
              </div>
            ) : activeView === 'credit' ? (
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <CreditView
                  debtPayoffCards={budgetGroupsWithActivity
                    .flatMap(g => g.categories)
                    .filter(c => c.id.startsWith('cc-payment-') && !!c.debtPayoffDate)
                    .map(c => ({
                      categoryId: c.id,
                      name: c.name,
                      accountBalance: c.ccAccountBalance ?? 0,
                      available: c.available,
                      debtPayoffDate: c.debtPayoffDate!,
                    }))}
                />
              </div>
            ) : activeView === 'income' ? (
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <IncomeView
                  transactions={transactions}
                  accounts={accounts.filter(a => !closedAccountIds.has(a.id))}
                  gradientColors={gradientColors}
                />
              </div>
            ) : activeView === 'bills' ? (
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <BillsView
                  billGroups={billGroups}
                  onBillGroupsChange={handleBillGroupsChange}
                  onCreateTransaction={tx => setTransactions(prev => [...prev, tx])}
                  onUpdateTransaction={handleUpdateTransaction}
                  accounts={accounts.filter(a => !closedAccountIds.has(a.id))}
                  gradientColors={gradientColors}
                />
              </div>
            ) : activeView === 'all-transactions' ? (
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <AllTransactionsView
                  accounts={accounts.filter(a => !closedAccountIds.has(a.id))}
                  transactions={transactions}
                  onTransactionsChange={setTransactions}
                  budgetGroups={budgetGroups}
                  gradientColors={gradientColors}
                  billLinkedTxIds={billLinkedTxIds}
                />
              </div>
            ) : (
              <>
                <BudgetTable
                  selectedId={selectedCategoryId}
                  onSelect={id => setSelectedCategoryId(prev => prev === id ? null : id)}
                  groups={budgetGroupsWithActivity}
                  onGroupsChange={setBudgetGroups}
                  onDeleteGroup={onDeleteGroup}
                  onAssignedChange={onAssignedChange}
                  ccGroupId={CC_GROUP_ID}
                  billsGroupId={BILLS_GROUP_ID}
                  transactions={transactions}
                  budgetMonth={budgetMonth}
                />
                <InspectorPanel category={selectedCategory} onPlanChange={onPlanChange} onAssignedChange={onAssignedChange} onDebtPayoffChange={onDebtPayoffChange} onDeleteCategory={onDeleteCategory} onRenameCategory={onRenameCategory} monthlyAssigned={monthlyAssigned} budgetMonth={budgetMonth} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Save indicator — bottom-right corner */}
      {saveStatus !== 'idle' && createPortal(
        <div
          style={{
            position: 'fixed',
            bottom: '16px',
            right: '16px',
            zIndex: 9998,
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            background: 'var(--bg-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.2s',
          }}
        >
          {saveStatus === 'saving' ? (
            <div
              className="animate-spin"
              style={{
                width: '13px',
                height: '13px',
                borderRadius: '50%',
                border: '2px solid rgba(109,40,217,0.25)',
                borderTopColor: '#a78bfa',
              }}
            />
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 5.5l3 3 5-5" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>,
        document.body
      )}

      {/* App-level toast — transaction→bill sync notification */}
      {appToast && createPortal(
        <div
          className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--bg-surface)',
            border: '1px solid rgba(96,165,250,0.4)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            minWidth: '280px',
            maxWidth: '360px',
          }}
        >
          <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.3)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7l3.5 3.5L12 3" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{appToast.title}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{appToast.subtitle}</p>
          </div>
          <button
            onClick={() => setAppToast(null)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-sm transition-all"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >✕</button>
        </div>,
        document.body
      )}

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
