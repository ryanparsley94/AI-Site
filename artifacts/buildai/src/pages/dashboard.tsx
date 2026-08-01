import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetDashboardSummary, 
  useGetCallStats, 
  useGetUpcomingJobs, 
  useListAssistants 
} from "@workspace/api-client-react";
import { 
  PhoneCall, 
  Calendar, 
  Briefcase, 
  TrendingUp, 
  Bot, 
  ArrowUpRight,
  Clock,
  PhoneMissed,
  CheckCircle2
} from "lucide-react";
import { Link } from "wouter";
import { formatTime, formatDate, formatCurrency } from "@/lib/utils";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: callStats, isLoading: isLoadingStats } = useGetCallStats();
  const { data: upcomingJobs = [], isLoading: isLoadingJobs } = useGetUpcomingJobs();
  const { data: assistants = [], isLoading: isLoadingAssistants } = useListAssistants();

  // Fake chart data to visualize weekly calls based on stats
  const chartData = [
    { name: "Mon", calls: Math.floor((callStats?.callsThisWeek || 40) * 0.15) },
    { name: "Tue", calls: Math.floor((callStats?.callsThisWeek || 40) * 0.2) },
    { name: "Wed", calls: Math.floor((callStats?.callsThisWeek || 40) * 0.25) },
    { name: "Thu", calls: Math.floor((callStats?.callsThisWeek || 40) * 0.18) },
    { name: "Fri", calls: Math.floor((callStats?.callsThisWeek || 40) * 0.22) },
    { name: "Sat", calls: Math.floor((callStats?.callsThisWeek || 40) * 0.05) },
    { name: "Sun", calls: 0 },
  ];

  return (
    <div className="flex-1 overflow-auto bg-muted/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-secondary">Command Center</h1>
            <p className="text-muted-foreground mt-1">Overview of your operations today.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/calls">
              <Button variant="outline" className="bg-white">View Call Log</Button>
            </Link>
            <Link href="/jobs">
              <Button>Schedule Job</Button>
            </Link>
          </div>
        </div>

        {/* Top metrics row */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-t-4 border-t-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Calls Today</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoadingSummary ? "..." : summary?.callsToday}</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {summary?.missedCallsToday === 0 ? (
                  <span className="text-green-600 flex items-center gap-1"><CheckCircle2 size={12}/> 0 missed</span>
                ) : (
                  <span className="text-red-500 flex items-center gap-1"><PhoneMissed size={12}/> {summary?.missedCallsToday} missed</span>
                )}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Jobs</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoadingSummary ? "..." : summary?.upcomingJobsCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {summary?.jobsThisWeek} scheduled this week
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Booking Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoadingSummary ? "..." : `${Math.round((summary?.bookingRate || 0) * 100)}%`}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Of total calls resulted in a job
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Revenue Est. (Month)</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoadingSummary ? "..." : formatCurrency(summary?.revenueThisMonth || 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on estimated job values
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-7 lg:grid-cols-8">
          
          {/* Main Chart */}
          <Card className="md:col-span-4 lg:col-span-5 flex flex-col">
            <CardHeader>
              <CardTitle>Weekly Call Volume</CardTitle>
              <CardDescription>Number of calls handled by AI assistants over the last 7 days.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <Tooltip 
                    cursor={{ fill: '#f3f4f6' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Active Assistants */}
          <Card className="md:col-span-3 lg:col-span-3">
            <CardHeader>
              <CardTitle>Active Assistants</CardTitle>
              <CardDescription>Status of your AI frontline.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingAssistants ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Loading...</div>
              ) : assistants.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">No assistants configured.</div>
              ) : (
                assistants.map((assistant) => (
                  <div key={assistant.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${assistant.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        <Bot size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{assistant.name}</p>
                        <p className="text-xs text-muted-foreground">{assistant.voice} • {assistant.personality}</p>
                      </div>
                    </div>
                    <Badge variant={assistant.active ? "success" : "secondary"}>
                      {assistant.active ? "Online" : "Offline"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Schedule & Recent Activity Row */}
        <div className="grid gap-6 md:grid-cols-2">
          
          {/* Upcoming Jobs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Today's Schedule</CardTitle>
                <CardDescription>Your crew's upcoming dispatches.</CardDescription>
              </div>
              <Link href="/jobs">
                <Button variant="ghost" size="sm" className="gap-1">View All <ArrowUpRight size={14}/></Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoadingJobs ? (
                <div className="text-center py-4 text-muted-foreground text-sm">Loading schedule...</div>
              ) : upcomingJobs.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <p className="text-muted-foreground text-sm font-medium">No jobs scheduled for today.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {upcomingJobs.slice(0, 5).map(job => (
                    <div key={job.id} className="flex gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex flex-col items-center justify-center min-w-[60px] bg-secondary/5 rounded-md px-2 py-1">
                        <span className="text-xs font-bold text-secondary">{formatTime(job.scheduledAt)}</span>
                        <span className="text-[10px] text-muted-foreground uppercase">{job.estimatedDuration}m</span>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{job.address || 'No address'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] py-0">{job.serviceType}</Badge>
                          <span className="text-[10px] font-medium text-muted-foreground">{job.contactName}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Setup / Quick Actions */}
          <Card className="bg-secondary text-secondary-foreground">
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription className="text-secondary-foreground/70">All systems are running smoothly.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-secondary-foreground/10 p-4 rounded-lg flex items-start gap-4">
                  <div className="bg-green-500/20 text-green-400 p-2 rounded-full shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">AI Receptionist Active</h4>
                    <p className="text-xs text-secondary-foreground/70 mt-1">Handling calls on (555) 019-8234. Routing emergency calls directly to foreman.</p>
                  </div>
                </div>
                
                <div className="bg-secondary-foreground/10 p-4 rounded-lg flex items-start gap-4">
                  <div className="bg-primary/20 text-primary p-2 rounded-full shrink-0">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">After-hours Mode: Scheduled</h4>
                    <p className="text-xs text-secondary-foreground/70 mt-1">Will engage at 6:00 PM to capture night leads and dispatch only critical emergencies.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-secondary-foreground/10">
                  <Button variant="outline" className="bg-transparent border-secondary-foreground/20 hover:bg-secondary-foreground/10">
                    Test Call AI
                  </Button>
                  <Button variant="outline" className="bg-transparent border-secondary-foreground/20 hover:bg-secondary-foreground/10">
                    Configure Routing
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
