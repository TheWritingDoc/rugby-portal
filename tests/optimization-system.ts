import { SchoolAdminScreenshotCapture, ScreenshotResult, AnalysisResult, LayoutIssue } from './screenshot-capture-system'
import { ComprehensiveRatingSystem, RatingBreakdown } from './layout-analysis-framework'
import { CrossDashboardConsistencyAnalyzer, ConsistencyAnalysis } from './consistency-analyzer'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'

export interface OptimizationIteration {
  iteration: number
  timestamp: string
  score: number
  issues: LayoutIssue[]
  improvements: string[]
  screenshots: ScreenshotResult[]
  reportPath: string
}

export interface OptimizationConfig {
  targetScore: number
  maxIterations: number
  screenshotDelay: number
  analysisDelay: number
  saveIntermediateResults: boolean
}

export class SchoolAdminOptimizationSystem {
  private screenshotCapture: SchoolAdminScreenshotCapture
  private ratingSystem: ComprehensiveRatingSystem
  private consistencyAnalyzer: CrossDashboardConsistencyAnalyzer
  private iterations: OptimizationIteration[] = []
  private config: OptimizationConfig
  private resultsDir: string
  private iterationsDir: string

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = {
      targetScore: 9.0,
      maxIterations: 5,
      screenshotDelay: 2000,
      analysisDelay: 1000,
      saveIntermediateResults: true,
      ...config
    }
    
    this.screenshotCapture = new SchoolAdminScreenshotCapture()
    this.ratingSystem = new ComprehensiveRatingSystem()
    this.consistencyAnalyzer = new CrossDashboardConsistencyAnalyzer()
    
    this.resultsDir = join(process.cwd(), 'tests', 'optimization-results')
    this.iterationsDir = join(this.resultsDir, 'iterations')
    
