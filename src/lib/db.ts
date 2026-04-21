import { supabase } from './supabase'
import type { Account } from '../components/Sidebar'
import { mockBudgetData } from '../data/mockData'
import type { CategoryGroup, Transaction, CategoryPlan, RepeatInterval } from '../data/mockData'
import { getNextPaymentDate } from '../data/billData'
import type { BillGroup, BillFrequency } from '../data/billData'

// ── Date helpers ──────────────────────────────────────────────────
// App uses MM/DD/YYYY; Supabase date columns use YYYY-MM-DD

function toDbDate(mmddyyyy: string): string {
  const [m, d, y] = mmddyyyy.split('/')
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function fromDbDate(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-')
  return `${m}/${d}/${y}`
}

// ── Load all user data ────────────────────────────────────────────

export interface AppData {
  accounts: Account[]
  closedAccountIds: Set<string>
  budgetGroups: CategoryGroup[]
  monthlyAssigned: Record<string, Record<string, number>>
  transactions: Transaction[]
  billGroups: BillGroup[]
}

export async function loadAll(userId: string): Promise<AppData> {
  const [
    { data: dbAccounts },
    { data: dbGroups },
    { data: dbCategories },
    { data: dbBudgetMonths },
    { data: dbTransactions },
    { data: dbBillGroups },
    { data: dbBills },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('category_groups').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('categories').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('budget_months').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
    supabase.from('bill_groups').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('bills').select('*').eq('user_id', userId).order('sort_order'),
  ])

  // Category ID → name map (for transaction display)
  const catIdToName = new Map<string, string>()
  dbCategories?.forEach(c => catIdToName.set(c.id as string, c.name as string))

  // Build budgetGroups
  const groupsMap = new Map<string, CategoryGroup>()
  dbGroups?.forEach(g => {
    groupsMap.set(g.id as string, { id: g.id as string, name: g.name as string, categories: [] })
  })
  dbCategories?.forEach(c => {
    const group = groupsMap.get(c.group_id as string)
    if (group) {
      group.categories.push({
        id: c.id as string,
        name: c.name as string,
        emoji: (c.emoji as string) || '📁',
        assigned: 0,
        activity: 0,
        available: 0,
        plan: (c.plan as CategoryPlan) ?? undefined,
        debtPayoffDate: (c.debt_payoff_date as string) ?? undefined,
        archived: (c.archived as boolean) ?? false,
      })
    }
  })

  // Build monthlyAssigned: YYYY-MM → { catId: amount }
  const monthlyAssigned: Record<string, Record<string, number>> = {}
  dbBudgetMonths?.forEach(bm => {
    const mk = (bm.month as string).slice(0, 7) // '2026-04-01' → '2026-04'
    if (!monthlyAssigned[mk]) monthlyAssigned[mk] = {}
    monthlyAssigned[mk][bm.category_id as string] = Number(bm.assigned)
  })

  // Build transactions
  const transactions: Transaction[] = (dbTransactions ?? []).map(tx => ({
    id: tx.id as string,
    accountId: tx.account_id as string,
    date: fromDbDate(tx.date as string),
    payee: tx.payee as string,
    category: tx.category_id
      ? (catIdToName.get(tx.category_id as string) ?? null)
      : ((tx.category_text as string) ?? null),
    memo: (tx.memo as string) || '',
    outflow: tx.outflow !== null ? Number(tx.outflow) : null,
    inflow: tx.inflow !== null ? Number(tx.inflow) : null,
    cleared: tx.cleared as boolean,
    reconciled: (tx.reconciled as boolean) ?? false,
    repeat: (tx.repeat as RepeatInterval) ?? undefined,
  }))

  // Build billGroups
  const billGroupsMap = new Map<string, BillGroup>()
  ;(dbBillGroups ?? []).forEach(g => {
    billGroupsMap.set(g.id as string, {
      id: g.id as string,
      name: g.name as string,
      bills: [],
      collapsed: (g.collapsed as boolean) ?? false,
    })
  })
  ;(dbBills ?? []).forEach(b => {
    const group = billGroupsMap.get(b.group_id as string)
    if (group) {
      group.bills.push({
        id: b.id as string,
        name: b.name as string,
        emoji: (b.emoji as string) || '📋',
        accountId: (b.account_id as string) || '',
        frequency: (b.frequency as BillFrequency) || 'monthly',
        amount: Number(b.amount),
        dueDate: (b.due_date as string) || '',
        linkedTransactionId: (b.linked_transaction_id as string) ?? undefined,
      })
    }
  })

  const closedAccountIds = new Set<string>(
    (dbAccounts ?? []).filter(a => a.closed).map(a => a.id as string)
  )

  return {
    accounts: (dbAccounts ?? []).map(a => ({
      id: a.id as string,
      name: a.name as string,
      type: a.type as string,
    })),
    closedAccountIds,
    budgetGroups: [...groupsMap.values()],
    monthlyAssigned,
    transactions,
    billGroups: [...billGroupsMap.values()],
  }
}

