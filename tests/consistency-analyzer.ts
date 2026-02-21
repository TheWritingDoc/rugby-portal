import { LayoutIssue } from './screenshot-capture-system'
import { ComprehensiveRatingSystem, RatingBreakdown } from './layout-analysis-framework'

export interface DashboardComparison {
  dashboard: string
  score: number
  issues: LayoutIssue[]
  strengths: string[]
  weaknesses: string[]
}

export interface ConsistencyAnalysis {
  overallScore: number
  dashboardScores: DashboardComparison[]
  inconsistencies: InconsistencyIssue[]
  recommendations: string[]
  unifiedDesignSystem: DesignSystemRecommendation
}

export interface InconsistencyIssue {
  type: 'color' | 'typography' | 'spacing' | 'component' | 'layout' | 'interaction'
  severity: 'critical' | 'major' | 'minor'
  description: string
  affectedDashboards: string[]
  impact: string
  recommendation: string
}

export interface DesignSystemRecommendation {
  colorPalette: ColorRecommendation[]
  typographyScale: TypographyRecommendation[]
  spacingSystem: SpacingRecommendation[]
  componentLibrary: ComponentRecommendation[]
  layoutGrid: LayoutGridRecommendation[]
}

export interface ColorRecommendation {
  name: string
  hex: string
  usage: string
  contrast: 'high' | 'medium' | 'low'
}

export interface TypographyRecommendation {
  level: 'heading' | 'body' | 'caption' | 'button'
  fontSize: string
  fontWeight: string
  lineHeight: string
  usage: string
}

export interface SpacingRecommendation {
  name: string
  value: string
  usage: string
}

export interface ComponentRecommendation {
  component: string
  variants: string[]
  usage: string
  accessibility: string[]
}

export interface LayoutGridRecommendation {
  breakpoint: string
  columns: number
  gutter: string
  margin: string
  container: string
}

export class CrossDashboardConsistencyAnalyzer {
  private ratingSystem = new ComprehensiveRatingSystem()

  analyzeConsistency(dashboardAnalyses: Record<string, RatingBreakdown>): ConsistencyAnalysis {
    const dashboardScores = this.calculateDashboardScores(dashboardAnalyses)
    const inconsistencies = this.findInconsistencies(dashboardAnalyses)
    const unifiedDesignSystem = this.generateDesignSystemRecommendations(dashboardAnalyses)
    
    const overallScore = dashboardScores.reduce((sum, dashboard) => sum + dashboard.score, 0) / dashboardScores.length

    return {
      overallScore,
      dashboardScores,
      inconsistencies,
      recommendations: this.generateConsistencyRecommendations(inconsistencies),
      unifiedDesignSystem
    }
  }

  private calculateDashboardScores(dashboardAnalyses: Record<string, RatingBreakdown>): DashboardComparison[] {
    return Object.entries(dashboardAnalyses).map(([dashboardName, analysis]) => {
      const totalScore = this.calculateTotalScore(analysis)
      const allIssues = this.extractAllIssues(analysis)
      const strengths = this.identifyStrengths(analysis)
      const weaknesses = this.identifyWeaknesses(analysis)

      return {
        dashboard: dashboardName,
        score: totalScore,
        issues: allIssues,
        strengths,
        weaknesses
      }
    })
  }