    this.ensureDirectories()
  }

  private ensureDirectories(): void {
    const dirs = [this.resultsDir, this.iterationsDir]
    dirs.forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
    })
  }

  async runOptimization(): Promise<{
    finalScore: number
    totalIterations: number
    bestIteration: OptimizationIteration
    allIterations: OptimizationIteration[]
    improvementReport: string
  }> {
    console.log('🚀 Starting SchoolAdmin Dashboard Optimization System')
    console.log(`🎯 Target Score: ${this.config.targetScore}/10`)
    console.log(`🔄 Max Iterations: ${this.config.maxIterations}`)
    console.log('')

    let currentScore = 0
    let iteration = 0

    while (currentScore < this.config.targetScore && iteration < this.config.maxIterations) {
      iteration++
      console.log(`\n📊 Iteration ${iteration} Starting...`)
      
      const iterationResult = await this.runIteration(iteration)
      currentScore = iterationResult.score
      
      console.log(`📈 Iteration ${iteration} Score: ${currentScore}/10`)
      
      if (currentScore >= this.config.targetScore) {
        console.log(`🎉 Target score achieved!`)
        break
      }
      
      if (iteration < this.config.maxIterations) {
        console.log(`🔄 Preparing next iteration...`)
        await this.delay(this.config.analysisDelay)
      }
    }

    const bestIteration = this.iterations.reduce((best, current) => 
      current.score > best.score ? current : best
    )

    const improvementReport = this.generateImprovementReport()

    console.log('\n✅ Optimization Complete!')
    console.log(`🏆 Final Score: ${currentScore}/10`)
    console.log(`📊 Total Iterations: ${iteration}`)
    console.log(`🎯 Best Score: ${bestIteration.score}/10 (Iteration ${bestIteration.iteration})`)

    return {
      finalScore: currentScore,
      totalIterations: iteration,
      bestIteration,
      allIterations: this.iterations,
      improvementReport
    }
  }

  private async runIteration(iteration: number): Promise<OptimizationIteration> {
    console.log('  📸 Capturing screenshots...')
    const screenshots = await this.captureScreenshots()
    
    console.log('  🔍 Analyzing layout...')
    const analysis = await this.analyzeLayout(screenshots)
    
    console.log('  📊 Rating dashboard...')
    const rating = this.rateDashboard(analysis.issues)
    
    console.log('  🎯 Generating improvements...')
    const improvements = this.generateImprovements(rating)
    
    const iterationResult: OptimizationIteration = {
      iteration,
      timestamp: new Date().toISOString(),
      score: rating.totalScore,
      issues: analysis.issues,
      improvements,
      screenshots,
      reportPath: await this.saveIterationReport(iteration, screenshots, analysis, rating)
    }

    this.iterations.push(iterationResult)

    if (this.config.saveIntermediateResults) {
      await this.saveIterationData(iterationResult)
    }

    return iterationResult
  }

  private async captureScreenshots(): Promise<ScreenshotResult[]> {
    try {
      return await this.screenshotCapture.runFullAnalysis().then(result => result.screenshots)
    } catch (error) {
      console.error('Screenshot capture failed:', error)
      // Return mock screenshots for testing
      return [
        {
          path: 'mock-screenshot-desktop.png',
          viewport: 'desktop',
          timestamp: new Date().toISOString(),
          size: { width: 1920, height: 1080 }
        }
      ]
    }
  }

  private async analyzeLayout(screenshots: ScreenshotResult[]): Promise<AnalysisResult> {
    // Mock analysis - in real implementation, this would analyze actual screenshots
    const mockIssues: LayoutIssue[] = [
      {
        type: 'spacing',
        severity: 'minor',
        description: 'Inconsistent padding in stats cards',
        location: 'Stats cards grid',
        impact: 'Visual inconsistency across the dashboard'
      },
      {
        type: 'responsive',
        severity: 'major',
        description: 'Mobile layout breaks on small screens',
        location: 'Mobile viewport (375px)',
        impact: 'Poor user experience on mobile devices'
      },
      {
        type: 'color',
        severity: 'minor',
        description: 'Color contrast ratio below WCAG 2.1 standards',
        location: 'Secondary text elements',
        impact: 'Accessibility issues for users with visual impairments'
      }
    ]

    return {
      visualConsistency: 7.5,
      responsiveDesign: 6.0,
      accessibility: 8.5,
      userExperience: 8.0,
      performance: 9.0,
      totalScore: 7.8,
      issues: mockIssues,
      recommendations: [
        'Standardize spacing system across all components',
        'Implement mobile-first responsive design',
        'Improve color contrast ratios'
      ]
    }
  }

  private rateDashboard(analysis: AnalysisResult): RatingBreakdown {
    return this.ratingSystem.analyzeSchoolAdminDashboard(analysis.issues)
  }

  private generateImprovements(rating: RatingBreakdown): string[] {
    return this.ratingSystem.generateImprovementPlan(rating)
  }

  private async saveIterationReport(
    iteration: number, 
    screenshots: ScreenshotResult[], 
    analysis: AnalysisResult, 
    rating: RatingBreakdown
  ): Promise<string> {
    const reportPath = join(this.iterationsDir, `iteration-${iteration}-report.md`)
    
    const report = this.ratingSystem.generateDetailedReport(rating)
    writeFileSync(reportPath, report)
    
    return reportPath
  }

  private async saveIterationData(iteration: OptimizationIteration): Promise<void> {
    const dataPath = join(this.iterationsDir, `iteration-${iteration.iteration}-data.json`)
    writeFileSync(dataPath, JSON.stringify(iteration, null, 2))
  }

  private generateImprovementReport(): string {
    if (this.iterations.length === 0) {
      return 'No iterations completed'
    }

    const report: string[] = []
    
    report.push('# SchoolAdmin Dashboard Optimization Report')
    report.push(`Generated: ${new Date().toISOString()}`)
    report.push('')
    
    const firstIteration = this.iterations[0]
    const lastIteration = this.iterations[this.iterations.length - 1]
    const improvement = lastIteration.score - firstIteration.score
    
    report.push('## Summary')
    report.push(`- **Total Iterations:** ${this.iterations.length}`)
    report.push(`- **Starting Score:** ${firstIteration.score}/10`)
    report.push(`- **Final Score:** ${lastIteration.score}/10`)
    report.push(`- **Improvement:** ${improvement.toFixed(1)} points`)
    report.push(`- **Target Score:** ${this.config.targetScore}/10`)
    report.push(`- **Target Achieved:** ${lastIteration.score >= this.config.targetScore ? '✅ Yes' : '❌ No'}`)
    report.push('')
    
    report.push('## Iteration Progress')
    report.push('')
    report.push('| Iteration | Score | Issues Found | Improvements Made |')
    report.push('|-----------|-------|--------------|------------------|')
    
    this.iterations.forEach(iter => {
      report.push(`| ${iter.iteration} | ${iter.score}/10 | ${iter.issues.length} | ${iter.improvements.length} |`)
    })
    
    report.push('')
    report.push('## Key Improvements Made')
    report.push('')
    
    const allImprovements = new Set<string>()
    this.iterations.forEach(iter => {
      iter.improvements.forEach(imp => allImprovements.add(imp))
    })
    
    Array.from(allImprovements).slice(0, 10).forEach((improvement, index) => {
      report.push(`${index + 1}. ${improvement}`)
    })
    
    report.push('')
    report.push('## Recommendations for Future Iterations')
    report.push('')
    
    if (lastIteration.score < this.config.targetScore) {
      report.push('### Priority Areas for Improvement:')
      const remainingIssues = lastIteration.issues
      
      const criticalIssues = remainingIssues.filter(i => i.severity === 'critical')
      const majorIssues = remainingIssues.filter(i => i.severity === 'major')
      const minorIssues = remainingIssues.filter(i => i.severity === 'minor')
      
      if (criticalIssues.length > 0) {
        report.push('#### 🚨 Critical Issues:')
        criticalIssues.forEach(issue => {
          report.push(`- ${issue.description} (${issue.type})`)
        })
      }
      
      if (majorIssues.length > 0) {
        report.push('#### ⚠️ Major Issues:')
        majorIssues.forEach(issue => {
          report.push(`- ${issue.description} (${issue.type})`)
        })
      }
      
      if (minorIssues.length > 0) {
        report.push('#### ℹ️ Minor Issues:')
        minorIssues.forEach(issue => {
          report.push(`- ${issue.description} (${issue.type})`)
        })
      }
    } else {
      report.push('🎉 **Congratulations!** Target score achieved.')
      report.push('')
      report.push('### Maintenance Recommendations:')
      report.push('- Regular design system audits')
      report.push('- Monitor for new accessibility guidelines')
      report.push('- Test with real users periodically')
      report.push('- Keep design documentation updated')
    }
    
    return report.join('\n')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async runConsistencyAnalysis(): Promise<ConsistencyAnalysis> {
    console.log('🔍 Running cross-dashboard consistency analysis...')
    
    // Mock analysis of different dashboard types
    const mockDashboardAnalyses: Record<string, RatingBreakdown> = {
      'SchoolAdmin': this.ratingSystem.analyzeSchoolAdminDashboard([
        { type: 'spacing', severity: 'minor', description: 'Inconsistent card spacing', impact: 'Visual inconsistency' },
        { type: 'color', severity: 'minor', description: 'Color contrast issues', impact: 'Accessibility problems' }
      ]),
      'EPHSRUAdmin': this.ratingSystem.analyzeSchoolAdminDashboard([
        { type: 'responsive', severity: 'major', description: 'Mobile layout issues', impact: 'Poor mobile experience' },
        { type: 'typography', severity: 'minor', description: 'Font size inconsistencies', impact: 'Readability issues' }
      ]),
      'ZoneCoordinator': this.ratingSystem.analyzeSchoolAdminDashboard([
        { type: 'alignment', severity: 'minor', description: 'Element alignment problems', impact: 'Visual imbalance' }
      ])
    }
    
    const consistencyAnalysis = this.consistencyAnalyzer.analyzeConsistency(mockDashboardAnalyses)
    
    // Save consistency report
    const consistencyReportPath = join(this.resultsDir, 'consistency-analysis-report.md')
    const consistencyReport = this.consistencyAnalyzer.generateConsistencyReport(consistencyAnalysis)
    writeFileSync(consistencyReportPath, consistencyReport)
    
    console.log(`✅ Consistency analysis complete!`)
    console.log(`📊 Overall Consistency Score: ${consistencyAnalysis.overallScore}/10`)
    console.log(`📄 Report saved to: ${consistencyReportPath}`)
    
    return consistencyAnalysis
  }
}