# Data Model: Unstructured.io RAG Integration

**Date**: 2025-01-10
**Feature**: Unstructured.io RAG Integration

## Core Entities

### UnstructuredConfig

**Purpose**: Configuration for Unstructured.io preprocessing provider

**Fields**:
- `id: string` - Provider identifier ("unstructured")
- `name: string` - Display name ("Unstructured.io")
- `type: 'preprocess'` - Provider type
- `deploymentType: 'hosted' | 'self-hosted'` - Deployment mode
- `apiEndpoint: string` - API endpoint URL
- `apiKey?: string` - API key for hosted deployment
- `processingMode: 'fast' | 'hi_res'` - Processing quality mode
- `chunkingStrategy: 'by_title' | 'by_page' | 'by_similarity' | 'basic'` - Chunking approach
- `outputFormat: 'text' | 'markdown' | 'json'` - Output format preference
- `maxRetries: number` - Maximum retry attempts (default: 3)
- `timeoutMs: number` - Request timeout in milliseconds (default: 30000)

**Validation Rules**:
- `apiKey` required when `deploymentType` is 'hosted'
- `apiEndpoint` must be valid HTTPS URL
- `timeoutMs` must be between 5000 and 300000

**Relationships**:
- Referenced by `KnowledgeBaseParams.preprocessProvider`

### UnstructuredProcessingJob

**Purpose**: Tracks individual document processing operations

**Fields**:
- `id: string` - Unique job identifier
- `sourceId: string` - Knowledge base item identifier
- `fileName: string` - Original file name
- `fileSize: number` - File size in bytes
- `fileType: string` - MIME type or file extension
- `status: 'pending' | 'processing' | 'completed' | 'failed'` - Processing status
- `startTime: Date` - Processing start timestamp
- `endTime?: Date` - Processing completion timestamp
- `processingParams: UnstructuredProcessingParams` - Processing configuration
- `result?: UnstructuredProcessingResult` - Processing output
- `error?: UnstructuredError` - Error information if failed
- `retryCount: number` - Number of retry attempts
- `estimatedCost?: number` - Estimated processing cost
- `actualCost?: number` - Actual processing cost

**State Transitions**:
```
pending → processing → completed
pending → processing → failed
failed → processing (retry) → completed|failed
```

**Validation Rules**:
- `retryCount` cannot exceed config `maxRetries`
- `endTime` must be after `startTime` when present
- `result` required when status is 'completed'
- `error` required when status is 'failed'

### UnstructuredProcessingParams

**Purpose**: Parameters for document processing request

**Fields**:
- `strategy: ChunkingStrategy` - Chunking strategy to use
- `outputFormat: OutputFormat` - Desired output format
- `includePageBreaks: boolean` - Include page break markers
- `extractImages: boolean` - Extract and describe images
- `extractTables: boolean` - Extract table structure
- `languages?: string[]` - Expected document languages
- `coordinates: boolean` - Include spatial coordinates
- `pdfInferTableStructure: boolean` - Infer table structure in PDFs
- `skipInferTableTypes?: string[]` - Skip table inference for specific types

**Validation Rules**:
- `languages` must be valid ISO 639-1 codes when provided
- `extractTables` and `pdfInferTableStructure` compatible only with certain formats

### UnstructuredProcessingResult

**Purpose**: Result of document processing operation

**Fields**:
- `elements: ProcessedElement[]` - Extracted document elements
- `metadata: DocumentMetadata` - Document-level metadata
- `pagesProcessed: number` - Number of pages processed
- `processingTimeMs: number` - Processing duration
- `chunkCount: number` - Number of chunks created
- `tableCount: number` - Number of tables extracted
- `imageCount: number` - Number of images processed
- `confidence: number` - Overall extraction confidence (0-1)
- `warnings: string[]` - Processing warnings

**Validation Rules**:
- `confidence` must be between 0 and 1
- `pagesProcessed` must be positive
- `elements` array cannot be empty for successful processing

### ProcessedElement

**Purpose**: Individual element extracted from document

**Fields**:
- `id: string` - Unique element identifier
- `type: ElementType` - Element type (text, table, image, header, etc.)
- `text: string` - Extracted text content
- `coordinates?: BoundingBox` - Spatial location in document
- `metadata: ElementMetadata` - Element-specific metadata
- `pageNumber?: number` - Source page number
- `confidence: number` - Extraction confidence (0-1)

