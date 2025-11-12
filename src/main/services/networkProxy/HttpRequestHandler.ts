/**
 * HTTP Request Handler
 *
 * Handles actual HTTP request execution with proper error handling,
 * timeout management, and response processing for network-enabled TSX artifacts.
 */

import * as http from 'http'
import * as https from 'https'
import type { NetworkRequest, NetworkErrorCode } from '../../types/networkTypes'
import { NetworkErrorCodes } from '../../types/networkTypes'
import {
  NetworkSecurityError,
  UrlValidator,
  RequestSanitizer
} from '../../utils/networkSecurity'

// ============================================================================
// Interfaces
// ============================================================================

export interface HttpRequestOptions {
  timeout: number
  maxRedirects: number
  validateStatus: boolean
  followRedirects: boolean
  maxResponseSize: number
  enforceHttps: boolean
}

export interface HttpResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  finalUrl: string
  redirectCount: number
}

export interface HttpRequestContext {
  startTime: number
  redirectCount: number
  finalUrl: string
  aborted: boolean
  controller?: AbortController
}

// ============================================================================
// HTTP Request Handler
// ============================================================================

export class HttpRequestHandler {
  private defaultOptions: HttpRequestOptions
  private activeRequests: Map<string, HttpRequestContext>

  constructor(options: Partial<HttpRequestOptions> = {}) {
    this.defaultOptions = {
      timeout: 10000,           // 10 seconds
      maxRedirects: 5,
      validateStatus: true,
      followRedirects: true,
      maxResponseSize: 10 * 1024 * 1024,  // 10MB
      enforceHttps: false,
      ...options
    }
    this.activeRequests = new Map()
  }

  /**
   * Execute HTTP request with comprehensive error handling
   */
  async executeRequest(
    request: NetworkRequest,
    options: Partial<HttpRequestOptions> = {}
  ): Promise<HttpResponse> {
    const mergedOptions = { ...this.defaultOptions, ...options }

    // Create request context for tracking
    const context: HttpRequestContext = {
      startTime: Date.now(),
      redirectCount: 0,
      finalUrl: request.url,
      aborted: false,
      controller: new AbortController()
    }

    this.activeRequests.set(request.id, context)

    try {
      // 1. Validate and sanitize request
      await this.validateRequest(request, mergedOptions)

      // 2. Execute the HTTP request
      const response = await this.performHttpRequest(request, context, mergedOptions)

      return response

    } catch (error) {
      this.handleRequestError(request, error, context)
      throw error

    } finally {
      this.activeRequests.delete(request.id)
    }
  }

  /**
   * Cancel active request
   */
  cancelRequest(requestId: string): boolean {
    const context = this.activeRequests.get(requestId)
    if (!context || context.aborted) return false

    context.aborted = true
    context.controller?.abort()
    this.activeRequests.delete(requestId)

    return true
  }

