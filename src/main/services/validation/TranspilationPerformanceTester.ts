/**
 * Transpilation Performance Tester
 * Runs comprehensive performance tests against React fixtures
 * Feature: 003-transpiler-service-rearchitecture
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import type { ITranspilationService, TranspilationRequest } from '../transpilation/ITranspilationService';
import type { PerformanceBenchmark } from './PerformanceValidator';
import { PerformanceValidator } from './PerformanceValidator';

export interface TestFixture {
  name: string;
  filepath: string;
  complexity: 'simple' | 'medium' | 'complex';
  expectedFeatures: string[];
  description: string;
}

export interface PerformanceTestSuite {
  name: string;
  fixtures: TestFixture[];
  iterations: number;
  warmupRuns: number;
}

export interface TestSuiteResults {
  suiteName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  averageTime: number;
  benchmarks: PerformanceBenchmark[];
  summary: {
    nativeResults: { passed: number; total: number; averageTime: number };
    wasmResults: { passed: number; total: number; averageTime: number };
    babelResults: { passed: number; total: number; averageTime: number };
  };
  issues: string[];
  recommendations: string[];
}

export class TranspilationPerformanceTester {
  private validator: PerformanceValidator;
  private fixturesPath: string;

  constructor(
    fixturesPath: string = './tests/fixtures/react',
    customThresholds?: { native?: number; wasm?: number; babel?: number }
  ) {
    this.validator = new PerformanceValidator(customThresholds);
    this.fixturesPath = fixturesPath;
  }

  /**
   * Define React test fixtures with complexity classifications
   */
  private getReactTestFixtures(): TestFixture[] {
    return [
      {
        name: 'SimpleComponent',
        filepath: 'SimpleComponent.jsx',
        complexity: 'simple',
        expectedFeatures: ['jsx', 'basic-component'],
        description: 'Basic JSX component without TypeScript'
      },
      {
        name: 'TypeScriptComponent',
        filepath: 'TypeScriptComponent.tsx',
        complexity: 'medium',
        expectedFeatures: ['tsx', 'typescript', 'hooks', 'interfaces'],
        description: 'TypeScript component with hooks and interfaces'
      },
      {
        name: 'ComplexComponent',
        filepath: 'ComplexComponent.tsx',
        complexity: 'complex',
        expectedFeatures: ['tsx', 'typescript', 'multiple-hooks', 'complex-state', 'event-handlers'],
        description: 'Complex component with multiple hooks and advanced patterns'
      },
      {
        name: 'WithoutReactImport',
        filepath: 'WithoutReactImport.jsx',
        complexity: 'simple',
        expectedFeatures: ['jsx', 'auto-import'],
        description: 'JSX without React import (tests auto-injection)'
      },
      {
        name: 'ClassComponent',
        filepath: 'ClassComponent.jsx',
        complexity: 'medium',
        expectedFeatures: ['jsx', 'class-component', 'lifecycle-methods'],
        description: 'React class component with lifecycle methods'
      },
      {
        name: 'FragmentTest',
        filepath: 'FragmentTest.jsx',
        complexity: 'simple',
        expectedFeatures: ['jsx', 'fragments'],
        description: 'React Fragment patterns'
      },
      {
        name: 'ConditionalRendering',
        filepath: 'ConditionalRendering.tsx',
        complexity: 'medium',
        expectedFeatures: ['tsx', 'conditional-jsx', 'typescript'],
        description: 'Various conditional rendering patterns'
      },
      {
        name: 'ErrorComponent',
        filepath: 'ErrorComponent.jsx',
        complexity: 'medium',
        expectedFeatures: ['jsx', 'error-boundaries', 'class-component'],
        description: 'Error boundary and error handling patterns'
      },
      {
        name: 'AsyncComponent',
        filepath: 'AsyncComponent.tsx',
        complexity: 'complex',
        expectedFeatures: ['tsx', 'async-patterns', 'suspense', 'lazy-loading'],
        description: 'Async patterns, Suspense, and lazy loading'
      }
    ];
  }

  /**
   * Run comprehensive performance test suite
   * Tests all fixtures against all available providers
   */
  async runPerformanceTestSuite(
    transpilationService: ITranspilationService,
    suiteName: string = 'React Transpilation Performance',
    iterations: number = 3,
    warmupRuns: number = 1
  ): Promise<TestSuiteResults> {
    const fixtures = this.getReactTestFixtures();
    const benchmarks: PerformanceBenchmark[] = [];
    const issues: string[] = [];
    const recommendations: string[] = [];

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let totalTime = 0;

    const nativeResults = { passed: 0, total: 0, averageTime: 0, totalTime: 0 };
    const wasmResults = { passed: 0, total: 0, averageTime: 0, totalTime: 0 };
    const babelResults = { passed: 0, total: 0, averageTime: 0, totalTime: 0 };

    console.log(`\n🚀 Starting performance test suite: ${suiteName}`);
    console.log(`📊 Testing ${fixtures.length} fixtures with ${iterations} iterations each\n`);

    for (const fixture of fixtures) {
      console.log(`📝 Testing ${fixture.name} (${fixture.complexity})...`);

      try {
        // Load fixture code
        const fixturePath = path.join(this.fixturesPath, fixture.filepath);
        const code = await fs.readFile(fixturePath, 'utf8');

        const request: TranspilationRequest = {
          code,
          framework: 'react',
          filename: fixture.filepath,
          language: fixture.filepath.endsWith('.tsx') ? 'typescript' : 'javascript'
        };

        // Warmup runs
        for (let i = 0; i < warmupRuns; i++) {
          await transpilationService.transpile(request);
        }

        // Create transpile function for benchmarking
        const transpileFunction = async (req: TranspilationRequest) => {
          return await transpilationService.transpile(req);
        };

        // Run benchmark
        const benchmark = await this.validator.runBenchmark(
          fixture.name,
          request,
          transpileFunction,
          iterations,
          fixture.complexity
        );

        benchmarks.push(benchmark);

        // Aggregate results by provider
        for (const result of benchmark.results) {
          totalTests++;
          totalTime += result.actualTime;

          if (result.passed) {
            passedTests++;
          } else {
            failedTests++;
            issues.push(`${fixture.name}: ${result.executionMode} exceeded ${result.targetTime}ms (took ${result.actualTime}ms)`);
          }

          // Track by provider
          switch (result.executionMode) {
            case 'native':
              nativeResults.total++;
              nativeResults.totalTime += result.actualTime;
              if (result.passed) nativeResults.passed++;
              break;
            case 'webassembly':
              wasmResults.total++;
              wasmResults.totalTime += result.actualTime;
              if (result.passed) wasmResults.passed++;
              break;
            case 'babel':
              babelResults.total++;
              babelResults.totalTime += result.actualTime;
              if (result.passed) babelResults.passed++;
              break;
          }
        }

        console.log(`  ✅ ${benchmark.passRate * 100}% pass rate (avg: ${Math.round(benchmark.averageTime)}ms)`);

      } catch (error) {
        failedTests++;
        issues.push(`${fixture.name}: Failed to load or test - ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.log(`  ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Calculate averages
    nativeResults.averageTime = nativeResults.total > 0 ? nativeResults.totalTime / nativeResults.total : 0;
    wasmResults.averageTime = wasmResults.total > 0 ? wasmResults.totalTime / wasmResults.total : 0;
    babelResults.averageTime = babelResults.total > 0 ? babelResults.totalTime / babelResults.total : 0;

    // Generate recommendations
    if (nativeResults.total > 0 && (nativeResults.passed / nativeResults.total) < 0.8) {
      recommendations.push('Native esbuild performance is below expectations - check binary installation and system resources');
    }

    if (wasmResults.total > 0 && (wasmResults.passed / wasmResults.total) < 0.8) {
      recommendations.push('WebAssembly performance is below expectations - check WASM module initialization');
    }

    if (babelResults.total > 0 && (babelResults.passed / babelResults.total) < 0.8) {
      recommendations.push('Babel performance is below expectations - review preset configuration');
    }

    const averageTime = totalTests > 0 ? totalTime / totalTests : 0;

    console.log(`\n📈 Performance Test Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passedTests} (${Math.round((passedTests / Math.max(1, totalTests)) * 100)}%)`);
    console.log(`   Failed: ${failedTests}`);
    console.log(`   Average Time: ${Math.round(averageTime)}ms`);

    if (nativeResults.total > 0) {
      console.log(`   Native: ${nativeResults.passed}/${nativeResults.total} (avg: ${Math.round(nativeResults.averageTime)}ms)`);
    }
    if (wasmResults.total > 0) {
      console.log(`   WASM: ${wasmResults.passed}/${wasmResults.total} (avg: ${Math.round(wasmResults.averageTime)}ms)`);
    }
    if (babelResults.total > 0) {
      console.log(`   Babel: ${babelResults.passed}/${babelResults.total} (avg: ${Math.round(babelResults.averageTime)}ms)`);
    }

    if (issues.length > 0) {
      console.log(`\n⚠️  Issues Found:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    }

    if (recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      recommendations.forEach(rec => console.log(`   - ${rec}`));
    }

    return {
      suiteName,
      totalTests,
      passedTests,
      failedTests,
      averageTime,
      benchmarks,
      summary: {
        nativeResults: {
          passed: nativeResults.passed,
          total: nativeResults.total,
          averageTime: nativeResults.averageTime
        },
        wasmResults: {
          passed: wasmResults.passed,
          total: wasmResults.total,
          averageTime: wasmResults.averageTime
        },
        babelResults: {
          passed: babelResults.passed,
          total: babelResults.total,
          averageTime: babelResults.averageTime
        }
      },
      issues,
      recommendations
    };
  }

  /**
   * Run performance regression test
   * Compares current performance against baseline
   */
  async runRegressionTest(
    transpilationService: ITranspilationService,
    baselineResults: TestSuiteResults,
    tolerance: number = 0.2 // 20% tolerance
  ): Promise<{
    passed: boolean;
    regressions: Array<{
      fixture: string;
      provider: string;
      baselineTime: number;
      currentTime: number;
      regression: number;
    }>;
    improvements: Array<{
      fixture: string;
      provider: string;
      baselineTime: number;
      currentTime: number;
      improvement: number;
    }>;
  }> {
    const currentResults = await this.runPerformanceTestSuite(transpilationService, 'Regression Test', 3, 1);
    const regressions: any[] = [];
    const improvements: any[] = [];

    // Compare benchmarks
    for (const currentBenchmark of currentResults.benchmarks) {
      const baselineBenchmark = baselineResults.benchmarks.find(b => b.testName === currentBenchmark.testName);
      if (!baselineBenchmark) continue;

      const currentTime = currentBenchmark.averageTime;
      const baselineTime = baselineBenchmark.averageTime;
      const change = (currentTime - baselineTime) / baselineTime;

      if (change > tolerance) {
        regressions.push({
          fixture: currentBenchmark.testName,
          provider: 'average',
          baselineTime,
          currentTime,
          regression: change
        });
      } else if (change < -0.1) { // 10% improvement threshold
        improvements.push({
          fixture: currentBenchmark.testName,
          provider: 'average',
          baselineTime,
          currentTime,
          improvement: Math.abs(change)
        });
      }
    }

    const passed = regressions.length === 0;

    console.log(`\n🔄 Regression Test Results:`);
    console.log(`   Status: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Regressions: ${regressions.length}`);
    console.log(`   Improvements: ${improvements.length}`);

    if (regressions.length > 0) {
      console.log(`\n📉 Performance Regressions:`);
      regressions.forEach(reg => {
        console.log(`   - ${reg.fixture}: ${Math.round(reg.baselineTime)}ms → ${Math.round(reg.currentTime)}ms (+${Math.round(reg.regression * 100)}%)`);
      });
    }

    if (improvements.length > 0) {
      console.log(`\n📈 Performance Improvements:`);
      improvements.forEach(imp => {
        console.log(`   - ${imp.fixture}: ${Math.round(imp.baselineTime)}ms → ${Math.round(imp.currentTime)}ms (-${Math.round(imp.improvement * 100)}%)`);
      });
    }

    return { passed, regressions, improvements };
  }

  /**
   * Generate performance report as JSON
   */
  async generatePerformanceReport(results: TestSuiteResults): Promise<string> {
    const report = {
      timestamp: new Date().toISOString(),
      suite: results.suiteName,
      summary: {
        totalTests: results.totalTests,
        passRate: Math.round((results.passedTests / Math.max(1, results.totalTests)) * 100),
        averageTime: Math.round(results.averageTime),
        status: results.failedTests === 0 ? 'PASSED' : 'FAILED'
      },
      providers: results.summary,
      benchmarks: results.benchmarks.map(b => ({
        name: b.testName,
        framework: b.framework,
        complexity: b.complexity,
        codeSize: b.codeSize,
        averageTime: Math.round(b.averageTime),
        passRate: Math.round(b.passRate * 100),
        fastest: Math.round(b.fastestTime),
        slowest: Math.round(b.slowestTime)
      })),
      issues: results.issues,
      recommendations: results.recommendations,
      metadata: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage()
      }
    };

    return JSON.stringify(report, null, 2);
  }
}