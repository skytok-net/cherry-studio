# Quickstart Guide: Unstructured.io RAG Integration

**Date**: 2025-01-10
**Feature**: Unstructured.io RAG Integration

## Overview

This guide provides a rapid implementation path for integrating Unstructured.io document processing as a preprocessing provider in Cherry Studio. The integration supports both hosted (cloud) and self-hosted deployments with advanced document processing capabilities.

## Prerequisites

### Development Environment
- Node.js 18+ with yarn package manager
- TypeScript 5.0+ development environment
- Cherry Studio development setup complete
- Access to Unstructured.io API (hosted) or Docker environment (self-hosted)

### Dependencies to Install
```bash
# Core HTTP client for API requests
yarn add axios

# Rate limiting for API quota management
yarn add bottleneck

# File type detection and validation
yarn add file-type

# Crypto utilities for file hashing
yarn add crypto-js

# Development dependencies
yarn add -D @types/crypto-js
```

## Implementation Steps

### Phase 1: Core Infrastructure (2-3 hours)

#### 1.1 Create Type Definitions
Create `src/main/knowledge/preprocess/types/UnstructuredTypes.ts`:

```typescript
export interface UnstructuredConfig {
  id: 'unstructured'
  name: string
  type: 'preprocess'
  deploymentType: 'hosted' | 'self-hosted'
  apiEndpoint: string
  apiKey?: string
  processingMode: 'fast' | 'hi_res'
  chunkingStrategy: 'by_title' | 'by_page' | 'by_similarity' | 'basic'
  outputFormat: 'text' | 'markdown' | 'json'
  maxRetries: number
  timeoutMs: number
}

export interface ProcessingParams {
  strategy: 'fast' | 'hi_res'
  chunkingStrategy: string
  outputFormat: string
  includePageBreaks: boolean
  extractImages: boolean
  extractTables: boolean
  coordinates: boolean
  pdfInferTableStructure: boolean
  languages?: string[]
}

export interface ProcessedElement {
  id: string
  type: 'text' | 'title' | 'header' | 'footer' | 'table' | 'image' | 'list_item' | 'narrative_text' | 'formula'
  text: string
  coordinates?: BoundingBox
  pageNumber?: number
  confidence: number
  metadata: Record<string, any>
}
```

#### 1.2 Create API Client
Create `src/main/knowledge/preprocess/UnstructuredApiClient.ts`:

```typescript
import axios, { AxiosInstance } from 'axios'
import Bottleneck from 'bottleneck'
import { loggerService } from '@logger'

export class UnstructuredApiClient {
  private httpClient: AxiosInstance
  private rateLimiter: Bottleneck
  private logger = loggerService.withContext('UnstructuredApiClient')

  constructor(private config: UnstructuredConfig) {
    this.httpClient = axios.create({
      baseURL: config.apiEndpoint,
      timeout: config.timeoutMs,
      headers: config.apiKey ? {
        'unstructured-api-key': config.apiKey
      } : {}
    })

    // Token bucket rate limiter (10 requests per minute for hosted)
    this.rateLimiter = new Bottleneck({
      reservoir: config.deploymentType === 'hosted' ? 10 : 100,
      reservoirRefreshAmount: config.deploymentType === 'hosted' ? 10 : 100,
      reservoirRefreshInterval: 60 * 1000
    })
  }

  async processDocument(fileBuffer: Buffer, fileName: string, params: ProcessingParams): Promise<ProcessedElement[]> {
    return this.rateLimiter.schedule(() => this.executeProcessing(fileBuffer, fileName, params))
  }

  private async executeProcessing(fileBuffer: Buffer, fileName: string, params: ProcessingParams): Promise<ProcessedElement[]> {
    // Implementation details in Phase 2
    throw new Error('Not implemented')
  }
}
```

#### 1.3 Create Provider Implementation
Create `src/main/knowledge/preprocess/UnstructuredPreprocessProvider.ts`:

```typescript
import { BasePreprocessProvider } from './BasePreprocessProvider'
import { UnstructuredApiClient } from './UnstructuredApiClient'
import { FileMetadata, LoaderReturn } from '../types'

export class UnstructuredPreprocessProvider extends BasePreprocessProvider {
  private apiClient: UnstructuredApiClient

  constructor(config: UnstructuredConfig) {
    super(config)
    this.apiClient = new UnstructuredApiClient(config)
  }

  async parseFile(sourceId: string, file: FileMetadata): Promise<LoaderReturn[]> {
    // Implementation in Phase 2
    throw new Error('Not implemented')
  }

  validateConfig(): boolean {
    // Basic validation logic
    return this.config.apiEndpoint.startsWith('http') && 
           (this.config.deploymentType === 'self-hosted' || !!this.config.apiKey)
  }
}
```

#### 1.4 Register Provider in Factory
Update `src/main/knowledge/preprocess/PreprocessProviderFactory.ts`:

```typescript
// Add import
import { UnstructuredPreprocessProvider } from './UnstructuredPreprocessProvider'

// Update createProvider method
export function createProvider(config: PreprocessProviderConfig): BasePreprocessProvider {
  switch (config.id) {
    case 'unstructured':
      return new UnstructuredPreprocessProvider(config as UnstructuredConfig)
    // ... existing cases
    default:
      throw new Error(`Unknown provider: ${config.id}`)
  }
}
```

### Phase 2: API Integration (3-4 hours)

#### 2.1 Implement Document Processing
Complete the `executeProcessing` method in `UnstructuredApiClient.ts`:

