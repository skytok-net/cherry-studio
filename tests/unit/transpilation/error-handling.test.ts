/**
 * Error Handling System Tests
 * Validates structured transpilation error reporting and handling
 * Feature: 003-transpiler-service-rearchitecture
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranspilationError, TranspilationErrorCode } from '../../../src/main/services/transpilation/errors/TranspilationError';
import { TranspilationErrorHandler } from '../../../src/main/services/transpilation/errors/ErrorHandler';
import type { TranspilationRequest } from '../../../src/main/services/transpilation/ITranspilationService';

// Mock the logger service
vi.mock('@logger', () => ({
  loggerService: {
    withContext: vi.fn(() => ({
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    }))
  }
}));

describe('TranspilationError', () => {
  const mockRequest: TranspilationRequest = {
    code: 'const test = "hello";',
    framework: 'react',
    filename: 'test.jsx',
    language: 'javascript'
  };

  describe('Static Factory Methods', () => {
    it('should create native binary error with appropriate suggestions', () => {
      const originalError = new Error('ENOENT: no such file or directory');
      const error = TranspilationError.fromNativeBinaryError(
        originalError,
        '/usr/local/bin/esbuild',
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.NATIVE_BINARY_NOT_FOUND);
      expect(error.message).toContain('Native esbuild execution failed');
      expect(error.recoverable).toBe(true);
      expect(error.suggestions).toHaveLength(2);
      expect(error.suggestions[0].action).toBe('verify_binary_installation');
      expect(error.context.binaryPath).toBe('/usr/local/bin/esbuild');
    });

    it('should create WebAssembly error with memory context', () => {
      const originalError = new Error('Out of memory');
      const error = TranspilationError.fromWasmError(
        originalError,
        { memoryUsage: 1024 * 1024 * 100 }, // 100MB
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.WASM_MEMORY_LIMIT_EXCEEDED);
      expect(error.message).toContain('WebAssembly esbuild execution failed');
      expect(error.context.memoryUsage).toBe(1024 * 1024 * 100);
      expect(error.suggestions.some(s => s.action === 'reduce_code_size')).toBe(true);
    });

    it('should create Babel error with preset context', () => {
      const originalError = new Error('Cannot resolve preset "@babel/preset-react"');
      const error = TranspilationError.fromBabelError(
        originalError,
        { preset: '@babel/preset-react' },
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.BABEL_PRESET_NOT_FOUND);
      expect(error.recoverable).toBe(false); // Babel is last resort
      expect(error.suggestions[0].action).toBe('install_preset');
    });

    it('should create framework error with stage information', () => {
      const originalError = new Error('Invalid JSX syntax');
      const error = TranspilationError.fromFrameworkError(
        'react',
        'preprocessing',
        originalError,
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.FRAMEWORK_PREPROCESSING_FAILED);
      expect(error.context.framework).toBe('react');
      expect(error.message).toContain('react preprocessing failed');
    });

    it('should create fallback chain exhaustion error', () => {
      const nativeError = TranspilationError.fromNativeBinaryError(
        new Error('Binary not found'),
        '/bin/esbuild',
        mockRequest
      );
      const wasmError = TranspilationError.fromWasmError(
        new Error('WASM initialization failed'),
        {},
        mockRequest
      );

      const error = TranspilationError.fromFallbackChainExhaustion(
        [nativeError, wasmError],
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.ALL_PROVIDERS_FAILED);
      expect(error.recoverable).toBe(false);
      expect(error.message).toContain('All transpilation providers failed');
      expect(error.suggestions.some(s => s.action === 'simplify_code')).toBe(true);
    });

    it('should create performance violation error', () => {
      const error = TranspilationError.fromPerformanceViolation(
        'native',
        250, // actual time
        100, // target time
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.PERFORMANCE_THRESHOLD_EXCEEDED);
      expect(error.context.duration).toBe(250);
      expect(error.context.metadata?.targetTime).toBe(100);
      expect(error.message).toContain('exceeded performance threshold');
    });
  });

  describe('Error Reporting', () => {
    it('should generate structured error report', () => {
      const error = new TranspilationError(
        TranspilationErrorCode.BABEL_PARSING_ERROR,
        'Syntax error in code',
        { provider: 'babel', codeSize: 1024 },
        [{ action: 'check_syntax', description: 'Review syntax', priority: 'high' }],
        true,
        mockRequest
      );

      const report = error.toReport();

      expect(report.error.code).toBe(TranspilationErrorCode.BABEL_PARSING_ERROR);
      expect(report.error.recoverable).toBe(true);
      expect(report.context.provider).toBe('babel');
      expect(report.suggestions).toHaveLength(1);
      expect(report.request?.framework).toBe('react');
    });

    it('should generate user-friendly message with suggestions', () => {
      const error = new TranspilationError(
        TranspilationErrorCode.CODE_TOO_LARGE,
        'File size exceeds limit',
        {},
        [
          { action: 'split_files', description: 'Break into smaller files', priority: 'high' },
          { action: 'optimize', description: 'Optimize code', priority: 'medium' }
        ]
      );

      const userMessage = error.getUserMessage();

      expect(userMessage).toContain('File size exceeds limit');
      expect(userMessage).toContain('Break into smaller files');
      expect(userMessage).not.toContain('Optimize code'); // Only high priority shown
    });
  });
});

describe('TranspilationErrorHandler', () => {
  let errorHandler: TranspilationErrorHandler;
  const mockRequest: TranspilationRequest = {
    code: 'const test = "hello";',
    framework: 'react',
    filename: 'test.jsx',
    language: 'javascript'
  };

  beforeEach(() => {
    errorHandler = new TranspilationErrorHandler();
  });

  describe('Error Handling', () => {
    it('should handle and track errors correctly', () => {
      const error = new TranspilationError(
        TranspilationErrorCode.NATIVE_BINARY_NOT_FOUND,
        'Binary not found',
        { provider: 'native' },
        [],
        true,
        mockRequest
      );

      const strategy = errorHandler.handleError(error);

      expect(strategy.shouldFallback).toBe(true);
      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.nextActions).toContain('fallback_to_wasm');

      const metrics = errorHandler.getMetrics();
      expect(metrics.totalErrors).toBe(1);
      expect(metrics.errorsByProvider.native).toBe(1);
      expect(metrics.recoverableErrors).toBe(1);
    });

    it('should determine correct recovery strategy for different error types', () => {
      // Test native binary timeout
      const timeoutError = new TranspilationError(
        TranspilationErrorCode.NATIVE_BINARY_TIMEOUT,
        'Timeout',
        { provider: 'native' }
      );
      const timeoutStrategy = errorHandler.handleError(timeoutError);
      expect(timeoutStrategy.shouldFallback).toBe(true);
      expect(timeoutStrategy.nextActions).toContain('fallback_to_next_provider');

      // Test non-recoverable error
      const fatalError = new TranspilationError(
        TranspilationErrorCode.BABEL_TRANSFORMATION_ERROR,
        'Fatal error',
        { provider: 'babel' },
        [],
        false // non-recoverable
      );
      const fatalStrategy = errorHandler.handleError(fatalError);
      expect(fatalStrategy.shouldAbort).toBe(true);
      expect(fatalStrategy.shouldRetry).toBe(false);

      // Test retry-able error
      const retryError = new TranspilationError(
        TranspilationErrorCode.TEMP_DIRECTORY_CREATION_FAILED,
        'Temp dir failed',
        {},
        [],
        true
      );
      const retryStrategy = errorHandler.handleError(retryError);
      expect(retryStrategy.shouldRetry).toBe(true);
    });
  });

  describe('Error Metrics', () => {
    it('should track error metrics accurately', () => {
      // Add multiple errors
      const errors = [
        new TranspilationError(TranspilationErrorCode.NATIVE_BINARY_NOT_FOUND, 'Native error', { provider: 'native' }),
        new TranspilationError(TranspilationErrorCode.WASM_EXECUTION_FAILED, 'WASM error', { provider: 'wasm' }),
        new TranspilationError(TranspilationErrorCode.BABEL_PARSING_ERROR, 'Babel error', { provider: 'babel' })
      ];

      errors.forEach(error => errorHandler.handleError(error));

      const metrics = errorHandler.getMetrics();
      expect(metrics.totalErrors).toBe(3);
      expect(metrics.errorsByProvider.native).toBe(1);
      expect(metrics.errorsByProvider.wasm).toBe(1);
      expect(metrics.errorsByProvider.babel).toBe(1);
      expect(metrics.lastError?.code).toBe(TranspilationErrorCode.BABEL_PARSING_ERROR);
    });

    it('should provide error history', () => {
      const error = new TranspilationError(
        TranspilationErrorCode.FRAMEWORK_VALIDATION_FAILED,
        'Validation failed',
        { framework: 'react' }
      );

      errorHandler.handleError(error);

      const history = errorHandler.getErrorHistory(5);
      expect(history).toHaveLength(1);
      expect(history[0].code).toBe(TranspilationErrorCode.FRAMEWORK_VALIDATION_FAILED);
    });

    it('should generate comprehensive error report', () => {
      // Add various errors to get meaningful report
      const errors = [
        new TranspilationError(TranspilationErrorCode.PERFORMANCE_THRESHOLD_EXCEEDED, 'Performance issue', { provider: 'native' }),
        new TranspilationError(TranspilationErrorCode.PERFORMANCE_THRESHOLD_EXCEEDED, 'Performance issue 2', { provider: 'native' }),
        new TranspilationError(TranspilationErrorCode.WASM_MEMORY_LIMIT_EXCEEDED, 'Memory issue', { provider: 'wasm' })
      ];

      errors.forEach(error => errorHandler.handleError(error));

      const report = errorHandler.generateErrorReport();

      expect(report.summary.totalErrors).toBe(3);
      expect(report.recentErrors).toHaveLength(3);
      expect(report.recommendations).toContain('Frequent performance issues - consider optimizing code complexity');
    });

    it('should reset metrics correctly', () => {
      const error = new TranspilationError(
        TranspilationErrorCode.UNKNOWN_ERROR,
        'Test error'
      );

      errorHandler.handleError(error);
      expect(errorHandler.getMetrics().totalErrors).toBe(1);

      errorHandler.reset();
      expect(errorHandler.getMetrics().totalErrors).toBe(0);
      expect(errorHandler.getErrorHistory()).toHaveLength(0);
    });
  });

  describe('Provider-Specific Error Handling', () => {
    it('should handle native binary errors with context', () => {
      const originalError = new Error('EACCES: permission denied');
      const error = errorHandler.handleNativeError(originalError, '/bin/esbuild', mockRequest);

      expect(error.code).toBe(TranspilationErrorCode.NATIVE_BINARY_PERMISSION_DENIED);
      expect(error.context.binaryPath).toBe('/bin/esbuild');
      expect(error.suggestions.some(s => s.action === 'fix_permissions')).toBe(true);
    });

    it('should handle WebAssembly errors with memory tracking', () => {
      const originalError = new Error('WebAssembly memory allocation failed');
      const error = errorHandler.handleWasmError(originalError, 128 * 1024 * 1024, mockRequest);

      expect(error.code).toBe(TranspilationErrorCode.WASM_MEMORY_LIMIT_EXCEEDED);
      expect(error.context.memoryUsage).toBe(128 * 1024 * 1024);
    });

    it('should handle Babel errors with configuration context', () => {
      const originalError = new Error('Plugin @babel/plugin-transform-react-jsx not found');
      const error = errorHandler.handleBabelError(
        originalError,
        { plugin: '@babel/plugin-transform-react-jsx' },
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.BABEL_PLUGIN_ERROR);
      expect(error.context.metadata?.plugin).toBe('@babel/plugin-transform-react-jsx');
    });
  });

  describe('Validation Error Handling', () => {
    it('should handle validation errors with suggestions', () => {
      const error = errorHandler.handleValidationError(
        TranspilationErrorCode.CODE_TOO_LARGE,
        'Code exceeds size limit',
        { codeSize: 2 * 1024 * 1024 },
        mockRequest
      );

      expect(error.code).toBe(TranspilationErrorCode.CODE_TOO_LARGE);
      expect(error.recoverable).toBe(false);
      expect(error.suggestions.some(s => s.action === 'split_code')).toBe(true);
    });

    it('should handle performance errors with timing context', () => {
      const error = errorHandler.handlePerformanceError('wasm', 750, 500, mockRequest);

      expect(error.code).toBe(TranspilationErrorCode.PERFORMANCE_THRESHOLD_EXCEEDED);
      expect(error.context.duration).toBe(750);
      expect(error.context.metadata?.targetTime).toBe(500);
      expect(error.suggestions.some(s => s.action === 'reduce_code_complexity')).toBe(true);
    });
  });
});