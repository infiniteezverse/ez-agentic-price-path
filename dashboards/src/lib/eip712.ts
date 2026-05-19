import { verifyTypedData } from 'viem'

export const EIP712_DOMAIN = {
  name: 'EZ-Path',
  version: '1',
  chainId: 8453, // Base
}

export const EIP712_TYPES = {
  AgentAuth: [
    { name: 'payer', type: 'address' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
}

/**
 * Generate a message for payer to sign
 * Valid for 1 hour from generation
 */
export function generateSignMessage(payer: string, nonce: number): {
  message: string
  timestamp: number
} {
  const timestamp = Math.floor(Date.now() / 1000)
  const message = `I authorize EZ-Path to display my metrics.\n\nAddress: ${payer}\nTimestamp: ${timestamp}\nNonce: ${nonce}`
  return { message, timestamp }
}

/**
 * Verify EIP-712 signature from payer
 * Returns verified payer address if valid, null otherwise
 */
export async function verifyPayerSignature(
  payer: string,
  signature: string,
  timestamp: number,
  nonce: number
): Promise<boolean> {
  try {
    // Check timestamp is recent (within 1 hour)
    const now = Math.floor(Date.now() / 1000)
    if (now - timestamp > 3600) {
      console.warn('Signature timestamp too old')
      return false
    }

    // Verify typed data signature
    const isValid = await verifyTypedData({
      address: payer as `0x${string}`,
      domain: EIP712_DOMAIN,
      types: EIP712_TYPES,
      primaryType: 'AgentAuth',
      message: {
        payer: payer as `0x${string}`,
        timestamp,
        nonce,
      },
      signature: signature as `0x${string}`,
    })

    return isValid
  } catch (err) {
    console.error('Signature verification failed:', err)
    return false
  }
}

/**
 * Generate nonce from current timestamp for security
 */
export function generateNonce(): number {
  return Math.floor(Math.random() * 1000000000)
}

/**
 * Format address for display (0x1234...5678)
 */
export function formatAddress(address: string): string {
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return address
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}