```typescript
private async executeProcessing(fileBuffer: Buffer, fileName: string, params: ProcessingParams): Promise<ProcessedElement[]> {
  const formData = new FormData()
  formData.append('files', new Blob([fileBuffer]), fileName)
  formData.append('strategy', params.strategy)
  formData.append('chunking_strategy', params.chunkingStrategy)
  formData.append('output_format', 'application/json')
  
  const response = await this.httpClient.post('/general/v0/general', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })

  return this.transformResponse(response.data)
}

private transformResponse(apiResponse: any[]): ProcessedElement[] {
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
```

#### 2.2 Implement Provider parseFile Method
Complete `UnstructuredPreprocessProvider.ts`:

```typescript
async parseFile(sourceId: string, file: FileMetadata): Promise<LoaderReturn[]> {
  this.logger.info('Processing file with Unstructured.io', { sourceId, fileName: file.name })

  try {
    const fileBuffer = await fs.readFile(file.path)
    const processingParams = this.buildProcessingParams()
    
    const elements = await this.apiClient.processDocument(fileBuffer, file.name, processingParams)
    const chunks = this.createTextChunks(elements, file)
    
    return chunks.map(chunk => ({
      pageContent: chunk.text,
      metadata: {
        ...chunk.metadata,
        sourceId,
        preprocessor: 'unstructured',
        processingMode: this.config.processingMode
      }
    }))
  } catch (error) {
    this.logger.error('Unstructured processing failed', { error, sourceId })
    throw new Error(`Unstructured.io processing failed: ${error.message}`)
  }
}
```

### Phase 3: UI Integration (2-3 hours)

#### 3.1 Add Provider to Settings
Update settings store to include Unstructured.io as an option:

```typescript
// In src/renderer/src/store/settings.ts
export const preprocessProviderOptions = [
  { id: 'doc2x', name: 'Doc2X' },
  { id: 'unstructured', name: 'Unstructured.io' },
  // ... other providers
]
```

#### 3.2 Add Configuration UI
Create configuration panel for Unstructured.io settings with deployment type selection, API endpoint, and processing options.

### Phase 4: Testing (1-2 hours)

#### 4.1 Unit Tests
Create `tests/main/knowledge/preprocess/UnstructuredPreprocessProvider.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { UnstructuredPreprocessProvider } from '../../../../src/main/knowledge/preprocess/UnstructuredPreprocessProvider'

describe('UnstructuredPreprocessProvider', () => {
  it('should validate hosted config with API key', () => {
    const config = {
      id: 'unstructured',
      deploymentType: 'hosted',
      apiEndpoint: 'https://api.unstructured.io',
      apiKey: 'test-key'
    }
    const provider = new UnstructuredPreprocessProvider(config)
    expect(provider.validateConfig()).toBe(true)
  })

  it('should process PDF documents', async () => {
    // Mock implementation test
  })
})
```

#### 4.2 Integration Tests
Test document processing end-to-end with sample documents.

## Configuration Examples

### Hosted Deployment
```typescript
const hostedConfig: UnstructuredConfig = {
  id: 'unstructured',
  name: 'Unstructured.io (Hosted)',
  type: 'preprocess',
  deploymentType: 'hosted',
  apiEndpoint: 'https://api.unstructured.io',
  apiKey: process.env.UNSTRUCTURED_API_KEY,
  processingMode: 'fast',
  chunkingStrategy: 'by_title',
  outputFormat: 'text',
  maxRetries: 3,
  timeoutMs: 30000
}
```

### Self-Hosted Deployment
```typescript
const selfHostedConfig: UnstructuredConfig = {
  id: 'unstructured',
  name: 'Unstructured.io (Self-Hosted)',
  type: 'preprocess',
  deploymentType: 'self-hosted',
  apiEndpoint: 'http://localhost:8000',
  processingMode: 'hi_res',
  chunkingStrategy: 'by_similarity',
  outputFormat: 'markdown',
  maxRetries: 5,
  timeoutMs: 60000
}
```

## Self-Hosted Setup (Docker)

Create `docker-compose.unstructured.yml`:

```yaml
version: '3.8'
services:
  unstructured-api:
    image: quay.io/unstructured-io/unstructured-api:latest
    ports:
      - "8000:8000"
    environment:
      - UNSTRUCTURED_MEMORY_FREE_MINIMUM_MB=1024
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/general/v0/general"]
      interval: 30s
      timeout: 10s
      retries: 3
    volumes:
      - ./tmp:/app/tmp
```

Start with: `docker-compose -f docker-compose.unstructured.yml up -d`

## Testing Strategy

### Quick Validation
1. Upload a simple PDF to test basic processing
2. Try a complex PDF with tables to validate extraction
3. Test a DOCX file to verify format support
4. Check error handling with invalid files

### Performance Testing
- Process 10MB files within 30-second target
- Verify rate limiting doesn't block normal usage
- Test concurrent processing with queue limits

## Troubleshooting

### Common Issues
- **API Key Invalid**: Verify hosted API key in environment variables
- **Self-Hosted Unreachable**: Check Docker container status and network connectivity
- **Rate Limiting**: Monitor API usage and adjust rate limits in configuration
- **Large Files**: Ensure timeout settings accommodate file processing time

### Debug Logging
Enable debug logging in Cherry Studio settings to see detailed processing information.

## Success Metrics

After implementation, verify:
- ✅ Complex PDFs process with table extraction
- ✅ Processing completes within 30 seconds for 10MB files
- ✅ Self-hosted deployment works without external calls
- ✅ New knowledge bases can select Unstructured.io provider
- ✅ Existing knowledge bases remain unaffected

## Next Steps

1. **Phase 1**: Complete core infrastructure (types, API client, provider)
2. **Phase 2**: Implement full API integration with error handling
3. **Phase 3**: Add UI configuration and provider selection
4. **Phase 4**: Add comprehensive testing and validation
5. **Phase 5**: Add caching and optimization features
6. **Phase 6**: Add usage tracking and quota management