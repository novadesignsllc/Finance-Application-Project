import { useState, useRef, useEffect } from 'react'
import type { CategoryGroup as CategoryGroupType, Category, Transaction } from '../data/mockData'
import CategoryRow from './CategoryRow'

interface CategoryGroupProps {
  group: CategoryGroupType
  groupIndex: number
  selectedId: string | null
  onSelect: (id: string) => void
  onGroupDragStart: (idx: number) => void
  onGroupDragOver: (e: React.DragEvent, idx: number) => void
  onDragEnd: () => void
  onEmojiChange: (catId: string, emoji: string) => void
  onAssignedChange: (catId: string, value: number) => void
  onCategoryReorder: (cats: Category[]) => void
  onRenameGroup: (name: string) => void
  onDeleteGroup?: () => void
  isLocked?: boolean
  lockedVariant?: 'cc' | 'bills'
  transactions: Transaction[]
  budgetMonth: { year: number; month: number }
}

export default function CategoryGroup({
  group, groupIndex, selectedId, onSelect,
  onGroupDragStart, onGroupDragOver, onDragEnd,
  onEmojiChange, onAssignedChange, onCategoryReorder, onRenameGroup, onDeleteGroup, isLocked, lockedVariant,
  transactions, budgetMonth,
}: CategoryGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])
  const [draggingCatIdx, setDraggingCatIdx] = useState<number | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(group.name)
  const dragCatIdx = useRef<number | null>(null)

  const commitRename = () => {
    const trimmed = nameValue.trim()
    if (trimmed && trimmed !== group.name) onRenameGroup(trimmed)
    else setNameValue(group.name)
    setEditingName(false)
  }

  const onCatDragStart = (idx: number) => {
    dragCatIdx.current = idx
    setDraggingCatIdx(idx)
  }

  const onCatDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragCatIdx.current === null || dragCatIdx.current === idx) return
    const next = [...group.categories]
    const [moved] = next.splice(dragCatIdx.current, 1)
    next.splice(idx, 0, moved)
    dragCatIdx.current = idx
    setDraggingCatIdx(idx)
    onCategoryReorder(next)
  }

  const onCatDragEnd = () => {
    dragCatIdx.current = null
    setDraggingCatIdx(null)
  }

  const totalAssigned  = group.categories.reduce((s, c) => s + c.assigned, 0)
  const totalActivity  = group.categories.reduce((s, c) => s + c.activity, 0)
  const totalAvailable = group.categories.reduce((s, c) => s + c.available, 0)

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  return (
    <div
      draggable={!isLocked}
      onDragStart={e => { if (isLocked) return; e.stopPropagation(); onGroupDragStart(groupIndex) }}
      onDragOver={e => { if (isLocked) return; onGroupDragOver(e, groupIndex); setIsDraggingOver(true) }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={() => setIsDraggingOver(false)}
      onDragEnd={onDragEnd}
      className="rounded-2xl transition-all"
      style={{
        background: 'var(--bg-surface)',
        border: isDraggingOver
          ? '1px solid rgba(109,40,217,0.5)'
          : isLocked && lockedVariant === 'bills'
            ? '1px solid rgba(96,165,250,0.2)'
            : isLocked
              ? '1px solid rgba(248,113,113,0.2)'
              : '1px solid var(--color-border)',
        boxShadow: isDraggingOver
          ? '0 0 0 2px rgba(109,40,217,0.2)'
          : '0 1px 4px rgba(0,0,0,0.12)',
        opacity: isDraggingOver ? 0.75 : 1,
        cursor: isLocked ? 'default' : 'grab',
      }}
    >
      {/* Group header */}
      <div
        className="flex items-center py-3 transition-all"
        style={{
          background: isLocked && lockedVariant === 'bills'
            ? 'rgba(96,165,250,0.06)'
            : isLocked
              ? 'rgba(248,113,113,0.06)'
              : 'rgba(109,40,217,0.06)',
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border)',
          paddingLeft: '20px',
          paddingRight: '8px',
          borderRadius: collapsed ? '16px' : undefined,
        }}
        onClick={() => setCollapsed(!collapsed)}
        onMouseEnter={e => (e.currentTarget.style.background = isLocked && lockedVariant === 'bills' ? 'rgba(96,165,250,0.1)' : isLocked ? 'rgba(248,113,113,0.1)' : 'rgba(109,40,217,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.background = isLocked && lockedVariant === 'bills' ? 'rgba(96,165,250,0.06)' : isLocked ? 'rgba(248,113,113,0.06)' : 'rgba(109,40,217,0.06)')}
      >
        <div className="w-4 flex-shrink-0" />
        <div className="flex-1 pl-2 flex items-center gap-2" onClick={e => { if (editingName) e.stopPropagation() }}>
          {editingName && !isLocked ? (
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') { setNameValue(group.name); setEditingName(false) }
              }}
              onClick={e => e.stopPropagation()}
              className="text-xs font-bold uppercase tracking-widest bg-transparent outline-none"
              style={{
                color: 'var(--text-primary)',
                borderBottom: '1px solid rgba(139,92,246,0.6)',
                minWidth: '80px',
                width: `${Math.max(nameValue.length, 4)}ch`,
              }}
            />
          ) : (
            <span
              className="text-xs font-bold uppercase tracking-widest select-none"
              style={{ color: isLocked && lockedVariant === 'bills' ? 'rgba(96,165,250,0.8)' : isLocked ? 'rgba(248,113,113,0.8)' : 'var(--text-secondary)' }}
            >
              {group.name}
            </span>
          )}
          {/* ··· menu for non-locked groups */}
          {!isLocked && (
            <div className="relative" ref={menuRef} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => { setShowMenu(p => !p); setConfirmDelete(false) }}
                className="w-5 h-5 flex items-center justify-center rounded text-xs transition-all"
                style={{ color: 'var(--text-faint)', background: showMenu ? 'var(--bg-hover-strong)' : 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                onMouseLeave={e => { if (!showMenu) e.currentTarget.style.background = 'transparent' }}
                title="Group options"
              >···</button>
              {showMenu && (
                <div
                  className="absolute left-0 top-full mt-1 rounded-xl py-1 z-50"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--color-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 130 }}
                >
                  <button
                    className="w-full text-left px-3 py-1.5 text-xs transition-all"
                    style={{ color: 'var(--text-primary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => { setShowMenu(false); setNameValue(group.name); setEditingName(true) }}
                  >Rename</button>
                  {!confirmDelete ? (
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs transition-all"
                      style={{ color: '#f87171' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setConfirmDelete(true)}
                    >Delete group…</button>
                  ) : (
                    <button
                      className="w-full text-left px-3 py-1.5 text-xs font-semibold transition-all"
                      style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)' }}
                      onClick={() => { setShowMenu(false); setConfirmDelete(false); onDeleteGroup?.() }}
                    >Confirm delete</button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center flex-shrink-0">
          {/* Mirror category row button structure: no container paddingRight, span carries pr-3 */}
          <div style={{ width: '112px' }}>
            <span className="text-sm block w-full text-right pl-2 pr-3 py-0.5" style={{ color: 'var(--text-faint)' }}>{fmt(totalAssigned)}</span>
          </div>
          <div style={{ width: '112px' }}>
            <span className="text-sm block w-full text-right pl-2 pr-3 py-0.5" style={{ color: 'var(--text-faint)' }}>{fmt(totalActivity)}</span>
          </div>
          {/* Mirror category row available: flex right + 2px container pr, invisible pill with same px-2.5 */}
          <div style={{ width: '112px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '2px' }}>
            <span
              className="text-sm font-medium px-2.5 py-0.5 inline-flex items-center"
              style={{
                borderRadius: '20px',
                background: 'transparent',
                border: '1px solid transparent',
                color: totalAvailable < 0 ? '#f87171' : 'var(--text-secondary)',
              }}
            >
              {fmt(totalAvailable)}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: collapsed ? '0fr' : '1fr',
          transition: 'grid-template-rows 0.25s ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
        <div className="py-1">
          {group.categories.length === 0 && (
            <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
              No categories yet — use "Add Category" below.
            </div>
          )}
          {group.categories.map((category, idx) => (
            <CategoryRow
              key={category.id}
              category={category}
              isSelected={selectedId === category.id}
              onSelect={() => onSelect(category.id)}
              onEmojiChange={emoji => onEmojiChange(category.id, emoji)}
              onAssignedChange={value => onAssignedChange(category.id, value)}
              catIndex={idx}
              onCatDragStart={onCatDragStart}
              onCatDragOver={onCatDragOver}
              onCatDragEnd={onCatDragEnd}
              isDraggingOver={draggingCatIdx !== null && draggingCatIdx === idx}
              isCCPayment={lockedVariant === 'cc'}
              transactions={transactions}
              budgetMonth={budgetMonth}
            />
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}
