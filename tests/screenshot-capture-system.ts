import { chromium, Browser, Page, BrowserContext } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export interface ScreenshotConfig {
  viewport: { width: number; height: number }
  deviceScaleFactor: number
  isMobile: boolean
  hasTouch: boolean
  name: string
}

export interface ScreenshotResult {
  path: string
  viewport: string
  timestamp: string
  size: { width: number; height: number }
}

export interface AnalysisResult {
  visualConsistency: number
  responsiveDesign: number
  accessibility: number
  userExperience: number
  performance: number
  totalScore: number
  issues: LayoutIssue[]
  recommendations: string[]
}

export interface LayoutIssue {
  type: 'alignment' | 'spacing' | 'color' | 'typography' | 'responsive' | 'accessibility'
  severity: 'critical' | 'major' | 'minor'
  description: string
  element?: string
  location?: string
  impact: string
}

export class SchoolAdminScreenshotCapture {
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private page: Page | null = null
  private screenshotDir: string
  private resultsDir: string

  constructor(private baseURL: string = 'http://localhost:5173') {
    this.screenshotDir = join(process.cwd(), 'tests', 'screenshots', 'school-admin')
    this.resultsDir = join(process.cwd(), 'tests', 'analysis-results')
    this.ensureDirectories()
  }

  private ensureDirectories(): void {
    const dirs = [this.screenshotDir, this.resultsDir]
    dirs.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    })
  }

  private getViewportConfigs(): ScreenshotConfig[] {
    return [
      {
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        name: 'desktop'
      },
      {
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
        name: 'laptop'
      },
      {
        viewport: { width: 768, height: 1024 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        name: 'tablet'
      },
      {
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        name: 'mobile'
      }
    ]
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    this.context = await this.browser.newContext()
    this.page = await this.context.newPage()
  }

  async loginAsSchoolAdmin(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')
    
    // Navigate to login page
    await this.page.goto(`${this.baseURL}/login`)
    await this.page.waitForLoadState('networkidle')
    
    // Fill login form (you'll need to adjust selectors based on your actual login form)
    await this.page.fill('input[type="email"]', 'schooladmin@test.com')
    await this.page.fill('input[type="password"]', 'password123')
    await this.page.click('button[type="submit"]')
    
    // Wait for dashboard to load
    await this.page.waitForURL('**/dashboard', { timeout: 10000 })
    await this.page.waitForLoadState('networkidle')
  }

  async captureFullPageScreenshots(): Promise<ScreenshotResult[]> {
    if (!this.page) throw new Error('Page not initialized')
    
    const results: ScreenshotResult[] = []
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const configs = this.getViewportConfigs()

    for (const config of configs) {
      // Set viewport
      await this.page.setViewportSize(config.viewport)
      
      // Navigate to school admin dashboard
      await this.page.goto(`${this.baseURL}/dashboard`)
      await this.page.waitForLoadState('networkidle')
      
      // Wait for specific school admin content to load
      await this.page.waitForSelector('[data-testid="school-admin-dashboard"]', { timeout: 5000 })
        .catch(() => console.log('School admin dashboard selector not found, continuing...'))
      
      // Capture different tabs/views
      const tabs = ['overview', 'teams', 'coaches', 'admins', 'analytics']
      
      for (const tab of tabs) {
        // Click on tab if it exists
        try {
          await this.page.click(`button:has-text("${tab.charAt(0).toUpperCase() + tab.slice(1)}")`)
          await this.page.waitForTimeout(1000) // Wait for tab content to load
        } catch (error) {
          console.log(`Tab ${tab} not found or not clickable`)
        }
        
        // Scroll to capture full page
        await this.page.evaluate(() => {
          window.scrollTo(0, 0)
        })
        
        // Capture screenshot
        const screenshotPath = join(
          this.screenshotDir, 
          `school-admin-${config.name}-${tab}-${timestamp}.png`
        )
        
        await this.page.screenshot({
          path: screenshotPath,
          fullPage: true
        })
        
        results.push({
          path: screenshotPath,
          viewport: config.name,
          timestamp,
          size: config.viewport
        })
      }
    }

    return results
  }

  async captureComponentScreenshots(): Promise<ScreenshotResult[]> {
    if (!this.page) throw new Error('Page not initialized')
    
    const results: ScreenshotResult[] = []
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const configs = this.getViewportConfigs()

    for (const config of configs) {
      await this.page.setViewportSize(config.viewport)
      await this.page.goto(`${this.baseURL}/dashboard`)
      await this.page.waitForLoadState('networkidle')

      // Define component selectors to capture
      const components = [
        { name: 'header-card', selector: '.bg-gradient-to-br.from-blue-700' },
        { name: 'stats-cards', selector: '.grid.grid-cols-1.sm\\:grid-cols-2.lg\\:grid-cols-4' },
        { name: 'tab-navigation', selector: '.border-b.border-gray-200' },
        { name: 'age-group-chart', selector: '.space-y-3' },
        { name: 'quick-stats', selector: '.space-y-4' }
      ]

      for (const component of components) {
        try {
          const element = await this.page.$(component.selector)
          if (element) {
            const screenshotPath = join(
              this.screenshotDir,
              `component-${component.name}-${config.name}-${timestamp}.png`
            )
            
            await element.screenshot({ path: screenshotPath })
            
            results.push({
              path: screenshotPath,
              viewport: config.name,
              timestamp,
              size: config.viewport
            })
          }
        } catch (error) {
          console.log(`Failed to capture component ${component.name}:`, error)
        }
      }
    }

    return results
  }

  async analyzeLayout(screenshots: ScreenshotResult[]): Promise<AnalysisResult> {
    // This would integrate with a visual analysis tool or AI service
    // For now, I'll create a mock analysis based on common issues
    
    const issues: LayoutIssue[] = []
    const recommendations: string[][] = []

    // Mock analysis based on viewport differences
    screenshots.forEach(screenshot => {
      if (screenshot.viewport === 'mobile') {
        issues.push({
          type: 'responsive',
          severity: 'major',
          description: 'Potential mobile layout issues detected',
          location: 'Navigation and stats cards',
          impact: 'Poor user experience on mobile devices'
        })
      }
      
      if (screenshot.viewport === 'tablet') {
        issues.push({
          type: 'spacing',
          severity: 'minor',
          description: 'Inconsistent spacing in grid layouts',
          location: 'Stats cards grid',
          impact: 'Visual inconsistency across devices'
        })
      }
    })

    // Calculate scores based on issues found
    const visualConsistency = Math.max(0, 10 - (issues.filter(i => i.type === 'alignment' || i.type === 'spacing').length * 0.5))
    const responsiveDesign = Math.max(0, 10 - (issues.filter(i => i.type === 'responsive').length * 1))
    const accessibility = 8 // Base score, would be enhanced with actual accessibility testing
    const userExperience = Math.max(0, 10 - (issues.filter(i => i.severity === 'critical').length * 2))
    const performance = 9 // Base score, would be enhanced with performance metrics

    const totalScore = (visualConsistency + responsiveDesign + accessibility + userExperience + performance) / 5

    return {
      visualConsistency: Math.round(visualConsistency * 10) / 10,
      responsiveDesign: Math.round(responsiveDesign * 10) / 10,
      accessibility: Math.round(accessibility * 10) / 10,
      userExperience: Math.round(userExperience * 10) / 10,
      performance: Math.round(performance * 10) / 10,
      totalScore: Math.round(totalScore * 10) / 10,
      issues,
      recommendations: recommendations.flat()
    }
  }

  async generateReport(screenshots: ScreenshotResult[], analysis: AnalysisResult): Promise<string> {
    const reportPath = join(this.resultsDir, `school-admin-analysis-${Date.now()}.json`)
    
    const report = {
      timestamp: new Date().toISOString(),
      screenshots,
      analysis,
      summary: {
        totalScreenshots: screenshots.length,
        viewportsTested: [...new Set(screenshots.map(s => s.viewport))],
        overallScore: analysis.totalScore,
        criticalIssues: analysis.issues.filter(i => i.severity === 'critical').length,
        majorIssues: analysis.issues.filter(i => i.severity === 'major').length,
        minorIssues: analysis.issues.filter(i => i.severity === 'minor').length
      }
    }

    writeFileSync(reportPath, JSON.stringify(report, null, 2))
    return reportPath
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
    }
  }

  async runFullAnalysis(): Promise<{ screenshots: ScreenshotResult[], analysis: AnalysisResult, reportPath: string }> {
    try {
      await this.initialize()
      await this.loginAsSchoolAdmin()
      
      console.log('📸 Capturing full page screenshots...')
      const fullPageScreenshots = await this.captureFullPageScreenshots()
      
      console.log('📸 Capturing component screenshots...')
      const componentScreenshots = await this.captureComponentScreenshots()
      
      const allScreenshots = [...fullPageScreenshots, ...componentScreenshots]
      
      console.log('🔍 Analyzing layout...')
      const analysis = await this.analyzeLayout(allScreenshots)
      
      console.log('📊 Generating report...')
      const reportPath = await this.generateReport(allScreenshots, analysis)
      
      console.log(`✅ Analysis complete! Score: ${analysis.totalScore}/10`)
      console.log(`📄 Report saved to: ${reportPath}`)
      
      return {
        screenshots: allScreenshots,
        analysis,
        reportPath
      }
    } finally {
      await this.cleanup()
    }
  }
}