import { loggerService } from '@logger'
import type { AxiosInstance } from 'axios'
import axios from 'axios'
import Bottleneck from 'bottleneck'

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
  private httpClient: AxiosInstance
  private rateLimiter: Bottleneck

  constructor(private config: UnstructuredConfig) {
    this.httpClient = axios.create({
      baseURL: config.apiEndpoint,
      timeout: config.timeoutMs,
      headers: config.apiKey
        ? {
            'unstructured-api-key': config.apiKey
          }
        : {}
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

        const formData = new FormData()
        const mimeType = this.getMimeType(fileName)
        formData.append('files', new Blob([fileBuffer], { type: mimeType }), fileName)
        formData.append('strategy', params.strategy)
        formData.append('chunking_strategy', params.chunkingStrategy)
        formData.append('output_format', 'application/json')

        // Optional parameters
        if (params.includePageBreaks) {
          formData.append('include_page_breaks', 'true')
        }
        if (params.extractImages) {
          formData.append('extract_images', 'true')
        }
        if (params.extractTables) {
          formData.append('extract_tables', 'true')
        }
        if (params.coordinates) {
          formData.append('coordinates', 'true')
        }
        if (params.pdfInferTableStructure) {
          formData.append('pdf_infer_table_structure', 'true')
        }
        if (params.languages && params.languages.length > 0) {
          // Pass each language as individual form field as per Unstructured.io API documentation
          params.languages.forEach((language) => {
            formData.append('languages', language)
          })
        }

        // Let the browser/Node.js automatically set Content-Type with proper boundary
        // Correct endpoint for Unstructured.io hosted API
        const response = await this.httpClient.post('/general/v0/general', formData)

        const processingTime = Date.now() - startTime
        const elements = this.transformResponse(response.data)

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

        // Exponential backoff for retry
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 30000)
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
    const isAxiosError = axios.isAxiosError(error)

    if (isAxiosError && error.response) {
      const status = error.response.status
      const message = error.response.data?.message || error.message

      switch (status) {
        case 401:
          return {
            type: 'authentication_error',
            message: 'Invalid API key or authentication failed',
            code: String(status),
            retryable: false,
            timestamp: new Date()
          }
        case 413:
          return {
            type: 'file_too_large',
            message: 'File size exceeds API limits',
            code: String(status),
            retryable: false,
            timestamp: new Date()
          }
        case 422:
          return {
            type: 'invalid_format',
            message: 'Unsupported file format or corrupted file',
            code: String(status),
            retryable: false,
            timestamp: new Date()
          }
        case 429:
          return {
            type: 'quota_exceeded',
            message: 'API rate limit or quota exceeded',
            code: String(status),
            retryable: true,
            timestamp: new Date()
          }
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            type: 'server_error',
            message: 'Server error, retrying may help',
            code: String(status),
            retryable: true,
            timestamp: new Date()
          }
        default:
          return {
            type: 'unknown',
            message: message,
            code: String(status),
            retryable: status >= 500,
            timestamp: new Date()
          }
      }
    }

    if (isAxiosError && error.code === 'ECONNABORTED') {
      return {
        type: 'timeout',
        message: 'Request timeout',
        code: error.code,
        retryable: true,
        timestamp: new Date()
      }
    }

    if (isAxiosError && (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')) {
      return {
        type: 'network_error',
        message: 'Network connection failed',
        code: error.code,
        retryable: true,
        timestamp: new Date()
      }
    }

    return {
      type: 'unknown',
      message: error.message,
      retryable: false,
      timestamp: new Date()
    }
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(fileName: string): string {
    const extension = fileName.split('.').pop()?.toLowerCase()

    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
      rtf: 'application/rtf',
      html: 'text/html',
      htm: 'text/html',
      csv: 'text/csv',
      xml: 'application/xml',
      json: 'application/json',
      md: 'text/markdown',
      odt: 'application/vnd.oasis.opendocument.text',
      ods: 'application/vnd.oasis.opendocument.spreadsheet',
      odp: 'application/vnd.oasis.opendocument.presentation'
    }

    return mimeTypes[extension || ''] || 'application/octet-stream'
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Test connection to Unstructured.io API
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/general/v0/general/docs')
      return response.status === 200
    } catch (error) {
      logger.error('Connection test failed', { error })
      return false
    }
  }

  /**
   * Get API health status
   */
  async getHealthStatus(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const response = await this.httpClient.get('/health')
      return { healthy: response.status === 200 }
    } catch (error) {
      const unstructuredError = this.classifyError(error as Error)
      return {
        healthy: false,
        message: unstructuredError.message
      }
    }
  }
}
