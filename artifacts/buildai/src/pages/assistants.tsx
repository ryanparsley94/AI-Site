import { useState } from "react";
import { 
  useListAssistants, 
  useCreateAssistant, 
  useGetAssistant,
  useUpdateAssistant, 
  useDeleteAssistant,
  AssistantInputVoice,
  AssistantInputPersonality,
  AssistantUpdateVoice,
  AssistantUpdatePersonality
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Plus, Mic, Settings2, Trash2, Power, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function AssistantEditDialog({ 
  id, 
  open, 
  onOpenChange 
}: { 
  id: number; 
  open: boolean; 
  onOpenChange: (open: boolean) => void 
}) {
  const { data: assistant, isLoading } = useGetAssistant(id, {
    query: { enabled: open && !!id, queryKey: ['/api/assistants', id] }
  });
  
  const updateAssistant = useUpdateAssistant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateAssistant.mutate({
      id,
      data: {
        name: fd.get("name") as string,
        voice: fd.get("voice") as AssistantUpdateVoice,
        personality: fd.get("personality") as AssistantUpdatePersonality,
        greeting: fd.get("greeting") as string,
        instructions: fd.get("instructions") as string,
      }
    }, {
      onSuccess: () => {
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ['/api/assistants'] });
        toast({ title: "Assistant updated" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Assistant</DialogTitle>
        </DialogHeader>
        {isLoading || !assistant ? (
          <div className="p-4 text-center">Loading...</div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-name">Assistant Name</Label>
                <Input id="edit-name" name="name" defaultValue={assistant.name} required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-voice">Voice Profile</Label>
                <Select name="voice" defaultValue={assistant.voice}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                    <SelectItem value="echo">Echo (Warm)</SelectItem>
                    <SelectItem value="fable">Fable (Friendly)</SelectItem>
                    <SelectItem value="onyx">Onyx (Deep)</SelectItem>
                    <SelectItem value="nova">Nova (Energetic)</SelectItem>
                    <SelectItem value="shimmer">Shimmer (Clear)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-personality">Personality</Label>
                <Select name="personality" defaultValue={assistant.personality}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="direct">Direct</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-greeting">Default Greeting</Label>
                <Textarea 
                  id="edit-greeting" 
                  name="greeting" 
                  defaultValue={assistant.greeting || ""}
                  required 
                  className="h-20"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-instructions">Custom Instructions</Label>
                <Textarea 
                  id="edit-instructions" 
                  name="instructions" 
                  defaultValue={assistant.instructions || ""}
                  className="h-32"
                />
              </div>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={updateAssistant.isPending}>
                {updateAssistant.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Assistants() {
  const { data: assistants = [], isLoading } = useListAssistants();
  const createAssistant = useCreateAssistant();
  const updateAssistant = useUpdateAssistant();
  const deleteAssistant = useDeleteAssistant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    
    createAssistant.mutate({
      data: {
        name: fd.get("name") as string,
        voice: fd.get("voice") as AssistantInputVoice,
        personality: fd.get("personality") as AssistantInputPersonality,
        greeting: fd.get("greeting") as string,
        instructions: fd.get("instructions") as string,
        active: true
      }
    }, {
      onSuccess: () => {
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/api/assistants'] });
        toast({ title: "Assistant created successfully" });
      }
    });
  };

  const toggleActive = (id: number, active: boolean) => {
    updateAssistant.mutate({ id, data: { active: !active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/assistants'] });
        toast({ title: `Assistant turned ${!active ? 'ON' : 'OFF'}` });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this assistant?")) {
      deleteAssistant.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/assistants'] });
          toast({ title: "Assistant deleted" });
        }
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-6 border-b bg-background flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">AI Assistants</h1>
            <p className="text-muted-foreground text-sm">Configure your virtual receptionists and dispatchers.</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus size={16} /> New Assistant</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Configure AI Assistant</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="name">Assistant Name</Label>
                    <Input id="name" name="name" required placeholder="e.g. Sarah (Front Desk)" />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="voice">Voice Profile</Label>
                    <Select name="voice" defaultValue="alloy">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                        <SelectItem value="echo">Echo (Warm)</SelectItem>
                        <SelectItem value="fable">Fable (Friendly)</SelectItem>
                        <SelectItem value="onyx">Onyx (Deep)</SelectItem>
                        <SelectItem value="nova">Nova (Energetic)</SelectItem>
                        <SelectItem value="shimmer">Shimmer (Clear)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="personality">Personality</Label>
                    <Select name="personality" defaultValue="professional">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="direct">Direct</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="greeting">Default Greeting</Label>
                    <Textarea 
                      id="greeting" 
                      name="greeting" 
                      required 
                      placeholder="Hi, thanks for calling Apex Construction. How can I help you today?" 
                      className="h-20"
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="instructions">Custom Instructions</Label>
                    <Textarea 
                      id="instructions" 
                      name="instructions" 
                      placeholder="e.g. Always ask for the caller's address first. If it's an emergency leak, try to book the immediate slot." 
                      className="h-32"
                    />
                  </div>
                </div>
                <DialogFooter className="pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createAssistant.isPending}>
                    {createAssistant.isPending ? "Saving..." : "Create Assistant"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 xl:grid-cols-3 gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-12 text-muted-foreground">Loading assistants...</div>
          ) : assistants.length === 0 ? (
            <div className="col-span-full text-center py-12 border-2 border-dashed rounded-lg bg-background">
              <Bot size={48} className="mx-auto text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-lg font-bold mb-2">No Assistants Yet</h3>
              <p className="text-muted-foreground mb-4">Create your first AI assistant to start handling calls.</p>
              <Button onClick={() => setIsCreateOpen(true)}>Create Assistant</Button>
            </div>
          ) : (
            assistants.map(assistant => (
              <Card key={assistant.id} className={`flex flex-col relative overflow-hidden transition-all ${!assistant.active && 'opacity-75 grayscale-[0.5]'}`}>
                <div className={`absolute top-0 left-0 w-full h-1.5 ${assistant.active ? 'bg-primary' : 'bg-muted-foreground'}`}></div>
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className={`p-3 rounded-xl ${assistant.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        <Bot size={24} />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {assistant.name}
                          <Button variant="ghost" size="icon" className="h-6 w-6 ml-2" onClick={() => setEditingId(assistant.id)}>
                            <Edit size={14} className="text-muted-foreground" />
                          </Button>
                        </CardTitle>
                        <CardDescription className="flex gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] py-0 font-medium">{assistant.voice}</Badge>
                          <Badge variant="outline" className="text-[10px] py-0 font-medium">{assistant.personality}</Badge>
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-4 flex-1 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-muted/40 p-3 rounded-lg border text-center">
                      <p className="text-2xl font-bold text-secondary">{assistant.callsHandled || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">Calls Handled</p>
                    </div>
                    <div className="bg-muted/40 p-3 rounded-lg border text-center">
                      <p className="text-2xl font-bold text-secondary">{assistant.jobsBooked || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mt-1">Jobs Booked</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Greeting</p>
                    <p className="text-sm italic text-secondary bg-white p-3 rounded border">"{assistant.greeting}"</p>
                  </div>
                </CardContent>
                <CardFooter className="pt-3 border-t bg-muted/10 gap-2">
                  <Button 
                    variant={assistant.active ? "destructive" : "default"} 
                    className="flex-1 gap-2"
                    onClick={() => toggleActive(assistant.id, assistant.active)}
                  >
                    <Power size={16} /> {assistant.active ? "Turn Off" : "Turn On"}
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => handleDelete(assistant.id)}>
                    <Trash2 size={16} className="text-muted-foreground" />
                  </Button>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
      </div>

      {editingId && (
        <AssistantEditDialog 
          id={editingId}
          open={!!editingId}
          onOpenChange={(open) => !open && setEditingId(null)}
        />
      )}
    </div>
  );
}