// ── Seed default budget for new users ────────────────────────────

export async function seedDefaultBudget(userId: string, template: CategoryGroup[]): Promise<CategoryGroup[]> {
  const seeded: CategoryGroup[] = []
  for (let gi = 0; gi < template.length; gi++) {
    const g = template[gi]
    const { data: gRow, error: gErr } = await supabase
      .from('category_groups')
      .insert({ user_id: userId, name: g.name, sort_order: gi })
      .select('id')
      .single()
    if (gErr) throw gErr

    const seededCats = []
    for (let ci = 0; ci < g.categories.length; ci++) {
      const c = g.categories[ci]
      const { data: cRow, error: cErr } = await supabase
        .from('categories')
        .insert({ user_id: userId, group_id: gRow.id, name: c.name, emoji: c.emoji, sort_order: ci })
        .select('id')
        .single()
      if (cErr) throw cErr
      seededCats.push({ ...c, id: cRow.id as string })
    }
    seeded.push({ id: gRow.id as string, name: g.name, categories: seededCats })
  }
  return seeded
}

// ── Accounts ──────────────────────────────────────────────────────

export async function saveAccount(userId: string, account: Account, sortOrder: number): Promise<void> {
  await supabase.from('accounts').upsert({
    id: account.id,
    user_id: userId,
    name: account.name,
    type: account.type,
    sort_order: sortOrder,
    closed: false,
  })
}

export async function setAccountClosed(id: string, closed: boolean): Promise<void> {
  await supabase.from('accounts').update({ closed }).eq('id', id)
}

export async function removeAccount(id: string): Promise<void> {
  await supabase.from('accounts').delete().eq('id', id)
}

// ── Category groups & categories ──────────────────────────────────

export async function saveGroups(userId: string, groups: CategoryGroup[]): Promise<void> {
  if (groups.length === 0) return

  await supabase.from('category_groups').upsert(
    groups.map((g, i) => ({ id: g.id, user_id: userId, name: g.name, sort_order: i }))
  )

  const catRows = groups.flatMap((g) =>
    g.categories.map((c, ci) => ({
      id: c.id,
      user_id: userId,
      group_id: g.id,
      name: c.name,
      emoji: c.emoji,
      sort_order: ci,
      plan: c.plan ?? null,
      debt_payoff_date: c.debtPayoffDate ?? null,
      archived: c.archived ?? false,
    }))
  )
  if (catRows.length > 0) {
    await supabase.from('categories').upsert(catRows)
  }
}

// ── Monthly assigned ──────────────────────────────────────────────

export async function saveAssigned(
  userId: string,
  catId: string,
  monthKey: string, // 'YYYY-MM'
  assigned: number,
): Promise<void> {
  // Synthetic category IDs (e.g. cc-payment-<accountId>) are not real DB UUIDs — skip them
  if (!UUID_RE.test(catId)) return
  await supabase.from('budget_months').upsert(
    { user_id: userId, category_id: catId, month: `${monthKey}-01`, assigned },
    { onConflict: 'user_id,category_id,month' }
  )
}

// ── Transactions ──────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function txToRow(userId: string, tx: Transaction, catNameToId: Map<string, string>) {
  // Only use category_id if it resolves to a real DB UUID.
  // Synthetic IDs like "cc-payment-<accountId>" exist in state but not in the DB.
  const rawId = tx.category ? (catNameToId.get(tx.category) ?? null) : null
  const categoryId = rawId && UUID_RE.test(rawId) ? rawId : null
  return {
    id: tx.id,
    user_id: userId,
    account_id: tx.accountId,
    category_id: categoryId,
    category_text: !categoryId && tx.category ? tx.category : null,
    date: toDbDate(tx.date),
    payee: tx.payee,
    memo: tx.memo || '',
    outflow: tx.outflow,
    inflow: tx.inflow,
    cleared: tx.cleared,
    reconciled: tx.reconciled ?? false,
    repeat: tx.repeat ?? null,
    is_starting_balance: tx.payee === 'Starting Balance',
  }
}

