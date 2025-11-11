import { loggerService } from '@logger'
import Bottleneck from 'bottleneck'
import { UnstructuredClient } from 'unstructured-client'
import type { PartitionResponse } from 'unstructured-client/sdk/models/operations'
import { Strategy } from 'unstructured-client/sdk/models/shared'

import type {
  BoundingBox,
  ElementType,
  ProcessedElement,
  ProcessingParams,
  UnstructuredApiElement,
  UnstructuredConfig,
  UnstructuredError
} from './types/UnstructuredTypes'

const logger = loggerService.withContext('UnstructuredApiClient')

export class UnstructuredApiClient {
  private client: UnstructuredClient
  private rateLimiter: Bottleneck

  constructor(private config: UnstructuredConfig) {
    // Initialize the official Unstructured client
    this.client = new UnstructuredClient({
      security: {
        apiKeyAuth: config.apiKey || ''
      },
      serverURL: config.apiEndpoint
    })

    // Token bucket rate limiter (10 requests per minute for hosted, 100 for self-hosted)
    this.rateLimiter = new Bottleneck({
      reservoir: config.deploymentType === 'hosted' ? 10 : 100,
      reservoirRefreshAmount: config.deploymentType === 'hosted' ? 10 : 100,
      reservoirRefreshInterval: 60 * 1000, // 1 minute
      maxConcurrent: 1
    })

    logger.info('UnstructuredApiClient initialized', {
      deploymentType: config.deploymentType,
      endpoint: config.apiEndpoint,
      processingMode: config.processingMode
    })
  }

  /**
   * Process a document using Unstructured.io API with rate limiting
   */
  async processDocument(fileBuffer: Buffer, fileName: string, params: ProcessingParams): Promise<ProcessedElement[]> {
    return this.rateLimiter.schedule(() => this.executeProcessing(fileBuffer, fileName, params))
  }

  /**
   * Execute the actual processing request
   */
  private async executeProcessing(
    fileBuffer: Buffer,
    fileName: string,
    params: ProcessingParams
  ): Promise<ProcessedElement[]> {
    const startTime = Date.now()
    let retryCount = 0

    while (retryCount <= this.config.maxRetries) {
      try {
        logger.info('Processing document', {
          fileName,
          attempt: retryCount + 1,
          maxRetries: this.config.maxRetries + 1,
          params
        })

        // Map strategy to the official client's Strategy enum
        const strategyMapping: Record<string, Strategy> = {
          fast: Strategy.Fast,
          hi_res: Strategy.HiRes,
          auto: Strategy.Auto
        }

        // Prepare partition parameters using the official client structure
        const partitionParams = {
          files: {
            content: fileBuffer,
            fileName: fileName
          },
          strategy: strategyMapping[params.strategy] || Strategy.Fast,
          chunkingStrategy: params.chunkingStrategy,
          coordinates: params.coordinates,
          includePageBreaks: params.includePageBreaks,
          pdfInferTableStructure: params.pdfInferTableStructure,
          languages: params.languages,
          // Chunking parameters
          maxCharacters: params.maxCharacters,
          combineUnderNChars: params.combineUnderNChars,
          newAfterNChars: params.newAfterNChars,
          overlap: params.overlap,
          overlapAll: params.overlapAll
        }

        // Remove undefined values to avoid sending empty parameters
        Object.keys(partitionParams).forEach((key) => {
          if (partitionParams[key as keyof typeof partitionParams] === undefined) {
            delete partitionParams[key as keyof typeof partitionParams]
          }
        })

        // Use the official client to process the document
        const response: PartitionResponse = await this.client.general.partition({
          partitionParameters: partitionParams
        })

        const processingTime = Date.now() - startTime

        // The official client handles status codes internally and throws errors for failures
        // Extract elements from response - the response structure contains the elements directly
        const elements = this.transformResponse(response as unknown as UnstructuredApiElement[])

        logger.info('Document processing completed', {
          fileName,
          elementsCount: elements.length,
          processingTimeMs: processingTime,
          attempt: retryCount + 1
        })

        return elements
      } catch (error) {
        const processingTime = Date.now() - startTime
        const unstructuredError = this.classifyError(error as Error)

        logger.error('Document processing failed', {
          fileName,
          attempt: retryCount + 1,
          maxRetries: this.config.maxRetries + 1,
          processingTimeMs: processingTime,
          error: unstructuredError
        })

        // Check if we should retry
        if (!unstructuredError.retryable || retryCount >= this.config.maxRetries) {
          throw new Error(`Unstructured.io processing failed: ${unstructuredError.message}`)
        }

        // Calculate backoff delay
        let backoffMs: number

        // For 429 rate limit errors, respect Retry-After header if present
        if (unstructuredError.type === 'quota_exceeded' && unstructuredError.details?.retryAfter) {
          backoffMs = unstructuredError.details.retryAfter * 1000 // Convert seconds to ms
          logger.info(`Rate limit hit, respecting Retry-After header: ${unstructuredError.details.retryAfter}s`, {
            fileName,
            attempt: retryCount + 1
          })
        } else {
          // Exponential backoff for other retryable errors
          backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000)
        }

        logger.info(`Retrying after ${backoffMs}ms backoff`, { fileName, attempt: retryCount + 1 })

        await this.delay(backoffMs)
        retryCount++
      }
    }

