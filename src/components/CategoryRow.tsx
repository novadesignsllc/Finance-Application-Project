import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Category, Transaction } from '../data/mockData'
import EmojiPicker from './EmojiPicker'

const IconExclaim = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="5.5" cy="5.5" r="4.75" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="4.75" y="2.75" width="1.5" height="3.5" rx="0.65" fill="currentColor"/>
    <circle cx="5.5" cy="7.9" r="0.75" fill="currentColor"/>
  </svg>
)

const IconCard = () => (
  <svg width="14" height="10" viewBox="0 0 14 10" fill="none" style={{ flexShrink: 0 }}>
    <rect x="0.75" y="0.75" width="12.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.1"/>
    <rect x="0.75" y="3" width="12.5" height="2" fill="currentColor" fillOpacity="0.35"/>
    <rect x="1.75" y="6.25" width="3" height="1.5" rx="0.5" fill="currentColor" fillOpacity="0.75"/>
  </svg>
)

const IconStar = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
    <path d="M6 1 L7.29 4.22 L10.76 4.45 L8.09 6.68 L8.94 10.05 L6 8.2 L3.06 10.05 L3.91 6.68 L1.24 4.45 L4.71 4.22 Z" fill="currentColor"/>
  </svg>
)

interface CategoryRowProps {
  category: Category
  isSelected: boolean
  onSelect: () => void
  onEmojiChange: (emoji: string) => void
  onAssignedChange: (value: number) => void
  catIndex: number
  onCatDragStart: (idx: number) => void
  onCatDragOver: (e: React.DragEvent, idx: number) => void
  onCatDragEnd: () => void
  isDraggingOver?: boolean
  isCCPayment?: boolean
  isLocked?: boolean
  transactions: Transaction[]
  budgetMonth: { year: number; month: number }
}

