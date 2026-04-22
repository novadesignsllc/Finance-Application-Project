import { useState, useRef } from 'react'
import CategoryGroup from './CategoryGroup'
import type { CategoryGroup as CategoryGroupType, Transaction } from '../data/mockData'

interface BudgetTableProps {
  selectedId: string | null
  onSelect: (id: string) => void
  groups: CategoryGroupType[]
  onGroupsChange: (groups: CategoryGroupType[]) => void
  onDeleteGroup: (groupId: string) => void
  onAssignedChange: (catId: string, value: number) => void
  ccGroupId?: string
  billsGroupId?: string
  transactions: Transaction[]
  budgetMonth: { year: number; month: number }
}

export default function BudgetTable({ selectedId, onSelect, groups, onGroupsChange, onDeleteGroup, onAssignedChange, ccGroupId, billsGroupId, transactions, budgetMonth }: BudgetTableProps) {
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatGroupId, setNewCatGroupId] = useState('')

  // Group drag state
  const dragGroupIdx = useRef<number | null>(null)

  const commitAddGroup = () => {
    const name = newGroupName.trim()
    if (name) onGroupsChange([...groups, { id: crypto.randomUUID(), name, categories: [] }])
    setAddingGroup(false)
    setNewGroupName('')
  }

  const commitAddCategory = () => {
    const groupId = newCatGroupId || groups.find(g => g.id !== ccGroupId && g.id !== billsGroupId)?.id
    if (groupId) {
      onGroupsChange(groups.map(g =>
        g.id === groupId
          ? { ...g, categories: [...g.categories, { id: crypto.randomUUID(), name: 'New Category', emoji: '📁', assigned: 0, activity: 0, available: 0 }] }
          : g
      ))
    }
    setAddingCategory(false)
    setNewCatName('')
  }

  const onGroupDragStart = (idx: number) => { dragGroupIdx.current = idx }

  const onGroupDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragGroupIdx.current === null || dragGroupIdx.current === idx) return
    const ccIdx = ccGroupId ? groups.findIndex(g => g.id === ccGroupId) : -1
    const billsIdx = billsGroupId ? groups.findIndex(g => g.id === billsGroupId) : -1
    if (idx === ccIdx || dragGroupIdx.current === ccIdx) return
    if (idx === billsIdx || dragGroupIdx.current === billsIdx) return
    const next = [...groups]
    const [moved] = next.splice(dragGroupIdx.current, 1)
    next.splice(idx, 0, moved)
    dragGroupIdx.current = idx
    onGroupsChange(next)
  }

  const onEmojiChange = (catId: string, emoji: string) => {
    onGroupsChange(groups.map(g => ({
      ...g,
      categories: g.categories.map(c => c.id === catId ? { ...c, emoji } : c)
    })))
  }

  return (
    <div className="flex-1 overflow-y-auto budget-scroll-area" style={{ scrollbarWidth: 'none' }}>
      {/* Column headers */}
      <div
        className="flex items-center gap-2 px-5 py-2.5 sticky top-0 z-10 backdrop-blur-sm"
        style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="w-4 flex-shrink-0" />
        <div className="flex-1 text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>
          Category
        </div>
        <div className="flex items-center flex-shrink-0">
          <div style={{ width: '112px' }}>
            <span className="text-xs font-semibold uppercase tracking-widest block w-full text-right pr-3" style={{ color: 'var(--text-faint)' }}>Allocated</span>
          </div>
          <div style={{ width: '112px' }}>
            <span className="text-xs font-semibold uppercase tracking-widest block w-full text-right pr-3" style={{ color: 'var(--text-faint)' }}>Activity</span>
          </div>
          <div style={{ width: '112px', display: 'flex', justifyContent: 'flex-end', paddingRight: '12px' }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-faint)' }}>Available</span>
          </div>
        </div>
      </div>

      {/* Groups */}
      <div className="pt-3 px-3 space-y-3">
        {groups.map((group, idx) => (
          <CategoryGroup
            key={group.id}
            group={group}
            groupIndex={idx}
            selectedId={selectedId}
            onSelect={onSelect}
            onGroupDragStart={onGroupDragStart}
            onGroupDragOver={onGroupDragOver}
            onDragEnd={() => { dragGroupIdx.current = null }}
            onEmojiChange={onEmojiChange}
            onAssignedChange={onAssignedChange}
            isLocked={group.id === ccGroupId || group.id === billsGroupId}
            lockedVariant={group.id === billsGroupId ? 'bills' : 'cc'}
            onCategoryReorder={cats => {
              onGroupsChange(groups.map((g, i) => i === idx ? { ...g, categories: cats } : g))
            }}
            onRenameGroup={name => {
              onGroupsChange(groups.map((g, i) => i === idx ? { ...g, name } : g))
            }}
            onDeleteGroup={group.id !== ccGroupId && group.id !== billsGroupId ? () => onDeleteGroup(group.id) : undefined}
            transactions={transactions}
            budgetMonth={budgetMonth}
          />
        ))}
      </div>

      {/* New Group + Add Category — bottom of full list */}
      <div className="px-5 pt-4 pb-6 space-y-2">
        {/* New Group */}
        {addingGroup ? (
          <input
            autoFocus
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitAddGroup(); if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') } }}
            onBlur={commitAddGroup}
            placeholder="Group name…"
            className="w-full px-4 py-2.5 text-sm rounded-xl outline-none"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(109,40,217,0.4)',
              color: 'var(--text-primary)',
            }}
          />
        ) : (
          <button
            onClick={() => setAddingGroup(true)}
            className="flex items-center gap-2 px-4 py-2.5 w-full text-sm transition-all"
            style={{
              borderRadius: '12px',
              border: '1.5px dashed var(--color-border)',
              color: 'var(--text-faint)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(109,40,217,0.4)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            <span>+</span>
            <span className="font-medium">New Group</span>
          </button>
        )}
      </div>

      <div className="px-5 pb-6">
        {addingCategory ? (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(109,40,217,0.3)' }}
          >
            <span className="text-base flex-shrink-0">📁</span>
            <select
              autoFocus
              value={newCatGroupId || groups.find(g => g.id !== ccGroupId && g.id !== billsGroupId)?.id || ''}
              onChange={e => setNewCatGroupId(e.target.value)}
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
              {groups.filter(g => g.id !== ccGroupId && g.id !== billsGroupId).map(g => (
                <option key={g.id} value={g.id} style={{ background: '#1a1625' }}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={commitAddCategory}
              className="flex-shrink-0 px-3 py-1 text-xs font-semibold rounded-lg transition-all"
              style={{ background: 'rgba(109,40,217,0.2)', color: '#c084fc', border: '1px solid rgba(109,40,217,0.35)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.2)')}
            >
              Add
            </button>
            <button
              onClick={() => { setAddingCategory(false); setNewCatName('') }}
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
            onClick={() => { setNewCatGroupId(groups.find(g => g.id !== ccGroupId && g.id !== billsGroupId)?.id || ''); setAddingCategory(true) }}
            disabled={groups.filter(g => g.id !== ccGroupId && g.id !== billsGroupId).length === 0}
            className="flex items-center gap-2 px-4 py-2.5 w-full text-sm transition-all"
            style={{
              borderRadius: '12px',
              border: '1.5px dashed var(--color-border)',
              color: 'var(--text-faint)',
              background: 'transparent',
              opacity: groups.filter(g => g.id !== ccGroupId && g.id !== billsGroupId).length === 0 ? 0.4 : 1,
            }}
            onMouseEnter={e => { if (groups.filter(g => g.id !== ccGroupId && g.id !== billsGroupId).length > 0) { e.currentTarget.style.borderColor = 'rgba(109,40,217,0.4)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            <span>+</span>
            <span className="font-medium">Add Category</span>
          </button>
        )}
      </div>
    </div>
  )
}
