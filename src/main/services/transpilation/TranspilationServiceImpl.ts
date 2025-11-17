/**
 * Transpilation Service Implementation
 * Coordinates three-tier fallback transpilation: Native esbuild → WebAssembly → Babel
 * Feature: 003-transpiler-service-rearchitecture
 */

import type {
  ITranspilationService,
  TranspilationRequest,
  TranspilationResult,
  ServiceCapabilities,
  ServiceStatus,
  ExecutionMode,
  ArtifactFramework
} from './ITranspilationService';
import type { ITranspilationCache } from '../cache/ITranspilationCache';
import type { IFallbackChain } from './IFallbackChain';
import type { IFrameworkHandler, FrameworkConfig } from './IFrameworkHandler';
import type { ITranspilationProvider, ProviderError } from '../providers/ITranspilationProvider';
import type { IBinaryProvider } from './IBinaryProvider';

// Import concrete implementations
import { ReactHandler } from './FrameworkHandlers/ReactHandler';
import { NativeEsbuildProvider } from '../providers/NativeEsbuildProvider';
import { WebAssemblyProvider } from '../providers/WebAssemblyProvider';
import { BabelProvider } from '../providers/BabelProvider';
import { TranspilationCache } from '../cache/TranspilationCache';
import { FallbackChain } from './FallbackChain';
import { BinaryProvider } from './BinaryProvider';

// Import error handling
import { TranspilationError, TranspilationErrorCode } from './errors/TranspilationError';
import { TranspilationErrorHandler } from './errors/ErrorHandler';
import { loggerService } from '@logger';

interface ServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  totalResponseTime: number;
  providerUsage: Record<ExecutionMode, number>;
  frameworkUsage: Record<ArtifactFramework, number>;
  startTime: Date;
}

const logger = loggerService.withContext('TranspilationService');

export class TranspilationServiceImpl implements ITranspilationService {
  private cache: ITranspilationCache;
  private fallbackChain: IFallbackChain;
  private binaryProvider: IBinaryProvider;
  private frameworkHandlers: Map<ArtifactFramework, IFrameworkHandler>;
  private providers: ITranspilationProvider[];
  private isInitialized: boolean = false;
  private metrics: ServiceMetrics;
  private errorHandler: TranspilationErrorHandler;

  constructor() {
    // Initialize core components
    this.binaryProvider = new BinaryProvider();
    this.cache = new TranspilationCache();
    this.fallbackChain = new FallbackChain();
    this.frameworkHandlers = new Map();
    this.providers = [];
    this.metrics = this.initializeMetrics();
    this.errorHandler = new TranspilationErrorHandler();
  }

