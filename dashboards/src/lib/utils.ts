export function formatUSD(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatBPS(value: number): string {
  return `${value.toFixed(2)} bps`
}

export function formatLatency(ms: number): string {
  return `${Math.round(ms)}ms`
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(2)}%`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

export function atomicToUSD(atomic: number, decimals: number = 6): number {
  return atomic / Math.pow(10, decimals)
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00Z')
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function getDateRange(type: 'today' | 'yesterday' | 'last7' | 'custom', customDate?: string): { start: string; end: string } {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  switch (type) {
    case 'today':
      return {
        start: today.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return {
        start: yesterday.toISOString().split('T')[0],
        end: yesterday.toISOString().split('T')[0],
      }
    }
    case 'last7': {
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      return {
        start: start.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      }
    }
    case 'custom':
      return {
        start: customDate || today.toISOString().split('T')[0],
        end: customDate || today.toISOString().split('T')[0],
      }
    default:
      return {
        start: today.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0],
      }
  }
}
