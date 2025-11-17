/**
 * Transpiler Service API Contracts
 * Generated from Phase 1 design contracts
 * Feature: 003-transpiler-service-rearchitecture
 *
 * This file exports all TypeScript interfaces and types for the
 * transpiler service rearchitecture. These contracts define the
 * public API surface for all service components.
 */

// Core service interfaces
export * from './ITranspilationService';
export * from './IBinaryProvider';
export * from './IFrameworkHandler';
export * from './ITranspilationProvider';
export * from './IFallbackChain';
export * from './ITranspilationCache';

// Type aliases for convenience
export type {
  // Request/Response types
  TranspilationRequest,
  TranspilationResult,
  TranspilationOptions,
  TranspilationError,

  // Configuration types
  ServiceCapabilities,
  ServiceStatus,
  FrameworkConfig,
  ProviderInfo,

  // Metadata types
  SourceLocation,
  TranspilationWarning,
  PlatformInfo,

  // Enum types
  ArtifactFramework,
  ExecutionMode
} from './ITranspilationService';

// Contract validation and versioning
export const CONTRACTS_VERSION = '1.0.0';
export const GENERATED_AT = '2025-11-17T12:00:00Z';

/**
 * Contract validation helper
 * Ensures interface implementations match expected signatures
 */
export interface ContractValidation {
  version: string;
  interfaces: string[];
  generatedAt: string;
}

export const CONTRACT_MANIFEST: ContractValidation = {
  version: CONTRACTS_VERSION,
  interfaces: [
    'ITranspilationService',
    'IBinaryProvider',
    'IFrameworkHandler',
    'ITranspilationProvider',
    'IFallbackChain',
    'ITranspilationCache'
  ],
  generatedAt: GENERATED_AT
};