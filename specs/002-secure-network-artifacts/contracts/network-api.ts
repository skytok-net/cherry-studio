/**
 * Network API Contract: Secure Network-Enabled TSX Artifacts
 *
 * This file defines the IPC contracts between the Electron renderer process
 * (TSX artifacts) and the main process (network proxy service).
 */

// ============================================================================
// Types
// ============================================================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type RequestStatus =
  | 'pending'
  | 'validating'
  | 'approved'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cached'

export type ReputationLevel = 'trusted' | 'unknown' | 'suspicious' | 'blocked'

export type SecurityViolationType =
  | 'private_network'
  | 'malicious_domain'
  | 'rate_limit_exceeded'
  | 'invalid_protocol'
  | 'blocked_port'

// ============================================================================
// Request/Response Interfaces
// ============================================================================

export interface NetworkRequest {
  id: string
  artifactId: string
  url: string
  method: HttpMethod
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

export interface NetworkResponse {
  id: string
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  fromCache: boolean
  responseTime: number
  timestamp: number
}

export interface NetworkError {
  id: string
  type: 'network' | 'security' | 'rate_limit' | 'timeout' | 'validation'
  message: string
  details?: Record<string, any>
  suggestedFix?: string
  retryable: boolean
}

export interface SecurityViolation {
  requestId: string
  violationType: SecurityViolationType
  message: string
  canOverride: boolean
  overrideInstructions?: string
}

// ============================================================================
// Settings Interfaces
// ============================================================================

export interface NetworkSettings {
  maxConcurrentRequests: number
  defaultTimeoutMs: number
  enableCaching: boolean
  cacheDefaultTtlSeconds: number
  rateLimitPerMinute: number
  enableReputationCheck: boolean
  allowPrivateNetworks: boolean
  enforcementLevel: 'strict' | 'moderate' | 'permissive'
}

export interface DomainReputation {
  domain: string
  level: ReputationLevel
  confidence: number
  lastChecked: number
  sources: string[]
}

// ============================================================================
// IPC Contract: Main Process API
// ============================================================================

export interface NetworkApiMethods {
  /**
   * Make a network request through the secure proxy
   *
   * @param request - Network request configuration
   * @returns Promise resolving to response or rejecting with error
   */
  'network:request': (request: NetworkRequest) => Promise<NetworkResponse>

  /**
   * Check domain reputation without making a request
   *
   * @param domain - Domain to check (e.g., "api.example.com")
   * @returns Promise resolving to reputation information
   */
  'network:checkDomain': (domain: string) => Promise<DomainReputation>

  /**
   * Get current network settings
   *
   * @returns Promise resolving to current settings
   */
  'network:getSettings': () => Promise<NetworkSettings>

  /**
   * Update network settings (requires admin privileges)
   *
   * @param settings - New settings configuration
   * @returns Promise resolving to updated settings
   */
  'network:updateSettings': (settings: Partial<NetworkSettings>) => Promise<NetworkSettings>

  /**
   * Override security policy for current session
   *
   * @param domain - Domain to allow
   * @param reason - User-provided reason
   * @returns Promise resolving to override confirmation
   */
  'network:overrideBlock': (domain: string, reason: string) => Promise<{
    success: boolean
    expiresAt: number
  }>

  /**
   * Clear request cache for domain or all
   *
   * @param domain - Specific domain to clear, or null for all
   * @returns Promise resolving to number of cleared entries
   */
  'network:clearCache': (domain?: string) => Promise<number>

  /**
   * Get network statistics and health
   *
   * @returns Promise resolving to statistics
   */
  'network:getStats': () => Promise<NetworkStats>
}

export interface NetworkStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  blockedRequests: number
  cacheHitRate: number
  averageResponseTime: number
  activeConnections: number
  rateLimitRemaining: number
  uptime: number
}

// ============================================================================
// IPC Contract: Renderer Process Events
// ============================================================================

export interface NetworkApiEvents {
  /**
   * Request status update
   * Emitted when request status changes
   */
  'network:requestUpdate': (data: {
    requestId: string
    status: RequestStatus
    progress?: number
  }) => void

  /**
   * Security violation detected
   * Emitted when request is blocked for security reasons
   */
  'network:securityViolation': (violation: SecurityViolation) => void

  /**
   * Settings changed
   * Emitted when network settings are updated
   */
  'network:settingsChanged': (settings: NetworkSettings) => void

  /**
   * Rate limit warning
   * Emitted when approaching rate limits
   */
  'network:rateLimitWarning': (data: {
    artifactId: string
    remaining: number
    resetTime: number
  }) => void
}

// ============================================================================
// Error Codes
// ============================================================================

export const NetworkErrorCodes = {
  // Network errors
  CONNECTION_FAILED: 'ERR_CONNECTION_FAILED',
  TIMEOUT: 'ERR_TIMEOUT',
  DNS_RESOLUTION_FAILED: 'ERR_DNS_RESOLUTION_FAILED',

  // Security errors
  PRIVATE_NETWORK_BLOCKED: 'ERR_PRIVATE_NETWORK_BLOCKED',
  MALICIOUS_DOMAIN: 'ERR_MALICIOUS_DOMAIN',
  INVALID_PROTOCOL: 'ERR_INVALID_PROTOCOL',
  BLOCKED_PORT: 'ERR_BLOCKED_PORT',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'ERR_RATE_LIMIT_EXCEEDED',
  CONCURRENT_LIMIT_EXCEEDED: 'ERR_CONCURRENT_LIMIT_EXCEEDED',

  // Validation errors
  INVALID_URL: 'ERR_INVALID_URL',
  INVALID_METHOD: 'ERR_INVALID_METHOD',
  INVALID_HEADERS: 'ERR_INVALID_HEADERS',
  BODY_TOO_LARGE: 'ERR_BODY_TOO_LARGE',

  // Service errors
  REPUTATION_SERVICE_UNAVAILABLE: 'ERR_REPUTATION_SERVICE_UNAVAILABLE',
  PROXY_SERVICE_UNAVAILABLE: 'ERR_PROXY_SERVICE_UNAVAILABLE'
} as const

export type NetworkErrorCode = typeof NetworkErrorCodes[keyof typeof NetworkErrorCodes]

// ============================================================================
// Type Guards
// ============================================================================

export function isNetworkError(error: any): error is NetworkError {
  return error && typeof error === 'object' && 'type' in error && 'message' in error
}

export function isSecurityViolation(violation: any): violation is SecurityViolation {
  return violation && typeof violation === 'object' && 'violationType' in violation
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  maxConcurrentRequests: 10,
  defaultTimeoutMs: 10000,
  enableCaching: true,
  cacheDefaultTtlSeconds: 900, // 15 minutes
  rateLimitPerMinute: 100,
  enableReputationCheck: true,
  allowPrivateNetworks: false,
  enforcementLevel: 'moderate'
}

export const SUPPORTED_PROTOCOLS = ['http:', 'https:'] as const
export const BLOCKED_PORTS = [22, 23, 25, 53, 135, 139, 445, 1433, 1521, 3306, 3389, 5432] as const
export const DEFAULT_HEADERS = {
  'User-Agent': 'Cherry-Studio-Artifact/1.0',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
} as const