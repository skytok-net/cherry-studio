/**
 * Structured Error System for Transpilation Service
 * Provides standardized error reporting across all providers
 * Feature: 003-transpiler-service-rearchitecture
 */

import type {
  ArtifactFramework,
  ExecutionMode,
  TranspilationRequest
} from '../ITranspilationService';

export enum TranspilationErrorCode {
  // Provider-specific errors
  NATIVE_BINARY_NOT_FOUND = 'NATIVE_BINARY_NOT_FOUND',
  NATIVE_BINARY_EXECUTION_FAILED = 'NATIVE_BINARY_EXECUTION_FAILED',
  NATIVE_BINARY_TIMEOUT = 'NATIVE_BINARY_TIMEOUT',
  NATIVE_BINARY_PERMISSION_DENIED = 'NATIVE_BINARY_PERMISSION_DENIED',

  WASM_INITIALIZATION_FAILED = 'WASM_INITIALIZATION_FAILED',
  WASM_EXECUTION_FAILED = 'WASM_EXECUTION_FAILED',
  WASM_MEMORY_LIMIT_EXCEEDED = 'WASM_MEMORY_LIMIT_EXCEEDED',
  WASM_MODULE_NOT_FOUND = 'WASM_MODULE_NOT_FOUND',

  BABEL_PRESET_NOT_FOUND = 'BABEL_PRESET_NOT_FOUND',
  BABEL_PLUGIN_ERROR = 'BABEL_PLUGIN_ERROR',
  BABEL_PARSING_ERROR = 'BABEL_PARSING_ERROR',
  BABEL_TRANSFORMATION_ERROR = 'BABEL_TRANSFORMATION_ERROR',

  // Framework-specific errors
  FRAMEWORK_NOT_SUPPORTED = 'FRAMEWORK_NOT_SUPPORTED',
  FRAMEWORK_HANDLER_NOT_FOUND = 'FRAMEWORK_HANDLER_NOT_FOUND',
  FRAMEWORK_VALIDATION_FAILED = 'FRAMEWORK_VALIDATION_FAILED',
  FRAMEWORK_PREPROCESSING_FAILED = 'FRAMEWORK_PREPROCESSING_FAILED',
  FRAMEWORK_POSTPROCESSING_FAILED = 'FRAMEWORK_POSTPROCESSING_FAILED',

  // Input validation errors
  INVALID_INPUT_CODE = 'INVALID_INPUT_CODE',
  INVALID_FILENAME = 'INVALID_FILENAME',
  INVALID_FRAMEWORK = 'INVALID_FRAMEWORK',
  INVALID_LANGUAGE = 'INVALID_LANGUAGE',
  CODE_TOO_LARGE = 'CODE_TOO_LARGE',

  // System errors
  TEMP_DIRECTORY_CREATION_FAILED = 'TEMP_DIRECTORY_CREATION_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  CACHE_ERROR = 'CACHE_ERROR',
  INITIALIZATION_FAILED = 'INITIALIZATION_FAILED',

  // Fallback chain errors
  ALL_PROVIDERS_FAILED = 'ALL_PROVIDERS_FAILED',
  FALLBACK_CHAIN_EXHAUSTED = 'FALLBACK_CHAIN_EXHAUSTED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',

  // Performance errors
  PERFORMANCE_THRESHOLD_EXCEEDED = 'PERFORMANCE_THRESHOLD_EXCEEDED',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  TIMEOUT_EXCEEDED = 'TIMEOUT_EXCEEDED',

  // Unknown/Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface TranspilationErrorContext {
  provider?: ExecutionMode;
  framework?: ArtifactFramework;
  filename?: string;
  codeSize?: number;
  duration?: number;
  memoryUsage?: number;
  binaryPath?: string;
  tempDirectory?: string;
  stackTrace?: string;
  originalError?: Error;
  metadata?: Record<string, any>;
}

export interface TranspilationErrorSuggestion {
  action: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  automated?: boolean;
}

export class TranspilationError extends Error {
  public readonly code: TranspilationErrorCode;
  public readonly context: TranspilationErrorContext;
  public readonly suggestions: TranspilationErrorSuggestion[];
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly request?: TranspilationRequest;

