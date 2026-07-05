import type {
  Category,
  CustomRate,
  Expense,
  ExpenseTemplate,
  IncomePeriod,
  MetaEntry,
  SyncItemMap,
} from '@/types'
import type { Table } from 'dexie'
import Dexie from 'dexie'

export class TimeCostDB extends Dexie {
  expenses!: Table<Expense, string>
  categories!: Table<Category, string>
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
  }
}

export const db = new TimeCostDB()

export async function getMeta<T> (key: string): Promise<T | undefined> {
  const entry = await db.meta.get(key)
  return entry?.value as T | undefined
}

export async function setMeta (key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}

export async function deleteMeta (key: string): Promise<void> {
  await db.meta.delete(key)
}
