import { loggerService } from '@logger'
import { CacheService } from '@renderer/services/CacheService'
import type { FileMetadata, FalAIPainting } from '@renderer/types'

import type { FalAIModel } from '../config/falAIConfig'

const logger = loggerService.withContext('FalAIService')

export interface FalAIGenerationRequest {
  prompt: string
  negative_prompt?: string
  image_size?: string
  num_inference_steps?: number
  guidance_scale?: number
  seed?: number
  num_images?: number
}

export interface FalAIGenerationResponse {
  request_id: string
}

export interface FalAIPollResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  images?: Array<{ url: string; width: number; height: number }>
  seed?: number
  error?: string
}

export interface FalAIModelsResponse {
  models?: FalAIModel[]
}

export class FalAIService {
  private apiKey: string
  private apiHost: string

  constructor(apiKey: string, apiHost?: string) {
    this.apiKey = apiKey
    this.apiHost = apiHost || 'https://fal.run'
  }

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Key ${this.apiKey}`,
      'Content-Type': 'application/json'
    }
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      const errorMessage = errorData.detail?.message || errorData.message || `HTTP ${response.status}: Request failed`
      
      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your fal.ai API key.')
      } else if (response.status === 403) {
        throw new Error('Access forbidden. Please check your API key permissions.')
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.')
      }
      
      throw new Error(errorMessage)
    }
    return response.json()
  }

  /**
   * Fetch available models from fal.ai
   * For now, we'll use hardcoded models from config
   * In the future, this could fetch from fal.ai's model registry
   */
  async fetchModels(): Promise<FalAIModel[]> {
    const cacheKey = `falai_models_${this.apiHost}`

    // Check cache first
    const cachedModels = CacheService.get<FalAIModel[]>(cacheKey)
    if (cachedModels) {
      return cachedModels
    }

    // For now, return hardcoded models from config
    // In the future, could fetch from: https://fal.ai/models
    const models: FalAIModel[] = [
      {
        id: 'fal-ai/flux-pro/v1.1-ultra',
        name: 'FLUX 1.1 Pro Ultra',
        group: 'FLUX',
        imageSizes: [
          { value: '1024x1024' },
          { value: '1280x768' },
          { value: '768x1280' },
          { value: '1344x768' },
          { value: '768x1344' }
        ],
        supportsNegativePrompt: true,
        supportsSeed: true,
        supportsGuidanceScale: true,
        defaultGuidanceScale: 3.5,
        defaultNumInferenceSteps: 28
      },
      {
        id: 'fal-ai/flux-pro/v1.1',
        name: 'FLUX 1.1 Pro',
        group: 'FLUX',
        imageSizes: [
          { value: '1024x1024' },
          { value: '1280x768' },
          { value: '768x1280' },
          { value: '1344x768' },
          { value: '768x1344' }
        ],
        supportsNegativePrompt: true,
        supportsSeed: true,
        supportsGuidanceScale: true,
        defaultGuidanceScale: 3.5,
        defaultNumInferenceSteps: 28
      }
    ]

    // Cache for 60 minutes
    CacheService.set(cacheKey, models, 60 * 60 * 1000)

    return models
  }

  /**
   * Create a new image generation request
   */
  async createGeneration(
    modelId: string,
    request: FalAIGenerationRequest,
    signal?: AbortSignal
  ): Promise<string> {
    const url = `${this.apiHost}/${modelId}`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
      signal
    })

    const data: FalAIGenerationResponse = await this.handleResponse(response)

    if (!data.request_id) {
      throw new Error('Failed to create generation request')
    }

    return data.request_id
  }

  /**
   * Get the status and result of a generation
   */
  async getGenerationResult(modelId: string, requestId: string): Promise<FalAIPollResponse> {
    const url = `https://queue.fal.run/${modelId}/${requestId}`
    
    const response = await fetch(url, {
      headers: {
        Authorization: `Key ${this.apiKey}`
      }
    })

    const data: FalAIPollResponse = await this.handleResponse(response)

    return data
  }

  /**
   * Poll for generation result with automatic retry logic
   */
  async pollGenerationResult(
    modelId: string,
    requestId: string,
    options: {
      onStatusUpdate?: (updates: Partial<FalAIPainting>) => void
      maxRetries?: number
      timeoutMs?: number
      intervalMs?: number
    } = {}
  ): Promise<FalAIPollResponse> {
    const {
      onStatusUpdate,
      maxRetries = 30, // fal.ai can take longer, allow more retries
      timeoutMs = 300000, // 5 minutes timeout
      intervalMs = 2000 // Poll every 2 seconds
    } = options

    const startTime = Date.now()
    let retryCount = 0

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          // Check for timeout
          if (Date.now() - startTime > timeoutMs) {
            reject(new Error('Image generation timed out. Please try again.'))
            return
          }

          const result = await this.getGenerationResult(modelId, requestId)

          // Reset retry count on successful response
          retryCount = 0

          // Map fal.ai status to our status
          let mappedStatus: FalAIPainting['status'] = 'processing'
          if (result.status === 'COMPLETED') {
            mappedStatus = 'succeeded'
          } else if (result.status === 'FAILED') {
            mappedStatus = 'failed'
          } else if (result.status === 'IN_QUEUE' || result.status === 'IN_PROGRESS') {
            mappedStatus = 'processing'
          }

          onStatusUpdate?.({ status: mappedStatus })

          if (result.status === 'COMPLETED') {
            resolve(result)
            return
          } else if (result.status === 'FAILED') {
            reject(new Error(result.error || 'Image generation failed'))
            return
          }

          // Continue polling for other statuses
          setTimeout(poll, intervalMs)
        } catch (error) {
          logger.error('Polling error:', error as Error)
          retryCount++

          if (retryCount >= maxRetries) {
            reject(new Error('Failed to check generation status after multiple attempts. Please try again.'))
            return
          }

          // Retry after interval
          setTimeout(poll, intervalMs)
        }
      }

      // Start polling
      poll()
    })
  }

  /**
   * Create generation and poll for result in one call
   */
  async generateAndWait(
    modelId: string,
    request: FalAIGenerationRequest,
    options: {
      onStatusUpdate?: (updates: Partial<FalAIPainting>) => void
      signal?: AbortSignal
      maxRetries?: number
      timeoutMs?: number
      intervalMs?: number
    } = {}
  ): Promise<FalAIPollResponse> {
    const { signal, onStatusUpdate, ...pollOptions } = options
    const requestId = await this.createGeneration(modelId, request, signal)
    if (onStatusUpdate) {
      onStatusUpdate({ generationId: requestId, status: 'starting' })
    }
    return this.pollGenerationResult(modelId, requestId, { ...pollOptions, onStatusUpdate })
  }

  async downloadImages(urls: string[]) {
    const downloadedFiles = await Promise.all(
      urls.map(async (url) => {
        try {
          if (!url?.trim()) {
            logger.error('Image URL is empty')
            window.toast.warning('Image URL is empty')
            return null
          }
          return await window.api.file.download(url)
        } catch (error) {
          logger.error('Failed to download image:', error as Error)
          return null
        }
      })
    )

    return downloadedFiles.filter((file): file is FileMetadata => file !== null)
  }
}

export default FalAIService

