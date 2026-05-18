import { useState, useCallback, useEffect } from 'react'

const ADMIN_KEY_STORAGE = 'ezpath_admin_key'
const PAYER_ADDRESS_STORAGE = 'ezpath_payer_address'

export function useAuthToken(type: 'admin' | 'payer' = 'admin') {
  const storageKey = type === 'admin' ? ADMIN_KEY_STORAGE : PAYER_ADDRESS_STORAGE
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey)
    } catch {
      return null
    }
  })

  const setToken_ = useCallback(
    (newToken: string | null) => {
      try {
        if (newToken) {
          localStorage.setItem(storageKey, newToken)
        } else {
          localStorage.removeItem(storageKey)
        }
        setToken(newToken)
      } catch (e) {
        console.error('Failed to save token to localStorage:', e)
      }
    },
    [storageKey],
  )

  const clearToken = useCallback(() => {
    setToken_(null)
  }, [setToken_])

  return {
    token,
    setToken: setToken_,
    clearToken,
    isSet: !!token,
  }
}

export function useAdminKey() {
  return useAuthToken('admin')
}

export function usePayerAddress() {
  return useAuthToken('payer')
}

export function useShowAuthWarning() {
  const { token } = useAuthToken('admin')
  const [acknowledged, setAcknowledged] = useState(() => {
    try {
      return localStorage.getItem('ezpath_auth_warning_acknowledged') === 'true'
    } catch {
      return false
    }
  })

  const acknowledgeWarning = useCallback(() => {
    try {
      localStorage.setItem('ezpath_auth_warning_acknowledged', 'true')
      setAcknowledged(true)
    } catch (e) {
      console.error('Failed to save acknowledgment:', e)
    }
  })

  return {
    shouldShow: !!token && !acknowledged,
    acknowledge: acknowledgeWarning,
  }
}
