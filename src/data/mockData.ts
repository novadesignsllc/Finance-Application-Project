export type PlanType = 'build' | 'savings' | 'spending'

export interface CategoryPlan {
  type: PlanType
  monthlyAmount?: number  // build: amount per month; spending: target per month
  goalAmount?: number     // savings: total goal
  goalDate?: string       // savings: target date (YYYY-MM-DD)
  // derived — computed at runtime, not stored
}

export interface Category {
  id: string
  name: string
  emoji: string
  assigned: number
  activity: number
  available: number
  plan?: CategoryPlan
  overspent?: boolean
  planMet?: boolean | null
}

export interface CategoryGroup {
  id: string
  name: string
  categories: Category[]
  collapsed?: boolean
}

export const mockBudgetData: CategoryGroup[] = [
  {
    id: 'needs',
    name: 'Needs',
    categories: [
      { id: 'rent', name: 'Rent / Mortgage', emoji: '🏠', assigned: 1800, activity: 0, available: 0 },
      { id: 'electric', name: 'Electric & Gas', emoji: '⚡', assigned: 120, activity: 0, available: 0 },
      { id: 'internet', name: 'Internet', emoji: '📡', assigned: 60, activity: 0, available: 0 },
      { id: 'groceries', name: 'Groceries', emoji: '🛒', assigned: 500, activity: 0, available: 0 },
      { id: 'transport', name: 'Transportation', emoji: '🚗', assigned: 200, activity: 0, available: 0 },
      { id: 'phone', name: 'Phone', emoji: '📱', assigned: 45, activity: 0, available: 0 },
      { id: 'insurance', name: 'Insurance', emoji: '🛡️', assigned: 150, activity: 0, available: 0 },
      { id: 'personal', name: 'Personal care', emoji: '🧴', assigned: 0, activity: 0, available: 0 },
      { id: 'clothing', name: 'Clothing', emoji: '👕', assigned: 0, activity: 0, available: 0 },
      { id: 'retirement', name: 'Retirement or investments', emoji: '🏆', assigned: 0, activity: 0, available: 0 },
    ],
  },
  {
    id: 'wants',
    name: 'Wants',
    categories: [
      { id: 'dining',   name: 'Dining out',                  emoji: '🍽️', assigned: 0,     activity: 0, available: 0 },
      { id: 'charity',  name: 'Charity',                     emoji: '❤️', assigned: 51.52, activity: 0, available: 0 },
      { id: 'holidays', name: 'Holidays & gifts',            emoji: '🎁', assigned: 0,     activity: 0, available: 0 },
      { id: 'decor',    name: 'Decor & garden',              emoji: '🪴', assigned: 0,     activity: 0, available: 0 },
      { id: 'shopping', name: 'Shopping',                    emoji: '🛍️', assigned: 0,     activity: 0, available: 0 },
      { id: 'travel',   name: 'Travel',                      emoji: '✈️', assigned: 0,     activity: 0, available: 0 },
      { id: 'spending', name: 'My spending money',           emoji: '💸', assigned: 0,     activity: 0, available: 0 },
    ],
  },
]

export const mockAccounts = [
  { id: 'citizens',       name: 'Citizens Bank',          type: 'cash'   },
  { id: 'chase-checking', name: 'Chase Checking',         type: 'cash'   },
  { id: 'citi',           name: 'Citi® AAdvantage',       type: 'credit' },
  { id: 'discover',       name: 'Discover It Card',       type: 'credit' },
  { id: 'chase-sapphire', name: 'Chase Sapphire Reserve', type: 'credit' },
  { id: 'amex',           name: 'Amex Gold Card',         type: 'credit' },
]

export interface Transaction {
  id: string
  accountId: string
  date: string
  payee: string
  category: string | null
  memo: string
  outflow: number | null
  inflow: number | null
  cleared: boolean
  reconciled?: boolean
}

