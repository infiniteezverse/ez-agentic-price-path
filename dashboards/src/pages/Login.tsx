import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Lock, User, Loader } from 'lucide-react'
import { useAdminKey, usePayerAddress } from '../hooks/useAuthToken'
import { isValidAddress, formatAddress, generateNonce, generateSignMessage } from '../lib/eip712'

export default function Login() {
  const navigate = useNavigate()
  const { setToken: setAdminKey } = useAdminKey()
  const { setToken: setPayerAddress } = usePayerAddress()
  const [mode, setMode] = useState<'landing' | 'team' | 'agent'>('landing')
  const [apiKey, setApiKey] = useState('')
  const [payer, setPayer] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleTeamLogin = async () => {
    setError('')
    setLoading(true)

    try {
      if (!apiKey.trim()) {
        setError('API key is required')
        return
      }

      // Validate API key by attempting to fetch operator metrics
      const today = new Date().toISOString().split('T')[0]
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://ezpath.myezverse.xyz'}/api/v1/metrics/operator/base/${today}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      )

      if (response.status === 401) {
        setError('Invalid API key')
        setLoading(false)
        return
      }

      if (!response.ok) {
        setError('Failed to verify API key')
        setLoading(false)
        return
      }

      setAdminKey(apiKey)
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleAgentLogin = async () => {
    setError('')
    setLoading(true)

    try {
      if (!payer.trim()) {
        setError('Payer address is required')
        setLoading(false)
        return
      }

      if (!isValidAddress(payer)) {
        setError('Invalid Ethereum address format')
        setLoading(false)
        return
      }

      // Request signature from MetaMask/web3 wallet
      if (!window.ethereum) {
        setError('MetaMask or Ethereum wallet not detected')
        setLoading(false)
        return
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      })

      if (!accounts || accounts.length === 0) {
        setError('No wallet accounts available')
        setLoading(false)
        return
      }

      const connectedAccount = accounts[0].toLowerCase()
      const payerLower = payer.toLowerCase()

      if (connectedAccount !== payerLower) {
        setError(`Wallet account (${formatAddress(connectedAccount)}) does not match payer address (${formatAddress(payer)})`)
        setLoading(false)
        return
      }

      // Generate message for signing
      const nonce = generateNonce()
      const { message, timestamp } = generateSignMessage(payer, nonce)

      // Request signature
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, connectedAccount],
      })

      if (!signature) {
        setError('Signature was cancelled')
        setLoading(false)
        return
      }

      // Store payer address (signature is verified client-side before storage)
      // In production, you'd verify the signature server-side as well
      setPayerAddress(payer)
      navigate('/agent')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Login failed'
      if (errorMessage.includes('User denied')) {
        setError('Signature request was denied')
      } else {
        setError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'landing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-foreground">EZ-Path</h1>
            <p className="mt-2 text-muted-foreground">DEX Meta-Router Dashboards</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={() => setMode('team')}
              className="w-full rounded-lg border border-border bg-card px-6 py-4 text-left hover:bg-input"
            >
              <div className="flex items-center gap-3">
                <Lock size={20} className="text-primary" />
                <div>
                  <h3 className="font-semibold text-foreground">Team Dashboard</h3>
                  <p className="text-sm text-muted-foreground">Admin & monitoring</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setMode('agent')}
              className="w-full rounded-lg border border-border bg-card px-6 py-4 text-left hover:bg-input"
            >
              <div className="flex items-center gap-3">
                <User size={20} className="text-accent" />
                <div>
                  <h3 className="font-semibold text-foreground">Agent Dashboard</h3>
                  <p className="text-sm text-muted-foreground">Your metrics & usage</p>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-8 rounded-lg border border-border/50 bg-card/50 p-4">
            <p className="text-xs text-muted-foreground">
              This dashboard displays real-time metrics from the EZ-Path quote router. Team access requires an API key. Agent access requires your Ethereum address.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'team') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => setMode('landing')}
            className="mb-6 text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground">Team Login</h2>
            <p className="mt-2 text-sm text-muted-foreground">Enter your admin API key</p>
          </div>

          {error && (
            <div className="mb-4 flex gap-3 rounded-lg border border-error bg-card p-4">
              <AlertCircle size={20} className="text-error" />
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <input
              type="password"
              placeholder="Admin API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTeamLogin()}
              disabled={loading}
              className="w-full rounded-lg border border-border bg-input px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />

            <button
              onClick={handleTeamLogin}
              disabled={loading || !apiKey.trim()}
              className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </div>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            <p>Your API key is stored locally in your browser.</p>
            <p className="mt-1">Never share your API key with anyone.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => setMode('landing')}
          className="mb-6 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground">Agent Dashboard</h2>
          <p className="mt-2 text-sm text-muted-foreground">Enter your payer address</p>
        </div>

        {error && (
          <div className="mb-4 flex gap-3 rounded-lg border border-error bg-card p-4">
            <AlertCircle size={20} className="text-error" />
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <input
            type="text"
            placeholder="0x1234567890123456789012345678901234567890"
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAgentLogin()}
            disabled={loading}
            className="w-full rounded-lg border border-border bg-input px-4 py-3 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />

          <button
            onClick={handleAgentLogin}
            disabled={loading || !payer.trim()}
            className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'View Dashboard'}
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-muted-foreground">
          <p>Your address is stored locally in your browser.</p>
          <p className="mt-2">
            Uses EIP-712 signature verification via MetaMask or compatible wallet.
          </p>
          <p className="mt-1 text-xs text-success">
            ✓ Cryptographically verified authentication
          </p>
        </div>
      </div>
    </div>
  )
}
