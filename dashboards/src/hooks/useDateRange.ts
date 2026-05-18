import { useState, useCallback } from 'react'

export type DateRangeType = 'today' | 'yesterday' | 'last7' | 'custom'

interface DateRange {
  start: string
  end: string
}

export function useDateRange(initialDate?: string) {
  const [rangeType, setRangeType] = useState<DateRangeType>('today')
  const [customDate, setCustomDate] = useState(initialDate || getTodayDate())

  const getDateRange = useCallback((): DateRange => {
    const today = getTodayDate()

    switch (rangeType) {
      case 'today':
        return { start: today, end: today }
      case 'yesterday': {
        const yesterday = getYesterdayDate()
        return { start: yesterday, end: yesterday }
      }
      case 'last7': {
        const start = getDateNDaysAgo(6)
        return { start, end: today }
      }
      case 'custom':
        return { start: customDate, end: customDate }
      default:
        return { start: today, end: today }
    }
  }, [rangeType, customDate])

  return {
    rangeType,
    setRangeType,
    customDate,
    setCustomDate,
    getDateRange,
    currentDate: customDate,
  }
}

function getTodayDate(): string {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return today.toISOString().split('T')[0]
}

function getYesterdayDate(): string {
  const yesterday = new Date()
  yesterday.setUTCHours(0, 0, 0, 0)
  yesterday.setDate(yesterday.getDate() - 1)
  return yesterday.toISOString().split('T')[0]
}

function getDateNDaysAgo(n: number): string {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setDate(date.getDate() - n)
  return date.toISOString().split('T')[0]
}
