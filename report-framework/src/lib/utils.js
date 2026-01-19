import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import numeral from 'numeral'
import { format, formatDistanceToNow, parseISO } from 'date-fns'

/**
 * Utility function to merge Tailwind CSS classes with clsx
 * @param {...any} inputs - Class names or conditional class objects
 * @returns {string} - Merged class string
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Number formatting utilities using numeral.js
 */
export const fmt = {
  /**
   * Format as integer with thousand separators
   * @param {number} value
   * @returns {string} e.g., "1,234,567"
   */
  number: (value) => {
    if (value == null || isNaN(value)) return '-'
    return numeral(value).format('0,0')
  },

  /**
   * Format as decimal with 2 decimal places
   * @param {number} value
   * @returns {string} e.g., "1,234.56"
   */
  decimal: (value) => {
    if (value == null || isNaN(value)) return '-'
    return numeral(value).format('0,0.00')
  },

  /**
   * Format as currency (USD)
   * @param {number} value
   * @returns {string} e.g., "$1,234.56"
   */
  currency: (value) => {
    if (value == null || isNaN(value)) return '-'
    return numeral(value).format('$0,0.00')
  },

  /**
   * Format as compact currency (for large numbers)
   * @param {number} value
   * @returns {string} e.g., "$1.2M"
   */
  currencyCompact: (value) => {
    if (value == null || isNaN(value)) return '-'
    return numeral(value).format('$0.0a').toUpperCase()
  },

  /**
   * Format as percentage
   * @param {number} value - Value as decimal (0.15 = 15%)
   * @returns {string} e.g., "15.0%"
   */
  percent: (value) => {
    if (value == null || isNaN(value)) return '-'
    return numeral(value).format('0.0%')
  },

  /**
   * Format as compact number (for large numbers)
   * @param {number} value
   * @returns {string} e.g., "1.2M"
   */
  compact: (value) => {
    if (value == null || isNaN(value)) return '-'
    return numeral(value).format('0.0a').toUpperCase()
  },
}

/**
 * Date formatting utilities using date-fns
 */
export const date = {
  /**
   * Format as short date
   * @param {Date|string} value
   * @returns {string} e.g., "Jan 15"
   */
  short: (value) => {
    if (!value) return '-'
    const d = typeof value === 'string' ? parseISO(value) : value
    return format(d, 'MMM d')
  },

  /**
   * Format as medium date
   * @param {Date|string} value
   * @returns {string} e.g., "Jan 15, 2024"
   */
  medium: (value) => {
    if (!value) return '-'
    const d = typeof value === 'string' ? parseISO(value) : value
    return format(d, 'MMM d, yyyy')
  },

  /**
   * Format as long date
   * @param {Date|string} value
   * @returns {string} e.g., "January 15, 2024"
   */
  long: (value) => {
    if (!value) return '-'
    const d = typeof value === 'string' ? parseISO(value) : value
    return format(d, 'MMMM d, yyyy')
  },

  /**
   * Format as relative time
   * @param {Date|string} value
   * @returns {string} e.g., "2 days ago"
   */
  relative: (value) => {
    if (!value) return '-'
    const d = typeof value === 'string' ? parseISO(value) : value
    return formatDistanceToNow(d, { addSuffix: true })
  },

  /**
   * Format as ISO string
   * @param {Date|string} value
   * @returns {string} e.g., "2024-01-15"
   */
  iso: (value) => {
    if (!value) return '-'
    const d = typeof value === 'string' ? parseISO(value) : value
    return format(d, 'yyyy-MM-dd')
  },
}
