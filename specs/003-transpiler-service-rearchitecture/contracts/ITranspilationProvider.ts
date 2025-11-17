/**
 * Transpilation Provider Interface
 * Generated from Phase 1 design contracts
 * Feature: 003-transpiler-service-rearchitecture
 */

export interface ITranspilationProvider {
  /**
   * Get provider identifier and execution mode
   * Maps to FR-001: Three execution mode support
   */
  getProviderInfo(): ProviderInfo;

  /**
   * Initialize the transpilation provider
   * Maps to FR-008: Graceful fallback initialization
   */
  initialize(): Promise<void>;

  /**
   * Check if provider is available and ready for use
   * Maps to FR-003: Platform-specific availability detection
   */
  isAvailable(): Promise<boolean>;

  /**
   * Transpile source code using this provider
   * Maps to FR-012: Timeout mechanisms
   */
  transpile(request: TranspilationRequest, config: FrameworkConfig): Promise<ProviderResult>;

  /**
   * Get provider capabilities and limitations
   * Maps to FR-010: Error reporting and debugging
   */
  getCapabilities(): ProviderCapabilities;

  /**
   * Clean up provider resources
   * Maps to FR-014: Process isolation
   */
  dispose(): Promise<void>;

  /**
   * Get current provider health status
   * Maps to performance monitoring requirements
   */
  getHealthStatus(): ProviderHealthStatus;
}

export interface ProviderInfo {
  /** Provider identifier */
  name: string;

  /** Execution mode this provider implements */
  executionMode: ExecutionMode;

  /** Provider version */
  version: string;

  /** Provider description */
  description: string;

  /** Priority in fallback chain (lower = higher priority) */
  priority: number;
}

export interface ProviderResult {
  /** Transpiled JavaScript code */
  code: string;

  /** Generated source map */
  map?: string;

  /** Transpilation warnings */
  warnings: ProviderWarning[];

  /** Provider execution metadata */
  metadata: ProviderMetadata;

  /** Whether transpilation was successful */
  success: boolean;

  /** Error information if transpilation failed */
  error?: ProviderError;
}

export interface ProviderCapabilities {
  /** Maximum code size this provider can handle */
  maxCodeSize: number;

  /** Supported frameworks by this provider */
  supportedFrameworks: ArtifactFramework[];

  /** Whether provider supports source maps */
  supportsSourceMaps: boolean;

  /** Whether provider supports incremental compilation */
  supportsIncremental: boolean;

  /** Expected performance characteristics */
  performance: PerformanceCharacteristics;

  /** Provider-specific limitations */
  limitations: string[];
}

export interface ProviderHealthStatus {
  /** Provider current status */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

  /** Last successful transpilation timestamp */
  lastSuccess?: Date;

  /** Last failure timestamp */
  lastFailure?: Date;

  /** Recent success rate (0-1) */
  successRate: number;

  /** Average transpilation duration */
  averageDuration: number;

  /** Current resource usage */
  resourceUsage: ResourceUsage;

  /** Provider-specific health metrics */
  providerMetrics?: Record<string, any>;
}

export interface ProviderWarning {
  /** Warning message */
  message: string;

  /** Warning code for programmatic handling */
  code?: string;

  /** Source location if applicable */
  location?: SourceLocation;

  /** Warning severity */
  severity: 'info' | 'warning' | 'error';

  /** Provider-specific warning data */
  providerData?: any;
}

export interface ProviderMetadata {
  /** Transpilation start timestamp */
  startTime: number;

  /** Transpilation end timestamp */
  endTime: number;

  /** Duration in milliseconds */
  duration: number;

  /** Peak memory usage in bytes */
  memoryUsage?: number;

  /** Provider-specific metadata */
  providerSpecific: Record<string, any>;

  /** Process information */
  processInfo?: ProcessInfo;
}

export interface ProviderError extends Error {
  /** Provider error code */
  code: string;

  /** Error category */
  category: 'initialization' | 'transpilation' | 'timeout' | 'resource' | 'internal';

  /** Whether error is recoverable */
  recoverable: boolean;

  /** Suggested retry strategy */
  retryStrategy?: RetryStrategy;

  /** Provider-specific error data */
  providerData?: any;

