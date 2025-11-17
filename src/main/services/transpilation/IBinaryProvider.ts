/**
 * Binary Provider Interface
 * Generated from Phase 1 design contracts
 * Feature: 003-transpiler-service-rearchitecture
 */

export interface IBinaryProvider {
  /**
   * Detect and locate platform-appropriate esbuild binary
   * Maps to FR-003: Cross-platform binary detection
   * Maps to FR-004: Proper binary bundling in packaged apps
   */
  detectBinary(): Promise<string | null>;

  /**
   * Validate that binary has proper execution permissions
   * Maps to FR-005: macOS sandbox compliance
   */
  validatePermissions(binaryPath: string): Promise<boolean>;

  /**
   * Ensure binary has executable permissions
   * Maps to FR-004: Proper executable permissions in packages
   */
  ensureExecutable(binaryPath: string): Promise<boolean>;

  /**
   * Download fallback binary if primary is missing
   * Maps to FR-008: Graceful fallback implementation
   */
  downloadFallback(): Promise<string>;

  /**
   * Get current binary status and metadata
   * Maps to FR-010: Error reporting and debugging
   */
  getBinaryStatus(): BinaryStatus;

  /**
   * Verify binary integrity and version compatibility
   * Maps to FR-015: Input validation and security
   */
  verifyBinary(binaryPath: string): Promise<BinaryVerification>;
}

export interface BinaryStatus {
  /** Current platform identifier */
  platform: NodeJS.Platform;

  /** Current architecture */
  architecture: string;

  /** Path to detected binary */
  binaryPath?: string;

  /** Whether binary is available and usable */
  isAvailable: boolean;

  /** Binary permission status */
  permissions: BinaryPermissions;

  /** Binary version information */
  version?: string;

  /** Last detection timestamp */
  lastDetected?: Date;

  /** Detection errors if any */
  errors?: BinaryError[];
}

export interface BinaryPermissions {
  /** Whether binary file exists */
  exists: boolean;

  /** Whether binary is readable */
  readable: boolean;

  /** Whether binary is executable */
  executable: boolean;

  /** Whether binary passes sandbox restrictions */
  sandboxCompliant: boolean;
}

export interface BinaryVerification {
  /** Whether binary passed verification */
  isValid: boolean;

  /** Binary version string */
  version?: string;

  /** Binary file hash for integrity */
  hash?: string;

  /** Verification timestamp */
  verifiedAt: Date;

  /** Verification errors if any */
  errors?: BinaryError[];
}

export interface BinaryError {
  /** Error code for programmatic handling */
  code: 'ENOENT' | 'EACCES' | 'EPERM' | 'INVALID_BINARY' | 'VERSION_MISMATCH' | 'SANDBOX_VIOLATION';

  /** Human-readable error message */
  message: string;

  /** Binary path that caused the error */
  binaryPath?: string;

  /** Suggested remediation steps */
  suggestion?: string;

  /** Underlying system error */
  systemError?: Error;
}

export interface BinaryDownloadOptions {
  /** Target download directory */
  targetDirectory: string;

  /** Whether to verify download integrity */
  verifyIntegrity: boolean;

  /** Download timeout in milliseconds */
  timeout: number;

  /** Whether to set executable permissions after download */
  setExecutable: boolean;
}

export interface PlatformBinaryInfo {
  /** Platform identifier */
  platform: NodeJS.Platform;

  /** Architecture identifier */
  architecture: string;

  /** Expected binary filename */
  binaryName: string;

  /** Download URL for this platform */
  downloadUrl?: string;

  /** Expected file hash for verification */
  expectedHash?: string;

  /** Whether this platform is supported */
  isSupported: boolean;
}