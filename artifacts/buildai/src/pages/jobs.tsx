import { useState } from "react";
import {
  useListJobs,
  useCreateJob,
  useGetJob,
  useUpdateJob,
  useDeleteJob,
  useListQuotes,
  useUpdateQuote,
  useListInvoices,
  JobInputStatus,
  JobUpdateStatus,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar, Plus, MapPin, Search, Clock, DollarSign,
  ListFilter, Trash2, FileText, Receipt, Link2, CheckCircle, Send
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";

const jobStatusConfig = {
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700" },
  completed: { label: "Completed", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
};

const invoiceStatusConfig = {
  draft: { label: "Draft", color: "bg-slate-100 text-slate-700" },
  sent: { label: "Sent", color: "bg-blue-100 text-blue-700" },
  paid: { label: "Paid", color: "bg-green-100 text-green-700" },
};

// ── Financials section inside edit dialog ────────────────────────────────────

function JobFinancials({ jobId }: { jobId: number }) {
  const { data: linkedQuotes = [], isLoading: loadingQuotes } = useListQuotes({ jobId });
  const { data: invoices = [], isLoading: loadingInvoices } = useListInvoices({ jobId });
  const { data: allQuotes = [] } = useListQuotes();
  const updateQuote = useUpdateQuote();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showPicker, setShowPicker] = useState(false);
  const [quoteSearch, setQuoteSearch] = useState("");

  const linkedQuote = linkedQuotes[0] ?? null;

  const unlinkedQuotes = allQuotes.filter(q => !q.jobId);
  const filteredUnlinked = unlinkedQuotes.filter(q =>
    q.title.toLowerCase().includes(quoteSearch.toLowerCase())
  );

  const linkQuote = (quoteId: number) => {
    updateQuote.mutate({ id: quoteId, data: { jobId } }, {
      onSuccess: () => {
        toast({ title: "Quote linked to job" });
        queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey({ jobId }) });
        setShowPicker(false);
        setQuoteSearch("");
      },
      onError: () => {
        toast({ title: "Failed to link quote", variant: "destructive" });
      }
    });
  };

  const unlinkQuote = (quoteId: number) => {
    updateQuote.mutate({ id: quoteId, data: { jobId: null } }, {
      onSuccess: () => {
        toast({ title: "Quote unlinked" });
        queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey({ jobId }) });
      }
    });
  };

  if (loadingQuotes || loadingInvoices) {
    return <div className="text-sm text-muted-foreground py-2">Loading financials...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Linked quote */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-secondary flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Linked Quote
          </h4>
          {!linkedQuote && (
            <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => setShowPicker(!showPicker)}>
              <Link2 className="h-3 w-3" /> Link a Quote
            </Button>
          )}
        </div>

        {showPicker && (
          <div className="border rounded-md p-3 space-y-2 bg-muted/20">
            <Input
              placeholder="Search unlinked quotes..."
              value={quoteSearch}
              onChange={e => setQuoteSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="max-h-36 overflow-auto divide-y">
              {filteredUnlinked.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No unlinked quotes found.</p>
              ) : filteredUnlinked.map(q => (
                <button
                  key={q.id}
                  type="button"
                  className="w-full text-left px-2 py-2 text-sm hover:bg-muted transition-colors"
                  onClick={() => linkQuote(q.id)}
                >
                  <div className="font-medium">{q.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {q.totalIncVat !== null && q.totalIncVat !== undefined
                      ? `${formatCurrency(q.totalIncVat)} inc. VAT`
                      : formatCurrency(q.grandTotal)}
                    · {(q.materials as unknown[]).length} items
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {linkedQuote ? (
          <div className="bg-muted/30 rounded-md p-3 border flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">{linkedQuote.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(linkedQuote.materials as unknown[]).length} materials ·
                {linkedQuote.totalIncVat !== null && linkedQuote.totalIncVat !== undefined ? (
                  <> <span className="font-semibold text-secondary">{formatCurrency(linkedQuote.totalIncVat)}</span> inc. VAT</>
                ) : (
                  <> {formatCurrency(linkedQuote.grandTotal)} (ex-VAT)</>
                )}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-destructive shrink-0"
              onClick={() => unlinkQuote(linkedQuote.id)}
            >
              Unlink
            </Button>
          </div>
        ) : (
          !showPicker && (
            <p className="text-xs text-muted-foreground italic">No quote linked to this job.</p>
          )
        )}
      </div>

      <Separator />

      {/* Invoices */}
      <div>
        <h4 className="text-sm font-semibold text-secondary flex items-center gap-1.5 mb-2">
          <Receipt className="h-4 w-4" /> Invoices
        </h4>
        {invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No invoices for this job yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map(inv => {
              const cfg = invoiceStatusConfig[inv.status as keyof typeof invoiceStatusConfig] ?? invoiceStatusConfig.draft;
              return (
                <div key={inv.id} className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2 border">
                  <div>
                    <p className="font-mono text-sm font-semibold">{inv.invoiceNumber}</p>
                    <p className="text-xs text-muted-foreground">Due {inv.dueDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-secondary">{formatCurrency(inv.total)}</p>
                    <Badge variant="outline" className={`${cfg.color} border-0 text-[10px] mt-0.5`}>{cfg.label}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Job edit dialog ──────────────────────────────────────────────────────────

function JobEditDialog({
  id,
  open,
  onOpenChange
}: {
  id: number;
  open: boolean;
  onOpenChange: (open: boolean) => void
}) {
  const { data: job, isLoading } = useGetJob(id, {
    query: { enabled: open && !!id, queryKey: ['/api/jobs', id] }
  });

  const updateJob = useUpdateJob();
  const deleteJob = useDeleteJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateJob.mutate({
      id,
      data: {
        title: fd.get("title") as string,
        contactName: fd.get("contactName") as string,
        contactPhone: fd.get("contactPhone") as string,
        serviceType: fd.get("serviceType") as string,
        address: fd.get("address") as string,
        scheduledAt: fd.get("scheduledAt") as string,
        estimatedDuration: Number(fd.get("estimatedDuration")),
        estimatedValue: Number(fd.get("estimatedValue")),
        status: fd.get("status") as JobUpdateStatus
      }
    }, {
      onSuccess: () => {
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
        toast({ title: "Job updated" });
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Delete this job?")) {
      deleteJob.mutate({ id }, {
        onSuccess: () => {
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
          toast({ title: "Job deleted" });
        }
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Job #{id}</DialogTitle>
        </DialogHeader>
        {isLoading || !job ? (
          <div className="p-4 text-center">Loading...</div>
        ) : (
          <div className="space-y-6 pt-4">
            <form id={`job-edit-${id}`} onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-title">Job Title</Label>
                  <Input id="edit-title" name="title" defaultValue={job.title} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                  <Select name="status" defaultValue={job.status}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-serviceType">Service Type</Label>
                  <Input id="edit-serviceType" name="serviceType" defaultValue={job.serviceType} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-contactName">Customer Name</Label>
                  <Input id="edit-contactName" name="contactName" defaultValue={job.contactName} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-contactPhone">Phone</Label>
                  <Input id="edit-contactPhone" name="contactPhone" defaultValue={job.contactPhone} required />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-address">Address</Label>
                  <Input id="edit-address" name="address" defaultValue={job.address || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-scheduledAt">Date & Time</Label>
                  <Input id="edit-scheduledAt" name="scheduledAt" type="datetime-local" defaultValue={new Date(job.scheduledAt).toISOString().slice(0,16)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-estimatedDuration">Est. Duration (min)</Label>
                  <Input id="edit-estimatedDuration" name="estimatedDuration" type="number" defaultValue={job.estimatedDuration || 0} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="edit-estimatedValue">Estimated Value (£)</Label>
                  <Input id="edit-estimatedValue" name="estimatedValue" type="number" defaultValue={job.estimatedValue || 0} />
                </div>
              </div>
            </form>

            <Separator />

            {/* Financials */}
            <div>
              <h3 className="font-bold text-sm text-secondary mb-3 uppercase tracking-wider">Financials</h3>
              <JobFinancials jobId={id} />
            </div>

            <DialogFooter className="flex justify-between sm:justify-between pt-2">
              <Button type="button" variant="destructive" onClick={handleDelete} className="gap-2">
                <Trash2 size={16} /> Delete
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button type="submit" form={`job-edit-${id}`} disabled={updateJob.isPending}>
                  {updateJob.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Jobs() {
  const { data: jobs = [], isLoading } = useListJobs();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const filteredJobs = jobs.filter(j =>
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    j.contactName.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateJob = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    createJob.mutate({
      data: {
        title: fd.get("title") as string,
        contactName: fd.get("contactName") as string,
        contactPhone: fd.get("contactPhone") as string,
        serviceType: fd.get("serviceType") as string,
        address: fd.get("address") as string,
        scheduledAt: fd.get("scheduledAt") as string || new Date().toISOString(),
        estimatedDuration: Number(fd.get("estimatedDuration")) || 60,
        estimatedValue: Number(fd.get("estimatedValue")) || 0,
        status: "scheduled"
      }
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
        toast({ title: "Job scheduled successfully" });
      }
    });
  };

  const updateStatus = (id: number, status: JobInputStatus) => {
    updateJob.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
        toast({ title: "Job status updated" });
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-6 border-b bg-background flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">Job Schedule</h1>
            <p className="text-muted-foreground text-sm">Manage dispatch and work orders.</p>
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus size={16} /> New Job</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Schedule New Job</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateJob} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Job Title</Label>
                    <Input id="title" name="title" required placeholder="e.g. Roof Inspection" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serviceType">Service Type</Label>
                    <Select name="serviceType" defaultValue="Inspection">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Inspection">Inspection</SelectItem>
                        <SelectItem value="Repair">Repair</SelectItem>
                        <SelectItem value="Installation">Installation</SelectItem>
                        <SelectItem value="Emergency">Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactName">Customer Name</Label>
                    <Input id="contactName" name="contactName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">Phone</Label>
                    <Input id="contactPhone" name="contactPhone" required />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" name="address" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheduledAt">Date & Time</Label>
                    <Input id="scheduledAt" name="scheduledAt" type="datetime-local" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimatedDuration">Est. Duration (minutes)</Label>
                    <Input id="estimatedDuration" name="estimatedDuration" type="number" defaultValue="60" />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="estimatedValue">Estimated Value (£)</Label>
                    <Input id="estimatedValue" name="estimatedValue" type="number" defaultValue="0" />
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createJob.isPending}>
                    {createJob.isPending ? "Saving..." : "Schedule Job"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                className="pl-9 bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Loading schedule...</div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredJobs.map(job => {
                const status = jobStatusConfig[job.status as keyof typeof jobStatusConfig] ?? jobStatusConfig.scheduled;
                return (
                  <Card key={job.id} className="flex flex-col">
                    <CardHeader className="pb-3 border-b">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className={`${status.color} border-0 rounded-md`}>
                          {status.label}
                        </Badge>
                        <span className="text-xs font-bold text-secondary">
                          {format(new Date(job.scheduledAt), "MMM d")}
                        </span>
                      </div>
                      <CardTitle className="text-lg leading-tight">{job.title}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <MapPin size={14}/> {job.address}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 pb-2 flex-1 space-y-3">
                      <div className="grid grid-cols-2 gap-y-3 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock size={16} className="text-primary"/>
                          <span className="font-medium text-foreground">{format(new Date(job.scheduledAt), "h:mm a")}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <ListFilter size={16} className="text-primary"/>
                          <span className="font-medium text-foreground">{job.serviceType}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar size={16} className="text-primary"/>
                          <span className="font-medium text-foreground">{job.estimatedDuration}m</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <DollarSign size={16} className="text-primary"/>
                          <span className="font-medium text-foreground">
                            {job.estimatedValue ? formatCurrency(job.estimatedValue) : "—"}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-muted/50 rounded-md border mt-2">
                        <p className="text-xs font-semibold text-secondary mb-1">Customer</p>
                        <p className="text-sm font-medium">{job.contactName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{job.contactPhone}</p>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-3 border-t bg-muted/20 flex gap-2">
                      <Select
                        value={job.status}
                        onValueChange={(val) => updateStatus(job.id, val as JobInputStatus)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-white flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => setEditingId(job.id)}>Edit</Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {editingId && (
        <JobEditDialog
          id={editingId}
          open={!!editingId}
          onOpenChange={(open) => !open && setEditingId(null)}
        />
      )}
    </div>
  );
}
