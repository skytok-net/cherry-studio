/**
 * Network IPC Handlers
 *
 * Implements the IPC contract for secure network-enabled TSX artifacts.
 * Handles communication between renderer process and network proxy service.
 */

import { BrowserWindow,ipcMain } from 'electron'

import type {
  DomainReputation,
  NetworkError,
  NetworkRequest,
  NetworkResponse,
  NetworkSettings,
  NetworkStats,
  SecurityViolation
} from '../../types/networkTypes'
import type { SecurityPolicy } from '../securityPolicy/SecurityPolicy'
import type { NetworkProxyService } from './NetworkProxyService'

// ============================================================================
// IPC Handler Implementation
// ============================================================================

export class NetworkIpcHandlers {
  private networkProxy: NetworkProxyService
  private securityPolicy: SecurityPolicy
  private currentSettings: NetworkSettings

  constructor(networkProxy: NetworkProxyService, securityPolicy: SecurityPolicy, settings: NetworkSettings) {
    this.networkProxy = networkProxy
    this.securityPolicy = securityPolicy
    this.currentSettings = settings
  }

  /**
   * Register all IPC handlers for network functionality
   */
  registerHandlers(): void {
    this.registerRequestHandler()
    this.registerDomainCheckHandler()
    this.registerSettingsHandlers()
    this.registerCacheHandlers()
    this.registerStatsHandler()
    this.registerSecurityHandlers()
  }

  /**
   * Unregister all IPC handlers
   */
  unregisterHandlers(): void {
    const handlers = [
      'network:request',
      'network:checkDomain',
      'network:getSettings',
      'network:updateSettings',
      'network:clearCache',
      'network:getStats',
      'network:overrideBlock'
    ]

    handlers.forEach((handler) => {
      ipcMain.removeAllListeners(handler)
    })
  }

  // ============================================================================
  // Request Handler
  // ============================================================================

  private registerRequestHandler(): void {
    ipcMain.handle('network:request', async (event, request: NetworkRequest): Promise<NetworkResponse> => {
      try {
        // Validate request structure
        this.validateNetworkRequest(request)

        // Add metadata from the event
        const enrichedRequest: NetworkRequest = {
          ...request,
          timestamp: Date.now(),
          metadata: {
            ...request.metadata,
            source: 'user',
            userAgent: request.headers?.['user-agent'] || 'Cherry-Studio-Artifact/1.0'
          }
        }

        // Execute through network proxy
        const result = await this.networkProxy.executeRequest(enrichedRequest)

        if (result.success && result.response) {
          // Emit status update
          this.emitRequestUpdate(event.sender, request.id, 'completed')
          return result.response
        } else if (result.error) {
          // Handle security violations
          if (result.error.type === 'security' && result.context.securityViolations.length > 0) {
            this.emitSecurityViolations(event.sender, result.context.securityViolations)
          }

          // Emit status update
          this.emitRequestUpdate(event.sender, request.id, 'failed')

          // Convert to contract-compatible error and throw
          throw this.createContractError(result.error)
        } else {
          throw new Error('Network proxy returned invalid result')
        }
      } catch (error) {
        // Emit status update
        this.emitRequestUpdate(event.sender, request.id, 'failed')

        // Re-throw for IPC error handling
        throw error
      }
    })
  }

  // ============================================================================
  // Domain Check Handler
  // ============================================================================

  private registerDomainCheckHandler(): void {
    ipcMain.handle('network:checkDomain', async (_event, domain: string): Promise<DomainReputation> => {
      try {
        if (!domain || typeof domain !== 'string') {
          throw new Error('Invalid domain provided')
        }

        return await this.networkProxy.checkDomain(domain)
      } catch (error) {
        console.error('Domain check failed:', error)
        throw error
      }
    })
  }

  // ============================================================================
  // Settings Handlers
  // ============================================================================

