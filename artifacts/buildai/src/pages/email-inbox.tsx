import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import {
  useListEmailThreads,
  useGetEmailThread,
  useUpdateEmailThread,
  useApproveEmailThread,
  useDismissEmailThread,
  useDeleteEmailThread,
  useGetEmailSettings,
  useUpdateEmailSettings,
  useCreateEmailThread,
  ListEmailThreadsParams,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  MailOpen,
  CheckCircle,
  XCircle,
  Clock,
  Settings,
  Send,
  Edit3,
  Trash2,
  RefreshCw,
  Copy,
  Inbox,
  ChevronRight,
  AlertTriangle,
  PenLine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "sent" | "dismissed";

// ─── Log Email Dialog ─────────────────────────────────────────────────────────

function LogEmailDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const createThread = useCreateEmailThread();
  const { toast } = useToast();
  const [form, setForm] = useState({
    fromName: "",
    fromEmail: "",
    subject: "",
    bodyText: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fromEmail.trim() || !form.subject.trim() || !form.bodyText.trim()) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    createThread.mutate(
      {
        data: {
          fromName: form.fromName || undefined,
          fromEmail: form.fromEmail,
          subject: form.subject,
          bodyText: form.bodyText,
        },
      },
      {
        onSuccess: (thread) => {
          toast({
            title: "Email logged",
            description: "An AI reply is being drafted.",
          });
          setForm({ fromName: "", fromEmail: "", subject: "", bodyText: "" });
          onCreated(thread.id);
          onClose();
        },
        onError: () => {
          toast({ title: "Failed to log email", variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine size={17} className="text-primary" />
            Log email inquiry
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fromName">Sender name</Label>
              <Input
                id="fromName"
                name="fromName"
                placeholder="Jane Smith"
                value={form.fromName}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fromEmail">
                Sender email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fromEmail"
                name="fromEmail"
                type="email"
                placeholder="jane@example.com"
                value={form.fromEmail}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject">
              Subject <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subject"
              name="subject"
              placeholder="Roofing quote request"
              value={form.subject}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bodyText">
              Message body <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="bodyText"
              name="bodyText"
              placeholder="Paste the email content here…"
              rows={6}
              className="resize-none text-sm"
              value={form.bodyText}
              onChange={handleChange}
              required
            />
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createThread.isPending} className="gap-2">
              <Send size={14} />
              {createThread.isPending ? "Saving…" : "Log & draft reply"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-100",
    badgeVariant: "outline" as const,
  },
  sent: {
    label: "Sent",
    icon: CheckCircle,
    color: "text-green-600",
    bg: "bg-green-100",
    badgeVariant: "outline" as const,
  },
  dismissed: {
    label: "Dismissed",
    icon: XCircle,
    color: "text-slate-500",
    bg: "bg-slate-100",
    badgeVariant: "outline" as const,
  },
};

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { data: settings, isLoading } = useGetEmailSettings();
  const updateSettings = useUpdateEmailSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleToggleAutoSend = (checked: boolean) => {
    updateSettings.mutate(
      { data: { autoSend: checked } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads/settings"] });
          toast({ title: checked ? "Auto-send enabled" : "Auto-send disabled" });
        },
      }
    );
  };

  const handleCopy = () => {
    if (settings?.forwardingAddress) {
      navigator.clipboard.writeText(settings.forwardingAddress);
      toast({ title: "Webhook URL copied to clipboard" });
    }
  };

  return (
    <div className="border rounded-xl bg-card p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-secondary">
          <Settings size={16} />
          Email Inbox Settings
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading settings…</div>
      ) : (
        <>
          {/* Email delivery status */}
          {settings?.resendConfigured ? (
            <div className="flex items-center gap-2.5 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <CheckCircle size={16} className="text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-800">Email delivery active</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Approved replies are sent via Resend. Set{" "}
                  <code className="bg-green-100 px-1 rounded">RESEND_FROM_EMAIL</code> to customise the sender address.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Email delivery not configured</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Add <code className="bg-amber-100 px-1 rounded">RESEND_API_KEY</code> and{" "}
                  <code className="bg-amber-100 px-1 rounded">RESEND_FROM_EMAIL</code> as Replit Secrets to enable outbound sending. Until then, approved replies are recorded but not delivered.
                </p>
              </div>
            </div>
          )}

          {/* Auto-send toggle */}
          <div className="flex items-center justify-between py-3 border-b">
            <div>
              <Label className="text-sm font-medium">Auto-send replies</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When on, the AI reply is sent immediately without approval
              </p>
            </div>
            <Switch
              checked={settings?.autoSend ?? false}
              onCheckedChange={handleToggleAutoSend}
              disabled={updateSettings.isPending}
            />
          </div>

          {/* Forwarding / webhook address */}
          <div>
            <Label className="text-sm font-medium">Inbound webhook URL</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-2">
              Configure Resend to forward incoming emails to this address
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md border truncate text-muted-foreground">
                {settings?.forwardingAddress ?? "Loading…"}
              </code>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy size={14} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Set <code className="bg-muted px-1 rounded text-xs">RESEND_WEBHOOK_SECRET</code> (from Resend → Webhooks → Signing secret) and{" "}
              <code className="bg-muted px-1 rounded text-xs">RESEND_API_KEY</code> as environment secrets, then add this URL as your Resend inbound webhook endpoint.
              Emails routed to your Resend inbound address will automatically appear here with AI-drafted replies.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function EmailDetail({
  id,
  onClose,
}: {
  id: number;
  onClose: () => void;
}) {
  const { data: thread, isLoading } = useGetEmailThread(id);
  const [isEditing, setIsEditing] = useState(false);
  const [editedReply, setEditedReply] = useState("");
  const updateThread = useUpdateEmailThread();
  const approveThread = useApproveEmailThread();
  const dismissThread = useDismissEmailThread();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleStartEdit = () => {
    setEditedReply(thread?.editedReply ?? thread?.aiReply ?? "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!thread) return;
    updateThread.mutate(
      { id: thread.id, data: { editedReply } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads", id] });
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads"] });
          setIsEditing(false);
          toast({ title: "Reply updated" });
        },
      }
    );
  };

  const handleApprove = () => {
    if (!thread) return;
    approveThread.mutate(
      { id: thread.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads"] });
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads", id] });
          toast({ title: "Reply sent!" });
          onClose();
        },
        onError: (err: unknown) => {
          const msg =
            (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            "Failed to send reply. Set RESEND_API_KEY to enable outbound email.";
          toast({ title: "Delivery failed", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleDismiss = () => {
    if (!thread) return;
    dismissThread.mutate(
      { id: thread.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads"] });
          toast({ title: "Email dismissed" });
          onClose();
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!thread) return null;

  const cfg = statusConfig[thread.status as keyof typeof statusConfig];
  const StatusIcon = cfg?.icon ?? Clock;
  const displayReply = isEditing
    ? editedReply
    : thread.editedReply ?? thread.aiReply ?? "";

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold text-secondary truncate">{thread.subject}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            From{" "}
            <span className="font-medium text-foreground">
              {thread.fromName || thread.fromEmail}
            </span>{" "}
            &lt;{thread.fromEmail}&gt; ·{" "}
            {format(new Date(thread.createdAt), "MMM d, yyyy h:mm a")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              cfg?.bg,
              cfg?.color
            )}
          >
            <StatusIcon size={12} />
            {cfg?.label ?? thread.status}
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground md:hidden"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Original email body */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Inbound message
          </h3>
          <div className="bg-muted/40 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap border">
            {thread.bodyText || <em className="text-muted-foreground">(No body)</em>}
          </div>
        </div>

        {/* AI-drafted reply */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              AI-drafted reply
              {thread.editedReply && (
                <span className="text-primary text-xs font-normal normal-case tracking-normal">
                  (edited)
                </span>
              )}
            </h3>
            {thread.status === "pending" && !isEditing && (
              <Button variant="ghost" size="sm" onClick={handleStartEdit} className="h-7 text-xs">
                <Edit3 size={13} className="mr-1" />
                Edit
              </Button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editedReply}
                onChange={(e) => setEditedReply(e.target.value)}
                rows={8}
                className="text-sm resize-none"
                placeholder="Edit your reply…"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={updateThread.isPending}>
                  Save changes
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap border",
                thread.status === "pending"
                  ? "bg-primary/5 border-primary/20"
                  : "bg-muted/40"
              )}
            >
              {displayReply || (
                <em className="text-muted-foreground">No AI reply drafted.</em>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      {thread.status === "pending" && !isEditing && (
        <div className="p-4 border-t flex items-center gap-3 bg-background">
          <Button
            onClick={handleApprove}
            disabled={approveThread.isPending}
            className="gap-2"
          >
            <Send size={15} />
            {approveThread.isPending ? "Sending…" : "Approve & Send"}
          </Button>
          <Button
            variant="outline"
            onClick={handleDismiss}
            disabled={dismissThread.isPending}
          >
            <XCircle size={15} className="mr-1.5" />
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export default function EmailInbox() {
  const searchStr = useSearch();
  const initialThreadId = searchStr
    ? Number(new URLSearchParams(searchStr).get("thread")) || null
    : null;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialThreadId ? "all" : "pending"
  );
  const [selectedId, setSelectedId] = useState<number | null>(initialThreadId);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogEmail, setShowLogEmail] = useState(false);

  // When a thread ID arrives via URL (e.g. from Contacts page), select it
  useEffect(() => {
    if (initialThreadId) setSelectedId(initialThreadId);
  }, [initialThreadId]);
  const deleteThread = useDeleteEmailThread();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params: ListEmailThreadsParams =
    statusFilter !== "all" ? { status: statusFilter } : {};

  const { data: threads = [], isLoading, refetch } = useListEmailThreads(params);

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this email thread?")) return;
    deleteThread.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads"] });
          if (selectedId === id) setSelectedId(null);
          toast({ title: "Thread deleted" });
        },
      }
    );
  };

  const pendingCount = threads.filter((t) => t.status === "pending").length;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Page header */}
      <div className="p-6 border-b flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary flex items-center gap-2">
              <Inbox size={22} className="text-primary" />
              Email Inbox
              {pendingCount > 0 && (
                <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full px-2 py-0.5 font-medium">
                  {pendingCount}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              AI-drafted replies for every inbound email inquiry.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <RefreshCw size={14} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setShowLogEmail(true)}
              className="gap-1.5"
            >
              <PenLine size={14} />
              Log email
            </Button>
            <Button
              variant={showSettings ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowSettings((v) => !v)}
              className="gap-1.5"
            >
              <Settings size={14} />
              Settings
            </Button>
          </div>
        </div>

        {/* Settings panel (inline) */}
        {showSettings && (
          <div className="mt-4">
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 mt-5">
          {(["pending", "all", "sent", "dismissed"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors capitalize",
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: list + detail */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thread list */}
        <div
          className={cn(
            "flex flex-col overflow-y-auto border-r",
            selectedId ? "hidden md:flex md:w-[340px] shrink-0" : "flex-1"
          )}
        >
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Loading emails…
            </div>
          ) : threads.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Mail size={36} className="text-muted-foreground/40 mb-3" />
              <p className="font-medium text-muted-foreground">No emails here</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                {statusFilter === "pending"
                  ? "You're all caught up! New inbound emails will appear here."
                  : `No ${statusFilter} emails found.`}
              </p>
            </div>
          ) : (
            threads.map((thread) => {
              const cfg = statusConfig[thread.status as keyof typeof statusConfig];
              const StatusIcon = cfg?.icon ?? Clock;
              const isSelected = selectedId === thread.id;
              return (
                <div
                  key={thread.id}
                  onClick={() => setSelectedId(thread.id)}
                  className={cn(
                    "flex items-start gap-3 px-4 py-4 border-b cursor-pointer transition-colors hover:bg-muted/50 group",
                    isSelected && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 p-1.5 rounded-full shrink-0",
                      thread.status === "pending" ? "bg-amber-100" : "bg-muted"
                    )}
                  >
                    {thread.status === "pending" ? (
                      <Mail
                        size={14}
                        className="text-amber-600"
                      />
                    ) : (
                      <MailOpen size={14} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold truncate text-secondary">
                        {thread.fromName || thread.fromEmail}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {format(new Date(thread.createdAt), "MMM d")}
                      </span>
                    </div>
                    <p className="text-sm truncate text-foreground/80 mt-0.5">
                      {thread.subject}
                    </p>
                    <div className="flex items-center justify-between mt-1.5">
                      <span
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium",
                          cfg?.color
                        )}
                      >
                        <StatusIcon size={11} />
                        {cfg?.label ?? thread.status}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => handleDelete(e, thread.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={13} />
                        </button>
                        <ChevronRight size={14} className="text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Email detail panel */}
        {selectedId ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <EmailDetail
              id={selectedId}
              onClose={() => setSelectedId(null)}
            />
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-center p-8">
            <div>
              <MailOpen size={40} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Select an email to view details and the AI-drafted reply
              </p>
            </div>
          </div>
        )}
      </div>

      <LogEmailDialog
        open={showLogEmail}
        onClose={() => setShowLogEmail(false)}
        onCreated={(id) => {
          queryClient.invalidateQueries({ queryKey: ["/api/email-threads"] });
          setStatusFilter("pending");
          setSelectedId(id);
        }}
      />
    </div>
  );
}
