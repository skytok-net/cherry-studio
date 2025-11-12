/**
 * Network API Preload Script
 *
 * This file exposes secure network functionality to the renderer process
 * through Electron's contextBridge API, providing a secure IPC bridge
 * for TSX artifacts to make network requests.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type {
  NetworkRequest,
  NetworkResponse,
  NetworkSettings,
  DomainReputation,
  NetworkStats,
  SecurityViolation
} from '../main/types/networkTypes'

// ============================================================================
// Network API Interface
// ============================================================================

export interface NetworkApi {
  /**
   * Make a network request through the secure proxy
   */
  makeRequest: (request: NetworkRequest) => Promise<NetworkResponse>

  /**
   * Cancel an active network request
   */
  cancelRequest?: (requestId: string) => Promise<boolean>

  /**
   * Check domain reputation without making a request
   */
  checkDomain: (domain: string) => Promise<DomainReputation>

  /**
   * Get current network settings
   */
  getSettings: () => Promise<NetworkSettings>

  /**
   * Update network settings (requires admin privileges)
   */
  updateSettings: (settings: Partial<NetworkSettings>) => Promise<NetworkSettings>

  /**
   * Override security policy for current session
   */
  overrideBlock: (domain: string, reason: string) => Promise<{
    success: boolean
    expiresAt: number
  }>

  /**
   * Clear request cache for domain or all
   */
  clearCache: (domain?: string) => Promise<number>

  /**
   * Get network statistics and health
   */
  getStats: () => Promise<NetworkStats>

  /**
   * Event listeners for network events
   */
  onRequestUpdate: (callback: (data: {
    requestId: string
    status: 'pending' | 'validating' | 'executing' | 'completed' | 'failed' | 'cached'
    progress?: number
  }) => void) => () => void

  onSecurityViolation: (callback: (violation: SecurityViolation) => void) => () => void

  onSettingsChanged: (callback: (settings: NetworkSettings) => void) => () => void

  onRateLimitWarning: (callback: (data: {
    artifactId: string
    remaining: number
    resetTime: number
  }) => void) => () => void

  onConnectionStatusChanged: (callback: (data: {
    online: boolean
    lastChecked: number
  }) => void) => () => void
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate network request before sending to main process
 */
function validateNetworkRequest(request: NetworkRequest): void {
  if (!request || typeof request !== 'object') {
    throw new Error('Invalid request: must be an object')
  }

  if (!request.id || typeof request.id !== 'string') {
    throw new Error('Invalid request: id is required and must be a string')
  }

  if (!request.artifactId || typeof request.artifactId !== 'string') {
    throw new Error('Invalid request: artifactId is required and must be a string')
  }

  if (!request.url || typeof request.url !== 'string') {
    throw new Error('Invalid request: url is required and must be a string')
  }

  if (!request.method || typeof request.method !== 'string') {
    throw new Error('Invalid request: method is required and must be a string')
  }

  // Validate URL format
  try {
    new URL(request.url)
  } catch {
    throw new Error('Invalid request: url is not a valid URL')
  }

  // Validate method
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE']
  if (!validMethods.includes(request.method)) {
    throw new Error(`Invalid request: method must be one of ${validMethods.join(', ')}`)
  }
}

/**
 * Validate domain string
 */
function validateDomain(domain: string): void {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Domain must be a non-empty string')
  }

  if (domain.length > 253) {
    throw new Error('Domain name is too long')
  }
}

// ============================================================================
// IPC Bridge Implementation
// ============================================================================

const networkApi: NetworkApi = {
  makeRequest: (request: NetworkRequest) => {
    validateNetworkRequest(request)
    return ipcRenderer.invoke('network:request', request)
  },

  cancelRequest: (requestId: string) => {
    if (!requestId || typeof requestId !== 'string') {
      throw new Error('Request ID must be a non-empty string')
    }
    return ipcRenderer.invoke('network:cancelRequest', requestId)
  },

  checkDomain: (domain: string) => {
    validateDomain(domain)
    return ipcRenderer.invoke('network:checkDomain', domain)
  },

  getSettings: () =>
    ipcRenderer.invoke('network:getSettings'),

  updateSettings: (settings: Partial<NetworkSettings>) =>
    ipcRenderer.invoke('network:updateSettings', settings),

  overrideBlock: (domain: string, reason: string) => {
    validateDomain(domain)
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new Error('Override reason must be a non-empty string')
    }
    return ipcRenderer.invoke('network:overrideBlock', domain, reason)
  },

  clearCache: (domain?: string) => {
    if (domain !== undefined) {
      validateDomain(domain)
    }
    return ipcRenderer.invoke('network:clearCache', domain)
  },

  getStats: () =>
    ipcRenderer.invoke('network:getStats'),

  // Event listeners with cleanup functions
  onRequestUpdate: (callback) => {
    const handler = (_event: any, data: {
      requestId: string
      status: 'pending' | 'validating' | 'executing' | 'completed' | 'failed' | 'cached'
      progress?: number
    }) => callback(data)
    ipcRenderer.on('network:requestUpdate', handler)
    return () => ipcRenderer.removeListener('network:requestUpdate', handler)
  },

  onSecurityViolation: (callback) => {
    const handler = (_event: any, violation: SecurityViolation) => callback(violation)
    ipcRenderer.on('network:securityViolation', handler)
    return () => ipcRenderer.removeListener('network:securityViolation', handler)
  },

  onSettingsChanged: (callback) => {
    const handler = (_event: any, settings: NetworkSettings) => callback(settings)
    ipcRenderer.on('network:settingsChanged', handler)
    return () => ipcRenderer.removeListener('network:settingsChanged', handler)
  },

  onRateLimitWarning: (callback) => {
    const handler = (_event: any, data: {
      artifactId: string
      remaining: number
      resetTime: number
    }) => callback(data)
    ipcRenderer.on('network:rateLimitWarning', handler)
    return () => ipcRenderer.removeListener('network:rateLimitWarning', handler)
  },

  onConnectionStatusChanged: (callback) => {
    const handler = (_event: any, data: {
      online: boolean
      lastChecked: number
    }) => callback(data)
    ipcRenderer.on('network:connectionStatusChanged', handler)
    return () => ipcRenderer.removeListener('network:connectionStatusChanged', handler)
  }
}

// ============================================================================
// Context Bridge Exposure
// ============================================================================

// Expose the networkApi to the renderer process
contextBridge.exposeInMainWorld('networkApi', networkApi)

// TypeScript declaration for global window object
declare global {
  interface Window {
    networkApi: NetworkApi
  }
}

export default networkApi