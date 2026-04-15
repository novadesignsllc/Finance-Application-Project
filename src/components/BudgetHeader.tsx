interface BudgetHeaderProps {
  budgetMonth: { year: number; month: number }
  onPrev: () => void
  onNext: () => void
  onGoToCurrent: () => void
  onResetAssigned: () => void
  moneyToBudget: number
  futureBudgeted: number
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function BudgetHeader({ budgetMonth, onPrev, onNext, onGoToCurrent, onResetAssigned, moneyToBudget, futureBudgeted }: BudgetHeaderProps) {
  const now = new Date()
  const isCurrentMonth = budgetMonth.year === now.getFullYear() && budgetMonth.month === now.getMonth() + 1
  const isFutureMonth = budgetMonth.year > now.getFullYear() || (budgetMonth.year === now.getFullYear() && budgetMonth.month > now.getMonth() + 1)
  const monthLabel = `${MONTH_NAMES[budgetMonth.month - 1]} ${budgetMonth.year}`
  const overAssigned = moneyToBudget < 0

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

  return (
    <div
      className="sticky top-0 z-10 backdrop-blur-md transition-all"
      style={{
        background: isCurrentMonth
          ? 'linear-gradient(135deg, rgba(109,40,217,0.18), rgba(37,99,235,0.12))'
          : 'var(--bg-surface)',
        borderBottom: isCurrentMonth
          ? '1px solid rgba(139,92,246,0.3)'
          : '1px solid var(--color-border)',
      }}
    >
      <div className="flex items-center px-6 gap-4" style={{ height: '56px' }}>

        {/* LEFT: Month selector */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onPrev}
            className="w-6 h-6 flex items-center justify-center text-sm transition-all"
            style={{ borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-faint)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover-strong)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          >
            ‹
          </button>

          <span className="font-semibold text-sm text-center" style={{ color: isCurrentMonth ? '#e9d5ff' : 'var(--text-primary)', width: '130px' }}>
            {monthLabel}
          </span>

          <button
            onClick={onNext}
            className="w-6 h-6 flex items-center justify-center text-sm transition-all"
            style={{ borderRadius: '8px', background: 'var(--bg-hover)', color: 'var(--text-faint)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover-strong)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          >
            ›
          </button>

          {/* NOW slot — always takes same space */}
          <div style={{ width: '36px' }} className="flex items-center justify-center ml-0.5">
            {isCurrentMonth ? (
              <span
                className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: 'rgba(139,92,246,0.25)', color: '#a78bfa' }}
              >
                NOW
              </span>
            ) : (
              <button
                onClick={onGoToCurrent}
                className="text-xs font-semibold px-1.5 py-0.5 rounded-md transition-all"
                style={{
                  background: 'rgba(109,40,217,0.15)',
                  border: '1px solid rgba(139,92,246,0.3)',
                  color: '#c4b5fd',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(109,40,217,0.25)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(109,40,217,0.15)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)' }}
              >
                NOW
              </button>
            )}
          </div>

          {/* Reset assigned */}
          <button
            onClick={onResetAssigned}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium transition-all ml-1"
            style={{
              borderRadius: '8px',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--text-faint)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--text-faint)' }}
          >
            ↺ Reset
          </button>
        </div>

        {/* CENTER: Money to Budget */}
        <div className="flex-1 flex justify-center items-center">
          <div className="text-center">
            <div
              className="text-xl font-bold"
              style={{ color: overAssigned ? '#f87171' : '#34d399' }}
            >
              {overAssigned ? `-${fmt(moneyToBudget)}` : fmt(moneyToBudget)}
            </div>
            <div
              className="text-xs font-medium flex items-center justify-center gap-1"
              style={{ color: overAssigned ? '#f87171' : '#34d399', opacity: 0.85 }}
            >
              {overAssigned && <span>⚠</span>}
              {overAssigned ? 'Overassigned' : 'Money to Budget'}
            </div>
          </div>
        </div>

        {/* RIGHT: Future budgeted */}
        <div className="flex-shrink-0 text-right" style={{ minWidth: '120px' }}>
          {futureBudgeted > 0 ? (
            <>
              <div className="text-base font-semibold" style={{ color: 'var(--text-secondary)' }}>
                {fmt(futureBudgeted)}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
                Budgeted ahead
              </div>
            </>
          ) : (
            <div className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {isFutureMonth ? 'No future budgets' : 'No future budgets'}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
