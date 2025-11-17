/**
 * Error Handler for Transpilation Service
 * Centralizes error processing, logging, and reporting
 * Feature: 003-transpiler-service-rearchitecture
 */

import { loggerService } from '@logger';
import type { TranspilationRequest, ExecutionMode, ArtifactFramework } from '../ITranspilationService';
import { TranspilationError, TranspilationErrorCode } from './TranspilationError';

const logger = loggerService.withContext('TranspilationErrorHandler');

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCode: Record<TranspilationErrorCode, number>;
  errorsByProvider: Record<ExecutionMode, number>;
  errorsByFramework: Record<ArtifactFramework, number>;
  recoverableErrors: number;
  nonRecoverableErrors: number;
  lastError?: {
    code: TranspilationErrorCode;
    timestamp: Date;
    provider?: ExecutionMode;
  };
}

export class TranspilationErrorHandler {
  private metrics: ErrorMetrics = {
    totalErrors: 0,
    errorsByCode: {} as Record<TranspilationErrorCode, number>,
    errorsByProvider: {} as Record<ExecutionMode, number>,
    errorsByFramework: {} as Record<ArtifactFramework, number>,
    recoverableErrors: 0,
    nonRecoverableErrors: 0
  };

  private errorHistory: TranspilationError[] = [];
  private readonly maxHistorySize: number = 100;

  constructor() {
    // Initialize error code counters
    Object.values(TranspilationErrorCode).forEach(code => {
      this.metrics.errorsByCode[code] = 0;
    });
  }

  /**
   * Handle and process a transpilation error
   * Logs error, updates metrics, and determines next action
   */
  handleError(error: TranspilationError): {
    shouldRetry: boolean;
    shouldFallback: boolean;
    shouldAbort: boolean;
    nextActions: string[];
  } {
    // Update metrics
    this.updateMetrics(error);

    // Add to history
    this.addToHistory(error);

    // Log error with appropriate level
    this.logError(error);

    // Determine recovery strategy
    return this.determineRecoveryStrategy(error);
  }

  /**
   * Handle native binary errors with specific logic
   */
  handleNativeError(
    error: Error,
    binaryPath: string,
    request: TranspilationRequest
  ): TranspilationError {
    const transpilationError = TranspilationError.fromNativeBinaryError(error, binaryPath, request);

    logger.error('Native esbuild error occurred', {
      code: transpilationError.code,
      binaryPath,
      filename: request.filename,
      framework: request.framework,
      originalError: error.message
    });

    return transpilationError;
  }

  /**
   * Handle WebAssembly errors with memory context
   */
  handleWasmError(
    error: Error,
    memoryUsage: number | undefined,
    request: TranspilationRequest
  ): TranspilationError {
    const transpilationError = TranspilationError.fromWasmError(
      error,
      { memoryUsage },
      request
    );

    logger.error('WebAssembly esbuild error occurred', {
      code: transpilationError.code,
      memoryUsage,
      filename: request.filename,
      framework: request.framework,
      originalError: error.message
    });

    return transpilationError;
  }

  /**
   * Handle Babel errors with configuration context
   */
  handleBabelError(
    error: Error,
    context: { preset?: string; plugin?: string },
    request: TranspilationRequest
  ): TranspilationError {
    const transpilationError = TranspilationError.fromBabelError(error, context, request);

    logger.error('Babel transpilation error occurred', {
      code: transpilationError.code,
      preset: context.preset,
      plugin: context.plugin,
      filename: request.filename,
      framework: request.framework,
      originalError: error.message
    });

    return transpilationError;
  }

  /**
   * Handle framework-specific errors
   */
  handleFrameworkError(
    framework: ArtifactFramework,
    stage: 'validation' | 'preprocessing' | 'postprocessing',
    error: Error,
    request: TranspilationRequest
  ): TranspilationError {
    const transpilationError = TranspilationError.fromFrameworkError(
      framework,
      stage,
      error,
      request
    );

    logger.error('Framework handler error occurred', {
      code: transpilationError.code,
      framework,
      stage,
      filename: request.filename,
      originalError: error.message
    });

    return transpilationError;
  }

