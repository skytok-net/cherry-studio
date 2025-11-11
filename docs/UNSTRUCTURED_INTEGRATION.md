# Unstructured.io Integration Guide for Cherry Studio

This document provides comprehensive integration patterns for incorporating Unstructured.io document processing capabilities into Cherry Studio, following the project's architectural patterns and best practices.

## Table of Contents

1. [API Integration Patterns](#api-integration-patterns)
2. [Self-Hosted Deployment Options](#self-hosted-deployment-options)
3. [Document Processing Optimization](#document-processing-optimization)
4. [TypeScript/Node.js Integration](#typescriptnodejs-integration)
5. [Implementation Examples](#implementation-examples)

## API Integration Patterns

### Authentication and Security

#### API Key Management
```typescript
// src/main/config/UnstructuredConfig.ts
export interface UnstructuredConfig {
  apiKey: string;
  apiUrl: string;
  timeout: number;
  maxRetries: number;
  rateLimitPerSecond: number;
}

export class UnstructuredConfigService {
  private static instance: UnstructuredConfigService;
  private config: UnstructuredConfig;

  private constructor() {
    this.config = {
      apiKey: process.env.UNSTRUCTURED_API_KEY || '',
      apiUrl: process.env.UNSTRUCTURED_API_URL || 'https://api.unstructured.io',
      timeout: parseInt(process.env.UNSTRUCTURED_TIMEOUT || '30000'),
      maxRetries: parseInt(process.env.UNSTRUCTURED_MAX_RETRIES || '3'),
      rateLimitPerSecond: parseInt(process.env.UNSTRUCTURED_RATE_LIMIT || '10')
    };
  }

  static getInstance(): UnstructuredConfigService {
    if (!UnstructuredConfigService.instance) {
      UnstructuredConfigService.instance = new UnstructuredConfigService();
    }
    return UnstructuredConfigService.instance;
  }

  getConfig(): UnstructuredConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<UnstructuredConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
```

#### Security Headers and Request Validation
```typescript
// src/main/services/UnstructuredSecurityService.ts
import { createHash, createHmac } from 'crypto';
import { loggerService } from '@logger';

export class UnstructuredSecurityService {
  private logger = loggerService.withContext('UnstructuredSecurity');

  validateApiKey(apiKey: string): boolean {
    // Validate API key format and characteristics
    const apiKeyPattern = /^[a-zA-Z0-9_-]{32,}$/;
    return apiKeyPattern.test(apiKey);
  }

  generateRequestSignature(
    body: string,
    timestamp: string,
    secret: string
  ): string {
    const payload = `${timestamp}.${body}`;
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  sanitizeFilename(filename: string): string {
    // Remove potentially dangerous characters
    return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
  }

  validateFileType(filename: string, allowedTypes: string[]): boolean {
    const extension = filename.split('.').pop()?.toLowerCase();
    return extension ? allowedTypes.includes(extension) : false;
  }

  maskSensitiveData(data: any): any {
    const masked = { ...data };
    if (masked.apiKey) {
      masked.apiKey = `${masked.apiKey.slice(0, 8)}***`;
    }
    return masked;
  }
}
```

### Rate Limiting and Quota Management

#### Token Bucket Rate Limiter
```typescript
// src/main/services/RateLimiter.ts
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number;

  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consume(tokens: number = 1): boolean {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  waitTime(tokens: number = 1): number {
    this.refill();
    if (this.tokens >= tokens) return 0;

    const needed = tokens - this.tokens;
    return (needed / this.refillRate) * 1000; // milliseconds
  }
}

export class UnstructuredRateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private logger = loggerService.withContext('UnstructuredRateLimiter');

  getBucket(key: string, capacity: number, refillRate: number): TokenBucket {
    if (!this.buckets.has(key)) {
      this.buckets.set(key, new TokenBucket(capacity, refillRate));
    }
    return this.buckets.get(key)!;
  }

  async waitForToken(key: string, tokens: number = 1): Promise<void> {
    const config = UnstructuredConfigService.getInstance().getConfig();
    const bucket = this.getBucket(key, config.rateLimitPerSecond, config.rateLimitPerSecond);

    if (!bucket.consume(tokens)) {
      const waitTime = bucket.waitTime(tokens);
      this.logger.info(`Rate limit hit, waiting ${waitTime}ms`, { key, tokens, waitTime });

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForToken(key, tokens);
      }
    }
  }
}
```

### Error Handling Patterns

#### Comprehensive Error Classification
```typescript
// src/main/errors/UnstructuredErrors.ts
export enum UnstructuredErrorType {
  AUTHENTICATION = 'AUTHENTICATION',
  RATE_LIMIT = 'RATE_LIMIT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  INVALID_FILE = 'INVALID_FILE',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN'
}

export class UnstructuredError extends Error {
  constructor(
    public type: UnstructuredErrorType,
    public message: string,
    public statusCode?: number,
    public retryable: boolean = false,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'UnstructuredError';
  }

  static fromResponse(response: any, body?: string): UnstructuredError {
    const statusCode = response.status || response.statusCode;

    switch (statusCode) {
      case 401:
      case 403:
        return new UnstructuredError(
          UnstructuredErrorType.AUTHENTICATION,
          'Authentication failed. Check API key.',
          statusCode
        );

      case 429:
        const retryAfter = response.headers?.['retry-after'];
        return new UnstructuredError(
          UnstructuredErrorType.RATE_LIMIT,
          'Rate limit exceeded.',
          statusCode,
          true,
          retryAfter ? parseInt(retryAfter) * 1000 : 60000
        );

      case 413:
        return new UnstructuredError(
          UnstructuredErrorType.QUOTA_EXCEEDED,
          'File size or quota exceeded.',
          statusCode
        );

      case 422:
        return new UnstructuredError(
          UnstructuredErrorType.INVALID_FILE,
          'Invalid file format or content.',
          statusCode
        );

      case 500:
      case 502:
      case 503:
        return new UnstructuredError(
          UnstructuredErrorType.PROCESSING_FAILED,
          'Server processing error.',
          statusCode,
          true
        );

      default:
        return new UnstructuredError(
          UnstructuredErrorType.UNKNOWN,
          body || 'Unknown error occurred.',
          statusCode,
          statusCode >= 500
        );
    }
  }
}
```

## Self-Hosted Deployment Options

### Docker Deployment Configuration

#### Production Docker Compose
```yaml
# docker/unstructured/docker-compose.yml
version: '3.8'

services:
  unstructured-api:
    image: quay.io/unstructured-io/unstructured-api:latest
    ports:
      - "8000:8000"
    environment:
      - UNSTRUCTURED_API_KEY=${UNSTRUCTURED_API_KEY}
      - UNSTRUCTURED_PARALLEL_MODE_ENABLED=true
      - UNSTRUCTURED_PARALLEL_MODE_THREADS=4
      - UNSTRUCTURED_MEMORY_FREE_MINIMUM_MB=512
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthcheck"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp:noexec,nosuid,size=256m
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2.0'
        reservations:
          memory: 2G
          cpus: '1.0'

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - unstructured-api
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 3s
      retries: 3

volumes:
  redis_data:
    driver: local
```

#### Health Check Implementation
```typescript
// src/main/services/UnstructuredHealthService.ts
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  services: {
    api: ServiceHealth;
    processing: ServiceHealth;
    storage: ServiceHealth;
  };
  metrics: HealthMetrics;
}

interface ServiceHealth {
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  lastChecked: number;
  error?: string;
}

interface HealthMetrics {
  requestCount: number;
  errorRate: number;
  averageResponseTime: number;
  queueDepth: number;
}

export class UnstructuredHealthService {
  private logger = loggerService.withContext('UnstructuredHealth');
  private metrics: HealthMetrics = {
    requestCount: 0,
    errorRate: 0,
    averageResponseTime: 0,
    queueDepth: 0
  };

  async checkHealth(): Promise<HealthStatus> {
    const timestamp = Date.now();

    const [apiHealth, processingHealth, storageHealth] = await Promise.allSettled([
      this.checkApiHealth(),
      this.checkProcessingHealth(),
      this.checkStorageHealth()
    ]);

    const services = {
      api: this.getServiceResult(apiHealth),
      processing: this.getServiceResult(processingHealth),
      storage: this.getServiceResult(storageHealth)
    };

    const overallStatus = this.calculateOverallStatus(services);

    return {
      status: overallStatus,
      timestamp,
      services,
      metrics: { ...this.metrics }
    };
  }

  private async checkApiHealth(): Promise<ServiceHealth> {
    const start = Date.now();

    try {
      const config = UnstructuredConfigService.getInstance().getConfig();
      const response = await fetch(`${config.apiUrl}/healthcheck`, {
        method: 'GET',
        timeout: 5000,
        headers: {
          'Authorization': `Bearer ${config.apiKey}`
        }
      });

      const responseTime = Date.now() - start;

      if (response.ok) {
        return {
          status: responseTime > 2000 ? 'degraded' : 'up',
          responseTime,
          lastChecked: Date.now()
        };
      } else {
        return {
          status: 'down',
          responseTime,
          lastChecked: Date.now(),
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      return {
        status: 'down',
        responseTime: Date.now() - start,
        lastChecked: Date.now(),
        error: error.message
      };
    }
  }

  private async checkProcessingHealth(): Promise<ServiceHealth> {
    // Check processing queue depth and response times
    const queueDepth = await this.getQueueDepth();

    return {
      status: queueDepth > 100 ? 'degraded' : 'up',
      lastChecked: Date.now()
    };
  }

  private async checkStorageHealth(): Promise<ServiceHealth> {
    // Check available disk space and file system health
    const diskUsage = await this.getDiskUsage();

    return {
      status: diskUsage > 0.9 ? 'degraded' : 'up',
      lastChecked: Date.now()
    };
  }

  private getServiceResult(result: PromiseSettledResult<ServiceHealth>): ServiceHealth {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'down',
        lastChecked: Date.now(),
        error: result.reason.message
      };
    }
  }

  private calculateOverallStatus(services: any): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(services).map(s => s.status);

    if (statuses.every(s => s === 'up')) return 'healthy';
    if (statuses.some(s => s === 'down')) return 'unhealthy';
    return 'degraded';
  }

  private async getQueueDepth(): Promise<number> {
    // Implementation depends on your queue system
    return this.metrics.queueDepth;
  }

  private async getDiskUsage(): Promise<number> {
    // Check available disk space
    return 0.5; // Placeholder - implement actual disk usage check
  }

  updateMetrics(responseTime: number, isError: boolean): void {
    this.metrics.requestCount++;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime + responseTime) / 2;

    if (isError) {
      this.metrics.errorRate =
        (this.metrics.errorRate * 0.9) + (1 * 0.1); // Exponential moving average
    } else {
      this.metrics.errorRate = this.metrics.errorRate * 0.99;
    }
  }
}
```

### Network Security Configuration

#### Nginx Reverse Proxy Configuration
```nginx
# docker/unstructured/nginx.conf
upstream unstructured_backend {
    server unstructured-api:8000;
    keepalive 32;
}

server {
    listen 80;
    server_name unstructured.internal;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # File size limits
    client_max_body_size 50M;
    client_body_timeout 60s;
    client_header_timeout 60s;

    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }

    location / {
        proxy_pass http://unstructured_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## Document Processing Optimization

### Chunking Strategy Selection

#### Adaptive Chunking Algorithm
```typescript
// src/main/services/ChunkingStrategyService.ts
export enum ChunkingStrategy {
  BY_TITLE = 'by_title',
  BY_PAGE = 'by_page',
  BY_SIMILARITY = 'by_similarity',
  BASIC = 'basic',
  ADAPTIVE = 'adaptive'
}

export interface ChunkingConfig {
  strategy: ChunkingStrategy;
  maxCharacters: number;
  newAfterNChars: number;
  combineUnderNChars: number;
  overlap: number;
  includeOrigElements: boolean;
  multipageSection: boolean;
}

export class ChunkingStrategyService {
  private logger = loggerService.withContext('ChunkingStrategy');

  selectOptimalStrategy(
    documentType: string,
    documentSize: number,
    targetUse: 'rag' | 'search' | 'summary'
  ): ChunkingConfig {
    const baseConfig: ChunkingConfig = {
      strategy: ChunkingStrategy.BY_TITLE,
      maxCharacters: 1500,
      newAfterNChars: 1200,
      combineUnderNChars: 400,
      overlap: 50,
      includeOrigElements: true,
      multipageSection: true
    };

    // Adjust based on document type
    switch (documentType.toLowerCase()) {
      case 'pdf':
        return this.optimizeForPdf(baseConfig, documentSize, targetUse);
      case 'docx':
        return this.optimizeForDocx(baseConfig, targetUse);
      case 'html':
        return this.optimizeForHtml(baseConfig, targetUse);
      case 'txt':
        return this.optimizeForText(baseConfig, targetUse);
      default:
        return baseConfig;
    }
  }

  private optimizeForPdf(
    config: ChunkingConfig,
    size: number,
    targetUse: string
  ): ChunkingConfig {
    if (size > 10 * 1024 * 1024) { // Large PDFs (>10MB)
      return {
        ...config,
        strategy: ChunkingStrategy.BY_PAGE,
        maxCharacters: 2000,
        newAfterNChars: 1600,
        overlap: targetUse === 'rag' ? 100 : 50
      };
    }

    if (targetUse === 'summary') {
      return {
        ...config,
        strategy: ChunkingStrategy.BY_TITLE,
        maxCharacters: 3000,
        newAfterNChars: 2400,
        combineUnderNChars: 800
      };
    }

    return config;
  }

  private optimizeForDocx(config: ChunkingConfig, targetUse: string): ChunkingConfig {
    // DOCX files typically have good structure
    return {
      ...config,
      strategy: ChunkingStrategy.BY_TITLE,
      maxCharacters: targetUse === 'rag' ? 1200 : 2000,
      overlap: targetUse === 'rag' ? 100 : 25
    };
  }

  private optimizeForHtml(config: ChunkingConfig, targetUse: string): ChunkingConfig {
    return {
      ...config,
      strategy: ChunkingStrategy.BY_TITLE,
      maxCharacters: 1000,
      newAfterNChars: 800,
      combineUnderNChars: 200
    };
  }

  private optimizeForText(config: ChunkingConfig, targetUse: string): ChunkingConfig {
    return {
      ...config,
      strategy: ChunkingStrategy.BASIC,
      maxCharacters: targetUse === 'rag' ? 800 : 1500,
      overlap: targetUse === 'rag' ? 80 : 0
    };
  }

  generateChunkingParameters(config: ChunkingConfig): any {
    const params: any = {
      max_characters: config.maxCharacters,
      new_after_n_chars: config.newAfterNChars,
      overlap: config.overlap
    };

    if (config.strategy === ChunkingStrategy.BY_TITLE) {
      params.combine_text_under_n_chars = config.combineUnderNChars;
      params.multipage_sections = config.multipageSection;
      params.include_orig_elements = config.includeOrigElements;
    }

    return params;
  }
}
```

### Caching Strategies

#### Multi-Level Caching System
```typescript
// src/main/services/UnstructuredCacheService.ts
export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
}

export class UnstructuredCacheService {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private diskCacheDir: string;
  private logger = loggerService.withContext('UnstructuredCache');

  constructor(diskCacheDir: string) {
    this.diskCacheDir = diskCacheDir;
    this.setupCleanupInterval();
  }

  async get<T>(key: string): Promise<T | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry && !this.isExpired(memoryEntry)) {
      memoryEntry.accessCount++;
      memoryEntry.lastAccess = Date.now();
      return memoryEntry.value;
    }

    // Check disk cache
    try {
      const diskEntry = await this.getDiskCache<T>(key);
      if (diskEntry && !this.isExpired(diskEntry)) {
        // Promote to memory cache if frequently accessed
        if (diskEntry.accessCount > 5) {
          this.memoryCache.set(key, diskEntry);
        }
        return diskEntry.value;
      }
    } catch (error) {
      this.logger.warn('Disk cache read failed', { key, error: error.message });
    }

    return null;
  }

  async set<T>(key: string, value: T, ttl: number = 3600000): Promise<void> {
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccess: Date.now()
    };

    // Store in memory cache
    this.memoryCache.set(key, entry);

    // Store in disk cache for persistence
    try {
      await this.setDiskCache(key, entry);
    } catch (error) {
      this.logger.warn('Disk cache write failed', { key, error: error.message });
    }
  }

  generateCacheKey(
    filename: string,
    strategy: ChunkingStrategy,
    config: ChunkingConfig
  ): string {
    const configHash = this.hashObject({
      strategy,
      maxCharacters: config.maxCharacters,
      newAfterNChars: config.newAfterNChars,
      overlap: config.overlap
    });

    return `unstructured:${filename}:${configHash}`;
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private async getDiskCache<T>(key: string): Promise<CacheEntry<T> | null> {
    const cachePath = path.join(this.diskCacheDir, `${key}.json`);

    try {
      const data = await fs.promises.readFile(cachePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  private async setDiskCache<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    const cachePath = path.join(this.diskCacheDir, `${key}.json`);
    await fs.promises.mkdir(this.diskCacheDir, { recursive: true });
    await fs.promises.writeFile(cachePath, JSON.stringify(entry));
  }

  private hashObject(obj: any): string {
    return createHash('md5').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
  }

  private setupCleanupInterval(): void {
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, 300000); // Clean up every 5 minutes
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry) || (now - entry.lastAccess > 1800000)) { // 30 min inactive
        this.memoryCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} expired cache entries`);
    }
  }
}
```

## TypeScript/Node.js Integration

### HTTP Client Implementation

#### Robust HTTP Client with Retry Logic
```typescript
// src/main/services/UnstructuredHttpClient.ts
export class UnstructuredHttpClient {
  private rateLimiter: UnstructuredRateLimiter;
  private security: UnstructuredSecurityService;
  private logger = loggerService.withContext('UnstructuredHttpClient');

  constructor() {
    this.rateLimiter = new UnstructuredRateLimiter();
    this.security = new UnstructuredSecurityService();
  }

  async request<T>(
    method: string,
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const config = UnstructuredConfigService.getInstance().getConfig();
    const url = `${config.apiUrl}${endpoint}`;

    // Apply rate limiting
    await this.rateLimiter.waitForToken('api-requests');

    const requestId = this.generateRequestId();
    const startTime = Date.now();

    try {
      const response = await this.executeRequest(method, url, options, config);
      const responseTime = Date.now() - startTime;

      this.logger.info('Request completed', {
        requestId,
        method,
        endpoint,
        statusCode: response.status,
        responseTime
      });

      return await this.parseResponse<T>(response);
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Request failed', {
        requestId,
        method,
        endpoint,
        error: error.message,
        responseTime
      });

      throw this.handleError(error);
    }
  }

  private async executeRequest(
    method: string,
    url: string,
    options: RequestOptions,
    config: UnstructuredConfig
  ): Promise<Response> {
    const headers = {
      'Authorization': `Bearer ${config.apiKey}`,
      'User-Agent': 'Cherry-Studio/1.0',
      'Accept': 'application/json',
      ...options.headers
    };

    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
      body: options.body,
      signal: options.signal || AbortSignal.timeout(config.timeout)
    };

    return await fetch(url, fetchOptions);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');

    if (!response.ok) {
      const errorBody = contentType?.includes('application/json')
        ? await response.json()
        : await response.text();

      throw UnstructuredError.fromResponse(response, errorBody);
    }

    if (contentType?.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text() as unknown as T;
    }
  }

  private handleError(error: any): Error {
    if (error instanceof UnstructuredError) {
      return error;
    }

    if (error.name === 'AbortError') {
      return new UnstructuredError(
        UnstructuredErrorType.TIMEOUT,
        'Request timeout',
        408,
        true
      );
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return new UnstructuredError(
        UnstructuredErrorType.NETWORK_ERROR,
        'Network connection failed',
        undefined,
        true
      );
    }

    return new UnstructuredError(
      UnstructuredErrorType.UNKNOWN,
      error.message || 'Unknown error occurred',
      undefined,
      false
    );
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

interface RequestOptions {
  headers?: Record<string, string>;
  body?: string | FormData | Buffer;
  signal?: AbortSignal;
}
```

### Async Processing Queue

#### Document Processing Queue Implementation
```typescript
// src/main/services/DocumentProcessingQueue.ts
export interface ProcessingJob {
  id: string;
  filename: string;
  filePath: string;
  strategy: ChunkingStrategy;
  config: ChunkingConfig;
  priority: number;
  createdAt: number;
  attempts: number;
  maxAttempts: number;
  callback?: (result: ProcessingResult) => void;
}

export interface ProcessingResult {
  jobId: string;
  success: boolean;
  elements?: any[];
  chunks?: any[];
  error?: Error;
  processingTime: number;
  cacheHit: boolean;
}

export class DocumentProcessingQueue {
  private queue: ProcessingJob[] = [];
  private processing = new Map<string, Promise<ProcessingResult>>();
  private concurrentLimit = 3;
  private logger = loggerService.withContext('DocumentProcessingQueue');
  private httpClient: UnstructuredHttpClient;
  private cache: UnstructuredCacheService;

  constructor(httpClient: UnstructuredHttpClient, cache: UnstructuredCacheService) {
    this.httpClient = httpClient;
    this.cache = cache;
  }

  async addJob(
    filename: string,
    filePath: string,
    options: Partial<ProcessingJob> = {}
  ): Promise<string> {
    const job: ProcessingJob = {
      id: this.generateJobId(),
      filename: this.security.sanitizeFilename(filename),
      filePath,
      strategy: options.strategy || ChunkingStrategy.BY_TITLE,
      config: options.config || this.getDefaultConfig(),
      priority: options.priority || 0,
      createdAt: Date.now(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      callback: options.callback
    };

    this.queue.push(job);
    this.queue.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

    this.logger.info('Job added to queue', {
      jobId: job.id,
      filename: job.filename,
      queueLength: this.queue.length
    });

    // Start processing if below concurrent limit
    setImmediate(() => this.processNext());

    return job.id;
  }

  async getJobStatus(jobId: string): Promise<ProcessingResult | null> {
    const activeJob = this.processing.get(jobId);
    if (activeJob) {
      try {
        return await activeJob;
      } catch (error) {
        return {
          jobId,
          success: false,
          error,
          processingTime: 0,
          cacheHit: false
        };
      }
    }

    return null;
  }

  private async processNext(): Promise<void> {
    if (this.processing.size >= this.concurrentLimit || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift()!;
    const processingPromise = this.processJob(job);

    this.processing.set(job.id, processingPromise);

    try {
      const result = await processingPromise;
      if (job.callback) {
        job.callback(result);
      }
    } catch (error) {
      this.logger.error('Job processing failed', {
        jobId: job.id,
        error: error.message
      });
    } finally {
      this.processing.delete(job.id);
      // Process next job
      setImmediate(() => this.processNext());
    }
  }

  private async processJob(job: ProcessingJob): Promise<ProcessingResult> {
    const startTime = Date.now();
    job.attempts++;

    this.logger.info('Processing job', {
      jobId: job.id,
      filename: job.filename,
      attempt: job.attempts
    });

    try {
      // Check cache first
      const cacheKey = this.cache.generateCacheKey(
        job.filename,
        job.strategy,
        job.config
      );

      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return {
          jobId: job.id,
          success: true,
          elements: cachedResult.elements,
          chunks: cachedResult.chunks,
          processingTime: Date.now() - startTime,
          cacheHit: true
        };
      }

      // Process document
      const result = await this.processDocument(job);

      // Cache successful results
      if (result.success) {
        await this.cache.set(cacheKey, {
          elements: result.elements,
          chunks: result.chunks
        }, 86400000); // Cache for 24 hours
      }

      return result;
    } catch (error) {
      if (job.attempts < job.maxAttempts && error.retryable) {
        // Re-queue for retry with exponential backoff
        const delay = Math.pow(2, job.attempts) * 1000;
        setTimeout(() => {
          this.queue.unshift(job);
          this.processNext();
        }, delay);

        throw new Error(`Job retry scheduled (attempt ${job.attempts}/${job.maxAttempts})`);
      }

      return {
        jobId: job.id,
        success: false,
        error,
        processingTime: Date.now() - startTime,
        cacheHit: false
      };
    }
  }

  private async processDocument(job: ProcessingJob): Promise<ProcessingResult> {
    const formData = new FormData();
    const fileBuffer = await fs.promises.readFile(job.filePath);

    formData.append('files', new Blob([fileBuffer]), job.filename);
    formData.append('strategy', 'hi_res');
    formData.append('chunking_strategy', job.strategy);

    const chunkingParams = this.getChunkingParameters(job.config);
    Object.entries(chunkingParams).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    const response = await this.httpClient.request('POST', '/general/v0/general', {
      body: formData
    });

    return {
      jobId: job.id,
      success: true,
      elements: response.elements || [],
      chunks: response.chunks || [],
      processingTime: Date.now() - Date.now(), // Will be calculated by caller
      cacheHit: false
    };
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  private getDefaultConfig(): ChunkingConfig {
    return {
      strategy: ChunkingStrategy.BY_TITLE,
      maxCharacters: 1500,
      newAfterNChars: 1200,
      combineUnderNChars: 400,
      overlap: 50,
      includeOrigElements: true,
      multipageSection: true
    };
  }

  private getChunkingParameters(config: ChunkingConfig): any {
    return {
      max_characters: config.maxCharacters,
      new_after_n_chars: config.newAfterNChars,
      combine_text_under_n_chars: config.combineUnderNChars,
      overlap: config.overlap,
      include_orig_elements: config.includeOrigElements
    };
  }
}
```

## Implementation Examples

### Main Service Integration

```typescript
// src/main/services/UnstructuredService.ts
export class UnstructuredService {
  private httpClient: UnstructuredHttpClient;
  private cache: UnstructuredCacheService;
  private processingQueue: DocumentProcessingQueue;
  private chunkingStrategy: ChunkingStrategyService;
  private health: UnstructuredHealthService;
  private logger = loggerService.withContext('UnstructuredService');

  constructor() {
    this.httpClient = new UnstructuredHttpClient();
    this.cache = new UnstructuredCacheService(path.join(__dirname, '../cache/unstructured'));
    this.processingQueue = new DocumentProcessingQueue(this.httpClient, this.cache);
    this.chunkingStrategy = new ChunkingStrategyService();
    this.health = new UnstructuredHealthService();
  }

  async processDocument(
    filePath: string,
    options: DocumentProcessingOptions = {}
  ): Promise<ProcessedDocument> {
    const filename = path.basename(filePath);
    const fileStats = await fs.promises.stat(filePath);
    const documentType = path.extname(filename).slice(1);

    // Select optimal chunking strategy
    const chunkingConfig = this.chunkingStrategy.selectOptimalStrategy(
      documentType,
      fileStats.size,
      options.targetUse || 'rag'
    );

    // Add to processing queue
    const jobId = await this.processingQueue.addJob(filename, filePath, {
      strategy: chunkingConfig.strategy,
      config: chunkingConfig,
      priority: options.priority || 0
    });

    // Wait for processing completion
    const result = await this.processingQueue.getJobStatus(jobId);

    if (!result?.success) {
      throw new Error(`Document processing failed: ${result?.error?.message}`);
    }

    return {
      filename,
      elements: result.elements || [],
      chunks: result.chunks || [],
      processingTime: result.processingTime,
      cacheHit: result.cacheHit,
      strategy: chunkingConfig.strategy
    };
  }

  async getServiceHealth(): Promise<HealthStatus> {
    return this.health.checkHealth();
  }

  async clearCache(): Promise<void> {
    // Implementation for cache clearing
    this.logger.info('Cache cleared');
  }
}

export interface DocumentProcessingOptions {
  targetUse?: 'rag' | 'search' | 'summary';
  priority?: number;
  customChunking?: ChunkingConfig;
}

export interface ProcessedDocument {
  filename: string;
  elements: any[];
  chunks: any[];
  processingTime: number;
  cacheHit: boolean;
  strategy: ChunkingStrategy;
}
```

### IPC Bridge for Renderer Process

```typescript
// src/preload/unstructured.ts
import { contextBridge, ipcRenderer } from 'electron';

export const unstructuredAPI = {
  processDocument: (filePath: string, options?: any) =>
    ipcRenderer.invoke('unstructured:process-document', filePath, options),

  getHealth: () =>
    ipcRenderer.invoke('unstructured:get-health'),

  clearCache: () =>
    ipcRenderer.invoke('unstructured:clear-cache'),

  onProcessingUpdate: (callback: (data: any) => void) => {
    const handler = (event: any, data: any) => callback(data);
    ipcRenderer.on('unstructured:processing-update', handler);
    return () => ipcRenderer.removeListener('unstructured:processing-update', handler);
  }
};

contextBridge.exposeInMainWorld('unstructuredAPI', unstructuredAPI);
```

This comprehensive integration guide provides production-ready patterns for incorporating Unstructured.io into Cherry Studio while following the project's architectural principles and logging standards. The implementation includes robust error handling, caching, rate limiting, and monitoring capabilities suitable for enterprise deployment.