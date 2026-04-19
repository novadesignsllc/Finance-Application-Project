import { useMemo } from 'react'
import type { Account } from './Sidebar'
import type { Transaction } from '../data/mockData'

interface IncomeViewProps {
  transactions: Transaction[]
  accounts: Account[]
  gradientColors: string[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function parseTxDate(date: string): { year: number; month: number } | null {
  const parts = date.split('/')
  if (parts.length !== 3) return null
  return { year: parseInt(parts[2]), month: parseInt(parts[0]) }
}

export default function IncomeView({ transactions, accounts, gradientColors }: IncomeViewProps) {
  const gradient = gradientColors.length === 1
    ? gradientColors[0]
    : `linear-gradient(135deg, ${gradientColors.join(', ')})`

  // Income = inflow transactions explicitly categorised as 'Income'
  const incomeTxs = useMemo(() =>
    transactions.filter(t => t.category === 'Income' && (t.inflow ?? 0) > 0),
    [transactions]
  )

  const totalIncome = incomeTxs.reduce((s, t) => s + (t.inflow ?? 0), 0)

  // ── Payee breakdown ──────────────────────────────────────────────
  const payeeBreakdown = useMemo(() => {
    const map = new Map<string, number>()
    for (const tx of incomeTxs) {
      const p = tx.payee?.trim() || 'Unknown'
      map.set(p, (map.get(p) ?? 0) + (tx.inflow ?? 0))
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [incomeTxs])

  // ── Monthly chart data (last 12 months) ──────────────────────────
  const monthlyData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
      const year = d.getFullYear()
      const month = d.getMonth() + 1

      const income = transactions
        .filter(t => {
          if (t.category !== 'Income' || (t.inflow ?? 0) <= 0) return false
          const p = parseTxDate(t.date)
          return p?.year === year && p?.month === month
        })
        .reduce((s, t) => s + (t.inflow ?? 0), 0)

      const spending = transactions
        .filter(t => {
          if (t.payee === 'Starting Balance' || (t.outflow ?? 0) <= 0) return false
          const p = parseTxDate(t.date)
          return p?.year === year && p?.month === month
        })
        .reduce((s, t) => s + (t.outflow ?? 0), 0)

      return { label: MONTH_LABELS[d.getMonth()], year, month, income, spending }
    })
  }, [transactions])

  const maxValue = Math.max(...monthlyData.map(m => Math.max(m.income, m.spending)), 1)

  // ── Sorted recent income ─────────────────────────────────────────
  const recentIncome = useMemo(() =>
    [...incomeTxs].sort((a, b) => {
      const pa = parseTxDate(a.date), pb = parseTxDate(b.date)
      if (!pa || !pb) return 0
      return (pb.year * 100 + pb.month) - (pa.year * 100 + pa.month) || 0
    }).slice(0, 25),
    [incomeTxs]
  )

