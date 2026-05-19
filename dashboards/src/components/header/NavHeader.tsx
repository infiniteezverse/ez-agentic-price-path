import { RotateCw, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ChainSelector from '../metrics/ChainSelector'
import DateRangePicker from '../metrics/DateRangePicker'
import { useAdminKey, usePayerAddress } from '../../hooks/useAuthToken'
import type { SupportedChain } from '../../lib/types'

interface NavHeaderProps {
  title: string
  chain: SupportedChain
  onChainChange: (chain: SupportedChain) => void
  date: string
  onDateChange: (date: string) => void
  isOperator: boolean
}

export default function NavHeader({
  title,
  chain,
  onChainChange,
  date,
  onDateChange,
  isOperator,
}: NavHeaderProps) {
  const navigate = useNavigate()
  const { clearToken: clearAdminKey } = useAdminKey()
  const { clearToken: clearPayerAddress } = usePayerAddress()

  const handleRefresh = () => {
    window.location.reload()
  }

  const handleLogout = () => {
    if (isOperator) {
      clearAdminKey()
    } else {
      clearPayerAddress()
    }
    navigate('/login')
  }

  return (
    <header className="border-b border-border bg-card px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {/* Chain Selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
              Chain
            </label>
            <ChainSelector value={chain} onChange={onChainChange} />
          </div>

          {/* Date Picker */}
          <div className="sm:col-span-2">
            <label className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
              Date
            </label>
            <DateRangePicker value={date} onChange={onDateChange} showPresets={false} />
          </div>

          {/* Refresh Button */}
          <div className="flex items-end">
            <button
              onClick={handleRefresh}
              className="inline-flex w-full items-center justify-center gap-2 rounded border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-card hover:text-foreground sm:w-auto"
              title="Refresh metrics"
            >
              <RotateCw size={16} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