export default function CategoryRow({ category, isSelected, onSelect, onEmojiChange, onAssignedChange, catIndex, onCatDragStart, onCatDragOver, onCatDragEnd, isDraggingOver, isCCPayment, isLocked, transactions, budgetMonth }: CategoryRowProps) {
  const [editingAssigned, setEditingAssigned] = useState(false)
  const assignedInputRef = useRef<HTMLInputElement>(null)
  const [activityPopupPos, setActivityPopupPos] = useState<{ top: number; left: number } | null>(null)
  const [activityTab, setActivityTab] = useState<'spending' | 'funding'>('spending')
  const activityPopupRef = useRef<HTMLDivElement>(null)
  const activityBtnRef = useRef<HTMLButtonElement>(null)

  // Close editing if month/category changes while open
  useEffect(() => { setEditingAssigned(false) }, [category.id, category.assigned])

  const commitAssigned = useCallback(() => {
    const raw = assignedInputRef.current?.value ?? ''
    const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ''))
    const value = isNaN(parsed) ? 0 : parsed
    onAssignedChange(value)
    setEditingAssigned(false)
  }, [onAssignedChange])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)

  // Close activity popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (activityPopupRef.current && !activityPopupRef.current.contains(e.target as Node) &&
          activityBtnRef.current && !activityBtnRef.current.contains(e.target as Node)) {
        setActivityPopupPos(null)
      }
    }
    if (activityPopupPos) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [activityPopupPos])

  const openActivityPopup = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (activityPopupPos) { setActivityPopupPos(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const vw = window.innerWidth
    const popupW = 300
    let left = rect.left
    if (left + popupW > vw - 12) left = vw - popupW - 12
    setActivityTab('spending')
    setActivityPopupPos({ top: rect.bottom + 6, left })
  }

  // Transactions that contribute to this category's activity this month
  const activityTxs = (() => {
    const { year, month } = budgetMonth
    if (isCCPayment) {
      const ccAccountId = category.id.replace('cc-payment-', '')
      // Spending tab: purchases only (no starting balance, no payments)
      return transactions.filter(t => {
        if (t.accountId !== ccAccountId) return false
        if (t.payee === 'Starting Balance') return false
        if (t.outflow == null) return false  // exclude payments (inflow only)
        const parts = t.date.split('/')
        return parseInt(parts[2]) === year && parseInt(parts[0]) === month
      })
    }
    return transactions.filter(t => {
      if (t.category !== category.name) return false
      const parts = t.date.split('/')
      return parseInt(parts[2]) === year && parseInt(parts[0]) === month
    })
  })()

  // For CC: payments this month (shown separately in funding tab header)
  const ccPaymentTxs = (() => {
    if (!isCCPayment) return []
    const { year, month } = budgetMonth
    const ccAccountId = category.id.replace('cc-payment-', '')
    return transactions.filter(t => {
      if (t.accountId !== ccAccountId) return false
      if (t.inflow == null) return false
      const parts = t.date.split('/')
      return parseInt(parts[2]) === year && parseInt(parts[0]) === month
    })
  })()

  const activityTotal = isCCPayment
    ? -activityTxs.reduce((sum, t) => sum + (t.outflow ?? 0), 0)
    : activityTxs.reduce((sum, t) => sum + (t.inflow ?? 0) - (t.outflow ?? 0), 0)

  const formatCurrency = (n: number) => {
    if (n === 0) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
  }

  const red    = { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.25)'  }
  const green  = { bg: 'rgba(52,211,153,0.12)',  color: '#34d399', border: 'rgba(52,211,153,0.25)' }
  const yellow = { bg: 'rgba(234,179,8,0.12)',   color: '#eab308', border: 'rgba(234,179,8,0.3)'   }

  const availablePill = () => {
    if (isCCPayment) {
      const cardBal = category.ccAccountBalance ?? 0
      // Debt payoff plan active: yellow+star when on track, red+exclamation when short
      if (category.debtPayoffDate) {
        return category.planStatus === 'met' ? yellow : red
      }
      // No payoff plan: red if balance exceeds available, green if covered
      if (cardBal > category.available) return red
      if (cardBal > 0 && category.available >= cardBal) return green
    }
    // Plan-driven colors take precedence over available balance colors
    if (category.planStatus === 'under')
      return { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)' }
    if (category.planStatus === 'over')
      return { bg: 'rgba(234,179,8,0.12)', color: '#eab308', border: 'rgba(234,179,8,0.3)' }
    if (category.planStatus === 'met')
      return { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' }
    // No plan: default available-based coloring
    if (category.available < 0) return { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)' }
    if (category.available > 0) return { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' }
    return { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: 'rgba(148,163,184,0.2)' }
  }

  const pill = availablePill()

  // Archived bill categories — read-only tombstone row (after all hooks)
  if (category.archived) {
    return (
      <div className="flex items-center my-0.5 pr-2" style={{ opacity: 0.45 }}>
        <div className="flex-1 flex items-center gap-2 pl-3 py-2.5 ml-2">
          <div className="flex-shrink-0 text-sm w-7 h-7 flex items-center justify-center">{category.emoji}</div>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{category.name}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(148,163,184,0.12)', color: 'var(--text-faint)', border: '1px solid rgba(148,163,184,0.2)' }}>archived</span>
          </div>
          <div className="flex items-center flex-shrink-0">
            <div style={{ width: '112px' }}><span className="text-sm block w-full text-right pr-3 py-0.5" style={{ color: 'var(--text-faint)' }}>—</span></div>
            <div style={{ width: '112px' }}><span className="text-sm block w-full text-right pr-3 py-0.5" style={{ color: 'var(--text-faint)' }}>—</span></div>
            <div style={{ width: '112px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '2px' }}>
              <span className="text-sm font-medium px-2.5 py-0.5 inline-flex items-center" style={{ borderRadius: '20px', background: 'rgba(148,163,184,0.1)', color: 'var(--text-faint)', border: '1px solid rgba(148,163,184,0.2)' }}>
                {formatCurrency(category.available)}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onCatDragStart(catIndex) }}
      onDragOver={e => { e.stopPropagation(); onCatDragOver(e, catIndex) }}
      onDragEnd={e => { e.stopPropagation(); onCatDragEnd() }}
      className="flex items-center my-0.5 pr-2"
      style={{ opacity: isDraggingOver ? 0.7 : 1 }}
    >
    {/* Card row */}
    <div
      onClick={onSelect}
      className="flex-1 flex items-center gap-2 pl-3 py-2.5 ml-2 cursor-grab transition-all"
      style={{
        borderRadius: '10px',
        background: isDraggingOver
          ? 'rgba(109,40,217,0.12)'
          : isSelected
            ? 'linear-gradient(135deg, rgba(109,40,217,0.15), rgba(37,99,235,0.1))'
            : 'transparent',
        border: isDraggingOver
          ? '1px solid rgba(139,92,246,0.4)'
          : isSelected
            ? '1px solid rgba(139,92,246,0.25)'
            : '1px solid transparent',
        boxShadow: isSelected ? '0 2px 12px rgba(109,40,217,0.1)' : 'none',
      }}
      onMouseEnter={e => { if (!isSelected && !isDraggingOver) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!isSelected && !isDraggingOver) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Emoji + picker */}
      {(isCCPayment || isLocked) ? (
        <div className="flex-shrink-0 text-sm w-7 h-7 flex items-center justify-center">{isCCPayment ? '💳' : category.emoji}</div>
      ) : (
        <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            ref={emojiBtnRef}
            onClick={() => setShowEmojiPicker(p => !p)}
            className="text-sm w-7 h-7 flex items-center justify-center rounded-lg transition-all"
            title="Change emoji"
            style={{ background: showEmojiPicker ? 'var(--bg-hover-strong)' : 'transparent' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
            onMouseLeave={e => { if (!showEmojiPicker) e.currentTarget.style.background = 'transparent' }}
          >
            {category.emoji}
          </button>
          {showEmojiPicker && (
            <EmojiPicker
              current={category.emoji}
              onSelect={onEmojiChange}
              onClose={() => setShowEmojiPicker(false)}
              anchorRef={emojiBtnRef}
            />
          )}
        </div>
      )}

      {/* Name */}
      <div className="flex-1 min-w-0">
        <span
          className="text-sm truncate block"
          style={{ color: isSelected ? '#c4b5fd' : 'var(--text-primary)' }}
        >
          {category.name}
        </span>
      </div>

      {/* Number columns — fixed width block, never squeezed */}
      <div className="flex items-center flex-shrink-0">
        {/* Assigned — no container paddingRight; button carries pr-3 so digit lands 12px from column edge */}
        <div style={{ width: '112px' }}>
          {editingAssigned ? (
            <input
              ref={assignedInputRef}
              autoFocus
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              className="w-full text-sm text-right text-white outline-none"
              style={{
                background: 'rgba(109,40,217,0.2)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '8px',
                padding: '2px 12px 2px 8px',
              }}
              defaultValue={category.assigned === 0 ? '' : category.assigned.toString()}
              onBlur={commitAssigned}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitAssigned() }
                if (e.key === 'Escape') setEditingAssigned(false)
              }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <button
              className="text-sm pl-2 pr-3 py-0.5 w-full text-right transition-all"
              style={{ borderRadius: '8px', color: 'var(--text-secondary)' }}
              onClick={e => { e.stopPropagation(); setEditingAssigned(true) }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(109,40,217,0.15)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {category.assigned === 0
                ? <span style={{ color: 'var(--text-faint)' }}>$0.00</span>
                : formatCurrency(category.assigned)
              }
            </button>
          )}
        </div>

        {/* Activity — same: button pr-3 pins digit 12px from column edge */}
        <div style={{ width: '112px' }}>
          <button
            ref={activityBtnRef}
            onClick={openActivityPopup}
            className="text-sm pl-2 pr-3 py-0.5 w-full text-right transition-all"
            style={{
              borderRadius: '8px',
              color: 'var(--text-faint)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover-strong)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {isCCPayment
              ? category.activity === 0 ? '$0.00' : `${category.activity > 0 ? '+' : '-'}${formatCurrency(category.activity)}`
              : category.activity === 0 ? '$0.00' : `-${formatCurrency(category.activity)}`
            }
          </button>
        </div>

        {/* Available — flex right-align; pill px-2.5 (10px) + container pr 2px = digit 12px from edge */}
        <div style={{ width: '112px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '2px' }}>
          <span
            className="text-sm font-medium px-2.5 py-0.5 inline-flex items-center gap-1"
            style={{
              borderRadius: '20px',
              background: pill.bg,
              color: pill.color,
              border: `1px solid ${pill.border}`,
            }}
          >
            {isCCPayment && category.debtPayoffDate
              ? category.planStatus === 'met' ? <IconStar /> : <IconExclaim />
              : isCCPayment && (category.ccAccountBalance ?? 0) > category.available
                ? <IconExclaim />
                : category.causingCCUnderfunding
                  ? <IconCard />
                  : category.available < 0 && !isCCPayment
                    ? <IconExclaim />
                    : null}
            {category.available < 0 ? `-${formatCurrency(category.available)}` : formatCurrency(category.available)}
          </span>
        </div>
      </div>
    </div>{/* end card row */}

    </div>

    {/* Activity detail popup */}
    {activityPopupPos && createPortal(
      <div
        ref={activityPopupRef}
        className="z-[9999] rounded-2xl overflow-hidden"
        style={{
          position: 'fixed',
          top: activityPopupPos.top,
          left: activityPopupPos.left,
          width: 300,
          background: 'var(--bg-surface)',
          border: '1px solid rgba(109,40,217,0.3)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>Activity</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-primary)' }}>{category.name}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Total</p>
            <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text-faint)' }}>
              {activityTotal === 0 ? '$0.00' : `${activityTotal > 0 ? '+' : '-'}${formatCurrency(Math.abs(activityTotal))}`}
            </p>
          </div>
        </div>

        {/* CC: tab bar */}
        {isCCPayment && (
          <div className="flex" style={{ borderBottom: '1px solid var(--color-border)' }}>
            {(['spending', 'funding'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActivityTab(tab)}
                className="flex-1 py-2 text-xs font-semibold capitalize transition-all"
                style={{
                  color: activityTab === tab ? '#c4b5fd' : 'var(--text-faint)',
                  borderBottom: activityTab === tab ? '2px solid #7c3aed' : '2px solid transparent',
                  background: 'transparent',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        {/* CC Spending tab */}
        {isCCPayment && activityTab === 'spending' && (
          <>
            {activityTxs.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No spending this month</p>
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                {activityTxs.map(t => {
                  const dateStr = (() => { const p = t.date.split('/'); return `${p[0]}/${p[1]}` })()
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div className="flex-shrink-0 text-xs" style={{ color: 'var(--text-faint)', width: 32 }}>{dateStr}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.payee}</p>
                        {t.category && <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{t.category}</p>}
                        {t.memo && <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{t.memo}</p>}
                      </div>
                      <div className="flex-shrink-0 text-xs font-semibold" style={{ color: '#f87171' }}>
                        -{formatCurrency(t.outflow ?? 0)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* CC Funding tab */}
        {isCCPayment && activityTab === 'funding' && (
          <>
            {(category.ccFunding ?? []).length === 0 && ccPaymentTxs.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No funding this month</p>
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                {/* Category funding rows */}
                {(category.ccFunding ?? []).map(f => {
                  const full = f.amount >= f.total
                  return (
                    <div key={f.categoryName} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{f.categoryName}</p>
                        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>from budget category</p>
                      </div>
                      <div className="flex-shrink-0 text-xs font-semibold tabular-nums">
                        <span style={{ color: full ? '#34d399' : '#f87171' }}>{formatCurrency(f.amount)}</span>
                        <span style={{ color: 'var(--text-faint)' }}> / </span>
                        <span style={{ color: '#34d399' }}>{formatCurrency(f.total)}</span>
                      </div>
                    </div>
                  )
                })}
                {/* Payment rows */}
                {ccPaymentTxs.map(t => {
                  const dateStr = (() => { const p = t.date.split('/'); return `${p[0]}/${p[1]}` })()
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div className="flex-shrink-0 text-xs" style={{ color: 'var(--text-faint)', width: 32 }}>{dateStr}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.payee}</p>
                        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>payment made</p>
                      </div>
                      <div className="flex-shrink-0 text-xs font-semibold" style={{ color: '#34d399' }}>
                        +{formatCurrency(t.inflow ?? 0)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Regular category transactions */}
        {!isCCPayment && (
          <>
            {activityTxs.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <p className="text-sm" style={{ color: 'var(--text-faint)' }}>No transactions this month</p>
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
                {activityTxs.map(t => {
                  const amount = (t.inflow ?? 0) - (t.outflow ?? 0)
                  const isPositive = amount > 0
                  const dateStr = (() => { const p = t.date.split('/'); return `${p[0]}/${p[1]}` })()
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <div className="flex-shrink-0 text-xs" style={{ color: 'var(--text-faint)', width: 32 }}>{dateStr}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.payee}</p>
                        {t.memo && <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{t.memo}</p>}
                      </div>
                      <div className="flex-shrink-0 text-xs font-semibold" style={{ color: isPositive ? '#34d399' : '#f87171' }}>
                        {isPositive ? '+' : '-'}{formatCurrency(Math.abs(amount))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>,
      document.body
    )}
    </>
  )
}
