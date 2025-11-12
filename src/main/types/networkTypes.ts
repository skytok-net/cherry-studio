/**
 * Network Types for Secure Network-Enabled TSX Artifacts
 *
 * This file defines the core TypeScript types for network functionality
 * based on the contracts defined in specs/002-secure-network-artifacts/contracts/
 */

// ============================================================================
// Basic Types
// ============================================================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type RequestStatus = 'pending' | 'validating' | 'approved' | 'executing' | 'completed' | 'failed' | 'cached'

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
  timestamp?: number
  metadata?: {
    userAgent?: string
    referrer?: string
    origin?: string
    priority?: 'high' | 'normal' | 'low'
    retryCount?: number
    source?: 'user' | 'background' | 'system'
  }
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
  metadata?: {
    contentLength?: number
    contentType?: string
    compressionRatio?: number
    cacheKey?: string
    cacheTtl?: number
    retryAttempts?: number
    finalUrl?: string // After redirects
    serverTiming?: Record<string, number>
  }
}

export interface NetworkError {
  id: string
  type: 'network' | 'security' | 'rate_limit' | 'timeout' | 'validation'
  message: string
  details?: Record<string, any>
  suggestedFix?: string
  retryable: boolean
  timestamp: number
  metadata?: {
    originalRequest?: NetworkRequest
    httpStatusCode?: number
    errorCode?: NetworkErrorCode
    stackTrace?: string
    correlationId?: string
    retryAfter?: number // seconds
    context?: Record<string, any>
  }
}

export interface SecurityViolation {
  requestId: string
  violationType: SecurityViolationType
  message: string
  canOverride: boolean
  overrideInstructions?: string
  timestamp: number
  metadata?: {
    artifactId?: string
    url?: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    riskScore?: number
    detectionSource?: string[]
    evidence?: Record<string, any>
    similarViolations?: number
    userContext?: {
      sessionId: string
      previousOverrides?: number
      trustLevel?: 'new' | 'established' | 'trusted'
    }
  }
}

// ============================================================================
// Settings and Configuration
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
  advanced?: {
    maxRetries: number
    retryDelayMs: number
    enableCompression: boolean
    maxResponseSizeBytes: number
    dnsTimeout: number
    connectTimeout: number
    followRedirects: boolean
    maxRedirects: number
    enableProxyBypass: boolean
    customProxyRules?: string[]
    enableHttps2: boolean
    certValidation: 'strict' | 'allow_self_signed' | 'disabled'
    debugLogging: boolean
  }
}

export interface DomainReputation {
  domain: string
  level: ReputationLevel
  confidence: number
  lastChecked: number
  sources: string[]
  metadata?: {
    categories?: string[]
    geolocation?: {
      country: string
      region?: string
      city?: string
    }
    certificate?: {
      issuer: string
      validFrom: number
      validTo: number
      isValid: boolean
    }
    historicalData?: {
      firstSeen: number
      requestCount: number
      failureRate: number
      averageResponseTime: number
    }
    threatIntelligence?: {
      malwareCount: number
      phishingCount: number
      spamCount: number
      lastThreatDetected?: number
    }
  }
}

// ============================================================================
// Statistics and Monitoring
// ============================================================================

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
  detailed?: {
    requestsByMethod: Record<HttpMethod, number>
    requestsByStatus: Record<string, number>
    errorsByType: Record<string, number>
    topDomains: Array<{
      domain: string
      requests: number
      avgResponseTime: number
      errorRate: number
    }>
    performanceMetrics: {
      p50ResponseTime: number
      p95ResponseTime: number
      p99ResponseTime: number
      slowestRequest: {
        url: string
        responseTime: number
        timestamp: number
      }
    }
    cacheMetrics: {
      hitCount: number
      missCount: number
      evictionCount: number
      totalSizeBytes: number
      avgEntrySize: number
    }
    securityMetrics: {
      violationsByType: Record<SecurityViolationType, number>
      overridesGranted: number
      maliciousDomainsBlocked: number
      privateNetworkAttempts: number
    }
  }
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

export type NetworkErrorCode = (typeof NetworkErrorCodes)[keyof typeof NetworkErrorCodes]

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
  enforcementLevel: 'moderate',
  advanced: {
    maxRetries: 3,
    retryDelayMs: 1000,
    enableCompression: true,
    maxResponseSizeBytes: 10 * 1024 * 1024, // 10MB
    dnsTimeout: 3000,
    connectTimeout: 5000,
    followRedirects: true,
    maxRedirects: 5,
    enableProxyBypass: false,
    enableHttps2: true,
    certValidation: 'strict',
    debugLogging: false
  }
}

export const SUPPORTED_PROTOCOLS = ['http:', 'https:'] as const
export const BLOCKED_PORTS = [22, 23, 25, 53, 135, 139, 445, 1433, 1521, 3306, 3389, 5432] as const
export const DEFAULT_HEADERS = {
  'User-Agent': 'Cherry-Studio-Artifact/1.0',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
} as const

// ============================================================================
// Type Guards
// ============================================================================

export function isNetworkError(error: any): error is NetworkError {
  return error && typeof error === 'object' && 'type' in error && 'message' in error
}

export function isSecurityViolation(violation: any): violation is SecurityViolation {
  return violation && typeof violation === 'object' && 'violationType' in violation
}

export function isValidHttpMethod(method: string): method is HttpMethod {
  return ['GET', 'POST', 'PUT', 'DELETE'].includes(method)
}

export function isValidRequestStatus(status: string): status is RequestStatus {
  return ['pending', 'validating', 'approved', 'executing', 'completed', 'failed', 'cached'].includes(status)
}

export function isValidReputationLevel(level: string): level is ReputationLevel {
  return ['trusted', 'unknown', 'suspicious', 'blocked'].includes(level)
}

export function isValidSecurityViolationType(type: string): type is SecurityViolationType {
  return ['private_network', 'malicious_domain', 'rate_limit_exceeded', 'invalid_protocol', 'blocked_port'].includes(
    type
  )
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract domain from URL string
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * Check if URL is private network
 */
export function isPrivateNetwork(url: string): boolean {
  try {
    const hostname = new URL(url).hostname

    // Private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc[0-9a-f]{2}:/i,
      /^fe80:/i
    ]

    // Localhost patterns
    if (hostname === 'localhost' || hostname === '0.0.0.0') {
      return true
    }

    return privateRanges.some((range) => range.test(hostname))
  } catch {
    return false
  }
}

/**
 * Check if port is blocked
 */
export function isPortBlocked(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const port = parseInt(urlObj.port)

    if (!port) return false

    return (BLOCKED_PORTS as ReadonlyArray<number>).includes(port)
  } catch {
    return false
  }
}

/**
 * Validate network request structure
 */
export function validateNetworkRequest(request: any): request is NetworkRequest {
  return (
    request &&
    typeof request === 'object' &&
    typeof request.id === 'string' &&
    typeof request.artifactId === 'string' &&
    typeof request.url === 'string' &&
    isValidHttpMethod(request.method) &&
    (request.headers === undefined || typeof request.headers === 'object') &&
    (request.body === undefined || typeof request.body === 'string') &&
    (request.timeout === undefined || typeof request.timeout === 'number')
  )
}
