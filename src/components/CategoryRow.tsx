import { useState, useRef, useEffect } from 'react'
import type { Category } from '../data/mockData'

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
}

const EMOJI_OPTIONS = [
  '🏠','⚡','📡','🛒','🚗','📱','🛡️','🧴','👕','🏆','🍽️','❤️','🎁','🪴','🛍️','✈️','💸',
  '💰','💳','🏦','📊','🎯','🎮','🎵','🎬','📚','💻','🏋️','🌿','🐾','☕','🍕','🚀',
  '🔧','🏥','🎓','🛺','🧳','🎪','🏖️','🌍','💡','🔑','📦','🧹','🎨','🪙','📁',
]

export default function CategoryRow({ category, isSelected, onSelect, onEmojiChange, onAssignedChange, catIndex, onCatDragStart, onCatDragOver, onCatDragEnd, isDraggingOver }: CategoryRowProps) {
  const [editingAssigned, setEditingAssigned] = useState(false)
  const [assignedValue, setAssignedValue] = useState(category.assigned.toString())

  // Sync input when month changes (category.assigned comes from parent)
  useEffect(() => {
    if (!editingAssigned) setAssignedValue(category.assigned.toString())
  }, [category.assigned, editingAssigned])

  const commitAssigned = () => {
    const parsed = parseFloat(assignedValue.replace(/[^0-9.-]/g, ''))
    const value = isNaN(parsed) ? 0 : parsed
    setAssignedValue(value.toString())
    onAssignedChange(value)
    setEditingAssigned(false)
  }
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const emojiRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    if (showEmojiPicker) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmojiPicker])

  const formatCurrency = (n: number) => {
    if (n === 0) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))
  }

  const availablePill = () => {
    if (category.available < 0) return { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.25)' }
    if (category.available > 0) return { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' }
    return null
  }

  const pill = availablePill()

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onCatDragStart(catIndex) }}
      onDragOver={e => { e.stopPropagation(); onCatDragOver(e, catIndex) }}
      onDragEnd={e => { e.stopPropagation(); onCatDragEnd() }}
      className="flex items-center my-0.5"
      style={{ opacity: isDraggingOver ? 0.7 : 1 }}
    >
    {/* Card row */}
    <div
      onClick={onSelect}
      className="flex-1 flex items-center gap-2 pl-3 py-2.5 mx-2 cursor-grab transition-all"
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
      <div className="relative flex-shrink-0" ref={emojiRef} onClick={e => e.stopPropagation()}>
        <button
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
          <div
            className="absolute left-0 top-full mt-1 z-50 rounded-2xl p-2"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid rgba(109,40,217,0.3)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
              width: '220px',
            }}
          >
            <div className="grid grid-cols-8 gap-0.5">
              {EMOJI_OPTIONS.map(e => (
                <button
                  key={e}
                  onClick={() => { onEmojiChange(e); setShowEmojiPicker(false) }}
                  className="text-base w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                  style={{
                    background: e === category.emoji ? 'rgba(109,40,217,0.25)' : 'transparent',
                  }}
                  onMouseEnter={el => (el.currentTarget.style.background = 'var(--bg-hover-strong)')}
                  onMouseLeave={el => (el.currentTarget.style.background = e === category.emoji ? 'rgba(109,40,217,0.25)' : 'transparent')}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
        {/* Assigned */}
        <div style={{ width: '128px', textAlign: 'right', paddingRight: '16px' }}>
          {editingAssigned ? (
            <input
              autoFocus
              className="w-full text-sm text-right text-white outline-none"
              style={{
                background: 'rgba(109,40,217,0.2)',
                border: '1px solid rgba(139,92,246,0.4)',
                borderRadius: '8px',
                padding: '2px 8px',
              }}
              value={assignedValue}
              onChange={e => setAssignedValue(e.target.value)}
              onBlur={commitAssigned}
              onKeyDown={e => { if (e.key === 'Enter') commitAssigned(); if (e.key === 'Escape') { setAssignedValue(category.assigned.toString()); setEditingAssigned(false) } }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <button
              className="text-sm px-2 py-0.5 w-full text-right transition-all"
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

        {/* Activity */}
        <div style={{ width: '128px', textAlign: 'right', paddingRight: '16px' }}>
          <span className="text-sm" style={{
            color: category.activity > 0 ? '#34d399' : category.activity === 0 ? 'var(--text-faint)' : 'var(--text-secondary)',
          }}>
            {category.activity === 0 ? '$0.00' : `-${formatCurrency(category.activity)}`}
          </span>
        </div>

        {/* Available */}
        <div style={{ width: '128px', textAlign: 'right' }}>
          {pill ? (
            <span
              className="text-sm font-medium px-2.5 py-0.5 inline-block"
              style={{
                borderRadius: '20px',
                background: pill.bg,
                color: pill.color,
                border: `1px solid ${pill.border}`,
              }}
            >
              {category.available < 0 ? `-${formatCurrency(category.available)}` : formatCurrency(category.available)}
            </span>
          ) : (
            <span className="text-sm" style={{ color: 'var(--text-faint)' }}>$0.00</span>
          )}
        </div>
      </div>
    </div>{/* end card row */}

    {/* Plan icon — separate column with left border divider */}
    <div
      className="w-14 flex-shrink-0 flex items-center justify-center self-stretch"
      style={{ borderLeft: '1px solid var(--color-border)' }}
    >
      {category.plan && category.planMet === true && (
        <span style={{ color: '#34d399', fontSize: '14px', fontWeight: 700 }}>✓</span>
      )}
      {category.plan && category.planMet === false && (
        <span style={{ color: '#f87171', fontSize: '13px', fontWeight: 700 }}>✕</span>
      )}
    </div>
    </div>
  )
}