export async function saveTransaction(
  userId: string,
  tx: Transaction,
  catNameToId: Map<string, string>,
): Promise<void> {
  await supabase.from('transactions').upsert(txToRow(userId, tx, catNameToId))
}

export async function removeTransaction(id: string): Promise<void> {
  await supabase.from('transactions').delete().eq('id', id)
}

// ── Seed full sample dataset for new users ────────────────────────
//
// Creates: 4 accounts (1 checking, 1 savings, 2 credit), 2 months of
// realistic transactions with categorised income, pre-linked bill
// transactions, and sample monthly allocations.

export async function seedSampleData(userId: string): Promise<{
  budgetGroups: CategoryGroup[]
  accounts: Account[]
  transactions: Transaction[]
  billGroups: BillGroup[]
  monthlyAssigned: Record<string, Record<string, number>>
}> {
  // 1. Seed budget categories — returns groups with real Supabase UUIDs
  const budgetGroups = await seedDefaultBudget(userId, mockBudgetData)

  // 2. Build name ↔ id maps
  const catNameToId = new Map<string, string>()
  const catIdToName = new Map<string, string>()
  budgetGroups.forEach(g => g.categories.forEach(c => {
    catNameToId.set(c.name, c.id)
    catIdToName.set(c.id, c.name)
  }))

  // 3. Generate account IDs
  const chkId = crypto.randomUUID()
  const savId = crypto.randomUUID()
  const sapId = crypto.randomUUID()
  const disId = crypto.randomUUID()

  // 4. Insert accounts
  const { error: acctErr } = await supabase.from('accounts').insert([
    { id: chkId, user_id: userId, name: 'Chase Checking',         type: 'checking', sort_order: 0, closed: false },
    { id: savId, user_id: userId, name: 'Ally High-Yield Savings', type: 'savings',  sort_order: 1, closed: false },
    { id: sapId, user_id: userId, name: 'Chase Sapphire Reserve',  type: 'credit',   sort_order: 2, closed: false },
    { id: disId, user_id: userId, name: 'Discover It Card',        type: 'credit',   sort_order: 3, closed: false },
  ])
  if (acctErr) throw new Error(`seedSampleData accounts: ${acctErr.message}`)

  // 5. Build transaction rows (DB-format dates: YYYY-MM-DD)
  const cat = (name: string) => catNameToId.get(name) ?? null
  const mkTx = (
    id: string,
    accountId: string, date: string, payee: string,
    outflow: number | null, inflow: number | null,
    categoryName: string | null, memo: string, cleared: boolean,
    repeat: string | null = null,
  ) => ({
    id,
    user_id: userId,
    account_id: accountId,
    date,
    payee,
    outflow,
    inflow,
    category_id: categoryName ? cat(categoryName) : null,
    category_text: categoryName && !cat(categoryName) ? categoryName : null,
    memo,
    cleared,
    reconciled: false,
    repeat,
    is_starting_balance: payee === 'Starting Balance',
  })

  // Helper so inline calls don't need an explicit id for normal txs
  const tx = (
    accountId: string, date: string, payee: string,
    outflow: number | null, inflow: number | null,
    categoryName: string | null, memo: string, cleared: boolean,
  ) => mkTx(crypto.randomUUID(), accountId, date, payee, outflow, inflow, categoryName, memo, cleared)

  const txRows = [
    // ── Starting balances ──────────────────────────────────────────
    tx(chkId, '2026-03-01', 'Starting Balance', null,   4200.00, 'Money To Allocate', '',                  true),
    tx(savId, '2026-03-01', 'Starting Balance', null,   8500.00, 'Money To Allocate', '',                  true),
    tx(sapId, '2026-03-01', 'Starting Balance', 342.18, null,    'Money To Allocate', '',                  true),
    tx(disId, '2026-03-01', 'Starting Balance', 88.45,  null,    'Money To Allocate', '',                  true),

    // ── March – income (category = 'Income' so IncomeView picks them up)
    tx(chkId, '2026-03-01', 'Direct Deposit',    null, 3200.00, 'Income', 'Payroll',      true),
    tx(chkId, '2026-03-15', 'Direct Deposit',    null, 3200.00, 'Income', 'Payroll',      true),
    tx(chkId, '2026-03-22', 'Freelance Payment', null,  650.00, 'Income', 'Invoice #108', true),
    tx(savId, '2026-03-31', 'Interest',          null,   12.34, 'Income', 'Monthly interest', true),

    // ── March – Chase Checking ─────────────────────────────────────
    tx(chkId, '2026-03-01', 'Landlord LLC',      1800.00, null, 'Rent / Mortgage', 'March rent',       true),
    tx(chkId, '2026-03-01', 'Verizon Wireless',    45.00, null, 'Phone',           '',                  true),
    tx(chkId, '2026-03-03', 'Whole Foods Market',  92.14, null, 'Groceries',       '',                  true),
    tx(chkId, '2026-03-05', 'GEICO Insurance',    185.00, null, 'Insurance',       '',                  true),
    tx(chkId, '2026-03-07', 'Shell Gas Station',   58.40, null, 'Transportation',  'Fill up',           true),
    tx(chkId, '2026-03-10', 'PSE&G',               97.50, null, 'Electric & Gas',  'March bill',        true),
    tx(chkId, '2026-03-12', 'Costco',             187.22, null, 'Groceries',       'Monthly stock-up',  true),
    tx(chkId, '2026-03-15', 'AT&T Internet',       69.99, null, 'Internet',        '',                  true),
    tx(chkId, '2026-03-18', 'Target',              44.88, null, 'Shopping',        '',                  true),
    tx(chkId, '2026-03-20', 'Walgreens',           18.65, null, 'Personal care',   '',                  true),
    tx(chkId, '2026-03-25', 'Amazon',              56.99, null, 'Shopping',        '',                  true),

    // ── March – Chase Sapphire ─────────────────────────────────────
    tx(sapId, '2026-03-04', 'Uber Eats',            28.35, null, 'Dining out',  '',                   true),
    tx(sapId, '2026-03-08', 'Delta Airlines',      312.00, null, 'Travel',      '',                   true),
    tx(sapId, '2026-03-10', 'Starbucks',             6.75, null, 'Dining out',  '',                   true),
    tx(sapId, '2026-03-15', 'Amazon',               67.99, null, 'Shopping',    '',                   true),
    tx(sapId, '2026-03-22', 'Nobu Restaurant',     145.00, null, 'Dining out',  'Anniversary dinner', true),
    tx(sapId, '2026-03-28', 'Payment',               null, 342.18, 'Credit Card Payments', '',        true),

    // ── March – Discover It ────────────────────────────────────────
    tx(disId, '2026-03-02', 'Payment',               null,  88.45, 'Credit Card Payments', '',        true),
    tx(disId, '2026-03-06', 'Meijer',              103.22, null,   'Groceries',   '',                  true),
    tx(disId, '2026-03-11', 'Chipotle',             13.85, null,   'Dining out',  '',                  true),
    tx(disId, '2026-03-14', 'Best Buy',            129.99, null,   'Shopping',    '',                  true),
    tx(disId, '2026-03-23', 'Netflix',              15.99, null,   'My spending money', '',            true),

    // ── April – income ─────────────────────────────────────────────
    tx(chkId, '2026-04-01', 'Direct Deposit',    null, 3200.00, 'Income', 'Payroll', true),
    tx(chkId, '2026-04-15', 'Direct Deposit',    null, 3200.00, 'Income', 'Payroll', true),

    // ── April – Chase Checking ─────────────────────────────────────
    tx(chkId, '2026-04-01', 'Landlord LLC',      1800.00, null, 'Rent / Mortgage', 'April rent',      true),
    tx(chkId, '2026-04-01', 'Verizon Wireless',    45.00, null, 'Phone',           '',                 true),
    tx(chkId, '2026-04-03', 'Whole Foods Market',  78.65, null, 'Groceries',       '',                 true),
    tx(chkId, '2026-04-05', 'GEICO Insurance',    185.00, null, 'Insurance',       '',                 true),
    tx(chkId, '2026-04-06', 'Shell Gas Station',   61.20, null, 'Transportation',  'Fill up',          true),
    tx(chkId, '2026-04-09', 'Costco',             203.40, null, 'Groceries',       'Monthly stock-up', true),
    tx(chkId, '2026-04-10', 'PSE&G',               97.50, null, 'Electric & Gas',  'April bill',       true),
    tx(chkId, '2026-04-14', 'Amazon',              89.99, null, 'Shopping',        '',                 false),
    tx(chkId, '2026-04-15', 'AT&T Internet',       69.99, null, 'Internet',        '',                 true),
    tx(chkId, '2026-04-17', 'Target',              52.38, null, 'Shopping',        '',                 false),

    // ── April – Chase Sapphire ─────────────────────────────────────
    tx(sapId, '2026-04-04', 'Uber Eats',            31.50, null, 'Dining out', '',                  true),
    tx(sapId, '2026-04-07', 'Hotel Indigo',        389.00, null, 'Travel',     'Conference stay',   true),
    tx(sapId, '2026-04-08', "Trader Joe's",          76.40, null, 'Groceries', '',                  true),
    tx(sapId, '2026-04-08', 'Spotify',               9.99, null, 'My spending money', '',           true),
    tx(sapId, '2026-04-12', 'Payment',               null, 560.09, 'Credit Card Payments', '',      true),
    tx(sapId, '2026-04-16', 'Starbucks',              7.25, null, 'Dining out', '',                  false),

    // ── April – Discover It ────────────────────────────────────────
    tx(disId, '2026-04-02', 'Target',               54.22, null, 'Shopping',          '',            true),
    tx(disId, '2026-04-05', 'Payment',               null, 263.05, 'Credit Card Payments', '',       true),
    tx(disId, '2026-04-06', 'Best Buy',             139.05, null, 'Shopping',          '',            true),
    tx(disId, '2026-04-10', 'Chipotle',              22.40, null, 'Dining out',        '',            true),
    tx(disId, '2026-04-12', 'Disney+',               13.99, null, 'My spending money', '',            true),
    tx(disId, '2026-04-18', 'Meijer',                94.61, null, 'Groceries',         '',            false),
  ]

  // 6. Define bills, generate a linked transaction for each, add to txRows
  const bgNeedsId = crypto.randomUUID()
  const bgSubsId  = crypto.randomUUID()

  type BillDef = { id: string; groupId: string; name: string; emoji: string; accountId: string; frequency: BillFrequency; amount: number; dueDate: string; sortOrder: number }
  const billDefs: BillDef[] = [
    { id: crypto.randomUUID(), groupId: bgNeedsId, name: 'Rent / Mortgage', emoji: '🏠', accountId: chkId, frequency: 'monthly', amount: 1800.00, dueDate: '2026-04-01', sortOrder: 0 },
    { id: crypto.randomUUID(), groupId: bgNeedsId, name: 'Electric & Gas',  emoji: '⚡', accountId: chkId, frequency: 'monthly', amount:   97.50, dueDate: '2026-04-10', sortOrder: 1 },
    { id: crypto.randomUUID(), groupId: bgNeedsId, name: 'Internet',        emoji: '📡', accountId: chkId, frequency: 'monthly', amount:   69.99, dueDate: '2026-04-15', sortOrder: 2 },
    { id: crypto.randomUUID(), groupId: bgNeedsId, name: 'Verizon Wireless',emoji: '📱', accountId: chkId, frequency: 'monthly', amount:   45.00, dueDate: '2026-04-01', sortOrder: 3 },
    { id: crypto.randomUUID(), groupId: bgNeedsId, name: 'GEICO Insurance', emoji: '🛡️', accountId: chkId, frequency: 'monthly', amount:  185.00, dueDate: '2026-04-05', sortOrder: 4 },
    { id: crypto.randomUUID(), groupId: bgSubsId,  name: 'Netflix',         emoji: '🎬', accountId: disId, frequency: 'monthly', amount:   15.99, dueDate: '2026-04-23', sortOrder: 0 },
    { id: crypto.randomUUID(), groupId: bgSubsId,  name: 'Spotify',         emoji: '🎵', accountId: sapId, frequency: 'monthly', amount:    9.99, dueDate: '2026-04-08', sortOrder: 1 },
    { id: crypto.randomUUID(), groupId: bgSubsId,  name: 'Disney+',         emoji: '🏰', accountId: disId, frequency: 'monthly', amount:   13.99, dueDate: '2026-04-12', sortOrder: 2 },
    { id: crypto.randomUUID(), groupId: bgSubsId,  name: 'iCloud+',         emoji: '☁️', accountId: chkId, frequency: 'monthly', amount:    2.99, dueDate: '2026-04-20', sortOrder: 3 },
  ]

  // For each bill create a linked upcoming transaction at the next due date
  const linkedTxIds = new Map<string, string>()
  for (const b of billDefs) {
    const nextDate = getNextPaymentDate(b.dueDate, b.frequency)
    if (!nextDate) continue
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0')
    const dd = String(nextDate.getDate()).padStart(2, '0')
    const isoDate = `${nextDate.getFullYear()}-${mm}-${dd}`
    const txId = crypto.randomUUID()
    linkedTxIds.set(b.id, txId)
    txRows.push(mkTx(txId, b.accountId, isoDate, b.name, b.amount, null, b.name, '', false, b.frequency))
  }

  const { error: txErr } = await supabase.from('transactions').insert(txRows)
  if (txErr) throw new Error(`seedSampleData transactions: ${txErr.message}`)

  // 7. Insert bill groups + bills (with linked_transaction_id set)
  const { error: bgErr } = await supabase.from('bill_groups').insert([
    { id: bgNeedsId, user_id: userId, name: 'Needs',         sort_order: 0, collapsed: false },
    { id: bgSubsId,  user_id: userId, name: 'Subscriptions', sort_order: 1, collapsed: false },
  ])
  if (bgErr) throw new Error(`seedSampleData bill_groups: ${bgErr.message}`)

  const { error: billErr } = await supabase.from('bills').insert(
    billDefs.map(b => ({
      id: b.id,
      user_id: userId,
      group_id: b.groupId,
      name: b.name,
      emoji: b.emoji,
      account_id: b.accountId,
      frequency: b.frequency,
      amount: b.amount,
      due_date: b.dueDate,
      sort_order: b.sortOrder,
      linked_transaction_id: linkedTxIds.get(b.id) ?? null,
    }))
  )
  if (billErr) throw new Error(`seedSampleData bills: ${billErr.message}`)

  // 8. Seed sample monthly allocations for March + April
  const allocationPlan: Record<string, number> = {
    'Rent / Mortgage':             1800,
    'Electric & Gas':               100,
    'Internet':                      70,
    'Groceries':                     400,
    'Transportation':                 80,
    'Phone':                          50,
    'Insurance':                     185,
    'Personal care':                  50,
    'Clothing':                      100,
    'Retirement or investments':     200,
    'Dining out':                    200,
    'Charity':                        50,
    'Holidays & gifts':               50,
    'Decor & garden':                  0,
    'Shopping':                      150,
    'Travel':                        400,
    'My spending money':             100,
  }

  const budgetMonthRows: { user_id: string; category_id: string; month: string; assigned: number }[] = []
  const monthlyAssigned: Record<string, Record<string, number>> = {}

  for (const monthKey of ['2026-03', '2026-04']) {
    monthlyAssigned[monthKey] = {}
    for (const [catName, amount] of Object.entries(allocationPlan)) {
      const catId = catNameToId.get(catName)
      if (!catId || amount === 0) continue
      budgetMonthRows.push({ user_id: userId, category_id: catId, month: `${monthKey}-01`, assigned: amount })
      monthlyAssigned[monthKey][catId] = amount
    }
  }

  if (budgetMonthRows.length > 0) {
    const { error: bmErr } = await supabase.from('budget_months').insert(budgetMonthRows)
    if (bmErr) throw new Error(`seedSampleData budget_months: ${bmErr.message}`)
  }

  // 9. Build return values for app state hydration
  const accounts: Account[] = [
    { id: chkId, name: 'Chase Checking',         type: 'checking' },
    { id: savId, name: 'Ally High-Yield Savings', type: 'savings'  },
    { id: sapId, name: 'Chase Sapphire Reserve',  type: 'credit'   },
    { id: disId, name: 'Discover It Card',        type: 'credit'   },
  ]

  const transactions: Transaction[] = txRows.map(row => ({
    id: row.id,
    accountId: row.account_id,
    date: fromDbDate(row.date),
    payee: row.payee,
    category: row.category_id
      ? (catIdToName.get(row.category_id) ?? null)
      : (row.category_text ?? null),
    memo: row.memo,
    outflow: row.outflow,
    inflow: row.inflow,
    cleared: row.cleared,
    reconciled: false,
    repeat: row.repeat as RepeatInterval | undefined,
  }))

  const billGroups: BillGroup[] = [
    {
      id: bgNeedsId, name: 'Needs', collapsed: false,
      bills: billDefs.filter(b => b.groupId === bgNeedsId).map(b => ({
        id: b.id, name: b.name, emoji: b.emoji,
        accountId: b.accountId,
        frequency: b.frequency,
        amount: b.amount,
        dueDate: b.dueDate,
        linkedTransactionId: linkedTxIds.get(b.id),
      })),
    },
    {
      id: bgSubsId, name: 'Subscriptions', collapsed: false,
      bills: billDefs.filter(b => b.groupId === bgSubsId).map(b => ({
        id: b.id, name: b.name, emoji: b.emoji,
        accountId: b.accountId,
        frequency: b.frequency,
        amount: b.amount,
        dueDate: b.dueDate,
        linkedTransactionId: linkedTxIds.get(b.id),
      })),
    },
  ]

  return { budgetGroups, accounts, transactions, billGroups, monthlyAssigned }
}

