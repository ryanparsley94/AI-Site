import { useState } from "react";
import { useLocation } from "wouter";
import { 
  useListContacts, 
  ListContactsType,
  useCreateContact,
  useGetContact,
  useUpdateContact,
  useDeleteContact,
  ContactInputType,
  ContactUpdateType
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, Mail, Phone, MapPin, Briefcase, Plus, Trash2, Clock, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCurrency } from "@/lib/utils";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

const emailStatusConfig = {
  pending: { label: "Pending", icon: Clock, className: "text-amber-600 bg-amber-50 border-amber-200" },
  sent:    { label: "Sent",    icon: CheckCircle, className: "text-green-600 bg-green-50 border-green-200" },
  dismissed: { label: "Dismissed", icon: XCircle, className: "text-slate-500 bg-slate-50 border-slate-200" },
};

function ContactDetailDialog({ 
  id, 
  open, 
  onOpenChange 
}: { 
  id: number; 
  open: boolean; 
  onOpenChange: (open: boolean) => void 
}) {
  const { data: contact, isLoading } = useGetContact(id, {
    query: { enabled: open && !!id, queryKey: ['/api/contacts', id] }
  });
  
  const updateContact = useUpdateContact();
  const deleteContact = useDeleteContact();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateContact.mutate({
      id,
      data: {
        name: fd.get("name") as string,
        phone: fd.get("phone") as string,
        email: fd.get("email") as string,
        address: fd.get("address") as string,
        type: fd.get("type") as ContactUpdateType,
        notes: fd.get("notes") as string,
      }
    }, {
      onSuccess: () => {
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
        toast({ title: "Contact updated" });
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Delete this contact?")) {
      deleteContact.mutate({ id }, {
        onSuccess: () => {
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
          toast({ title: "Contact deleted" });
        }
      });
    }
  };

  const handleOpenThread = (threadId: number) => {
    onOpenChange(false);
    navigate(`/email-inbox?thread=${threadId}`);
  };

  const emailThreads = contact?.emailThreads ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{contact?.name ?? "Contact"}</DialogTitle>
        </DialogHeader>
        {isLoading || !contact ? (
          <div className="p-4 text-center">Loading...</div>
        ) : (
          <Tabs defaultValue="details" className="mt-2">
            <TabsList className="mb-4">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="emails">
                Emails
                {emailThreads.length > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary rounded-full px-1.5 py-0.5 font-medium">
                    {emailThreads.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Details tab ── */}
            <TabsContent value="details">
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" defaultValue={contact.name} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" name="phone" defaultValue={contact.phone} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select name="type" defaultValue={contact.type}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" defaultValue={contact.email || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" name="address" defaultValue={contact.address || ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" defaultValue={contact.notes || ""} />
                </div>
                <DialogFooter className="pt-4 flex justify-between sm:justify-between">
                  <Button type="button" variant="destructive" onClick={handleDelete} className="gap-2">
                    <Trash2 size={16} /> Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" disabled={updateContact.isPending}>
                      {updateContact.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            </TabsContent>

            {/* ── Emails tab ── */}
            <TabsContent value="emails">
              {emailThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Mail size={32} className="mb-3 opacity-30" />
                  <p className="text-sm">No email threads linked to this contact yet.</p>
                  <p className="text-xs mt-1">Emails from this contact will appear here automatically.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {emailThreads.map((thread) => {
                    const cfg = emailStatusConfig[thread.status as keyof typeof emailStatusConfig];
                    const StatusIcon = cfg?.icon ?? Clock;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => handleOpenThread(thread.id)}
                        className="w-full text-left flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-secondary truncate">{thread.subject}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(thread.createdAt), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg?.className ?? ""}`}>
                          <StatusIcon size={11} />
                          {cfg?.label ?? thread.status}
                        </div>
                        <ExternalLink size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Contacts() {
  const [typeFilter, setTypeFilter] = useState<ListContactsType | "all">("all");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: contacts = [], isLoading } = useListContacts(
    typeFilter !== "all" ? { type: typeFilter } : {}
  );
  const createContact = useCreateContact();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredContacts = contacts.filter(contact => 
    contact.name.toLowerCase().includes(search.toLowerCase()) ||
    contact.phone.includes(search) ||
    (contact.email && contact.email.toLowerCase().includes(search.toLowerCase()))
  );

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createContact.mutate({
      data: {
        name: fd.get("name") as string,
        phone: fd.get("phone") as string,
        email: fd.get("email") as string,
        address: fd.get("address") as string,
        type: fd.get("type") as ContactInputType,
        notes: fd.get("notes") as string,
      }
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
        toast({ title: "Contact created successfully" });
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      <div className="p-6 border-b flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">Contacts CRM</h1>
            <p className="text-muted-foreground text-sm">Manage your leads and existing customers.</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus size={16} /> Add Contact</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New Contact</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="new-name">Name</Label>
                  <Input id="new-name" name="name" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-phone">Phone</Label>
                    <Input id="new-phone" name="phone" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-type">Type</Label>
                    <Select name="type" defaultValue="lead">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead">Lead</SelectItem>
                        <SelectItem value="customer">Customer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-email">Email (Optional)</Label>
                  <Input id="new-email" name="email" type="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-address">Address (Optional)</Label>
                  <Input id="new-address" name="address" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-notes">Notes (Optional)</Label>
                  <Textarea id="new-notes" name="notes" />
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createContact.isPending}>
                    {createContact.isPending ? "Saving..." : "Create Contact"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search contacts..." 
              className="pl-9 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(['all', 'lead', 'customer'] as const).map((t) => (
              <Button 
                key={t}
                variant={typeFilter === t ? "default" : "outline"}
                className={`capitalize ${typeFilter === t ? "" : "bg-white"}`}
                onClick={() => setTypeFilter(t)}
                size="sm"
              >
                {t}s
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 bg-muted/20">
        <div className="border rounded-lg bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>History</TableHead>
                <TableHead className="text-right">Total Spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Loading contacts...
                  </TableCell>
                </TableRow>
              ) : filteredContacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No contacts found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredContacts.map((contact) => (
                  <TableRow 
                    key={contact.id} 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setEditingId(contact.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-secondary">{contact.name}</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            Added {format(new Date(contact.createdAt), "MMM yyyy")}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={contact.type === 'customer' ? 'default' : 'outline'} className={contact.type === 'customer' ? 'bg-secondary text-white' : ''}>
                        {contact.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2"><Phone size={14} /> <span className="font-mono text-xs">{contact.phone}</span></div>
                        {contact.email && <div className="flex items-center gap-2"><Mail size={14} /> <span>{contact.email}</span></div>}
                        {contact.address && <div className="flex items-center gap-2"><MapPin size={14} /> <span>{contact.address}</span></div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Briefcase size={16} className="text-primary"/>
                        <span className="font-bold">{contact.totalJobs || 0}</span> jobs
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-bold text-secondary">
                      {formatCurrency(contact.totalSpent || 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {editingId && (
        <ContactDetailDialog 
          id={editingId} 
          open={!!editingId} 
          onOpenChange={(open) => !open && setEditingId(null)} 
        />
      )}
    </div>
  );
}
