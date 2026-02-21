import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'
import { Activity, AlertTriangle, Clock, Users, TrendingUp, RefreshCw } from 'lucide-react'
import { metrics } from '../utils/metrics'

type MetricsSummary = any

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

export default function MetricsDashboard() {
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [isLoading, setIsLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    loadMetrics()
    
    if (autoRefresh) {
      const interval = setInterval(loadMetrics, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const loadMetrics = async () => {
    setIsLoading(true)
    try {
      const metricsSummary = metrics.getMetricsSummary()
      setSummary(metricsSummary)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Failed to load metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  const getCategoryData = () => {
    if (!summary) return []
    return Object.entries(summary.byCategory).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value
    }))
  }

  const getApiEndpointData = () => {
    if (!summary) return []
    return Object.entries(summary.apiCalls.byEndpoint)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }))
  }

  const getPerformanceData = () => {
    if (!summary) return []
    return [
      { name: 'Avg Response', value: summary.performance.avgResponseTime },
      { name: 'API Avg', value: summary.apiCalls.avgResponseTime }
    ]
  }

  if (!summary) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">System Metrics</h2>
          <button
            onClick={loadMetrics}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <div className="text-center text-gray-500">Loading metrics...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">System Metrics Dashboard</h2>
            <p className="text-sm text-gray-600">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300"
              />
              Auto-refresh
            </label>
            <button
              onClick={loadMetrics}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Events</p>
              <p className="text-2xl font-bold">{summary.totalEvents.toLocaleString()}</p>
            </div>
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">API Calls</p>
              <p className="text-2xl font-bold">{summary.apiCalls.total.toLocaleString()}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-green-500" />
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Avg Response Time</p>
              <p className="text-2xl font-bold">{formatDuration(summary.performance.avgResponseTime)}</p>
            </div>
            <Clock className="h-8 w-8 text-yellow-500" />
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Errors</p>
              <p className="text-2xl font-bold">{summary.errors.length}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Event Categories */}
        <div className="rounded-lg border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">Event Categories</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={getCategoryData()}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {getCategoryData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* API Performance */}
        <div className="rounded-lg border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">API Performance</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getPerformanceData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(value) => formatDuration(value)} />
                <Tooltip formatter={(value) => [formatDuration(Number(value)), 'Response Time']} />
                <Bar dataKey="value" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* API Endpoints */}
      {getApiEndpointData().length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">Top API Endpoints</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getApiEndpointData()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10B981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent Errors */}
      {summary.errors.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">Recent Errors</h3>
          <div className="space-y-2">
            {summary.errors.slice(0, 10).map((error, index) => (
              <div key={index} className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="text-sm font-medium text-red-800">{error}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Slow Operations */}
      {summary.performance.slowestOperations.length > 0 && (
        <div className="rounded-lg border bg-white p-6">
          <h3 className="mb-4 text-lg font-semibold">Slow Operations</h3>
          <div className="space-y-2">
            {summary.performance.slowestOperations.slice(0, 10).map((operation, index) => (
              <div key={index} className="flex items-center justify-between rounded-md border p-3">
                <span className="text-sm font-medium">{operation}</span>
                <span className="text-sm text-yellow-600">Slow</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