export const mockTransactions: Transaction[] = [
  // Starting balances
  { id: 'sb-citizens',       accountId: 'citizens',       date: '01/01/2026', payee: 'Starting Balance', category: 'Money To Budget', memo: '', outflow: null,    inflow: 3683.99, cleared: true },
  { id: 'sb-chase-checking', accountId: 'chase-checking', date: '01/01/2026', payee: 'Starting Balance', category: 'Money To Budget', memo: '', outflow: null,    inflow: 1594.70, cleared: true },
  { id: 'sb-discover',       accountId: 'discover',       date: '01/01/2026', payee: 'Starting Balance', category: 'Money To Budget', memo: '', outflow: 155.33,  inflow: null,    cleared: true },
  { id: 'sb-chase-sapphire', accountId: 'chase-sapphire', date: '01/01/2026', payee: 'Starting Balance', category: 'Money To Budget', memo: '', outflow: 1042.00, inflow: null,    cleared: true },
  // Citizens Bank
  { id: 't1',  accountId: 'citizens',       date: '04/08/2026', payee: 'Whole Foods Market',      category: 'Groceries',              memo: '',                  outflow: 87.43,  inflow: null,    cleared: true  },
  { id: 't2',  accountId: 'citizens',       date: '04/07/2026', payee: 'Shell Gas Station',       category: 'Transportation',         memo: 'Fill up',           outflow: 62.10,  inflow: null,    cleared: true  },
  { id: 't3',  accountId: 'citizens',       date: '04/06/2026', payee: 'Direct Deposit',          category: null,                     memo: 'Payroll',           outflow: null,   inflow: 2800.00, cleared: true  },
  { id: 't4',  accountId: 'citizens',       date: '04/05/2026', payee: 'Netflix',                 category: 'My spending money',      memo: '',                  outflow: 15.99,  inflow: null,    cleared: true  },
  { id: 't5',  accountId: 'citizens',       date: '04/04/2026', payee: 'Landlord LLC',            category: 'Rent / Mortgage',        memo: 'April rent',        outflow: 1800.00,inflow: null,    cleared: true  },
  { id: 't6',  accountId: 'citizens',       date: '04/03/2026', payee: 'CVS Pharmacy',            category: null,                     memo: '',                  outflow: 23.47,  inflow: null,    cleared: false },
  { id: 't7',  accountId: 'citizens',       date: '04/01/2026', payee: 'Verizon Wireless',        category: 'Phone',                  memo: '',                  outflow: 45.00,  inflow: null,    cleared: true  },
  // Chase Checking
  { id: 't8',  accountId: 'chase-checking', date: '04/08/2026', payee: 'Target',                  category: 'Shopping',               memo: '',                  outflow: 54.22,  inflow: null,    cleared: true  },
  { id: 't9',  accountId: 'chase-checking', date: '04/07/2026', payee: 'Costco',                  category: 'Groceries',              memo: 'Monthly stock-up',  outflow: 214.67, inflow: null,    cleared: true  },
  { id: 't10', accountId: 'chase-checking', date: '04/06/2026', payee: 'Chipotle',                category: 'Dining out',             memo: '',                  outflow: 14.85,  inflow: null,    cleared: true  },
  { id: 't11', accountId: 'chase-checking', date: '04/05/2026', payee: 'Freelance Payment',       category: null,                     memo: 'Invoice #112',      outflow: null,   inflow: 650.00,  cleared: true  },
  { id: 't12', accountId: 'chase-checking', date: '04/03/2026', payee: 'Amazon',                  category: 'Shopping',               memo: '',                  outflow: 39.99,  inflow: null,    cleared: false },
  { id: 't13', accountId: 'chase-checking', date: '04/01/2026', payee: 'Electric & Gas Co',       category: 'Electric & Gas',         memo: 'March bill',        outflow: 97.50,  inflow: null,    cleared: true  },
  // Citi AAdvantage
  { id: 't14', accountId: 'citi',           date: '04/07/2026', payee: 'Burger King',             category: 'Dining out',             memo: '',                  outflow: 9.79,   inflow: null,    cleared: true  },
  { id: 't15', accountId: 'citi',           date: '04/05/2026', payee: 'Spotify',                 category: 'My spending money',      memo: '',                  outflow: 9.99,   inflow: null,    cleared: true  },
  { id: 't16', accountId: 'citi',           date: '04/03/2026', payee: 'United Airlines',         category: null,                     memo: 'Boston trip',       outflow: 33.48,  inflow: null,    cleared: true  },
  // Discover It
  { id: 't17', accountId: 'discover',       date: '04/08/2026', payee: 'Meijer',                  category: 'Groceries',              memo: '',                  outflow: 115.48, inflow: null,    cleared: true  },
  { id: 't18', accountId: 'discover',       date: '04/06/2026', payee: 'Best Buy',                category: null,                     memo: '',                  outflow: 139.05, inflow: null,    cleared: false },
  { id: 't19', accountId: 'discover',       date: '04/04/2026', payee: 'GRILLERZ',               category: null,                     memo: '',                  outflow: 19.02,  inflow: null,    cleared: true  },
  { id: 't20', accountId: 'discover',       date: '04/02/2026', payee: 'Payment',                 category: 'Credit Card Payments',   memo: '',                  outflow: null,   inflow: 214.00,  cleared: true  },
  // Chase Sapphire
  { id: 't21', accountId: 'chase-sapphire', date: '04/08/2026', payee: 'Franciscan Alliance',     category: null,                     memo: '',                  outflow: 244.82, inflow: null,    cleared: true  },
  { id: 't22', accountId: 'chase-sapphire', date: '04/07/2026', payee: 'Uber Eats',               category: 'Dining out',             memo: '',                  outflow: 31.50,  inflow: null,    cleared: true  },
  { id: 't23', accountId: 'chase-sapphire', date: '04/05/2026', payee: 'Hotel Indigo',            category: 'Travel',                 memo: 'Conference stay',   outflow: 389.00, inflow: null,    cleared: true  },
  { id: 't24', accountId: 'chase-sapphire', date: '04/03/2026', payee: 'Delta Airlines',          category: 'Travel',                 memo: '',                  outflow: 376.83, inflow: null,    cleared: true  },
  { id: 't25', accountId: 'chase-sapphire', date: '04/01/2026', payee: 'Payment',                 category: 'Credit Card Payments',   memo: '',                  outflow: null,   inflow: 1042.00, cleared: true  },
  // Amex Gold
  { id: 't26', accountId: 'amex',           date: '04/08/2026', payee: 'Nobu Restaurant',         category: 'Dining out',             memo: 'Anniversary dinner',outflow: 187.50, inflow: null,    cleared: true  },
  { id: 't27', accountId: 'amex',           date: '04/06/2026', payee: 'Trader Joe\'s',           category: 'Groceries',              memo: '',                  outflow: 76.40,  inflow: null,    cleared: true  },
  { id: 't28', accountId: 'amex',           date: '04/04/2026', payee: 'REI Co-op',               category: null,                     memo: '',                  outflow: 123.60, inflow: null,    cleared: false },
]