// ── User profile ──────────────────────────────────────────────────

export async function saveProfile(userId: string, displayName: string): Promise<void> {
  await supabase.from('profiles').upsert({ user_id: userId, display_name: displayName })
}

export async function saveGradientColors(userId: string, colors: string[]): Promise<void> {
  await supabase.from('profiles').upsert({ user_id: userId, gradient_colors: colors })
}

export async function loadProfile(userId: string): Promise<{ displayName: string | null; gradientColors: string[] | null }> {
  const { data } = await supabase.from('profiles').select('display_name, gradient_colors').eq('user_id', userId).single()
  return {
    displayName: (data?.display_name as string) ?? null,
    gradientColors: (data?.gradient_colors as string[]) ?? null,
  }
}

// ── Reset all user data ───────────────────────────────────────────

export async function resetUserData(userId: string): Promise<void> {
  // Delete in order that respects foreign key constraints
  await supabase.from('transactions').delete().eq('user_id', userId)
  await supabase.from('budget_months').delete().eq('user_id', userId)
  await supabase.from('bills').delete().eq('user_id', userId)
  await supabase.from('bill_groups').delete().eq('user_id', userId)
  await supabase.from('categories').delete().eq('user_id', userId)
  await supabase.from('category_groups').delete().eq('user_id', userId)
  await supabase.from('accounts').delete().eq('user_id', userId)
  await supabase.from('profiles').delete().eq('user_id', userId)
}

