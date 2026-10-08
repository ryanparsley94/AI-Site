/** Shared, side-effect-free quote arithmetic. Money is rounded in pence per line. */
export type QuoteItemType = "materials" | "labour" | "subcontractor" | "plant" | "other";
export interface QuoteItem {
  id: string;
  type: QuoteItemType;
  description: string;
  quantity: number;
  unit: string;
  costPrice: number;
  sellPrice: number;
  source?: string;
  sourceUrl?: string;
  pricedAt?: string;
  priceVerified?: boolean;
}
export interface QuoteSection { id: string; title: string; items: QuoteItem[] }
export interface QuoteWorkflow {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  billingAddress: string;
  siteAddress: string;
  scope: string;
  assumptions: string;
  exclusions: string;
  paymentTerms: string;
  validUntil: string;
  vatRegistered: boolean;
  vatNumber: string;
  vatPercent: number;
  deposit: { mode: "none" | "materials" | "fixed" | "percentage"; value: number };
  sections: QuoteSection[];
}
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function sellingFromCost(cost: number, percent: number, method: "markup" | "margin" = "markup") {
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(percent) || percent < 0 ||
      (method === "margin" && percent >= 100)) throw new Error("Enter a valid cost and percentage; margin must be below 100%.");
  return money(method === "margin" ? cost / (1 - percent / 100) : cost * (1 + percent / 100));
}
export function blankQuoteWorkflow(): QuoteWorkflow {
  return {
    customerName: "", customerEmail: "", customerPhone: "", billingAddress: "", siteAddress: "",
    scope: "", assumptions: "", exclusions: "", paymentTerms: "", validUntil: "",
    vatRegistered: true, vatNumber: "", vatPercent: 20,
    deposit: { mode: "none", value: 0 },
    sections: [{ id: "work", title: "Work & materials", items: [] }],
  };
}
export function calculateQuote(workflow: QuoteWorkflow) {
  let costPence = 0, sellPence = 0, materialPence = 0;
  const lines = workflow.sections.flatMap(section => section.items.map(item => {
    for (const [label, value, max] of [
      ["quantity", item.quantity, 1000000],
      ["cost price", item.costPrice, 10000000],
      ["selling price", item.sellPrice, 10000000],
    ] as const) {
      if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`Invalid ${label} for ${item.description || "line item"}.`);
    }
    const quantity = Math.round(item.quantity * 10000);
    const cost = Math.round(Math.round(item.costPrice * 100) * quantity / 10000);
    const selling = Math.round(Math.round(item.sellPrice * 100) * quantity / 10000);
    costPence += cost;
    sellPence += selling;
    if (item.type === "materials") materialPence += selling;
    return { ...item, sectionTitle: section.title, costTotal: cost / 100, total: selling / 100 };
  }));
  if (sellPence > 99999999999 || costPence > 99999999999) throw new Error("Quote exceeds the supported value.");
  const rate = workflow.vatRegistered ? workflow.vatPercent : 0;
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("VAT must be between 0 and 100%.");
  const vatPence = Math.round(sellPence * rate / 100);
  const totalPence = sellPence + vatPence;
  const value = workflow.deposit.value;
  if (!Number.isFinite(value) || value < 0) throw new Error("Deposit must not be negative.");
  if (["percentage", "materials"].includes(workflow.deposit.mode) && value > 100) throw new Error("Deposit percentage must not exceed 100%.");
  let depositPence = 0;
  if (workflow.deposit.mode === "fixed") depositPence = Math.round(value * 100);
  if (workflow.deposit.mode === "percentage") depositPence = Math.round(totalPence * value / 100);
  if (workflow.deposit.mode === "materials") {
    const materialWithVat = materialPence + Math.round(materialPence * rate / 100);
    depositPence = Math.round(materialWithVat * value / 100);
  }
  if (depositPence > totalPence) throw new Error("Deposit cannot exceed the quote total.");
  return {
    lines, subtotal: sellPence / 100, costTotal: costPence / 100,
    profit: (sellPence - costPence) / 100,
    profitPercent: sellPence ? (sellPence - costPence) / sellPence * 100 : 0,
    materialsSubtotal: materialPence / 100, vatPercent: rate,
    vatAmount: vatPence / 100, total: totalPence / 100,
    depositAmount: depositPence / 100, balance: (totalPence - depositPence) / 100,
  };
}
/** Existing records are never rewritten on read. This prepares an explicit edit/duplicate. */
export function legacyQuoteWorkflow(quote: {
  materials: Array<{ name: string; quantity: number; unit: string; type?: string; unitPrice?: number | null; total?: number | null }>;
  grandTotal: number; marginAmount?: number | null; vatPercent?: number | null;
}, defaults?: Partial<QuoteWorkflow>): QuoteWorkflow {
  const workflow = { ...blankQuoteWorkflow(), ...defaults, vatPercent: quote.vatPercent ?? 20 };
  const items: QuoteItem[] = quote.materials.map((item, index) => ({
    id: `legacy-${index}`, type: item.type === "labour" || item.unit === "hrs" ? "labour" : "materials",
    description: item.name, quantity: item.quantity, unit: item.unit,
    costPrice: item.unitPrice ?? 0, sellPrice: item.unitPrice ?? 0,
  }));
  // Preserve legacy pricing allowances rather than inventing missing scope or labour.
  const target = money(quote.grandTotal + (quote.marginAmount ?? 0));
  const current = money(items.reduce((sum, item) => sum + money(item.quantity * item.sellPrice), 0));
  if (target > current) items.push({
    id: "legacy-allowance", type: "other", description: "Existing quote pricing allowance",
    quantity: 1, unit: "item", costPrice: 0, sellPrice: money(target - current),
  });
  workflow.sections = [{ id: "legacy", title: "Quoted work", items }];
  return workflow;
}
