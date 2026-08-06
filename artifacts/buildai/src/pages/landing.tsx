import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PhoneCall, CalendarDays, Bot, ArrowRight, CheckCircle2, Star, MapPin, Zap, Play, ChevronDown } from "lucide-react";
import { CallDemoModal } from "@/components/call-demo-modal";

const FAQ_ITEMS = [
  {
    q: "What counts as a call-minute?",
    a: "A call-minute is 60 seconds of active conversation between a caller and your BuildAI assistant. Calls are rounded up to the nearest minute. Your monthly allowance resets on your billing date, and you can see live usage in your dashboard at any time.",
  },
  {
    q: "What happens when I hit my monthly allowance?",
    a: "Your assistant keeps answering — we never cut off calls mid-conversation. If you exceed your plan's included minutes, overage is billed at a low per-minute rate (shown on your billing page). You can also upgrade your plan at any time to get a larger allowance.",
  },
  {
    q: "Is there a contract, or can I cancel anytime?",
    a: "No contracts, no lock-ins. Monthly plans can be cancelled before your next billing date — you keep access until the end of the period you've paid for. Annual plans are billed upfront and are non-refundable after 14 days, but you can cancel renewal at any time.",
  },
  {
    q: "How long does setup take?",
    a: "Most contractors are live in under 10 minutes. You connect your number, tell the AI about your trade and service area, set your availability, and you're done. Our onboarding wizard walks you through each step — no technical knowledge needed.",
  },
  {
    q: "Does BuildAI work for my trade?",
    a: "Yes — BuildAI is trained across the full range of UK trades: plumbing, electrical, gas, roofing, plastering, groundworks, landscaping, and more. The AI asks the right qualifying questions for each trade type, and you can add your own custom instructions to fine-tune it further.",
  },
  {
    q: "Is my data stored in the UK? (GDPR)",
    a: "Yes. All call recordings, transcripts, and customer data are stored on UK-based servers. BuildAI Ltd is a registered UK company and we are fully GDPR compliant. You can request a Data Processing Agreement (DPA) at any time — just contact us.",
  },
  {
    q: "Can I change plans later?",
    a: "Absolutely. You can upgrade or downgrade your plan at any time from your account settings. Upgrades take effect immediately; downgrades apply from the next billing cycle. There's no fee to change plans.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes — every new account starts with a 14-day free trial on the Starter plan, no credit card required. You get full access to all Starter features so you can see exactly what BuildAI does for your business before you commit.",
  },
];

