import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { EMOJI_PRESETS } from '../data/billData'

export default function EmojiPicker({ current, onSelect, onClose, anchorRef }: {
  current: string
  onSelect: (e: string) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [custom, setCustom] = useState(current)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [anchorRef])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        width: 248,
        borderRadius: 16,
        padding: 12,
        background: 'var(--bg-surface)',
        border: '1px solid rgba(109,40,217,0.3)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}
    >
      <input
        autoFocus
        value={custom}
        onChange={e => { setCustom(e.target.value); if (e.target.value) onSelect(e.target.value) }}
        placeholder="Type or paste emoji…"
        className="w-full px-3 py-1.5 text-sm rounded-xl outline-none mb-2"
        style={{ background: 'var(--bg-hover)', border: '1px solid var(--color-border)', color: 'var(--text-primary)' }}
      />
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
    </div>,
    document.body
  )
}