  /**
   * Handle validation errors (input, configuration, etc.)
   */
  handleValidationError(
    code: TranspilationErrorCode,
    message: string,
    context: any = {},
    request?: TranspilationRequest
  ): TranspilationError {
    const suggestions = this.getValidationSuggestions(code);

    const transpilationError = new TranspilationError(
      code,
      message,
      context,
      suggestions,
      false, // Validation errors are typically not recoverable
      request
    );

    logger.warn('Validation error occurred', {
      code,
      message,
      filename: request?.filename,
      framework: request?.framework
    });

    return transpilationError;
  }

  /**
   * Handle performance threshold violations
   */
  handlePerformanceError(
    provider: ExecutionMode,
    actualTime: number,
    targetTime: number,
    request: TranspilationRequest
  ): TranspilationError {
    const transpilationError = TranspilationError.fromPerformanceViolation(
      provider,
      actualTime,
      targetTime,
      request
    );

    logger.warn('Performance threshold exceeded', {
      code: transpilationError.code,
      provider,
      actualTime,
      targetTime,
      filename: request.filename,
      framework: request.framework,
      codeSize: request.code.length
    });

    return transpilationError;
  }

  /**
   * Create fallback chain exhaustion error
   */
  handleFallbackChainExhaustion(
    errors: TranspilationError[],
    request: TranspilationRequest
  ): TranspilationError {
    const transpilationError = TranspilationError.fromFallbackChainExhaustion(errors, request);

    logger.error('All transpilation providers failed', {
      code: transpilationError.code,
      filename: request.filename,
      framework: request.framework,
      codeSize: request.code.length,
      providerCount: errors.length,
      lastProviderError: errors[errors.length - 1]?.code
    });

    return transpilationError;
  }

  /**
   * Get error metrics for monitoring
   */
  getMetrics(): ErrorMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent error history
   */
  getErrorHistory(limit: number = 10): TranspilationError[] {
    return this.errorHistory.slice(-limit);
  }

  /**
   * Clear error history and reset metrics
   */
  reset(): void {
    this.errorHistory = [];
    this.metrics = {
      totalErrors: 0,
      errorsByCode: {} as Record<TranspilationErrorCode, number>,
      errorsByProvider: {} as Record<ExecutionMode, number>,
      errorsByFramework: {} as Record<ArtifactFramework, number>,
      recoverableErrors: 0,
      nonRecoverableErrors: 0
    };

    // Reinitialize counters
    Object.values(TranspilationErrorCode).forEach(code => {
      this.metrics.errorsByCode[code] = 0;
    });

    logger.info('Error handler metrics reset');
  }

  /**
   * Generate error report for debugging
   */
  generateErrorReport(): {
    summary: ErrorMetrics;
    recentErrors: Array<{
      code: TranspilationErrorCode;
      message: string;
      timestamp: string;
      provider?: ExecutionMode;
      framework?: ArtifactFramework;
      recoverable: boolean;
    }>;
    recommendations: string[];
  } {
    const recentErrors = this.errorHistory.slice(-20).map(error => ({
      code: error.code,
      message: error.message,
      timestamp: error.timestamp.toISOString(),
      provider: error.context.provider,
      framework: error.context.framework,
      recoverable: error.recoverable
    }));

    const recommendations = this.generateRecommendations();

    return {
      summary: this.getMetrics(),
      recentErrors,
      recommendations
    };
  }

  // Private helper methods

  private updateMetrics(error: TranspilationError): void {
    this.metrics.totalErrors++;
    this.metrics.errorsByCode[error.code]++;

    if (error.context.provider) {
      this.metrics.errorsByProvider[error.context.provider] =
        (this.metrics.errorsByProvider[error.context.provider] || 0) + 1;
    }

    if (error.context.framework) {
      this.metrics.errorsByFramework[error.context.framework] =
        (this.metrics.errorsByFramework[error.context.framework] || 0) + 1;
    }

    if (error.recoverable) {
      this.metrics.recoverableErrors++;
    } else {
      this.metrics.nonRecoverableErrors++;
    }

    this.metrics.lastError = {
      code: error.code,
      timestamp: error.timestamp,
      provider: error.context.provider
    };
  }