  private calculateTotalScore(breakdown: RatingBreakdown): number {
    let totalScore = 0
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      const categoryScore = category.subCriteria.reduce((sum, sub) => sum + sub.score, 0)
      totalScore += categoryScore
    })
    return Math.round(totalScore * 10) / 10
  }

  private extractAllIssues(breakdown: RatingBreakdown): LayoutIssue[] {
    const allIssues: LayoutIssue[] = []
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      category.subCriteria.forEach(subCriterion => {
        allIssues.push(...subCriterion.issues)
      })
    })
    return allIssues
  }

  private identifyStrengths(breakdown: RatingBreakdown): string[] {
    const strengths: string[] = []
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      category.subCriteria.forEach(subCriterion => {
        if (subCriterion.score >= subCriterion.maxScore * 0.8) {
          strengths.push(`${category.category} - ${subCriterion.name}`)
        }
      })
    })
    return strengths
  }

  private identifyWeaknesses(breakdown: RatingBreakdown): string[] {
    const weaknesses: string[] = []
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      category.subCriteria.forEach(subCriterion => {
        if (subCriterion.score < subCriterion.maxScore * 0.6) {
          weaknesses.push(`${category.category} - ${subCriterion.name}`)
        }
      })
    })
    return weaknesses
  }

  private findInconsistencies(dashboardAnalyses: Record<string, RatingBreakdown>): InconsistencyIssue[] {
    const inconsistencies: InconsistencyIssue[] = []
    
    // Analyze color inconsistencies
    const colorInconsistencies = this.analyzeColorInconsistencies(dashboardAnalyses)
    inconsistencies.push(...colorInconsistencies)
    
    // Analyze typography inconsistencies
    const typographyInconsistencies = this.analyzeTypographyInconsistencies(dashboardAnalyses)
    inconsistencies.push(...typographyInconsistencies)
    
    // Analyze spacing inconsistencies
    const spacingInconsistencies = this.analyzeSpacingInconsistencies(dashboardAnalyses)
    inconsistencies.push(...spacingInconsistencies)
    
    // Analyze component inconsistencies
    const componentInconsistencies = this.analyzeComponentInconsistencies(dashboardAnalyses)
    inconsistencies.push(...componentInconsistencies)

    return inconsistencies
  }

  private analyzeColorInconsistencies(dashboardAnalyses: Record<string, RatingBreakdown>): InconsistencyIssue[] {
    const issues: InconsistencyIssue[] = []
    const colorIssuesByDashboard: Record<string, LayoutIssue[]> = {}
    
    Object.entries(dashboardAnalyses).forEach(([dashboardName, analysis]) => {
      const colorIssues = this.extractIssuesByType(analysis, 'color')
      if (colorIssues.length > 0) {
        colorIssuesByDashboard[dashboardName] = colorIssues
      }
    })
    
    if (Object.keys(colorIssuesByDashboard).length > 1) {
      issues.push({
        type: 'color',
        severity: 'major',
        description: 'Inconsistent color usage across dashboards',
        affectedDashboards: Object.keys(colorIssuesByDashboard),
        impact: 'Brand inconsistency and poor user experience',
        recommendation: 'Implement unified color palette across all dashboards'
      })
    }
    
    return issues
  }

  private analyzeTypographyInconsistencies(dashboardAnalyses: Record<string, RatingBreakdown>): InconsistencyIssue[] {
    const issues: InconsistencyIssue[] = []
    const typographyIssuesByDashboard: Record<string, LayoutIssue[]> = {}
    
    Object.entries(dashboardAnalyses).forEach(([dashboardName, analysis]) => {
      const typographyIssues = this.extractIssuesByType(analysis, 'typography')
      if (typographyIssues.length > 0) {
        typographyIssuesByDashboard[dashboardName] = typographyIssues
      }
    })
    
    if (Object.keys(typographyIssuesByDashboard).length > 1) {
      issues.push({
        type: 'typography',
        severity: 'major',
        description: 'Inconsistent typography across dashboards',
        affectedDashboards: Object.keys(typographyIssuesByDashboard),
        impact: 'Poor readability and inconsistent visual hierarchy',
        recommendation: 'Implement unified typography scale across all dashboards'
      })
    }
    
    return issues
  }

  private analyzeSpacingInconsistencies(dashboardAnalyses: Record<string, RatingBreakdown>): InconsistencyIssue[] {
    const issues: InconsistencyIssue[] = []
    const spacingIssuesByDashboard: Record<string, LayoutIssue[]> = {}
    
    Object.entries(dashboardAnalyses).forEach(([dashboardName, analysis]) => {
      const spacingIssues = this.extractIssuesByType(analysis, 'spacing')
      if (spacingIssues.length > 0) {
        spacingIssuesByDashboard[dashboardName] = spacingIssues
      }
    })
    
    if (Object.keys(spacingIssuesByDashboard).length > 1) {
      issues.push({
        type: 'spacing',
        severity: 'minor',
        description: 'Inconsistent spacing across dashboards',
        affectedDashboards: Object.keys(spacingIssuesByDashboard),
        impact: 'Visual inconsistency and poor layout rhythm',
        recommendation: 'Implement unified spacing system across all dashboards'
      })
    }
    
    return issues
  }

  private analyzeComponentInconsistencies(dashboardAnalyses: Record<string, RatingBreakdown>): InconsistencyIssue[] {
    const issues: InconsistencyIssue[] = []
    const componentIssuesByDashboard: Record<string, LayoutIssue[]> = {}
    
    Object.entries(dashboardAnalyses).forEach(([dashboardName, analysis]) => {
      const componentIssues = this.extractIssuesByType(analysis, 'component')
      if (componentIssues.length > 0) {
        componentIssuesByDashboard[dashboardName] = componentIssues
      }
    })
    
    if (Object.keys(componentIssuesByDashboard).length > 1) {
      issues.push({
        type: 'component',
        severity: 'major',
        description: 'Inconsistent component styling across dashboards',
        affectedDashboards: Object.keys(componentIssuesByDashboard),
        impact: 'Inconsistent user interface and poor user experience',
        recommendation: 'Implement unified component library across all dashboards'
      })
    }
    
    return issues
  }

  private extractIssuesByType(breakdown: RatingBreakdown, type: string): LayoutIssue[] {
    const issues: LayoutIssue[] = []
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      category.subCriteria.forEach(subCriterion => {
        const typeIssues = subCriterion.issues.filter(issue => issue.type === type)
        issues.push(...typeIssues)
      })
    })
    return issues
  }

  private generateConsistencyRecommendations(inconsistencies: InconsistencyIssue[]): string[] {
    const recommendations: string[] = []
    
    if (inconsistencies.length === 0) {
      recommendations.push('✅ Excellent consistency across all dashboards!')
      return recommendations
    }
    
    const criticalIssues = inconsistencies.filter(i => i.severity === 'critical')
    const majorIssues = inconsistencies.filter(i => i.severity === 'major')
    const minorIssues = inconsistencies.filter(i => i.severity === 'minor')
    
    if (criticalIssues.length > 0) {
      recommendations.push(`🚨 Fix ${criticalIssues.length} critical consistency issues immediately:`)
      criticalIssues.forEach(issue => {
        recommendations.push(`   - ${issue.description}: ${issue.recommendation}`)
      })
    }
    
    if (majorIssues.length > 0) {
      recommendations.push(`⚠️  Address ${majorIssues.length} major consistency issues:`)
      majorIssues.forEach(issue => {
        recommendations.push(`   - ${issue.description}: ${issue.recommendation}`)
      })
    }
    
    if (minorIssues.length > 0) {
      recommendations.push(`ℹ️  Consider fixing ${minorIssues.length} minor consistency issues:`)
      minorIssues.forEach(issue => {
        recommendations.push(`   - ${issue.description}: ${issue.recommendation}`)
      })
    }
    
    recommendations.push('')
    recommendations.push('📋 General Recommendations:')
    recommendations.push('   - Create a unified design system document')
    recommendations.push('   - Implement shared component library')
    recommendations.push('   - Use CSS custom properties for consistent theming')
    recommendations.push('   - Establish design tokens for colors, typography, and spacing')
    recommendations.push('   - Regular design system audits')
    
    return recommendations
  }

  private generateDesignSystemRecommendations(dashboardAnalyses: Record<string, RatingBreakdown>): DesignSystemRecommendation {
    return {
      colorPalette: this.generateColorRecommendations(),
      typographyScale: this.generateTypographyRecommendations(),
      spacingSystem: this.generateSpacingRecommendations(),
      componentLibrary: this.generateComponentRecommendations(),
      layoutGrid: this.generateLayoutGridRecommendations()
    }
  }

  private generateColorRecommendations(): ColorRecommendation[] {
    return [
      {
        name: 'Primary Blue',
        hex: '#2563eb',
        usage: 'Primary actions, headers, key UI elements',
        contrast: 'high'
      },
      {
        name: 'Secondary Purple',
        hex: '#7c3aed',
        usage: 'Secondary actions, coach-related elements',
        contrast: 'high'
      },
      {
        name: 'Success Green',
        hex: '#059669',
        usage: 'Success states, approved status',
        contrast: 'high'
      },
      {
        name: 'Warning Amber',
        hex: '#d97706',
        usage: 'Warning states, pending status',
        contrast: 'medium'
      },
      {
        name: 'Error Red',
        hex: '#dc2626',
        usage: 'Error states, rejected status',
        contrast: 'high'
      },
      {
        name: 'Neutral Gray',
        hex: '#6b7280',
        usage: 'Secondary text, borders, backgrounds',
        contrast: 'high'
      }
    ]
  }

  private generateTypographyRecommendations(): TypographyRecommendation[] {
    return [
      {
        level: 'heading',
        fontSize: '2rem',
        fontWeight: '700',
        lineHeight: '1.2',
        usage: 'Main page headings, dashboard titles'
      },
      {
        level: 'heading',
        fontSize: '1.5rem',
        fontWeight: '600',
        lineHeight: '1.3',
        usage: 'Section headings, card titles'
      },
      {
        level: 'body',
        fontSize: '1rem',
        fontWeight: '400',
        lineHeight: '1.5',
        usage: 'Body text, descriptions'
      },
      {
        level: 'caption',
        fontSize: '0.875rem',
        fontWeight: '400',
        lineHeight: '1.4',
        usage: 'Captions, secondary text'
      },
      {
        level: 'button',
        fontSize: '0.875rem',
        fontWeight: '500',
        lineHeight: '1.4',
        usage: 'Button text, action labels'
      }
    ]
  }

  private generateSpacingRecommendations(): SpacingRecommendation[] {
    return [
      { name: 'xs', value: '0.25rem', usage: 'Tight spacing, icon gaps' },
      { name: 'sm', value: '0.5rem', usage: 'Small gaps, inline spacing' },
      { name: 'md', value: '1rem', usage: 'Standard spacing, card padding' },
      { name: 'lg', value: '1.5rem', usage: 'Section spacing, component gaps' },
      { name: 'xl', value: '2rem', usage: 'Large spacing, section separation' },
      { name: '2xl', value: '3rem', usage: 'Extra large spacing, page sections' }
    ]
  }

  private generateComponentRecommendations(): ComponentRecommendation[] {
    return [
      {
        component: 'Button',
        variants: ['primary', 'secondary', 'danger', 'outline'],
        usage: 'All interactive actions',
        accessibility: ['Keyboard focus', 'ARIA labels', 'Sufficient contrast']
      },
      {
        component: 'Card',
        variants: ['default', 'highlighted', 'interactive'],
        usage: 'Content containers, data display',
        accessibility: ['Proper heading structure', 'Keyboard navigation']
      },
      {
        component: 'Form Input',
        variants: ['text', 'email', 'select', 'textarea'],
        usage: 'User input fields',
        accessibility: ['Label association', 'Error messages', 'Required indicators']
      },
      {
        component: 'Navigation',
        variants: ['tabs', 'breadcrumbs', 'pagination'],
        usage: 'Navigation between sections',
        accessibility: ['Current state indication', 'Keyboard navigation']
      }
    ]
  }

  private generateLayoutGridRecommendations(): LayoutGridRecommendation[] {
    return [
      {
        breakpoint: 'mobile',
        columns: 4,
        gutter: '1rem',
        margin: '1rem',
        container: '100%'
      },
      {
        breakpoint: 'tablet',
        columns: 8,
        gutter: '1.5rem',
        margin: '1.5rem',
        container: '768px'
      },
      {
        breakpoint: 'desktop',
        columns: 12,
        gutter: '2rem',
        margin: '2rem',
        container: '1280px'
      }
    ]
  }

  generateConsistencyReport(analysis: ConsistencyAnalysis): string {
    const report: string[] = []
    
    report.push('# Cross-Dashboard Consistency Analysis Report')
    report.push(`Generated: ${new Date().toISOString()}`)
    report.push('')
    
    report.push(`## Overall Consistency Score: ${analysis.overallScore.toFixed(1)}/10`)
    report.push('')
    
    report.push('## Dashboard Scores')
    report.push('')
    analysis.dashboardScores.forEach(dashboard => {
      report.push(`### ${dashboard.dashboard}: ${dashboard.score}/10`)
      report.push('')
      report.push(`**Strengths:**`)
      dashboard.strengths.forEach(strength => {
        report.push(`- ✅ ${strength}`)
      })
      report.push('')
      report.push(`**Weaknesses:**`)
      dashboard.weaknesses.forEach(weakness => {
        report.push(`- ⚠️ ${weakness}`)
      })
      report.push('')
    })
    
    if (analysis.inconsistencies.length > 0) {
      report.push('## Inconsistencies Found')
      report.push('')
      analysis.inconsistencies.forEach((inconsistency, index) => {
        report.push(`${index + 1}. **${inconsistency.type.toUpperCase()}** (${inconsistency.severity})`)
        report.push(`   - Description: ${inconsistency.description}`)
        report.push(`   - Affected Dashboards: ${inconsistency.affectedDashboards.join(', ')}`)
        report.push(`   - Impact: ${inconsistency.impact}`)
        report.push(`   - Recommendation: ${inconsistency.recommendation}`)
        report.push('')
      })
    }
    
    report.push('## Recommendations')
    report.push('')
    analysis.recommendations.forEach(rec => {
      report.push(rec)
    })
    
    report.push('')
    report.push('## Unified Design System Recommendations')
    report.push('')
    
    const designSystem = analysis.unifiedDesignSystem
    
    report.push('### Color Palette')
    designSystem.colorPalette.forEach(color => {
      report.push(`- **${color.name}** (${color.hex}): ${color.usage}`)
    })
    report.push('')
    
    report.push('### Typography Scale')
    designSystem.typographyScale.forEach(typography => {
      report.push(`- **${typography.level}** (${typography.fontSize}, ${typography.fontWeight}): ${typography.usage}`)
    })
    report.push('')
    
    report.push('### Spacing System')
    designSystem.spacingSystem.forEach(spacing => {
      report.push(`- **${spacing.name}** (${spacing.value}): ${spacing.usage}`)
    })
    report.push('')
    
    return report.join('\n')
  }
}