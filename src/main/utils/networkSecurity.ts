/**
 * Network Security Utilities
 *
 * Provides security validation, error handling, and utility functions
 * for secure network-enabled TSX artifacts.
 */

import type {
  NetworkError,
  NetworkErrorCode,
  NetworkRequest,
  ReputationLevel,
  SecurityViolation,
  SecurityViolationType
} from '../types/networkTypes'

// ============================================================================
// Enhanced Error Classes
// ============================================================================

export class NetworkSecurityError extends Error {
  public readonly code: NetworkErrorCode
  public readonly type: 'network' | 'security' | 'rate_limit' | 'timeout' | 'validation'
  public readonly retryable: boolean
  public readonly details?: Record<string, any>
  public readonly suggestedFix?: string
  public readonly timestamp: number
  public readonly requestId?: string
  public readonly artifactId?: string

  constructor(
    message: string,
    code: NetworkErrorCode,
    type: 'network' | 'security' | 'rate_limit' | 'timeout' | 'validation',
    options: {
      retryable?: boolean
      details?: Record<string, any>
      suggestedFix?: string
      requestId?: string
      artifactId?: string
      cause?: Error
    } = {}
  ) {
    super(message)
    this.name = 'NetworkSecurityError'
    this.code = code
    this.type = type
    this.retryable = options.retryable ?? false
    this.details = options.details
    this.suggestedFix = options.suggestedFix
    this.timestamp = Date.now()
    this.requestId = options.requestId
    this.artifactId = options.artifactId

    if (options.cause) {
      this.cause = options.cause
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NetworkSecurityError)
    }
  }

  toNetworkError(): NetworkError {
    return {
      id: this.requestId || 'unknown',
      type: this.type,
      message: this.message,
      details: this.details,
      suggestedFix: this.suggestedFix,
      retryable: this.retryable,
      timestamp: this.timestamp,
      metadata: {
        errorCode: this.code,
        stackTrace: this.stack,
        context: {
          artifactId: this.artifactId
        }
      }
    }
  }
}

export class SecurityViolationError extends NetworkSecurityError {
  public readonly violation: SecurityViolation

  constructor(violation: SecurityViolation, options: { cause?: Error } = {}) {
    super(violation.message, 'ERR_MALICIOUS_DOMAIN', 'security', {
      retryable: violation.canOverride,
      details: { violation },
      suggestedFix: violation.overrideInstructions,
      requestId: violation.requestId,
      artifactId: violation.metadata?.artifactId,
      cause: options.cause
    })

    this.violation = violation
    this.name = 'SecurityViolationError'
  }
}

export class RateLimitError extends NetworkSecurityError {
  public readonly resetTime: number
  public readonly retryAfter: number

  constructor(
    message: string,
    resetTime: number,
    retryAfter: number,
    options: { requestId?: string; artifactId?: string } = {}
  ) {
    super(message, 'ERR_RATE_LIMIT_EXCEEDED', 'rate_limit', {
      retryable: true,
      details: { resetTime, retryAfter },
      suggestedFix: `Try again in ${retryAfter} seconds`,
      ...options
    })

    this.resetTime = resetTime
    this.retryAfter = retryAfter
    this.name = 'RateLimitError'
  }
}

// ============================================================================
// URL and Protocol Validation
// ============================================================================

export class UrlValidator {
  private static readonly ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
  private static readonly BLOCKED_PORTS = new Set([22, 23, 25, 53, 135, 139, 445, 1433, 1521, 3306, 3389, 5432])

  /**
   * Validate URL format and security
   */
  static validateUrl(
    url: string,
    options: {
      allowHttp?: boolean
      blockPrivateNetworks?: boolean
      customBlockedPorts?: number[]
    } = {}
  ): UrlValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      const urlObj = new URL(url)

      // Protocol validation
      if (!this.ALLOWED_PROTOCOLS.has(urlObj.protocol)) {
        errors.push(`Protocol '${urlObj.protocol}' is not allowed`)
      }

      // HTTPS enforcement
      if (!options.allowHttp && urlObj.protocol === 'http:') {
        warnings.push('HTTP protocol is less secure than HTTPS')
      }

      // Port validation
      const port = this.getPortFromUrl(urlObj)
      const blockedPorts = new Set([...this.BLOCKED_PORTS, ...(options.customBlockedPorts || [])])

      if (blockedPorts.has(port)) {
        errors.push(`Port ${port} is blocked for security reasons`)
      }

      // Private network validation
      if (options.blockPrivateNetworks && this.isPrivateNetwork(urlObj.hostname)) {
        errors.push(`Private network address '${urlObj.hostname}' is blocked`)
      }

