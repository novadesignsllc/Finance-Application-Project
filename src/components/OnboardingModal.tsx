interface OnboardingModalProps {
  onChoice: (withPlaceholder: boolean) => void
  isDark: boolean
}

export default function OnboardingModal({ onChoice, isDark }: OnboardingModalProps) {
  return (
    <div
      className="flex h-screen w-full items-center justify-center"
      style={{ background: isDark ? '#0f0d1a' : '#f8f7ff' }}
    >
      {/* Subtle radial glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(109,40,217,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center px-6" style={{ maxWidth: 780 }}>
        {/* Header */}
        <div className="mb-10 text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-3xl"
            style={{
              background: 'linear-gradient(135deg, #6d28d9, #3b82f6)',
              boxShadow: '0 8px 32px rgba(109,40,217,0.4)',
            }}
          >
            💰
          </div>
          <h1
            className="mb-2 text-3xl font-bold"
            style={{ color: isDark ? 'rgba(255,255,255,0.95)' : '#1a1535' }}
          >
            Welcome to your budget
          </h1>
          <p className="text-base" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>
            How would you like to get started?
          </p>
        </div>

        {/* Option cards */}
        <div className="flex w-full gap-4">
          {/* Placeholder data card */}
          <button
            onClick={() => onChoice(true)}
            className="group flex flex-1 flex-col rounded-2xl p-6 text-left transition-all duration-150"
            style={{
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(109,40,217,0.25)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = isDark ? 'rgba(109,40,217,0.15)' : 'rgba(109,40,217,0.06)'
              e.currentTarget.style.borderColor = 'rgba(109,40,217,0.55)'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(109,40,217,0.25)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)'
              e.currentTarget.style.borderColor = 'rgba(109,40,217,0.25)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)'
            }}
          >
            <div className="mb-4 text-3xl">🗂️</div>
            <h2
              className="mb-1 text-lg font-semibold"
              style={{ color: isDark ? 'rgba(255,255,255,0.9)' : '#1a1535' }}
            >
              Load sample data
            </h2>
            <p className="mb-5 text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)' }}>
              Pre-filled with example categories, bills, and budget groups so you can explore the app right away.
            </p>
            <ul className="mt-auto space-y-2">
              {[
                '✓  Budget categories (Needs & Wants)',
                '✓  Sample bills & subscriptions',
                '✓  Ready to customize',
              ].map(item => (
                <li
                  key={item}
                  className="text-xs"
                  style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}
                >
                  {item}
                </li>
              ))}
            </ul>
            <div
              className="mt-6 w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, #6d28d9, #3b82f6)',
                color: 'white',
                boxShadow: '0 4px 12px rgba(109,40,217,0.3)',
              }}
            >
              Start with sample data
            </div>
          </button>

          {/* Clean slate card */}
          <button
            onClick={() => onChoice(false)}
            className="group flex flex-1 flex-col rounded-2xl p-6 text-left transition-all duration-150"
            style={{
              background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,1)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)'
            }}
          >
            <div className="mb-4 text-3xl">✨</div>
            <h2
              className="mb-1 text-lg font-semibold"
              style={{ color: isDark ? 'rgba(255,255,255,0.9)' : '#1a1535' }}
            >
              Start fresh
            </h2>
            <p className="mb-5 text-sm" style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.5)' }}>
              A completely blank account. Build your budget, accounts, and bills exactly how you want from day one.
            </p>
            <ul className="mt-auto space-y-2">
              {[
                '✓  No pre-filled data',
                '✓  Add your own accounts & categories',
                '✓  Full control from the start',
              ].map(item => (
                <li
                  key={item}
                  className="text-xs"
                  style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)' }}
                >
                  {item}
                </li>
              ))}
            </ul>
            <div
              className="mt-6 w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-all"
              style={{
                background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)',
              }}
            >
              Start fresh
            </div>
          </button>
        </div>

        <p
          className="mt-6 text-center text-xs"
          style={{ color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)' }}
        >
          You can always add, edit, or remove anything later.
        </p>
      </div>
    </div>
  )
}
