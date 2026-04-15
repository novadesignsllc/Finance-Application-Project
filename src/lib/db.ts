import { supabase } from './supabase'
import type { Account } from '../components/Sidebar'
import type { CategoryGroup, Transaction, CategoryPlan } from '../data/mockData'

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
}

export async function loadAll(userId: string): Promise<AppData> {
  const [
    { data: dbAccounts },
    { data: dbGroups },
    { data: dbCategories },
    { data: dbBudgetMonths },
    { data: dbTransactions },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('category_groups').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('categories').select('*').eq('user_id', userId).order('sort_order'),
    supabase.from('budget_months').select('*').eq('user_id', userId),
    supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
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
    // Real categories resolved by name; special categories stored in category_text
    category: tx.category_id
      ? (catIdToName.get(tx.category_id as string) ?? null)
      : ((tx.category_text as string) ?? null),
    memo: (tx.memo as string) || '',
    outflow: tx.outflow !== null ? Number(tx.outflow) : null,
    inflow: tx.inflow !== null ? Number(tx.inflow) : null,
    cleared: tx.cleared as boolean,
    reconciled: (tx.reconciled as boolean) ?? false,
  }))

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

  const catRows = groups.flatMap((g, _gi) =>
    g.categories.map((c, ci) => ({
      id: c.id,
      user_id: userId,
      group_id: g.id,
      name: c.name,
      emoji: c.emoji,
      sort_order: ci,
      plan: c.plan ?? null,
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
  await supabase.from('budget_months').upsert(
    { user_id: userId, category_id: catId, month: `${monthKey}-01`, assigned },
    { onConflict: 'user_id,category_id,month' }
  )
}

// ── Transactions ──────────────────────────────────────────────────

function txToRow(userId: string, tx: Transaction, catNameToId: Map<string, string>) {
  const categoryId = tx.category ? (catNameToId.get(tx.category) ?? null) : null
  return {
    id: tx.id,
    user_id: userId,
    account_id: tx.accountId,
    category_id: categoryId,
    // Keep text for special categories ("Money To Budget", credit card names)
    category_text: !categoryId && tx.category ? tx.category : null,
    date: toDbDate(tx.date),
    payee: tx.payee,
    memo: tx.memo || '',
    outflow: tx.outflow,
    inflow: tx.inflow,
    cleared: tx.cleared,
    reconciled: tx.reconciled ?? false,
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