      // Domain validation
      if (!this.isValidDomain(urlObj.hostname)) {
        errors.push(`Invalid domain name '${urlObj.hostname}'`)
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        parsedUrl: urlObj,
        isPrivateNetwork: this.isPrivateNetwork(urlObj.hostname),
        port,
        protocol: urlObj.protocol
      }
    } catch (error) {
      return {
        valid: false,
        errors: [`Invalid URL format: ${error instanceof Error ? error.message : String(error)}`],
        warnings: [],
        parsedUrl: null,
        isPrivateNetwork: false,
        port: 0,
        protocol: ''
      }
    }
  }

  /**
   * Check if hostname is a private network address
   */
  static isPrivateNetwork(hostname: string): boolean {
    // Localhost patterns
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '127.0.0.1') {
      return true
    }

    // Private IP ranges (IPv4)
    const privateRanges = [
      /^10\./, // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
      /^192\.168\./, // 192.168.0.0/16
      /^127\./, // 127.0.0.0/8 (loopback)
      /^169\.254\./ // 169.254.0.0/16 (link-local)
    ]

    // IPv6 private ranges
    const ipv6PrivateRanges = [
      /^::1$/, // Loopback
      /^fc[0-9a-f]{2}:/i, // Unique local
      /^fe80:/i // Link-local
    ]

    return (
      privateRanges.some((range) => range.test(hostname)) || ipv6PrivateRanges.some((range) => range.test(hostname))
    )
  }

  /**
   * Validate domain name format
   */
  static isValidDomain(domain: string): boolean {
    if (!domain || domain.length === 0) return false
    if (domain.length > 253) return false

    // Basic domain regex (simplified)
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

    // Check for IP addresses (should be handled separately)
    const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/

    return domainRegex.test(domain) || ipv4Regex.test(domain) || ipv6Regex.test(domain)
  }

  /**
   * Get port number from URL object
   */
  private static getPortFromUrl(url: URL): number {
    if (url.port) {
      return parseInt(url.port, 10)
    }

    // Default ports
    switch (url.protocol) {
      case 'http:':
        return 80
      case 'https:':
        return 443
      case 'ftp:':
        return 21
      default:
        return 0
    }
  }
}

export interface UrlValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  parsedUrl: URL | null
  isPrivateNetwork: boolean
  port: number
  protocol: string
}

// ============================================================================
// Request Sanitization and Validation
// ============================================================================

export class RequestSanitizer {
  private static readonly DANGEROUS_HEADERS = new Set([
    'host',
    'origin',
    'referer',
    'cookie',
    'set-cookie',
    'authorization'
  ])

  private static readonly MAX_BODY_SIZE = 10 * 1024 * 1024 // 10MB
  private static readonly MAX_URL_LENGTH = 2048
  private static readonly MAX_HEADER_VALUE_LENGTH = 8192

