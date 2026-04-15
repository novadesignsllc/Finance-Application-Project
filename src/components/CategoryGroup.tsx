import { useState, useRef } from 'react'
import type { CategoryGroup as CategoryGroupType, Category } from '../data/mockData'
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
}

export default function CategoryGroup({
  group, groupIndex, selectedId, onSelect,
  onGroupDragStart, onGroupDragOver, onDragEnd,
  onEmojiChange, onAssignedChange, onCategoryReorder,
}: CategoryGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [draggingCatIdx, setDraggingCatIdx] = useState<number | null>(null)
  const dragCatIdx = useRef<number | null>(null)

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
      draggable
      onDragStart={e => { e.stopPropagation(); onGroupDragStart(groupIndex) }}
      onDragOver={e => { onGroupDragOver(e, groupIndex); setIsDraggingOver(true) }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={() => setIsDraggingOver(false)}
      onDragEnd={onDragEnd}
      className="rounded-2xl transition-all"
      style={{
        background: 'var(--bg-surface)',
        border: isDraggingOver
          ? '1px solid rgba(109,40,217,0.5)'
          : '1px solid var(--color-border)',
        boxShadow: isDraggingOver
          ? '0 0 0 2px rgba(109,40,217,0.2)'
          : '0 1px 4px rgba(0,0,0,0.12)',
        opacity: isDraggingOver ? 0.75 : 1,
        cursor: 'grab',
      }}
    >
      {/* Group header */}
      <div
        className="flex items-center py-3 transition-all"
        style={{
          background: 'rgba(109,40,217,0.06)',
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border)',
          paddingLeft: '20px',
          paddingRight: '8px',
        }}
        onClick={() => setCollapsed(!collapsed)}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(109,40,217,0.06)')}
      >
        {/* Chevron — matches w-4 spacer in header */}
        <div className="w-4 flex-shrink-0 flex items-center">
          <span
            className="text-xs"
            style={{
              color: 'var(--text-faint)',
              display: 'inline-block',
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
            }}
          >▾</span>
        </div>
        <div className="flex-1 pl-2">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            {group.name}
          </span>
        </div>
        <div className="flex items-center flex-shrink-0">
          <div style={{ width: '128px', textAlign: 'right', paddingRight: '16px' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>{fmt(totalAssigned)}</span>
          </div>
          <div style={{ width: '128px', textAlign: 'right', paddingRight: '16px' }}>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{fmt(totalActivity)}</span>
          </div>
          <div style={{ width: '128px', textAlign: 'right' }}>
            <span className="text-xs font-semibold" style={{ color: totalAvailable < 0 ? '#f87171' : 'var(--text-secondary)' }}>
              {fmt(totalAvailable)}
            </span>
          </div>
        </div>
        {/* Spacer for plan column */}
        <div className="w-14 flex-shrink-0" />
      </div>

      {!collapsed && (
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
