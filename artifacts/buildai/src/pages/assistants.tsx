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

interface TradeTemplate {
  label: string;
  icon: string;
  voice: AssistantInputVoice;
  personality: AssistantInputPersonality;
  greeting: string;
  instructions: string;
}

const TRADE_TEMPLATES: TradeTemplate[] = [
  {
    label: "Plumber",
    icon: "🔧",
    voice: "echo",
    personality: "professional",
    greeting: "Thanks for calling — you've reached our plumbing team. How can I help you today?",
    instructions: `You are a receptionist for a UK plumbing company. You understand:
- Common plumbing issues: leaks, burst pipes, blocked drains, low pressure, no hot water, dripping taps, toilet cistern faults
- Emergency vs non-urgent jobs — burst pipes and flooding are emergencies requiring same-day attendance
- UK regulations: unvented hot water cylinders require a G3 qualified engineer; notify customer if specialist is needed
- Water regulations 1999 compliance for installations
- Always ask: location/postcode, nature of the problem, property type (domestic/commercial), and whether water needs isolating now
- Escalate to emergency call-out if there is active flooding or a burst main`,
  },
  {
    label: "Gas Engineer",
    icon: "🔥",
    voice: "onyx",
    personality: "professional",
    greeting: "Hello, you've reached our gas and heating team. What can I help you with today?",
    instructions: `You are a receptionist for a UK Gas Safe registered heating and gas company. You understand:
- All gas work in the UK must be carried out by a Gas Safe registered engineer (registration number should be confirmed on arrival)
- Common jobs: boiler service, boiler breakdown, gas leak, no heating, no hot water, radiator bleeding, thermostat issues, landlord gas safety certificates (CP12)
- SAFETY CRITICAL: If the caller suspects a gas leak, instruct them to: do not operate any switches, open windows and doors, evacuate the property, and call the National Gas Emergency line on 0800 111 999 immediately — do NOT book this as a routine call
- Boiler brands we cover: Worcester Bosch, Vaillant, Ideal, Baxi, Potterton, Glow-worm, Viessmann
- Always ask for the boiler make, model, and fault code if displayed
- Landlord CP12 certificates are legally required annually`,
  },
  {
    label: "Electrician",
    icon: "⚡",
    voice: "nova",
    personality: "professional",
    greeting: "Hi there, you've reached our electrical team. How can I help?",
    instructions: `You are a receptionist for a UK NICEIC/NAPIT registered electrical contractor. You understand:
- UK wiring regulations: BS 7671 18th Edition (IET Wiring Regulations)
- Part P Building Regulations: notifiable work (new circuits, consumer unit changes, work in kitchens/bathrooms) must be certified — we handle this as part of the job
- Common jobs: consumer unit (fuse board) replacement, additional sockets and lighting circuits, EV charger installation, EICR (Electrical Installation Condition Report), fault finding, power outages, rewires
- EV charger installations under OZEV grant scheme — mention government grants available
- EICR required every 5 years for rental properties — landlords often call for this
- Always ask: what the electrical issue is, when it started, whether there's a tripped breaker, property type, and whether power is completely off`,
  },
  {
    label: "Roofer",
    icon: "🏠",
    voice: "echo",
    personality: "friendly",
    greeting: "Thanks for calling our roofing team. What can I help you with today?",
    instructions: `You are a receptionist for a UK roofing contractor. You understand:
- Roofing materials: concrete tiles, clay tiles, slate (natural and fibre cement), flat roof (EPDM rubber, felt, GRP fibreglass, liquid coating), lead flashing, UPVC fascias and soffits, guttering
- Common jobs: missing/broken tiles, leaking roof, flat roof repair or replacement, chimney repointing or stack repair, velux/skylight installation, guttering replacement, new roof installation
- Urgency: active leaks causing interior water damage are urgent — offer emergency patch/tarpaulin cover
- Planning permission: most roofing work is permitted development but some changes (e.g. flat to pitched, listed buildings, conservation areas) may require planning permission — we can advise
- Always ask: roof type, approximate age, location/postcode, whether they've noticed damp internally, and if scaffolding access has been considered`,
  },
  {
    label: "General Builder",
    icon: "🏗️",
    voice: "alloy",
    personality: "friendly",
    greeting: "Morning! You've reached our building team. What project can we help you with?",
    instructions: `You are a receptionist for a UK general building contractor. You understand:
- Services: extensions (single-storey, double-storey, loft conversions, garage conversions), new builds, structural alterations (RSJ steel beam installation, load-bearing wall removal), brickwork, blockwork, plastering, rendering, damp proofing, underpinning
- Planning and regulations: extensions over 3m (detached) or 4m (semi/terrace) rear, or side extensions, typically need planning permission — we advise and can manage applications; all structural work requires Building Regulations approval
- Party Wall Act: works near a boundary or shared wall require a Party Wall Agreement — we can recommend surveyors
- Common materials: blocks, bricks, insulation, lintels, timber, OSB, plasterboard
- Always ask: what the project is, rough dimensions or scope, timescale, whether they have planning permission yet, and their postcode for availability`,
  },
  {
    label: "Painter & Decorator",
    icon: "🎨",
    voice: "fable",
    personality: "friendly",
    greeting: "Hi, thanks for calling our decorating team! How can I help you today?",
    instructions: `You are a receptionist for a UK painting and decorating company. You understand:
- Services: interior painting (walls, ceilings, woodwork/trim), exterior painting, wallpapering, feature walls, coving, UPVC window and door spray painting, commercial decorating
- Common paint brands used in UK trade: Dulux Trade, Crown Trade, Johnstone's Trade, Farrow & Ball (premium), Little Greene (premium)
- Preparation is key: stripping old wallpaper, filling cracks (fine surface filler vs powder filler), sanding, mist coat on new plaster — all affect the quote
- New plaster must dry fully (approx. 1 month per inch thickness) before decorating — important to flag to customers
- Always ask: number of rooms or areas, condition of walls, whether wallpaper is involved, ceiling height, preferred brand or colour if known, and whether it's a new build or renovation`,
  },
  {
    label: "Tiler",
    icon: "◻️",
    voice: "shimmer",
    personality: "professional",
    greeting: "Hi, thanks for calling. How can I help with your tiling project?",
    instructions: `You are a receptionist for a UK tiling contractor. You understand:
- Services: bathroom tiling (walls and floor), kitchen splashbacks, wet rooms, porcelain floor tiles, natural stone, mosaic, external paving
- Tile types: ceramic, porcelain (rectified or non-rectified), natural stone (travertine, slate, marble), glass mosaic — each has different substrate and adhesive requirements
- Wetroom and shower installations require tanking (waterproof membrane) beneath tiles — this is a separate cost
- Underfloor heating compatibility: must confirm tiles and adhesive are UFH-rated
- Grout types: standard, epoxy (more durable, stain-resistant, used in commercial and wet areas), flexible
- UK suppliers: Topps Tiles, Tile Giant, CTD, Porcelanosa, Fired Earth, Screwfix for adhesives and grout
- Always ask: room dimensions (m²), tile size preference, whether there's existing tiling to remove, substrate type (plasterboard, cement board, existing tiles), and if underfloor heating is present`,
  },
  {
    label: "Carpenter & Joiner",
    icon: "🪵",
    voice: "echo",
    personality: "friendly",
    greeting: "Hi there, you've reached our carpentry and joinery team. What can we help with?",
    instructions: `You are a receptionist for a UK carpentry and joinery business. You understand:
- Services: fitted wardrobes and furniture (bespoke or MFC flat-pack assembly), stud walls and timber framing, skirting and architrave, door hanging (internal and external), flooring (solid wood, engineered wood, laminate fitting), loft boarding, decking, fencing, window boards, stairs and handrails
- Bespoke joinery: kitchen units, alcove shelving, window seats — made to measure in the workshop and installed on site
- Fire doors: FD30 and FD60 rated doors for flats and commercial properties — required under Building Regulations in certain locations
- Flooring acclimatisation: solid and engineered wood flooring must acclimatise in the property for 48–72 hours before fitting
- Always ask: what the job is, approximate size or number of items, whether existing items need removing, preferred wood species or board finish, and timescale`,
  },
];

