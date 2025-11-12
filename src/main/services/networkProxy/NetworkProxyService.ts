/**
 * Network Proxy Service
 *
 * Central orchestrator for secure network requests in TSX artifacts.
 * Coordinates security validation, domain reputation checking, request caching,
 * and HTTP execution to provide safe, performant network access.
 */

import type {
  DomainReputation,
  NetworkError,
  NetworkRequest,
  NetworkResponse,
  NetworkSettings,
  NetworkStats,
  RequestStatus,
  SecurityViolation} from '../../types/networkTypes'
import type { DomainReputationService } from '../domainReputation/DomainReputationService'
import type { RequestCache } from '../requestCache/RequestCache'
import type { SecurityPolicy, SecurityValidationResult } from '../securityPolicy/SecurityPolicy'
import { HttpRequestHandler } from './HttpRequestHandler'

// ============================================================================
// Core Interfaces
// ============================================================================

export interface NetworkProxyConfig {
  // Service configuration
  enableSecurityValidation: boolean
  enableDomainReputation: boolean
  enableRequestCaching: boolean
  enableRateLimiting: boolean

  // Performance settings
  maxConcurrentRequests: number
  defaultTimeoutMs: number
  maxRetries: number
  retryDelayMs: number

  // Security settings
  enforceHttpsUpgrade: boolean
  blockPrivateNetworks: boolean
  validateUserAgent: boolean

  // Advanced features
  enableRequestTracing: boolean
  enableMetrics: boolean
  enableDebugLogging: boolean
}

export interface NetworkRequestContext {
  request: NetworkRequest
  status: RequestStatus
  startTime: number
  endTime?: number
  retryCount: number
  cacheHit: boolean
  securityViolations: SecurityViolation[]
  domainReputation?: DomainReputation
  metadata: {
    traceId: string
    artifactId: string
    userId?: string
    sessionId?: string
    userAgent?: string
    ipAddress?: string
  }
}

export interface NetworkExecutionResult {
  success: boolean
  response?: NetworkResponse
  error?: NetworkError
  context: NetworkRequestContext
  metadata?: {
    fromCache: boolean
    securityOverrideUsed: boolean
    domainReputationScore?: number
    executionTimeMs: number
    retryAttempts: number
  }
}

export interface RateLimitStatus {
  allowed: boolean
  remainingRequests: number
  resetTime: number
  retryAfter?: number
}

// ============================================================================
// Network Proxy Service
// ============================================================================

export class NetworkProxyService {
  private securityPolicy: SecurityPolicy
  private domainReputationService: DomainReputationService
  private requestCache: RequestCache
  private httpRequestHandler: HttpRequestHandler
  private config: NetworkProxyConfig
  private stats: NetworkStats
  private activeRequests: Map<string, NetworkRequestContext>
  private rateLimitTracker: Map<string, RateLimitEntry>
  private isInitialized: boolean = false

  constructor(
    securityPolicy: SecurityPolicy,
    domainReputationService: DomainReputationService,
    requestCache: RequestCache,
    config: NetworkProxyConfig
  ) {
    this.securityPolicy = securityPolicy
    this.domainReputationService = domainReputationService
    this.requestCache = requestCache
    this.httpRequestHandler = new HttpRequestHandler({
      timeout: config.defaultTimeoutMs,
      maxRedirects: 5,
      enforceHttps: config.enforceHttpsUpgrade,
      followRedirects: true,
      maxResponseSize: 10 * 1024 * 1024 // 10MB
    })
    this.config = config
    this.stats = this.initializeStats()
    this.activeRequests = new Map()
    this.rateLimitTracker = new Map()
  }

  /**
   * Initialize the network proxy service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    // Initialize dependent services
    await this.domainReputationService.initialize()

    // Start background tasks
    this.startStatsCollection()
    this.startRateLimitCleanup()
    this.startActiveRequestMonitoring()

    this.isInitialized = true
  }

  /**
   * Execute a network request with full security and performance pipeline
   */
  async executeRequest(request: NetworkRequest): Promise<NetworkExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    const context = this.createRequestContext(request)
    this.activeRequests.set(request.id, context)

