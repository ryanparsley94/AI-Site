import { useState, useEffect } from "react";
import { 
  useListQuotes, 
  useCreateQuote, 
  useDeleteQuote, 
  useSearchMaterialPrices,
  getListQuotesQueryKey,
  PriceSearchResult
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Calculator, Plus, Trash2, Search, ExternalLink, 
  Save, Calendar, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

const initialInput = [
  { name: "", quantity: 1, unit: "each" },
  { name: "", quantity: 1, unit: "each" },
  { name: "", quantity: 1, unit: "each" },
];

export default function Quotes() {
  const { data: quotes = [], isLoading: isLoadingQuotes } = useListQuotes();
  const searchPrices = useSearchMaterialPrices();
  const createQuote = useCreateQuote();
  const deleteQuote = useDeleteQuote();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [inputs, setInputs] = useState<{name: string, quantity: number, unit: string}[]>(initialInput);
  const [results, setResults] = useState<PriceSearchResult | null>(null);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);

  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [jobId, setJobId] = useState("");

  // Pre-fill from a "Create Quote from Call" action
  useEffect(() => {
    const raw = sessionStorage.getItem("buildai_prefill_quote");
    if (!raw) return;
    sessionStorage.removeItem("buildai_prefill_quote");
    try {
      const prefill = JSON.parse(raw);
      if (prefill.materials?.length) {
        setInputs(prefill.materials.map((m: { name: string; quantity: number; unit: string }) => ({
          name: m.name ?? "",
          quantity: Number(m.quantity) || 1,
          unit: m.unit ?? "each",
        })));
      }
      if (prefill.title) setQuoteTitle(prefill.title);
      if (prefill.callerName) setPrefillBanner(`Pre-filled from call with ${prefill.callerName}`);
    } catch {}
  }, []);

  const updateInput = (index: number, field: keyof typeof inputs[0], value: string | number) => {
    const newInputs = [...inputs];
    newInputs[index] = { ...newInputs[index], [field]: value };
    setInputs(newInputs);
  };

  const removeRow = (index: number) => {
    if (inputs.length <= 1) return;
    setInputs(inputs.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setInputs([...inputs, { name: "", quantity: 1, unit: "each" }]);
  };

  const handleSearch = () => {
    const validInputs = inputs.filter(i => i.name.trim() !== "");
    if (validInputs.length === 0) {
      toast({ title: "Please enter at least one material name", variant: "destructive" });
      return;
    }
    
    searchPrices.mutate({ data: { materials: validInputs } }, {
      onSuccess: (data) => {
        setResults(data);
        toast({ title: "Prices fetched successfully" });
      },
      onError: () => {
        toast({ title: "Failed to fetch prices", variant: "destructive" });
      }
    });
  };

  const handleSaveQuote = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!results) return;
    if (!quoteTitle.trim()) {
      toast({ title: "Please enter a quote title", variant: "destructive" });
      return;
    }

    createQuote.mutate({
      data: {
        title: quoteTitle,
        jobId: jobId || undefined,
        grandTotal: results.grandTotal,
        materials: results.materials.map(m => ({
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          unitPrice: m.unitPrice,
          source: m.source,
          sourceUrl: m.sourceUrl,
          total: m.total
        }))
      }
    }, {
      onSuccess: () => {
        setIsSaveOpen(false);
        setQuoteTitle("");
        setJobId("");
        toast({ title: "Quote saved successfully" });
        queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Delete this quote?")) {
      deleteQuote.mutate({ id }, {
        onSuccess: () => {
          toast({ title: "Quote deleted" });
          queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
        }
      });
    }
  };

  const getConfidenceColor = (confidence: string) => {
    if (confidence === 'high') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (confidence === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-muted/30 overflow-hidden">
      <div className="p-6 border-b bg-background flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-secondary">AI Materials Quotation Tool</h1>
            <p className="text-muted-foreground text-sm">Instantly estimate costs using AI-powered price search across suppliers.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Pre-fill banner from call */}
          {prefillBanner && (
            <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary font-medium">
              <Calculator size={16} />
              {prefillBanner} — materials pre-filled below. Review and click "Get AI Prices".
              <button onClick={() => setPrefillBanner(null)} className="ml-auto text-primary/60 hover:text-primary">✕</button>
            </div>
          )}
          
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Input Section */}
            <Card className="lg:col-span-5 flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  Material List
                </CardTitle>
                <CardDescription>Enter materials and quantities to estimate.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">
                {inputs.map((input, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <div className="flex-1 space-y-2">
                      <Label className="sr-only">Material Name</Label>
                      <Input 
                        placeholder="e.g. 2x4x8 Premium Stud" 
                        value={input.name}
                        onChange={(e) => updateInput(index, "name", e.target.value)}
                      />
                    </div>
                    <div className="w-20 space-y-2">
                      <Label className="sr-only">Quantity</Label>
                      <Input 
                        type="number" 
                        min="1"
                        value={input.quantity}
                        onChange={(e) => updateInput(index, "quantity", Number(e.target.value))}
                      />
                    </div>
                    <div className="w-24 space-y-2">
                      <Label className="sr-only">Unit</Label>
                      <Input 
                        placeholder="each, ft, box" 
                        value={input.unit}
                        onChange={(e) => updateInput(index, "unit", e.target.value)}
                      />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-muted-foreground hover:text-destructive shrink-0 mt-0"
                      onClick={() => removeRow(index)}
                      disabled={inputs.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                
                <Button variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={addRow}>
                  <Plus className="h-4 w-4" /> Add Item
                </Button>
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/20">
                <Button 
                  className="w-full gap-2" 
                  onClick={handleSearch}
                  disabled={searchPrices.isPending}
                >
                  {searchPrices.isPending ? (
                    <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {searchPrices.isPending ? "Searching Prices..." : "Get AI Prices"}
                </Button>
              </CardFooter>
            </Card>

            {/* Results Section */}
            <Card className="lg:col-span-7 flex flex-col bg-secondary/5 border-secondary/10 shadow-inner">
              <CardHeader className="pb-4 border-b border-secondary/10 bg-background/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      Price Estimate Results
                    </CardTitle>
                    <CardDescription>Live market estimates sourced by BuildAI.</CardDescription>
                  </div>
                  {results && (
                    <Button size="sm" onClick={() => setIsSaveOpen(true)} className="gap-2">
                      <Save className="h-4 w-4" /> Save Quote
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-hidden">
                {!results && !searchPrices.isPending ? (
                  <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                    <Search className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <p className="font-medium text-foreground/80">Awaiting Input</p>
                    <p className="text-sm mt-1">Enter your material list and click "Get AI Prices" to see estimates.</p>
                  </div>
                ) : searchPrices.isPending ? (
                  <div className="h-full min-h-[300px] flex flex-col items-center justify-center p-8">
                    <div className="h-8 w-8 border-4 border-primary border-t-transparent animate-spin rounded-full mb-4" />
                    <p className="font-medium text-foreground/80 animate-pulse">Scanning local suppliers...</p>
                  </div>
                ) : results ? (
                  <div className="overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader className="bg-background/80 sticky top-0">
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.materials.map((mat, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div className="font-medium text-sm">{mat.name}</div>
                              <Badge variant="outline" className={`text-[10px] mt-1 uppercase tracking-wider py-0 border-0 ${getConfidenceColor(mat.confidence)}`}>
                                {mat.confidence} match
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {mat.quantity} <span className="text-muted-foreground">{mat.unit}</span>
                            </TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(mat.unitPrice)}</TableCell>
                            <TableCell>
                              <div className="text-sm font-medium">{mat.source}</div>
                              {mat.sourceUrl && (
                                <a href={mat.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                                  View <ExternalLink size={10} />
                                </a>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-sm">{formatCurrency(mat.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </CardContent>
              {results && (
                <div className="border-t border-secondary/10 bg-background/50 p-4 shrink-0">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold text-muted-foreground uppercase text-sm tracking-wider">Grand Total</span>
                    <span className="text-2xl font-bold text-secondary">{formatCurrency(results.grandTotal)}</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 text-amber-800 dark:text-amber-400 p-3 rounded-md">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <p>{results.disclaimer}</p>
                  </div>
                </div>
              )}
            </Card>
          </div>

          <div className="pt-8">
            <h2 className="text-lg font-bold tracking-tight text-secondary mb-4 flex items-center gap-2">
              Saved Quotes
            </h2>
            
            {isLoadingQuotes ? (
              <div className="text-center py-12 text-muted-foreground">Loading quotes...</div>
            ) : quotes.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground text-sm font-medium">No saved quotes yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {quotes.map(quote => (
                  <Card key={quote.id} className="flex flex-col hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-3 border-b">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-bold text-secondary flex items-center gap-1">
                          <Calendar size={12} /> {format(new Date(quote.createdAt), "MMM d, yyyy")}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-muted-foreground hover:text-destructive -mr-2 -mt-2"
                          onClick={() => handleDelete(quote.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <CardTitle className="text-base leading-tight">{quote.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 pb-4 flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground">Materials</span>
                        <Badge variant="secondary" className="font-mono">{quote.materials.length} items</Badge>
                      </div>
                      {quote.jobId && (
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-muted-foreground">Linked Job</span>
                          <span className="text-sm font-medium truncate max-w-[120px]">{quote.jobId}</span>
                        </div>
                      )}
                      
                      <div className="mt-4 pt-4 border-t flex justify-between items-end">
                        <span className="text-xs font-semibold text-muted-foreground uppercase">Total</span>
                        <span className="text-lg font-bold text-secondary">{formatCurrency(quote.grandTotal)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
      
      <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Quote</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveQuote} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Quote Title <span className="text-destructive">*</span></Label>
              <Input 
                id="title" 
                placeholder="e.g. Smith Residence Framing" 
                value={quoteTitle}
                onChange={(e) => setQuoteTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="jobId">Job Link (Optional)</Label>
              <Input 
                id="jobId" 
                placeholder="e.g. JOB-1042" 
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Link this quote to an existing job ID or reference number.</p>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsSaveOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createQuote.isPending} className="gap-2">
                <Save className="h-4 w-4" />
                {createQuote.isPending ? "Saving..." : "Save Quote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
