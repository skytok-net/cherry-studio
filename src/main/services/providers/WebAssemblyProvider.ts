/**
 * WebAssembly Esbuild Provider Implementation
 * Cross-platform transpilation using esbuild-wasm
 * Feature: 003-transpiler-service-rearchitecture
 */

import type {
  IWebAssemblyProvider,
  ProviderInfo,
  ProviderError,
  ProviderResult,
  ProviderCapabilities,
  ProviderHealthStatus,
  WasmStatus
} from './ITranspilationProvider';
import type {
  TranspilationRequest
} from '../transpilation/ITranspilationService';
import type { FrameworkConfig } from '../transpilation/IFrameworkHandler';

// Dynamic import for esbuild-wasm to handle initialization
let esbuildWasm: any = null;

interface WasmMemoryMetrics {
  totalAttempts: number;
  successfulTranspilations: number;
  failedTranspilations: number;
  totalExecutionTime: number;
  currentMemoryUsage: number;
  totalMemoryUsed: number;
  peakMemoryUsage: number;
  memoryUtilization: number;
  initializationTime: number;
  uptime: number;
  isInitialized: boolean;
  optimizationCount: number;
  lastOptimization: number;
  slowestExecution: number;
  successRate: number;
  fastestExecution: number;
}

interface WasmInitializationOptions {
  wasmURL?: string;
  worker?: boolean;
  memoryLimit?: number;
  timeoutMs?: number;
  enableOptimizations?: boolean;
}

export class WebAssemblyProvider implements IWebAssemblyProvider {
  private isInitialized: boolean = false;
  private initializationTime: number = 0;
  private wasmMemoryMetrics: WasmMemoryMetrics;
  private initOptions: WasmInitializationOptions;

  constructor(options?: Partial<WasmInitializationOptions>) {
    this.initOptions = {
      wasmURL: undefined, // Let esbuild-wasm auto-detect
      worker: false, // Run in main thread for better performance
      memoryLimit: 64 * 1024 * 1024, // 64MB limit
      timeoutMs: 10000, // 10 second initialization timeout
      enableOptimizations: true,
      ...options
    };

    this.wasmMemoryMetrics = this.initializeMetrics();
  }

  /**
   * Get provider information and capabilities
   * Maps to WebAssembly esbuild characteristics
   */
  getProviderInfo(): ProviderInfo {
    return {
      name: 'WebAssembly Esbuild',
      executionMode: 'webassembly',
      version: this.getWasmVersion() || 'unknown',
      description: 'Cross-platform transpilation using esbuild-wasm',
      priority: 2 // Second priority after native
    };
  }

  /**
   * Check if WebAssembly esbuild is available
   * Maps to package availability detection
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to import esbuild-wasm
      if (!esbuildWasm) {
        esbuildWasm = await import('esbuild-wasm');
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Initialize WebAssembly esbuild
   * Maps to WASM module loading and setup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    const startTime = Date.now();

    try {
      // Import esbuild-wasm
      if (!esbuildWasm) {
        esbuildWasm = await import('esbuild-wasm');
      }

      // Initialize WebAssembly module with timeout
      await this.withTimeout(
        esbuildWasm.initialize({
          wasmURL: this.initOptions.wasmURL,
          worker: this.initOptions.worker
        }),
        this.initOptions.timeoutMs || 10000
      );

      this.initializationTime = Date.now() - startTime;
      this.isInitialized = true;

      // Update metrics
      this.wasmMemoryMetrics.initializationTime = this.initializationTime;
      this.wasmMemoryMetrics.isInitialized = true;

    } catch (error) {
      throw this.createProviderError(
        'WASM_INITIALIZATION_FAILED',
        `WebAssembly esbuild initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        true,
        'Install esbuild-wasm package or check WebAssembly support'
      );
    }
  }

  /**
   * Transpile code using WebAssembly esbuild
   * Maps to FR-001: Fallback transpilation (<500ms)
   */
  async transpile(request: TranspilationRequest, _config: FrameworkConfig): Promise<ProviderResult> {
    if (!this.isInitialized || !esbuildWasm) {
      throw this.createProviderError(
        'PROVIDER_NOT_INITIALIZED',
        'WebAssembly esbuild provider not initialized',
        true,
        'Call initialize() before transpiling'
      );
    }

    const startTime = Date.now();
    this.wasmMemoryMetrics.totalAttempts++;

    try {
      // Configure esbuild transform options
      const transformOptions = this.buildTransformOptions(request);

      // Track memory usage before transformation
      const memoryBefore = this.estimateMemoryUsage();

      // Execute WebAssembly transformation
      const result = await esbuildWasm.transform(request.code, transformOptions);

      // Track memory usage after transformation
      const memoryAfter = this.estimateMemoryUsage();
      const memoryUsed = memoryAfter - memoryBefore;

      const duration = Date.now() - startTime;
      this.updateMetrics(duration, memoryUsed, true);

      return {
        code: result.code,
        map: result.map || undefined,
        warnings: [],
        metadata: {
          startTime,
          endTime: Date.now(),
          duration,
          memoryUsage: memoryUsed,
          providerSpecific: {
            provider: 'wasm-esbuild',
            framework: request.framework,
            wasmVersion: this.getWasmVersion(),
            loader: transformOptions.loader
          }
        },
        success: true
      };

    } catch (error) {
      this.updateMetrics(Date.now() - startTime, 0, false);

      if (error instanceof Error) {
        throw this.createProviderError(
          'TRANSPILATION_FAILED',
          `WebAssembly esbuild transpilation failed: ${error.message}`,
          this.isRecoverableError(error),
          this.getSuggestionForError(error)
        );
      }

      throw this.createProviderError(
        'UNKNOWN_ERROR',
        'Unknown error during WebAssembly esbuild transpilation',
        false,
        'Check code syntax and WebAssembly module integrity'
      );
    }
  }


