import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Transaction, CategoryGroup, RepeatInterval } from '../data/mockData'
import type { Account } from './Sidebar'

const parseDate = (s: string): Date => { const [m, d, y] = s.split('/'); return new Date(+y, +m - 1, +d) }
const fmtDate = (d: Date): string => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

function nextFutureDate(from: Date, interval: RepeatInterval): Date {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let d = new Date(from)
  do {
    switch (interval) {
      case 'daily':     d.setDate(d.getDate() + 1); break
      case 'weekly':    d.setDate(d.getDate() + 7); break
      case 'monthly':   d.setMonth(d.getMonth() + 1); break
      case 'quarterly': d.setMonth(d.getMonth() + 3); break
      case 'yearly':    d.setFullYear(d.getFullYear() + 1); break
    }
  } while (d <= today)
  return d
}

const REPEAT_OPTIONS: { value: RepeatInterval | null; label: string }[] = [
  { value: null,        label: 'None'      },
  { value: 'daily',     label: 'Daily'     },
  { value: 'weekly',    label: 'Weekly'    },
  { value: 'monthly',   label: 'Monthly'   },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly'    },
]

interface AllTransactionsViewProps {
  accounts: Account[]
  transactions: Transaction[]
  onTransactionsChange: (txs: Transaction[]) => void
  budgetGroups: CategoryGroup[]
  gradientColors: string[]
  billLinkedTxIds: Set<string>
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export default function AllTransactionsView({ accounts, transactions, onTransactionsChange, budgetGroups, gradientColors, billLinkedTxIds }: AllTransactionsViewProps) {
  const gradient = gradientColors.length === 1
    ? gradientColors[0]
    : `linear-gradient(135deg, ${gradientColors.join(', ')})`

  const allCategories = [
    { group: 'Inflow', items: ['Money To Allocate'] },
    ...budgetGroups
      .filter(g => g.name !== 'Credit Card Payments')
      .map(g => ({ group: g.name, items: g.categories.map(c => c.name) })),
  ]

  const categoryLabel = (catName: string | null | undefined): string => {
    if (!catName) return ''
    for (const grp of allCategories) {
      if (grp.items.includes(catName)) {
        if (grp.group === 'Inflow') return catName
        return `${grp.group}  /  ${catName}`
      }
    }
    return catName
  }

  const txList = transactions
  const setTxList = (updater: Transaction[] | ((prev: Transaction[]) => Transaction[])) => {
    if (typeof updater === 'function') {
      onTransactionsChange(updater(txList))
    } else {
      onTransactionsChange(updater)
    }
  }

  const firstAccountId = accounts[0]?.id ?? ''

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Transaction>>({})
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [editCategory, setEditCategory] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [calViewDate, setCalViewDate] = useState(new Date())
  const [balanceTab, setBalanceTab] = useState<'cleared' | 'uncleared' | 'working'>('working')
  const [search, setSearch] = useState('')
  const [deleteWarning, setDeleteWarning] = useState(false)
  const categoryPickerRef = useRef<HTMLDivElement>(null)
  const categoryPortalRef = useRef<HTMLDivElement>(null)
  const categoryBtnRef = useRef<HTMLButtonElement>(null)
  const [categoryPickerPos, setCategoryPickerPos] = useState<{ top: number; left: number } | null>(null)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Transaction[][]>([])
  const futureRef  = useRef<Transaction[][]>([])

  const kbRef = useRef({ undo: () => {}, redo: () => {}, del: () => {} })

  const pushHistory = () => {
    historyRef.current = [...historyRef.current.slice(-49), [...txList]]
    futureRef.current  = []
  }

  const handleUndo = () => {
    if (!historyRef.current.length) return
    const prev = historyRef.current[historyRef.current.length - 1]
    futureRef.current  = [[...txList], ...futureRef.current.slice(0, 49)]
    historyRef.current = historyRef.current.slice(0, -1)
    onTransactionsChange(prev)
  }

  const handleRedo = () => {
    if (!futureRef.current.length) return
    const next = futureRef.current[0]
    historyRef.current = [...historyRef.current.slice(-49), [...txList]]
    futureRef.current  = futureRef.current.slice(1)
    onTransactionsChange(next)
  }

  kbRef.current = {
    undo: handleUndo,
    redo: handleRedo,
    del:  () => { if (checkedIds.size > 0 && !selectedId) confirmDelete() },
  }

  // Stable global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = (e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') || e.target instanceof HTMLTextAreaElement
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); kbRef.current.undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); kbRef.current.redo() }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) kbRef.current.del()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId) {
        if (showDatePicker) { setShowDatePicker(false); return }
        handleCancel()
      }
      if (e.key === 'Enter' && selectedId && !showCategoryPicker && !showDatePicker) handleSave()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedId, pendingId, showCategoryPicker, showDatePicker])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setShowDatePicker(false)
      }
    }
    if (showDatePicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDatePicker])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const inBtn = categoryPickerRef.current?.contains(e.target as Node)
      const inPortal = categoryPortalRef.current?.contains(e.target as Node)
      if (!inBtn && !inPortal) setShowCategoryPicker(false)
    }
    if (showCategoryPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCategoryPicker])

  const clearedBalance = txList.filter(t => t.cleared).reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0)
  const unclearedBalance = txList.filter(t => !t.cleared).reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0)
  const workingBalance = clearedBalance + unclearedBalance

  const balanceTabs = [
    { key: 'cleared' as const,   label: 'Cleared Balance',   value: clearedBalance   },
    { key: 'uncleared' as const, label: 'Uncleared Balance', value: unclearedBalance },
    { key: 'working' as const,   label: 'Net Worth',         value: workingBalance   },
  ]

  const toggleCleared = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setTxList(prev => prev.map(t => (t.id === id && !t.reconciled) ? { ...t, cleared: !t.cleared } : t))
  }

  const toggleChecked = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const openEdit = (id: string) => {
    const tx = txList.find(t => t.id === id)
    if (tx) setEditDraft({ ...tx })
    setSelectedId(id)
  }

  const handleCancel = () => {
    if (pendingId) {
      setTxList(prev => prev.filter(t => t.id !== pendingId))
      setPendingId(null)
    }
    setEditDraft({})
    setSelectedId(null)
    setShowDatePicker(false)
  }

  const handleSave = () => {
    if (selectedId && Object.keys(editDraft).length > 0) {
      pushHistory()
      setTxList(prev => {
        const updated = prev.map(t => t.id === selectedId ? { ...t, ...editDraft } : t)
        const saved = updated.find(t => t.id === selectedId)
        if (saved?.repeat) {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const txDate = parseDate(saved.date)
          if (txDate <= today) {
            const nextDate = nextFutureDate(txDate, saved.repeat)
            const nextStr = fmtDate(nextDate)
            const duplicate = updated.some(t =>
              t.id !== saved.id && t.accountId === saved.accountId &&
              t.payee === saved.payee && t.date === nextStr
            )
            if (!duplicate) {
              return [...updated, { ...saved, id: crypto.randomUUID(), date: nextStr, cleared: false, reconciled: false }]
            }
          }
        }
        return updated
      })
    }
    setPendingId(null)
    setEditDraft({})
    setSelectedId(null)
    setShowDatePicker(false)
  }

  const addTransaction = () => {
    pushHistory()
    if (pendingId) setTxList(prev => prev.filter(t => t.id !== pendingId))
    const newTx: Transaction = {
      id: crypto.randomUUID(),
      accountId: firstAccountId,
      date: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
      payee: '',
      category: null,
      memo: '',
      outflow: null,
      inflow: null,
      cleared: false,
    }
    setTxList(prev => [newTx, ...prev])
    setEditDraft({ ...newTx })
    setSelectedId(newTx.id)
    setPendingId(newTx.id)
  }

  const handleRowClick = (id: string) => {
    if (id === selectedId) {
      if (pendingId === id) handleCancel()
      else { setEditDraft({}); setSelectedId(null) }
      return
    }
    if (pendingId) {
      setTxList(prev => prev.filter(t => t.id !== pendingId))
      setPendingId(null)
    }
    openEdit(id)
  }

  const confirmDelete = () => {
    const hasCleared = txList.some(t => checkedIds.has(t.id) && t.cleared)
    if (hasCleared) {
      setDeleteWarning(true)
    } else {
      doDelete()
    }
  }

  const doDelete = () => {
    pushHistory()
    setTxList(prev => prev.filter(t => !checkedIds.has(t.id)))
    setCheckedIds(new Set())
    setDeleteWarning(false)
    setSelectedId(null)
  }

  const q = search.toLowerCase()
  const visibleTx = txList
    .filter(t => {
      if (!q) return true
      const accountName = accounts.find(a => a.id === t.accountId)?.name ?? ''
      return (
        t.payee.toLowerCase().includes(q) ||
        (t.category ?? '').toLowerCase().includes(q) ||
        t.memo.toLowerCase().includes(q) ||
        (t.outflow != null && t.outflow.toFixed(2).includes(q)) ||
        (t.inflow != null && t.inflow.toFixed(2).includes(q)) ||
        t.date.includes(q) ||
        accountName.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (a.payee === 'Starting Balance') return 1
      if (b.payee === 'Starting Balance') return -1
      const pd = (s: string) => { const p = s.split('/'); return p.length === 3 ? new Date(+p[2], +p[0]-1, +p[1]) : new Date(s) }
      const today = new Date(); today.setHours(0,0,0,0)
      const aFuture = pd(a.date) > today
      const bFuture = pd(b.date) > today
      if (aFuture !== bFuture) return aFuture ? -1 : 1
      return pd(b.date).getTime() - pd(a.date).getTime()
    })

  const selectedTx = txList.find(t => t.id === selectedId)
  const hasChecked = checkedIds.size > 0

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--bg-main)' }}>

      {/* Delete warning modal */}
      {deleteWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div
            className="rounded-2xl p-6 max-w-sm w-full mx-4"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(251,191,36,0.3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Delete cleared transactions?
              </h2>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              {checkedIds.size === 1
                ? 'This transaction has already been cleared. Deleting it may affect your reconciled balance.'
                : `${[...checkedIds].filter(id => txList.find(t => t.id === id)?.cleared).length} of the selected transactions have been cleared. Deleting them may affect your reconciled balance.`}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteWarning(false)}
                className="px-4 py-2 text-sm font-medium transition-all"
                style={{ borderRadius: '10px', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                className="px-4 py-2 text-sm font-semibold transition-all active:scale-95"
                style={{
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  boxShadow: '0 4px 14px rgba(220,38,38,0.35)',
                  color: 'white',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(220,38,38,0.5)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 14px rgba(220,38,38,0.35)')}
              >
                Delete anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex-shrink-0 px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--bg-surface)' }}
      >
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            All Transactions
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(109,40,217,0.12)', color: '#a78bfa', border: '1px solid rgba(109,40,217,0.2)' }}>
            {accounts.length} account{accounts.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--bg-hover)' }}>
          {balanceTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setBalanceTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2 text-sm transition-all"
              style={{
                borderRadius: '10px',
                background: balanceTab === tab.key ? 'var(--bg-main)' : 'transparent',
                color: balanceTab === tab.key ? 'var(--text-primary)' : 'var(--text-faint)',
                boxShadow: balanceTab === tab.key ? '0 1px 4px rgba(0,0,0,0.2)' : undefined,
                fontWeight: balanceTab === tab.key ? 600 : 400,
              }}
            >
              {tab.key === 'cleared' && <span className="text-emerald-400 text-xs">●</span>}
              {tab.key === 'uncleared' && <span className="text-xs" style={{ color: 'var(--text-faint)' }}>○</span>}
              {tab.label}
              <span className="font-semibold" style={{ color: tab.value < 0 ? '#f87171' : tab.key === 'working' && balanceTab === 'working' ? '#34d399' : 'inherit' }}>
                {fmt(tab.value)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div
        className="flex-shrink-0 flex items-center gap-2 px-6 py-3"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--bg-surface)' }}
      >
        <button
          onClick={addTransaction}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-all active:scale-95"
          style={{
            borderRadius: '12px',
            background: gradient,
            color: 'white',
          }}
        >
          <span className="text-base leading-none">+</span>
          Add Transaction
        </button>

        <div className="w-px h-5 mx-1" style={{ background: 'var(--color-border)' }} />

        <button
          onClick={handleUndo}
          className="px-3 py-2 text-sm transition-all"
          style={{ borderRadius: '10px', color: 'var(--text-faint)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ↩ Undo
        </button>
        <button
          onClick={handleRedo}
          className="px-3 py-2 text-sm transition-all"
          style={{ borderRadius: '10px', color: 'var(--text-faint)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ↪ Redo
        </button>

        <div className="flex-1" />

        {hasChecked && (
          <button
            onClick={confirmDelete}
            title={`Delete ${checkedIds.size} transaction${checkedIds.size > 1 ? 's' : ''}`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-all active:scale-95"
            style={{
              borderRadius: '10px',
              background: 'rgba(220,38,38,0.12)',
              color: '#f87171',
              border: '1px solid rgba(220,38,38,0.25)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.22)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.12)')}
          >
            🗑 {checkedIds.size > 1 && <span>{checkedIds.size}</span>}
          </button>
        )}

        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            borderRadius: '12px',
            background: 'var(--bg-hover)',
            border: '1px solid var(--color-border)',
            minWidth: '200px',
          }}
        >
          <span className="text-sm" style={{ color: 'var(--text-faint)' }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search all transactions…"
            className="bg-transparent text-sm outline-none flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ color: 'var(--text-faint)', lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--color-border)' }}>
              <th className="w-8 px-3 py-2" />
              {['DATE', 'PAYEE', 'ACCOUNT', 'CATEGORY', 'MEMO', 'OUTFLOW', 'INFLOW'].map(col => (
                <th
                  key={col}
                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--text-faint)' }}
                >
                  {col}
                </th>
              ))}
              <th className="w-10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>●</th>
            </tr>
          </thead>
          <tbody>
            {visibleTx.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-sm" style={{ color: 'var(--text-faint)' }}>
                  {search ? `No transactions match "${search}"` : 'No transactions yet'}
                </td>
              </tr>
            )}
            {visibleTx.map(tx => {
              const isSelected = selectedId === tx.id
              const isBillLinked = billLinkedTxIds.has(tx.id)
              const isChecked = checkedIds.has(tx.id)
              const isReconciled = !!tx.reconciled
              const txParts = tx.date.split('/')
              const txDate = txParts.length === 3 ? new Date(+txParts[2], +txParts[0]-1, +txParts[1]) : new Date(tx.date)
              const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
              const isFuture = txDate > todayMidnight && tx.payee !== 'Starting Balance'
              const accountName = accounts.find(a => a.id === tx.accountId)?.name ?? '—'

              return (
                <tr
                  key={tx.id}
                  onClick={() => handleRowClick(tx.id)}
                  className="cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    opacity: isReconciled ? 0.55 : 1,
                    background: isSelected
                      ? 'rgba(109,40,217,0.12)'
                      : isChecked
                      ? 'rgba(109,40,217,0.07)'
                      : isFuture
                      ? 'rgba(56,189,248,0.05)'
                      : undefined,
                  }}
                  onMouseEnter={e => { if (!isSelected && !isChecked) e.currentTarget.style.background = isFuture ? 'rgba(56,189,248,0.1)' : 'var(--bg-hover)' }}
                  onMouseLeave={e => { if (!isSelected && !isChecked) e.currentTarget.style.background = isFuture ? 'rgba(56,189,248,0.05)' : '' }}
                >
                  {/* Checkbox */}
                  <td className="px-3 py-1.5 text-center" onClick={e => toggleChecked(tx.id, e)}>
                    <input
                      type="checkbox"
                      readOnly
                      checked={isChecked}
                      className="accent-violet-500 w-3.5 h-3.5 cursor-pointer"
                    />
                  </td>

                  {/* DATE */}
                  <td className="px-3 py-1.5">
                    {isSelected ? (
                      <div className="relative" ref={datePickerRef} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            const parts = editDraft.date?.split('/')
                            const base = parts?.length === 3
                              ? new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, 1)
                              : new Date()
                            setCalViewDate(base)
                            setShowDatePicker(p => !p)
                          }}
                          className="px-2 py-1 text-sm rounded-lg w-28 text-left transition-all"
                          style={{
                            background: showDatePicker ? 'rgba(109,40,217,0.25)' : 'var(--bg-hover-strong)',
                            border: '1px solid rgba(109,40,217,0.4)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {editDraft.date ?? ''}
                        </button>

                        {showDatePicker && (() => {
                          const calYear = calViewDate.getFullYear()
                          const calMonth = calViewDate.getMonth()
                          const firstDay = new Date(calYear, calMonth, 1).getDay()
                          const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
                          const monthName = calViewDate.toLocaleString('default', { month: 'long' })
                          const today = new Date()
                          const selParts = editDraft.date?.split('/')
                          const selDay   = selParts?.length === 3 ? parseInt(selParts[1]) : -1
                          const selMonth = selParts?.length === 3 ? parseInt(selParts[0]) - 1 : -1
                          const selYear  = selParts?.length === 3 ? parseInt(selParts[2]) : -1

                          return (
                            <div
                              className="absolute left-0 top-full mt-1 z-50 rounded-2xl p-3 select-none"
                              style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid rgba(109,40,217,0.3)',
                                boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
                                minWidth: '256px',
                              }}
                            >
                              <div className="flex items-center justify-between mb-3 px-1">
                                <button
                                  onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all"
                                  style={{ color: 'var(--text-secondary)' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >‹</button>
                                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                                  {monthName} {calYear}
                                </span>
                                <button
                                  onClick={() => setCalViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all"
                                  style={{ color: 'var(--text-secondary)' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >›</button>
                              </div>

                              <div className="grid grid-cols-7 mb-1">
                                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                                  <div key={d} className="text-center text-xs font-medium py-1" style={{ color: 'var(--text-faint)' }}>{d}</div>
                                ))}
                              </div>

                              <div className="grid grid-cols-7 gap-0.5">
                                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                  const isToday = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear
                                  const isSel   = selDay === day && selMonth === calMonth && selYear === calYear
                                  return (
                                    <button
                                      key={day}
                                      onClick={() => {
                                        const d = new Date(calYear, calMonth, day)
                                        setEditDraft(prev => ({
                                          ...prev,
                                          date: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
                                        }))
                                        setShowDatePicker(false)
                                      }}
                                      className="text-xs h-8 w-full flex items-center justify-center rounded-lg transition-all"
                                      style={{
                                        background: isSel
                                          ? 'linear-gradient(135deg, #7c3aed, #2563eb)'
                                          : 'transparent',
                                        color: isSel ? 'white' : isToday ? '#a78bfa' : 'var(--text-primary)',
                                        fontWeight: isSel || isToday ? 600 : 400,
                                        border: isToday && !isSel ? '1px solid rgba(167,139,250,0.4)' : '1px solid transparent',
                                        boxShadow: isSel ? '0 2px 8px rgba(109,40,217,0.4)' : undefined,
                                      }}
                                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-hover-strong)' }}
                                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
                                    >
                                      {day}
                                    </button>
                                  )
                                })}
                              </div>

                              <div className="mt-2 pt-2 flex justify-center" style={{ borderTop: '1px solid var(--color-border)' }}>
                                <button
                                  onClick={() => {
                                    const d = new Date()
                                    setEditDraft(prev => ({
                                      ...prev,
                                      date: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
                                    }))
                                    setShowDatePicker(false)
                                  }}
                                  className="text-xs px-3 py-1.5 rounded-lg transition-all font-medium"
                                  style={{ color: '#a78bfa' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.1)')}
                                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                >
                                  Today
                                </button>
                              </div>

                              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                                <p className="text-xs font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--text-faint)' }}>
                                  Repeat
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {REPEAT_OPTIONS.map(({ value, label }) => {
                                    const active = (editDraft.repeat ?? null) === value
                                    return (
                                      <button
                                        key={label}
                                        onClick={() => setEditDraft(prev => ({ ...prev, repeat: value ?? undefined }))}
                                        className="px-2.5 py-1 text-xs rounded-lg font-medium transition-all"
                                        style={{
                                          background: active ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'var(--bg-hover)',
                                          color: active ? 'white' : 'var(--text-secondary)',
                                          border: active ? 'none' : '1px solid var(--color-border)',
                                          boxShadow: active ? '0 2px 8px rgba(109,40,217,0.35)' : undefined,
                                        }}
                                        onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover-strong)' }}
                                        onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
                                      >
                                        {label}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    ) : (
                      <div>
                        <span className="text-sm font-medium" style={{ color: isFuture ? '#38bdf8' : 'var(--text-secondary)' }}>{tx.date}</span>
                        {tx.repeat && (
                          <div className="text-xs mt-0.5 font-medium" style={{ color: 'rgba(167,139,250,0.7)' }}>
                            ↻ {tx.repeat}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* PAYEE */}
                  <td className="px-3 py-1.5 max-w-[160px]">
                    {isSelected ? (
                      <input
                        value={editDraft.payee ?? ''}
                        onChange={e => setEditDraft(d => ({ ...d, payee: e.target.value }))}
                        placeholder="Payee"
                        onClick={e => e.stopPropagation()}
                        className="px-2 py-1 text-sm rounded-lg outline-none w-full"
                        style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.4)', color: 'var(--text-primary)' }}
                      />
                    ) : (
                      <span className="text-sm font-medium truncate block" style={{ color: 'var(--text-primary)' }}>
                        {tx.payee || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </span>
                    )}
                  </td>

                  {/* ACCOUNT */}
                  <td className="px-3 py-1.5 max-w-[140px]">
                    {isSelected ? (
                      <select
                        value={editDraft.accountId ?? ''}
                        onChange={e => setEditDraft(d => ({ ...d, accountId: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        className="px-2 py-1 text-sm rounded-lg outline-none w-full"
                        style={{
                          background: 'var(--bg-hover-strong)',
                          border: '1px solid rgba(109,40,217,0.4)',
                          color: 'var(--text-primary)',
                          appearance: 'none',
                          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: 'right 8px center',
                          paddingRight: '24px',
                        }}
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id} style={{ background: '#1a1625' }}>{a.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm truncate block" style={{ color: 'var(--text-secondary)' }}>{accountName}</span>
                    )}
                  </td>

                  {/* CATEGORY */}
                  <td className="px-3 py-1.5 max-w-[180px]">
                    {isSelected ? (
                      isBillLinked ? (
                        // Bill-linked: category is locked, show as read-only badge
                        <div
                          className="flex items-center gap-1.5 px-2 py-1 text-sm rounded-lg"
                          style={{
                            background: 'rgba(96,165,250,0.1)',
                            border: '1px solid rgba(96,165,250,0.3)',
                            color: '#60a5fa',
                            minWidth: '160px',
                            cursor: 'default',
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M23 4v6h-6" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          <span className="flex-1 truncate text-xs">{editDraft.category ? categoryLabel(editDraft.category) : '—'}</span>
                        </div>
                      ) : (
                        <div ref={categoryPickerRef} onClick={e => e.stopPropagation()}>
                          <button
                            ref={categoryBtnRef}
                            onClick={() => {
                              setEditCategory(editDraft.category ?? '')
                              if (!showCategoryPicker && categoryBtnRef.current) {
                                const r = categoryBtnRef.current.getBoundingClientRect()
                                setCategoryPickerPos({ top: r.bottom + 4, left: r.left })
                              }
                              setShowCategoryPicker(p => !p)
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 text-sm rounded-lg w-full text-left"
                            style={{
                              background: 'var(--bg-hover-strong)',
                              border: '1px solid rgba(109,40,217,0.4)',
                              color: editDraft.category ? 'var(--text-primary)' : 'var(--text-faint)',
                              minWidth: '140px',
                            }}
                          >
                            <span className="flex-1 truncate">{editDraft.category ? categoryLabel(editDraft.category) : 'Pick a category…'}</span>
                            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>▾</span>
                          </button>
                        </div>
                      )
                    ) : tx.category ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm truncate" style={{ color: 'var(--text-secondary)' }}>{categoryLabel(tx.category)}</span>
                        {isBillLinked && (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                            <path d="M23 4v6h-6" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    ) : (
                      <span
                        className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg"
                        style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                      >
                        Needs a category
                      </span>
                    )}
                  </td>

                  {/* MEMO */}
                  <td className="px-3 py-1.5 max-w-[140px]">
                    {isSelected ? (
                      <input
                        value={editDraft.memo ?? ''}
                        onChange={e => setEditDraft(d => ({ ...d, memo: e.target.value }))}
                        placeholder="memo"
                        onClick={e => e.stopPropagation()}
                        className="px-2 py-1 text-sm rounded-lg outline-none w-full"
                        style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.4)', color: 'var(--text-primary)' }}
                      />
                    ) : (
                      <span className="text-sm truncate block" style={{ color: 'var(--text-faint)' }}>{tx.memo}</span>
                    )}
                  </td>

                  {/* OUTFLOW */}
                  <td className="px-3 py-1.5 text-right">
                    {isSelected ? (
                      <input
                        value={editDraft.outflow != null ? editDraft.outflow : ''}
                        onChange={e => {
                          const v = e.target.value
                          setEditDraft(d => ({ ...d, outflow: v === '' ? null : parseFloat(v) || 0 }))
                        }}
                        placeholder="0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        onClick={e => e.stopPropagation()}
                        className="px-2 py-1 text-sm rounded-lg outline-none w-24 text-right"
                        style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.4)', color: 'var(--text-primary)' }}
                      />
                    ) : tx.outflow != null ? (
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fmt(tx.outflow)}</span>
                    ) : null}
                  </td>

                  {/* INFLOW */}
                  <td className="px-3 py-1.5 text-right">
                    {isSelected ? (
                      <input
                        value={editDraft.inflow != null ? editDraft.inflow : ''}
                        onChange={e => {
                          const v = e.target.value
                          setEditDraft(d => ({ ...d, inflow: v === '' ? null : parseFloat(v) || 0 }))
                        }}
                        placeholder="0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        onClick={e => e.stopPropagation()}
                        className="px-2 py-1 text-sm rounded-lg outline-none w-24 text-right"
                        style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.4)', color: 'var(--text-primary)' }}
                      />
                    ) : tx.inflow != null ? (
                      <span className="text-sm font-medium" style={{ color: '#34d399' }}>{fmt(tx.inflow)}</span>
                    ) : null}
                  </td>

                  {/* Cleared / Reconciled toggle */}
                  <td className="px-3 py-1.5 text-center">
                    {isReconciled ? (
                      <span title="Reconciled — locked" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </span>
                    ) : (
                      <button
                        onClick={e => toggleCleared(tx.id, e)}
                        title={tx.cleared ? 'Mark as uncleared' : 'Mark as cleared'}
                        className="transition-all hover:scale-125"
                        style={{
                          fontSize: '16px',
                          lineHeight: 1,
                          color: tx.cleared ? '#34d399' : 'transparent',
                          WebkitTextStroke: tx.cleared ? undefined : '1.5px var(--text-faint)',
                        }}
                      >
                        ●
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Action bar when row selected */}
        {selectedTx && (
          <div
            className="sticky bottom-0 flex items-center justify-end gap-2 px-6 py-3"
            style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--color-border)' }}
          >
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium transition-all"
              style={{ borderRadius: '10px', background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-sm font-semibold transition-all active:scale-95"
              style={{
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #7c3aed, #2563eb)',
                boxShadow: '0 4px 14px rgba(109,40,217,0.35)',
                color: 'white',
              }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 20px rgba(109,40,217,0.5)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 14px rgba(109,40,217,0.35)')}
            >
              Save
            </button>
          </div>
        )}
      </div>

      {/* Category picker portal */}
      {showCategoryPicker && categoryPickerPos && createPortal(
        <CategoryPicker
          value={editCategory}
          pos={categoryPickerPos}
          portalRef={categoryPortalRef}
          categories={allCategories}
          onSelect={val => {
            setEditCategory(val)
            setEditDraft(d => ({ ...d, category: val }))
            setShowCategoryPicker(false)
          }}
        />,
        document.body
      )}
    </div>
  )
}

function CategoryPicker({ value, onSelect, categories, pos, portalRef }: { value: string; onSelect: (v: string) => void; categories: { group: string; items: string[] }[]; pos: { top: number; left: number }; portalRef: React.RefObject<HTMLDivElement | null> }) {
  const [search, setSearch] = useState('')

  const filtered = categories
    .map(g => ({ ...g, items: g.items.filter(item => item.toLowerCase().includes(search.toLowerCase())) }))
    .filter(g => g.items.length > 0)

  return (
    <div
      ref={portalRef}
      className="z-[9999] rounded-2xl overflow-hidden"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: '260px',
        background: 'var(--bg-surface)',
        border: '1px solid rgba(109,40,217,0.3)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}
    >
      <div className="p-3 pb-2">
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search categories…"
          className="w-full px-3 py-2 text-sm rounded-xl outline-none"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--color-border)', color: 'var(--text-primary)' }}
        />
      </div>

      <div className="max-h-56 overflow-y-auto px-2 pb-2">
        {filtered.map(group => (
          <div key={group.group} className="mt-2">
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{group.group}</p>
            {group.items.map(item => {
              const isSelected = item === value
              return (
                <button
                  key={item}
                  onClick={() => onSelect(item)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-xl transition-colors text-left"
                  style={{
                    color: isSelected ? '#34d399' : 'var(--text-secondary)',
                    background: isSelected ? 'rgba(52,211,153,0.08)' : '',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = isSelected ? 'rgba(52,211,153,0.12)' : 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = isSelected ? 'rgba(52,211,153,0.08)' : '')}
                >
                  {item}
                  {isSelected && <span className="text-xs">✓</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
