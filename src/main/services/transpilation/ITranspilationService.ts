/**
 * Core Transpilation Service Interface
 * Generated from Phase 1 design contracts
 * Feature: 003-transpiler-service-rearchitecture
 */

export interface ITranspilationService {
  /**
   * Initialize the transpilation service and detect available capabilities
   * Maps to FR-001: Service interface abstraction supporting three execution modes
   */
  initialize(): Promise<void>;

  /**
   * Transpile source code using appropriate framework handler and execution mode
   * Maps to FR-006: React.js transpilation and FR-007: Multi-framework support
   * Maps to FR-008: Graceful fallback implementation
   */
  transpile(request: TranspilationRequest): Promise<TranspilationResult>;

  /**
   * Query current service capabilities and available execution modes
   * Maps to FR-003: Platform-specific binary detection
   */
  getCapabilities(): ServiceCapabilities;

  /**
   * Clean up resources and dispose service instances
   * Maps to FR-014: Process isolation requirements
   */
  dispose(): Promise<void>;

  /**
   * Get current service status and health information
   * Maps to FR-010: Error reporting and debugging information
   */
  getStatus(): ServiceStatus;
}

export interface TranspilationRequest {
  /** Source code to transpile - must be non-empty (FR-015: Input validation) */
  code: string;

  /** Target framework for transpilation (FR-006, FR-007: Framework support) */
  framework: ArtifactFramework;

  /** Source language type (FR-011: TypeScript/JavaScript support) */
  language: 'typescript' | 'javascript';

  /** Optional filename for error reporting (FR-010: Error reporting) */
  filename?: string;

  /** Compilation options for customization */
  options?: TranspilationOptions;
}

export interface TranspilationResult {
  /** Transpiled JavaScript code output */
  code: string;

  /** Source map for debugging support */
  map?: string;

  /** Compilation warnings from transpiler */
  warnings?: TranspilationWarning[];

  /** Which execution mode was used (FR-001: Execution mode tracking) */
  executionMode: ExecutionMode;

  /** Transpilation duration in milliseconds (SC-001, SC-002: Performance tracking) */
  duration: number;

  /** Peak memory usage during transpilation */
  memoryUsage?: number;

  /** Whether result came from cache (FR-013: Result caching) */
  cacheHit: boolean;
}

export interface TranspilationOptions {
  /** Source map generation strategy */
  sourcemap?: 'inline' | 'external' | 'none';

  /** ECMAScript target version */
  target?: string; // e.g., 'es2020'

  /** Enable code minification */
  minify?: boolean;

  /** Target platform for transpilation */
  platform?: 'browser' | 'node';

  /** JSX transformation handling */
  jsx?: 'preserve' | 'transform';
}

export interface ServiceCapabilities {
  /** Native esbuild binary availability (FR-003: Binary detection) */
  nativeEsbuild: boolean;

  /** WebAssembly esbuild support (FR-008: Fallback chain) */
  webAssembly: boolean;

  /** Babel fallback transpiler support */
  babelFallback: boolean;

  /** List of supported frameworks (FR-006, FR-007) */
  supportedFrameworks: ArtifactFramework[];

  /** Platform-specific information */
  platformSupport: PlatformInfo;
}

export interface ServiceStatus {
  /** Current service state */
  state: 'uninitialized' | 'initializing' | 'ready' | 'error';

  /** Active transpilation provider */
  currentProvider: ExecutionMode;

  /** Service health indicators */
  health: {
    /** Number of successful transpilations */
    successCount: number;

    /** Number of failed transpilations */
    failureCount: number;

    /** Current success rate percentage */
    successRate: number;

    /** Average transpilation duration */
    averageDuration: number;
  };

  /** Last error information if state is 'error' */
  lastError?: TranspilationError;
}

export interface TranspilationWarning {
  /** Warning message text */
  message: string;

  /** Source location if available */
  location?: SourceLocation;

  /** Warning severity level */
  severity: 'info' | 'warning' | 'error';
}

export interface TranspilationError extends Error {
  /** Error code for programmatic handling */
  code: string;

  /** Source location where error occurred */
  location?: SourceLocation;

  /** Which execution mode failed */
  executionMode: ExecutionMode;

  /** Original underlying error */
  originalError?: Error;

  /** Suggested fix or next steps */
  suggestion?: string;
}

export interface SourceLocation {
  /** Source filename */
  file: string;

  /** Line number (1-based) */
  line: number;

  /** Column number (1-based) */
  column: number;

  /** Text content of the line */
  lineText: string;
}

export interface PlatformInfo {
  /** Current platform identifier */
  platform: NodeJS.Platform;

  /** Current architecture */
  architecture: string;

  /** Native binary availability */
  nativeBinaryAvailable: boolean;

  /** Binary path if available */
  binaryPath?: string;
}

export type ArtifactFramework = 'react' | 'vue' | 'svelte' | 'solid' | 'preact';
export type ExecutionMode = 'native' | 'webassembly' | 'babel';