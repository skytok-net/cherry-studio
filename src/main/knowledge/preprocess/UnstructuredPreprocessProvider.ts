import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { fileStorage } from '@main/services/FileStorage'
import type { FileMetadata, PreprocessProvider } from '@types'

import BasePreprocessProvider from './BasePreprocessProvider'
import type { ProcessedElement, ProcessingParams, UnstructuredConfig } from './types/UnstructuredTypes'
import { UnstructuredApiClient } from './UnstructuredApiClient'

const logger = loggerService.withContext('UnstructuredPreprocessProvider')

export default class UnstructuredPreprocessProvider extends BasePreprocessProvider {
  private apiClient: UnstructuredApiClient
  private config: UnstructuredConfig

  constructor(provider: PreprocessProvider) {
    super(provider)

    // Transform generic PreprocessProvider to UnstructuredConfig
    this.config = {
      id: 'unstructured',
      name: provider.name || 'Unstructured.io',
      type: 'preprocess',
      deploymentType: (provider.options?.deploymentType as 'hosted' | 'self-hosted') || 'hosted',
      apiEndpoint: provider.apiHost || 'https://api.unstructuredapp.io',
      apiKey: provider.apiKey,
      processingMode: (provider.options?.processingMode as 'fast' | 'hi_res') || 'fast',
      chunkingStrategy: (provider.options?.chunkingStrategy as any) || 'by_title',
      outputFormat: (provider.options?.outputFormat as 'text' | 'markdown' | 'json') || 'text',
      maxRetries: provider.options?.maxRetries || 3,
      timeoutMs: provider.options?.timeoutMs || 30000
    }

    this.apiClient = new UnstructuredApiClient(this.config)

    logger.info('UnstructuredPreprocessProvider initialized', {
      deploymentType: this.config.deploymentType,
      processingMode: this.config.processingMode,
      chunkingStrategy: this.config.chunkingStrategy
    })
  }

