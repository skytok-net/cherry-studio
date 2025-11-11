# Research: Unstructured.io RAG Integration

**Date**: 2025-01-10
**Feature**: Unstructured.io RAG Integration

## Research Findings

### 1. API Integration Patterns

**Decision**: Implement HTTP client with Token Bucket rate limiting and exponential backoff
**Rationale**: Unstructured.io API has rate limits and quota constraints that require careful management. Token bucket provides smooth rate limiting while exponential backoff handles temporary failures gracefully.
**Alternatives considered**: Simple retry with fixed delays (insufficient for API quotas), Circuit breaker pattern (too complex for this use case)

**Implementation Pattern**:
```typescript
class UnstructuredApiClient {
  private rateLimiter: TokenBucket
  private retryPolicy: ExponentialBackoff

  async processDocument(file: Buffer, options: ProcessingOptions): Promise<ProcessedDocument> {
    await this.rateLimiter.consume()
    // HTTP request with retry logic
  }
}
```

### 2. Self-Hosted Deployment Configuration

**Decision**: Docker Compose with health checks and Nginx reverse proxy
**Rationale**: Provides production-ready deployment with proper monitoring, security, and scalability. Health checks ensure service reliability while Nginx handles SSL termination and rate limiting.
**Alternatives considered**: Direct API access (no security/monitoring), Kubernetes (overcomplicated for initial deployment)

**Configuration Pattern**:
```yaml
# docker-compose.yml
services:
  unstructured-api:
    image: quay.io/unstructured-io/unstructured-api:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/general/v0/general"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### 3. Document Processing Optimization

**Decision**: Adaptive chunking strategy selection based on document type and content analysis
**Rationale**: Different document types benefit from different chunking strategies. PDFs with clear structure work best with "by_title", while research papers benefit from "by_similarity".
**Alternatives considered**: Fixed strategy per user preference (less optimal), Dynamic switching based on processing results (too complex)

**Strategy Selection Algorithm**:
```typescript
function selectChunkingStrategy(document: DocumentMetadata): ChunkingStrategy {
  if (document.hasTableOfContents || document.hasHeaders) return 'by_title'
  if (document.type === 'research_paper') return 'by_similarity'
  if (document.type === 'presentation') return 'by_page'
  return 'basic'
}
```

### 4. Caching Strategy

**Decision**: Multi-level caching with in-memory and disk storage
**Rationale**: Document processing is expensive and results are deterministic based on input parameters. Multi-level caching maximizes hit rates while managing memory usage.
**Alternatives considered**: No caching (expensive reprocessing), Database caching (overkill for this use case), Simple file caching (no memory optimization)

**Cache Architecture**:
```typescript
class ProcessingCache {
  private memoryCache: LRUCache<string, ProcessedDocument>
  private diskCache: FileSystemCache

  async get(key: string): Promise<ProcessedDocument | null> {
    // Memory first, then disk, with promotion
  }
}
```

### 5. TypeScript Integration Patterns

**Decision**: Type-safe API client with comprehensive error handling
**Rationale**: Ensures compile-time safety and runtime reliability. Error classification enables appropriate retry and fallback logic.
**Alternatives considered**: Any types (no type safety), Minimal error handling (poor user experience)

**Type System**:
```typescript
interface UnstructuredResponse {
  elements: ProcessedElement[]
  metadata: DocumentMetadata
}

class UnstructuredError extends Error {
  constructor(
    public type: 'quota_exceeded' | 'invalid_format' | 'timeout' | 'network',
    message: string
  ) { super(message) }
}
```

### 6. Electron Integration Patterns

**Decision**: Main process service with IPC bridge to renderer
**Rationale**: Follows Cherry Studio's architecture patterns. Document processing occurs in main process for security and performance, with UI updates via IPC.
**Alternatives considered**: Renderer process processing (security risk), Node.js child processes (unnecessary complexity)

**IPC Pattern**:
```typescript
// Main process
export class UnstructuredPreprocessProvider extends BasePreprocessProvider {
  async parseFile(sourceId: string, file: FileMetadata): Promise<ProcessedResult> {
    // Processing logic with progress updates to renderer
  }
}

// Preload script
contextBridge.exposeInMainWorld('unstructured', {
  processDocument: (file: FileMetadata) => ipcRenderer.invoke('unstructured:process', file)
})
```

## Integration Requirements

1. **Authentication**: Secure API key storage using Electron's safeStorage API
2. **Rate Limiting**: Token bucket implementation with configurable rates
3. **Error Handling**: Comprehensive error classification and retry logic
4. **Monitoring**: Health checks for both hosted and self-hosted deployments
5. **Caching**: Multi-level caching to minimize API calls and processing time
6. **UI Integration**: Settings panel for provider configuration and monitoring

## Performance Targets

- Document processing: <30 seconds for 10MB files (fast mode)
- API response time: <5 seconds for typical documents
- Cache hit rate: >80% for repeat document processing
- Memory usage: <100MB additional overhead
- Success rate: >95% for supported document formats

## Security Considerations

- API keys stored using Electron's secure storage
- File validation before processing
- Network requests through secure HTTPS only
- Self-hosted deployment with firewall rules
- Request/response logging with sensitive data masking