  /** Original system error */
  originalError?: Error;
}

export interface ProcessInfo {
  /** Process ID if applicable */
  pid?: number;

  /** Process command if applicable */
  command?: string;

  /** Process exit code if applicable */
  exitCode?: number;

  /** Process stderr output */
  stderr?: string;

  /** Process stdout output */
  stdout?: string;
}

export interface PerformanceCharacteristics {
  /** Expected transpilation time for typical code */
  expectedDuration: number;

  /** Maximum reasonable duration before timeout */
  maxDuration: number;

  /** Expected memory usage */
  expectedMemoryUsage: number;

  /** Maximum memory usage before failure */
  maxMemoryUsage: number;

  /** Initialization overhead */
  initializationTime: number;
}

export interface ResourceUsage {
  /** Current memory usage in bytes */
  memoryUsage: number;

  /** CPU usage percentage */
  cpuUsage?: number;

  /** Number of active processes */
  processCount?: number;

  /** Number of open file handles */
  fileHandles?: number;
}

export interface RetryStrategy {
  /** Whether retry is recommended */
  shouldRetry: boolean;

  /** Recommended delay before retry */
  retryDelay: number;

  /** Maximum number of retries */
  maxRetries: number;

  /** Backoff strategy */
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
}

// Provider-specific interfaces for different execution modes

export interface INativeEsbuildProvider extends ITranspilationProvider {
  /**
   * Get native binary information
   * Maps to FR-004: Binary bundling and permissions
   */
  getBinaryInfo(): Promise<BinaryInfo>;

  /**
   * Execute esbuild binary with specific arguments
   * Maps to IPC communication requirements
   */
  executeBinary(args: string[], options: ExecutionOptions): Promise<ExecutionResult>;
}

export interface IWebAssemblyProvider extends ITranspilationProvider {
  /**
   * Get WebAssembly module status
   * Maps to WebAssembly execution context requirements
   */
  getWasmStatus(): Promise<WasmStatus>;

  /**
   * Initialize WebAssembly module
   * Maps to main process execution requirements
   */
  initializeWasm(): Promise<void>;
}

export interface IBabelProvider extends ITranspilationProvider {
  /**
   * Get Babel configuration
   * Maps to Babel fallback requirements
   */
  getBabelConfig(framework: ArtifactFramework): BabelConfig;

  /**
   * Transform code using Babel
   * Maps to final fallback transpilation
   */
  transformWithBabel(code: string, config: BabelConfig): Promise<BabelResult>;
}

export interface BinaryInfo {
  /** Binary file path */
  path: string;

  /** Binary version */
  version: string;

  /** Binary file size */
  size: number;

  /** Binary permissions */
  permissions: BinaryPermissions;

  /** Last modified timestamp */
  lastModified: Date;
}

export interface ExecutionOptions {
  /** Working directory */
  cwd?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Input to pass to stdin */
  input?: string;
}

export interface ExecutionResult {
  /** Exit code */
  exitCode: number;

  /** Stdout output */
  stdout: string;

  /** Stderr output */
  stderr: string;

  /** Execution duration */
  duration: number;

  /** Whether execution was successful */
  success: boolean;
}

export interface WasmStatus {
  /** Whether WASM module is loaded */
  loaded: boolean;

  /** WASM module version */
  version?: string;

  /** Initialization timestamp */
  initializedAt?: Date;

  /** Memory usage of WASM module */
  memoryUsage?: number;
}

export interface BabelConfig {
  /** Babel presets */
  presets: any[];

  /** Babel plugins */
  plugins: any[];

  /** Parser options */
  parserOpts?: any;

  /** Generator options */
  generatorOpts?: any;

  /** Source map options */
  sourceMaps?: boolean | 'inline' | 'both';
}

export interface BabelResult {
  /** Transformed code */
  code: string;

  /** Generated source map */
  map?: any;

  /** AST if requested */
  ast?: any;
}

// Re-export types from other interfaces
export type {
  ExecutionMode,
  ArtifactFramework,
  TranspilationRequest,
  SourceLocation,
  BinaryPermissions
} from './ITranspilationService';

export type { FrameworkConfig } from './IFrameworkHandler';