  private registerSettingsHandlers(): void {
    // Get current settings
    ipcMain.handle('network:getSettings', async (): Promise<NetworkSettings> => {
      return { ...this.currentSettings }
    })

    // Update settings
    ipcMain.handle(
      'network:updateSettings',
      async (_event, settingsUpdate: Partial<NetworkSettings>): Promise<NetworkSettings> => {
        try {
          // Validate settings update
          this.validateSettingsUpdate(settingsUpdate)

          // Merge with current settings
          const newSettings: NetworkSettings = {
            ...this.currentSettings,
            ...settingsUpdate
          }

          // Update network proxy and security policy
          await this.networkProxy.updateSettings(newSettings)
          this.securityPolicy.updateConfig(newSettings)

          // Store updated settings
          this.currentSettings = newSettings

          // Emit settings changed event to all windows
          this.broadcastSettingsChanged(newSettings)

          return newSettings
        } catch (error) {
          console.error('Settings update failed:', error)
          throw error
        }
      }
    )
  }

  // ============================================================================
  // Cache Handlers
  // ============================================================================

  private registerCacheHandlers(): void {
    ipcMain.handle('network:clearCache', async (_event, domain?: string): Promise<number> => {
      try {
        // Clear cache through request cache service
        const cacheService = (this.networkProxy as any).requestCache
        if (!cacheService) {
          throw new Error('Cache service not available')
        }

        if (domain) {
          return await cacheService.clear({ domain })
        } else {
          return await cacheService.clear()
        }
      } catch (error) {
        console.error('Cache clear failed:', error)
        throw error
      }
    })
  }

  // ============================================================================
  // Stats Handler
  // ============================================================================

  private registerStatsHandler(): void {
    ipcMain.handle('network:getStats', async (): Promise<NetworkStats> => {
      try {
        return await this.networkProxy.getStats()
      } catch (error) {
        console.error('Stats retrieval failed:', error)
        throw error
      }
    })
  }

  // ============================================================================
  // Security Handlers
  // ============================================================================