**Element Types**:
```typescript
type ElementType =
  | 'text'
  | 'title'
  | 'header'
  | 'footer'
  | 'table'
  | 'image'
  | 'list_item'
  | 'narrative_text'
  | 'formula'
```

### BoundingBox

**Purpose**: Spatial coordinates for document elements

**Fields**:
- `x1: number` - Left coordinate
- `y1: number` - Top coordinate
- `x2: number` - Right coordinate
- `y2: number` - Bottom coordinate
- `page: number` - Page number

### UnstructuredError

**Purpose**: Error information for failed processing

**Fields**:
- `type: ErrorType` - Error classification
- `message: string` - Human-readable error message
- `code?: string` - API error code
- `details?: Record<string, any>` - Additional error context
- `retryable: boolean` - Whether error is retryable
- `timestamp: Date` - Error occurrence time

**Error Types**:
```typescript
type ErrorType =
  | 'quota_exceeded'
  | 'invalid_format'
  | 'file_too_large'
  | 'timeout'
  | 'network_error'
  | 'authentication_error'
  | 'server_error'
  | 'unknown'
```

### UnstructuredUsageMetrics

**Purpose**: Track API usage and costs

**Fields**:
- `userId: string` - User identifier
- `date: string` - Date (YYYY-MM-DD format)
- `pagesProcessed: number` - Pages processed count
- `documentsProcessed: number` - Documents processed count
- `fastModePages: number` - Pages processed in fast mode
- `hiResPages: number` - Pages processed in hi-res mode
- `totalCost: number` - Total cost in USD
- `quotaUsed: number` - Quota units consumed
- `quotaLimit: number` - Quota limit
- `errorCount: number` - Failed processing attempts

**Validation Rules**:
- `date` must be valid ISO date string
- All numeric fields must be non-negative
- `quotaUsed` cannot exceed `quotaLimit`

## Cache Entities

### ProcessingCacheEntry

**Purpose**: Cached processing results

**Fields**:
- `key: string` - Cache key (hash of file + params)
- `result: UnstructuredProcessingResult` - Cached processing result
- `fileHash: string` - SHA-256 hash of original file
- `processingParams: UnstructuredProcessingParams` - Parameters used
- `createdAt: Date` - Cache entry creation time
- `lastAccessedAt: Date` - Last access time
- `accessCount: number` - Number of cache hits
- `sizeBytes: number` - Cache entry size

**Validation Rules**:
- `key` must be unique
- `fileHash` must be valid SHA-256 hash
- `lastAccessedAt` must be >= `createdAt`

## Integration Points

### Existing Entities Extended

**FileMetadata** (extended):
- Add `unstructuredProcessed?: boolean` - Flag for Unstructured.io processing
- Add `unstructuredJobId?: string` - Link to processing job

**KnowledgeBaseParams** (extended):
- Update `preprocessProvider` to support UnstructuredConfig

**LoaderReturn** (extended):
- Add `processingMetadata?: UnstructuredProcessingResult` - Include processing details

## Database Schema Changes

### New Tables

```sql
-- Processing jobs tracking
CREATE TABLE unstructured_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  processing_params TEXT NOT NULL, -- JSON
  result TEXT, -- JSON
  error TEXT, -- JSON
  retry_count INTEGER DEFAULT 0,
  estimated_cost REAL,
  actual_cost REAL
);

-- Usage metrics
CREATE TABLE unstructured_usage (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  pages_processed INTEGER DEFAULT 0,
  documents_processed INTEGER DEFAULT 0,
  fast_mode_pages INTEGER DEFAULT 0,
  hi_res_pages INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  quota_used INTEGER DEFAULT 0,
  quota_limit INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Processing cache
CREATE TABLE unstructured_cache (
  key TEXT PRIMARY KEY,
  result TEXT NOT NULL, -- JSON
  file_hash TEXT NOT NULL,
  processing_params TEXT NOT NULL, -- JSON
  created_at DATETIME NOT NULL,
  last_accessed_at DATETIME NOT NULL,
  access_count INTEGER DEFAULT 1,
  size_bytes INTEGER NOT NULL
);

CREATE INDEX idx_unstructured_jobs_source_id ON unstructured_jobs(source_id);
CREATE INDEX idx_unstructured_jobs_status ON unstructured_jobs(status);
CREATE INDEX idx_unstructured_cache_file_hash ON unstructured_cache(file_hash);
CREATE INDEX idx_unstructured_usage_date ON unstructured_usage(date);
```