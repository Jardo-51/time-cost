import type {
  Category,
  CustomRate,
  Expense,
  ExpenseTemplate,
  IncomePeriod,
  MetaEntry,
  SyncItemMap,
  Tag,
} from '@/types'
import type { Table } from 'dexie'
import Dexie from 'dexie'
import { toPlain } from '@/db/plain'

export class TimeCostDB extends Dexie {
  expenses!: Table<Expense, string>
  categories!: Table<Category, string>
  tags!: Table<Tag, string>
  templates!: Table<ExpenseTemplate, string>
  incomePeriods!: Table<IncomePeriod, string>
  customRates!: Table<CustomRate, string>
  meta!: Table<MetaEntry, string>
  syncItems!: Table<SyncItemMap, string>

  constructor () {
    super('time-cost')
    // Schema changes go in a new this.version(n) block with an upgrade
    // function — never edit an existing version.
    this.version(1).stores({
      expenses: 'id, date, categoryId, modifiedAt',
      categories: 'id, modifiedAt',
      templates: 'id, sortOrder, modifiedAt',
      incomePeriods: 'id, effectiveFrom, modifiedAt',
      customRates: 'id, code, modifiedAt',
      meta: 'key',
      syncItems: 'localId, itemUid',
    })
    this.version(2).stores({
      expenses: 'id, date, categoryId, modifiedAt, *tagIds',
      tags: 'id, modifiedAt',
    }).upgrade(tx =>
      tx.table('expenses').toCollection().modify(expense => {
        expense.tagIds ??= []
      }),
    )
    this.version(3).stores({}).upgrade(tx =>
      tx.table('templates').toCollection().modify(template => {
        template.tagIds ??= []
      }),
    )
  }
}

export const db = new TimeCostDB()

export async function getMeta<T> (key: string): Promise<T | undefined> {
  const entry = await db.meta.get(key)
  return entry?.value as T | undefined
}

// Takes caller-supplied `unknown`, so unlike the other direct Dexie writers it
// can't guarantee its value was freshly constructed — unwrap before the put.
export async function setMeta (key: string, value: unknown): Promise<void> {
  await db.meta.put(toPlain({ key, value }))
}

export async function deleteMeta (key: string): Promise<void> {
  await db.meta.delete(key)
}