  public async parseFile(
    sourceId: string,
    file: FileMetadata
  ): Promise<{ processedFile: FileMetadata; quota?: number }> {
    try {
      const filePath = fileStorage.getFilePathById(file)
      logger.info(`Unstructured processing started: ${filePath}`)

      // Validate configuration
      if (!this.validateConfig()) {
        throw new Error('Invalid Unstructured.io configuration')
      }

      // Check if already processed
      const existingFile = await this.checkIfAlreadyProcessed(file)
      if (existingFile) {
        logger.info(`File already processed: ${filePath}`)
        return { processedFile: existingFile }
      }

      // Read file and process
      await this.sendPreprocessProgress(sourceId, 10)
      const fileBuffer = await fs.promises.readFile(filePath)
      const processingParams = this.buildProcessingParams()

      await this.sendPreprocessProgress(sourceId, 30)

      // Process document with Unstructured.io
      const elements = await this.apiClient.processDocument(fileBuffer, file.name, processingParams)

      await this.sendPreprocessProgress(sourceId, 70)

      // Create text chunks from elements
      const chunks = this.createTextChunks(elements, file)
      const outputContent = chunks.map((chunk) => chunk.text).join('\n\n')

      await this.sendPreprocessProgress(sourceId, 90)

      // Save processed content
      const outputPath = await this.saveProcessedContent(file, outputContent)
      const outputStats = await fs.promises.stat(outputPath)

      await this.sendPreprocessProgress(sourceId, 100)

      const processedFile: FileMetadata = {
        ...file,
        name: file.name.replace(file.ext, '.md'),
        path: outputPath,
        ext: '.md',
        size: outputStats.size,
        created_at: outputStats.birthtime.toISOString()
      }

      logger.info(`Unstructured processing completed successfully: ${filePath}`, {
        elementsCount: elements.length,
        chunksCount: chunks.length,
        outputSize: outputStats.size
      })

      return { processedFile }
    } catch (error) {
      logger.error(`Unstructured processing failed: ${file.path}`, { error })
      throw new Error(`Unstructured.io processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  public async checkQuota(): Promise<number> {
    // For now, return a default quota. In the future, this could query the API for actual quota
    return this.provider.quota || 1000
  }

  /**
   * Validate the Unstructured.io configuration
   */
  private validateConfig(): boolean {
    const { apiEndpoint, deploymentType, apiKey } = this.config

    if (!apiEndpoint || !apiEndpoint.startsWith('http')) {
      logger.error('Invalid API endpoint', { apiEndpoint })
      return false
    }

    if (deploymentType === 'hosted' && !apiKey) {
      logger.error('API key required for hosted deployment')
      return false
    }

    return true
  }

  /**
   * Build processing parameters from configuration
   */
  private buildProcessingParams(): ProcessingParams {
    return {
      strategy: this.config.processingMode,
      chunkingStrategy: this.config.chunkingStrategy,
      outputFormat: 'application/json',
      includePageBreaks: true,
      extractImages: false, // Can be made configurable
      extractTables: true,
      coordinates: false,
      pdfInferTableStructure: true,
      languages: undefined // Auto-detect
    }
  }

  /**
   * Create text chunks from processed elements
   */
  private createTextChunks(elements: ProcessedElement[], file: FileMetadata): Array<{ text: string; metadata: any }> {
    switch (this.config.chunkingStrategy) {
      case 'by_title':
        return this.chunkByTitle(elements, file)
      case 'by_page':
        return this.chunkByPage(elements, file)
      case 'by_similarity':
        return this.chunkBySimilarity(elements, file)
      case 'basic':
      default:
        return this.chunkBasic(elements, file)
    }
  }

  /**
   * Basic chunking strategy - combines all text
   */
  private chunkBasic(elements: ProcessedElement[], file: FileMetadata): Array<{ text: string; metadata: any }> {
    const textElements = elements.filter((el) => el.text && el.text.trim().length > 0)
    const combinedText = textElements.map((el) => el.text).join('\n\n')

    return [
      {
        text: combinedText,
        metadata: {
          fileName: file.name,
          chunkingStrategy: 'basic',
          elementCount: textElements.length
        }
      }
    ]
  }

  /**
   * Chunk by title - groups content under headers
   */
  private chunkByTitle(elements: ProcessedElement[], file: FileMetadata): Array<{ text: string; metadata: any }> {
    const chunks: Array<{ text: string; metadata: any }> = []
    let currentChunk: string[] = []
    let currentTitle = ''

    for (const element of elements) {
      if (element.type === 'title' || element.type === 'header') {
        // Save previous chunk if it has content
        if (currentChunk.length > 0) {
          chunks.push({
            text: currentChunk.join('\n\n'),
            metadata: {
              fileName: file.name,
              chunkingStrategy: 'by_title',
              title: currentTitle,
              elementCount: currentChunk.length
            }
          })
        }

        // Start new chunk
        currentTitle = element.text
        currentChunk = [element.text]
      } else if (element.text && element.text.trim().length > 0) {
        currentChunk.push(element.text)
      }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push({
        text: currentChunk.join('\n\n'),
        metadata: {
          fileName: file.name,
          chunkingStrategy: 'by_title',
          title: currentTitle,
          elementCount: currentChunk.length
        }
      })
    }

    return chunks.length > 0 ? chunks : this.chunkBasic(elements, file)
  }

  /**
   * Chunk by page - groups content by page number
   */
  private chunkByPage(elements: ProcessedElement[], file: FileMetadata): Array<{ text: string; metadata: any }> {
    const pageGroups = new Map<number, ProcessedElement[]>()

    // Group elements by page
    for (const element of elements) {
      const page = element.pageNumber || 1
      if (!pageGroups.has(page)) {
        pageGroups.set(page, [])
      }
      if (element.text && element.text.trim().length > 0) {
        pageGroups.get(page)!.push(element)
      }
    }

    const chunks: Array<{ text: string; metadata: any }> = []

    // Create chunks for each page
    for (const [pageNumber, pageElements] of pageGroups) {
      const pageText = pageElements.map((el) => el.text).join('\n\n')
      chunks.push({
        text: pageText,
        metadata: {
          fileName: file.name,
          chunkingStrategy: 'by_page',
          pageNumber,
          elementCount: pageElements.length
        }
      })
    }

    return chunks.length > 0 ? chunks : this.chunkBasic(elements, file)
  }

  /**
   * Chunk by similarity - simple implementation, can be enhanced with embeddings
   */
  private chunkBySimilarity(elements: ProcessedElement[], file: FileMetadata): Array<{ text: string; metadata: any }> {
    // For now, fall back to title-based chunking
    // Future enhancement: use semantic similarity with embeddings
    logger.info('Similarity-based chunking not yet implemented, falling back to by_title')
    return this.chunkByTitle(elements, file)
  }

  /**
   * Save processed content to disk
   */
  private async saveProcessedContent(file: FileMetadata, content: string): Promise<string> {
    const outputDir = path.join(this.storageDir, file.id)
    const outputPath = path.join(outputDir, `${file.name.replace(file.ext, '')}.md`)

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    // Write processed content
    await fs.promises.writeFile(outputPath, content, 'utf-8')

    return outputPath
  }
}
