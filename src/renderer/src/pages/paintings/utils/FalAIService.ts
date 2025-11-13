import { loggerService } from '@logger'
import { CacheService } from '@renderer/services/CacheService'
import type { FalAIPainting, FileMetadata } from '@renderer/types'

import type { FalAIModel } from '../config/falAIConfig'
import { FAL_AI_MODELS } from '../config/falAIConfig'

const logger = loggerService.withContext('FalAIService')

export interface FalAIGenerationRequest {
  prompt: string
  negative_prompt?: string
  // Size configuration - either image_size OR aspect_ratio
  image_size?: string | { width: number; height: number }
  aspect_ratio?: string
  num_inference_steps?: number
  guidance_scale?: number
  seed?: number
  num_images?: number
  // FLUX 1.1 Ultra specific
  enhance_prompt?: boolean
  image_url?: string
  image_prompt_strength?: number
  raw?: boolean
  // FLUX Dev/Schnell specific
  acceleration?: 'none' | 'regular' | 'high'
  // Output and safety
  output_format?: 'jpeg' | 'png'
  enable_safety_checker?: boolean
  safety_tolerance?: string // API expects string '1'-'6'
  // SDXL specific
  loras?: Array<{ path: string; scale?: number; force?: boolean }>
  embeddings?: Array<{ path: string; tokens?: string[] }>
  expand_prompt?: boolean
  safety_checker_version?: 'v1' | 'v2'
  format?: 'jpeg' | 'png' // SDXL uses 'format' instead of 'output_format'
  sync_mode?: boolean
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

// API model discovery response type
interface FalAIAPIModel {
  id: string
  name?: string
  description?: string
  category?: string
  [key: string]: unknown
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
        throw new Error('Invalid API key. Please check your Fal.ai API key.')
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
   * Fetch available text-to-image models from Fal.ai API
   * Falls back to hardcoded models if API fails
   */
  async fetchModels(): Promise<FalAIModel[]> {
    const cacheKey = `falai_models_${this.apiHost}`

    // Check cache first
    const cachedModels = CacheService.get<FalAIModel[]>(cacheKey)
    if (cachedModels) {
      logger.debug('Returning cached Fal.ai models')
      return cachedModels
    }

    try {
      // Try to fetch from Fal.ai API
      logger.debug('Fetching models from Fal.ai API')
      const response = await fetch('https://api.fal.ai/v1/models?category=text-to-image', {
        headers: {
          Authorization: `Key ${this.apiKey}`
        }
      })

      if (response.ok) {
        const data = (await response.json()) as { models?: FalAIAPIModel[] }

        if (data.models && Array.isArray(data.models)) {
          // Filter for our supported text-to-image models
          const supportedModelIds = FAL_AI_MODELS.map((m) => m.id)
          const discoveredModels = data.models
            .filter((apiModel) => supportedModelIds.includes(apiModel.id))
            .map((apiModel) => {
              // Find the corresponding config from our hardcoded list
              const config = FAL_AI_MODELS.find((m) => m.id === apiModel.id)
              return (
                config || {
                  id: apiModel.id,
                  name: apiModel.name || apiModel.id,
                  group: 'Discovered',
                  description: apiModel.description
                }
              )
            })

          if (discoveredModels.length > 0) {
            logger.info(`Discovered ${discoveredModels.length} Fal.ai models from API`)
            // Cache for 60 minutes
            CacheService.set(cacheKey, discoveredModels, 60 * 60 * 1000)
            return discoveredModels
          }
        }
      }
    } catch (error) {
      logger.error('Failed to fetch models from Fal.ai API:', error as Error)
    }

    // Fallback to hardcoded models
    logger.info('Using hardcoded Fal.ai models configuration')
    const models = FAL_AI_MODELS

    // Cache for 60 minutes
    CacheService.set(cacheKey, models, 60 * 60 * 1000)

    return models
  }

