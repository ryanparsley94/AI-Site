import React from 'react';
import {
  PhoneCall, Calendar, Bot, Clock,
  Receipt, Mail, Plus,
  FileText, Zap
} from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';

const MOCK_ACTIVITY = [
  { id: "1", type: "call", title: "John Doe", sub: "Inbound call about roofing", time: new Date(), badge: "Booked", badgeColor: "bg-emerald-100 text-emerald-700" },
  { id: "2", type: "email", title: "Acme Corp", sub: "Invoice #1042 inquiry", time: new Date(Date.now() - 3600000), badge: "Pending", badgeColor: "bg-amber-100 text-amber-700" },
  { id: "3", type: "call", title: "Unknown Caller", sub: "Missed call", time: new Date(Date.now() - 7200000), badge: "Missed", badgeColor: "bg-red-100 text-red-700" },
  { id: "4", type: "call", title: "Alice Smith", sub: "Follow up on quote", time: new Date(Date.now() - 14400000) },
];

const MOCK_JOBS = [
  { id: "1", title: "Site Inspection", contactName: "Alice Smith", address: "123 Main St", scheduledAt: new Date().toISOString(), status: "scheduled" },
  { id: "2", title: "Plumbing Rough-in", contactName: "Bob Jones", address: "456 Oak Ave", scheduledAt: new Date(Date.now() + 86400000).toISOString(), status: "in-progress" },
  { id: "3", title: "Electrical Check", contactName: "Charlie Brown", address: "789 Pine Ln", scheduledAt: new Date(Date.now() + 172800000).toISOString(), status: "scheduled" },
];

const MOCK_INVOICES = [
  { id: "1", invoiceNumber: "INV-1042", clientName: "Acme Corp", dueDate: "Aug 10", total: 1450.00, status: "sent" },
  { id: "2", invoiceNumber: "INV-1043", clientName: "Alice Smith", dueDate: "Aug 12", total: 850.00, status: "overdue" },
];

const MOCK_ASSISTANTS = [
  { id: "1", name: "Sarah (Reception)", personality: "Friendly", voice: "Female", active: true },
  { id: "2", name: "Mike (Estimator)", personality: "Professional", voice: "Male", active: false },
];

const MOCK_CHART_DATA = [
  { name: "Mon", calls: 12 },
  { name: "Tue", calls: 18 },
  { name: "Wed", calls: 24 },
  { name: "Thu", calls: 16 },
  { name: "Fri", calls: 10 },
  { name: "Sat", calls: 4 },
  { name: "Sun", calls: 2 },
];

function jobDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE d MMM");
}