// ── Bills ─────────────────────────────────────────────────────────

export async function saveBillGroups(userId: string, groups: BillGroup[]): Promise<void> {
  // 1. Upsert all current groups
  if (groups.length > 0) {
    await supabase.from('bill_groups').upsert(
      groups.map((g, i) => ({
        id: g.id,
        user_id: userId,
        name: g.name,
        sort_order: i,
        collapsed: g.collapsed ?? false,
      }))
    )
  }

  // 2. Upsert all current bills
  const billRows = groups.flatMap((g) =>
    g.bills.map((b, bi) => ({
      id: b.id,
      user_id: userId,
      group_id: g.id,
      name: b.name,
      emoji: b.emoji,
      account_id: b.accountId || null,
      frequency: b.frequency,
      amount: b.amount,
      due_date: b.dueDate || null,
      linked_transaction_id: b.linkedTransactionId ?? null,
      sort_order: bi,
    }))
  )
  if (billRows.length > 0) {
    await supabase.from('bills').upsert(billRows)
  }

  // 3. Delete bills that were removed
  const currentBillIds = billRows.map(b => b.id)
  const { data: existingBills } = await supabase
    .from('bills').select('id').eq('user_id', userId)
  const billsToDelete = (existingBills ?? [])
    .map(b => b.id as string)
    .filter(id => !currentBillIds.includes(id))
  if (billsToDelete.length > 0) {
    await supabase.from('bills').delete().in('id', billsToDelete)
  }

  // 4. Delete groups that were removed (cascade removes their bills too)
  const currentGroupIds = groups.map(g => g.id)
  const { data: existingGroups } = await supabase
    .from('bill_groups').select('id').eq('user_id', userId)
  const groupsToDelete = (existingGroups ?? [])
    .map(g => g.id as string)
    .filter(id => !currentGroupIds.includes(id))
  if (groupsToDelete.length > 0) {
    await supabase.from('bill_groups').delete().in('id', groupsToDelete)
  }
}