  /**
   * Create a new image generation request with model-specific parameters
   */
  async createGeneration(modelId: string, request: FalAIGenerationRequest, signal?: AbortSignal): Promise<string> {
    const url = `${this.apiHost}/${modelId}`

    // Build request body based on model capabilities
    const body: Record<string, unknown> = {
      prompt: request.prompt
    }

    // Add model-specific parameters
    if (modelId.includes('flux-pro/v1.1-ultra')) {
      // FLUX 1.1 Pro Ultra uses aspect_ratio
      if (request.aspect_ratio) body.aspect_ratio = request.aspect_ratio
      if (request.enhance_prompt !== undefined) body.enhance_prompt = request.enhance_prompt
      if (request.image_url) body.image_url = request.image_url
      if (request.image_prompt_strength !== undefined) body.image_prompt_strength = request.image_prompt_strength
      if (request.raw !== undefined) body.raw = request.raw
      if (request.output_format) body.output_format = request.output_format
      if (request.enable_safety_checker !== undefined) body.enable_safety_checker = request.enable_safety_checker
      if (request.safety_tolerance) body.safety_tolerance = String(request.safety_tolerance)
    } else if (modelId.includes('flux-pro/v1.1')) {
      // FLUX 1.1 Pro uses image_size
      if (request.image_size) body.image_size = request.image_size
      if (request.enhance_prompt !== undefined) body.enhance_prompt = request.enhance_prompt
      if (request.output_format) body.output_format = request.output_format
      if (request.enable_safety_checker !== undefined) body.enable_safety_checker = request.enable_safety_checker
      if (request.safety_tolerance) body.safety_tolerance = String(request.safety_tolerance)
    } else if (modelId.includes('flux-pro')) {
      // FLUX Pro supports guidance and inference steps
      if (request.image_size) body.image_size = request.image_size
      if (request.num_inference_steps) body.num_inference_steps = request.num_inference_steps
      if (request.guidance_scale) body.guidance_scale = request.guidance_scale
      if (request.enhance_prompt !== undefined) body.enhance_prompt = request.enhance_prompt
      if (request.output_format) body.output_format = request.output_format
      if (request.safety_tolerance) body.safety_tolerance = String(request.safety_tolerance)
    } else if (modelId.includes('flux/dev') || modelId.includes('flux/schnell')) {
      // FLUX Dev/Schnell
      if (request.image_size) body.image_size = request.image_size
      if (request.num_inference_steps) body.num_inference_steps = request.num_inference_steps
      if (request.guidance_scale) body.guidance_scale = request.guidance_scale
      if (request.acceleration) body.acceleration = request.acceleration
      if (request.output_format) body.output_format = request.output_format
      if (request.enable_safety_checker !== undefined) body.enable_safety_checker = request.enable_safety_checker
    } else if (modelId.includes('fast-sdxl')) {
      // Fast SDXL
      if (request.negative_prompt) body.negative_prompt = request.negative_prompt
      if (request.image_size) body.image_size = request.image_size
      if (request.num_inference_steps) body.num_inference_steps = request.num_inference_steps
      if (request.guidance_scale) body.guidance_scale = request.guidance_scale
      if (request.loras) body.loras = request.loras
      if (request.embeddings) body.embeddings = request.embeddings
      if (request.expand_prompt !== undefined) body.expand_prompt = request.expand_prompt
      if (request.format) body.format = request.format
      if (request.enable_safety_checker !== undefined) body.enable_safety_checker = request.enable_safety_checker
      if (request.safety_checker_version) body.safety_checker_version = request.safety_checker_version
    }

    // Common parameters across all models
    if (request.seed !== undefined) body.seed = request.seed
    if (request.num_images) body.num_images = request.num_images
    if (request.sync_mode !== undefined) body.sync_mode = request.sync_mode

    logger.debug(`Creating generation for model ${modelId}`, body)

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
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
    const url = `https://queue.fal.run/${modelId}/requests/${requestId}/status`

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
