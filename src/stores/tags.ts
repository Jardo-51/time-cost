import type { SyncFields, Tag } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { CATEGORY_COLORS } from '@/constants/categories'
import { db } from '@/db'
import { toPlain } from '@/db/plain'
import { useExpensesStore } from '@/stores/expenses'
import { useSyncStore } from '@/stores/sync'
import { useTemplatesStore } from '@/stores/templates'
import { nextModifiedAt } from '@/utils/clock'

export type TagInput = Omit<Tag, keyof SyncFields>

export const useTagsStore = defineStore('tags', () => {
  const tags = ref<Tag[]>([])

  const sorted = computed(() =>
    tags.value.toSorted((a, b) => a.name.localeCompare(b.name)),
  )

  function byId (id: string): Tag | undefined {
    return tags.value.find(t => t.id === id)
  }

  function byName (name: string): Tag | undefined {
    const needle = name.trim().toLowerCase()
    return tags.value.find(t => t.name.toLowerCase() === needle)
  }

  async function hydrate (): Promise<void> {
    tags.value = (await db.tags.toArray()).filter(t => !t.deleted)
  }

  async function add (input: TagInput): Promise<Tag> {
    const tag: Tag = {
      ...input,
      name: input.name.trim(),
      id: crypto.randomUUID(),
      modifiedAt: nextModifiedAt(),
      deleted: false,
    }
    await db.tags.put(toPlain(tag))
    tags.value = [...tags.value, tag]
    useSyncStore().scheduleSync()
    return tag
  }

  async function update (id: string, patch: Partial<TagInput>): Promise<void> {
    const existing = tags.value.find(t => t.id === id)
    if (!existing) {
      return
    }
    const updated: Tag = { ...existing, ...patch, modifiedAt: nextModifiedAt() }
    await db.tags.put(toPlain(updated))
    tags.value = tags.value.map(t => (t.id === id ? updated : t))
    useSyncStore().scheduleSync()
  }

  // Resolves tag names (as typed in the expense form) to ids, creating
  // missing tags on the fly. Matching is case-insensitive; new tags get a
  // color cycled from the shared palette.
  async function ensureIds (names: string[]): Promise<string[]> {
    const ids: string[] = []
    for (const raw of names) {
      const name = raw.trim()
      if (!name) {
        continue
      }
      const existing = byName(name)
      const tag = existing
        ?? await add({ name, color: CATEGORY_COLORS[tags.value.length % CATEGORY_COLORS.length]! })
      if (!ids.includes(tag.id)) {
        ids.push(tag.id)
      }
    }
    return ids
  }

  // Tombstones the tag and detaches it from every expense and template in
  // one transaction.
  async function remove (id: string): Promise<void> {
    const existing = tags.value.find(t => t.id === id)
    if (!existing) {
      return
    }
    const now = nextModifiedAt()
    await db.transaction('rw', [db.tags, db.expenses, db.templates], async () => {
      await db.expenses
        .where('tagIds')
        .equals(id)
        .distinct()
        .modify(expense => {
          expense.tagIds = expense.tagIds.filter(tagId => tagId !== id)
          expense.modifiedAt = now
        })
      await db.templates
        .filter(t => (t.tagIds ?? []).includes(id))
        .modify(template => {
          template.tagIds = template.tagIds.filter(tagId => tagId !== id)
          template.modifiedAt = now
        })
      await db.tags.put(toPlain({ ...existing, deleted: true, modifiedAt: now }))
    })
    tags.value = tags.value.filter(t => t.id !== id)
    await Promise.all([useExpensesStore().hydrate(), useTemplatesStore().hydrate()])
    useSyncStore().scheduleSync()
  }

  return {
    tags,
    sorted,
    byId,
    byName,
    hydrate,
    add,
    update,
    ensureIds,
    remove,
  }
})
