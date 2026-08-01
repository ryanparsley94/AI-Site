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
import { Bot, Plus, Trash2, Power, Play, Loader2, Volume2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const VOICES: { value: AssistantInputVoice; label: string; description: string }[] = [
  { value: "alloy",   label: "Alloy",   description: "Neutral, clear" },
  { value: "echo",    label: "Echo",    description: "Warm, steady" },
  { value: "fable",   label: "Fable",   description: "Friendly" },
  { value: "onyx",    label: "Onyx",    description: "Deep, confident" },
  { value: "nova",    label: "Nova",    description: "Energetic" },
  { value: "shimmer", label: "Shimmer", description: "Bright, clear" },
];

const SAMPLE_TEXT = "Hi, thanks for calling. How can I help you today?";

function VoicePicker({
  value,
  onChange,
}: {
  value: AssistantInputVoice;
  onChange: (v: AssistantInputVoice) => void;
}) {
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const { toast } = useToast();

  const playVoice = async (e: React.MouseEvent, voice: AssistantInputVoice) => {
    e.stopPropagation();
    if (playingVoice) return;
    setPlayingVoice(voice);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${base}/api/assistants/voice-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice, text: SAMPLE_TEXT }),
      });
      if (!resp.ok) throw new Error("Preview failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => setPlayingVoice(null);
      await audio.play();
    } catch {
      toast({ title: "Could not play voice preview", variant: "destructive" });
      setPlayingVoice(null);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {VOICES.map((v) => (
        <button
          key={v.value}
          type="button"
          onClick={() => onChange(v.value)}
          className={cn(
            "relative flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-all",
            value === v.value
              ? "border-primary bg-primary/10 ring-1 ring-primary"
              : "border-border hover:border-primary/40 hover:bg-muted/50"
          )}
        >
          <span className="text-sm font-semibold leading-none">{v.label}</span>
          <span className="text-[10px] text-muted-foreground leading-none">{v.description}</span>
          <button
            type="button"
            onClick={(e) => playVoice(e, v.value)}
            className="absolute top-2 right-2 text-muted-foreground hover:text-primary transition-colors"
            title={`Preview ${v.label} voice`}
          >
            {playingVoice === v.value ? (
              <Loader2 size={13} className="animate-spin text-primary" />
            ) : (
              <Play size={13} />
            )}
          </button>
        </button>
      ))}
    </div>
  );
}

function AssistantFormFields({
  defaults,
  voice,
  onVoiceChange,
}: {
  defaults?: Record<string, string>;
  voice: AssistantInputVoice;
  onVoiceChange: (v: AssistantInputVoice) => void;
}) {
  return (
    <div className="space-y-4">
      <input type="hidden" name="voice" value={voice} />

      <div className="space-y-2">
        <Label htmlFor="name">Assistant Name</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="e.g. Sarah (Front Desk)"
          defaultValue={defaults?.name}
        />
      </div>

      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Volume2 size={14} /> Voice Profile
          <span className="text-xs text-muted-foreground font-normal ml-1">— tap ▶ to preview</span>
        </Label>
        <VoicePicker value={voice} onChange={onVoiceChange} />
      </div>

      <div className="space-y-2">
        <Label>Personality</Label>
        <Select name="personality" defaultValue={defaults?.personality ?? "professional"}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="friendly">Friendly</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Default Greeting</Label>
        <Textarea
          name="greeting"
          required
          placeholder="Hi, thanks for calling. How can I help you today?"
          className="h-20 resize-none"
          defaultValue={defaults?.greeting}
        />
      </div>

      <div className="space-y-2">
        <Label>Custom Instructions</Label>
        <Textarea
          name="instructions"
          placeholder="e.g. Always ask for the caller's address first. If it's an emergency, book the immediate slot."
          className="h-24 resize-none"
          defaultValue={defaults?.instructions}
        />
      </div>
    </div>
  );
}

