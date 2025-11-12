import { BaseEmbeddings } from '@cherrystudio/embedjs-interfaces'
import { loggerService } from '@logger'
import { net } from 'electron'

const logger = loggerService.withContext('MistralEmbeddings')

interface MistralEmbeddingRequest {
  model: string
  input: string[]
  output_dimension?: number
  output_dtype?: 'float' | 'int8' | 'binary' | 'uint8'
  encoding_format?: string
}

interface MistralEmbeddingResponse {
  data: Array<{
    embedding: number[]
    index: number
    object: string
  }>
  model: string
  object: string
  usage: {
    prompt_tokens: number
    total_tokens: number
    completion_tokens: number
    prompt_audio_seconds?: number | null
  }
}

interface MistralEmbeddingsConfig {
  model: string
  apiKey: string
  baseURL: string
  dimensions?: number
  batchSize?: number
  timeout?: number
  maxRetries?: number
}

/**
 * Mistral-specific embeddings implementation
 * Handles Mistral AI's embedding API with proper parameter formatting
 */
export class MistralEmbeddings extends BaseEmbeddings {
  private config: MistralEmbeddingsConfig

  constructor(config: MistralEmbeddingsConfig) {
    super()
    this.config = {
      batchSize: 32,
      timeout: 30000,
      maxRetries: 3,
      ...config
    }

    logger.info(`Initialized MistralEmbeddings with model: ${this.config.model}, dimensions: ${this.config.dimensions}`)
  }

  async getDimensions(): Promise<number> {
    // Return configured dimensions or default for mistral-embed
    if (this.config.dimensions) {
      return this.config.dimensions
    }

    // Default dimensions for Mistral models
    if (this.config.model === 'codestral-embed') {
      return 1536 // Codestral default
    }
    return 1024 // mistral-embed default
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    logger.info(`Embedding ${texts.length} documents with Mistral API`)

    const allEmbeddings: number[][] = []
    const batchSize = this.config.batchSize || 32

    // Process in batches to respect API limits
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      logger.debug(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`)

      const batchEmbeddings = await this.createEmbeddings(batch)
      allEmbeddings.push(...batchEmbeddings)
    }

    logger.info(`Successfully embedded ${allEmbeddings.length} documents`)
    return allEmbeddings
  }

  async embedQuery(text: string): Promise<number[]> {
    logger.debug(`Embedding single query with Mistral API`)
    const embeddings = await this.createEmbeddings([text])
    return embeddings[0]
  }

  private async createEmbeddings(inputs: string[]): Promise<number[][]> {
    const requestBody: MistralEmbeddingRequest = {
      model: this.config.model,
      input: inputs
    }

    // Add optional parameters if configured
    if (this.config.dimensions) {
      requestBody.output_dimension = this.config.dimensions
    }

    // Always use float for consistency with other embedding implementations
    requestBody.output_dtype = 'float'

    logger.debug(`Making Mistral API request:`, {
      model: requestBody.model,
      inputCount: inputs.length,
      outputDimension: requestBody.output_dimension,
      baseURL: this.config.baseURL
    })

    let lastError: Error | null = null

    // Retry logic for network issues
    for (let attempt = 1; attempt <= (this.config.maxRetries || 3); attempt++) {
      try {
        const response = await this.makeRequest(requestBody, attempt)
        return response.data.map((item) => item.embedding)
      } catch (error) {
        lastError = error as Error
        logger.warn(`Mistral API attempt ${attempt} failed:`, error as Error)

        // Don't retry on 422 (client errors) - these indicate parameter issues
        if (error instanceof Error && error.message.includes('422')) {
          logger.error(`Mistral API parameter error (422). Request body:`, requestBody)
          throw new Error(
            `Mistral embedding failed: Invalid parameters. Check model name and dimensions. ${error.message}`
          )
        }

        // Don't retry on 401/403 (auth errors)
        if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
          throw new Error(`Mistral embedding failed: Authentication error. Check API key. ${error.message}`)
        }

        // Wait before retry (exponential backoff)
        if (attempt < (this.config.maxRetries || 3)) {
          const delay = Math.pow(2, attempt - 1) * 1000 // 1s, 2s, 4s
          logger.info(`Retrying in ${delay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw new Error(`Mistral embedding failed after ${this.config.maxRetries || 3} attempts: ${lastError?.message}`)
  }

  private async makeRequest(requestBody: MistralEmbeddingRequest, attempt: number): Promise<MistralEmbeddingResponse> {
    const url = `${this.config.baseURL}/embeddings`

    logger.debug(`Mistral API request (attempt ${attempt}):`, {
      url,
      model: requestBody.model,
      inputCount: requestBody.input.length
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout || 30000)

    try {
      const response = await net.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'User-Agent': 'CherryStudio/1.0'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        logger.error(`Mistral API error ${response.status}: ${errorText}`)

        throw new Error(`${response.status} ${response.statusText}: ${errorText}`)
      }

      const data = (await response.json()) as MistralEmbeddingResponse

      logger.debug(`Mistral API success:`, {
        model: data.model,
        embeddingCount: data.data.length,
        usage: data.usage
      })

      // Validate response structure
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format: missing data array')
      }

      for (const item of data.data) {
        if (!item.embedding || !Array.isArray(item.embedding)) {
          throw new Error('Invalid response format: missing embedding array')
        }
      }

      return data
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Mistral API timeout after ${this.config.timeout || 30000}ms`)
      }

      throw error
    }
  }
}
