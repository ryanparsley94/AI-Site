import { useState } from "react";
import {
  useListAssistants,
  useCreateAssistant,
  useGetAssistant,
  useUpdateAssistant,
  useDeleteAssistant,
  useListAssistantTraining,
  useCreateAssistantTraining,
  useUpdateAssistantTraining,
  useDeleteAssistantTraining,
  useTestAssistant,
  AssistantInputVoice,
  AssistantInputPersonality,
  AssistantUpdateVoice,
  AssistantUpdatePersonality,
  AssistantInputType,
  useListMarketingDrafts,
  useApproveMarketingDraft,
  useDismissMarketingDraft,
  useUpdateMarketingDraft,
  useDeleteMarketingDraft,
  type MarketingDraft,
} from "@workspace/api-client-react";
import type { AssistantTrainingCategory, AssistantTraining, Assistant } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, Trash2, Power, Play, Loader2, Volume2,
  BookOpen, ChevronDown, ChevronUp, Pencil, Send, Sparkles, X,
  PhoneCall, Mail, MessageSquare, TrendingUp, Calendar, ArrowLeft,
  Phone, Zap, CheckCircle2, Star, RefreshCw, InboxIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { CallDemoModal } from "@/components/call-demo-modal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Assistant types ──────────────────────────────────────────────────────────

interface AssistantTypeConfig {
  value: AssistantInputType;
  label: string;
  icon: React.ElementType;
  description: string;
  colour: string;      // card accent / badge bg
  textColour: string;  // badge text
  tip: string;         // shown inside form
}

const ASSISTANT_TYPES: AssistantTypeConfig[] = [
  {
    value: "phone",
    label: "Phone Operator",
    icon: PhoneCall,
    description: "Answers inbound calls, books jobs, and takes messages 24/7.",
    colour: "bg-primary/10",
    textColour: "text-primary",
    tip: "Your phone operator answers calls in your name, qualifies the caller, and books jobs straight into your schedule.",
  },
  {
    value: "email",
    label: "Email Responder",
    icon: Mail,
    description: "Drafts and sends replies to your incoming emails automatically.",
    colour: "bg-blue-50",
    textColour: "text-blue-700",
    tip: "Your email responder monitors your inbox and drafts intelligent replies based on your services and FAQs.",
  },
  {
    value: "chat",
    label: "Chat Assistant",
    icon: MessageSquare,
    description: "Powers the live chat widget on your website to capture leads.",
    colour: "bg-purple-50",
    textColour: "text-purple-700",
    tip: "Your chat assistant greets website visitors, answers questions, and collects their contact details as a lead.",
  },
  {
    value: "marketing",
    label: "Marketing Assistant",
    icon: TrendingUp,
    description: "Sends review requests, follow-ups, and win-back messages.",
    colour: "bg-rose-50",
    textColour: "text-rose-700",
    tip: "Your marketing assistant automatically follows up with past customers to request reviews and repeat business.",
  },
  {
    value: "scheduling",
    label: "Scheduling Assistant",
    icon: Calendar,
    description: "Manages your diary, reschedules jobs, and sends reminders.",
    colour: "bg-green-50",
    textColour: "text-green-700",
    tip: "Your scheduling assistant keeps your calendar organised and sends job reminders to clients automatically.",
  },
];

function getTypeConfig(type: string): AssistantTypeConfig {
  return ASSISTANT_TYPES.find((t) => t.value === type) ?? ASSISTANT_TYPES[0];
}

// ─── Voice constants ──────────────────────────────────────────────────────────

const VOICES: { value: AssistantInputVoice; label: string; description: string }[] = [
  { value: "marin",   label: "Marin",   description: "Recommended · warm, natural" },
  { value: "cedar",   label: "Cedar",   description: "Recommended · clear, grounded" },
  { value: "coral",   label: "Coral",   description: "Friendly, balanced" },
  { value: "sage",    label: "Sage",    description: "Calm, professional" },
  { value: "verse",   label: "Verse",   description: "Expressive, conversational" },
  { value: "shimmer", label: "Shimmer", description: "Bright, reassuring" },
  { value: "alloy",   label: "Alloy",   description: "Neutral, versatile" },
  { value: "ash",     label: "Ash",     description: "Direct, clear" },
  { value: "ballad",  label: "Ballad",  description: "Warm, expressive" },
  { value: "echo",    label: "Echo",    description: "Steady, confident" },
];

