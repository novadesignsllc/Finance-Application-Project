import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface DatePickerButtonProps {
  /** ISO date string: YYYY-MM-DD, or '' for unset */
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  style?: React.CSSProperties
  className?: string
  /** If true, the popup opens upward instead of downward */
  openUp?: boolean
}

export default function DatePickerButton({
  value,
  onChange,
  placeholder = 'Pick a date',
  style,
  className,
  openUp = false,
}: DatePickerButtonProps) {
  const [open, setOpen] = useState(false)
  const [calView, setCalView] = useState<Date>(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      return new Date(y, m - 1, 1)
    }
    return new Date()
  })
  const [popupPos, setPopupPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 256 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popupRef.current && !popupRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sync calView to value when it changes externally
  useEffect(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number)
      setCalView(new Date(y, m - 1, 1))
    }
  }, [value])

  const openPopup = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const popupH = 300 // approximate
      const spaceBelow = window.innerHeight - rect.bottom
      const shouldOpenUp = openUp || spaceBelow < popupH
      if (shouldOpenUp) {
        setPopupPos({ top: rect.top - popupH - 4, left: rect.left, width: rect.width })
      } else {
        setPopupPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
      }
    }
    setOpen(p => !p)
  }

  // Parse selected parts from ISO value
  const selYear  = value ? parseInt(value.split('-')[0]) : -1
  const selMonth = value ? parseInt(value.split('-')[1]) : -1   // 1-based
  const selDay   = value ? parseInt(value.split('-')[2]) : -1

  const calYear     = calView.getFullYear()
  const calMonth    = calView.getMonth()    // 0-based
  const firstDay    = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const monthName   = calView.toLocaleString('default', { month: 'long' })
  const today       = new Date()

  const displayLabel = value
    ? new Date(selYear, selMonth - 1, selDay).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    : placeholder

  const pickDay = (day: number) => {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    onChange(iso)
    setOpen(false)
  }

  const pickToday = () => {
    const d = new Date()
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    onChange(iso)
    setOpen(false)
  }

  return (
    <div className={`relative ${className ?? ''}`} style={style}>
      {/* Trigger button */}
      <button
        ref={btnRef}
        type="button"
        onClick={openPopup}
        className="px-2.5 py-1.5 text-sm rounded-xl w-full text-left transition-all"
        style={{
          background: open ? 'rgba(109,40,217,0.25)' : 'var(--bg-hover-strong)',
          border: '1px solid rgba(109,40,217,0.35)',
          color: value ? 'var(--text-primary)' : 'var(--text-faint)',
        }}
      >
        {displayLabel}
      </button>

      {/* Calendar popup — rendered via portal to escape overflow:hidden containers */}
      {open && createPortal(
        <div
          ref={popupRef}
          className="rounded-2xl p-3 select-none"
          style={{
            position: 'fixed',
            top: popupPos.top,
            left: popupPos.left,
            minWidth: '256px',
            zIndex: 9999,
            background: 'var(--bg-surface)',
            border: '1px solid rgba(109,40,217,0.3)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={() => setCalView(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >‹</button>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {monthName} {calYear}
            </span>
            <button
              type="button"
              onClick={() => setCalView(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-sm transition-all"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >›</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} className="text-center text-xs font-medium py-1" style={{ color: 'var(--text-faint)' }}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const isToday = today.getDate() === day && today.getMonth() === calMonth && today.getFullYear() === calYear
              const isSel   = selDay === day && selMonth - 1 === calMonth && selYear === calYear
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  className="text-xs h-8 w-full flex items-center justify-center rounded-lg transition-all"
                  style={{
                    background: isSel ? 'linear-gradient(135deg, #7c3aed, #2563eb)' : 'transparent',
                    color: isSel ? 'white' : isToday ? '#a78bfa' : 'var(--text-primary)',
                    fontWeight: isSel || isToday ? 600 : 400,
                    border: isToday && !isSel ? '1px solid rgba(167,139,250,0.4)' : '1px solid transparent',
                    boxShadow: isSel ? '0 2px 8px rgba(109,40,217,0.4)' : undefined,
                  }}
                  onMouseEnter={ev => { if (!isSel) ev.currentTarget.style.background = 'var(--bg-hover-strong)' }}
                  onMouseLeave={ev => { if (!isSel) ev.currentTarget.style.background = 'transparent' }}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Today shortcut */}
          <div className="mt-2 pt-2 flex justify-center" style={{ borderTop: '1px solid var(--color-border)' }}>
            <button
              type="button"
              onClick={pickToday}
              className="text-xs px-3 py-1.5 rounded-lg transition-all font-medium"
              style={{ color: '#a78bfa' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(167,139,250,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
