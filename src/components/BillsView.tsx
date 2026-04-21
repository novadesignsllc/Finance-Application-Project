import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { Account } from './Sidebar'
import type { Transaction } from '../data/mockData'
import type { Bill, BillGroup, BillFrequency } from '../data/billData'
import { toMonthly, FREQ_CONFIG, EMOJI_PRESETS, getNextPaymentDate, formatNextDate, nextDateUrgency } from '../data/billData'
import DatePickerButton from './DatePickerButton'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const fmtMonthly = (amount: number, freq: BillFrequency) => {
  const mo = toMonthly(amount, freq)
  if (freq === 'monthly') return fmt(mo)
  return `${fmt(mo)}/mo`
}

// ─── Emoji Picker ────────────────────────────────────────────────────────────

function EmojiPicker({ current, onSelect, onClose }: { current: string; onSelect: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState(current)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-1 z-50 rounded-2xl p-3"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid rgba(109,40,217,0.3)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        width: '248px',
      }}
    >
      {/* Custom input */}
      <input
        autoFocus
        value={custom}
        onChange={e => { setCustom(e.target.value); if (e.target.value) onSelect(e.target.value) }}
        placeholder="Type or paste emoji…"
        className="w-full px-3 py-1.5 text-sm rounded-xl outline-none mb-2"
        style={{ background: 'var(--bg-hover)', border: '1px solid var(--color-border)', color: 'var(--text-primary)' }}
      />
      {/* Preset grid */}
      <div className="grid grid-cols-8 gap-0.5">
        {EMOJI_PRESETS.map(e => (
          <button
            key={e}
            onClick={() => { onSelect(e); onClose() }}
            className="flex items-center justify-center text-lg h-8 w-8 rounded-lg transition-all"
            style={{ background: e === current ? 'rgba(109,40,217,0.2)' : 'transparent' }}
            onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--bg-hover-strong)')}
            onMouseLeave={ev => (ev.currentTarget.style.background = e === current ? 'rgba(109,40,217,0.2)' : 'transparent')}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Bill Row ────────────────────────────────────────────────────────────────

interface BillRowProps {
  bill: Bill
  isSelected: boolean
  isPending: boolean
  onSelect: () => void
  onSave: (b: Bill) => void
  onCancel: () => void
  onDelete: () => void
  accounts: Account[]
  gradientColors: string[]
}

function BillRow({ bill, isSelected, isPending, onSelect, onSave, onCancel, onDelete, accounts, gradientColors }: BillRowProps) {
  const gradient = gradientColors.length === 1
    ? gradientColors[0]
    : `linear-gradient(135deg, ${gradientColors.join(', ')})`

  // Local edit state — initialized from bill, resets on isSelected → true
  const [emoji, setEmoji] = useState(bill.emoji)
  const [name, setName] = useState(bill.name)
  const [amount, setAmount] = useState<string>(bill.amount > 0 ? String(bill.amount) : '')
  const [frequency, setFrequency] = useState<BillFrequency>(bill.frequency)
  const [accountId, setAccountId] = useState(bill.accountId)
  const [dueDate, setDueDate] = useState(bill.dueDate ?? '')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset draft whenever this row enters edit mode
  useEffect(() => {
    if (isSelected) {
      setEmoji(bill.emoji)
      setName(bill.name)
      setAmount(bill.amount > 0 ? String(bill.amount) : '')
      setFrequency(bill.frequency)
      setAccountId(bill.accountId)
      setDueDate(bill.dueDate ?? '')
      setShowEmojiPicker(false)
      setConfirmDelete(false)
    }
  }, [isSelected, bill.id])

  // Keyboard shortcuts while editing
  useEffect(() => {
    if (!isSelected) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter' && !showEmojiPicker) handleSave()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isSelected, showEmojiPicker, name, amount, frequency, accountId, emoji])

  const handleSave = () => {
    onSave({ ...bill, emoji, name: name.trim() || 'Untitled', amount: parseFloat(amount) || 0, frequency, accountId, dueDate })
  }

  const accountName = accounts.find(a => a.id === accountId)?.name

  if (!isSelected) {
    // ── Collapsed row ──
    const nextDate = bill.dueDate ? getNextPaymentDate(bill.dueDate, bill.frequency) : null
    return (
      <div
        onClick={onSelect}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-all"
        style={{ borderBottom: '1px solid var(--color-border)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}
      >
        {/* Emoji */}
        <span className="text-xl flex-shrink-0 w-8 text-center leading-none select-none">{bill.emoji}</span>

        {/* Name */}
        <div className="min-w-0" style={{ width: '200px', flexShrink: 0 }}>
          <span className="text-sm font-medium truncate block" style={{ color: 'var(--text-primary)' }}>
            {bill.name}
          </span>
        </div>

        {/* Next due */}
        <div className="flex-shrink-0" style={{ width: '80px' }}>
          {nextDate ? (
            <span className="text-xs font-medium" style={{ color: nextDateUrgency(nextDate) }}>
              {formatNextDate(nextDate)}
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.15)' }}>—</span>
          )}
        </div>

        {/* Freq badge */}
        <div className="flex-shrink-0" style={{ width: '80px' }}>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{
              background: FREQ_CONFIG[bill.frequency].bg,
              color: FREQ_CONFIG[bill.frequency].color,
              border: `1px solid ${FREQ_CONFIG[bill.frequency].border}`,
            }}
          >
            {FREQ_CONFIG[bill.frequency].label}
          </span>
        </div>

        {/* Account */}
        <span className="flex-shrink-0 text-xs truncate text-right" style={{ color: 'var(--text-faint)', width: '96px' }}>
          {accountName ?? <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
        </span>

        {/* Amount */}
        <span className="flex-shrink-0 text-sm font-semibold text-right" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', width: '96px' }}>
          {bill.amount > 0 ? fmtMonthly(bill.amount, bill.frequency) : <span style={{ color: 'var(--text-faint)' }}>—</span>}
        </span>

        {/* Linked indicator */}
        <div className="flex-shrink-0 flex items-center justify-center" style={{ width: '28px' }}>
          {bill.linkedTransactionId && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <title>Linked to transaction</title>
              <path d="M23 4v6h-6" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>
    )
  }

  // ── Expanded edit row ──
  return (
    <div
      className="px-4 py-3"
      style={{
        borderBottom: '1px solid var(--color-border)',
        background: 'rgba(109,40,217,0.07)',
        borderLeft: '2px solid rgba(109,40,217,0.5)',
      }}
    >
      {/* Row 1: emoji · name · account · category · amount */}
      <div className="flex items-center gap-2 mb-2">

        {/* Emoji */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowEmojiPicker(p => !p)}
            className="w-9 h-9 flex items-center justify-center text-xl rounded-xl transition-all"
            style={{
              background: showEmojiPicker ? 'rgba(109,40,217,0.25)' : 'var(--bg-hover-strong)',
              border: '1px solid rgba(109,40,217,0.4)',
            }}
          >
            {emoji}
          </button>
          {showEmojiPicker && (
            <EmojiPicker
              current={emoji}
              onSelect={e => setEmoji(e)}
              onClose={() => setShowEmojiPicker(false)}
            />
          )}
        </div>

        {/* Name */}
        <input
          autoFocus={isPending}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Bill name"
          onClick={e => e.stopPropagation()}
          className="px-3 py-1.5 text-sm font-medium rounded-xl outline-none"
          style={{
            flex: '1 1 0',
            minWidth: 0,
            background: 'var(--bg-hover-strong)',
            border: '1px solid rgba(109,40,217,0.4)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(109,40,217,0.7)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(109,40,217,0.4)')}
        />

        {/* Account */}
        <select
          value={accountId}
          onChange={e => setAccountId(e.target.value)}
          onClick={e => e.stopPropagation()}
          className="flex-shrink-0 px-3 py-1.5 text-sm rounded-xl outline-none"
          style={{
            background: 'var(--bg-hover-strong)',
            border: '1px solid rgba(109,40,217,0.35)',
            color: accountId ? 'var(--text-primary)' : 'var(--text-faint)',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            paddingRight: '28px',
            minWidth: '130px',
          }}
        >
          <option value="" style={{ background: '#1a1625' }}>No account</option>
          {accounts.map(a => (
            <option key={a.id} value={a.id} style={{ background: '#1a1625' }}>{a.name}</option>
          ))}
        </select>

        {/* Amount */}
        <div
          className="flex items-center rounded-xl flex-shrink-0"
          style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.4)', width: '120px', overflow: 'hidden' }}
        >
          <span className="pl-2.5 pr-0.5 text-sm flex-shrink-0" style={{ color: 'var(--text-faint)' }}>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            onClick={e => e.stopPropagation()}
            className="flex-1 py-1.5 pr-2.5 text-sm outline-none bg-transparent"
            style={{ color: 'var(--text-primary)', minWidth: 0 }}
          />
        </div>
      </div>

      {/* Row 2: frequency · due date · Cancel · Save */}
      <div className="flex items-center gap-2">

        {/* Frequency pills */}
        <div className="flex items-center gap-0.5 rounded-xl p-0.5 flex-shrink-0" style={{ background: 'var(--bg-hover)' }}>
          {(Object.keys(FREQ_CONFIG) as BillFrequency[]).map(f => (
            <button
              key={f}
              onClick={() => setFrequency(f)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg transition-all"
              style={{
                background: frequency === f ? FREQ_CONFIG[f].bg : 'transparent',
                color: frequency === f ? FREQ_CONFIG[f].color : 'var(--text-faint)',
                border: frequency === f ? `1px solid ${FREQ_CONFIG[f].border}` : '1px solid transparent',
              }}
            >
              {FREQ_CONFIG[f].label}
            </button>
          ))}
        </div>

        {/* Due date */}
        <DatePickerButton
          value={dueDate}
          onChange={setDueDate}
          placeholder="Due date"
          className="flex-shrink-0"
          style={{ width: '160px' }}
        />

        <div className="flex-1" />

        {confirmDelete ? (
          <>
            <span className="text-xs flex-shrink-0" style={{ color: 'rgba(239,68,68,0.8)' }}>Delete this bill?</span>
            <button
              onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
              className="px-3 py-1.5 text-sm font-medium rounded-xl transition-all"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            >
              Keep
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="px-3 py-1.5 text-sm font-semibold rounded-xl transition-all active:scale-95"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.25)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            {/* Delete */}
            <button
              onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
              className="px-3 py-1.5 text-sm font-medium rounded-xl transition-all"
              style={{ color: 'rgba(239,68,68,0.6)', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#f87171' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(239,68,68,0.6)' }}
            >
              Delete
            </button>

            {/* Cancel */}
            <button
              onClick={e => { e.stopPropagation(); onCancel() }}
              className="px-3 py-1.5 text-sm font-medium rounded-xl transition-all"
              style={{ color: 'var(--text-secondary)', background: 'var(--bg-hover)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            >
              Cancel
            </button>

            {/* Save */}
            <button
              onClick={e => { e.stopPropagation(); handleSave() }}
              className="px-4 py-1.5 text-sm font-semibold rounded-xl transition-all active:scale-95"
              style={{ background: gradient, color: 'white', boxShadow: '0 4px 12px rgba(109,40,217,0.3)' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 18px rgba(109,40,217,0.45)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(109,40,217,0.3)')}
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Bill Group Section ───────────────────────────────────────────────────────

interface BillGroupSectionProps {
  group: BillGroup
  selectedId: string | null
  pendingId: string | null
  onToggleCollapse: () => void
  onRename: (name: string) => void
  onReorderBills: (bills: Bill[]) => void
  onSelectBill: (id: string) => void
  onSaveBill: (b: Bill) => void
  onCancelBill: () => void
  onDeleteBill: (id: string) => void
  accounts: Account[]
  gradientColors: string[]
}

function BillGroupSection({
  group, selectedId, pendingId, onToggleCollapse, onRename, onReorderBills,
  onSelectBill, onSaveBill, onCancelBill, onDeleteBill, accounts, gradientColors,
}: BillGroupSectionProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(group.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const dragIdx = useRef<number | null>(null)

  const monthlyTotal = group.bills.reduce((s, b) => s + toMonthly(b.amount, b.frequency), 0)

  const commitRename = () => {
    if (nameValue.trim()) onRename(nameValue.trim())
    setEditingName(false)
  }

  useEffect(() => {
    if (editingName) inputRef.current?.focus()
  }, [editingName])

  const onDragStart = useCallback((idx: number) => {
    dragIdx.current = idx
    setDraggingIdx(idx)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    setDragOverIdx(idx)
    const next = [...group.bills]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, moved)
    dragIdx.current = idx
    setDraggingIdx(idx)
    onReorderBills(next)
  }, [group.bills, onReorderBills])

  const onDragEnd = useCallback(() => {
    dragIdx.current = null
    setDraggingIdx(null)
    setDragOverIdx(null)
  }, [])

  return (
    <div>
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 select-none"
        style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, zIndex: 5 }}
      >
        {/* Collapse chevron */}
        <button
          onClick={onToggleCollapse}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all"
          style={{ color: 'var(--text-faint)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={{ display: 'inline-block', transform: group.collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.18s ease', fontSize: '10px' }}>▾</span>
        </button>

        {/* Group name (right-click to rename) */}
        {editingName ? (
          <input
            ref={inputRef}
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') { setEditingName(false); setNameValue(group.name) }
            }}
            className="flex-1 px-2 py-0.5 text-sm font-semibold rounded-lg outline-none"
            style={{ background: 'var(--bg-hover-strong)', border: '1px solid rgba(109,40,217,0.5)', color: 'var(--text-primary)' }}
          />
        ) : (
          <span
            className="flex-1 text-xs font-semibold uppercase tracking-wider cursor-default"
            style={{ color: 'var(--text-secondary)' }}
            onContextMenu={e => { e.preventDefault(); setNameValue(group.name); setEditingName(true) }}
          >
            {group.name}
          </span>
        )}

        {/* Monthly total */}
        {monthlyTotal > 0 && (
          <span className="text-xs font-medium flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
            {fmt(monthlyTotal)}/mo
          </span>
        )}
      </div>

      {/* Bills (accordion) */}
      <div style={{ display: 'grid', gridTemplateRows: group.collapsed ? '0fr' : '1fr', transition: 'grid-template-rows 0.22s ease' }}>
        <div style={{ overflow: 'hidden' }}>
          {group.bills.map((bill, idx) => (
            <div
              key={bill.id}
              draggable={selectedId !== bill.id}
              onDragStart={e => { e.stopPropagation(); onDragStart(idx) }}
              onDragOver={e => { e.stopPropagation(); onDragOver(e, idx) }}
              onDragEnd={e => { e.stopPropagation(); onDragEnd() }}
              style={{
                opacity: draggingIdx === idx ? 0.4 : 1,
                outline: dragOverIdx === idx && draggingIdx !== idx ? '2px solid rgba(109,40,217,0.5)' : 'none',
                borderRadius: '4px',
                transition: 'opacity 0.15s ease',
                cursor: selectedId === bill.id ? 'default' : 'grab',
              }}
            >
              <BillRow
                bill={bill}
                isSelected={selectedId === bill.id}
                isPending={pendingId === bill.id}
                onSelect={() => onSelectBill(bill.id)}
                onSave={onSaveBill}
                onCancel={onCancelBill}
                onDelete={() => onDeleteBill(bill.id)}
                accounts={accounts}
                gradientColors={gradientColors}
              />
            </div>
          ))}
          {group.bills.length === 0 && !group.collapsed && (
            <div className="px-4 py-5 text-center">
              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>No bills yet — use <strong style={{ color: 'var(--text-secondary)' }}>Add Bill</strong> below</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── BillsView ────────────────────────────────────────────────────────────────

interface BillsViewProps {
  billGroups: BillGroup[]
  onBillGroupsChange: (groups: BillGroup[]) => void
  onCreateTransaction: (tx: Transaction) => void
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void
  accounts: Account[]
  gradientColors: string[]
}

// A bill is "complete" when it has everything needed to generate a transaction
const isBillComplete = (b: Bill) =>
  b.name.trim() !== '' && b.accountId !== '' && b.amount > 0 && b.dueDate !== ''

const formatDateForTx = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

export default function BillsView({ billGroups, onBillGroupsChange, onCreateTransaction, onUpdateTransaction, accounts, gradientColors }: BillsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [addingBill, setAddingBill] = useState(false)
  const [newBillGroupId, setNewBillGroupId] = useState('')
  const [toast, setToast] = useState<{ accountName: string; action: 'created' | 'updated' } | null>(null)

  // Auto-dismiss toast after 4 s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const allBills = billGroups.flatMap(g => g.bills)
  const totalMonthly = allBills.reduce((s, b) => s + toMonthly(b.amount, b.frequency), 0)

  const updateGroups = (fn: (groups: BillGroup[]) => BillGroup[]) => {
    onBillGroupsChange(fn(billGroups))
  }

  const handleSelectBill = (id: string) => {
    if (id === selectedId) return
    // Cancel any pending (unsaved new) bill
    if (pendingId) {
      updateGroups(gs => gs.map(g => ({ ...g, bills: g.bills.filter(b => b.id !== pendingId) })))
      setPendingId(null)
    }
    setSelectedId(id)
  }

  const handleSaveBill = (updated: Bill) => {
    let billToSave = updated

    if (isBillComplete(updated)) {
      const nextDate = getNextPaymentDate(updated.dueDate, updated.frequency)
      if (nextDate) {
        const accountName = accounts.find(a => a.id === updated.accountId)?.name ?? 'your account'
        if (!updated.linkedTransactionId) {
          // First time all fields complete — create a linked transaction
          const txId = crypto.randomUUID()
          const tx: Transaction = {
            id: txId,
            accountId: updated.accountId,
            date: formatDateForTx(nextDate),
            payee: updated.name,
            category: updated.name,
            memo: '',
            outflow: updated.amount,
            inflow: null,
            cleared: false,
            repeat: updated.frequency,
          }
          onCreateTransaction(tx)
          billToSave = { ...updated, linkedTransactionId: txId }
          setToast({ accountName, action: 'created' })
        } else {
          // Already linked — sync changes to the existing transaction
          onUpdateTransaction(updated.linkedTransactionId, {
            payee: updated.name,
            category: updated.name,
            outflow: updated.amount,
            accountId: updated.accountId,
            repeat: updated.frequency,
            date: formatDateForTx(nextDate),
          })
          setToast({ accountName, action: 'updated' })
        }
      }
    }

    updateGroups(gs => gs.map(g => ({ ...g, bills: g.bills.map(b => b.id === billToSave.id ? billToSave : b) })))
    setPendingId(null)
    setSelectedId(null)
  }

  const handleCancelBill = () => {
    if (pendingId) {
      updateGroups(gs => gs.map(g => ({ ...g, bills: g.bills.filter(b => b.id !== pendingId) })))
      setPendingId(null)
    }
    setSelectedId(null)
  }

  const handleDeleteBill = (id: string) => {
    updateGroups(gs => gs.map(g => ({ ...g, bills: g.bills.filter(b => b.id !== id) })))
    if (selectedId === id) setSelectedId(null)
    if (pendingId === id) setPendingId(null)
  }

  const addBillToGroup = (groupId: string) => {
    if (pendingId) {
      updateGroups(gs => gs.map(g => ({ ...g, bills: g.bills.filter(b => b.id !== pendingId) })))
    }
    const newBill: Bill = {
      id: crypto.randomUUID(),
      name: '',
      emoji: '📋',
      accountId: '',
      frequency: 'monthly',
      amount: 0,
      dueDate: '',
    }
    updateGroups(gs => gs.map(g => g.id === groupId ? { ...g, bills: [newBill, ...g.bills] } : g))
    setSelectedId(newBill.id)
    setPendingId(newBill.id)
  }

  const commitAddGroup = () => {
    const name = newGroupName.trim()
    if (name) {
      const newGroup: BillGroup = { id: crypto.randomUUID(), name, bills: [] }
      onBillGroupsChange([...billGroups, newGroup])
    }
    setAddingGroup(false)
    setNewGroupName('')
  }

  return (
    <>
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--bg-main)' }}>

      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center px-6 gap-4"
        style={{
          height: '56px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Left: title */}
        <div className="flex-shrink-0">
          <h1 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Bills</h1>
        </div>

        {/* Center: total */}
        <div className="flex-1 flex justify-center items-center">
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: '#60a5fa' }}>
              {fmt(totalMonthly)}
            </div>
            <div className="text-xs font-medium" style={{ color: '#60a5fa', opacity: 0.8 }}>
              Total needed per month
            </div>
          </div>
        </div>

        {/* Right: spacer to balance layout */}
        <div className="flex-shrink-0" style={{ minWidth: '80px' }} />
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto">
        {billGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(109,40,217,0.1)', border: '1px solid rgba(109,40,217,0.2)' }}>
              <span className="text-2xl">🔔</span>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No bill groups yet</p>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Use <strong style={{ color: 'var(--text-secondary)' }}>New Group</strong> below to get started</p>
          </div>
        ) : (
          billGroups.map(group => (
            <BillGroupSection
              key={group.id}
              group={group}
              selectedId={selectedId}
              pendingId={pendingId}
              onToggleCollapse={() => updateGroups(gs => gs.map(g => g.id === group.id ? { ...g, collapsed: !g.collapsed } : g))}
              onRename={name => updateGroups(gs => gs.map(g => g.id === group.id ? { ...g, name } : g))}
              onReorderBills={bills => updateGroups(gs => gs.map(g => g.id === group.id ? { ...g, bills } : g))}
              onSelectBill={handleSelectBill}
              onSaveBill={handleSaveBill}
              onCancelBill={handleCancelBill}
              onDeleteBill={handleDeleteBill}
              accounts={accounts}

              gradientColors={gradientColors}
            />
          ))
        )}

        {/* Bottom action buttons */}
        <div className="px-5 pt-4 pb-6 space-y-2">
          {/* Add Bill */}
          {addingBill ? (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(109,40,217,0.3)' }}
            >
              <span className="text-base flex-shrink-0">📋</span>
              <select
                value={newBillGroupId}
                onChange={e => setNewBillGroupId(e.target.value)}
                className="flex-1 px-2 py-1 text-sm rounded-lg outline-none"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--text-primary)',
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  paddingRight: '24px',
                }}
              >
                {billGroups.map(g => (
                  <option key={g.id} value={g.id} style={{ background: '#1a1625' }}>{g.name}</option>
                ))}
              </select>
              <button
                onClick={() => { addBillToGroup(newBillGroupId); setAddingBill(false) }}
                className="flex-shrink-0 px-3 py-1 text-xs font-semibold rounded-lg transition-all"
                style={{ background: 'rgba(109,40,217,0.2)', color: '#c084fc', border: '1px solid rgba(109,40,217,0.35)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.2)')}
              >
                Add
              </button>
              <button
                onClick={() => setAddingBill(false)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-base rounded-lg transition-all"
                style={{ color: 'var(--text-faint)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setNewBillGroupId(billGroups[0]?.id ?? ''); setAddingBill(true) }}
              disabled={billGroups.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 w-full text-sm transition-all"
              style={{ borderRadius: '12px', border: '1.5px dashed var(--color-border)', color: 'var(--text-faint)', background: 'transparent', opacity: billGroups.length === 0 ? 0.4 : 1 }}
              onMouseEnter={e => { if (billGroups.length > 0) { e.currentTarget.style.borderColor = 'rgba(109,40,217,0.4)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--text-faint)' }}
            >
              <span>+</span><span className="font-medium">Add Bill</span>
            </button>
          )}

          {/* New Group */}
          {addingGroup ? (
            <input
              autoFocus
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onBlur={commitAddGroup}
              onKeyDown={e => {
                if (e.key === 'Enter') commitAddGroup()
                if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
              }}
              placeholder="Group name…"
              className="w-full px-4 py-2.5 text-sm rounded-xl outline-none"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(109,40,217,0.4)', color: 'var(--text-primary)' }}
            />
          ) : (
            <button
              onClick={() => { setNewGroupName(''); setAddingGroup(true) }}
              className="flex items-center gap-2 px-4 py-2.5 w-full text-sm transition-all"
              style={{ borderRadius: '12px', border: '1.5px dashed var(--color-border)', color: 'var(--text-faint)', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(109,40,217,0.4)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--text-faint)' }}
            >
              <span>+</span><span className="font-medium">New Group</span>
            </button>
          )}
        </div>
      </div>
    </div>

      {/* Toast — linked transaction created */}
      {toast && createPortal(
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
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Linked transaction {toast.action}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
              {toast.action === 'created' ? 'Added to' : 'Synced with'}{' '}
              <span style={{ color: 'var(--text-secondary)' }}>{toast.accountName}</span>
            </p>
          </div>
          <button
            onClick={() => setToast(null)}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-sm transition-all"
            style={{ color: 'var(--text-faint)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >✕</button>
        </div>,
        document.body
      )}
    </>
  )
}
