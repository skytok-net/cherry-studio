/**
 * Artifact Transpiler Adapter
 * Bridges the new TranspilationServiceImpl with the existing ArtifactTranspilerService interface
 * Maintains backward compatibility while leveraging the three-tier fallback system
 * Feature: 003-transpiler-service-rearchitecture
 */

import type { Message } from 'esbuild';
import type {
  ITranspilationService,
  TranspilationRequest,
  TranspilationResult,
  ArtifactFramework
} from './ITranspilationService';
import { TranspilationServiceImpl } from './TranspilationServiceImpl';
import { TranspilationError } from './errors/TranspilationError';
import { loggerService } from '@logger';

// Legacy interfaces from existing ArtifactTranspilerService
export interface LegacyTranspileRequest {
  code: string;
  framework: ArtifactFramework;
  language: 'typescript' | 'javascript';
  filename?: string;
}

export interface LegacyTranspileResult {
  code: string;
  map?: string;
  warnings?: Message[];
}

const logger = loggerService.withContext('ArtifactTranspilerAdapter');

/**
 * Adapter that provides backward compatibility with the existing artifact system
 * while using the new three-tier transpilation service underneath
 */
export class ArtifactTranspilerAdapter {
  private transpilationService: ITranspilationService;
  private isInitialized: boolean = false;

  constructor() {
    this.transpilationService = new TranspilationServiceImpl();
  }

  /**
   * Initialize the adapter and underlying transpilation service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.transpilationService.initialize();
      this.isInitialized = true;

      logger.info('ArtifactTranspilerAdapter initialized successfully', {
        capabilities: this.transpilationService.getCapabilities()
      });
    } catch (error) {
      logger.error('Failed to initialize ArtifactTranspilerAdapter', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Transpile code using the legacy interface
   * Maps legacy request/response format to new transpilation service
   */
  async transpile(request: LegacyTranspileRequest): Promise<LegacyTranspileResult> {
    if (!this.isInitialized) {
      throw new Error('ArtifactTranspilerAdapter not initialized. Call initialize() first.');
    }

    try {
      // Convert legacy request to new format
      const newRequest: TranspilationRequest = {
        code: request.code,
        framework: request.framework,
        language: request.language,
        filename: request.filename || this.generateFilename(request.framework, request.language),
        options: {
          sourcemap: 'external', // Always generate sourcemaps for artifacts
          minify: false,   // Don't minify artifacts for debugging
          target: 'es2020' // Modern target for artifact runtime
        }
      };

      logger.debug('Converting legacy transpile request', {
        framework: request.framework,
        language: request.language,
        filename: newRequest.filename,
        codeSize: request.code.length
      });

      // Execute transpilation using new service
      const result: TranspilationResult = await this.transpilationService.transpile(newRequest);

      // Convert new result to legacy format
      const legacyResult: LegacyTranspileResult = {
        code: result.code,
        map: result.map,
        warnings: this.convertWarningsToLegacyFormat(result.warnings || [])
      };

      logger.info('Legacy transpilation completed successfully', {
        framework: request.framework,
        executionMode: result.executionMode,
        duration: result.duration,
        cacheHit: result.cacheHit,
        outputSize: result.code.length
      });

      return legacyResult;

    } catch (error) {
      // Handle TranspilationErrors specifically
      if (error instanceof TranspilationError) {
        logger.error('Transpilation failed with structured error', {
          code: error.code,
          message: error.message,
          recoverable: error.recoverable,
          suggestions: error.suggestions.length,
          context: error.context
        });

        // Convert structured error to legacy format
        throw new Error(error.getUserMessage());
      }

      // Handle generic errors
      logger.error('Transpilation failed with unknown error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        framework: request.framework,
        language: request.language
      });

      throw error;
    }
  }

  /**
   * Check if the adapter is properly initialized and healthy
   */
  isHealthy(): boolean {
    if (!this.isInitialized) {
      return false;
    }

    const status = this.transpilationService.getStatus();
    return status.health.successRate > 0.8;
  }

  /**
   * Get service status for monitoring
   */
  getStatus() {
    if (!this.isInitialized) {
      return {
        isInitialized: false,
        isHealthy: false,
        error: 'Service not initialized'
      };
    }

    return this.transpilationService.getStatus();
  }

  /**
   * Get supported capabilities
   */
  getCapabilities() {
    if (!this.isInitialized) {
      return null;
    }

    return this.transpilationService.getCapabilities();
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.isInitialized) {
      await this.transpilationService.dispose();
      this.isInitialized = false;
      logger.info('ArtifactTranspilerAdapter disposed');
    }
  }

  // Private helper methods

  private generateFilename(framework: ArtifactFramework, language: 'typescript' | 'javascript'): string {
    const extension = language === 'typescript' ?
      (framework === 'react' ? '.tsx' : '.ts') :
      (framework === 'react' ? '.jsx' : '.js');

    return `artifact-${Date.now()}${extension}`;
  }

  private convertWarningsToLegacyFormat(warnings: any[]): Message[] {
    // Convert new warning format to esbuild Message format
    return warnings.map(warning => ({
      id: warning.id || '',
      pluginName: warning.plugin || 'transpiler',
      text: warning.message || warning.text || 'Unknown warning',
      location: warning.location ? {
        file: warning.location.file || '',
        namespace: warning.location.namespace || '',
        line: warning.location.line || 0,
        column: warning.location.column || 0,
        length: warning.location.length || 0,
        lineText: warning.location.lineText || '',
        suggestion: warning.location.suggestion || ''
      } : null,
      notes: warning.notes || [],
      detail: warning.detail
    }));
  }
}

/**
 * Singleton instance for backward compatibility
 * Maintains the same usage pattern as the original ArtifactTranspilerService
 */
export class ArtifactTranspilerService {
  private static instance: ArtifactTranspilerAdapter | null = null;

  /**
   * Get singleton instance
   */
  static getInstance(): ArtifactTranspilerAdapter {
    if (!ArtifactTranspilerService.instance) {
      ArtifactTranspilerService.instance = new ArtifactTranspilerAdapter();
    }
    return ArtifactTranspilerService.instance;
  }

  /**
   * Initialize the service (singleton pattern)
   */
  static async initialize(): Promise<void> {
    const instance = ArtifactTranspilerService.getInstance();
    await instance.initialize();
  }

  /**
   * Transpile using singleton instance
   */
  static async transpile(request: LegacyTranspileRequest): Promise<LegacyTranspileResult> {
    const instance = ArtifactTranspilerService.getInstance();
    return await instance.transpile(request);
  }

  /**
   * Check if service is healthy
   */
  static isHealthy(): boolean {
    if (!ArtifactTranspilerService.instance) {
      return false;
    }
    return ArtifactTranspilerService.instance.isHealthy();
  }

  /**
   * Get service status
   */
  static getStatus() {
    if (!ArtifactTranspilerService.instance) {
      return {
        isInitialized: false,
        isHealthy: false,
        error: 'Service not initialized'
      };
    }
    return ArtifactTranspilerService.instance.getStatus();
  }

  /**
   * Dispose of singleton instance
   */
  static async dispose(): Promise<void> {
    if (ArtifactTranspilerService.instance) {
      await ArtifactTranspilerService.instance.dispose();
      ArtifactTranspilerService.instance = null;
    }
  }
}