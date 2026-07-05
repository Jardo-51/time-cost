import type { Category } from '@/types'

export const OTHER_CATEGORY_ID = 'default-other'

// Deterministic ids: two devices that seed independently and later sync
// merge these instead of duplicating them.
export const DEFAULT_CATEGORIES: Array<Omit<Category, 'modifiedAt' | 'deleted'>> = [
  { id: 'default-food', name: 'Food', icon: 'mdi-food', color: '#E53935' },
  { id: 'default-transport', name: 'Transport', icon: 'mdi-bus', color: '#1E88E5' },
  { id: 'default-housing', name: 'Housing', icon: 'mdi-home-city', color: '#8E24AA' },
  { id: 'default-entertainment', name: 'Entertainment', icon: 'mdi-movie-open', color: '#FB8C00' },
  { id: 'default-health', name: 'Health', icon: 'mdi-heart-pulse', color: '#43A047' },
  { id: 'default-shopping', name: 'Shopping', icon: 'mdi-shopping', color: '#00ACC1' },
  { id: OTHER_CATEGORY_ID, name: 'Other', icon: 'mdi-dots-horizontal-circle', color: '#757575', isProtected: true },
]

// Curated choices for the category editor.
export const CATEGORY_ICONS = [
  'mdi-food',
  'mdi-food-apple',
  'mdi-coffee',
  'mdi-glass-cocktail',
  'mdi-bus',
  'mdi-car',
  'mdi-train',
  'mdi-airplane',
  'mdi-gas-station',
  'mdi-home-city',
  'mdi-lightning-bolt',
  'mdi-water',
  'mdi-movie-open',
  'mdi-gamepad-variant',
  'mdi-music',
  'mdi-book-open-variant',
  'mdi-heart-pulse',
  'mdi-pill',
  'mdi-dumbbell',
  'mdi-shopping',
  'mdi-tshirt-crew',
  'mdi-gift',
  'mdi-cellphone',
  'mdi-laptop',
  'mdi-paw',
  'mdi-baby-carriage',
  'mdi-school',
  'mdi-briefcase',
  'mdi-bank',
  'mdi-dots-horizontal-circle',
]

export const CATEGORY_COLORS = [
  '#E53935',
  '#D81B60',
  '#8E24AA',
  '#5E35B1',
  '#3949AB',
  '#1E88E5',
  '#00ACC1',
  '#00897B',
  '#43A047',
  '#7CB342',
  '#C0CA33',
  '#FDD835',
  '#FB8C00',
  '#F4511E',
  '#6D4C41',
  '#757575',
]