  /**
   * Get WebAssembly memory usage and performance metrics
   * Maps to WASM runtime monitoring
   */
  getWasmMemoryMetrics(): WasmMemoryMetrics {
    const currentMemory = this.estimateMemoryUsage();
    const currentTime = Date.now();

    return {
      ...this.wasmMemoryMetrics,
      currentMemoryUsage: currentMemory,
      memoryUtilization: this.initOptions.memoryLimit ? (currentMemory / this.initOptions.memoryLimit) * 100 : 0,
      successRate: this.wasmMemoryMetrics.totalAttempts > 0 ?
        this.wasmMemoryMetrics.successfulTranspilations / this.wasmMemoryMetrics.totalAttempts : 1.0,
      uptime: this.wasmMemoryMetrics.initializationTime ?
        currentTime - this.wasmMemoryMetrics.initializationTime : 0
    };
  }

  /**
   * Optimize WebAssembly memory usage
   * Maps to WASM performance tuning
   */
  async optimizeMemory(): Promise<void> {
    // In a real implementation, this might trigger garbage collection
    // or other WebAssembly-specific optimizations
    if (this.isInitialized) {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Update metrics after optimization
      this.wasmMemoryMetrics.lastOptimization = Date.now();
      this.wasmMemoryMetrics.optimizationCount++;
    }
  }

