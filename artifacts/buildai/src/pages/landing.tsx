import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { HardHat, PhoneCall, CalendarDays, Bot, ArrowRight, ShieldCheck, Clock, BarChart3, CheckCircle2 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Navbar */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2 text-primary font-bold text-2xl">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-md">
            <HardHat size={24} />
          </div>
          BuildAI
        </div>
        <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">How it Works</a>
          <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm font-medium hover:text-primary transition-colors">
            Login
          </Link>
          <Link href="/dashboard">
            <Button className="font-bold">Get Started</Button>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-20 md:py-32 px-6 max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Built for trades & construction
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] text-secondary">
              Your <span className="text-primary">AI Foreman</span> Never Misses A Call.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
              Stop losing jobs to voicemail. BuildAI answers the phone, books estimates, and schedules your crew 24/7 so you can focus on the site, not the screen.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link href="/dashboard">
                <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8 font-bold gap-2">
                  Start Your Free Trial <ArrowRight size={20} />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 bg-white border-2">
                Hear a Demo Call
              </Button>
            </div>
            <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground pt-4">
              <div className="flex items-center gap-1"><CheckCircle2 size={16} className="text-green-500" /> No credit card required</div>
              <div className="flex items-center gap-1"><CheckCircle2 size={16} className="text-green-500" /> Setup in 5 minutes</div>
            </div>
          </div>
          
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full"></div>
            <div className="relative bg-card border-2 border-border rounded-xl shadow-2xl overflow-hidden flex flex-col h-[500px]">
              <div className="bg-secondary p-4 flex items-center gap-3 text-white border-b border-white/10">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <div className="text-xs font-mono ml-4 text-white/50">buildai-command-center</div>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-4 bg-slate-50/50">
                <div className="bg-white p-4 rounded-lg border shadow-sm self-start max-w-[80%]">
                  <p className="text-sm font-semibold mb-1">Incoming Call: 555-0198</p>
                  <p className="text-xs text-muted-foreground">"Hey, I need a quote for a roof replacement..."</p>
                </div>
                <div className="bg-primary/10 border-primary/30 p-4 rounded-lg border shadow-sm self-end max-w-[80%]">
                  <p className="text-sm font-semibold mb-1 text-primary">BuildAI</p>
                  <p className="text-xs">"I can certainly help with that. Are you experiencing any active leaks, or just looking to replace an aging roof?"</p>
                </div>
                <div className="bg-white p-4 rounded-lg border shadow-sm self-start max-w-[80%]">
                  <p className="text-sm font-semibold mb-1">Caller</p>
                  <p className="text-xs text-muted-foreground">"No leaks yet, but it's about 20 years old."</p>
                </div>
                <div className="bg-primary/10 border-primary/30 p-4 rounded-lg border shadow-sm self-end max-w-[80%]">
                  <p className="text-sm font-semibold mb-1 text-primary">BuildAI</p>
                  <p className="text-xs">"Got it. I have our estimator available this Thursday at 2 PM or Friday morning at 9 AM. Which works better for you?"</p>
                </div>
                <div className="mt-auto bg-green-50 border-green-200 border text-green-800 p-3 rounded-md text-sm font-medium flex items-center justify-center gap-2">
                  <CheckCircle2 size={18} />
                  Job Estimate Booked Automatically
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 bg-card border-y border-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-secondary mb-4">Built for the reality of the job site.</h2>
              <p className="text-muted-foreground text-lg">You can't answer the phone when you're 20 feet up a ladder. BuildAI is your dedicated front office, ready to handle every lead.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-background border border-border p-8 rounded-xl shadow-sm">
                <div className="bg-primary/10 text-primary w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                  <PhoneCall size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">24/7 Call Handling</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Never let a lead go to a competitor because you couldn't pick up. Your AI assistant answers instantly, screening spam and assisting real customers.
                </p>
              </div>
              <div className="bg-background border border-border p-8 rounded-xl shadow-sm">
                <div className="bg-primary/10 text-primary w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                  <CalendarDays size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">Automated Scheduling</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Connects directly to your calendar to book estimates, service calls, and follow-ups without any back-and-forth texting.
                </p>
              </div>
              <div className="bg-background border border-border p-8 rounded-xl shadow-sm">
                <div className="bg-primary/10 text-primary w-12 h-12 rounded-lg flex items-center justify-center mb-6">
                  <Bot size={24} />
                </div>
                <h3 className="text-xl font-bold mb-3">Industry-Trained AI</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Understands construction terminology, asks the right qualifying questions, and collects essential details before dispatching your crew.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stats / Social Proof */}
        <section className="py-20 bg-secondary text-white">
          <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/20">
            <div className="py-4 md:py-0">
              <div className="text-4xl md:text-5xl font-extrabold text-primary mb-2">47%</div>
              <div className="text-white/80 font-medium">Of leads go to the first to respond</div>
            </div>
            <div className="py-4 md:py-0">
              <div className="text-4xl md:text-5xl font-extrabold text-primary mb-2">0</div>
              <div className="text-white/80 font-medium">Missed calls with BuildAI</div>
            </div>
            <div className="py-4 md:py-0">
              <div className="text-4xl md:text-5xl font-extrabold text-primary mb-2">12hrs</div>
              <div className="text-white/80 font-medium">Saved per week on average</div>
            </div>
            <div className="py-4 md:py-0">
              <div className="text-4xl md:text-5xl font-extrabold text-primary mb-2">3x</div>
              <div className="text-white/80 font-medium">Increase in booked estimates</div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-24 max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-secondary mb-4">Simple, straightforward pricing.</h2>
            <p className="text-muted-foreground text-lg">Less than what you'd pay a receptionist for one day.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="border border-border bg-card rounded-2xl p-8 shadow-sm flex flex-col">
              <h3 className="text-xl font-bold text-secondary mb-2">Independent</h3>
              <p className="text-muted-foreground text-sm mb-6">For solo operators and small trades.</p>
              <div className="mb-6"><span className="text-4xl font-extrabold">$99</span><span className="text-muted-foreground">/mo</span></div>
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> 100 answered calls/mo</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> 1 Active AI Assistant</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Calendar Integration</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Standard Voices</li>
              </ul>
              <Button className="w-full font-bold" variant="outline">Start Free Trial</Button>
            </div>
            
            <div className="border-2 border-primary bg-card rounded-2xl p-8 shadow-xl flex flex-col relative transform md:-translate-y-4">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-bold tracking-wide">
                MOST POPULAR
              </div>
              <h3 className="text-xl font-bold text-secondary mb-2">Crew</h3>
              <p className="text-muted-foreground text-sm mb-6">For growing construction businesses.</p>
              <div className="mb-6"><span className="text-4xl font-extrabold">$249</span><span className="text-muted-foreground">/mo</span></div>
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> 500 answered calls/mo</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> 3 Active AI Assistants</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Advanced CRM Routing</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Premium Voices</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> SMS Follow-ups</li>
              </ul>
              <Button className="w-full font-bold">Start Free Trial</Button>
            </div>
            
            <div className="border border-border bg-card rounded-2xl p-8 shadow-sm flex flex-col">
              <h3 className="text-xl font-bold text-secondary mb-2">Enterprise</h3>
              <p className="text-muted-foreground text-sm mb-6">For high-volume general contractors.</p>
              <div className="mb-6"><span className="text-4xl font-extrabold">$599</span><span className="text-muted-foreground">/mo</span></div>
              <ul className="space-y-3 mb-8 flex-1">
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Unlimited calls</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Unlimited Assistants</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> API Access</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Custom Voice Cloning</li>
                <li className="flex gap-2 text-sm"><CheckCircle2 className="text-primary" size={18} /> Dedicated Account Rep</li>
              </ul>
              <Button className="w-full font-bold" variant="outline">Contact Sales</Button>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 bg-primary text-primary-foreground border-y border-primary/20">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-6">Ready to put your phones on autopilot?</h2>
            <p className="text-xl opacity-90 mb-10 max-w-2xl mx-auto">
              Join hundreds of contractors who have reclaimed their time and increased their revenue with BuildAI.
            </p>
            <Link href="/dashboard">
              <Button size="lg" variant="secondary" className="text-lg h-16 px-10 font-bold bg-secondary text-secondary-foreground hover:bg-secondary/90">
                Create Your Account Now
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-secondary text-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-primary font-bold text-xl">
            <HardHat size={20} /> BuildAI
          </div>
          <p className="text-white/50 text-sm">© {new Date().getFullYear()} BuildAI Platforms Inc. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