  /**
   * Sanitize and validate network request
   */
  static sanitizeRequest(request: NetworkRequest): RequestSanitizationResult {
    const errors: string[] = []
    const warnings: string[] = []
    const sanitizedRequest: NetworkRequest = { ...request }

    // URL validation
    if (!request.url || request.url.length > this.MAX_URL_LENGTH) {
      errors.push(`URL is required and must be less than ${this.MAX_URL_LENGTH} characters`)
    }

    // Method validation
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE']
    if (!validMethods.includes(request.method)) {
      errors.push(`Method must be one of: ${validMethods.join(', ')}`)
    }

    // Headers sanitization
    if (request.headers) {
      sanitizedRequest.headers = this.sanitizeHeaders(request.headers, warnings)
    }

    // Body validation
    if (request.body) {
      if (typeof request.body !== 'string') {
        errors.push('Request body must be a string')
      } else if (request.body.length > this.MAX_BODY_SIZE) {
        errors.push(`Request body must be less than ${this.MAX_BODY_SIZE} bytes`)
      } else {
        sanitizedRequest.body = this.sanitizeBody(request.body)
      }
    }

    // Timeout validation
    if (request.timeout !== undefined) {
      if (typeof request.timeout !== 'number' || request.timeout <= 0 || request.timeout > 300000) {
        errors.push('Timeout must be a positive number less than 300000ms (5 minutes)')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedRequest
    }
  }

  /**
   * Sanitize request headers
   */
  private static sanitizeHeaders(headers: Record<string, string>, warnings: string[]): Record<string, string> {
    const sanitized: Record<string, string> = {}

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase()

      // Check for dangerous headers
      if (this.DANGEROUS_HEADERS.has(lowerKey)) {
        warnings.push(`Dangerous header '${key}' was removed`)
        continue
      }

      // Validate header value length
      if (value.length > this.MAX_HEADER_VALUE_LENGTH) {
        warnings.push(`Header '${key}' value was truncated (too long)`)
        sanitized[key] = value.substring(0, this.MAX_HEADER_VALUE_LENGTH)
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Sanitize request body
   */
  private static sanitizeBody(body: string): string {
    // Remove any null bytes or other potentially dangerous characters
    return body.replace(/\0/g, '').trim()
  }
}

export interface RequestSanitizationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  sanitizedRequest: NetworkRequest
}

// ============================================================================
// Security Violation Utilities
// ============================================================================

export class SecurityViolationBuilder {
  private violation: Partial<SecurityViolation> = {}

  constructor(requestId: string, violationType: SecurityViolationType) {
    this.violation = {
      requestId,
      violationType,
      timestamp: Date.now(),
      canOverride: true,
      metadata: {
        severity: 'medium',
        riskScore: 5,
        detectionSource: []
      }
    }
  }

  withMessage(message: string): this {
    this.violation.message = message
    return this
  }

  withSeverity(severity: 'low' | 'medium' | 'high' | 'critical'): this {
    if (this.violation.metadata) {
      this.violation.metadata.severity = severity
    }
    return this
  }

  withRiskScore(score: number): this {
    if (this.violation.metadata) {
      this.violation.metadata.riskScore = Math.max(0, Math.min(10, score))
    }
    return this
  }

  nonOverridable(): this {
    this.violation.canOverride = false
    return this
  }

  withOverrideInstructions(instructions: string): this {
    this.violation.overrideInstructions = instructions
    return this
  }

  withEvidence(evidence: Record<string, any>): this {
    if (this.violation.metadata) {
      this.violation.metadata.evidence = evidence
    }
    return this
  }

  withDetectionSource(source: string): this {
    if (this.violation.metadata?.detectionSource) {
      this.violation.metadata.detectionSource.push(source)
    }
    return this
  }

  withUrl(url: string): this {
    if (this.violation.metadata) {
      this.violation.metadata.url = url
    }
    return this
  }

  withArtifactId(artifactId: string): this {
    if (this.violation.metadata) {
      this.violation.metadata.artifactId = artifactId
    }
    return this
  }

  build(): SecurityViolation {
    if (!this.violation.message) {
      throw new Error('Security violation must have a message')
    }

    return this.violation as SecurityViolation
  }
}

// ============================================================================
// Error Analysis and Recovery
// ============================================================================

export class ErrorAnalyzer {
  /**
   * Analyze error and suggest recovery strategies
   */
  static analyzeError(error: NetworkError | Error): ErrorAnalysis {
    if (error instanceof NetworkSecurityError) {
      return this.analyzeNetworkSecurityError(error)
    }

    if (error instanceof Error) {
      return this.analyzeGenericError(error)
    }

    return this.analyzeNetworkError(error as NetworkError)
  }

  private static analyzeNetworkSecurityError(error: NetworkSecurityError): ErrorAnalysis {
    return {
      category: error.type,
      severity: this.getSeverityFromType(error.type),
      retryable: error.retryable,
      suggestedActions: this.getSuggestedActions(error.type),
      estimatedRecoveryTime: this.getRecoveryTime(error.type),
      userFriendlyMessage: this.getUserFriendlyMessage(error.message, error.type),
      technicalDetails: {
        errorCode: error.code,
        originalMessage: error.message,
        stackTrace: error.stack
      }
    }
  }

  private static analyzeGenericError(error: Error): ErrorAnalysis {
    return {
      category: 'unknown',
      severity: 'medium',
      retryable: false,
      suggestedActions: ['Check network connection', 'Try again later'],
      estimatedRecoveryTime: 0,
      userFriendlyMessage: 'An unexpected error occurred',
      technicalDetails: {
        originalMessage: error.message,
        stackTrace: error.stack
      }
    }
  }

  private static analyzeNetworkError(error: NetworkError): ErrorAnalysis {
    return {
      category: error.type,
      severity: this.getSeverityFromType(error.type),
      retryable: error.retryable,
      suggestedActions: this.getSuggestedActions(error.type),
      estimatedRecoveryTime: this.getRecoveryTime(error.type),
      userFriendlyMessage: this.getUserFriendlyMessage(error.message, error.type),
      technicalDetails: {
        errorCode: error.metadata?.errorCode,
        originalMessage: error.message,
        details: error.details
      }
    }
  }

  private static getSeverityFromType(type: string): 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
      network: 'medium',
      security: 'high',
      rate_limit: 'low',
      timeout: 'low',
      validation: 'medium'
    }

    return severityMap[type] || 'medium'
  }