function TradeTemplatePicker({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (t: TradeTemplate) => void;
}) {
  return (
    <div>
      <Label className="mb-2 block">Trade Template <span className="text-xs font-normal text-muted-foreground">(optional — auto-fills the form)</span></Label>
      <div className="grid grid-cols-2 gap-1.5">
        {TRADE_TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onSelect(t)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all",
              selected === t.label
                ? "border-primary bg-primary/10 font-semibold"
                : "border-border hover:border-primary/40 hover:bg-muted/50"
            )}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

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
  const [createTemplate, setCreateTemplate] = useState<TradeTemplate | null>(null);
  const [formKey, setFormKey] = useState(0);

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
              if (!o) {
                setCreateVoice("alloy");
                setCreateTemplate(null);
                setFormKey((k) => k + 1);
              }
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
              <form key={formKey} onSubmit={handleCreate} className="space-y-4 pt-2">
                <TradeTemplatePicker
                  selected={createTemplate?.label ?? null}
                  onSelect={(t) => {
                    setCreateTemplate(t);
                    setCreateVoice(t.voice);
                    setFormKey((k) => k + 1);
                  }}
                />
                <div className="border-t pt-4">
                  <AssistantFormFields
                    defaults={createTemplate ? {
                      personality: createTemplate.personality,
                      greeting: createTemplate.greeting,
                      instructions: createTemplate.instructions,
                    } : undefined}
                    voice={createVoice}
                    onVoiceChange={setCreateVoice}
                  />
                </div>
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