    throw new Error('Maximum retries exceeded')
  }

  /**
   * Transform Unstructured.io API response to internal format
   */
  private transformResponse(apiResponse: UnstructuredApiElement[]): ProcessedElement[] {
    if (!Array.isArray(apiResponse)) {
      logger.warn('Invalid API response format, expected array', { response: apiResponse })
      return []
    }

    return apiResponse.map((element, index) => ({
      id: element.element_id || `element_${index}`,
      type: this.mapElementType(element.type),
      text: element.text || '',
      coordinates: element.coordinates ? this.mapCoordinates(element.coordinates) : undefined,
      pageNumber: element.metadata?.page_number,
      confidence: 1.0, // Unstructured doesn't provide confidence scores
      metadata: element.metadata || {}
    }))
  }

  /**
   * Map Unstructured.io element types to internal types
   */
  private mapElementType(apiType: string): ElementType {
    const typeMap: Record<string, ElementType> = {
      Title: 'title',
      Header: 'header',
      Footer: 'footer',
      NarrativeText: 'narrative_text',
      ListItem: 'list_item',
      Table: 'table',
      Image: 'image',
      Formula: 'formula',
      Text: 'text'
    }

    return typeMap[apiType] || 'text'
  }

  /**
   * Map coordinate system from Unstructured.io to internal format
   */
  private mapCoordinates(coords: any): BoundingBox | undefined {
    if (!coords || !coords.points || !Array.isArray(coords.points) || coords.points.length === 0) {
      return undefined
    }

    try {
      // Unstructured returns points as [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
      const points = coords.points
      const xs = points.map((p: number[]) => p[0])
      const ys = points.map((p: number[]) => p[1])

      return {
        x1: Math.min(...xs),
        y1: Math.min(...ys),
        x2: Math.max(...xs),
        y2: Math.max(...ys),
        page: 1 // Default to page 1, will be updated from metadata if available
      }
    } catch (error) {
      logger.warn('Failed to parse coordinates', { coords, error })
      return undefined
    }
  }

  /**
   * Classify API errors for retry logic
   */
  private classifyError(error: Error): UnstructuredError {
    // Handle SDK-specific errors
    if (error.message.includes('status 401') || error.message.includes('Unauthorized')) {
      return {
        type: 'authentication_error',
        message: 'Invalid API key or authentication failed',
        code: '401',
        retryable: false,
        timestamp: new Date()
      }
    }

    if (error.message.includes('status 413') || error.message.includes('Payload Too Large')) {
      return {
        type: 'file_too_large',
        message: 'File size exceeds API limits',
        code: '413',
        retryable: false,
        timestamp: new Date()
      }
    }

    if (error.message.includes('status 422') || error.message.includes('Unprocessable Entity')) {
      return {
        type: 'invalid_format',
        message: 'Unsupported file format or corrupted file',
        code: '422',
        retryable: false,
        timestamp: new Date()
      }
    }

    if (error.message.includes('status 429') || error.message.includes('Too Many Requests')) {
      return {
        type: 'quota_exceeded',
        message: 'API rate limit or quota exceeded',
        code: '429',
        retryable: true,
        timestamp: new Date()
      }
    }

    if (
      error.message.includes('status 5') ||
      error.message.includes('Internal Server Error') ||
      error.message.includes('Bad Gateway') ||
      error.message.includes('Service Unavailable') ||
      error.message.includes('Gateway Timeout')
    ) {
      return {
        type: 'server_error',
        message: 'Server error, retrying may help',
        code: '500',
        retryable: true,
        timestamp: new Date()
      }
    }

    if (error.message.includes('timeout') || error.message.includes('ECONNABORTED')) {
      return {
        type: 'timeout',
        message: 'Request timeout',
        code: 'TIMEOUT',
        retryable: true,
        timestamp: new Date()
      }
    }

    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return {
        type: 'network_error',
        message: 'Network connection failed',
        code: 'NETWORK_ERROR',
        retryable: true,
        timestamp: new Date()
      }
    }

    // Extract status code from error message if available
    const statusMatch = error.message.match(/status (\d+)/)
    const status = statusMatch ? parseInt(statusMatch[1], 10) : undefined

    return {
      type: 'unknown',
      message: error.message,
      code: status ? String(status) : 'UNKNOWN',
      retryable: status ? status >= 500 : false,
      timestamp: new Date()
    }
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Test connection to Unstructured.io API
   * Note: The hosted API doesn't have a dedicated health endpoint,
   * so we test with a minimal partition request
   */
  async testConnection(): Promise<boolean> {
    try {
      // Create a minimal test buffer to verify API connectivity
      const testBuffer = Buffer.from('test', 'utf-8')

      // Attempt a minimal partition request to test connectivity
      await this.client.general.partition({
        partitionParameters: {
          files: {
            content: testBuffer,
            fileName: 'test.txt'
          },
          strategy: Strategy.Fast,
          maxCharacters: 100
        }
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Connection test failed', { error: errorMessage })

      // If we get an authentication error, the connection is working but auth is wrong
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        return true
      }

      return false
    }
  }

  /**
   * Get API health status
   */
  async getHealthStatus(): Promise<{ healthy: boolean; message?: string }> {
    const connectionWorking = await this.testConnection()

    if (!connectionWorking) {
      return {
        healthy: false,
        message: 'Unable to connect to Unstructured API'
      }
    }

    return { healthy: true }
  }
}
