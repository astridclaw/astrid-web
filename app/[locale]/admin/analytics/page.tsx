'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowUpIcon, ArrowDownIcon, Users, Calendar, TrendingUp, Settings, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface DailyStats {
  date: string
  dau: number
  wau: number
  mau: number
  dauWebDesktop: number
  dauWebIPhone: number
  dauWebAndroid: number
  dauIOSApp: number
  dauAPIOther: number
  dauUnknown: number
  taskCreated: number
  taskEdited: number
  taskCompleted: number
  taskDeleted: number
  commentAdded: number
  commentDeleted: number
  listAdded: number
  listEdited: number
  listDeleted: number
  settingsUpdated: number
}

interface AnalyticsSummary {
  date: string
  dau: number
  wau: number
  mau: number
  dauChange: number | null
  wauChange: number | null
  mauChange: number | null
  platformBreakdown: Record<string, number>
  eventCounts: Record<string, number>
}

interface AnalyticsData {
  stats: DailyStats[]
  summary: AnalyticsSummary | null
  meta: {
    startDate: string
    endDate: string
    totalDays: number
  }
}

function MetricCard({
  title,
  value,
  change,
  icon: Icon,
}: {
  title: string
  value: number
  change: number | null
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value.toLocaleString()}</div>
        {change !== null && (
          <p className={`text-xs ${change >= 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
            {change >= 0 ? <ArrowUpIcon className="h-3 w-3 mr-1" /> : <ArrowDownIcon className="h-3 w-3 mr-1" />}
            {Math.abs(change)}% from yesterday
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function AnalyticsDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState(30)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - dateRange)

      const response = await fetch(
        `/api/admin/analytics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      )

      if (response.status === 403) {
        setError('You do not have admin access to view analytics.')
        return
      }

      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }

      const result = await response.json()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/auth/signin')
      return
    }
    fetchData()
  }, [session, status, router, fetchData])

  if (status === 'loading' || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold">Access Denied</h2>
          <p className="text-red-600">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/')}>
            Go Home
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Prepare chart data
  const chartData = data.stats.map((stat) => ({
    date: new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    DAU: stat.dau,
    WAU: stat.wau,
    MAU: stat.mau,
  }))

  // Platform trend data for DAU breakdown over time
  const platformTrendData = data.stats.map((stat) => ({
    date: new Date(stat.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    'Desktop Web': stat.dauWebDesktop,
    'iPhone Web': stat.dauWebIPhone,
    'Android Web': stat.dauWebAndroid,
    'iOS App': stat.dauIOSApp,
    API: stat.dauAPIOther,
    Unknown: stat.dauUnknown,
  }))

  // Check if there's any platform data
  const hasPlatformData = data.stats.some(
    (stat) =>
      stat.dauWebDesktop > 0 ||
      stat.dauWebIPhone > 0 ||
      stat.dauWebAndroid > 0 ||
      stat.dauIOSApp > 0 ||
      stat.dauAPIOther > 0 ||
      stat.dauUnknown > 0
  )

  // Event counts for bar chart
  const eventData = data.summary
    ? [
        { name: 'Tasks Created', value: data.summary.eventCounts.taskCreated },
        { name: 'Tasks Completed', value: data.summary.eventCounts.taskCompleted },
        { name: 'Tasks Edited', value: data.summary.eventCounts.taskEdited },
        { name: 'Comments Added', value: data.summary.eventCounts.commentAdded },
        { name: 'Lists Added', value: data.summary.eventCounts.listAdded },
      ]
    : []

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground">User activity and engagement metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Link href="/admin/analytics/admins">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Manage Admins
            </Button>
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <MetricCard
          title="Daily Active Users"
          value={data.summary?.dau || 0}
          change={data.summary?.dauChange ?? null}
          icon={Users}
        />
        <MetricCard
          title="Weekly Active Users"
          value={data.summary?.wau || 0}
          change={data.summary?.wauChange ?? null}
          icon={Calendar}
        />
        <MetricCard
          title="Monthly Active Users"
          value={data.summary?.mau || 0}
          change={data.summary?.mauChange ?? null}
          icon={TrendingUp}
        />
      </div>

      {/* Trend Chart */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>User Activity Trends</CardTitle>
          <CardDescription>DAU, WAU, and MAU over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="DAU" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="WAU" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="MAU" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Platform Trends */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>DAU by Platform</CardTitle>
          <CardDescription>Daily active users breakdown by platform over time</CardDescription>
        </CardHeader>
        <CardContent>
          {hasPlatformData ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={platformTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Desktop Web" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="iPhone Web" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Android Web" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="iOS App" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="API" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Unknown" stroke="#6b7280" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              No platform data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Activity */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Event Activity</CardTitle>
          <CardDescription>Actions performed today</CardDescription>
        </CardHeader>
        <CardContent>
          {eventData.some((e) => e.value > 0) ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              No events recorded today
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Metrics</CardTitle>
          <CardDescription>Raw daily statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-right py-2 px-2">DAU</th>
                  <th className="text-right py-2 px-2">WAU</th>
                  <th className="text-right py-2 px-2">MAU</th>
                  <th className="text-right py-2 px-2">Tasks</th>
                  <th className="text-right py-2 px-2">Comments</th>
                </tr>
              </thead>
              <tbody>
                {data.stats
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((stat) => (
                    <tr key={stat.date} className="border-b">
                      <td className="py-2 px-2">
                        {new Date(stat.date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="text-right py-2 px-2">{stat.dau}</td>
                      <td className="text-right py-2 px-2">{stat.wau}</td>
                      <td className="text-right py-2 px-2">{stat.mau}</td>
                      <td className="text-right py-2 px-2">{stat.taskCreated + stat.taskCompleted}</td>
                      <td className="text-right py-2 px-2">{stat.commentAdded}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
