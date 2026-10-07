import { useState, useRef, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useGetCall, useUpdateCall, CallUpdateStatus, UNREVIEWED_WIDGET_COUNT_KEY } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Clock, 
  CalendarCheck, 
  PhoneMissed, 
  PhoneForwarded, 
  ShieldAlert, 
  PhoneIncoming,
  Bot,
  User,
  Save,
  CheckCircle2,
  Calculator,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDuration } from "@/lib/utils";

const statusConfig = {
  booked: { icon: CalendarCheck, color: "text-green-600", bg: "bg-green-100", label: "Booked" },
  missed: { icon: PhoneMissed, color: "text-red-600", bg: "bg-red-100", label: "Missed" },
  transferred: { icon: PhoneForwarded, color: "text-blue-600", bg: "bg-blue-100", label: "Transferred" },
  spam: { icon: ShieldAlert, color: "text-orange-600", bg: "bg-orange-100", label: "Spam" },
  unresolved: { icon: PhoneIncoming, color: "text-slate-600", bg: "bg-slate-100", label: "Unresolved" },
};

export default function CallDetail() {
  const [, params] = useRoute("/calls/:id");
  const callId = Number(params?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [, navigate] = useLocation();
  const { data: call, isLoading } = useGetCall(callId, {
    query: { enabled: !!callId, queryKey: ['/api/calls', callId] }
  });

  const updateCall = useUpdateCall();

  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<CallUpdateStatus | "">("");
  const [isExtractingQuote, setIsExtractingQuote] = useState(false);
  const initialized = useRef(false);
  const markedReviewed = useRef(false);

  useEffect(() => {
    if (call && !initialized.current) {
      setNotes(call.notes || "");
      setStatus(call.status);
      initialized.current = true;
    }
    // Auto-mark widget chat leads as reviewed when the detail page is opened
    if (call && !call.reviewed && !markedReviewed.current && call.assistantName === "Website Widget") {
      markedReviewed.current = true;
      updateCall.mutate(
        { id: callId, data: { reviewed: true } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: UNREVIEWED_WIDGET_COUNT_KEY });
            queryClient.invalidateQueries({ queryKey: ["/api/calls", callId] });
          },
        }
      );
    }
  }, [call]);

  const handleSaveNotes = () => {
    updateCall.mutate({ id: callId, data: { notes } }, {
      onSuccess: () => {
        toast({ title: "Notes saved successfully" });
      }
    });
  };

  const handleStatusChange = (newStatus: CallUpdateStatus) => {
    setStatus(newStatus);
    updateCall.mutate({ id: callId, data: { status: newStatus } }, {
      onSuccess: () => {
        toast({ title: `Status updated to ${newStatus}` });
      }
    });
  };

  const handleMarkReviewed = () => {
    updateCall.mutate({ id: callId, data: { reviewed: true } }, {
      onSuccess: () => {
        toast({ title: "Call marked as reviewed" });
      }
    });
  };

  const handleCreateQuote = async () => {
    setIsExtractingQuote(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${base}/api/calls/${callId}/extract-quote`, { method: "POST" });
      if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(typeof error.error === "string" ? error.error : "Could not draft a quote from this call.");
      }
      const data = await resp.json();
      sessionStorage.setItem("buildai_prefill_quote", JSON.stringify({
        title: data.suggestedTitle ?? "",
        materials: data.materials ?? [],
        callerName: call?.callerName ?? "",
      }));
      navigate("/quotes");
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Could not draft a quote from this call.", variant: "destructive" });
    } finally {
      setIsExtractingQuote(false);
    }
  };

  if (isLoading || !call) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading call details...</p>
      </div>
    );
  }

  const currentStatusInfo = statusConfig[call.status];
  const StatusIcon = currentStatusInfo?.icon || PhoneIncoming;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="p-4 border-b flex-shrink-0 bg-card flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/calls">
            <Button variant="ghost" size="icon" className="shrink-0 rounded-full">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-secondary">{call.callerName}</h1>
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-semibold ${currentStatusInfo?.bg} ${currentStatusInfo?.color}`}>
                <StatusIcon size={14} />
                {currentStatusInfo?.label}
              </div>
              {call.reviewed && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
                  <CheckCircle2 size={12} /> Reviewed
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{call.callerPhone}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={status} onValueChange={(v) => handleStatusChange(v as CallUpdateStatus)}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="booked">Booked</SelectItem>
              <SelectItem value="unresolved">Unresolved</SelectItem>
              <SelectItem value="transferred">Transferred</SelectItem>
              <SelectItem value="missed">Missed</SelectItem>
              <SelectItem value="spam">Spam</SelectItem>
            </SelectContent>
          </Select>
          {!call.reviewed && (
            <Button size="sm" onClick={handleMarkReviewed} variant="outline" className="gap-2">
              <CheckCircle2 size={16} /> Mark Reviewed
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Transcript Area */}
        <div className="flex-1 border-r flex flex-col bg-slate-50/50">
          <div className="p-4 border-b bg-card flex justify-between items-center">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              Transcript
            </h2>
            <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1"><Clock size={14}/> {formatDuration(call.duration)}</span>
              <span>{format(new Date(call.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {call.transcript && call.transcript.length > 0 ? (
              call.transcript.map((line, idx) => (
                <div key={idx} className={`flex gap-4 max-w-[85%] ${line.speaker === 'caller' ? 'self-start' : 'self-end ml-auto'}`}>
                  {line.speaker === 'caller' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 mt-1">
                      <User size={16} />
                    </div>
                  )}
                  <div className={`p-4 rounded-xl shadow-sm ${
                    line.speaker === 'caller' 
                      ? 'bg-white border' 
                      : 'bg-primary/10 border border-primary/20'
                  }`}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-bold ${line.speaker === 'caller' ? 'text-slate-700' : 'text-primary'}`}>
                        {line.speaker === 'caller' ? call.callerName : call.assistantName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatDuration(line.timestamp)}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-secondary">{line.text}</p>
                  </div>
                  {line.speaker === 'assistant' && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0 mt-1">
                      <Bot size={16} />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No transcript available for this call.
              </div>
            )}
          </div>
        </div>

        {/* Sidebar details */}
        <div className="w-full md:w-80 bg-card flex flex-col overflow-y-auto">
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">AI Outcome Summary</h3>
              <div className="p-4 bg-muted/50 rounded-lg border text-sm leading-relaxed text-secondary">
                {call.outcome || "The AI hasn't generated an outcome summary for this call yet."}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Internal Notes</h3>
              <div className="space-y-3">
                <Textarea 
                  placeholder="Add notes for the crew..."
                  className="min-h-[150px] resize-none bg-white"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <Button 
                  size="sm" 
                  className="w-full gap-2" 
                  onClick={handleSaveNotes}
                  disabled={notes === (call.notes || "")}
                >
                  <Save size={16} /> Save Notes
                </Button>
              </div>
            </div>

            {/* Create Quote from Call */}
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Quick Actions</h3>
              <Button
                className="w-full gap-2"
                variant="outline"
                onClick={handleCreateQuote}
                disabled={isExtractingQuote}
              >
                {isExtractingQuote ? (
                  <><Loader2 size={16} className="animate-spin" /> Extracting materials…</>
                ) : (
                  <><Calculator size={16} /> Create Quote from Call</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                AI drafts a title and adds only materials with clear quantities in the call. Review the quote before sending.
              </p>
            </div>

            {call.jobId && (
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Linked Job</h3>
                <Link href={`/jobs`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer cursor">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CalendarCheck size={18} className="text-primary" />
                        <span className="text-sm font-semibold">View Job #{call.jobId}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