  /**
   * Cleanup provider resources
   * Maps to proper WebAssembly module cleanup
   */
  async getWasmStatus(): Promise<WasmStatus> {
    return {
      loaded: this.isInitialized,
      version: this.getWasmVersion(),
      initializedAt: this.isInitialized ? new Date(Date.now() - this.initializationTime) : undefined,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  async initializeWasm(): Promise<void> {
    return this.initialize();
  }

  getCapabilities(): ProviderCapabilities {
    return {
      maxCodeSize: 20 * 1024 * 1024, // 20MB
      supportedFrameworks: ['react', 'vue', 'svelte', 'solid'],
      supportsSourceMaps: true,
      supportsIncremental: false,
      performance: {
        expectedDuration: 180,
        maxDuration: 5000,
        expectedMemoryUsage: 64 * 1024 * 1024, // 64MB
        maxMemoryUsage: 200 * 1024 * 1024, // 200MB
        initializationTime: 1000
      },
      limitations: [
        'Higher memory usage than native binary',
        'Initialization overhead on first use',
        'Limited by WebAssembly runtime constraints'
      ]
    };
  }

  getHealthStatus(): ProviderHealthStatus {
    const totalAttempts = this.wasmMemoryMetrics.totalAttempts;
    const successCount = this.wasmMemoryMetrics.successfulTranspilations || 0;
    const successRate = totalAttempts > 0 ? successCount / totalAttempts : 1.0;
    const avgDuration = totalAttempts > 0 ? this.wasmMemoryMetrics.totalExecutionTime / totalAttempts : 0;

    return {
      status: this.isInitialized ? (successRate > 0.8 ? 'healthy' : 'degraded') : 'unhealthy',
      successRate,
      averageDuration: avgDuration,
      resourceUsage: {
        memoryUsage: this.estimateMemoryUsage()
      }
    };
  }

  async dispose(): Promise<void> {
    this.isInitialized = false;

    // Note: esbuild-wasm doesn't provide explicit cleanup methods
    // The WebAssembly module will be garbage collected naturally
    esbuildWasm = null;

    // Reset metrics
    this.wasmMemoryMetrics = this.initializeMetrics();
  }

  // Private helper methods

  private buildTransformOptions(request: TranspilationRequest): any {
    const options: any = {
      loader: this.determineLoader(request),
      target: 'es2018',
      format: 'esm',
      sourcemap: 'external',
      jsx: 'automatic'
    };

    // Framework-specific configurations
    if (request.framework === 'react') {
      options.jsx = 'automatic';
      options.jsxImportSource = 'react';
    } else if (request.framework === 'vue') {
      options.jsx = 'preserve'; // Vue has its own JSX handling
    }

    // Apply user-specified options
    if (request.options) {
      if (request.options.minify) {
        options.minify = true;
      }
      if (request.options.target) {
        options.target = request.options.target;
      }
      // jsxFactory removed - not in TranspilationOptions
      if (request.options.jsx) {
        options.jsx = request.options.jsx === 'preserve' ? 'preserve' : 'transform';
      }
    }

    return options;
  }

  private determineLoader(request: TranspilationRequest): string {
    if (request.filename) {
      const filename = request.filename.toLowerCase();
      if (filename.endsWith('.tsx')) return 'tsx';
      if (filename.endsWith('.ts')) return 'ts';
      if (filename.endsWith('.jsx')) return 'jsx';
    }

    // Detect by content
    if (request.code.includes('interface ') || request.code.includes('type ')) {
      return this.hasJSXContent(request.code) ? 'tsx' : 'ts';
    }

    return this.hasJSXContent(request.code) ? 'jsx' : 'js';
  }

  private hasJSXContent(code: string): boolean {
    return /<[A-Za-z][A-Za-z0-9]*/.test(code);
  }

  private estimateMemoryUsage(): number {
    // Rough estimation of WebAssembly memory usage
    // In a real implementation, this might use WebAssembly.Memory.grow() info
    const baseMemory = 8 * 1024 * 1024; // 8MB base
    const activeMemory = this.wasmMemoryMetrics.totalMemoryUsed / Math.max(1, this.wasmMemoryMetrics.totalAttempts);
    return Math.min(baseMemory + activeMemory, this.initOptions.memoryLimit || 64 * 1024 * 1024);
  }

  private getWasmVersion(): string | undefined {
    try {
      // Try to get version from esbuild-wasm package
      return esbuildWasm?.version || '0.19.0'; // fallback version
    } catch {
      return undefined;
    }
  }

  private isRecoverableError(error: Error): boolean {
    const recoverablePatterns = [
      /out of memory/i,
      /timeout/i,
      /initialization/i,
      /syntax error/i
    ];

    return recoverablePatterns.some(pattern => pattern.test(error.message));
  }

  private getSuggestionForError(error: Error): string {
    const message = error.message.toLowerCase();

    if (message.includes('out of memory')) {
      return 'Code may be too large for WebAssembly processing, try Babel fallback';
    }
    if (message.includes('timeout')) {
      return 'Increase timeout or try simpler code structure';
    }
    if (message.includes('initialization')) {
      return 'Reinstall esbuild-wasm package or check WebAssembly support';
    }
    if (message.includes('syntax')) {
      return 'Check code syntax - WebAssembly may be more strict than native';
    }

    return 'Check code complexity and WebAssembly module integrity';
  }

  private updateMetrics(duration: number, memoryUsed: number, success: boolean): void {
    this.wasmMemoryMetrics.totalExecutionTime += duration;
    this.wasmMemoryMetrics.totalMemoryUsed += memoryUsed;

    if (success) {
      this.wasmMemoryMetrics.successfulTranspilations++;
      this.wasmMemoryMetrics.fastestExecution = Math.min(
        this.wasmMemoryMetrics.fastestExecution,
        duration
      );
    } else {
      this.wasmMemoryMetrics.failedTranspilations++;
    }

    this.wasmMemoryMetrics.slowestExecution = Math.max(
      this.wasmMemoryMetrics.slowestExecution,
      duration
    );

    // Track peak memory usage
    this.wasmMemoryMetrics.peakMemoryUsage = Math.max(
      this.wasmMemoryMetrics.peakMemoryUsage,
      this.estimateMemoryUsage()
    );
  }

  private initializeMetrics(): WasmMemoryMetrics {
    return {
      totalAttempts: 0,
      successfulTranspilations: 0,
      failedTranspilations: 0,
      totalExecutionTime: 0,
      fastestExecution: Infinity,
      slowestExecution: 0,
      successRate: 1.0,
      currentMemoryUsage: 0,
      totalMemoryUsed: 0,
      peakMemoryUsage: 0,
      memoryUtilization: 0,
      initializationTime: 0,
      uptime: 0,
      isInitialized: false,
      optimizationCount: 0,
      lastOptimization: 0
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined): Promise<T> {
    const timeout = timeoutMs || 10000;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private createProviderError(
    code: string,
    message: string,
    recoverable: boolean,
    _suggestion?: string
  ): ProviderError {
    const error = new Error(message) as ProviderError;
    error.code = code;
    error.category = 'transpilation';
    error.recoverable = recoverable;
    error.providerData = {
      isInitialized: this.isInitialized,
      initializationTime: this.initializationTime,
      memoryUsage: this.estimateMemoryUsage(),
      memoryLimit: this.initOptions.memoryLimit
    };
    return error;
  }
}