export default function Landing() {
  const [demoOpen, setDemoOpen] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#0d1117] text-white flex flex-col font-sans">
      {/* Navbar */}
      <header className="px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-[#0d1117]/90 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2.5 font-bold text-xl">
          <img src="/logo-mark.png" alt="BuildAI" className="w-8 h-8 object-contain" />
          <span className="text-white">Build<span className="text-[#F97316]">AI</span></span>
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-medium text-white/60">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            Login
          </Link>
          <Link href="/dashboard">
            <Button className="font-bold bg-[#F97316] hover:bg-[#ea6c0a] text-white border-0">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative min-h-[90vh] flex items-start md:items-center overflow-hidden">
          {/* Background photo — tradesperson on site */}
          <div className="absolute inset-0">
            <img
              src="/hero-tradesperson.jpg"
              alt="Tradesperson taking a call on site"
              className="w-full h-full object-cover object-center"
            />
            {/* Gradient overlays for readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#0d1117] via-[#0d1117]/80 to-[#0d1117]/30" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-transparent to-transparent" />
          </div>

          <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-14 md:py-24 grid md:grid-cols-2 gap-12 items-center">
            {/* Left — copy */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F97316]/15 text-[#F97316] text-sm font-semibold border border-[#F97316]/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F97316]"></span>
                </span>
                Built for UK trades &amp; construction
              </div>

              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] text-white">
                Your <span className="text-[#F97316]">AI Foreman</span><br />
                Never Misses<br />
                A Call.
              </h1>

              <p className="text-lg md:text-xl text-white/70 max-w-lg leading-relaxed">
                Stop losing jobs to voicemail. BuildAI answers the phone, books estimates, and schedules your crew 24/7 — so you can focus on the site, not the screen.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/dashboard">
                  <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8 font-bold gap-2 bg-[#F97316] hover:bg-[#ea6c0a] border-0">
                    Start Your Free Trial <ArrowRight size={20} />
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setDemoOpen(true)}
                  className="w-full sm:w-auto text-lg h-14 px-8 bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white gap-2"
                >
                  <Play size={18} className="shrink-0" />
                  Hear a Demo Call
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 sm:gap-5 text-sm font-medium text-white/50 pt-2">
                <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-400 shrink-0" /> No credit card required</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-400 shrink-0" /> Setup in 5 minutes</span>
                <span className="flex items-center gap-1.5"><MapPin size={15} className="text-[#F97316] shrink-0" /> UK-based &amp; GDPR compliant</span>
              </div>
            </div>

            {/* Right — AI chat demo card */}
            <div className="relative hidden md:block">
              <div className="relative bg-[#161b22]/90 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="bg-[#0d1117] px-5 py-3.5 flex items-center gap-3 border-b border-white/10">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                  </div>
                  <div className="text-xs font-mono text-white/30 ml-2">buildai — live call</div>
                  <div className="ml-auto flex items-center gap-1.5 text-xs text-green-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                    Active
                  </div>
                </div>
                <div className="p-5 flex flex-col gap-3.5 min-h-[360px]">
                  <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl self-start max-w-[78%]">
                    <p className="text-xs font-semibold text-white/50 mb-1 uppercase tracking-wide">Incoming Call</p>
                    <p className="text-sm text-white">"Hi, I need a quote for re-roofing my semi-detached in Manchester…"</p>
                  </div>
                  <div className="bg-[#F97316]/15 border border-[#F97316]/30 p-3.5 rounded-xl self-end max-w-[78%]">
                    <p className="text-xs font-semibold text-[#F97316] mb-1">BuildAI Assistant</p>
                    <p className="text-sm text-white">"Of course! Is the roof currently leaking, or is this a planned replacement?"</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 p-3.5 rounded-xl self-start max-w-[78%]">
                    <p className="text-xs font-semibold text-white/50 mb-1 uppercase tracking-wide">Caller</p>
                    <p className="text-sm text-white">"No leaks — just 25 years old and looking rough."</p>
                  </div>
                  <div className="bg-[#F97316]/15 border border-[#F97316]/30 p-3.5 rounded-xl self-end max-w-[78%]">
                    <p className="text-xs font-semibold text-[#F97316] mb-1">BuildAI Assistant</p>
                    <p className="text-sm text-white">"Perfect. I have Thursday 2 PM or Friday 9 AM available for a free survey. Which suits you?"</p>
                  </div>
                  <div className="mt-auto bg-green-500/10 border border-green-500/30 text-green-400 p-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 size={17} />
                    Survey Booked — No Missed Lead
                  </div>
                </div>
              </div>
              {/* Floating trust badge */}
              <div className="absolute -bottom-4 -left-4 bg-[#161b22] border border-white/10 rounded-xl p-3 flex items-center gap-3 shadow-xl">
                <div className="w-9 h-9 rounded-full bg-[#F97316]/20 flex items-center justify-center text-[#F97316]">
                  <PhoneCall size={17} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">0 missed calls today</p>
                  <p className="text-[10px] text-white/40">AI handled 14 enquiries</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Social proof strip */}
        <section className="bg-[#F97316] py-5 overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-center md:justify-between items-center gap-6 text-white font-bold text-sm">
            <span className="flex items-center gap-2"><Star size={16} fill="white" /> "Saved us £4,000 in missed jobs last month"</span>
            <span className="hidden md:block opacity-30">|</span>
            <span className="flex items-center gap-2"><Star size={16} fill="white" /> "Set up in an afternoon, paid for itself in a week"</span>
            <span className="hidden md:block opacity-30">|</span>
            <span className="flex items-center gap-2"><Star size={16} fill="white" /> "Our AI receptionist never takes a sick day"</span>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-24 bg-[#0d1117]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Built for the reality of the job site.</h2>
              <p className="text-white/50 text-lg">You can't answer the phone when you're 20 feet up a ladder. BuildAI is your dedicated front office, working 24/7.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: <PhoneCall size={22} />,
                  title: "24/7 Call Handling",
                  body: "Never lose a lead to a competitor because you couldn't pick up. Your AI answers instantly, qualifies the caller, and collects the job details.",
                },
                {
                  icon: <CalendarDays size={22} />,
                  title: "Automated Scheduling",
                  body: "Connects to your calendar to book estimates, service calls, and follow-ups — no back-and-forth texts needed.",
                },
                {
                  icon: <Bot size={22} />,
                  title: "Trade-Trained AI",
                  body: "Understands plumbing, electrical, roofing, gas, and more. Asks the right qualifying questions every single time.",
                },
                {
                  icon: <Zap size={22} />,
                  title: "Instant Job Quotes",
                  body: "AI pulls live UK wholesale prices from Screwfix, TLC Direct, Travis Perkins and more to build accurate material quotes on the spot.",
                },
                {
                  icon: <CheckCircle2 size={22} />,
                  title: "UK Compliance Docs",
                  body: "Generate Gas Safe records, EICRs, FENSA certificates, and more in seconds — properly formatted, ready to sign.",
                },
                {
                  icon: <Star size={22} />,
                  title: "CRM & Contacts",
                  body: "Every caller becomes a contact. Job history, call recordings, and booked visits in one place — no spreadsheets.",
                },
              ].map((f) => (
                <div key={f.title} className="bg-[#161b22] border border-white/8 p-7 rounded-2xl hover:border-[#F97316]/40 transition-colors group">
                  <div className="bg-[#F97316]/10 text-[#F97316] w-11 h-11 rounded-xl flex items-center justify-center mb-5 group-hover:bg-[#F97316]/20 transition-colors">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-white/50 leading-relaxed text-sm">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="py-20 bg-[#161b22] border-y border-white/10">
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { stat: "47%", label: "Of leads go to the first to respond" },
              { stat: "0", label: "Missed calls with BuildAI" },
              { stat: "12hrs", label: "Saved per week on average" },
              { stat: "3×", label: "Increase in booked estimates" },
            ].map((s) => (
              <div key={s.stat}>
                <div className="text-4xl md:text-5xl font-extrabold text-[#F97316] mb-2">{s.stat}</div>
                <div className="text-white/50 font-medium text-sm leading-snug">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Photo break — electrician on site */}
        <section className="relative h-72 md:h-96 overflow-hidden">
          <img
            src="/hero-electrician.jpg"
            alt="Electrician on site handling a call"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d1117] via-[#0d1117]/60 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-7xl mx-auto px-6">
              <p className="text-2xl md:text-3xl font-extrabold text-white max-w-md leading-snug">
                "I was losing 2–3 jobs a week to voicemail. Not anymore."
              </p>
              <p className="text-white/50 mt-3 font-medium">— James T., Electrician, Leeds</p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 bg-[#0d1117]">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing.</h2>
              <p className="text-white/50 text-lg">Less than a part-time receptionist for one week — and it works 24/7.</p>
            </div>

            {/* Billing toggle */}
            <div className="flex justify-center mb-12">
              <div className="inline-flex items-center gap-1 bg-[#161b22] border border-white/10 rounded-full p-1">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    billingCycle === "monthly"
                      ? "bg-[#F97316] text-white shadow"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle("yearly")}
                  className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                    billingCycle === "yearly"
                      ? "bg-[#F97316] text-white shadow"
                      : "text-white/50 hover:text-white"
                  }`}
                >
                  Yearly
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full transition-all ${
                    billingCycle === "yearly"
                      ? "bg-white/20 text-white"
                      : "bg-[#F97316]/20 text-[#F97316]"
                  }`}>
                    Save 20%
                  </span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                {
                  name: "Starter",
                  desc: "Solo traders & small crews who need 24/7 cover without hiring.",
                  monthlyPrice: "£39",
                  yearlyPrice: "£31",
                  features: [
                    { text: "1 AI phone assistant", soon: false },
                    { text: "24/7 inbound call handling", soon: false },
                    { text: "Job scheduling & CRM", soon: false },
                    { text: "Call transcripts", soon: false },
                    { text: "UK trade voice templates", soon: false },
                    { text: "Mobile app access", soon: false },
                  ],
                  highlight: false,
                },
                {
                  name: "Pro",
                  desc: "Growing businesses who want the full AI office — quotes, invoices & more.",
                  monthlyPrice: "£79",
                  yearlyPrice: "£63",
                  features: [
                    { text: "3 AI assistants", soon: false },
                    { text: "Everything in Starter", soon: false },
                    { text: "AI quote & invoice builder", soon: false },
                    { text: "Compliance certificate generator", soon: false },
                    { text: "AI email responder", soon: false },
                    { text: "Google Calendar sync", soon: false },
                    { text: "Premium voice selection", soon: false },
                    { text: "SMS follow-ups", soon: true },
                  ],
                  highlight: true,
                },
                {
                  name: "Scale",
                  desc: "High-volume contractors who need the full platform with priority support.",
                  monthlyPrice: "£149",
                  yearlyPrice: "£119",
                  features: [
                    { text: "Unlimited assistants", soon: false },
                    { text: "Everything in Pro", soon: false },
                    { text: "Website chat widget", soon: false },
                    { text: "QuickBooks & Xero sync", soon: false },
                    { text: "AI marketing assistant", soon: true },
                    { text: "API access", soon: true },
                    { text: "White-label branding", soon: true },
                    { text: "Dedicated account manager", soon: false },
                  ],
                  highlight: false,
                },
              ].map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-2xl p-8 flex flex-col transition-transform ${
                    plan.highlight
                      ? "bg-[#F97316] text-white scale-105 shadow-2xl shadow-[#F97316]/20"
                      : "bg-[#161b22] border border-white/10 text-white"
                  }`}
                >
                  {plan.highlight && (
                    <div className="text-xs font-bold uppercase tracking-widest text-white/80 mb-3">Most Popular</div>
                  )}
                  <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                  <p className={`text-sm mb-6 ${plan.highlight ? "text-white/70" : "text-white/40"}`}>{plan.desc}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-extrabold">
                      {billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}
                    </span>
                    <span className={`text-sm ${plan.highlight ? "text-white/70" : "text-white/40"}`}>/mo + VAT</span>
                    {billingCycle === "yearly" && (
                      <p className={`text-xs mt-1 ${plan.highlight ? "text-white/60" : "text-white/35"}`}>billed annually</p>
                    )}
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 size={17} className={`${plan.highlight ? "text-white" : "text-[#F97316]"} shrink-0 mt-0.5`} />
                        <span className="flex-1">{f.text}</span>
                        {f.soon && (
                          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 ${
                            plan.highlight ? "bg-white/20 text-white/70" : "bg-white/8 text-white/40"
                          }`}>
                            Soon
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Link href="/dashboard">
                    <Button
                      className={`w-full font-bold ${
                        plan.highlight
                          ? "bg-white text-[#F97316] hover:bg-white/90 border-0"
                          : "bg-[#F97316] hover:bg-[#ea6c0a] text-white border-0"
                      }`}
                    >
                      {billingCycle === "yearly" ? "Start Free Trial — billed annually" : "Start Free Trial"}
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 bg-[#161b22] border-t border-white/10">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Frequently asked questions</h2>
              <p className="text-white/50 text-lg">Everything you need to know before you sign up.</p>
            </div>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => {
                const isOpen = openFaq === i;
                return (
                  <div
                    key={i}
                    className={`rounded-xl border transition-colors ${
                      isOpen ? "border-[#F97316]/40 bg-[#F97316]/5" : "border-white/10 bg-[#0d1117]/60"
                    }`}
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : i)}
                      className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                    >
                      <span className="text-white font-semibold text-sm md:text-base leading-snug">{item.q}</span>
                      <ChevronDown
                        size={18}
                        className={`shrink-0 text-white/40 transition-transform duration-300 ${isOpen ? "rotate-180 text-[#F97316]" : ""}`}
                      />
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <p className="px-6 pb-5 text-white/60 text-sm leading-relaxed">{item.a}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-[#0d1117] border-t border-white/10">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-5xl font-extrabold text-white mb-6">Ready to put your phones on autopilot?</h2>
            <p className="text-xl text-white/50 mb-10 max-w-2xl mx-auto">
              Join UK contractors who've stopped losing jobs to voicemail and reclaimed their evenings.
            </p>
            <Link href="/dashboard">
              <Button size="lg" className="text-lg h-16 px-10 font-bold bg-[#F97316] hover:bg-[#ea6c0a] text-white border-0">
                Create Your Account — Free Trial
              </Button>
            </Link>
            <p className="mt-5 text-white/30 text-sm">No credit card required · Setup in 5 minutes · Cancel anytime</p>
          </div>
        </section>
      </main>

      <footer className="bg-[#0d1117] border-t border-white/10 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2.5 font-bold text-lg">
            <img src="/logo-mark.png" alt="BuildAI" className="w-7 h-7 object-contain" />
            <span className="text-white">Build<span className="text-[#F97316]">AI</span></span>
          </div>
          <p className="text-white/30 text-sm">© {new Date().getFullYear()} BuildAI Ltd. All rights reserved. UK company.</p>
        </div>
      </footer>

      <CallDemoModal open={demoOpen} onOpenChange={setDemoOpen} autoPlay />
    </div>
  );
}
