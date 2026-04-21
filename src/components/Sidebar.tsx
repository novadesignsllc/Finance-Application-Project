import { useState, useRef, useEffect } from 'react'
import type { Transaction } from '../data/mockData'
import { supabase } from '../lib/supabase'
import AccountSettingsModal from './AccountSettingsModal'

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
  gradientColors: string[]
  onGradientChange: (colors: string[]) => void
  width: number
  selectedAccountId: string | null
  onAccountSelect: (id: string | null) => void
  onAddAccount: () => void
  accounts: Account[]
  onAccountsChange: (accounts: Account[]) => void
  transactions: Transaction[]
  closedAccountIds: Set<string>
  onResetAccount: () => Promise<void>
  displayName: string
  onDisplayNameChange: (name: string) => void
}

function buildGradient(colors: string[]): string {
  if (colors.length === 1) return colors[0]
  const stops = colors.map((c, i) => `${c} ${Math.round(i / (colors.length - 1) * 100)}%`)
  return `linear-gradient(to bottom, ${stops.join(', ')})`
}

export default function Sidebar({ activeView, onViewChange, isDark, onThemeToggle, gradientColors, onGradientChange, width, selectedAccountId, onAccountSelect, onAddAccount, accounts, onAccountsChange, transactions, closedAccountIds, onResetAccount, displayName, onDisplayNameChange }: SidebarProps) {
  const setAccounts = onAccountsChange
  const [showSettings, setShowSettings] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [showAccountSettings, setShowAccountSettings] = useState(false)
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

  // Close settings popover on outside click; reset the reset flow when it closes
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
        background: buildGradient(gradientColors),
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
            <div className="min-w-0">
              <p className="truncate" style={{ fontFamily: "'Ms Madi', cursive", fontSize: '1.75rem', color: '#fff', lineHeight: 1.2 }}>Allocate</p>
            </div>
          </div>
        </div>

        {/* Nav pills */}
        <div className="px-3 pb-3 space-y-1">
          {([
            {
              id: 'budget', label: 'Budget',
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3.5" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.25"/>
                  <path d="M1 6.5h14" stroke="currentColor" strokeWidth="1.25"/>
                  <circle cx="4.5" cy="9.5" r="1" fill="currentColor"/>
                  <rect x="7.5" y="9" width="5" height="1" rx="0.5" fill="currentColor" fillOpacity="0.6"/>
                </svg>
              ),
            },
            {
              id: 'income', label: 'Income',
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 11.5l3.5-4.5 3 3L13 3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M10.5 3H13v2.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
            },
            {
              id: 'bills', label: 'Bills',
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.25"/>
                  <path d="M5 5h4M5 7.5h4M5 10h2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                  <circle cx="12.5" cy="12.5" r="2.5" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1"/>
                  <path d="M11.5 12.5h2M12.5 11.5v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              ),
            },
            {
              id: 'credit', label: 'Debt',
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.25"/>
                  <rect x="1" y="6" width="14" height="2.5" fill="currentColor" fillOpacity="0.3"/>
                  <rect x="2.5" y="10" width="3.5" height="1.25" rx="0.5" fill="currentColor" fillOpacity="0.7"/>
                </svg>
              ),
            },
            {
              id: 'all-transactions', label: 'All Transactions',
              icon: (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.25"/>
                  <path d="M4 5.5h8M4 8h8M4 10.5h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                </svg>
              ),
            },
          ] as { id: string; label: string; icon: React.ReactNode }[]).map(item => (
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
              <span className="flex-shrink-0 leading-none">{item.icon}</span>
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

              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>
                  Gradient
                </p>

                {/* Preview strip */}
                <div
                  className="w-full h-6 rounded-lg mb-3"
                  style={{ background: buildGradient(gradientColors) }}
                />

                {/* Color stops */}
                <div className="flex items-center gap-2 flex-wrap">
                  {gradientColors.map((color, i) => (
                    <div key={i} className="relative">
                      <button
                        title={`Stop ${i + 1}: ${color}`}
                        className="w-8 h-8 rounded-lg transition-all"
                        style={{
                          background: color,
                          border: '2px solid rgba(255,255,255,0.3)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        }}
                        onClick={() => {
                          const input = document.getElementById(`color-stop-${i}`) as HTMLInputElement
                          input?.click()
                        }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)')}
                      />
                      <input
                        id={`color-stop-${i}`}
                        type="color"
                        value={color}
                        onChange={e => {
                          const next = [...gradientColors]
                          next[i] = e.target.value
                          onGradientChange(next)
                        }}
                        className="absolute opacity-0 pointer-events-none w-0 h-0"
                      />
                      {gradientColors.length > 2 && (
                        <button
                          onClick={() => onGradientChange(gradientColors.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-xs leading-none transition-all"
                          style={{ background: 'rgba(220,38,38,0.85)', color: 'white', lineHeight: 1 }}
                          title="Remove stop"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}

                  {gradientColors.length < 4 && (
                    <button
                      onClick={() => onGradientChange([...gradientColors, gradientColors[gradientColors.length - 1]])}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-base transition-all"
                      style={{
                        border: '2px dashed rgba(255,255,255,0.3)',
                        color: 'rgba(255,255,255,0.5)',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.6)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
                      title="Add color stop"
                    >
                      +
                    </button>
                  )}

                  <button
                    onClick={() => onGradientChange(['#6d28d9', '#4338ca', '#1d4ed8', '#0369a1'])}
                    className="ml-auto text-xs px-2 py-1 rounded-lg transition-all"
                    style={{ color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.07)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.8)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                    title="Reset to default"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  onClick={() => { setShowAccountSettings(true); setShowSettings(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M2 12c0-2.21 2.239-4 5-4s5 1.79 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <span className="font-medium">Account Settings</span>
                </button>

                <button
                  onClick={() => supabase.auth.signOut()}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all mt-1"
                  style={{ color: '#f87171' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>↪</span>
                  <span className="font-medium">Sign Out</span>
                </button>

                <p
                  className="text-center mt-2 select-none"
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.03em' }}
                >
                  beta 1.0.1
                </p>
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


      {showAccountSettings && (
        <AccountSettingsModal
          displayName={displayName}
          onDisplayNameChange={onDisplayNameChange}
          onResetAccount={onResetAccount}
          onClose={() => setShowAccountSettings(false)}
          isDark={true}
        />
      )}
    </aside>
  )
}
