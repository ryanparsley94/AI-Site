/**
 * QuickBooks Online API helpers — export invoices.
 */
import { logger } from "./logger";
import { getAccessToken } from "./oauth-tokens";

const QB_BASE_SANDBOX = "https://sandbox-quickbooks.api.intuit.com/v3/company";
const QB_BASE_PROD = "https://quickbooks.api.intuit.com/v3/company";

function getBase(realmId: string) {
  const useSandbox = process.env["QUICKBOOKS_SANDBOX"] === "true";
  return `${useSandbox ? QB_BASE_SANDBOX : QB_BASE_PROD}/${realmId}`;
}

interface QBLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceData {
  clientName: string;
  lineItems: QBLineItem[];
  dueDate: string;
  vatPercent: number;
  total: number;
}

/** Find or create a QuickBooks customer by name. Returns customer ID. */
async function findOrCreateCustomer(
  realmId: string,
  accessToken: string,
  name: string
): Promise<string | null> {
  const base = getBase(realmId);
  const query = `SELECT * FROM Customer WHERE DisplayName = '${name.replace(/'/g, "\\'")}'`;
  try {
    const res = await fetch(`${base}/query?query=${encodeURIComponent(query)}&minorversion=65`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as {
      QueryResponse?: { Customer?: Array<{ Id: string }> };
    };
    const existing = data.QueryResponse?.Customer?.[0];
    if (existing) return existing.Id;

    // Create new customer
    const createRes = await fetch(`${base}/customer?minorversion=65`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ DisplayName: name }),
    });
    if (!createRes.ok) throw new Error(await createRes.text());
    const created = (await createRes.json()) as { Customer: { Id: string } };
    return created.Customer.Id;
  } catch (err) {
    logger.error({ err }, "QB find/create customer failed");
    return null;
  }
}

/** Export a BuildAI invoice to QuickBooks Online. Returns QB invoice ID. */
export async function exportToQuickBooks(invoice: InvoiceData): Promise<{ id: string; docNumber: string } | { error: string }> {
  const token = await getAccessToken("quickbooks");
  if (!token) return { error: "QuickBooks not connected" };
  const realmId = (token.metadata as Record<string, string>)?.realmId;
  if (!realmId) return { error: "QuickBooks realm ID missing — please reconnect" };

  const customerId = invoice.clientName
    ? await findOrCreateCustomer(realmId, token.accessToken, invoice.clientName)
    : null;

  const lineItems = invoice.lineItems.map((li, i) => ({
    Id: String(i + 1),
    LineNum: i + 1,
    Amount: Number((li.unitPrice * li.quantity).toFixed(2)),
    DetailType: "SalesItemLineDetail",
    SalesItemLineDetail: {
      Qty: li.quantity,
      UnitPrice: li.unitPrice,
      ItemRef: { value: "1", name: li.name }, // Item ID 1 = default service item
    },
  }));

  const body: Record<string, unknown> = {
    Line: lineItems,
    DueDate: invoice.dueDate,
    ...(customerId ? { CustomerRef: { value: customerId } } : {}),
  };

  try {
    const base = getBase(realmId);
    const res = await fetch(`${base}/invoice?minorversion=65`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, text }, "QB invoice create failed");
      return { error: `QuickBooks error: ${res.status}` };
    }
    const data = (await res.json()) as { Invoice: { Id: string; DocNumber: string } };
    return { id: data.Invoice.Id, docNumber: data.Invoice.DocNumber };
  } catch (err) {
    logger.error({ err }, "QB export error");
    return { error: "Failed to reach QuickBooks — please try again" };
  }
}