  constructor(
    code: TranspilationErrorCode,
    message: string,
    context: TranspilationErrorContext = {},
    suggestions: TranspilationErrorSuggestion[] = [],
    recoverable: boolean = true,
    request?: TranspilationRequest
  ) {
    super(message);
    this.name = 'TranspilationError';
    this.code = code;
    this.context = context;
    this.suggestions = suggestions;
    this.timestamp = new Date();
    this.recoverable = recoverable;
    this.request = request;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TranspilationError);
    }
  }

  /**
   * Create error from native binary execution failure
   */
  static fromNativeBinaryError(
    error: Error,
    binaryPath: string,
    request?: TranspilationRequest
  ): TranspilationError {
    let code: TranspilationErrorCode;
    let suggestions: TranspilationErrorSuggestion[] = [];

    if (error.message.includes('ENOENT')) {
      code = TranspilationErrorCode.NATIVE_BINARY_NOT_FOUND;
      suggestions = [
        {
          action: 'verify_binary_installation',
          description: 'Check if esbuild binary is properly installed and accessible',
          priority: 'high'
        },
        {
          action: 'check_path_permissions',
          description: 'Verify PATH environment variable includes binary location',
          priority: 'medium'
        }
      ];
    } else if (error.message.includes('EACCES')) {
      code = TranspilationErrorCode.NATIVE_BINARY_PERMISSION_DENIED;
      suggestions = [
        {
          action: 'fix_permissions',
          description: 'Update binary file permissions to be executable',
          priority: 'high'
        }
      ];
    } else if (error.message.includes('timeout')) {
      code = TranspilationErrorCode.NATIVE_BINARY_TIMEOUT;
      suggestions = [
        {
          action: 'reduce_code_complexity',
          description: 'Consider simplifying the code or splitting into smaller chunks',
          priority: 'medium'
        },
        {
          action: 'increase_timeout',
          description: 'Increase timeout configuration for complex transpilation',
          priority: 'low'
        }
      ];
    } else {
      code = TranspilationErrorCode.NATIVE_BINARY_EXECUTION_FAILED;
    }

    return new TranspilationError(
      code,
      `Native esbuild execution failed: ${error.message}`,
      {
        provider: 'native',
        binaryPath,
        originalError: error,
        stackTrace: error.stack
      },
      suggestions,
      true,
      request
    );
  }

  /**
   * Create error from WebAssembly execution failure
   */
  static fromWasmError(
    error: Error,
    context: { memoryUsage?: number } = {},
    request?: TranspilationRequest
  ): TranspilationError {
    let code: TranspilationErrorCode;
    let suggestions: TranspilationErrorSuggestion[] = [];

    if (error.message.includes('memory')) {
      code = TranspilationErrorCode.WASM_MEMORY_LIMIT_EXCEEDED;
      suggestions = [
        {
          action: 'reduce_code_size',
          description: 'Split large files into smaller modules',
          priority: 'high'
        },
        {
          action: 'fallback_to_babel',
          description: 'Use Babel provider for large or complex files',
          priority: 'medium',
          automated: true
        }
      ];
    } else if (error.message.includes('initialization')) {
      code = TranspilationErrorCode.WASM_INITIALIZATION_FAILED;
      suggestions = [
        {
          action: 'check_wasm_support',
          description: 'Verify WebAssembly is supported in current environment',
          priority: 'high'
        },
        {
          action: 'clear_wasm_cache',
          description: 'Clear WebAssembly module cache and retry',
          priority: 'medium'
        }
      ];
    } else {
      code = TranspilationErrorCode.WASM_EXECUTION_FAILED;
    }

    return new TranspilationError(
      code,
      `WebAssembly esbuild execution failed: ${error.message}`,
      {
        provider: 'webassembly',
        memoryUsage: context.memoryUsage,
        originalError: error,
        stackTrace: error.stack
      },
      suggestions,
      true,
      request
    );
  }

  /**
   * Create error from Babel execution failure
   */
  static fromBabelError(
    error: Error,
    context: { preset?: string; plugin?: string } = {},
    request?: TranspilationRequest
  ): TranspilationError {
    let code: TranspilationErrorCode;
    let suggestions: TranspilationErrorSuggestion[] = [];

    if (error.message.includes('preset')) {
      code = TranspilationErrorCode.BABEL_PRESET_NOT_FOUND;
      suggestions = [
        {
          action: 'install_preset',
          description: `Install missing Babel preset: ${context.preset}`,
          priority: 'high'
        }
      ];
    } else if (error.message.includes('plugin')) {
      code = TranspilationErrorCode.BABEL_PLUGIN_ERROR;
      suggestions = [
        {
          action: 'check_plugin_config',
          description: `Verify Babel plugin configuration: ${context.plugin}`,
          priority: 'high'
        }
      ];
    } else if (error.message.includes('parse') || error.message.includes('syntax')) {
      code = TranspilationErrorCode.BABEL_PARSING_ERROR;
      suggestions = [
        {
          action: 'check_syntax',
          description: 'Review code for syntax errors',
          priority: 'high'
        },
        {
          action: 'update_babel_parser',
          description: 'Ensure Babel parser supports the syntax used',
          priority: 'medium'
        }
      ];
    } else {
      code = TranspilationErrorCode.BABEL_TRANSFORMATION_ERROR;
    }

    return new TranspilationError(
      code,
      `Babel transpilation failed: ${error.message}`,
      {
        provider: 'babel',
        originalError: error,
        stackTrace: error.stack,
        metadata: context
      },
      suggestions,
      false, // Babel is last resort, not recoverable
      request
    );
  }

  /**
   * Create error for framework handling failures
   */
  static fromFrameworkError(
    framework: ArtifactFramework,
    stage: 'validation' | 'preprocessing' | 'postprocessing',
    error: Error,
    request?: TranspilationRequest
  ): TranspilationError {
    const codeMap = {
      validation: TranspilationErrorCode.FRAMEWORK_VALIDATION_FAILED,
      preprocessing: TranspilationErrorCode.FRAMEWORK_PREPROCESSING_FAILED,
      postprocessing: TranspilationErrorCode.FRAMEWORK_POSTPROCESSING_FAILED
    };

    const suggestions: TranspilationErrorSuggestion[] = [
      {
        action: 'check_framework_syntax',
        description: `Verify ${framework} syntax and patterns`,
        priority: 'high'
      },
      {
        action: 'review_framework_config',
        description: `Check ${framework} configuration and imports`,
        priority: 'medium'
      }
    ];

    return new TranspilationError(
      codeMap[stage],
      `${framework} ${stage} failed: ${error.message}`,
      {
        framework,
        originalError: error,
        stackTrace: error.stack
      },
      suggestions,
      true,
      request
    );
  }

  /**
   * Create error when all providers fail
   */
  static fromFallbackChainExhaustion(
    errors: TranspilationError[],
    request: TranspilationRequest
  ): TranspilationError {
    const providerErrors = errors.map(e => `${e.context.provider}: ${e.message}`).join('; ');

    const suggestions: TranspilationErrorSuggestion[] = [
      {
        action: 'simplify_code',
        description: 'Try simplifying the code or breaking it into smaller parts',
        priority: 'high'
      },
      {
        action: 'check_system_requirements',
        description: 'Verify system has required dependencies and permissions',
        priority: 'high'
      },
      {
        action: 'review_error_details',
        description: 'Check individual provider errors for specific solutions',
        priority: 'medium'
      }
    ];

    return new TranspilationError(
      TranspilationErrorCode.ALL_PROVIDERS_FAILED,
      `All transpilation providers failed. ${providerErrors}`,
      {
        framework: request.framework,
        filename: request.filename,
        codeSize: request.code.length,
        metadata: { providerErrors: errors.map(e => ({ code: e.code, message: e.message })) }
      },
      suggestions,
      false,
      request
    );
  }

  /**
   * Create error for performance threshold violations
   */
  static fromPerformanceViolation(
    provider: ExecutionMode,
    actualTime: number,
    targetTime: number,
    request: TranspilationRequest
  ): TranspilationError {
    const suggestions: TranspilationErrorSuggestion[] = [
      {
        action: 'reduce_code_complexity',
        description: 'Consider simplifying code or breaking into smaller modules',
        priority: 'medium'
      },
      {
        action: 'review_system_performance',
        description: 'Check system resources and load',
        priority: 'low'
      }
    ];

    return new TranspilationError(
      TranspilationErrorCode.PERFORMANCE_THRESHOLD_EXCEEDED,
      `${provider} provider exceeded performance threshold: ${actualTime}ms > ${targetTime}ms`,
      {
        provider,
        duration: actualTime,
        framework: request.framework,
        codeSize: request.code.length,
        metadata: { targetTime, actualTime }
      },
      suggestions,
      true,
      request
    );
  }

  /**
   * Convert to structured error report
   */
  toReport(): {
    error: {
      code: string;
      message: string;
      timestamp: string;
      recoverable: boolean;
    };
    context: TranspilationErrorContext;
    suggestions: TranspilationErrorSuggestion[];
    request?: {
      framework: ArtifactFramework;
      filename?: string;
      codeSize: number;
    };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp.toISOString(),
        recoverable: this.recoverable
      },
      context: this.context,
      suggestions: this.suggestions,
      request: this.request ? {
        framework: this.request.framework,
        filename: this.request.filename,
        codeSize: this.request.code.length
      } : undefined
    };
  }

  /**
   * Get user-friendly error message with suggestions
   */
  getUserMessage(): string {
    const baseMessage = this.message;
    const highPrioritySuggestions = this.suggestions
      .filter(s => s.priority === 'high')
      .map(s => `• ${s.description}`)
      .join('\n');

    if (highPrioritySuggestions) {
      return `${baseMessage}\n\nSuggested actions:\n${highPrioritySuggestions}`;
    }

    return baseMessage;
  }
}