  private addToHistory(error: TranspilationError): void {
    this.errorHistory.push(error);

    // Trim history if it exceeds max size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  private logError(error: TranspilationError): void {
    const logContext = {
      code: error.code,
      provider: error.context.provider,
      framework: error.context.framework,
      filename: error.context.filename,
      codeSize: error.context.codeSize,
      recoverable: error.recoverable,
      suggestions: error.suggestions.length
    };

    if (error.recoverable) {
      logger.warn('Recoverable transpilation error', logContext);
    } else {
      logger.error('Non-recoverable transpilation error', logContext);
    }

    // Log detailed context for debugging
    if (error.context.originalError) {
      logger.debug('Original error details', {
        originalMessage: error.context.originalError.message,
        originalStack: error.context.originalError.stack
      });
    }
  }

  private determineRecoveryStrategy(error: TranspilationError): {
    shouldRetry: boolean;
    shouldFallback: boolean;
    shouldAbort: boolean;
    nextActions: string[];
  } {
    const nextActions: string[] = [];

    // Non-recoverable errors should abort
    if (!error.recoverable) {
      return {
        shouldRetry: false,
        shouldFallback: false,
        shouldAbort: true,
        nextActions: ['report_error', 'cleanup_resources']
      };
    }

    // Determine strategy based on error type
    switch (error.code) {
      case TranspilationErrorCode.NATIVE_BINARY_NOT_FOUND:
      case TranspilationErrorCode.NATIVE_BINARY_PERMISSION_DENIED:
        nextActions.push('fallback_to_wasm');
        return { shouldRetry: false, shouldFallback: true, shouldAbort: false, nextActions };

      case TranspilationErrorCode.WASM_INITIALIZATION_FAILED:
      case TranspilationErrorCode.WASM_MEMORY_LIMIT_EXCEEDED:
        nextActions.push('fallback_to_babel');
        return { shouldRetry: false, shouldFallback: true, shouldAbort: false, nextActions };

      case TranspilationErrorCode.NATIVE_BINARY_TIMEOUT:
      case TranspilationErrorCode.PERFORMANCE_THRESHOLD_EXCEEDED:
        nextActions.push('fallback_to_next_provider');
        return { shouldRetry: false, shouldFallback: true, shouldAbort: false, nextActions };

      case TranspilationErrorCode.TEMP_DIRECTORY_CREATION_FAILED:
      case TranspilationErrorCode.FILE_WRITE_FAILED:
        nextActions.push('retry_with_cleanup', 'create_new_temp_dir');
        return { shouldRetry: true, shouldFallback: false, shouldAbort: false, nextActions };

      default:
        nextActions.push('fallback_to_next_provider');
        return { shouldRetry: false, shouldFallback: true, shouldAbort: false, nextActions };
    }
  }

  private getValidationSuggestions(code: TranspilationErrorCode): Array<{
    action: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
  }> {
    switch (code) {
      case TranspilationErrorCode.INVALID_INPUT_CODE:
        return [
          {
            action: 'check_code_syntax',
            description: 'Verify the input code has valid syntax',
            priority: 'high'
          }
        ];

      case TranspilationErrorCode.CODE_TOO_LARGE:
        return [
          {
            action: 'split_code',
            description: 'Break the code into smaller modules',
            priority: 'high'
          }
        ];

      case TranspilationErrorCode.FRAMEWORK_NOT_SUPPORTED:
        return [
          {
            action: 'use_supported_framework',
            description: 'Use a supported framework (react, vue, svelte, solid)',
            priority: 'high'
          }
        ];

      default:
        return [];
    }
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const metrics = this.metrics;

    // High error rate recommendations
    if (metrics.totalErrors > 50) {
      recommendations.push('High error rate detected - consider reviewing input validation');
    }

    // Provider-specific recommendations
    const nativeErrors = metrics.errorsByProvider.native || 0;
    if (nativeErrors > metrics.totalErrors * 0.5) {
      recommendations.push('Native esbuild has high failure rate - check binary installation');
    }

    const wasmErrors = metrics.errorsByProvider.webassembly || 0;
    if (wasmErrors > metrics.totalErrors * 0.3) {
      recommendations.push('WebAssembly provider struggling - verify WASM support');
    }

    // Performance recommendations
    const performanceErrors = metrics.errorsByCode[TranspilationErrorCode.PERFORMANCE_THRESHOLD_EXCEEDED] || 0;
    if (performanceErrors > 5) {
      recommendations.push('Frequent performance issues - consider optimizing code complexity');
    }

    return recommendations;
  }
}