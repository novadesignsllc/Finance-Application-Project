import { useState, useRef, useEffect } from 'react'
import type { Transaction } from '../data/mockData'

export interface Account {
  id: string
  name: string
  type: string
}

interface SidebarProps {
  activeView: string
  onViewChange: (view: string) => void
  isDark: boolean
  onThemeToggle: () => void
  width: number
  selectedAccountId: string | null
  onAccountSelect: (id: string | null) => void
  onAddAccount: () => void
  accounts: Account[]
  onAccountsChange: (accounts: Account[]) => void
  transactions: Transaction[]
  closedAccountIds: Set<string>
}

export default function Sidebar({ activeView, onViewChange, isDark, onThemeToggle, width, selectedAccountId, onAccountSelect, onAddAccount, accounts, onAccountsChange, transactions, closedAccountIds }: SidebarProps) {
  const setAccounts = onAccountsChange
  const [showSettings, setShowSettings] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const dragIndex = useRef<number | null>(null)
  const dragOverIndex = useRef<number | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  const workingBalance = (accountId: string) =>
    transactions
      .filter(t => t.accountId === accountId)
      .reduce((s, t) => s + (t.inflow ?? 0) - (t.outflow ?? 0), 0)

  const openAccounts = accounts.filter(a => !closedAccountIds.has(a.id))
  const totalBalance = openAccounts.reduce((sum, a) => sum + workingBalance(a.id), 0)
  const totalCash = openAccounts.filter(a => a.type !== 'credit').reduce((sum, a) => sum + workingBalance(a.id), 0)
  const totalDebt = openAccounts.filter(a => a.type === 'credit').reduce((sum, a) => sum + workingBalance(a.id), 0)

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  // Close settings popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false)
      }
    }
    if (showSettings) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  // Account drag reorder
  const handleDragStart = (i: number) => { dragIndex.current = i }
  const handleDragOver = (e: React.DragEvent, i: number) => { e.preventDefault(); dragOverIndex.current = i }
  const handleDrop = () => {
    const from = dragIndex.current, to = dragOverIndex.current
    if (from === null || to === null || from === to) return
    const r = [...accounts]; const [m] = r.splice(from, 1); r.splice(to, 0, m)
    setAccounts(r); dragIndex.current = null; dragOverIndex.current = null
  }

  return (
    <aside
      data-theme="dark"
      className="relative flex-shrink-0 flex flex-col h-screen overflow-hidden"
      style={{
        width,
        background: 'linear-gradient(to bottom, #6d28d9 0%, #4338ca 35%, #1d4ed8 70%, #0369a1 100%)',
        backgroundAttachment: 'fixed',
        transition: 'box-shadow 0.3s ease',
      }}
    >
      {/* Subtle inner gradient overlay for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to right, rgba(0,0,0,0.15) 0%, transparent 60%)',
          zIndex: 0,
        }}
      />

      {/* Content sits above overlay */}
      <div className="relative z-10 flex flex-col h-full">

        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold shadow-lg flex-shrink-0"
              style={{
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
              }}
            >
              Z
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Dave's Budget</p>
              <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>Zero-Based</p>
            </div>
          </div>
        </div>

        {/* Nav pills */}
        <div className="px-3 pb-3 space-y-1">
          {[
            { id: 'budget', label: 'Budget', icon: '$' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { onViewChange(item.id); onAccountSelect(null) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-all"
              style={{
                borderRadius: '12px',
                background: activeView === item.id && !selectedAccountId ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: activeView === item.id && !selectedAccountId ? '#fff' : 'rgba(255,255,255,0.6)',
                backdropFilter: activeView === item.id && !selectedAccountId ? 'blur(8px)' : undefined,
                border: activeView === item.id && !selectedAccountId ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
              }}
              onMouseEnter={e => {
                if (activeView !== item.id) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
              }}
              onMouseLeave={e => {
                if (activeView !== item.id) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="mx-4 mb-3" style={{ height: '1px', background: 'rgba(255,255,255,0.12)' }} />

        {/* Net Worth + Cash / Debt */}
        <div className="px-5 pb-4">
          <p className="text-xs mb-1 font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>Net Worth</p>
          <p className="text-2xl font-bold text-white">{fmt(totalBalance)}</p>
          <div className="flex gap-4 mt-2">
            <div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Cash</p>
              <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>{fmt(totalCash)}</p>
            </div>
            <div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Debt</p>
              <p className="text-sm font-semibold" style={{ color: totalDebt < 0 ? 'rgba(252,165,165,0.85)' : 'rgba(255,255,255,0.75)' }}>{fmt(totalDebt)}</p>
            </div>
          </div>
        </div>

        {/* Accounts label */}
        <div className="px-5 pb-2">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Accounts
          </p>
        </div>

        {/* Account list */}
        <div className="flex-1 overflow-y-auto px-3 pb-2" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
          {accounts.filter(a => !closedAccountIds.has(a.id)).map((account, index) => (
            <div
              key={account.id}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={e => handleDragOver(e, index)}
              onClick={() => onAccountSelect(selectedAccountId === account.id ? null : account.id)}
              className="flex items-center gap-2.5 px-3 py-2.5 transition-all cursor-pointer active:opacity-60"
              style={{
                borderRadius: '12px',
                background: selectedAccountId === account.id ? 'rgba(255,255,255,0.18)' : 'transparent',
                border: selectedAccountId === account.id ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                backdropFilter: selectedAccountId === account.id ? 'blur(8px)' : undefined,
              }}
              onMouseEnter={e => { if (selectedAccountId !== account.id) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
              onMouseLeave={e => { if (selectedAccountId !== account.id) e.currentTarget.style.background = 'transparent' }}
            >
              <span className="text-sm truncate flex-1 select-none" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {account.name}
              </span>
              <span
                className="text-sm flex-shrink-0 select-none font-medium"
                style={{ color: workingBalance(account.id) < 0 ? 'rgba(252,165,165,0.9)' : 'rgba(255,255,255,0.55)' }}
              >
                {fmt(workingBalance(account.id))}
              </span>
            </div>
          ))}

          {/* Add account */}
          <button
            onClick={onAddAccount}
            className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 transition-all"
            style={{
              borderRadius: '12px',
              border: '1.5px dashed rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.4)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
            }}
          >
            <span className="text-sm">+</span>
            <span className="text-sm font-medium">Add Account</span>
          </button>

          {/* Closed accounts dropdown */}
          {closedAccountIds.size > 0 && (() => {
            const closed = accounts.filter(a => closedAccountIds.has(a.id))
            return (
              <div className="mt-1">
                <button
                  onClick={() => setShowClosed(p => !p)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-all"
                  style={{ borderRadius: '10px', color: 'rgba(255,255,255,0.35)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ display: 'inline-block', transform: showClosed ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
                  Closed Accounts
                  <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{closed.length}</span>
                </button>
                {showClosed && closed.map(account => (
                  <div
                    key={account.id}
                    onClick={() => onAccountSelect(selectedAccountId === account.id ? null : account.id)}
                    className="flex items-center gap-2.5 px-3 py-2 transition-all cursor-pointer"
                    style={{
                      borderRadius: '12px',
                      background: selectedAccountId === account.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                      border: selectedAccountId === account.id ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                    }}
                    onMouseEnter={e => { if (selectedAccountId !== account.id) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                    onMouseLeave={e => { if (selectedAccountId !== account.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="text-xs select-none" style={{ color: 'rgba(255,255,255,0.2)' }}>⊘</span>
                    <span className="text-sm truncate flex-1 select-none" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {account.name}
                    </span>
                    <span className="text-sm flex-shrink-0 select-none" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      $0.00
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>

        {/* Settings */}
        <div className="px-3 pb-4 pt-2 relative" ref={settingsRef}>
          <div className="mx-1 mb-3" style={{ height: '1px', background: 'rgba(255,255,255,0.12)' }} />

          {/* Settings popover */}
          {showSettings && (
            <div
              className="absolute bottom-full left-3 right-3 mb-2 rounded-2xl p-4 z-30"
              style={{
                background: isDark ? 'rgba(15,13,26,0.95)' : 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 -8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(109,40,217,0.2)',
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
                Appearance
              </p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {isDark ? 'Dark Mode' : 'Light Mode'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                    {isDark ? 'Switch to light' : 'Switch to dark'}
                  </p>
                </div>
                <button
                  onClick={onThemeToggle}
                  className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
                  style={{ background: isDark ? '#7c3aed' : '#d1d5db' }}
                >
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200"
                    style={{ left: isDark ? '1.375rem' : '0.25rem' }}
                  />
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowSettings(p => !p)}
            className="w-full flex items-center gap-2 px-3 py-2.5 transition-all"
            style={{
              borderRadius: '12px',
              background: showSettings ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: 'rgba(255,255,255,0.55)',
            }}
            onMouseEnter={e => { if (!showSettings) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { if (!showSettings) e.currentTarget.style.background = 'transparent' }}
          >
            <span className="text-sm">⚙</span>
            <span className="text-sm font-medium">Settings</span>
          </button>
        </div>
      </div>


    </aside>
  )
}
