// Metrics and observability system for tracking application performance and user behavior

interface MetricEvent {
  type: string
  category: 'performance' | 'user_action' | 'api_call' | 'error'
  timestamp: number
  duration?: number
  metadata?: Record<string, any>
  userId?: string
  sessionId?: string
}

interface PerformanceMetric extends MetricEvent {
  category: 'performance'
  operation: string
  duration: number
  success: boolean
}

interface UserActionMetric extends MetricEvent {
  category: 'user_action'
  action: string
  target?: string
  value?: any
}

interface ApiCallMetric extends MetricEvent {
  category: 'api_call'
  endpoint: string
  method: string
  statusCode?: number
  responseTime?: number
  error?: string
}

interface ErrorMetric extends MetricEvent {
  category: 'error'
  error: string
  stack?: string
  context?: string
}

class MetricsCollector {
  private events: MetricEvent[] = []
  private sessionId: string
  private userId?: string
  private maxEvents = 1000
  private batchSize = 50
  private flushInterval = 30000 // 30 seconds
  private flushTimer?: NodeJS.Timeout

  constructor() {
    this.sessionId = this.generateSessionId()
    this.startFlushTimer()
    this.trackPageLoad()
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  private startFlushTimer() {
    this.flushTimer = setInterval(() => {
      this.flush()
    }, this.flushInterval)
  }

  private trackPageLoad() {
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart
        this.trackPerformance('page_load', loadTime, true)
      })
    }
  }

  setUser(userId: string) {
    this.userId = userId
  }

  trackPerformance(operation: string, duration: number, success: boolean = true, metadata?: Record<string, any>) {
    const event: PerformanceMetric = {
      type: 'performance',
      category: 'performance',
      operation,
      duration,
      success,
      timestamp: Date.now(),
      metadata,
      userId: this.userId,
      sessionId: this.sessionId
    }
    this.addEvent(event)
  }

  trackUserAction(action: string, target?: string, value?: any, metadata?: Record<string, any>) {
    const event: UserActionMetric = {
      type: 'user_action',
      category: 'user_action',
      action,
      target,
      value,
      timestamp: Date.now(),
      metadata,
      userId: this.userId,
      sessionId: this.sessionId
    }
    this.addEvent(event)
  }

  trackApiCall(endpoint: string, method: string, startTime: number, options?: {
    statusCode?: number
    error?: string
    metadata?: Record<string, any>
  }) {
    const duration = Date.now() - startTime
    const event: ApiCallMetric = {
      type: 'api_call',
      category: 'api_call',
      endpoint,
      method,
      statusCode: options?.statusCode,
      responseTime: duration,
      error: options?.error,
      timestamp: Date.now(),
      metadata: options?.metadata,
      userId: this.userId,
      sessionId: this.sessionId
    }
    this.addEvent(event)
  }

  trackError(error: string, context?: string, stack?: string, metadata?: Record<string, any>) {
    const event: ErrorMetric = {
      type: 'error',
      category: 'error',
      error,
      context,
      stack,
      timestamp: Date.now(),
      metadata,
      userId: this.userId,
      sessionId: this.sessionId
    }
    this.addEvent(event)
  }

  private addEvent(event: MetricEvent) {
    this.events.push(event)
    
    // Keep only the most recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }

    // Flush if we've reached batch size
    if (this.events.length >= this.batchSize) {
      this.flush()
    }
  }

  private async flush() {
    if (this.events.length === 0) return

    const eventsToSend = [...this.events]
    this.events = []

    try {
      // Send to backend or external service
      await this.sendMetrics(eventsToSend)
      
      // Also log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Metrics flushed:', eventsToSend.length, 'events')
        eventsToSend.forEach(event => {
          console.log(`[${event.category}] ${event.type}:`, event)
        })
      }
    } catch (error) {
      console.error('Failed to send metrics:', error)
      // Put events back if send fails
      this.events.unshift(...eventsToSend)
    }
  }

  private async sendMetrics(events: MetricEvent[]) {
    // In a real implementation, this would send to your analytics service
    // For now, we'll store in localStorage and provide a method to retrieve
    const key = `metrics:${Date.now()}`
    const data = {
      events,
      timestamp: Date.now(),
      userId: this.userId,
      sessionId: this.sessionId
    }
    
    try {
      localStorage.setItem(key, JSON.stringify(data))
      
      // Clean up old metrics (keep last 10 batches)
      const keys = Object.keys(localStorage)
        .filter(k => k.startsWith('metrics:'))
        .sort()
        .slice(-10)
      
      Object.keys(localStorage)
        .filter(k => k.startsWith('metrics:') && !keys.includes(k))
        .forEach(k => localStorage.removeItem(k))
    } catch (error) {
      console.error('Failed to store metrics:', error)
    }
  }

  getMetrics(): MetricEvent[] {
    return [...this.events]
  }

  getMetricsSummary() {
    const events = this.getMetrics()
    const summary = {
      totalEvents: events.length,
      byCategory: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      performance: {
        avgResponseTime: 0,
        slowestOperations: [] as string[]
      },
      errors: [] as string[],
      apiCalls: {
        total: 0,
        byEndpoint: {} as Record<string, number>,
        avgResponseTime: 0
      }
    }

    let totalResponseTime = 0
    let apiResponseTime = 0

    events.forEach(event => {
      // Count by category
      summary.byCategory[event.category] = (summary.byCategory[event.category] || 0) + 1
      
      // Count by type
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1

      // Performance metrics
      if (event.category === 'performance' && 'duration' in event) {
        totalResponseTime += event.duration!
        if (event.duration! > 1000) { // Operations slower than 1 second
          summary.performance.slowestOperations.push(event.operation)
        }
      }

      // API metrics
      if (event.category === 'api_call' && 'responseTime' in event) {
        summary.apiCalls.total++
        summary.apiCalls.byEndpoint[event.endpoint] = (summary.apiCalls.byEndpoint[event.endpoint] || 0) + 1
        apiResponseTime += event.responseTime!
      }

      // Error tracking
      if (event.category === 'error') {
        summary.errors.push(event.error)
      }
    })

    // Calculate averages
    const performanceEvents = events.filter(e => e.category === 'performance' && 'duration' in e)
    if (performanceEvents.length > 0) {
      summary.performance.avgResponseTime = totalResponseTime / performanceEvents.length
    }

    if (summary.apiCalls.total > 0) {
      summary.apiCalls.avgResponseTime = apiResponseTime / summary.apiCalls.total
    }

    return summary
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
    }
    this.flush() // Send any remaining events
  }
}