  /**
   * Initialize the transpilation service with all providers and handlers
   * Maps to FR-007: Service initialization and provider setup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize framework handlers
      await this.initializeFrameworkHandlers();

      // Initialize transpilation providers
      await this.initializeProviders();

      // Initialize fallback chain with providers
      await this.fallbackChain.initialize(this.providers);

      this.isInitialized = true;
      this.metrics.startTime = new Date();

    } catch (error) {
      const transpilationError = this.errorHandler.handleValidationError(
        TranspilationErrorCode.INITIALIZATION_FAILED,
        `Transpilation service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { originalError: error }
      );

      logger.error('Service initialization failed', {
        code: transpilationError.code,
        originalError: error instanceof Error ? error.message : 'Unknown error'
      });

      throw transpilationError;
    }
  }

  /**
   * Transpile code using the three-tier fallback chain
   * Maps to FR-001: High-performance transpilation with graceful degradation
   */
  async transpile(request: TranspilationRequest): Promise<TranspilationResult> {
    if (!this.isInitialized) {
      const error = this.errorHandler.handleValidationError(
        TranspilationErrorCode.INITIALIZATION_FAILED,
        'Transpilation service not initialized',
        {},
        request
      );
      throw error;
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Validate request
      this.validateRequest(request);

      // Update framework usage metrics
      this.metrics.frameworkUsage[request.framework] =
        (this.metrics.frameworkUsage[request.framework] || 0) + 1;

      // Check cache first
      const cacheKey = await this.cache.generateKey(request);
      const cached = await this.cache.get(cacheKey);

      if (cached) {
        this.metrics.cacheHits++;
        this.updateMetrics(Date.now() - startTime, true);
        return {
          ...cached.result,
          cacheHit: true
        };
      }

      this.metrics.cacheMisses++;

      // Get appropriate framework handler
      const handler = this.getFrameworkHandler(request.framework);

      // Preprocess code with framework handler
      const preprocessResult = handler.preprocess(request.code, request.filename);
      const preprocessedRequest = {
        ...request,
        code: preprocessResult.code
      };

      // Execute transpilation through fallback chain
      const result = await this.executeWithFallback(preprocessedRequest);

      // Post-process result with framework handler
      const postprocessResult = handler.postprocess({
        code: result.code,
        map: result.map,
        warnings: result.warnings || [],
        metadata: {
          startTime: Date.now(),
          endTime: Date.now(),
          inputSize: request.code.length,
          outputSize: result.code.length,
          dependencyCount: 0
        }
      });
      const finalResult: TranspilationResult = {
        code: postprocessResult.code,
        map: postprocessResult.map,
        warnings: postprocessResult.warnings,
        executionMode: result.executionMode,
        duration: result.duration,
        cacheHit: result.cacheHit
      };

      // Cache the result
      await this.cacheResult(cacheKey, finalResult, request);

      this.updateMetrics(Date.now() - startTime, true);
      return finalResult;

    } catch (error) {
      this.updateMetrics(Date.now() - startTime, false);

      // Handle TranspilationError instances directly
      if (error instanceof TranspilationError) {
        const strategy = this.errorHandler.handleError(error);
        logger.error('Transpilation error occurred', {
          code: error.code,
          recoverable: error.recoverable,
          strategy: JSON.stringify(strategy),
          filename: request.filename,
          framework: request.framework
        });
        throw error;
      }

      // Handle other errors by wrapping them
      const transpilationError = this.errorHandler.handleValidationError(
        TranspilationErrorCode.UNKNOWN_ERROR,
        `Transpilation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { originalError: error },
        request
      );

      logger.error('Unknown transpilation error occurred', {
        code: transpilationError.code,
        originalError: error instanceof Error ? error.message : 'Unknown error',
        filename: request.filename,
        framework: request.framework
      });

      throw transpilationError;
    }
  }

  /**
   * Get service capabilities and supported features
   * Maps to FR-011: Service introspection and feature detection
   */
  getCapabilities(): ServiceCapabilities {
    // Provider and framework capabilities are available but not exposed in ServiceCapabilities interface

    return {
      supportedFrameworks: ['react', 'vue', 'svelte', 'solid'],
      nativeEsbuild: this.providers.some(p => p.getProviderInfo().executionMode === 'native'),
      webAssembly: this.providers.some(p => p.getProviderInfo().executionMode === 'webassembly'),
      babelFallback: this.providers.some(p => p.getProviderInfo().executionMode === 'babel'),
      platformSupport: {
        platform: process.platform,
        architecture: process.arch,
        nativeBinaryAvailable: this.providers.some(p => p.getProviderInfo().executionMode === 'native')
      }
    };
  }

  /**
   * Get current service status and health metrics
   * Maps to FR-010: Service monitoring and debugging
   */
  getStatus(): ServiceStatus {
    const chainStatus = this.fallbackChain.getChainStatus();

    return {
      state: this.isInitialized ? 'ready' : 'uninitialized',
      currentProvider: chainStatus.currentProvider ? 
        chainStatus.currentProvider.provider.getProviderInfo().executionMode : 'native',
      health: {
        successCount: this.metrics.successfulRequests,
        failureCount: this.metrics.failedRequests,
        successRate: this.metrics.totalRequests > 0 ? this.metrics.successfulRequests / this.metrics.totalRequests : 1,
        averageDuration: this.metrics.totalRequests > 0 ? this.metrics.totalResponseTime / this.metrics.totalRequests : 0
      }
    };
  }

  /**
   * Cleanup service resources and shutdown gracefully
   * Maps to proper resource management
   */
  async dispose(): Promise<void> {
    try {
      // Dispose all providers
      await Promise.all(this.providers.map(provider => provider.dispose()));

      // Clear cache
      await this.cache.clear();

      // Reset state
      this.isInitialized = false;
      this.providers = [];
      this.frameworkHandlers.clear();
      this.metrics = this.initializeMetrics();

    } catch (error) {
      // Log error but don't throw to ensure cleanup completes
      console.error('Error during transpilation service disposal:', error);
    }
  }

  // Private helper methods

  private async initializeFrameworkHandlers(): Promise<void> {
    // Initialize React handler
    const reactHandler = new ReactHandler();
    reactHandler.configure({
      jsx: 'transform',
      target: 'es2020',
      minify: false
    });
    this.frameworkHandlers.set('react', reactHandler);

    // TODO: Initialize other framework handlers when implemented
    // Vue, Svelte, Solid handlers would be added here
  }

  private async initializeProviders(): Promise<void> {
    // Initialize providers in priority order
    const providers: ITranspilationProvider[] = [];

    // 1. Native esbuild provider (highest priority)
    const nativeProvider = new NativeEsbuildProvider(this.binaryProvider);
    try {
      if (await nativeProvider.isAvailable()) {
        await nativeProvider.initialize();
        providers.push(nativeProvider);
      }
    } catch (error) {
      // Native provider optional - continue with fallbacks
    }

    // 2. WebAssembly provider (medium priority)
    const wasmProvider = new WebAssemblyProvider();
    try {
      if (await wasmProvider.isAvailable()) {
        await wasmProvider.initialize();
        providers.push(wasmProvider);
      }
    } catch (error) {
      // WASM provider optional - continue with Babel
    }

    // 3. Babel provider (lowest priority - always available)
    const babelProvider = new BabelProvider();
    try {
      if (await babelProvider.isAvailable()) {
        await babelProvider.initialize();
        providers.push(babelProvider);
      }
    } catch (error) {
      throw new Error('No transpilation providers available - cannot initialize service');
    }

    this.providers = providers;

    if (providers.length === 0) {
      throw new Error('No transpilation providers could be initialized');
    }
  }

  private validateRequest(request: TranspilationRequest): void {
    if (!request.code || request.code.trim().length === 0) {
      throw this.errorHandler.handleValidationError(
        TranspilationErrorCode.INVALID_INPUT_CODE,
        'Empty code provided for transpilation',
        { codeLength: request.code?.length || 0 },
        request
      );
    }

    if (request.code.length > 1024 * 1024) { // 1MB limit
      throw this.errorHandler.handleValidationError(
        TranspilationErrorCode.CODE_TOO_LARGE,
        `Code size exceeds 1MB limit: ${Math.round(request.code.length / 1024)}KB`,
        { codeSize: request.code.length, limit: 1024 * 1024 },
        request
      );
    }

    if (!request.framework) {
      throw this.errorHandler.handleValidationError(
        TranspilationErrorCode.INVALID_FRAMEWORK,
        'Framework must be specified',
        {},
        request
      );
    }

    if (!this.frameworkHandlers.has(request.framework)) {
      throw this.errorHandler.handleValidationError(
        TranspilationErrorCode.FRAMEWORK_NOT_SUPPORTED,
        `Unsupported framework: ${request.framework}`,
        {
          requestedFramework: request.framework,
          supportedFrameworks: Array.from(this.frameworkHandlers.keys())
        },
        request
      );
    }
  }

  private getFrameworkHandler(framework: ArtifactFramework): IFrameworkHandler {
    const handler = this.frameworkHandlers.get(framework);
    if (!handler) {
      throw this.errorHandler.handleValidationError(
        TranspilationErrorCode.FRAMEWORK_HANDLER_NOT_FOUND,
        `No handler available for framework: ${framework}`,
        {
          requestedFramework: framework,
          availableHandlers: Array.from(this.frameworkHandlers.keys())
        }
      );
    }
    return handler;
  }

  private async executeWithFallback(request: TranspilationRequest): Promise<TranspilationResult> {
    const providerErrors: TranspilationError[] = [];

    while (this.fallbackChain.hasAvailableProviders()) {
      const provider = this.fallbackChain.getNextProvider();
      if (!provider) {
        break;
      }

      const providerInfo = provider.getProviderInfo();

      try {
        const frameworkConfig: FrameworkConfig = {
          framework: request.framework,
          plugins: [],
          esbuildOptions: {
            jsx: 'transform'
          },
          loaders: {},
          externals: [],
          define: {}
        };
        const result = await provider.transpile(request, frameworkConfig);

        // Record successful execution
        this.metrics.providerUsage[providerInfo.executionMode] =
          (this.metrics.providerUsage[providerInfo.executionMode] || 0) + 1;

        logger.info('Provider succeeded', {
          provider: providerInfo.executionMode,
          filename: request.filename,
          framework: request.framework
        });

        // Convert ProviderResult to TranspilationResult
        return {
          code: result.code,
          map: result.map,
          warnings: result.warnings || [],
          executionMode: providerInfo.executionMode,
          duration: 0, // Duration tracking would need to be added
          cacheHit: false
        };

      } catch (error) {
        let transpilationError: TranspilationError;

        if (error instanceof TranspilationError) {
          transpilationError = error;
        } else {
          // Convert generic errors to TranspilationError based on provider type
          switch (providerInfo.executionMode) {
            case 'native':
              transpilationError = this.errorHandler.handleNativeError(
                error instanceof Error ? error : new Error('Unknown native error'),
                providerInfo.name,
                request
              );
              break;
            case 'webassembly':
              transpilationError = this.errorHandler.handleWasmError(
                error instanceof Error ? error : new Error('Unknown WASM error'),
                undefined,
                request
              );
              break;
            case 'babel':
              transpilationError = this.errorHandler.handleBabelError(
                error instanceof Error ? error : new Error('Unknown Babel error'),
                {},
                request
              );
              break;
            default:
              transpilationError = new TranspilationError(
                TranspilationErrorCode.UNKNOWN_ERROR,
                `Provider error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { originalError: error instanceof Error ? error : new Error(String(error)) },
                [],
                true,
                request
              );
          }
        }