function AssistantEditDialog({
  id,
  open,
  onOpenChange,
}: {
  id: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: assistant, isLoading } = useGetAssistant(id, {
    query: { enabled: open && !!id, queryKey: ["/api/assistants", id] },
  });
  const updateAssistant = useUpdateAssistant();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [voice, setVoice] = useState<AssistantInputVoice>("alloy");

  // Sync voice from loaded data
  if (assistant && voice !== assistant.voice && !updateAssistant.isPending) {
    setVoice(assistant.voice as AssistantInputVoice);
  }

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateAssistant.mutate(
      {
        id,
        data: {
          name: fd.get("name") as string,
          voice: fd.get("voice") as AssistantUpdateVoice,
          personality: fd.get("personality") as AssistantUpdatePersonality,
          greeting: fd.get("greeting") as string,
          instructions: fd.get("instructions") as string,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
          toast({ title: "Assistant updated" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Assistant</DialogTitle>
        </DialogHeader>
        {isLoading || !assistant ? (
          <div className="p-4 text-center text-muted-foreground">Loading…</div>
        ) : (
          <form onSubmit={handleUpdate} className="space-y-4 pt-2">
            <AssistantFormFields
              defaults={{
                name: assistant.name,
                personality: assistant.personality,
                greeting: assistant.greeting ?? "",
                instructions: assistant.instructions ?? "",
              }}
              voice={voice}
              onVoiceChange={setVoice}
            />
            <DialogFooter className="pt-2 flex-col-reverse sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateAssistant.isPending}>
                {updateAssistant.isPending ? "Saving…" : "Save Changes"}
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
  const [createVoice, setCreateVoice] = useState<AssistantInputVoice>("alloy");

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createAssistant.mutate(
      {
        data: {
          name: fd.get("name") as string,
          voice: fd.get("voice") as AssistantInputVoice,
          personality: fd.get("personality") as AssistantInputPersonality,
          greeting: fd.get("greeting") as string,
          instructions: fd.get("instructions") as string,
          active: true,
        },
      },
      {
        onSuccess: () => {
          setIsCreateOpen(false);
          setCreateVoice("alloy");
          queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
          toast({ title: "Assistant created successfully" });
        },
      }
    );
  };

  const toggleActive = (id: number, active: boolean) => {
    updateAssistant.mutate(
      { id, data: { active: !active } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
          toast({ title: `Assistant turned ${!active ? "ON" : "OFF"}` });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this assistant?")) {
      deleteAssistant.mutate(
        { id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
            toast({ title: "Assistant deleted" });
          },
        }
      );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-4 sm:p-6 border-b bg-background flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">AI Assistants</h1>
            <p className="text-muted-foreground text-sm">Configure your virtual receptionists and dispatchers.</p>
          </div>

          <Dialog
            open={isCreateOpen}
            onOpenChange={(o) => {
              setIsCreateOpen(o);
              if (!o) setCreateVoice("alloy");
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2 shrink-0">
                <Plus size={16} /> New Assistant
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Configure AI Assistant</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-2">
                <AssistantFormFields
                  voice={createVoice}
                  onVoiceChange={setCreateVoice}
                />
                <DialogFooter className="pt-2 flex-col-reverse sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createAssistant.isPending}>
                    {createAssistant.isPending ? "Creating…" : "Create Assistant"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {isLoading ? (
            <div className="col-span-full text-center py-20 text-muted-foreground">
              Loading assistants…
            </div>
          ) : assistants.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Bot size={32} className="text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-secondary">No Assistants Yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first AI assistant to start handling calls automatically.
                </p>
              </div>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus size={16} /> Create Assistant
              </Button>
            </div>
          ) : (
            assistants.map((assistant) => (
              <Card
                key={assistant.id}
                className={cn(
                  "flex flex-col border-2 transition-colors",
                  assistant.active ? "border-primary/30" : "border-border opacity-70"
                )}
              >
                <CardContent className="pt-5 pb-4 flex-1 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                          assistant.active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Bot size={20} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-secondary truncate">{assistant.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {assistant.voice} · {assistant.personality}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0",
                        assistant.active
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {assistant.active ? "Live" : "Off"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/40 p-3 rounded-lg border text-center">
                      <p className="text-2xl font-bold text-secondary">{assistant.callsHandled || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5">Calls</p>
                    </div>
                    <div className="bg-muted/40 p-3 rounded-lg border text-center">
                      <p className="text-2xl font-bold text-secondary">{assistant.jobsBooked || 0}</p>
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5">Booked</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Greeting</p>
                    <p className="text-sm italic text-secondary bg-white p-2.5 rounded border line-clamp-2">
                      "{assistant.greeting}"
                    </p>
                  </div>
                </CardContent>

                <CardFooter className="pt-3 border-t bg-muted/10 gap-2">
                  <Button
                    variant={assistant.active ? "destructive" : "default"}
                    className="flex-1 gap-2"
                    size="sm"
                    onClick={() => toggleActive(assistant.id, assistant.active)}
                  >
                    <Power size={15} />
                    {assistant.active ? "Turn Off" : "Turn On"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setEditingId(assistant.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => handleDelete(assistant.id)}
                  >
                    <Trash2 size={15} className="text-muted-foreground" />
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
