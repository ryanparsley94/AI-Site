import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { PhoneCall, CalendarDays, Bot, ArrowRight, CheckCircle2, Star, MapPin, Zap } from "lucide-react";

export default function Landing() {
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
        <section className="relative min-h-[90vh] flex items-center overflow-hidden">
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

          <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-24 grid md:grid-cols-2 gap-12 items-center">
            {/* Left — copy */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#F97316]/15 text-[#F97316] text-sm font-semibold border border-[#F97316]/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F97316] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F97316]"></span>
                </span>
                Built for UK trades &amp; construction
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.08] text-white">
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
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white">
                  Hear a Demo Call
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-5 text-sm font-medium text-white/50 pt-2">
                <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-400" /> No credit card required</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 size={15} className="text-green-400" /> Setup in 5 minutes</span>
                <span className="flex items-center gap-1.5"><MapPin size={15} className="text-[#F97316]" /> UK-based &amp; GDPR compliant</span>
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
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing.</h2>
              <p className="text-white/50 text-lg">Less than what you'd pay a receptionist for one day a month.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                {
                  name: "Independent",
                  desc: "Solo operators & small trades.",
                  price: "£79",
                  features: ["100 answered calls/mo", "1 Active AI Assistant", "Calendar integration", "Trade-specific templates"],
                  highlight: false,
                },
                {
                  name: "Crew",
                  desc: "Growing construction businesses.",
                  price: "£199",
                  features: ["500 answered calls/mo", "3 Active AI Assistants", "Advanced CRM routing", "Premium voices", "SMS follow-ups"],
                  highlight: true,
                },
                {
                  name: "Enterprise",
                  desc: "High-volume contractors.",
                  price: "£499",
                  features: ["Unlimited calls", "Unlimited assistants", "API access", "Custom voice cloning", "Dedicated account manager"],
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
                    <span className="text-4xl font-extrabold">{plan.price}</span>
                    <span className={`text-sm ${plan.highlight ? "text-white/70" : "text-white/40"}`}>/mo + VAT</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-sm">
                        <CheckCircle2 size={17} className={plan.highlight ? "text-white shrink-0 mt-0.5" : "text-[#F97316] shrink-0 mt-0.5"} />
                        {f}
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
                      Start Free Trial
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-[#161b22] border-t border-white/10">
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
    </div>
  );
}