        providerErrors.push(transpilationError);

        // Record failure and move to next provider
        const providerError: ProviderError = Object.assign(
          new Error(transpilationError.message),
          {
            code: transpilationError.code,
            category: 'transpilation' as const,
            recoverable: transpilationError.recoverable || true,
            providerData: {
              provider: providerInfo.name,
              executionMode: providerInfo.executionMode
            }
          }
        );
        providerError.name = 'ProviderError';
        this.fallbackChain.recordFailure(provider, providerError);

        logger.warn('Provider failed, trying next in chain', {
          provider: providerInfo.executionMode,
          error: transpilationError.code,
          message: transpilationError.message,
          filename: request.filename,
          framework: request.framework
        });
      }
    }

    // All providers failed - create fallback chain exhaustion error
    const exhaustionError = this.errorHandler.handleFallbackChainExhaustion(providerErrors, request);
    throw exhaustionError;
  }

  private async cacheResult(
    cacheKey: string,
    result: TranspilationResult,
    originalRequest: TranspilationRequest
  ): Promise<void> {
    try {
      await this.cache.set(cacheKey, result, {
        originalRequest,
        framework: originalRequest.framework,
        executionMode: result.executionMode || 'unknown',
        originalDuration: result.duration || 0,
        sourceHash: cacheKey.substring(0, 16), // Use part of cache key as hash
        optionsHash: this.hashOptions(originalRequest.options),
        version: 1,
        ttl: 60 * 60 * 1000 // 1 hour TTL
      });
    } catch (error) {
      // Cache errors should not fail the transpilation
    }
  }

  private hashOptions(options: any): string {
    if (!options) return 'no-options';
    return JSON.stringify(options).substring(0, 16);
  }

  private updateMetrics(duration: number, success: boolean): void {
    this.metrics.totalResponseTime += duration;

    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
  }

  private initializeMetrics(): ServiceMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
      providerUsage: {} as Record<ExecutionMode, number>,
      frameworkUsage: {} as Record<ArtifactFramework, number>,
      startTime: new Date()
    };
  }

  /**
   * Get error metrics for monitoring and debugging
   * Maps to error tracking and system health monitoring
   */
  getErrorMetrics() {
    return this.errorHandler.getMetrics();
  }

  /**
   * Get recent error history for debugging
   */
  getErrorHistory(limit: number = 10) {
    return this.errorHandler.getErrorHistory(limit);
  }

  /**
   * Generate comprehensive error report
   */
  generateErrorReport() {
    return this.errorHandler.generateErrorReport();
  }

  /**
   * Reset error tracking (useful for testing)
   */
  resetErrorTracking(): void {
    this.errorHandler.reset();
    logger.info('Error tracking reset');
  }
}