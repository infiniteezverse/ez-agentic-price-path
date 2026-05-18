import { Globe } from 'lucide-react'
import type { SupportedChain } from '../../lib/types'

const chains: { value: SupportedChain; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'optimism', label: 'Optimism' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'solana', label: 'Solana' },
]

interface ChainSelectorProps {
  value: SupportedChain
  onChange: (chain: SupportedChain) => void
}

export default function ChainSelector({ value, onChange }: ChainSelectorProps) {
  return (
    <div className="relative">
      <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SupportedChain)}
        className="w-full appearance-none rounded border border-border bg-input py-2 pl-10 pr-4 text-sm text-foreground hover:border-accent focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {chains.map((chain) => (
          <option key={chain.value} value={chain.value} className="bg-card">
            {chain.label}
          </option>
        ))}
      </select>
    </div>
  )
}