// ─── Trade templates (phone only) ─────────────────────────────────────────────

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
    voice: "cedar",
    personality: "professional",
    greeting: "Hello, you've reached our gas and heating team. What can I help you with today?",
    instructions: `You are a receptionist for a UK Gas Safe registered heating and gas company. You understand:
- All gas work in the UK must be carried out by a Gas Safe registered engineer
- Common jobs: boiler service, boiler breakdown, gas leak, no heating, no hot water, radiator bleeding, thermostat issues, landlord gas safety certificates (CP12)
- SAFETY CRITICAL: If the caller suspects a gas leak, instruct them to open windows, evacuate, and call 0800 111 999 immediately
- Boiler brands we cover: Worcester Bosch, Vaillant, Ideal, Baxi, Potterton, Glow-worm, Viessmann
- Always ask for the boiler make, model, and fault code if displayed
- Landlord CP12 certificates are legally required annually`,
  },
  {
    label: "Electrician",
    icon: "⚡",
    voice: "marin",
    personality: "professional",
    greeting: "Hi there, you've reached our electrical team. How can I help?",
    instructions: `You are a receptionist for a UK NICEIC/NAPIT registered electrical contractor. You understand:
- UK wiring regulations: BS 7671 18th Edition
- Part P Building Regulations: notifiable work must be certified
- Common jobs: consumer unit replacement, additional sockets, EV charger installation, EICR, fault finding, rewires
- EV charger installations under OZEV grant scheme — mention government grants available
- EICR required every 5 years for rental properties
- Always ask: what the issue is, whether there's a tripped breaker, property type, and whether power is completely off`,
  },
  {
    label: "Roofer",
    icon: "🏠",
    voice: "echo",
    personality: "friendly",
    greeting: "Thanks for calling our roofing team. What can I help you with today?",
    instructions: `You are a receptionist for a UK roofing contractor. You understand:
- Roofing materials: concrete tiles, clay tiles, slate, flat roof (EPDM, felt, GRP fibreglass), lead flashing, UPVC fascias
- Common jobs: missing/broken tiles, leaking roof, flat roof repair, chimney repointing, guttering replacement
- Urgency: active leaks causing interior water damage are urgent
- Always ask: roof type, approximate age, location/postcode, whether damp noticed internally`,
  },
  {
    label: "General Builder",
    icon: "🏗️",
    voice: "alloy",
    personality: "friendly",
    greeting: "Morning! You've reached our building team. What project can we help you with?",
    instructions: `You are a receptionist for a UK general building contractor. You understand:
- Services: extensions, loft conversions, garage conversions, new builds, structural alterations, brickwork, plastering, damp proofing
- Always ask: type of project, property type, rough timescale, budget range, and whether planning permission has been considered`,
  },
  {
    label: "Painter & Decorator",
    icon: "🎨",
    voice: "coral",
    personality: "friendly",
    greeting: "Hi, thanks for calling our decorating team! How can I help you today?",
    instructions: `You are a receptionist for a UK painting and decorating company. You understand:
- Services: interior and exterior painting, wallpapering, feature walls, coving, commercial decorating
- Common paint brands: Dulux Trade, Crown Trade, Johnstone's Trade, Farrow & Ball, Little Greene
- New plaster must dry fully before decorating — important to flag to customers
- Always ask: number of rooms, condition of walls, whether wallpaper is involved, ceiling height`,
  },
  {
    label: "Tiler",
    icon: "◻️",
    voice: "shimmer",
    personality: "professional",
    greeting: "Hi, thanks for calling. How can I help with your tiling project?",
    instructions: `You are a receptionist for a UK tiling contractor. You understand:
- Services: bathroom tiling, kitchen splashbacks, wet rooms, porcelain floor tiles, natural stone, mosaic
- Wetroom installations require tanking beneath tiles
- Always ask: room dimensions (m²), tile size preference, substrate type, and if underfloor heating is present`,
  },
  {
    label: "Carpenter & Joiner",
    icon: "🪵",
    voice: "echo",
    personality: "friendly",
    greeting: "Hi there, you've reached our carpentry and joinery team. What can we help with?",
    instructions: `You are a receptionist for a UK carpentry and joinery business. You understand:
- Services: fitted wardrobes, stud walls, skirting and architrave, door hanging, flooring fitting, decking, stairs and handrails
- Flooring must acclimatise 48–72 hours before fitting
- Always ask: what the job is, approximate size, preferred wood species or board finish, and timescale`,
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
      <Label className="mb-2 block">
        Trade Template <span className="text-xs font-normal text-muted-foreground">(optional — auto-fills the form)</span>
      </Label>
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

// ─── VoicePicker ──────────────────────────────────────────────────────────────

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
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url); };
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

// ─── Type picker step ─────────────────────────────────────────────────────────

