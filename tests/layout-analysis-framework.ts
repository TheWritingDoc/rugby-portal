import { LayoutIssue, AnalysisResult } from './screenshot-capture-system'

export interface RatingCriteria {
  category: string
  maxScore: number
  description: string
  subCriteria: SubCriterion[]
}

export interface SubCriterion {
  name: string
  description: string
  score: number
  maxScore: number
  issues: LayoutIssue[]
  recommendations: string[]
}

export interface RatingBreakdown {
  visualConsistency: RatingCriteria
  responsiveDesign: RatingCriteria
  accessibility: RatingCriteria
  userExperience: RatingCriteria
  performance: RatingCriteria
}

export class ComprehensiveRatingSystem {
  
  private readonly ratingCriteria: RatingBreakdown = {
    visualConsistency: {
      category: 'Visual Consistency',
      maxScore: 2,
      description: 'Consistency in design elements, spacing, colors, and typography',
      subCriteria: [
        {
          name: 'Color Scheme Adherence',
          description: 'Consistent use of brand colors, proper contrast ratios, and color harmony',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Typography Consistency',
          description: 'Consistent font families, sizes, weights, and line heights',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Spacing & Alignment',
          description: 'Consistent padding, margins, and alignment across components',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Component Styling',
          description: 'Consistent button styles, form elements, and UI components',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        }
      ]
    },
    responsiveDesign: {
      category: 'Responsive Design',
      maxScore: 2,
      description: 'Adaptability across different screen sizes and devices',
      subCriteria: [
        {
          name: 'Mobile Optimization',
          description: 'Proper layout adaptation for mobile devices (375px-768px)',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Tablet Optimization',
          description: 'Proper layout adaptation for tablets (768px-1024px)',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Desktop Optimization',
          description: 'Proper layout adaptation for desktop (1024px+)',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Flexible Grid System',
          description: 'Use of flexible grids and breakpoints for responsive layouts',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        }
      ]
    },
    accessibility: {
      category: 'Accessibility Standards',
      maxScore: 2,
      description: 'Compliance with WCAG 2.1 guidelines and accessibility best practices',
      subCriteria: [
        {
          name: 'Color Contrast',
          description: 'WCAG 2.1 compliant color contrast ratios (4.5:1 for normal text, 3:1 for large text)',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Keyboard Navigation',
          description: 'Full keyboard accessibility and proper focus management',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Screen Reader Support',
          description: 'Proper ARIA labels, semantic HTML, and screen reader compatibility',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Alternative Text',
          description: 'Descriptive alt text for images and proper labeling for form elements',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        }
      ]
    },
    userExperience: {
      category: 'User Experience Flow',
      maxScore: 2,
      description: 'Intuitive navigation, clear information hierarchy, and user-friendly interactions',
      subCriteria: [
        {
          name: 'Information Architecture',
          description: 'Clear content hierarchy, logical organization, and easy navigation',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Interactive Elements',
          description: 'Intuitive buttons, forms, and interactive components with proper feedback',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Loading States',
          description: 'Proper loading indicators, error handling, and empty states',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Content Clarity',
          description: 'Clear labels, instructions, and content presentation',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        }
      ]
    },
    performance: {
      category: 'Performance Optimization',
      maxScore: 2,
      description: 'Page load speed, resource optimization, and efficient rendering',
      subCriteria: [
        {
          name: 'Page Load Speed',
          description: 'Fast initial page load and responsive interactions',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Resource Optimization',
          description: 'Optimized images, CSS, and JavaScript delivery',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Rendering Performance',
          description: 'Efficient DOM updates and smooth animations',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        },
        {
          name: 'Memory Usage',
          description: 'Efficient memory usage and cleanup of resources',
          score: 0,
          maxScore: 0.5,
          issues: [],
          recommendations: []
        }
      ]
    }
  }