    try {
      // 1. Rate limiting check
      const rateLimitCheck = await this.checkRateLimit(request)
      if (!rateLimitCheck.allowed) {
        return this.createErrorResult(context, {
          id: request.id,
          type: 'rate_limit',
          message: `Rate limit exceeded. Try again in ${rateLimitCheck.retryAfter} seconds`,
          retryable: true,
          timestamp: Date.now(),
          metadata: {
            originalRequest: request,
            retryAfter: rateLimitCheck.retryAfter
          }
        })
      }

      // 2. Security validation
      context.status = 'validating'
      const securityResult = await this.validateSecurity(request)
      context.securityViolations = securityResult.violations

      if (!securityResult.allowed && !securityResult.requiresUserApproval) {
        return this.createSecurityErrorResult(context, securityResult)
      }

      // 3. Check cache first (if enabled and request is cacheable)
      if (this.config.enableRequestCaching && this.isCacheable(request)) {
        const cachedResponse = await this.requestCache.get(request)
        if (cachedResponse) {
          context.cacheHit = true
          context.status = 'completed'
          context.endTime = Date.now()

          this.updateStats('cache_hit')
          return this.createSuccessResult(context, cachedResponse, { fromCache: true })
        }
      }

      // 4. Domain reputation check (if enabled)
      if (this.config.enableDomainReputation) {
        const domain = this.extractDomain(request.url)
        const reputation = await this.domainReputationService.checkDomain({ domain })
        context.domainReputation = reputation

        if (reputation.level === 'blocked') {
          return this.createErrorResult(context, {
            id: request.id,
            type: 'security',
            message: `Domain ${domain} is blocked due to reputation issues`,
            retryable: false,
            timestamp: Date.now(),
            metadata: {
              originalRequest: request,
              context: {
                domainReputation: reputation
              }
            }
          })
        }
      }

      // 5. Execute the actual HTTP request
      context.status = 'executing'
      const response = await this.executeHttpRequest(context)

      // 6. Cache the response (if successful and cacheable)
      if (response.status < 400 && this.isCacheable(request)) {
        await this.requestCache.set(request, response)
      }

      context.status = 'completed'
      context.endTime = Date.now()

      this.updateStats('success')
      return this.createSuccessResult(context, response)
    } catch (error) {
      context.status = 'failed'
      context.endTime = Date.now()

      const errorMessage = error instanceof Error ? error.message : 'Network request failed'
      const errorStack = error instanceof Error ? error.stack : undefined

      const networkError: NetworkError = {
        id: request.id,
        type: 'network',
        message: errorMessage,
        retryable: this.isRetryableError(error),
        timestamp: Date.now(),
        metadata: {
          originalRequest: request,
          stackTrace: errorStack
        }
      }

      this.updateStats('error')
      return this.createErrorResult(context, networkError)
    } finally {
      this.activeRequests.delete(request.id)
    }
  }

  /**
   * Check domain reputation without executing request
   */
  async checkDomain(domain: string): Promise<DomainReputation> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    return this.domainReputationService.checkDomain({ domain })
  }

  /**
   * Update network settings
   */
  async updateSettings(settings: NetworkSettings): Promise<void> {
    // Update security policy
    this.securityPolicy.updateConfig(settings)

    // Update proxy configuration
    this.config = {
      ...this.config,
      maxConcurrentRequests: settings.maxConcurrentRequests,
      defaultTimeoutMs: settings.defaultTimeoutMs,
      enableSecurityValidation: settings.enableReputationCheck,
      enableDomainReputation: settings.enableReputationCheck,
      enableRequestCaching: settings.enableCaching,
      blockPrivateNetworks: !settings.allowPrivateNetworks
    }
  }

  /**
   * Get current network statistics
   */
  async getStats(): Promise<NetworkStats> {
    return {
      ...this.stats,
      activeConnections: this.activeRequests.size,
      uptime: Date.now() - (this.stats.detailed?.performanceMetrics?.slowestRequest?.timestamp || Date.now())
    }
  }

  /**
   * Get active requests
   */
  getActiveRequests(): NetworkRequestContext[] {
    return Array.from(this.activeRequests.values())
  }

  /**
   * Cancel active request
   */
  async cancelRequest(requestId: string): Promise<boolean> {
    const context = this.activeRequests.get(requestId)
    if (!context) return false

    // Cancel in HTTP handler if possible
    const httpCancelled = this.httpRequestHandler.cancelRequest(requestId)

    // Update context
    context.status = 'failed'
    context.endTime = Date.now()
    this.activeRequests.delete(requestId)

    return httpCancelled
  }

  /**
   * Clear all caches and reset stats
   */
  async reset(): Promise<void> {
    await this.requestCache.clear()
    this.stats = this.initializeStats()
    this.activeRequests.clear()
    this.rateLimitTracker.clear()
  }

  /**
   * Dispose of the service and cleanup resources
   */
  dispose(): void {
    this.activeRequests.clear()
    this.rateLimitTracker.clear()
    this.requestCache.dispose()
    this.domainReputationService.dispose()
    this.isInitialized = false
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createRequestContext(request: NetworkRequest): NetworkRequestContext {
    return {
      request,
      status: 'pending',
      startTime: Date.now(),
      retryCount: 0,
      cacheHit: false,
      securityViolations: [],
      metadata: {
        traceId: this.generateTraceId(),
        artifactId: request.artifactId,
        userAgent: request.headers?.['user-agent']
      }
    }
  }

  private async validateSecurity(request: NetworkRequest): Promise<SecurityValidationResult> {
    if (!this.config.enableSecurityValidation) {
      return {
        allowed: true,
        violations: [],
        warnings: [],
        requiresUserApproval: false
      }
    }

    return this.securityPolicy.validateRequest(request)
  }

  private async checkRateLimit(request: NetworkRequest): Promise<RateLimitStatus> {
    if (!this.config.enableRateLimiting) {
      return {
        allowed: true,
        remainingRequests: Infinity,
        resetTime: Date.now() + 60000
      }
    }

    const key = this.getRateLimitKey(request)
    const entry = this.rateLimitTracker.get(key) || this.createRateLimitEntry()

    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minute window

    // Reset window if expired
    if (now - entry.windowStart > windowMs) {
      entry.count = 0
      entry.windowStart = now
    }

    // Check if limit exceeded
    if (entry.count >= this.config.maxConcurrentRequests) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: entry.windowStart + windowMs,
        retryAfter: Math.ceil((entry.windowStart + windowMs - now) / 1000)
      }
    }

    // Increment counter
    entry.count++
    entry.lastAccess = now
    this.rateLimitTracker.set(key, entry)

    return {
      allowed: true,
      remainingRequests: this.config.maxConcurrentRequests - entry.count,
      resetTime: entry.windowStart + windowMs
    }
  }

  private async executeHttpRequest(context: NetworkRequestContext): Promise<NetworkResponse> {
    const { request } = context
    let lastError: Error = new Error('No attempts made')

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        context.retryCount = attempt
        await this.delay(this.config.retryDelayMs * attempt)
      }

      try {
        const startTime = Date.now()

        // Prepare request headers
        const headers = {
          ...request.headers,
          'User-Agent': request.headers?.['user-agent'] || 'Cherry-Studio-Artifact/1.0'
        }

        // Execute HTTP request (placeholder implementation)
        const response = await this.performHttpRequest(request, headers)

        const endTime = Date.now()
        const responseTime = endTime - startTime

        return {
          id: request.id,
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: response.body,
          fromCache: false,
          responseTime,
          timestamp: endTime,
          metadata: {
            contentLength: response.body.length,
            contentType: response.headers['content-type'],
            retryAttempts: attempt,
            finalUrl: request.url
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (attempt === this.config.maxRetries || !this.isRetryableError(error)) {
          break
        }
      }
    }

    throw lastError
  }

  private async performHttpRequest(
    request: NetworkRequest,
    headers: Record<string, string>
  ): Promise<{
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
  }> {
    // Use the actual HTTP request handler
    const requestWithHeaders = {
      ...request,
      headers: { ...request.headers, ...headers }
    }

    const httpResponse = await this.httpRequestHandler.executeRequest(requestWithHeaders)

    return {
      status: httpResponse.status,
      statusText: httpResponse.statusText,
      headers: httpResponse.headers,
      body: httpResponse.body
    }
  }

  private isCacheable(request: NetworkRequest): boolean {
    return request.method === 'GET' && !request.url.includes('no-cache')
  }

  private isRetryableError(error: any): boolean {
    // Network errors, timeouts, and 5xx status codes are typically retryable
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      (error.status >= 500 && error.status < 600)
    )
  }

  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }

  private getRateLimitKey(request: NetworkRequest): string {
    // Rate limit per artifact or per domain
    return `${request.artifactId}_${this.extractDomain(request.url)}`
  }

  private createRateLimitEntry(): RateLimitEntry {
    const now = Date.now()
    return {
      count: 0,
      windowStart: now,
      lastAccess: now
    }
  }

  private createSuccessResult(
    context: NetworkRequestContext,
    response: NetworkResponse,
    metadata?: any
  ): NetworkExecutionResult {
    return {
      success: true,
      response,
      context,
      metadata: {
        fromCache: context.cacheHit,
        securityOverrideUsed: context.securityViolations.length > 0,
        domainReputationScore: context.domainReputation?.confidence,
        executionTimeMs: (context.endTime || Date.now()) - context.startTime,
        retryAttempts: context.retryCount,
        ...metadata
      }
    }
  }

  private createErrorResult(context: NetworkRequestContext, error: NetworkError): NetworkExecutionResult {
    return {
      success: false,
      error,
      context,
      metadata: {
        fromCache: false,
        securityOverrideUsed: context.securityViolations.length > 0,
        domainReputationScore: context.domainReputation?.confidence,
        executionTimeMs: (context.endTime || Date.now()) - context.startTime,
        retryAttempts: context.retryCount
      }
    }
  }

  private createSecurityErrorResult(
    context: NetworkRequestContext,
    securityResult: SecurityValidationResult
  ): NetworkExecutionResult {
    const primaryViolation = securityResult.violations[0]

    const error: NetworkError = {
      id: context.request.id,
      type: 'security',
      message: primaryViolation?.message || 'Security validation failed',
      retryable: primaryViolation?.canOverride || false,
      timestamp: Date.now(),
      metadata: {
        originalRequest: context.request,
        context: {
          securityViolations: securityResult.violations
        }
      }
    }

    return this.createErrorResult(context, error)
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private initializeStats(): NetworkStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      blockedRequests: 0,
      cacheHitRate: 0,
      averageResponseTime: 0,
      activeConnections: 0,
      rateLimitRemaining: this.config.maxConcurrentRequests,
      uptime: 0,
      detailed: {
        requestsByMethod: { GET: 0, POST: 0, PUT: 0, DELETE: 0 },
        requestsByStatus: {},
        errorsByType: {},
        topDomains: [],
        performanceMetrics: {
          p50ResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0,
          slowestRequest: {
            url: '',
            responseTime: 0,
            timestamp: Date.now()
          }
        },
        cacheMetrics: {
          hitCount: 0,
          missCount: 0,
          evictionCount: 0,
          totalSizeBytes: 0,
          avgEntrySize: 0
        },
        securityMetrics: {
          violationsByType: {
            private_network: 0,
            malicious_domain: 0,
            rate_limit_exceeded: 0,
            invalid_protocol: 0,
            blocked_port: 0
          },
          overridesGranted: 0,
          maliciousDomainsBlocked: 0,
          privateNetworkAttempts: 0
        }
      }
    }
  }

  private updateStats(type: 'success' | 'error' | 'cache_hit'): void {
    this.stats.totalRequests++

    switch (type) {
      case 'success':
        this.stats.successfulRequests++
        break
      case 'error':
        this.stats.failedRequests++
        break
      case 'cache_hit':
        this.stats.detailed!.cacheMetrics.hitCount++
        break
    }

    // Update cache hit rate
    const totalCacheRequests = this.stats.detailed!.cacheMetrics.hitCount + this.stats.detailed!.cacheMetrics.missCount
    if (totalCacheRequests > 0) {
      this.stats.cacheHitRate = this.stats.detailed!.cacheMetrics.hitCount / totalCacheRequests
    }
  }

  private startStatsCollection(): void {
    // Collect stats every 30 seconds
    setInterval(() => {
      // Update performance metrics, cleanup old data, etc.
      this.collectPerformanceMetrics()
    }, 30000)
  }

  private startRateLimitCleanup(): void {
    // Cleanup expired rate limit entries every 5 minutes
    setInterval(
      () => {
        const now = Date.now()
        const expiredKeys: string[] = []

        this.rateLimitTracker.forEach((entry, key) => {
          if (now - entry.lastAccess > 5 * 60 * 1000) {
            // 5 minutes
            expiredKeys.push(key)
          }
        })

        expiredKeys.forEach((key) => this.rateLimitTracker.delete(key))
      },
      5 * 60 * 1000
    )
  }

  private startActiveRequestMonitoring(): void {
    // Monitor for hung requests every minute
    setInterval(() => {
      const now = Date.now()
      const timeoutMs = this.config.defaultTimeoutMs * 2 // Double timeout for monitoring

      this.activeRequests.forEach((context, requestId) => {
        if (now - context.startTime > timeoutMs) {
          console.warn(`Request ${requestId} has been active for ${now - context.startTime}ms`)
          // Could implement automatic cleanup here
        }
      })
    }, 60000)
  }

  private collectPerformanceMetrics(): void {
    // Collect and update performance metrics from completed requests
    // This would analyze response times, update percentiles, etc.
  }
}

// ============================================================================
// Supporting Interfaces
// ============================================================================

interface RateLimitEntry {
  count: number
  windowStart: number
  lastAccess: number
}

// ============================================================================
// Factory Function
// ============================================================================

export function createNetworkProxyService(
  securityPolicy: SecurityPolicy,
  domainReputationService: DomainReputationService,
  requestCache: RequestCache,
  config: Partial<NetworkProxyConfig> = {}
): NetworkProxyService {
  const defaultConfig: NetworkProxyConfig = {
    enableSecurityValidation: true,
    enableDomainReputation: true,
    enableRequestCaching: true,
    enableRateLimiting: true,
    maxConcurrentRequests: 10,
    defaultTimeoutMs: 10000,
    maxRetries: 3,
    retryDelayMs: 1000,
    enforceHttpsUpgrade: true,
    blockPrivateNetworks: true,
    validateUserAgent: false,
    enableRequestTracing: true,
    enableMetrics: true,
    enableDebugLogging: false
  }

  const finalConfig = { ...defaultConfig, ...config }

  return new NetworkProxyService(securityPolicy, domainReputationService, requestCache, finalConfig)
}

export default NetworkProxyService
