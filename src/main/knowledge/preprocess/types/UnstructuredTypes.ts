/**
 * Type definitions for Unstructured.io RAG Integration
 * Date: 2025-01-10
 * Feature: Unstructured.io preprocessing provider
 */

export interface UnstructuredConfig {
  id: 'unstructured'
  name: string
  type: 'preprocess'
  deploymentType: 'hosted' | 'self-hosted'
  apiEndpoint: string
  apiKey?: string
  processingMode: 'fast' | 'hi_res' | 'auto'
  chunkingStrategy: 'by_title' | 'by_page' | 'by_similarity' | 'basic'
  outputFormat: 'text' | 'markdown' | 'json'
  maxRetries: number
  timeoutMs: number
  // Chunking parameters
  maxCharacters?: number // Default: 500. Hard maximum for chunk size
  combineUnderNChars?: number // Default: same as maxCharacters. Combine small chunks
  newAfterNChars?: number // Soft limit for starting new chunks
  overlap?: number // Default: 0. Character overlap between chunks
  overlapAll?: boolean // Default: false. Apply overlap to all chunks
  // Extraction parameters
  languages?: string[] // e.g., ['eng', 'spa']. Languages for OCR
  coordinates?: boolean // Default: false. Include bounding box coordinates
  includePageBreaks?: boolean // Default: false. Include page break markers
  pdfInferTableStructure?: boolean // Default: false. Infer table structure in PDFs
}

export interface ProcessingParams {
  strategy: 'fast' | 'hi_res' | 'auto'
  chunkingStrategy: string
  // outputFormat removed - official client returns JSON by default
  includePageBreaks: boolean
  coordinates: boolean
  pdfInferTableStructure: boolean
  languages?: string[]
  // Chunking parameters
  maxCharacters?: number
  combineUnderNChars?: number
  newAfterNChars?: number
  overlap?: number
  overlapAll?: boolean
}

export interface ProcessedElement {
  id: string
  type: ElementType
  text: string
  coordinates?: BoundingBox
  pageNumber?: number
  confidence: number
  metadata: Record<string, any>
}

export type ElementType =
  | 'text'
  | 'title'
  | 'header'
  | 'footer'
  | 'table'
  | 'image'
  | 'list_item'
  | 'narrative_text'
  | 'formula'

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
  page: number
}

export interface UnstructuredProcessingJob {
  id: string
  sourceId: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  processingParams: ProcessingParams
  result?: UnstructuredProcessingResult
  error?: UnstructuredError
  retryCount: number
  estimatedCost?: number
  actualCost?: number
}

export interface UnstructuredProcessingResult {
  elements: ProcessedElement[]
  metadata: DocumentMetadata
  pagesProcessed: number
  processingTimeMs: number
  chunkCount: number
  tableCount: number
  imageCount: number
  confidence: number
  warnings: string[]
}

export interface DocumentMetadata {
  fileName: string
  fileSize: number
  fileType: string
  pageCount?: number
  language?: string
  hasTableOfContents?: boolean
  hasHeaders?: boolean
  documentType?: string
}

export interface UnstructuredError {
  type: ErrorType
  message: string
  code?: string
  details?: Record<string, any>
  retryable: boolean
  timestamp: Date
}

export type ErrorType =
  | 'quota_exceeded'
  | 'invalid_format'
  | 'file_too_large'
  | 'timeout'
  | 'network_error'
  | 'authentication_error'
  | 'server_error'
  | 'unknown'

export interface UnstructuredUsageMetrics {
  userId: string
  date: string
  pagesProcessed: number
  documentsProcessed: number
  fastModePages: number
  hiResPages: number
  totalCost: number
  quotaUsed: number
  quotaLimit: number
  errorCount: number
}

export interface ProcessingCacheEntry {
  key: string
  result: UnstructuredProcessingResult
  fileHash: string
  processingParams: ProcessingParams
  createdAt: Date
  lastAccessedAt: Date
  accessCount: number
  sizeBytes: number
}

// API Response types from Unstructured.io
export interface UnstructuredApiResponse {
  elements: UnstructuredApiElement[]
}

export interface UnstructuredApiElement {
  element_id?: string
  type: string
  text: string
  coordinates?: {
    points: number[][]
    system: string
    layout_width: number
    layout_height: number
  }
  metadata?: {
    page_number?: number
    filename?: string
    file_directory?: string
    last_modified?: string
    [key: string]: any
  }
}

// Extension types for existing interfaces
export interface ExtendedFileMetadata {
  unstructuredProcessed?: boolean
  unstructuredJobId?: string
}
