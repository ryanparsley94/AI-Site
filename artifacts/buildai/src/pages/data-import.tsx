import { useState } from "react";
import { Upload, Users, MapPin, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type ImportKind = "customers" | "sites";

type PreviewResult = {
  kind: ImportKind;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  headers: string[];
  sample: Array<Record<string, string>>;
};

type ImportResult = {
  kind: ImportKind;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
};

function ImportCard({
  kind,
  title,
  description,
  required,
}: {
  kind: ImportKind;
  title: string;
  description: string;
  required: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const Icon = kind === "customers" ? Users : MapPin;

  const loadFile = async (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    setResult(null);
    if (!selected) {
      setCsv("");
      return;
    }
    if (!selected.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Choose a CSV file", variant: "destructive" });
      setFile(null);
      setCsv("");
      return;
    }
    if (selected.size > 5_000_000) {
      toast({
        title: "CSV is too large",
        description: "Maximum file size is 5 MB.",
        variant: "destructive",
      });
      setFile(null);
      setCsv("");
      return;
    }
    setCsv(await selected.text());
  };

  const request = async (previewOnly: boolean) => {
    if (!csv) return;
    setBusy(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const endpoint =
        base +
        "/api/imports/tradify/" +
        kind +
        (previewOnly ? "?preview=true" : "");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csv,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");

      if (previewOnly) {
        setPreview(data as PreviewResult);
        setResult(null);
      } else {
        setResult(data as ImportResult);
        toast({
          title:
            kind === "customers"
              ? "Customer import complete"
              : "Site import complete",
          description:
            String(data.created) +
            " created, " +
            String(data.updated) +
            " updated, " +
            String(data.skipped) +
            " skipped.",
        });
      }
    } catch (error) {
      toast({
        title: "Import could not be completed",
        description:
          error instanceof Error
            ? error.message
            : "Please check the CSV and try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Icon size={20} />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="mt-1">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border border-dashed p-4 bg-muted/20">
          <p className="text-xs font-semibold text-foreground mb-1">
            Expected Tradify fields
          </p>
          <p className="text-xs text-muted-foreground">{required}</p>
        </div>

        <label className="block cursor-pointer">
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <FileText
                size={20}
                className="text-muted-foreground shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {file?.name || "Choose Tradify CSV"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {file
                    ? String(Math.max(1, Math.round(file.size / 1024))) + " KB"
                    : "CSV only · maximum 5 MB"}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-none gap-2"
            >
              <Upload size={14} /> Choose file
            </Button>
          </div>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) =>
              void loadFile(event.target.files?.[0] ?? null)
            }
          />
        </label>

        {file && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void request(true)}
              disabled={busy}
            >
              {busy ? "Checking…" : "Preview import"}
            </Button>
            <Button
              onClick={() => void request(false)}
              disabled={busy || !preview || preview.validRows === 0}
            >
              {busy ? "Importing…" : "Import " + kind}
            </Button>
          </div>
        )}

        {preview && (
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-sm">Preview</p>
                <p className="text-xs text-muted-foreground">
                  No records have been changed yet.
                </p>
              </div>
              <Badge variant={preview.skippedRows ? "outline" : "default"}>
                {preview.validRows} ready
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-lg font-bold">
                  {preview.totalRows}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Rows
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-lg font-bold text-green-700">
                  {preview.validRows}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Valid
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <div className="text-lg font-bold text-amber-700">
                  {preview.skippedRows}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Skipped
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground break-words">
              Columns found: {preview.headers.join(", ")}
            </p>
          </div>
        )}

        {result && (
          <div className="rounded-xl border p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 size={18} />
              <p className="font-semibold text-sm">Import finished</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-xl font-bold">{result.created}</div>
                <div className="text-[11px] text-muted-foreground">
                  Created
                </div>
              </div>
              <div>
                <div className="text-xl font-bold">{result.updated}</div>
                <div className="text-[11px] text-muted-foreground">
                  Updated
                </div>
              </div>
              <div>
                <div className="text-xl font-bold">{result.skipped}</div>
                <div className="text-[11px] text-muted-foreground">
                  Skipped
                </div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <div className="flex items-center gap-2 text-amber-800 mb-2">
                  <AlertTriangle size={14} />
                  <span className="text-xs font-semibold">
                    Rows to check
                  </span>
                </div>
                <div className="max-h-28 overflow-auto space-y-1">
                  {result.errors.map((error) => (
                    <p
                      key={String(error.row) + "-" + error.message}
                      className="text-xs text-amber-900"
                    >
                      Row {error.row}: {error.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DataImport() {
  return (
    <div className="flex-1 min-h-full bg-background">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold tracking-tight text-secondary">
          Import from Tradify
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bring your existing customer database and job sites into CREWON
          before switching your day-to-day admin across.
        </p>
      </div>

      <div className="p-6 max-w-5xl space-y-6">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm font-semibold">Recommended order</p>
          <p className="text-sm text-muted-foreground mt-1">
            Export and import <strong>Customers</strong> first. Then export
            and import <strong>Customer Sites</strong>. CREWON links each
            site to the matching customer name, so importing sites first
            will safely skip unmatched rows.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <ImportCard
            kind="customers"
            title="1. Customers"
            description="Creates or updates CRM customers without clearing existing CrewOn fields when the CSV cell is blank."
            required="Customer Name is required. CREWON also recognises Contact Name, Phone Number, Mobile Number, Email Address and Tradify physical-address fields."
          />
          <ImportCard
            kind="sites"
            title="2. Customer Sites"
            description="Adds multiple job locations beneath the customer instead of flattening every address into one CRM field."
            required="Customer and Site Name are required. Address, postcode, phone and notes are imported when present."
          />
        </div>
      </div>
    </div>
  );
}
