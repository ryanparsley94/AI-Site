/**
 * Xero API helpers — export invoices.
 */
import { logger } from "./logger";
import { getAccessToken } from "./oauth-tokens";

const XERO_API = "https://api.xero.com/api.xro/2.0";

interface XeroLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

interface InvoiceData {
  clientName: string;
  lineItems: XeroLineItem[];
  dueDate: string;
  vatPercent: number;
}

/** Get Xero tenant ID from token metadata or fetch from connections. */
async function getTenantId(accessToken: string, storedTenantId?: string): Promise<string | null> {
  if (storedTenantId) return storedTenantId;
  try {
    const res = await fetch("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(await res.text());
    const connections = (await res.json()) as Array<{ tenantId: string; tenantType: string }>;
    return connections.find((c) => c.tenantType === "ORGANISATION")?.tenantId ?? null;
  } catch (err) {
    logger.error({ err }, "Xero get tenant ID failed");
    return null;
  }
}

/** Find or create a Xero contact by name. Returns contact ID. */
async function findOrCreateContact(
  tenantId: string,
  accessToken: string,
  name: string
): Promise<string | null> {
  try {
    const searchRes = await fetch(
      `${XERO_API}/Contacts?where=Name%3D%22${encodeURIComponent(name)}%22`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Xero-tenant-id": tenantId,
          Accept: "application/json",
        },
      }
    );
    if (searchRes.ok) {
      const data = (await searchRes.json()) as {
        Contacts?: Array<{ ContactID: string }>;
      };
      const existing = data.Contacts?.[0];
      if (existing) return existing.ContactID;
    }

    // Create new contact
    const createRes = await fetch(`${XERO_API}/Contacts`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-tenant-id": tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ Contacts: [{ Name: name }] }),
    });
    if (!createRes.ok) throw new Error(await createRes.text());
    const created = (await createRes.json()) as {
      Contacts: Array<{ ContactID: string }>;
    };
    return created.Contacts[0]?.ContactID ?? null;
  } catch (err) {
    logger.error({ err }, "Xero find/create contact failed");
    return null;
  }
}

/** Map VAT percent to a Xero tax type. */
function vatToTaxType(vatPercent: number): string {
  if (vatPercent === 20) return "OUTPUT2";
  if (vatPercent === 5) return "ZERORATEDOUTPUT";
  if (vatPercent === 0) return "NONE";
  return "OUTPUT2";
}

/** Export a BuildAI invoice to Xero. Returns Xero invoice ID and URL. */
export async function exportToXero(invoice: InvoiceData): Promise<
  { id: string; invoiceNumber: string; url: string } | { error: string }
> {
  const token = await getAccessToken("xero");
  if (!token) return { error: "Xero not connected" };

  const meta = token.metadata as Record<string, string> | null;
  const tenantId = await getTenantId(token.accessToken, meta?.tenantId);
  if (!tenantId) return { error: "No Xero organisation found — please reconnect" };

  const contactId = invoice.clientName
    ? await findOrCreateContact(tenantId, token.accessToken, invoice.clientName)
    : null;

  const taxType = vatToTaxType(invoice.vatPercent);
  const lineItems = invoice.lineItems.map((li) => ({
    Description: li.name,
    Quantity: li.quantity,
    UnitAmount: li.unitPrice,
    TaxType: taxType,
  }));

  const body = {
    Invoices: [
      {
        Type: "ACCREC",
        Status: "DRAFT",
        DueDate: invoice.dueDate,
        LineAmountTypes: "EXCLUSIVE",
        LineItems: lineItems,
        ...(contactId ? { Contact: { ContactID: contactId } } : {}),
      },
    ],
  };

  try {
    const res = await fetch(`${XERO_API}/Invoices`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Xero-tenant-id": tenantId,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.error({ status: res.status, text }, "Xero invoice create failed");
      return { error: `Xero error: ${res.status}` };
    }
    const data = (await res.json()) as {
      Invoices: Array<{ InvoiceID: string; InvoiceNumber: string }>;
    };
    const created = data.Invoices[0];
    if (!created) return { error: "Xero returned no invoice data" };
    return {
      id: created.InvoiceID,
      invoiceNumber: created.InvoiceNumber,
      url: `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${created.InvoiceID}`,
    };
  } catch (err) {
    logger.error({ err }, "Xero export error");
    return { error: "Failed to reach Xero — please try again" };
  }
}