  private static getSuggestedActions(type: string): string[] {
    const actionMap: Record<string, string[]> = {
      network: ['Check internet connection', 'Verify the URL is correct', 'Try again later'],
      security: ['Contact administrator', 'Use a different domain', 'Check security settings'],
      rate_limit: ['Wait before retrying', 'Reduce request frequency', 'Check rate limits'],
      timeout: ['Try again with longer timeout', 'Check network speed', 'Verify server status'],
      validation: ['Check request format', 'Verify all required fields', 'Review API documentation']
    }

    return actionMap[type] || ['Try again later', 'Contact support if problem persists']
  }

  private static getRecoveryTime(type: string): number {
    const recoveryTimeMap: Record<string, number> = {
      network: 30000, // 30 seconds
      security: 0, // Manual intervention required
      rate_limit: 60000, // 1 minute
      timeout: 10000, // 10 seconds
      validation: 0 // Immediate fix required
    }

    return recoveryTimeMap[type] || 30000
  }

  private static getUserFriendlyMessage(message: string, type: string): string {
    const friendlyMessages: Record<string, string> = {
      network: 'Unable to connect to the requested service. Please check your internet connection.',
      security: 'This request has been blocked for security reasons.',
      rate_limit: 'Too many requests. Please wait a moment before trying again.',
      timeout: 'The request took too long to complete. Please try again.',
      validation: 'The request contains invalid data. Please check your input.'
    }

    return friendlyMessages[type] || message
  }
}

export interface ErrorAnalysis {
  category: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  retryable: boolean
  suggestedActions: string[]
  estimatedRecoveryTime: number // milliseconds
  userFriendlyMessage: string
  technicalDetails: {
    errorCode?: string
    originalMessage: string
    stackTrace?: string
    details?: Record<string, any>
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Create security violation for private network access
 */
export function createPrivateNetworkViolation(requestId: string, url: string, artifactId: string): SecurityViolation {
  return new SecurityViolationBuilder(requestId, 'private_network')
    .withMessage(`Access to private network address is blocked: ${url}`)
    .withSeverity('high')
    .withRiskScore(8)
    .withOverrideInstructions('Confirm that you trust this private network address')
    .withDetectionSource('private_network_detector')
    .withUrl(url)
    .withArtifactId(artifactId)
    .build()
}

/**
 * Create security violation for malicious domain
 */
export function createMaliciousDomainViolation(
  requestId: string,
  domain: string,
  reputation: ReputationLevel,
  artifactId: string
): SecurityViolation {
  return new SecurityViolationBuilder(requestId, 'malicious_domain')
    .withMessage(`Domain ${domain} is blocked due to reputation: ${reputation}`)
    .withSeverity('critical')
    .withRiskScore(10)
    .nonOverridable()
    .withDetectionSource('domain_reputation')
    .withEvidence({ domain, reputation })
    .withArtifactId(artifactId)
    .build()
}

/**
 * Create rate limit violation
 */
export function createRateLimitViolation(requestId: string, artifactId: string): SecurityViolation {
  return new SecurityViolationBuilder(requestId, 'rate_limit_exceeded')
    .withMessage('Rate limit exceeded for this artifact')
    .withSeverity('low')
    .withRiskScore(3)
    .withOverrideInstructions('Wait for rate limit to reset or upgrade your plan')
    .withDetectionSource('rate_limiter')
    .withArtifactId(artifactId)
    .build()
}

/**
 * Determine if error is retryable
 */
export function isRetryableError(error: Error | NetworkError): boolean {
  if (error instanceof NetworkSecurityError) {
    return error.retryable
  }

  if ('retryable' in error) {
    return error.retryable
  }

  // Check for known retryable error codes
  const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']
  return retryableCodes.some((code) => error.message.includes(code))
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): number {
  const delay = baseDelay * Math.pow(2, attempt - 1)
  const jitter = Math.random() * 0.1 * delay
  return Math.min(delay + jitter, maxDelay)
}

export default {
  NetworkSecurityError,
  SecurityViolationError,
  RateLimitError,
  UrlValidator,
  RequestSanitizer,
  SecurityViolationBuilder,
  ErrorAnalyzer,
  generateRequestId,
  createPrivateNetworkViolation,
  createMaliciousDomainViolation,
  createRateLimitViolation,
  isRetryableError,
  calculateBackoffDelay
}
