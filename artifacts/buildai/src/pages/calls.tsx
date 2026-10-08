import { useListCalls, ListCallsStatus, useDeleteCall } from "@workspace/api-client-react";
import { Link, useSearch, useLocation } from "wouter";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  PhoneIncoming,
  PhoneMissed,
  PhoneForwarded,
  ShieldAlert,
  CalendarCheck,
  ChevronRight,
  Clock,
  Trash2,
  MessageSquare,
  Phone,
  PhoneCall,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { formatDuration } from "@/lib/utils";

const statusConfig = {
  booked: { icon: CalendarCheck, color: "text-green-600", bg: "bg-green-100", label: "Booked" },
  missed: { icon: PhoneMissed, color: "text-red-600", bg: "bg-red-100", label: "Missed" },
  transferred: { icon: PhoneForwarded, color: "text-blue-600", bg: "bg-blue-100", label: "Transferred" },
  spam: { icon: ShieldAlert, color: "text-orange-600", bg: "bg-orange-100", label: "Spam" },
  unresolved: { icon: PhoneIncoming, color: "text-slate-600", bg: "bg-slate-100", label: "Unresolved" },
};

type SourceFilter = "all" | "phone" | "widget";

export default function Calls() {
  const searchStr = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(searchStr);

  const sourceFilter = (params.get("source") as SourceFilter) || "all";
  const statusFilter = (params.get("status") as ListCallsStatus | "all") || "all";
  const search = params.get("q") || "";

  const setSourceFilter = (value: SourceFilter) => {
    const next = new URLSearchParams(searchStr);
    if (value === "all") next.delete("source"); else next.set("source", value);
    setLocation(`/calls?${next.toString()}`);
  };

  const setStatusFilter = (value: ListCallsStatus | "all") => {
    const next = new URLSearchParams(searchStr);
    if (value === "all") next.delete("status"); else next.set("status", value);
    setLocation(`/calls?${next.toString()}`);
  };

  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchStr);
    if (!value) next.delete("q"); else next.set("q", value);
    setLocation(`/calls?${next.toString()}`);
  };

  const { data: calls = [], isLoading } = useListCalls(
    {
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
    }
  );
  
  const deleteCall = useDeleteCall();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredCalls = calls.filter(call => 
    call.callerName.toLowerCase().includes(search.toLowerCase()) ||
    call.callerPhone.includes(search) ||
    (call.notes && call.notes.toLowerCase().includes(search.toLowerCase()))
  );

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirm("Delete this call record?")) {
      deleteCall.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
          toast({ title: "Call record deleted" });
        }
      });
    }
  };

  const isWidgetChat = (assistantName: string) => assistantName === "Website Widget";

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="p-6 border-b flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">Call Log</h1>
            <p className="text-muted-foreground text-sm">Every interaction, automatically recorded and transcribed.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name, number, or notes..." 
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Source filter */}
          <div className="flex gap-2 shrink-0">
            <Button
              variant={sourceFilter === "all" ? "default" : "outline"}
              className={sourceFilter === "all" ? "" : "bg-white"}
              onClick={() => setSourceFilter("all")}
              size="sm"
            >
              All Channels
            </Button>
            <Button
              variant={sourceFilter === "phone" ? "default" : "outline"}
              className={`gap-1.5 ${sourceFilter === "phone" ? "" : "bg-white"}`}
              onClick={() => setSourceFilter("phone")}
              size="sm"
            >
              <Phone size={14} />
              Phone
            </Button>
            <Button
              variant={sourceFilter === "widget" ? "default" : "outline"}
              className={`gap-1.5 ${sourceFilter === "widget" ? "" : "bg-white"}`}
              onClick={() => setSourceFilter("widget")}
              size="sm"
            >
              <MessageSquare size={14} />
              Website Chat
            </Button>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0 mt-3">
          {(['all', 'booked', 'unresolved', 'transferred', 'missed', 'spam'] as const).map((s) => (
            <Button 
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              className={`capitalize ${statusFilter === s ? "" : "bg-white"}`}
              onClick={() => setStatusFilter(s)}
              size="sm"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="border rounded-lg bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[180px]">Date & Time</TableHead>
                <TableHead>Caller</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Assistant</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    Loading calls...
                  </TableCell>
                </TableRow>
              ) : filteredCalls.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No calls found matching the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCalls.map((call) => {
                  const statusInfo = statusConfig[call.status] || statusConfig.unresolved;
                  const StatusIcon = statusInfo.icon;
                  const widget = isWidgetChat(call.assistantName);
                  
                  return (
                    <TableRow key={call.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="text-sm">{format(new Date(call.createdAt), "MMM d, yyyy")}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(call.createdAt), "h:mm a")}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-bold text-secondary">{call.callerName}</span>
                          <span className="text-xs text-muted-foreground font-mono">{call.callerPhone}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {widget ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-violet-100 text-violet-700">
                            <MessageSquare size={13} />
                            Website Chat
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-100 text-sky-700">
                            <Phone size={13} />
                            Phone
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${statusInfo.bg} ${statusInfo.color}`}>
                          <StatusIcon size={14} />
                          {statusInfo.label}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock size={14} />
                          {formatDuration(call.duration)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-background">
                          {call.assistantName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {widget && call.callerPhone && call.callerPhone !== "Unknown" && (
                            <a href={`tel:${call.callerPhone}`} onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 h-8 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                                title="Call back this lead"
                              >
                                <PhoneCall size={14} />
                                Call Back
                              </Button>
                            </a>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={(e) => handleDelete(e, call.id)}
                          >
                            <Trash2 size={16} />
                          </Button>
                          <Link href={`/calls/${call.id}`}>
                            <Button variant="ghost" size="sm" className="gap-1 h-8">
                              Details <ChevronRight size={16} />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
