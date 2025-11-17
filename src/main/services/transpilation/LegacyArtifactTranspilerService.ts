/**
 * Legacy Artifact Transpiler Service Replacement
 * Drop-in replacement for the old ArtifactTranspilerService that uses the new implementation
 * Maintains exact same interface for backward compatibility
 * Feature: 003-transpiler-service-rearchitecture
 */

import { ArtifactTranspilerAdapter } from './ArtifactTranspilerAdapter';
import type { LegacyTranspileRequest, LegacyTranspileResult } from './ArtifactTranspilerAdapter';
import { loggerService } from '@logger';

const logger = loggerService.withContext('LegacyArtifactTranspilerService');

/**
 * Legacy interface maintained for backward compatibility
 */
export interface TranspileRequest extends LegacyTranspileRequest {}
export interface TranspileResult extends LegacyTranspileResult {}

/**
 * Drop-in replacement that uses the new three-tier transpilation system
 * while maintaining the exact same API as the original ArtifactTranspilerService
 */
class LegacyArtifactTranspilerService {
  private adapter: ArtifactTranspilerAdapter;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.adapter = new ArtifactTranspilerAdapter();
  }

  /**
   * Initialize the service (lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.adapter.initialize();
    }
    await this.initPromise;
  }

  /**
   * Transpile code using the new three-tier system
   * Maintains exact same signature as original service
   */
  async transpile(request: TranspileRequest): Promise<TranspileResult> {
    await this.ensureInitialized();

    try {
      const result = await this.adapter.transpile(request);

      logger.debug('Legacy transpilation completed', {
        framework: request.framework,
        language: request.language,
        filename: request.filename,
        inputSize: request.code.length,
        outputSize: result.code.length,
        hasSourceMap: !!result.map,
        warningCount: result.warnings?.length || 0
      });

      return result;
    } catch (error) {
      logger.error('Legacy transpilation failed', {
        framework: request.framework,
        language: request.language,
        filename: request.filename,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.adapter.isHealthy();
  }

  /**
   * Get service status for monitoring
   */
  getStatus() {
    return this.adapter.getStatus();
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    await this.adapter.dispose();
    this.initPromise = null;
  }
}

// Create singleton instance for backward compatibility
export const artifactTranspilerService = new LegacyArtifactTranspilerService();