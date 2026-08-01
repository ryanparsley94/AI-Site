import { useState } from "react";
import { 
  useListCertificates, 
  useGenerateCertificate, 
  useCreateCertificate, 
  useDeleteCertificate,
  getListCertificatesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  FileCheck, ShieldCheck, Wrench, FileWarning, Briefcase, 
  Trash2, Download, Save, Loader2, Sparkles, Clock, MapPin, User, FileText, FileUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CERT_TYPES = [
  { id: "completion", label: "Project Completion", icon: FileCheck, color: "bg-green-500/10 text-green-700 dark:bg-green-500/20 dark:text-green-400 border-green-200", badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", desc: "Formal sign-off on finished work" },
  { id: "safety", label: "Safety Compliance", icon: ShieldCheck, color: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", desc: "Safety standards & reports" },
  { id: "warranty", label: "Warranty Certificate", icon: Wrench, color: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-200", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", desc: "Materials and labor guarantee" },
  { id: "lien_waiver", label: "Lien Waiver", icon: FileWarning, color: "bg-purple-500/10 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200", badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300", desc: "Release of lien rights upon payment" },
  { id: "subcontractor_agreement", label: "Subcontractor Agreement", icon: Briefcase, color: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200", badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", desc: "Terms for contracted labor" },
];

export default function Certificates() {
  const { data: certificates = [], isLoading: isLoadingCerts } = useListCertificates();
  const generateCerts = useGenerateCertificate();
  const createCert = useCreateCertificate();
  const deleteCert = useDeleteCertificate();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<string>("completion");
  
  const [jobTitle, setJobTitle] = useState("");
  const [contactName, setContactName] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [completionDate, setCompletionDate] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");

  const handleGenerate = () => {
    generateCerts.mutate({
      data: {
        type: selectedType as any,
        jobTitle: jobTitle || undefined,
        contactName: contactName || undefined,
        jobAddress: jobAddress || undefined,
        completionDate: completionDate || undefined,
        customInstructions: customInstructions || undefined,
      }
    }, {
      onSuccess: (res) => {
        setGeneratedTitle(res.title);
        setGeneratedContent(res.content);
        toast({ title: "Certificate generated successfully." });
      },
      onError: () => {
        toast({ title: "Failed to generate certificate.", variant: "destructive" });
      }
    });
  };

  const handleSave = () => {
    if (!generatedTitle || !generatedContent) {
      toast({ title: "Nothing to save.", variant: "destructive" });
      return;
    }
    
    createCert.mutate({
      data: {
        type: selectedType as any,
        title: generatedTitle,
        content: generatedContent,
        jobTitle: jobTitle || undefined,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
        toast({ title: "Certificate saved to library." });
      },
      onError: () => {
        toast({ title: "Failed to save certificate.", variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (window.confirm("Are you sure you want to delete this certificate?")) {
      deleteCert.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
          toast({ title: "Certificate deleted." });
        }
      });
    }
  };

  const handleLoad = (cert: any) => {
    setSelectedType(cert.type);
    setGeneratedTitle(cert.title);
    setGeneratedContent(cert.content);
    if (cert.jobTitle) setJobTitle(cert.jobTitle);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast({ title: "Loaded certificate into editor." });
  };

  const getBadgeColor = (typeId: string) => {
    return CERT_TYPES.find(t => t.id === typeId)?.badge || "bg-secondary text-secondary-foreground";
  };
  
  const getBadgeLabel = (typeId: string) => {
    return CERT_TYPES.find(t => t.id === typeId)?.label || typeId;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-6 border-b bg-background flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-secondary flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            AI Certificate Builder
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Generate official forms, sign-offs, and compliance documents using AI.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8">
          
          {/* Left Column: Builder */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Type Selector */}
            <section>
              <Label className="text-base font-semibold mb-3 block text-secondary">1. Select Document Type</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CERT_TYPES.map((type) => {
                  const isSelected = selectedType === type.id;
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      onClick={() => setSelectedType(type.id)}
                      className={`text-left flex items-start gap-3 p-4 rounded-lg border-2 transition-all ${
                        isSelected 
                          ? "border-primary bg-primary/5 shadow-sm" 
                          : "border-border bg-card hover:border-primary/30"
                      }`}
                    >
                      <div className={`p-2 rounded-md ${type.color} shrink-0`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {type.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{type.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Context Form */}
            <section className="bg-card border rounded-lg p-5 shadow-sm">
              <Label className="text-base font-semibold mb-4 block text-secondary">2. Job Context (Optional)</Label>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="jobTitle" className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <Briefcase className="h-3 w-3" /> Job/Project Title
                  </Label>
                  <Input 
                    id="jobTitle" 
                    placeholder="e.g. Smith Residence Framing" 
                    value={jobTitle} 
                    onChange={e => setJobTitle(e.target.value)} 
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contactName" className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <User className="h-3 w-3" /> Client/Contact Name
                  </Label>
                  <Input 
                    id="contactName" 
                    placeholder="e.g. John Doe" 
                    value={contactName} 
                    onChange={e => setContactName(e.target.value)} 
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="jobAddress" className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="h-3 w-3" /> Project Address
                  </Label>
                  <Input 
                    id="jobAddress" 
                    placeholder="e.g. 123 Oak St." 
                    value={jobAddress} 
                    onChange={e => setJobAddress(e.target.value)} 
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="completionDate" className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3" /> Relevant Date
                  </Label>
                  <Input 
                    id="completionDate" 
                    type="date"
                    value={completionDate} 
                    onChange={e => setCompletionDate(e.target.value)} 
                    className="h-9"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <Label htmlFor="customInstructions" className="text-xs text-muted-foreground">
                    Custom AI Instructions
                  </Label>
                  <Textarea 
                    id="customInstructions" 
                    placeholder="e.g. 'Include a clause about a 1-year workmanship warranty' or 'Specify that materials were supplied by client.'" 
                    rows={2}
                    value={customInstructions} 
                    onChange={e => setCustomInstructions(e.target.value)} 
                    className="resize-none"
                  />
                </div>
              </div>
              
              <Button 
                onClick={handleGenerate} 
                disabled={generateCerts.isPending}
                className="w-full mt-6 font-bold h-12 text-md gap-2"
              >
                {generateCerts.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Generating certificate...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    Generate with AI
                  </>
                )}
              </Button>
            </section>

            {/* Result Editor */}
            {generatedContent && (
              <section className="bg-card border rounded-lg overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-secondary/5 px-5 py-3 border-b flex items-center justify-between">
                  <Label className="text-base font-semibold text-secondary">3. Review & Edit</Label>
                  <Badge variant="outline" className="bg-background">Ready to save</Badge>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <Label htmlFor="docTitle" className="text-xs text-muted-foreground mb-1 block">Document Title</Label>
                    <Input 
                      id="docTitle"
                      value={generatedTitle}
                      onChange={(e) => setGeneratedTitle(e.target.value)}
                      className="font-bold text-lg h-auto py-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="docContent" className="text-xs text-muted-foreground mb-1 block">Document Text</Label>
                    <Textarea
                      id="docContent"
                      value={generatedContent}
                      onChange={(e) => setGeneratedContent(e.target.value)}
                      className="min-h-[400px] font-mono text-sm leading-relaxed p-4 bg-muted/20"
                    />
                  </div>
                </div>
                <div className="bg-secondary/5 px-5 py-4 border-t flex flex-col sm:flex-row items-center gap-3">
                  <Button 
                    variant="default" 
                    onClick={handleSave} 
                    disabled={createCert.isPending}
                    className="flex-1 w-full gap-2"
                  >
                    {createCert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Certificate
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => window.print()}
                    className="flex-1 w-full gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Print / Download PDF
                  </Button>
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Library */}
          <div className="lg:col-span-4">
            <div className="bg-card border rounded-lg flex flex-col lg:h-[calc(100vh-140px)] sticky top-6 shadow-sm">
              <div className="p-4 border-b bg-secondary/5">
                <h2 className="font-bold text-secondary flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-muted-foreground" />
                  Saved Certificates
                </h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingCerts ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  </div>
                ) : certificates.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed rounded-lg px-4 bg-muted/10">
                    <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">No saved certificates yet.</p>
                    <p className="text-xs text-muted-foreground/70">Generate your first document on the left.</p>
                  </div>
                ) : (
                  certificates.map((cert: any) => (
                    <Card key={cert.id} className="hover:border-primary/40 transition-colors shadow-sm">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex justify-between items-start mb-2">
                          <Badge variant="secondary" className={`text-[10px] uppercase border-0 ${getBadgeColor(cert.type)}`}>
                            {getBadgeLabel(cert.type)}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-destructive -mt-1 -mr-2"
                            onClick={() => handleDelete(cert.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <CardTitle className="text-sm font-bold leading-tight">{cert.title}</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 pb-3">
                        {cert.jobTitle && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                            <Briefcase className="h-3 w-3 shrink-0" />
                            <span className="truncate">{cert.jobTitle}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground/70 mt-2 font-medium uppercase tracking-wider">
                          {format(new Date(cert.createdAt), "MMM d, yyyy")}
                        </div>
                      </CardContent>
                      <CardFooter className="p-0 border-t bg-secondary/5">
                        <Button 
                          variant="ghost" 
                          className="w-full text-xs h-9 rounded-none hover:bg-primary/10 hover:text-primary gap-1.5"
                          onClick={() => handleLoad(cert)}
                        >
                          <FileUp className="h-3.5 w-3.5" />
                          Load
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