// Create singleton instance
export const metrics = new MetricsCollector()

// Helper functions for common tracking scenarios
export function trackApiCall(endpoint: string, method: string, startTime: number, options?: {
  statusCode?: number
  error?: string
  metadata?: Record<string, any>
}) {
  return metrics.trackApiCall(endpoint, method, startTime, options)
}

export function trackUserAction(action: string, target?: string, value?: any, metadata?: Record<string, any>) {
  return metrics.trackUserAction(action, target, value, metadata)
}

export function trackPerformance(operation: string, duration: number, success: boolean = true, metadata?: Record<string, any>) {
  return metrics.trackPerformance(operation, duration, success, metadata)
}

export function trackError(error: string, context?: string, stack?: string, metadata?: Record<string, any>) {
  return metrics.trackError(error, context, stack, metadata)
}

// Performance measurement utilities
export function measurePerformance<T>(operation: string, fn: () => T | Promise<T>): T | Promise<T> {
  const startTime = performance.now()
  
  try {
    const result = fn()
    
    if (result instanceof Promise) {
      return result
        .then(value => {
          const duration = performance.now() - startTime
          trackPerformance(operation, duration, true)
          return value
        })
        .catch(error => {
          const duration = performance.now() - startTime
          trackPerformance(operation, duration, false)
          trackError(error.message, operation, error.stack)
          throw error
        })
    } else {
      const duration = performance.now() - startTime
      trackPerformance(operation, duration, true)
      return result
    }
  } catch (error: any) {
    const duration = performance.now() - startTime
    trackPerformance(operation, duration, false)
    trackError(error.message, operation, error.stack)
    throw error
  }
}

// API wrapper with automatic metrics
export async function trackApiCallAsync<T>(
  endpoint: string, 
  method: string, 
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()
  
  try {
    const result = await fn()
    trackApiCall(endpoint, method, startTime, { statusCode: 200 })
    return result
  } catch (error: any) {
    const statusCode = error.response?.status || 500
    trackApiCall(endpoint, method, startTime, { 
      statusCode, 
      error: error.message,
      metadata: { endpoint, method }
    })
    throw error
  }
}