function AssistantTypePicker({
  onSelect,
}: {
  onSelect: (type: AssistantInputType) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-secondary">What kind of AI assistant do you need?</p>
        <p className="text-xs text-muted-foreground mt-0.5">Each type is trained for a specific role in your business.</p>
      </div>
      <div className="grid gap-2">
        {ASSISTANT_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onSelect(t.value)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 transition-all text-left group"
            >
              <div className={cn("p-2 rounded-lg shrink-0", t.colour)}>
                <Icon className={cn("h-4 w-4", t.textColour)} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-secondary group-hover:text-primary transition-colors">{t.label}</p>
                <p className="text-xs text-muted-foreground leading-snug mt-0.5">{t.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Form fields shared by all types ─────────────────────────────────────────

function CommonFields({
  defaults,
  typeConfig,
}: {
  defaults?: Record<string, string>;
  typeConfig: AssistantTypeConfig;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="name">Assistant Name</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder={
            typeConfig.value === "phone" ? "e.g. Sarah (Front Desk)"
            : typeConfig.value === "email" ? "e.g. Emily (Email Team)"
            : typeConfig.value === "chat" ? "e.g. Chloe (Web Chat)"
            : typeConfig.value === "marketing" ? "e.g. Max (Marketing)"
            : "e.g. Sam (Scheduler)"
          }
          defaultValue={defaults?.name}
        />
      </div>

      <div className="space-y-2">
        <Label>Tone / Personality</Label>
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
    </>
  );
}

// ─── Phone-specific fields ────────────────────────────────────────────────────

function PhoneFormFields({
  defaults,
  voice,
  onVoiceChange,
  template,
  onTemplateSelect,
}: {
  defaults?: Record<string, string>;
  voice: AssistantInputVoice;
  onVoiceChange: (v: AssistantInputVoice) => void;
  template: TradeTemplate | null;
  onTemplateSelect: (t: TradeTemplate) => void;
}) {
  return (
    <div className="space-y-4">
      <input type="hidden" name="voice" value={voice} />

      <TradeTemplatePicker selected={template?.label ?? null} onSelect={onTemplateSelect} />

      <div className="border-t pt-4 space-y-4">
        <CommonFields defaults={defaults} typeConfig={ASSISTANT_TYPES[0]} />

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Volume2 size={14} /> Voice Profile
            <span className="text-xs text-muted-foreground font-normal ml-1">— tap ▶ to preview</span>
          </Label>
          <VoicePicker value={voice} onChange={onVoiceChange} />
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
            placeholder="e.g. Always ask for the caller's postcode first. If it's an emergency, book the immediate slot."
            className="h-24 resize-none"
            defaultValue={defaults?.instructions}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Non-phone form fields ────────────────────────────────────────────────────

function OtherFormFields({
  defaults,
  typeConfig,
}: {
  defaults?: Record<string, string>;
  typeConfig: AssistantTypeConfig;
}) {
  const greetingLabel =
    typeConfig.value === "chat" ? "Welcome Message"
    : typeConfig.value === "email" ? "Email Sign-off / Signature"
    : null;

  const greetingPlaceholder =
    typeConfig.value === "chat" ? "Hi! How can I help you today?"
    : typeConfig.value === "email" ? "Kind regards, the CREWON team"
    : "";

  return (
    <div className="space-y-4">
      <input type="hidden" name="voice" value="alloy" />

      {/* Tip banner */}
      <div className={cn("rounded-lg px-3 py-2.5 text-xs text-secondary leading-relaxed", typeConfig.colour)}>
        <span className={cn("font-semibold", typeConfig.textColour)}>{typeConfig.label}: </span>
        {typeConfig.tip}
      </div>

      <CommonFields defaults={defaults} typeConfig={typeConfig} />

      {greetingLabel && (
        <div className="space-y-2">
          <Label>{greetingLabel}</Label>
          <Textarea
            name="greeting"
            placeholder={greetingPlaceholder}
            className="h-20 resize-none"
            defaultValue={defaults?.greeting}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Instructions & Context</Label>
        <Textarea
          name="instructions"
          placeholder={
            typeConfig.value === "email"
              ? "e.g. Always mention our 5-year workmanship guarantee. Offer a free quote for any new enquiry."
              : typeConfig.value === "chat"
              ? "e.g. Capture the visitor's name, phone number, and the type of job they need. Always offer a same-day callback."
              : typeConfig.value === "marketing"
              ? "e.g. Follow up 3 days after job completion to request a Google review. Offer 10% off their next booking."
              : "e.g. Send a reminder 24 hours before each job. If the client needs to reschedule, offer 3 alternative slots."
          }
          className="h-28 resize-none"
          defaultValue={defaults?.instructions}
        />
      </div>
    </div>
  );
}

// ─── Training ─────────────────────────────────────────────────────────────────

const TRAINING_CATEGORIES: { value: AssistantTrainingCategory; label: string; color: string; description: string }[] = [
  { value: "service", label: "Service",      color: "bg-primary/10 text-primary",        description: "Services you offer with pricing" },
  { value: "faq",     label: "FAQ",          color: "bg-blue-100 text-blue-700",          description: "Common questions & answers" },
  { value: "area",    label: "Service Area", color: "bg-green-100 text-green-700",        description: "Cities, postcodes, regions served" },
  { value: "hours",   label: "Hours",        color: "bg-secondary/10 text-secondary",     description: "Business & availability hours" },
  { value: "upsell",  label: "Upsell",       color: "bg-rose-100 text-rose-700",          description: "Add-ons & upgrades to pitch" },
];

function categoryMeta(cat: AssistantTrainingCategory) {
  return TRAINING_CATEGORIES.find((c) => c.value === cat) ?? TRAINING_CATEGORIES[0];
}

function TrainingEntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: AssistantTraining;
  onEdit: (e: AssistantTraining) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = categoryMeta(entry.category);

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0", meta.color)}>
          {meta.label}
        </span>
        <span className="flex-1 text-sm font-medium truncate">{entry.question}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={12} />
          </button>
          {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-sm text-secondary border-t bg-muted/10 pt-2">
          {entry.answer}
        </div>
      )}
    </div>
  );
}

function TrainingEntryForm({
  assistantId,
  initial,
  onDone,
  onCancel,
}: {
  assistantId: number;
  initial?: AssistantTraining;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTraining = useCreateAssistantTraining();
  const updateTraining = useUpdateAssistantTraining();
  const [category, setCategory] = useState<AssistantTrainingCategory>(initial?.category ?? "service");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      category,
      question: fd.get("question") as string,
      answer: fd.get("answer") as string,
    };
    const invalidate = () => queryClient.invalidateQueries({ queryKey: [`/api/assistants/${assistantId}/training`] });
    if (initial) {
      updateTraining.mutate({ id: assistantId, trainingId: initial.id, data }, {
        onSuccess: () => { invalidate(); onDone(); toast({ title: "Entry updated" }); },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      });
    } else {
      createTraining.mutate({ id: assistantId, data }, {
        onSuccess: () => { invalidate(); onDone(); toast({ title: "Training entry added" }); },
        onError: () => toast({ title: "Failed to add entry", variant: "destructive" }),
      });
    }
  };

  const isPending = createTraining.isPending || updateTraining.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border rounded-lg p-3 bg-muted/10">
      <div className="space-y-1.5">
        <Label className="text-xs">Category</Label>
        <div className="flex flex-wrap gap-1.5">
          {TRAINING_CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={cn(
                "text-[10px] font-bold uppercase px-2 py-1 rounded-full border transition-all",
                category === cat.value
                  ? cn(cat.color, "ring-1 ring-current border-transparent")
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">{categoryMeta(category).description}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="question">
          {category === "faq" ? "Question" : category === "hours" ? "When / What hours" : "Topic / Label"}
        </Label>
        <Input
          id="question"
          name="question"
          required
          placeholder={
            category === "service" ? "e.g. Roof Replacement"
            : category === "faq" ? "e.g. Do you offer free estimates?"
            : category === "area" ? "e.g. Cities we serve"
            : category === "hours" ? "e.g. Business Hours"
            : "e.g. Gutter Cleaning Add-on"
          }
          defaultValue={initial?.question}
          className="h-8 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="answer">
          {category === "faq" ? "Answer" : category === "service" ? "Description & Pricing" : "Details"}
        </Label>
        <Textarea
          id="answer"
          name="answer"
          required
          placeholder={
            category === "service" ? "e.g. Full tear-off and replacement. Typical cost £8,000–£15,000 depending on size."
            : category === "faq" ? "e.g. Yes! We offer free estimates Monday–Friday."
            : category === "area" ? "e.g. Manchester, Salford, Stockport — within 20 miles of the city centre."
            : category === "hours" ? "e.g. Mon–Fri 7am–6pm, Sat 8am–2pm. Emergency line 24/7."
            : "e.g. Gutter cleaning available for £120 when booked with any roofing job."
          }
          defaultValue={initial?.answer}
          className="h-20 resize-none text-sm"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="submit" size="sm" className="gap-1.5" disabled={isPending}>
          {isPending ? <Loader2 size={13} className="animate-spin" /> : null}
          {initial ? "Save Changes" : "Add Entry"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function TrainingTab({ assistantId }: { assistantId: number }) {
  const { data: entries = [], isLoading } = useListAssistantTraining(assistantId);
  const deleteTraining = useDeleteAssistantTraining();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AssistantTraining | null>(null);
  const [testQuestion, setTestQuestion] = useState("");
  const [testAnswer, setTestAnswer] = useState<string | null>(null);
  const testAssistant = useTestAssistant();

  const handleDelete = (trainingId: number) => {
    if (!confirm("Delete this training entry?")) return;
    deleteTraining.mutate({ id: assistantId, trainingId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/assistants/${assistantId}/training`] });
        toast({ title: "Entry deleted" });
      },
    });
  };

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuestion.trim()) return;
    setTestAnswer(null);
    testAssistant.mutate({ id: assistantId, data: { question: testQuestion } }, {
      onSuccess: (result) => setTestAnswer(result.answer),
      onError: () => toast({ title: "Test failed", variant: "destructive" }),
    });
  };

  const grouped = entries.reduce<Record<string, AssistantTraining[]>>((acc, e) => {
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-secondary">Knowledge Base</p>
            <p className="text-xs text-muted-foreground">These entries are injected into the AI's prompt for every interaction.</p>
          </div>
          {!showAddForm && !editingEntry && (
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setShowAddForm(true)}>
              <Plus size={13} /> Add Entry
            </Button>
          )}
        </div>

        {(showAddForm && !editingEntry) && (
          <TrainingEntryForm
            assistantId={assistantId}
            onDone={() => setShowAddForm(false)}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {isLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Loading…</div>
        ) : entries.length === 0 && !showAddForm ? (
          <div className="border rounded-lg p-6 text-center space-y-2">
            <BookOpen size={28} className="mx-auto text-muted-foreground" />
            <p className="text-sm font-medium text-secondary">No training entries yet</p>
            <p className="text-xs text-muted-foreground">
              Add services, FAQs, hours, and more so your AI answers accurately.
            </p>
            <Button size="sm" className="gap-1.5 mt-1" onClick={() => setShowAddForm(true)}>
              <Plus size={13} /> Add First Entry
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {editingEntry && (
              <TrainingEntryForm
                assistantId={assistantId}
                initial={editingEntry}
                onDone={() => setEditingEntry(null)}
                onCancel={() => setEditingEntry(null)}
              />
            )}
            {TRAINING_CATEGORIES.map((cat) => {
              const catEntries = grouped[cat.value];
              if (!catEntries?.length) return null;
              return (
                <div key={cat.value} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full", cat.color)}>
                      {cat.label}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">{catEntries.length}</Badge>
                  </div>
                  <div className="space-y-1 pl-1">
                    {catEntries.map((entry) => (
                      <TrainingEntryRow key={entry.id} entry={entry} onEdit={setEditingEntry} onDelete={handleDelete} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border rounded-lg p-3 bg-muted/10 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          <p className="text-sm font-semibold text-secondary">Test Your Assistant</p>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Ask a sample question to see how the AI responds using your training data.
        </p>
        <form onSubmit={handleTest} className="flex gap-2">
          <Input
            value={testQuestion}
            onChange={(e) => setTestQuestion(e.target.value)}
            placeholder="e.g. Do you do free estimates?"
            className="text-sm h-8"
          />
          <Button type="submit" size="sm" className="shrink-0 gap-1.5" disabled={testAssistant.isPending || !testQuestion.trim()}>
            {testAssistant.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            Test
          </Button>
        </form>
        {testAnswer !== null && (
          <div className="relative bg-white border rounded-lg p-3 text-sm text-secondary">
            <button type="button" onClick={() => setTestAnswer(null)} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
            <p className="font-semibold text-xs text-primary mb-1">AI Response:</p>
            <p className="leading-relaxed pr-4">{testAnswer}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit dialog ──────────────────────────────────────────────────────────────

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

  if (assistant && voice !== assistant.voice && !updateAssistant.isPending) {
    setVoice(assistant.voice as AssistantInputVoice);
  }

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateAssistant.mutate({
      id,
      data: {
        name: fd.get("name") as string,
        voice: fd.get("voice") as AssistantUpdateVoice,
        personality: fd.get("personality") as AssistantUpdatePersonality,
        greeting: fd.get("greeting") as string || undefined,
        instructions: fd.get("instructions") as string || undefined,
      },
    }, {
      onSuccess: () => {
        onOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
        toast({ title: "Assistant updated" });
      },
    });
  };

  const typeConfig = assistant ? getTypeConfig(assistant.type) : ASSISTANT_TYPES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {assistant && (() => { const Icon = typeConfig.icon; return <Icon className={cn("h-4 w-4", typeConfig.textColour)} />; })()}
            Edit {typeConfig.label}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !assistant ? (
          <div className="p-4 text-center text-muted-foreground">Loading…</div>
        ) : (
          <Tabs defaultValue="settings" className="pt-1">
            <TabsList className="w-full">
              <TabsTrigger value="settings" className="flex-1 gap-1.5"><Bot size={13} /> Settings</TabsTrigger>
              <TabsTrigger value="training" className="flex-1 gap-1.5"><BookOpen size={13} /> Training</TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-3">
              <form onSubmit={handleUpdate} className="space-y-4">
                {assistant.type === "phone" ? (
                  <PhoneFormFields
                    defaults={{
                      name: assistant.name,
                      personality: assistant.personality,
                      greeting: assistant.greeting ?? "",
                      instructions: assistant.instructions ?? "",
                    }}
                    voice={voice}
                    onVoiceChange={setVoice}
                    template={null}
                    onTemplateSelect={(t) => setVoice(t.voice)}
                  />
                ) : (
                  <OtherFormFields
                    defaults={{
                      name: assistant.name,
                      personality: assistant.personality,
                      greeting: assistant.greeting ?? "",
                      instructions: assistant.instructions ?? "",
                    }}
                    typeConfig={typeConfig}
                  />
                )}
                <DialogFooter className="pt-2 flex-col-reverse sm:flex-row gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button type="submit" disabled={updateAssistant.isPending}>
                    {updateAssistant.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="training" className="mt-3">
              <TrainingTab assistantId={id} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Assistant card ───────────────────────────────────────────────────────────

function AssistantCard({
  assistant,
  onToggle,
  onEdit,
  onDelete,
}: {
  assistant: Assistant;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const typeConfig = getTypeConfig(assistant.type ?? "phone");
  const Icon = typeConfig.icon;
  const isPhone = typeConfig.value === "phone";

  return (
    <Card className={cn("flex flex-col border-2 transition-colors", assistant.active ? "border-primary/30" : "border-border opacity-70")}>
      <CardContent className="pt-5 pb-4 flex-1 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", typeConfig.colour)}>
              <Icon className={cn("h-5 w-5", typeConfig.textColour)} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-secondary truncate">{assistant.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full", typeConfig.colour, typeConfig.textColour)}>
                  {typeConfig.label}
                </span>
                <span className="text-[10px] text-muted-foreground capitalize">{assistant.personality}</span>
              </div>
            </div>
          </div>
          <span className={cn("text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0", assistant.active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
            {assistant.active ? "Live" : "Off"}
          </span>
        </div>

        {/* Stats (phone only) */}
        {isPhone && (
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
        )}

        {/* Greeting / description preview */}
        {assistant.greeting ? (
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">
              {isPhone ? "Greeting" : assistant.type === "chat" ? "Welcome Message" : "Sign-off"}
            </p>
            <p className="text-sm italic text-secondary bg-white p-2.5 rounded border line-clamp-2">
              "{assistant.greeting}"
            </p>
          </div>
        ) : assistant.instructions ? (
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Instructions</p>
            <p className="text-sm text-secondary bg-white p-2.5 rounded border line-clamp-2">
              {assistant.instructions}
            </p>
          </div>
        ) : (
          <div className={cn("rounded-lg px-3 py-2 text-xs text-secondary", typeConfig.colour)}>
            {typeConfig.description}
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 border-t bg-muted/10 gap-2">
        <Button
          variant={assistant.active ? "destructive" : "default"}
          className="flex-1 gap-2"
          size="sm"
          onClick={onToggle}
        >
          <Power size={15} />
          {assistant.active ? "Turn Off" : "Turn On"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onEdit}>Edit</Button>
        <Button variant="outline" size="icon" className="shrink-0" onClick={onDelete}>
          <Trash2 size={15} className="text-muted-foreground" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// ─── Create dialog ────────────────────────────────────────────────────────────

function CreateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createAssistant = useCreateAssistant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<"type" | "form">("type");
  const [selectedType, setSelectedType] = useState<AssistantInputType>("phone");
  const [voice, setVoice] = useState<AssistantInputVoice>("alloy");
  const [template, setTemplate] = useState<TradeTemplate | null>(null);
  const [formKey, setFormKey] = useState(0);

  const reset = () => {
    setStep("type");
    setSelectedType("phone");
    setVoice("alloy");
    setTemplate(null);
    setFormKey((k) => k + 1);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleTypeSelect = (type: AssistantInputType) => {
    setSelectedType(type);
    setStep("form");
  };

  const handleTemplateSelect = (t: TradeTemplate) => {
    setTemplate(t);
    setVoice(t.voice);
    setFormKey((k) => k + 1);
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createAssistant.mutate({
      data: {
        name: fd.get("name") as string,
        type: selectedType,
        voice: fd.get("voice") as AssistantInputVoice,
        personality: fd.get("personality") as AssistantInputPersonality,
        greeting: fd.get("greeting") as string || undefined,
        instructions: fd.get("instructions") as string || undefined,
        active: true,
      },
    }, {
      onSuccess: () => {
        handleOpenChange(false);
        queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
        toast({ title: `${getTypeConfig(selectedType).label} created` });
      },
    });
  };

  const typeConfig = getTypeConfig(selectedType);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "form" && (
              <button
                type="button"
                onClick={() => setStep("type")}
                className="text-muted-foreground hover:text-foreground transition-colors mr-1"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            {step === "type" ? "New AI Assistant" : `Configure ${typeConfig.label}`}
          </DialogTitle>
        </DialogHeader>

        {step === "type" ? (
          <AssistantTypePicker onSelect={handleTypeSelect} />
        ) : (
          <form key={formKey} onSubmit={handleCreate} className="space-y-4 pt-1">
            {selectedType === "phone" ? (
              <PhoneFormFields
                defaults={template ? {
                  personality: template.personality,
                  greeting: template.greeting,
                  instructions: template.instructions,
                } : undefined}
                voice={voice}
                onVoiceChange={setVoice}
                template={template}
                onTemplateSelect={handleTemplateSelect}
              />
            ) : (
              <OtherFormFields typeConfig={typeConfig} />
            )}
            <DialogFooter className="pt-2 flex-col-reverse sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={createAssistant.isPending}>
                {createAssistant.isPending ? "Creating…" : `Create ${typeConfig.label}`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Marketing Queue ──────────────────────────────────────────────────────────

function DraftTypeLabel({ type }: { type: string }) {
  if (type === "review_request") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
        <Star size={9} /> Review Request
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
      <RefreshCw size={9} /> Follow-up
    </span>
  );
}

function MarketingDraftCard({ draft }: { draft: MarketingDraft }) {
  const { toast } = useToast();
  const approve = useApproveMarketingDraft();
  const dismiss = useDismissMarketingDraft();
  const update = useUpdateMarketingDraft();
  const deleteDraft = useDeleteMarketingDraft();

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(draft.editedMessage ?? draft.draftMessage ?? "");

  const message = draft.editedMessage ?? draft.draftMessage;
  const isLoading = !draft.draftMessage && draft.status === "pending";

  const handleApprove = () => {
    approve.mutate({ id: draft.id }, {
      onSuccess: () => toast({ title: "Message approved ✓" }),
      onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
    });
  };

  const handleDismiss = () => {
    dismiss.mutate({ id: draft.id }, {
      onSuccess: () => toast({ title: "Message dismissed" }),
      onError: () => toast({ title: "Failed to dismiss", variant: "destructive" }),
    });
  };

  const handleSaveEdit = () => {
    update.mutate({ id: draft.id, data: { editedMessage: editText } }, {
      onSuccess: () => { setEditing(false); toast({ title: "Message updated" }); },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    deleteDraft.mutate({ id: draft.id }, {
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    });
  };

  if (draft.status === "approved") {
    return (
      <div className="border rounded-xl p-4 bg-green-50/60 border-green-200 flex items-start gap-3">
        <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-secondary">{draft.clientName}</span>
            <DraftTypeLabel type={draft.type} />
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700">Approved</span>
          </div>
          <p className="text-xs text-secondary/80 mt-1 leading-relaxed">{message}</p>
        </div>
        <button type="button" onClick={handleDelete} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1">
          <X size={13} />
        </button>
      </div>
    );
  }

  if (draft.status === "dismissed") {
    return (
      <div className="border rounded-xl p-4 bg-muted/40 opacity-60 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-secondary">{draft.clientName}</span>
            <DraftTypeLabel type={draft.type} />
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Dismissed</span>
          </div>
        </div>
        <button type="button" onClick={handleDelete} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-4 bg-white space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-secondary">{draft.clientName}</span>
            <DraftTypeLabel type={draft.type} />
          </div>
          {draft.jobTitle && (
            <p className="text-xs text-muted-foreground mt-0.5">Job: {draft.jobTitle}</p>
          )}
        </div>
        <button type="button" onClick={handleDelete} className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1">
          <X size={13} />
        </button>
      </div>

      {/* Draft message */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          <Loader2 size={12} className="animate-spin" />
          AI is drafting the message…
        </div>
      ) : draft.draftMessage === "__FAILED__" && !draft.editedMessage ? (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
          <X size={12} />
          Draft generation failed. Edit manually to write your own message.
        </div>
      ) : editing ? (
        <div className="space-y-2">
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="h-24 resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" className="gap-1.5" onClick={handleSaveEdit} disabled={update.isPending}>
              {update.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="relative bg-muted/30 rounded-lg p-3 text-sm text-secondary leading-relaxed border">
          {message ?? ""}
          {draft.editedMessage && (
            <span className="absolute top-1.5 right-1.5 text-[9px] text-muted-foreground font-semibold uppercase">edited</span>
          )}
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            onClick={handleApprove}
            disabled={approve.isPending || isLoading}
          >
            {approve.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => { setEditText(draft.editedMessage ?? draft.draftMessage ?? ""); setEditing(true); }}
            disabled={isLoading}
          >
            <Pencil size={13} /> Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleDismiss}
            disabled={dismiss.isPending}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

function MarketingQueueSection() {
  const [filter, setFilter] = useState<"pending" | "approved" | "dismissed" | "all">("pending");
  const { data: drafts = [], isLoading } = useListMarketingDrafts(filter !== "all" ? { status: filter } : undefined);

  const pendingCount = drafts.filter((d) => d.status === "pending").length;

  return (
    <div className="mt-8 border rounded-2xl bg-white overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b bg-rose-50/60 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-lg bg-rose-100 shrink-0">
            <TrendingUp className="h-4 w-4 text-rose-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-bold text-secondary">Marketing Queue</p>
              {pendingCount > 0 && filter === "pending" && (
                <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                  {pendingCount}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              AI-drafted review requests and follow-up messages — approve or edit before sending.
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 shrink-0">
          {(["pending", "approved", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full font-medium capitalize transition-all",
                filter === f
                  ? "bg-secondary text-white"
                  : "text-muted-foreground hover:text-secondary hover:bg-muted/60"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Draft list */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
        ) : drafts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <InboxIcon size={28} className="text-muted-foreground/50" />
            <p className="text-sm font-medium text-secondary">
              {filter === "pending" ? "No pending messages" : "No messages yet"}
            </p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {filter === "pending"
                ? "When a job is marked complete, AI will draft a review request and follow-up message for you to approve here."
                : "Mark a job as completed to trigger automatic message drafting."}
            </p>
          </div>
        ) : (
          drafts.map((draft) => (
            <MarketingDraftCard key={draft.id} draft={draft} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Assistants() {
  const { data: assistants = [], isLoading } = useListAssistants();
  const updateAssistant = useUpdateAssistant();
  const deleteAssistant = useDeleteAssistant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isDemoOpen, setIsDemoOpen] = useState(false);

  const toggleActive = (id: number, active: boolean) => {
    updateAssistant.mutate({ id, data: { active: !active } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
        toast({ title: `Assistant turned ${!active ? "ON" : "OFF"}` });
      },
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this assistant?")) {
      deleteAssistant.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/assistants"] });
          toast({ title: "Assistant deleted" });
        },
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-4 sm:p-6 border-b bg-background flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">AI Assistants</h1>
            <p className="text-muted-foreground text-sm">
              Your virtual office team — phone operators, email responders, chat agents, and more.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" className="gap-2" onClick={() => setIsDemoOpen(true)}>
              <Play size={14} /> Watch Demo Call
            </Button>
            <Button className="gap-2" onClick={() => setIsCreateOpen(true)}>
              <Plus size={16} /> New Assistant
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading assistants…</div>
          ) : assistants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="grid grid-cols-5 gap-2 mb-2">
                {ASSISTANT_TYPES.map((t) => {
                  const Icon = t.icon;
                  return (
                    <div key={t.value} className={cn("w-10 h-10 rounded-xl flex items-center justify-center", t.colour)}>
                      <Icon className={cn("h-5 w-5", t.textColour)} />
                    </div>
                  );
                })}
              </div>
              <div>
                <p className="font-semibold text-secondary">No Assistants Yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your AI office team — phone, email, chat, marketing, and scheduling assistants.
                </p>
              </div>
              <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
                <Plus size={16} /> Create Your First Assistant
              </Button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
              {assistants.map((assistant) => (
                <AssistantCard
                  key={assistant.id}
                  assistant={assistant}
                  onToggle={() => toggleActive(assistant.id, assistant.active)}
                  onEdit={() => setEditingId(assistant.id)}
                  onDelete={() => handleDelete(assistant.id)}
                />
              ))}
            </div>
          )}

          {/* Marketing message queue — always visible below assistants */}
          <MarketingQueueSection />
        </div>
      </div>

      <CallDemoModal open={isDemoOpen} onOpenChange={setIsDemoOpen} />
      <CreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

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