  private registerSecurityHandlers(): void {
    ipcMain.handle(
      'network:overrideBlock',
      async (
        _event,
        domain: string,
        reason: string
      ): Promise<{
        success: boolean
        expiresAt: number
      }> => {
        try {
          if (!domain || typeof domain !== 'string') {
            throw new Error('Invalid domain provided')
          }

          if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            throw new Error('Override reason is required')
          }

          // Create session override (1 hour duration)
          const override = this.securityPolicy.createSessionOverride(domain, reason, 3600000)

          return {
            success: true,
            expiresAt: override.expiresAt
          }
        } catch (error) {
          console.error('Security override failed:', error)
          throw error
        }
      }
    )
  }

  // ============================================================================
  // Event Emission Helpers
  // ============================================================================

  private emitRequestUpdate(sender: Electron.WebContents, requestId: string, status: string, progress?: number): void {
    sender.send('network:requestUpdate', {
      requestId,
      status,
      progress
    })
  }

  private emitSecurityViolations(sender: Electron.WebContents, violations: SecurityViolation[]): void {
    violations.forEach((violation) => {
      sender.send('network:securityViolation', violation)
    })
  }

  private broadcastSettingsChanged(settings: NetworkSettings): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('network:settingsChanged', settings)
      }
    })
  }

  // ============================================================================
  // Validation Helpers
  // ============================================================================

  private validateNetworkRequest(request: any): asserts request is NetworkRequest {
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

    const validMethods = ['GET', 'POST', 'PUT', 'DELETE']
    if (!validMethods.includes(request.method)) {
      throw new Error(`Invalid request: method must be one of ${validMethods.join(', ')}`)
    }

    // Validate URL format
    try {
      new URL(request.url)
    } catch {
      throw new Error('Invalid request: url is not a valid URL')
    }

    // Validate optional fields
    if (request.headers && typeof request.headers !== 'object') {
      throw new Error('Invalid request: headers must be an object')
    }

    if (request.body && typeof request.body !== 'string') {
      throw new Error('Invalid request: body must be a string')
    }

    if (request.timeout && (typeof request.timeout !== 'number' || request.timeout <= 0)) {
      throw new Error('Invalid request: timeout must be a positive number')
    }
  }

  private validateSettingsUpdate(settings: any): asserts settings is Partial<NetworkSettings> {
    if (!settings || typeof settings !== 'object') {
      throw new Error('Invalid settings: must be an object')
    }

    const validKeys = [
      'maxConcurrentRequests',
      'defaultTimeoutMs',
      'enableCaching',
      'cacheDefaultTtlSeconds',
      'rateLimitPerMinute',
      'enableReputationCheck',
      'allowPrivateNetworks',
      'enforcementLevel',
      'advanced'
    ]

    // Check for invalid keys
    const invalidKeys = Object.keys(settings).filter((key) => !validKeys.includes(key))
    if (invalidKeys.length > 0) {
      throw new Error(`Invalid settings keys: ${invalidKeys.join(', ')}`)
    }

    // Validate specific fields if present
    if ('maxConcurrentRequests' in settings) {
      if (typeof settings.maxConcurrentRequests !== 'number' || settings.maxConcurrentRequests <= 0) {
        throw new Error('maxConcurrentRequests must be a positive number')
      }
    }

    if ('defaultTimeoutMs' in settings) {
      if (typeof settings.defaultTimeoutMs !== 'number' || settings.defaultTimeoutMs <= 0) {
        throw new Error('defaultTimeoutMs must be a positive number')
      }
    }

    if ('enforcementLevel' in settings) {
      const validLevels = ['strict', 'moderate', 'permissive']
      if (!validLevels.includes(settings.enforcementLevel)) {
        throw new Error(`enforcementLevel must be one of: ${validLevels.join(', ')}`)
      }
    }
  }

  private createContractError(error: NetworkError): Error {
    const contractError = new Error(error.message)

    // Add additional properties for better error handling
    Object.assign(contractError, {
      code: this.mapErrorTypeToCode(error.type),
      type: error.type,
      retryable: error.retryable,
      details: error.details,
      suggestedFix: error.suggestedFix
    })

    return contractError
  }

  private mapErrorTypeToCode(type: string): string {
    const errorCodeMap: Record<string, string> = {
      network: 'ERR_CONNECTION_FAILED',
      security: 'ERR_MALICIOUS_DOMAIN',
      rate_limit: 'ERR_RATE_LIMIT_EXCEEDED',
      timeout: 'ERR_TIMEOUT',
      validation: 'ERR_INVALID_URL'
    }

    return errorCodeMap[type] || 'ERR_UNKNOWN'
  }
}

// ============================================================================
// Rate Limit Monitoring
// ============================================================================

export class NetworkRateLimitMonitor {
  private rateLimitThreshold = 0.8 // 80% of limit
  private checkInterval: NodeJS.Timeout | null = null

  constructor(private networkProxy: NetworkProxyService) {}

  startMonitoring(): void {
    if (this.checkInterval) return

    this.checkInterval = setInterval(async () => {
      try {
        const stats = await this.networkProxy.getStats()
        const rateLimitUsage = stats.rateLimitRemaining / 100 // Assuming max 100 per minute

        if (rateLimitUsage <= this.rateLimitThreshold) {
          this.emitRateLimitWarnings(stats)
        }
      } catch (error) {
        console.error('Rate limit monitoring error:', error)
      }
    }, 10000) // Check every 10 seconds
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  private emitRateLimitWarnings(stats: NetworkStats): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('network:rateLimitWarning', {
          artifactId: 'global', // TODO: Track per artifact
          remaining: stats.rateLimitRemaining,
          resetTime: Date.now() + 60000 // Assuming 1-minute reset window
        })
      }
    })
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createNetworkIpcHandlers(
  networkProxy: NetworkProxyService,
  securityPolicy: SecurityPolicy,
  settings: NetworkSettings
): NetworkIpcHandlers {
  return new NetworkIpcHandlers(networkProxy, securityPolicy, settings)
}

export default NetworkIpcHandlers
