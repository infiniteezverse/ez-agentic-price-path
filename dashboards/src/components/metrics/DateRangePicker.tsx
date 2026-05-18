import { Calendar } from 'lucide-react'
import { formatDate } from '../../lib/utils'

interface DateRangePickerProps {
  value: string
  onChange: (date: string) => void
  showPresets?: boolean
}

export default function DateRangePicker({
  value,
  onChange,
  showPresets = true,
}: DateRangePickerProps) {
  const handleQuickSelect = (daysAgo: number) => {
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    date.setDate(date.getDate() - daysAgo)
    onChange(date.toISOString().split('T')[0])
  }

  return (
    <div className="space-y-3">
      {showPresets && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleQuickSelect(0)}
            className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-dark"
          >
            Today
          </button>
          <button
            onClick={() => handleQuickSelect(1)}
            className="rounded border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-card"
          >
            Yesterday
          </button>
          <button
            onClick={() => handleQuickSelect(6)}
            className="rounded border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-card"
          >
            Last 7 days
          </button>
        </div>
      )}

      <div className="relative">
        <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-border bg-input py-2 pl-10 pr-4 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  )
}