  /**
   * Get active request count
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async validateRequest(request: NetworkRequest, options: HttpRequestOptions): Promise<void> {
    // URL validation
    const urlValidation = UrlValidator.validateUrl(request.url, {
      allowHttp: !options.enforceHttps,
      blockPrivateNetworks: true,
      customBlockedPorts: [21, 22, 23, 25] // Additional blocked ports
    })

    if (!urlValidation.valid) {
      throw new NetworkSecurityError(
        `URL validation failed: ${urlValidation.errors.join(', ')}`,
        NetworkErrorCodes.INVALID_URL,
        'validation',
        {
          requestId: request.id,
          artifactId: request.artifactId,
          details: { urlValidation }
        }
      )
    }

    // Request sanitization
    const sanitization = RequestSanitizer.sanitizeRequest(request)
    if (!sanitization.valid) {
      throw new NetworkSecurityError(
        `Request validation failed: ${sanitization.errors.join(', ')}`,
        NetworkErrorCodes.INVALID_URL,
        'validation',
        {
          requestId: request.id,
          artifactId: request.artifactId,
          details: { sanitization }
        }
      )
    }

    // Method validation
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']
    if (!validMethods.includes(request.method)) {
      throw new NetworkSecurityError(
        `HTTP method '${request.method}' is not allowed`,
        'ERR_INVALID_METHOD',
        'validation',
        {
          requestId: request.id,
          artifactId: request.artifactId,
          details: { method: request.method, validMethods }
        }
      )
    }
  }

  private async performHttpRequest(
    request: NetworkRequest,
    context: HttpRequestContext,
    options: HttpRequestOptions
  ): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(request.url)
      const isHttps = urlObj.protocol === 'https:'
      const httpModule = isHttps ? https : http

      // Prepare request options
      const requestOptions: http.RequestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: request.method,
        headers: this.prepareHeaders(request.headers || {}, urlObj.hostname),
        timeout: options.timeout,
        signal: context.controller?.signal
      }

      // Add HTTPS-specific options
      if (isHttps) {
        Object.assign(requestOptions, {
          rejectUnauthorized: true,
          secureProtocol: 'TLSv1_2_method'
        })
      }

      const httpRequest = httpModule.request(requestOptions, (response) => {
        this.handleHttpResponse(response, request, context, options, resolve, reject)
      })

      // Request error handling
      httpRequest.on('error', (error) => {
        if (context.aborted) return
        reject(this.createNetworkError(request, error, 'network'))
      })

      httpRequest.on('timeout', () => {
        if (context.aborted) return
        context.controller?.abort()
        reject(this.createNetworkError(request, new Error('Request timeout'), 'timeout'))
      })

      httpRequest.on('abort', () => {
        if (!context.aborted) {
          context.aborted = true
          reject(this.createNetworkError(request, new Error('Request aborted'), 'network'))
        }
      })

      // Send request body if present
      if (request.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        try {
          httpRequest.write(request.body)
        } catch (error) {
          reject(this.createNetworkError(request, error, 'validation'))
          return
        }
      }

      httpRequest.end()
    })
  }

  private handleHttpResponse(
    response: http.IncomingMessage,
    request: NetworkRequest,
    context: HttpRequestContext,
    options: HttpRequestOptions,
    resolve: (value: HttpResponse) => void,
    reject: (reason: any) => void
  ): void {
    if (context.aborted) return

    // Handle redirects
    if (this.isRedirect(response.statusCode) && options.followRedirects) {
      if (context.redirectCount >= options.maxRedirects) {
        reject(this.createNetworkError(
          request,
          new Error(`Too many redirects (${context.redirectCount})`),
          'network'
        ))
        return
      }

      const location = response.headers.location
      if (location) {
        context.redirectCount++
        context.finalUrl = this.resolveUrl(context.finalUrl, location)

        // Create new request for redirect
        const redirectRequest = { ...request, url: context.finalUrl }
        this.performHttpRequest(redirectRequest, context, options)
          .then(resolve)
          .catch(reject)
        return
      }
    }

    // Collect response body
    const chunks: Buffer[] = []
    let totalSize = 0

    response.on('data', (chunk: Buffer) => {
      if (context.aborted) return

      totalSize += chunk.length
      if (totalSize > options.maxResponseSize) {
        context.controller?.abort()
        reject(this.createNetworkError(
          request,
          new Error(`Response too large (${totalSize} bytes)`),
          'network'
        ))
        return
      }

      chunks.push(chunk)
    })

    response.on('end', () => {
      if (context.aborted) return

      try {
        const body = Buffer.concat(chunks).toString('utf8')
        const responseHeaders = this.normalizeHeaders(response.headers)

        // Validate status code if required
        if (options.validateStatus && !this.isSuccessStatus(response.statusCode)) {
          reject(this.createNetworkError(
            request,
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`),
            'network',
            { status: response.statusCode, statusText: response.statusMessage }
          ))
          return
        }

        const httpResponse: HttpResponse = {
          status: response.statusCode || 0,
          statusText: response.statusMessage || '',
          headers: responseHeaders,
          body,
          finalUrl: context.finalUrl,
          redirectCount: context.redirectCount
        }

        resolve(httpResponse)

      } catch (error) {
        reject(this.createNetworkError(request, error, 'network'))
      }
    })

    response.on('error', (error) => {
      if (context.aborted) return
      reject(this.createNetworkError(request, error, 'network'))
    })
  }

  private prepareHeaders(headers: Record<string, string>, hostname: string): Record<string, string> {
    const prepared = { ...headers }

    // Set default headers
    if (!prepared['User-Agent']) {
      prepared['User-Agent'] = 'Cherry-Studio-Artifact/1.0'
    }

    if (!prepared['Accept']) {
      prepared['Accept'] = '*/*'
    }

    if (!prepared['Host']) {
      prepared['Host'] = hostname
    }

    // Remove potentially dangerous headers
    delete prepared['Cookie']
    delete prepared['Set-Cookie']
    delete prepared['Authorization'] // Will be handled separately in advanced features

    return prepared
  }

  private normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
    const normalized: Record<string, string> = {}

    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        normalized[key.toLowerCase()] = value
      } else if (Array.isArray(value)) {
        normalized[key.toLowerCase()] = value.join(', ')
      } else if (value !== undefined) {
        normalized[key.toLowerCase()] = String(value)
      }
    }

    return normalized
  }

  private isRedirect(statusCode?: number): boolean {
    return statusCode !== undefined && [301, 302, 303, 307, 308].includes(statusCode)
  }

  private isSuccessStatus(statusCode?: number): boolean {
    return statusCode !== undefined && statusCode >= 200 && statusCode < 300
  }

  private resolveUrl(base: string, relative: string): string {
    try {
      return new URL(relative, base).toString()
    } catch {
      return relative
    }
  }

  private createNetworkError(
    request: NetworkRequest,
    error: any,
    type: 'network' | 'timeout' | 'validation',
    details?: any
  ): NetworkSecurityError {
    return new NetworkSecurityError(
      error.message || 'HTTP request failed',
      this.getErrorCode(error, type),
      type,
      {
        requestId: request.id,
        artifactId: request.artifactId,
        retryable: this.isRetryableError(error, type),
        details: {
          originalError: error.message,
          errorCode: error.code,
          ...details
        },
        cause: error
      }
    )
  }

  private getErrorCode(error: any, type: string): NetworkErrorCode {
    if (error.code) {
      switch (error.code) {
        case 'ENOTFOUND':
          return NetworkErrorCodes.DNS_RESOLUTION_FAILED
        case 'ECONNREFUSED':
        case 'ECONNRESET':
        case 'ETIMEDOUT':
          return NetworkErrorCodes.CONNECTION_FAILED
        default:
          return NetworkErrorCodes.CONNECTION_FAILED
      }
    }

    switch (type) {
      case 'timeout':
        return NetworkErrorCodes.TIMEOUT
      case 'validation':
        return NetworkErrorCodes.INVALID_URL
      default:
        return NetworkErrorCodes.CONNECTION_FAILED
    }
  }

  private isRetryableError(error: any, type: string): boolean {
    // Network errors that are typically retryable
    const retryableCodes = [
      'ECONNRESET',    // Connection reset
      'ETIMEDOUT',     // Timeout
      'ENOTFOUND',     // DNS lookup failed
      'ECONNREFUSED',  // Connection refused
      'EPIPE',         // Broken pipe
      'SOCKET_TIMEOUT' // Socket timeout
    ]

    if (error.code && retryableCodes.includes(error.code)) {
      return true
    }

    // HTTP status codes that are retryable
    if (error.status) {
      return error.status >= 500 && error.status < 600 // Server errors
    }

    // Timeouts are generally retryable
    return type === 'timeout'
  }

  private handleRequestError(request: NetworkRequest, error: any, context: HttpRequestContext): void {
    // Log error details for debugging
    const errorDetails = {
      requestId: request.id,
      artifactId: request.artifactId,
      url: request.url,
      method: request.method,
      duration: Date.now() - context.startTime,
      redirectCount: context.redirectCount,
      finalUrl: context.finalUrl,
      error: {
        message: error.message,
        code: error.code,
        type: error.constructor.name
      }
    }

    // In production, this would go through the logging service
    console.error('HTTP request failed:', errorDetails)
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createHttpRequestHandler(options: Partial<HttpRequestOptions> = {}): HttpRequestHandler {
  return new HttpRequestHandler(options)
}

export default HttpRequestHandler
