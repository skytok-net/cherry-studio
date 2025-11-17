/**
 * Framework Handler Interface
 * Generated from Phase 1 design contracts
 * Feature: 003-transpiler-service-rearchitecture
 */

export interface IFrameworkHandler {
  /**
   * Check if this handler supports the specified framework
   * Maps to FR-006: React.js support and FR-007: Multi-framework support
   */
  canHandle(framework: ArtifactFramework): boolean;

  /**
   * Configure esbuild options for this framework
   * Maps to FR-011: TypeScript/JavaScript and JSX handling
   */
  configure(options: TranspilationOptions): FrameworkConfig;

  /**
   * Preprocess source code before transpilation
   * Maps to framework-specific transformations
   */
  preprocess(code: string, filename?: string): PreprocessResult;

  /**
   * Post-process transpilation results
   * Maps to FR-009: Component bundle handling
   */
  postprocess(result: RawTranspilationResult): TranspilationResult;

  /**
   * Get framework-specific capabilities and requirements
   * Maps to FR-010: Error reporting and debugging
   */
  getCapabilities(): FrameworkCapabilities;

  /**
   * Validate framework-specific code patterns
   * Maps to FR-015: Input validation
   */
  validateCode(code: string): ValidationResult;
}

export interface FrameworkConfig {
  /** Framework identifier */
  framework: ArtifactFramework;

  /** esbuild plugins required for this framework */
  plugins: EsbuildPlugin[];

  /** esbuild configuration options */
  esbuildOptions: EsbuildOptions;

  /** Framework-specific loader configuration */
  loaders: Record<string, string>;

  /** External dependencies to exclude from bundling */
  externals: string[];

  /** Define replacements for build-time constants */
  define: Record<string, string>;
}

export interface PreprocessResult {
  /** Transformed source code */
  code: string;

  /** Whether code was modified */
  modified: boolean;

  /** Preprocessing warnings */
  warnings?: PreprocessWarning[];

  /** Generated source map if applicable */
  sourceMap?: string;
}

export interface RawTranspilationResult {
  /** Raw transpiled code from esbuild */
  code: string;

  /** Source map from transpiler */
  map?: string;

  /** Raw warnings from transpiler */
  warnings: any[];

  /** Transpilation metadata */
  metadata: TranspilationMetadata;
}

export interface FrameworkCapabilities {
  /** Framework identifier */
  framework: ArtifactFramework;

  /** Supported file extensions */
  supportedExtensions: string[];

  /** Whether TypeScript is supported */
  supportsTypeScript: boolean;

  /** Whether JSX is supported */
  supportsJSX: boolean;

  /** Whether CSS imports are supported */
  supportsCSSImports: boolean;

  /** Whether asset imports are supported */
  supportsAssetImports: boolean;

  /** Required external dependencies */
  requiredExternals: string[];

  /** Framework-specific features */
  features: FrameworkFeature[];
}

export interface ValidationResult {
  /** Whether code passed validation */
  isValid: boolean;

  /** Validation errors */
  errors: ValidationError[];

  /** Validation warnings */
  warnings: ValidationWarning[];

  /** Suggested fixes */
  suggestions: ValidationSuggestion[];
}

export interface PreprocessWarning {
  /** Warning message */
  message: string;

  /** Source location */
  location?: SourceLocation;

  /** Warning type */
  type: 'syntax' | 'import' | 'framework' | 'performance';
}

export interface ValidationError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Source location */
  location?: SourceLocation;

  /** Error severity */
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  /** Warning code */
  code: string;

  /** Warning message */
  message: string;

  /** Source location */
  location?: SourceLocation;
}

export interface ValidationSuggestion {
  /** Suggestion message */
  message: string;

  /** Source location to apply fix */
  location?: SourceLocation;

  /** Suggested code replacement */
  replacement?: string;

  /** Fix confidence level */
  confidence: 'high' | 'medium' | 'low';
}

export interface TranspilationMetadata {
  /** Transpilation start time */
  startTime: number;

  /** Transpilation end time */
  endTime: number;

  /** Input file size */
  inputSize: number;

  /** Output file size */
  outputSize: number;

  /** Number of dependencies analyzed */
  dependencyCount: number;

  /** Memory usage peak */
  memoryUsage?: number;
}

export interface EsbuildPlugin {
  /** Plugin name */
  name: string;

  /** Plugin setup function */
  setup: (build: any) => void;
}

export interface EsbuildOptions {
  /** Target JavaScript version */
  target?: string;

  /** Bundle format */
  format?: 'esm' | 'cjs' | 'iife';

  /** Whether to generate source maps */
  sourcemap?: boolean | 'inline' | 'external';

  /** Whether to minify output */
  minify?: boolean;

  /** Platform target */
  platform?: 'browser' | 'node' | 'neutral';

  /** JSX configuration */
  jsx?: 'transform' | 'preserve';

  /** JSX factory function */
  jsxFactory?: string;

  /** JSX fragment function */
  jsxFragment?: string;

  /** Entry points for bundling */
  entryPoints?: string[];
}

export type FrameworkFeature =
  | 'single-file-components'
  | 'css-modules'
  | 'styled-components'
  | 'hot-module-reload'
  | 'server-side-rendering'
  | 'static-generation'
  | 'code-splitting';

// Re-export types from main interface
export type { ArtifactFramework, TranspilationOptions, TranspilationResult, SourceLocation } from './ITranspilationService';