  analyzeSchoolAdminDashboard(issues: LayoutIssue[]): RatingBreakdown {
    const breakdown = JSON.parse(JSON.stringify(this.ratingCriteria)) as RatingBreakdown
    
    // Categorize issues by type and severity
    issues.forEach(issue => {
      this.categorizeIssue(issue, breakdown)
    })

    // Calculate scores for each category
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      category.subCriteria.forEach(subCriterion => {
        this.calculateSubCriterionScore(subCriterion)
      })
    })

    return breakdown
  }

  private categorizeIssue(issue: LayoutIssue, breakdown: RatingBreakdown): void {
    switch (issue.type) {
      case 'alignment':
      case 'spacing':
      case 'color':
      case 'typography':
        this.addToVisualConsistency(issue, breakdown)
        break
      case 'responsive':
        this.addToResponsiveDesign(issue, breakdown)
        break
      case 'accessibility':
        this.addToAccessibility(issue, breakdown)
        break
      default:
        this.addToUserExperience(issue, breakdown)
    }
  }

  private addToVisualConsistency(issue: LayoutIssue, breakdown: RatingBreakdown): void {
    const category = breakdown.visualConsistency
    
    if (issue.type === 'color') {
      category.subCriteria[0].issues.push(issue)
      category.subCriteria[0].recommendations.push(this.getRecommendationForIssue(issue))
    } else if (issue.type === 'typography') {
      category.subCriteria[1].issues.push(issue)
      category.subCriteria[1].recommendations.push(this.getRecommendationForIssue(issue))
    } else if (issue.type === 'spacing' || issue.type === 'alignment') {
      category.subCriteria[2].issues.push(issue)
      category.subCriteria[2].recommendations.push(this.getRecommendationForIssue(issue))
    }
  }

  private addToResponsiveDesign(issue: LayoutIssue, breakdown: RatingBreakdown): void {
    const category = breakdown.responsiveDesign
    
    if (issue.location?.includes('mobile')) {
      category.subCriteria[0].issues.push(issue)
      category.subCriteria[0].recommendations.push(this.getRecommendationForIssue(issue))
    } else if (issue.location?.includes('tablet')) {
      category.subCriteria[1].issues.push(issue)
      category.subCriteria[1].recommendations.push(this.getRecommendationForIssue(issue))
    } else {
      category.subCriteria[2].issues.push(issue)
      category.subCriteria[2].recommendations.push(this.getRecommendationForIssue(issue))
    }
  }

  private addToAccessibility(issue: LayoutIssue, breakdown: RatingBreakdown): void {
    const category = breakdown.accessibility
    
    if (issue.type === 'color' && issue.description.includes('contrast')) {
      category.subCriteria[0].issues.push(issue)
      category.subCriteria[0].recommendations.push(this.getRecommendationForIssue(issue))
    } else {
      category.subCriteria[3].issues.push(issue)
      category.subCriteria[3].recommendations.push(this.getRecommendationForIssue(issue))
    }
  }

  private addToUserExperience(issue: LayoutIssue, breakdown: RatingBreakdown): void {
    const category = breakdown.userExperience
    category.subCriteria[3].issues.push(issue)
    category.subCriteria[3].recommendations.push(this.getRecommendationForIssue(issue))
  }

  private calculateSubCriterionScore(subCriterion: SubCriterion): void {
    const baseScore = subCriterion.maxScore
    const issuePenalty = subCriterion.issues.reduce((penalty, issue) => {
      switch (issue.severity) {
        case 'critical': return penalty + 0.25
        case 'major': return penalty + 0.15
        case 'minor': return penalty + 0.05
        default: return penalty + 0.05
      }
    }, 0)
    
    subCriterion.score = Math.max(0, baseScore - issuePenalty)
  }

  private getRecommendationForIssue(issue: LayoutIssue): string {
    switch (issue.type) {
      case 'alignment':
        return `Fix alignment issue: ${issue.description}. Use consistent CSS alignment properties.`
      case 'spacing':
        return `Adjust spacing: ${issue.description}. Apply consistent padding/margin values.`
      case 'color':
        return `Update colors: ${issue.description}. Ensure WCAG 2.1 compliance.`
      case 'typography':
        return `Fix typography: ${issue.description}. Use consistent font properties.`
      case 'responsive':
        return `Improve responsive design: ${issue.description}. Add appropriate media queries.`
      case 'accessibility':
        return `Enhance accessibility: ${issue.description}. Follow WCAG 2.1 guidelines.`
      default:
        return `Address issue: ${issue.description}`
    }
  }

  generateDetailedReport(breakdown: RatingBreakdown): string {
    const report: string[] = []
    
    report.push('# SchoolAdmin Dashboard Layout Analysis Report')
    report.push(`Generated: ${new Date().toISOString()}`)
    report.push('')
    
    let totalScore = 0
    let maxTotalScore = 0
    
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      const categoryScore = category.subCriteria.reduce((sum, sub) => sum + sub.score, 0)
      const categoryMaxScore = category.subCriteria.reduce((sum, sub) => sum + sub.maxScore, 0)
      
      totalScore += categoryScore
      maxTotalScore += categoryMaxScore
      
      report.push(`## ${category.category} (${categoryScore}/${categoryMaxScore})`)
      report.push(``)
      report.push(category.description)
      report.push('')
      
      category.subCriteria.forEach(subCriterion => {
        report.push(`### ${subCriterion.name} (${subCriterion.score}/${subCriterion.maxScore})`)
        report.push(``)
        report.push(subCriterion.description)
        report.push('')
        
        if (subCriterion.issues.length > 0) {
          report.push('**Issues Found:**')
          subCriterion.issues.forEach(issue => {
            report.push(`- [${issue.severity.toUpperCase()}] ${issue.description}`)
            if (issue.location) {
              report.push(`  Location: ${issue.location}`)
            }
            report.push(`  Impact: ${issue.impact}`)
          })
          report.push('')
        }
        
        if (subCriterion.recommendations.length > 0) {
          report.push('**Recommendations:**')
          subCriterion.recommendations.forEach(rec => {
            report.push(`- ${rec}`)
          })
          report.push('')
        }
      })
      
      report.push('---')
      report.push('')
    })
    
    report.push(`# Overall Score: ${totalScore.toFixed(1)}/10`)
    report.push('')
    report.push('## Summary')
    report.push(`- **Total Score:** ${totalScore.toFixed(1)}/10`)
    report.push(`- **Passing Threshold:** 9.0/10`)
    report.push(`- **Status:** ${totalScore >= 9.0 ? '✅ PASSING' : '❌ NEEDS IMPROVEMENT'}`)
    report.push('')
    
    if (totalScore < 9.0) {
      report.push('## Priority Improvements')
      report.push('')
      
      const allRecommendations: string[] = []
      Object.keys(breakdown).forEach(categoryKey => {
        const category = breakdown[categoryKey as keyof RatingBreakdown]
        category.subCriteria.forEach(subCriterion => {
          allRecommendations.push(...subCriterion.recommendations)
        })
      })
      
      // Remove duplicates and sort by impact
      const uniqueRecommendations = [...new Set(allRecommendations)]
      uniqueRecommendations.slice(0, 10).forEach((rec, index) => {
        report.push(`${index + 1}. ${rec}`)
      })
    }
    
    return report.join('\n')
  }

  generateImprovementPlan(breakdown: RatingBreakdown): string[] {
    const improvements: string[] = []
    const priorityMap = new Map<string, number>()
    
    Object.keys(breakdown).forEach(categoryKey => {
      const category = breakdown[categoryKey as keyof RatingBreakdown]
      category.subCriteria.forEach(subCriterion => {
        if (subCriterion.score < subCriterion.maxScore) {
          subCriterion.recommendations.forEach(rec => {
            const currentPriority = priorityMap.get(rec) || 0
            priorityMap.set(rec, currentPriority + 1)
          })
        }
      })
    })
    
    // Sort by priority (frequency of recommendation)
    const sortedImprovements = Array.from(priorityMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([rec]) => rec)
    
    return sortedImprovements
  }
}