  // Chart constants
  const CHART_H = 160
  const N = monthlyData.length
  const VW = 640
  const GROUP_W = VW / N
  const BAR_W = Math.floor(GROUP_W * 0.28)
  const BAR_GAP = Math.floor(GROUP_W * 0.06)

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: 'var(--bg-main)' }}>

      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center px-6 gap-4"
        style={{ height: '56px', borderBottom: '1px solid var(--color-border)', background: 'var(--bg-surface)' }}
      >
        <h1 className="text-base font-bold flex-shrink-0" style={{ color: 'var(--text-primary)' }}>Income</h1>

        <div className="flex-1 flex justify-center">
          <div className="text-center">
            <div className="text-xl font-bold" style={{ color: '#34d399' }}>{fmt(totalIncome)}</div>
            <div className="text-xs font-medium" style={{ color: '#34d399', opacity: 0.75 }}>Total income recorded</div>
          </div>
        </div>

        <div className="flex-shrink-0" style={{ minWidth: '80px' }} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {incomeTxs.length === 0 ? (

          /* ── Empty state ── */
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>No income recorded yet</p>
              <p className="text-xs mt-1.5 max-w-xs" style={{ color: 'var(--text-faint)' }}>
                When entering a transaction, set the category to{' '}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Income</span>{' '}
                to track it here.
              </p>
            </div>
          </div>

        ) : (
          <div className="px-6 py-6 space-y-6">

            {/* ── Bar chart ── */}
            <div
              className="rounded-2xl p-5"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Monthly Overview</h2>
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: '#34d399' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>Income</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: '#f87171' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-faint)' }}>Spending</span>
                  </div>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${VW} ${CHART_H + 28}`}
                width="100%"
                style={{ display: 'block', overflow: 'visible' }}
              >
                {/* Horizontal grid lines */}
                {[0.25, 0.5, 0.75, 1].map(frac => {
                  const y = Math.round(CHART_H * (1 - frac))
                  return (
                    <g key={frac}>
                      <line x1={0} y1={y} x2={VW} y2={y} stroke="var(--color-border)" strokeWidth={0.75} strokeDasharray="3 3" />
                      <text x={-4} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-faint)" fontFamily="system-ui">
                        {fmt(maxValue * frac).replace('$', '$').replace('.00', '')}
                      </text>
                    </g>
                  )
                })}

                {/* Bars */}
                {monthlyData.map((m, i) => {
                  const cx = i * GROUP_W + GROUP_W / 2
                  const incomeH = Math.round((m.income / maxValue) * CHART_H)
                  const spendH = Math.round((m.spending / maxValue) * CHART_H)
                  const xIncome = Math.round(cx - BAR_W - BAR_GAP / 2)
                  const xSpend = Math.round(cx + BAR_GAP / 2)
                  const isCurrentMonth = m.year === new Date().getFullYear() && m.month === new Date().getMonth() + 1

                  return (
                    <g key={`${m.year}-${m.month}`}>
                      {/* Income bar */}
                      {incomeH > 0 && (
                        <rect
                          x={xIncome} y={CHART_H - incomeH}
                          width={BAR_W} height={incomeH}
                          rx={3} fill="#34d399" fillOpacity={0.85}
                        />
                      )}
                      {incomeH === 0 && (
                        <rect x={xIncome} y={CHART_H - 2} width={BAR_W} height={2} rx={1} fill="#34d399" fillOpacity={0.2} />
                      )}

                      {/* Spending bar */}
                      {spendH > 0 && (
                        <rect
                          x={xSpend} y={CHART_H - spendH}
                          width={BAR_W} height={spendH}
                          rx={3} fill="#f87171" fillOpacity={0.75}
                        />
                      )}
                      {spendH === 0 && (
                        <rect x={xSpend} y={CHART_H - 2} width={BAR_W} height={2} rx={1} fill="#f87171" fillOpacity={0.2} />
                      )}

                      {/* Month label */}
                      <text
                        x={cx} y={CHART_H + 18}
                        textAnchor="middle"
                        fontSize={10}
                        fontFamily="system-ui"
                        fontWeight={isCurrentMonth ? 600 : 400}
                        fill={isCurrentMonth ? 'var(--text-secondary)' : 'var(--text-faint)'}
                      >
                        {m.label}
                      </text>
                    </g>
                  )
                })}

                {/* Baseline */}
                <line x1={0} y1={CHART_H} x2={VW} y2={CHART_H} stroke="var(--color-border)" strokeWidth={1} />
              </svg>
            </div>

            {/* ── Two-column layout: sources + recent ── */}
            <div className="grid grid-cols-2 gap-6" style={{ alignItems: 'start' }}>

              {/* Income sources */}
              <div
                className="rounded-2xl p-5"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--color-border)' }}
              >
                <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Income Sources</h2>
                <div className="space-y-4">
                  {payeeBreakdown.map(([payee, amount]) => {
                    const pct = totalIncome > 0 ? (amount / totalIncome) * 100 : 0
                    return (
                      <div key={payee}>
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-sm font-medium truncate mr-3" style={{ color: 'var(--text-primary)' }}>{payee}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{pct.toFixed(0)}%</span>
                            <span className="text-sm font-semibold" style={{ color: '#34d399' }}>{fmt(amount)}</span>
                          </div>
                        </div>
                        <div
                          className="h-1.5 rounded-full overflow-hidden"
                          style={{ background: 'var(--bg-hover-strong)' }}
                        >
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: gradient,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Recent income list */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--color-border)' }}
              >
                <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent Income</h2>
                </div>
                <div>
                  {recentIncome.map(tx => {
                    const account = accounts.find(a => a.id === tx.accountId)
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 px-5 py-3 transition-all"
                        style={{ borderBottom: '1px solid var(--color-border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        {/* Dot */}
                        <div className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: '#34d399', opacity: 0.7 }} />

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                            {tx.payee || '—'}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                            {account?.name ?? '—'} · {tx.date}
                          </p>
                        </div>

                        <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#34d399' }}>
                          +{fmt(tx.inflow ?? 0)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
