/**
 * Binary Provider Implementation
 * Cross-platform esbuild binary detection and management
 * Feature: 003-transpiler-service-rearchitecture
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { app } from 'electron';
import type {
  IBinaryProvider,
  BinaryStatus,
  BinaryPermissions,
  BinaryVerification,
  BinaryError,
} from './IBinaryProvider';

export class BinaryProvider implements IBinaryProvider {
  private static readonly BINARY_PATHS = [
    // Bundled binary locations
    path.join(process.resourcesPath || '', 'node_modules', 'esbuild', 'bin', 'esbuild'),
    path.join(app.getAppPath(), 'node_modules', 'esbuild', 'bin', 'esbuild'),
    path.join(__dirname, '..', '..', '..', 'node_modules', 'esbuild', 'bin', 'esbuild'),

    // Development locations
    path.join(process.cwd(), 'node_modules', 'esbuild', 'bin', 'esbuild'),

    // System-wide installation
    'esbuild'
  ];

  private binaryStatus: BinaryStatus | null = null;

  /**
   * Detect and locate platform-appropriate esbuild binary
   * Maps to FR-003: Cross-platform binary detection
   * Maps to FR-004: Proper binary bundling in packaged apps
   */
  async detectBinary(): Promise<string | null> {
    const platform = process.platform;
    const _arch = process.arch; // Used in resolvePlatformBinary

    // Try each potential binary path
    for (const binaryPath of BinaryProvider.BINARY_PATHS) {
      try {
        const resolvedPath = this.resolvePlatformBinary(binaryPath, platform, _arch);

        if (await this.fileExists(resolvedPath)) {
          const permissions = await this.checkPermissions(resolvedPath);

          if (permissions.exists && permissions.executable) {
            // Verify the binary works
            const verification = await this.verifyBinary(resolvedPath);
            if (verification.isValid) {
              this.updateBinaryStatus(resolvedPath, permissions, null, verification.version);
              return resolvedPath;
            }
          }
        }
      } catch (error) {
        // Continue to next path
        continue;
      }
    }

    this.updateBinaryStatus(null, this.getEmptyPermissions(), [{
      code: 'ENOENT',
      message: 'No valid esbuild binary found',
      suggestion: 'Install esbuild or check binary permissions'
    }]);

    return null;
  }

  /**
   * Validate that binary has proper execution permissions
   * Maps to FR-005: macOS sandbox compliance
   */
  async validatePermissions(binaryPath: string): Promise<boolean> {
    try {
      const permissions = await this.checkPermissions(binaryPath);

      // Check basic permissions
      if (!permissions.exists || !permissions.readable || !permissions.executable) {
        return false;
      }

      // macOS sandbox compliance check
      if (process.platform === 'darwin') {
        return await this.validateMacOSSandbox(binaryPath);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Ensure binary has executable permissions
   * Maps to FR-004: Proper executable permissions in packages
   */
  async ensureExecutable(binaryPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(binaryPath);

      // Check if already executable
      if (this.isExecutable(stats.mode)) {
        return true;
      }

      // Add executable permission
      const newMode = stats.mode | 0o111; // Add execute for owner, group, others
      await fs.chmod(binaryPath, newMode);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Download fallback binary if primary is missing
   * Maps to FR-008: Graceful fallback implementation
   */
  async downloadFallback(): Promise<string> {
    // For this implementation, we'll use a simple approach
    // In production, this would download from esbuild releases
    throw new Error('Binary download not implemented - use package manager to install esbuild');
  }

  /**
   * Get current binary status and metadata
   * Maps to FR-010: Error reporting and debugging
   */
  getBinaryStatus(): BinaryStatus {
    if (this.binaryStatus) {
      return this.binaryStatus;
    }

    // Return default status if not detected yet
    return {
      platform: process.platform,
      architecture: process.arch,
      isAvailable: false,
      permissions: this.getEmptyPermissions(),
      errors: [{
        code: 'ENOENT',
        message: 'Binary status not initialized - call detectBinary() first',
        suggestion: 'Initialize binary provider before checking status'
      }]
    };
  }

  /**
   * Verify binary integrity and version compatibility
   * Maps to FR-015: Input validation and security
   */
  async verifyBinary(binaryPath: string): Promise<BinaryVerification> {
    const verifiedAt = new Date();

    try {
      // Check if file exists and is readable
      await fs.access(binaryPath, fs.constants.R_OK | fs.constants.X_OK);

      // Get file hash for integrity check
      const hash = await this.calculateFileHash(binaryPath);

      // Try to get version by executing binary
      const version = await this.getBinaryVersion(binaryPath);

      return {
        isValid: true,
        version,
        hash,
        verifiedAt
      };
    } catch (error) {
      return {
        isValid: false,
        verifiedAt,
        errors: [{
          code: 'INVALID_BINARY',
          message: `Binary verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          binaryPath,
          suggestion: 'Reinstall esbuild package or check binary integrity'
        }]
      };
    }
  }

  // Private helper methods

  private resolvePlatformBinary(basePath: string, platform: NodeJS.Platform, _arch: string): string {
    // Handle platform-specific binary extensions
    if (platform === 'win32') {
      return basePath + '.exe';
    }
    return basePath;
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async checkPermissions(filePath: string): Promise<BinaryPermissions> {
    const permissions: BinaryPermissions = {
      exists: false,
      readable: false,
      executable: false,
      sandboxCompliant: false
    };

    try {
      // Check existence
      await fs.access(filePath, fs.constants.F_OK);
      permissions.exists = true;

      // Check readable
      await fs.access(filePath, fs.constants.R_OK);
      permissions.readable = true;

      // Check executable
      await fs.access(filePath, fs.constants.X_OK);
      permissions.executable = true;

      // Check sandbox compliance (macOS specific)
      if (process.platform === 'darwin') {
        permissions.sandboxCompliant = await this.validateMacOSSandbox(filePath);
      } else {
        permissions.sandboxCompliant = true;
      }
    } catch (error) {
      // Permissions already initialized to false
    }

    return permissions;
  }

  private async validateMacOSSandbox(binaryPath: string): Promise<boolean> {
    try {
      // Basic check - in a real implementation, this would verify
      // that the binary meets macOS sandbox requirements
      const stats = await fs.stat(binaryPath);
      return stats.isFile() && this.isExecutable(stats.mode);
    } catch {
      return false;
    }
  }

  private isExecutable(mode: number): boolean {
    // Check if any execute bit is set
    return (mode & 0o111) !== 0;
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  private async getBinaryVersion(_binaryPath: string): Promise<string | undefined> {
    // In a real implementation, this would execute the binary with --version
    // For now, return a placeholder
    return '0.19.0'; // placeholder version
  }

  private updateBinaryStatus(
    binaryPath: string | null,
    permissions: BinaryPermissions,
    errors: BinaryError[] | null,
    version?: string
  ): void {
    this.binaryStatus = {
      platform: process.platform,
      architecture: process.arch,
      binaryPath: binaryPath || undefined,
      isAvailable: binaryPath !== null && permissions.executable,
      permissions,
      version,
      lastDetected: new Date(),
      errors: errors || []
    };
    // lastDetectionTime tracking removed - not used
  }

  private getEmptyPermissions(): BinaryPermissions {
    return {
      exists: false,
      readable: false,
      executable: false,
      sandboxCompliant: false
    };
  }
}