function formatTime(dateStr: string) {
  return format(new Date(dateStr), "h:mm a");
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function DashboardVariant() {
  const today = format(new Date(), "EEEE, d MMMM yyyy");
  
  const stats = [
    { label: "Calls Today", value: 14, icon: PhoneCall },
    { label: "Pending Emails", value: 3, icon: Mail },
    { label: "Jobs This Wk", value: 8, icon: Calendar },
    { label: "Unpaid Inv.", value: "$2,300", icon: Receipt },
    { label: "AI Team", value: "1/2", icon: Bot },
  ];

  const maxCalls = Math.max(...MOCK_CHART_DATA.map(d => d.calls));

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">{today}</p>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">Command Center</h1>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="bg-white border border-slate-200/60 rounded-[20px] shadow-sm flex flex-col md:flex-row overflow-hidden">
          {stats.map((stat, i) => (
            <div key={i} className="flex-1 p-6 relative border-b md:border-b-0 md:border-r border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-2 text-slate-500 mb-2">
                <stat.icon size={16} className="text-blue-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider">{stat.label}</span>
              </div>
              <div className="text-3xl font-black tracking-tight text-slate-900">
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Main Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Feed & Operations (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            
            {/* Timeline: Activity + Jobs combined into a split view */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Activity Feed */}
              <div className="bg-white border border-slate-200/60 rounded-[20px] shadow-sm flex flex-col">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 rounded-t-[20px]">
                  <h2 className="text-sm font-bold flex items-center gap-2"><Clock size={16} className="text-slate-400"/> Recent Activity</h2>
                </div>
                <div className="flex-1 p-2">
                  {MOCK_ACTIVITY.map(item => {
                    const Icon = item.type === "call" ? PhoneCall : Mail;
                    return (
                      <div key={item.id} className="flex items-start gap-3 p-4 hover:bg-slate-50/50 rounded-xl transition-colors">
                        <div className={`p-2 rounded-lg shrink-0 ${item.type === 'call' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-bold truncate text-slate-900">{item.title}</span>
                            {item.badge && (
                              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md leading-none ${item.badgeColor}`}>
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-medium text-slate-500 truncate">{item.sub}</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-400 whitespace-nowrap pt-1">
                          {format(item.time, "h:mm a")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upcoming Jobs */}
              <div className="bg-white border border-slate-200/60 rounded-[20px] shadow-sm flex flex-col">
                <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30 rounded-t-[20px]">
                  <h2 className="text-sm font-bold flex items-center gap-2"><Calendar size={16} className="text-slate-400"/> Upcoming Jobs</h2>
                </div>
                <div className="flex-1 p-2">
                  {MOCK_JOBS.map(job => (
                    <div key={job.id} className="flex items-start gap-4 p-4 hover:bg-slate-50/50 rounded-xl transition-colors">
                      <div className="shrink-0 text-center w-12 pt-0.5">
                        <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{jobDayLabel(job.scheduledAt)}</p>
                        <p className="text-sm font-black text-slate-900 leading-tight">{formatTime(job.scheduledAt).split(' ')[0]}</p>
                      </div>
                      <div className="w-[2px] self-stretch bg-slate-100 mx-1 rounded-full"></div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <p className="text-sm font-bold text-slate-900 truncate mb-0.5">{job.title}</p>
                        <p className="text-xs font-medium text-slate-500 truncate">{job.contactName}</p>
                        <p className="text-[11px] font-bold text-slate-400 truncate mt-2 flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${job.status === 'scheduled' ? 'bg-blue-500' : 'bg-amber-400'}`}></span>
                          {job.status === 'scheduled' ? 'SCHEDULED' : 'IN PROGRESS'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Weekly Call Volume Chart */}
            <div className="bg-white border border-slate-200/60 rounded-[20px] shadow-sm p-6 lg:p-8">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Call Volume</h2>
                  <p className="text-sm text-slate-500 mt-1 font-medium">Inbound & outbound across all AI agents</p>
                </div>
                <div className="text-right">
                  <span className="text-4xl font-black text-slate-900">86</span>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">This Week</p>
                </div>
              </div>
              
              <div className="h-48 flex items-end gap-2 sm:gap-4 relative mt-10">
                {/* Y-axis grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="w-full h-[1px] bg-slate-100"></div>
                  <div className="w-full h-[1px] bg-slate-100"></div>
                  <div className="w-full h-[1px] bg-slate-100"></div>
                  <div className="w-full h-[1px] bg-slate-100"></div>
                </div>
                
                {MOCK_CHART_DATA.map(d => (
                  <div key={d.name} className="flex-1 flex flex-col items-center justify-end h-full z-10 group">
                    <div className="w-full max-w-[40px] bg-blue-50 rounded-t-lg relative flex items-end overflow-hidden group-hover:bg-blue-100 transition-colors" style={{ height: `${(d.calls / maxCalls) * 100}%` }}>
                      <div className="w-full bg-blue-600 rounded-t-lg opacity-90 group-hover:opacity-100 transition-opacity" style={{ height: '100%' }}></div>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 mt-4 uppercase tracking-wider">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Right Column: Admin & Actions (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-8">
            
            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-3">
              <button className="flex flex-col items-center justify-center gap-3 p-6 rounded-[20px] bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition-colors">
                <Calendar size={24} />
                <span className="text-sm font-bold">New Job</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-3 p-6 rounded-[20px] bg-white border border-slate-200 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-all">
                <FileText size={24} className="text-slate-400" />
                <span className="text-sm font-bold">Quote</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-3 p-6 rounded-[20px] bg-white border border-slate-200 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-all">
                <Receipt size={24} className="text-slate-400" />
                <span className="text-sm font-bold">Invoice</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-3 p-6 rounded-[20px] bg-white border border-slate-200 text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 transition-all">
                <Mail size={24} className="text-slate-400" />
                <span className="text-sm font-bold">Email</span>
              </button>
            </div>

            {/* Invoices Block */}
            <div className="bg-white border border-slate-200/60 rounded-[20px] shadow-sm">
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-red-50/50 rounded-t-[20px]">
                <h2 className="text-sm font-bold flex items-center gap-2"><Receipt size={16} className="text-red-500"/> Outstanding</h2>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-red-100 text-red-700 px-2 py-0.5 rounded-md">Action Needed</span>
              </div>
              <div className="p-6">
                <div className="mb-6">
                  <span className="text-4xl font-black tracking-tight text-slate-900">$2,300</span>
                  <p className="text-sm font-medium text-slate-500 mt-1">Total across 2 invoices</p>
                </div>
                <div className="space-y-4">
                  {MOCK_INVOICES.map(inv => (
                    <div key={inv.id} className="flex justify-between items-center group cursor-pointer p-2 hover:bg-slate-50 rounded-lg -mx-2 transition-colors">
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{inv.clientName}</p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">{inv.invoiceNumber} • Due {inv.dueDate}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(inv.total)}</p>
                        <p className={`text-[10px] font-bold uppercase mt-1 ${inv.status === 'overdue' ? 'text-red-500' : 'text-slate-400'}`}>
                          {inv.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="w-full mt-6 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  View All Invoices
                </button>
              </div>
            </div>

            {/* AI Team Block */}
            <div className="bg-slate-900 rounded-[20px] shadow-sm text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-500/20 rounded-full blur-2xl"></div>
              
              <div className="px-6 py-5 border-b border-slate-800/60 flex justify-between items-center relative z-10">
                <h2 className="text-sm font-bold flex items-center gap-2"><Zap size={16} className="text-blue-400"/> AI Office Team</h2>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">1 Online</span>
                </div>
              </div>
              <div className="p-4 relative z-10">
                {MOCK_ASSISTANTS.map(a => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-800/50">
                    <div className={`p-2.5 rounded-xl shrink-0 ${a.active ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                      <Bot size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-100 truncate">{a.name}</p>
                      <p className="text-xs font-medium text-slate-400 mt-0.5">{a.personality} · {a.voice}</p>
                    </div>
                  </div>
                ))}
                <button className="w-full mt-4 py-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-sm font-bold text-slate-300 transition-colors flex items-center justify-center gap-2">
                  <Plus size={16} /> Add Agent
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
