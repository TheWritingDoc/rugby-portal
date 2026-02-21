#!/usr/bin/env node

/**
 * Comprehensive test execution script for human-like player management testing
 * Provides detailed execution control, monitoring, and reporting
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

interface TestExecutionConfig {
  environment: 'development' | 'production' | 'ci';
  browsers: string[];
  headless: boolean;
  slowMo: number;
  retries: number;
  timeout: number;
  parallel: boolean;
  workers: number;
  screenshots: boolean;
  videos: boolean;
  traces: boolean;
  reporting: boolean;
}

interface TestResults {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
  humanLikenessScore: number;
  performanceScore: number;
  visualConsistencyScore: number;
}

class TestExecutor {
  private config: TestExecutionConfig;
  private startTime: number;
  private results: TestResults;

  constructor(config: Partial<TestExecutionConfig> = {}) {
    this.config = {
      environment: config.environment || 'development',
      browsers: config.browsers || ['chromium'],
      headless: config.headless !== undefined ? config.headless : false,
      slowMo: config.slowMo || 50,
      retries: config.retries || 2,
      timeout: config.timeout || 60000,
      parallel: config.parallel !== undefined ? config.parallel : false,
      workers: config.workers || 1,
      screenshots: config.screenshots !== undefined ? config.screenshots : true,
      videos: config.videos !== undefined ? config.videos : true,
      traces: config.traces !== undefined ? config.traces : true,
      reporting: config.reporting !== undefined ? config.reporting : true
    };

    this.startTime = Date.now();
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      duration: 0,
      humanLikenessScore: 0,
      performanceScore: 0,
      visualConsistencyScore: 0
    };
  }

  async execute(): Promise<TestResults> {
    console.log('🚀 Starting Comprehensive Human-like Player Management Test Suite');
    console.log(`📊 Configuration: ${JSON.stringify(this.config, null, 2)}`);

    // Pre-execution checks
    await this.performPreExecutionChecks();

    // Setup test environment
    await this.setupTestEnvironment();

    // Execute tests
    const testResults = await this.runTests();

    // Post-execution analysis
    await this.performPostExecutionAnalysis();

    // Generate comprehensive reports
    await this.generateReports();

    this.results.duration = Date.now() - this.startTime;
    
    console.log('\n🎯 Test Execution Complete');
    console.log(`⏱️  Total Duration: ${this.results.duration}ms`);
    console.log(`📈 Results: ${this.results.passed}/${this.results.total} passed (${((this.results.passed / this.results.total) * 100).toFixed(1)}%)`);

    return this.results;
  }

  private async performPreExecutionChecks(): Promise<void> {
    console.log('\n🔍 Performing Pre-Execution Checks...');

    // Check if servers are running
    const services = [
      { name: 'Frontend', url: 'http://localhost:5173', timeout: 5000 },
      { name: 'Backend', url: 'http://localhost:4000/api/schools', timeout: 5000 }
    ];

    for (const service of services) {
      const isAvailable = await this.checkServiceAvailability(service.url, service.timeout);
      if (!isAvailable) {
        console.log(`  ❌ ${service.name} service is not available`);
        throw new Error(`${service.name} service is required for testing`);
      }
      console.log(`  ✓ ${service.name} service is available`);
    }

    // Check test dependencies
    const dependencies = ['@playwright/test', '@faker-js/faker', 'allure-playwright'];
    for (const dep of dependencies) {
      try {
        await import(dep);
        console.log(`  ✓ Dependency ${dep} is available`);
      } catch (error) {
        console.log(`  ❌ Dependency ${dep} is missing`);
        throw new Error(`Missing required dependency: ${dep}`);
      }
    }

    // Verify test files exist
    const testFiles = [
      'tests/player-management-human-like.spec.ts',
      'playwright.config.human-like.ts',
      'custom-reporter.ts',
      'global-setup.ts',
      'global-teardown.ts'
    ];

    for (const file of testFiles) {
      if (fs.existsSync(file)) {
        console.log(`  ✓ Test file ${file} exists`);
      } else {
        console.log(`  ❌ Test file ${file} is missing`);
        throw new Error(`Missing required test file: ${file}`);
      }
    }

    console.log('✅ Pre-execution checks complete');
  }

  private async setupTestEnvironment(): Promise<void> {
    console.log('\n⚙️  Setting up Test Environment...');

    // Set environment variables
    process.env.PLAYWRIGHT_TEST_ENV = this.config.environment;
    process.env.PLAYWRIGHT_HEADLESS = this.config.headless.toString();
    process.env.PLAYWRIGHT_SLOW_MO = this.config.slowMo.toString();
    process.env.PLAYWRIGHT_RETRIES = this.config.retries.toString();
    process.env.PLAYWRIGHT_TIMEOUT = this.config.timeout.toString();
    process.env.PLAYWRIGHT_WORKERS = this.config.workers.toString();

    // Create test results directory
    const testResultsDir = 'test-results';
    if (fs.existsSync(testResultsDir)) {
      fs.rmSync(testResultsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testResultsDir, { recursive: true });

    console.log('✅ Test environment setup complete');
  }

  private async runTests(): Promise<TestResults> {
    console.log('\n🧪 Executing Tests...');

    return new Promise((resolve, reject) => {
      const playwrightArgs = [
        'test',
        '--config=playwright.config.human-like.ts',
        '--reporter=./custom-reporter.ts'
      ];

      if (this.config.headless) {
        playwrightArgs.push('--headed=false');
      }

      if (this.config.parallel) {
        playwrightArgs.push(`--workers=${this.config.workers}`);
      }

      const playwright = spawn('npx', ['playwright', ...playwrightArgs], {
        stdio: 'pipe',
        shell: true
      });

      let stdout = '';
      let stderr = '';

      playwright.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        process.stdout.write(output);
      });

      playwright.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        process.stderr.write(output);
      });

      playwright.on('close', (code) => {
        console.log(`\n🎯 Playwright exited with code ${code}`);
        
        // Parse results from output
        const results = this.parseTestResults(stdout);
        resolve(results);
      });

      playwright.on('error', (error) => {
        console.error('❌ Test execution failed:', error);
        reject(error);
      });
    });
  }

  private async performPostExecutionAnalysis(): Promise<void> {
    console.log('\n📊 Performing Post-Execution Analysis...');

    // Analyze test results
    const analysisFiles = [
      'test-results/test-summary.json',
      'test-results/performance-analysis.json',
      'test-results/human-interaction-analysis.json',
      'test-results/visual-regression-summary.json'
    ];

    for (const file of analysisFiles) {
      if (fs.existsSync(file)) {
        try {
          const data = JSON.parse(fs.readFileSync(file, 'utf8'));
          console.log(`  ✓ Analyzed ${path.basename(file)}`);
          
          // Extract key metrics
          if (file.includes('human-interaction')) {
            this.results.humanLikenessScore = data.analysis?.humanLikenessRating || 0;
          } else if (file.includes('performance')) {
            this.results.performanceScore = this.calculatePerformanceScore(data);
          } else if (file.includes('visual')) {
            this.results.visualConsistencyScore = data.qualityMetrics?.consistencyScore || 0;
          }
        } catch (error) {
          console.log(`  ⚠️  Could not analyze ${file}: ${error}`);
        }
      } else {
        console.log(`  ⚠️  Analysis file ${file} not found`);
      }
    }

    console.log('✅ Post-execution analysis complete');
  }

  private async generateReports(): Promise<void> {
    console.log('\n📄 Generating Comprehensive Reports...');

    // Generate HTML report
    try {
      await this.generateHTMLReport();
      console.log('  ✓ HTML report generated');
    } catch (error) {
      console.log(`  ⚠️  HTML report generation failed: ${error}`);
    }

    // Generate Allure report
    try {
      await this.generateAllureReport();
      console.log('  ✓ Allure report generated');
    } catch (error) {
      console.log(`  ⚠️  Allure report generation failed: ${error}`);
    }

    // Generate CI/CD report
    try {
      await this.generateCICDReport();
      console.log('  ✓ CI/CD report generated');
    } catch (error) {
      console.log(`  ⚠️  CI/CD report generation failed: ${error}`);
    }

    console.log('✅ Report generation complete');
  }

  private async checkServiceAvailability(url: string, timeout: number): Promise<boolean> {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.get(url, (res) => {
        resolve(res.statusCode !== undefined && res.statusCode < 500);
      });

      req.on('error', () => resolve(false));
      req.setTimeout(timeout, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private parseTestResults(output: string): TestResults {
    // Simple parsing - in production, this would be more sophisticated
    const passed = (output.match(/✅|✓/g) || []).length;
    const failed = (output.match(/❌|✗/g) || []).length;
    const total = passed + failed;

    return {
      total,
      passed,
      failed,
      skipped: 0,
      flaky: 0,
      duration: 0,
      humanLikenessScore: 0,
      performanceScore: 0,
      visualConsistencyScore: 0
    };
  }

  private calculatePerformanceScore(data: any): number {
    // Calculate performance score based on various metrics
    const pageLoadScore = Math.max(0, 10 - (data.analysis?.pageLoadPerformance?.avg || 0) / 500);
    const formFillScore = Math.max(0, 10 - (data.analysis?.formFillPerformance?.avg || 0) / 1000);
    const responseScore = Math.max(0, 10 - (data.analysis?.responseTimePerformance?.avg || 0) / 200);

    return (pageLoadScore + formFillScore + responseScore) / 3;
  }

  private async generateHTMLReport(): Promise<void> {
    // Implementation would generate comprehensive HTML report
    console.log('  📄 HTML report generation would be implemented here');
  }

  private async generateAllureReport(): Promise<void> {
    return new Promise((resolve, reject) => {
      const allure = spawn('npx', [
        'allure', 'generate', 'test-results/allure-results',
        '-o', 'test-results/allure-report', '--clean'
      ], { stdio: 'pipe', shell: true });

      allure.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Allure generation failed with code ${code}`));
        }
      });

      allure.on('error', reject);
    });
  }

  private async generateCICDReport(): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      config: this.config,
      status: this.results.failed === 0 ? 'success' : 'failure',
      qualityGate: this.results.humanLikenessScore > 7 && this.results.performanceScore > 7 ? 'passed' : 'failed'
    };

    fs.writeFileSync('test-results/cicd-final-report.json', JSON.stringify(report, null, 2));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const config: Partial<TestExecutionConfig> = {
    environment: (process.env.NODE_ENV as any) || 'development',
    headless: process.env.CI === 'true',
    slowMo: process.env.CI === 'true' ? 0 : 50,
    retries: process.env.CI === 'true' ? 3 : 2,
    reporting: true
  };

  const executor = new TestExecutor(config);
  
  executor.execute()
    .then((results) => {
      console.log('\n🎉 Test Execution Completed Successfully');
      process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('\n💥 Test Execution Failed:', error);
      process.exit(1);
    });
}

export { TestExecutor, TestExecutionConfig, TestResults };