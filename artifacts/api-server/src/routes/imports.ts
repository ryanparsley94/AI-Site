import { Router, text as textBody } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();
const MAX_ROWS = 10_000;
const MAX_ERRORS = 50;

type CsvRow = string[];
type ImportError = { row: number; message: string };

function parseCsv(input: string): { headers: string[]; rows: CsvRow[] } {
  if (!input || input.length > 5_000_000) {
    throw new Error("CSV must be between 1 byte and 5 MB.");
  }

  const rows: CsvRow[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error(`CSV is limited to ${MAX_ROWS} data rows.`);
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      pushCell();
    } else if (char === "\n") {
      pushRow();
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (cell.length || row.length) pushRow();
  if (rows.length < 2) throw new Error("CSV must contain a header row and at least one data row.");

  const headers = rows.shift()!.map((value, index) => {
    const clean = value.replace(/^\uFEFF/, "").trim();
    return clean || `Column ${index + 1}`;
  });
  return { headers, rows };
}

function normaliseHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function rowAccessor(headers: string[], row: CsvRow) {
  const index = new Map<string, number>();
  headers.forEach((header, i) => index.set(normaliseHeader(header), i));

  const value = (...aliases: string[]): string => {
    for (const alias of aliases) {
      const found = index.get(normaliseHeader(alias));
      if (found !== undefined) return (row[found] ?? "").trim().slice(0, 5000);
    }
    return "";
  };

  return { value, index };
}

function joinAddress(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(", ").slice(0, 2000);
}

function notesFromTradify(headers: string[], row: CsvRow, contactName: string): string | null {
  const parts: string[] = [];
  if (contactName) parts.push(`Primary contact: ${contactName}`);
  headers.forEach((header, i) => {
    if (/^note\s*\[/i.test(header.trim())) {
      const note = (row[i] ?? "").trim();
      if (note) parts.push(`${header.trim()}: ${note}`);
    }
  });
  return parts.length ? parts.join("\n").slice(0, 8000) : null;
}

async function pilotCompanyId(): Promise<number> {
  const company = await pool.query<{ id: number }>("SELECT id FROM companies ORDER BY id LIMIT 1");
  if (!company.rows[0]) throw new Error("Create the business profile before importing customers.");
  return company.rows[0].id;
}

async function findCustomer(
  companyId: number,
  customerName: string,
  phone: string,
  email: string,
): Promise<{ id: number } | null> {
  if (phone) {
    const phoneKey = phone.replace(/[^0-9+]/g, "");
    const byPhone = await pool.query<{ id: number }>(
      `SELECT id FROM contacts
        WHERE company_id=$1
          AND regexp_replace(phone,'[^0-9+]','','g')=$2
        ORDER BY id LIMIT 1`,
      [companyId, phoneKey],
    );
    if (byPhone.rows[0]) return byPhone.rows[0];
  }

  if (email) {
    const byEmail = await pool.query<{ id: number }>(
      "SELECT id FROM contacts WHERE company_id=$1 AND lower(email)=lower($2) ORDER BY id LIMIT 1",
      [companyId, email],
    );
    if (byEmail.rows[0]) return byEmail.rows[0];
  }

  const byName = await pool.query<{ id: number }>(
    "SELECT id FROM contacts WHERE company_id=$1 AND lower(name)=lower($2) ORDER BY id LIMIT 1",
    [companyId, customerName],
  );
  return byName.rows[0] ?? null;
}

function customerFields(headers: string[], row: CsvRow) {
  const { value } = rowAccessor(headers, row);
  const customerName = value("Customer Name", "Customer");
  const contactName = value("Contact Name");
  const phone = value("Mobile Number", "Mobile", "Phone Number", "Phone");
  const email = value("Email Address", "Email", "Customer Email Address(es)");
  const address = joinAddress([
    value("Physical Address Street", "Address Street", "Street"),
    value("Physical Address City", "City"),
    value("Physical Address Region", "Region", "County"),
    value("Physical Address Postal Code", "Postal Code", "Postcode"),
    value("Physical Address Country", "Country"),
  ]);
  const notes = notesFromTradify(headers, row, contactName && contactName !== customerName ? contactName : "");
  return { customerName, contactName, phone, email, address, notes };
}

router.post(
  "/imports/tradify/customers",
  textBody({ type: ["text/csv", "text/plain"], limit: "5mb" }),
  async (req, res): Promise<void> => {
    try {
      if (typeof req.body !== "string") {
        res.status(400).json({ error: "Upload a Tradify customer CSV file." });
        return;
      }

      const { headers, rows } = parseCsv(req.body);
      const preview = req.query.preview === "true";
      const sample = rows.slice(0, 5).map((row) => customerFields(headers, row));
      const validRows = rows.filter((row) => Boolean(customerFields(headers, row).customerName)).length;

      if (preview) {
        res.json({
          kind: "customers",
          totalRows: rows.length,
          validRows,
          skippedRows: rows.length - validRows,
          headers,
          sample,
        });
        return;
      }

      const companyId = await pilotCompanyId();
      const errors: ImportError[] = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (let i = 0; i < rows.length; i += 1) {
        const rowNumber = i + 2;
        const fields = customerFields(headers, rows[i]);
        if (!fields.customerName) {
          skipped += 1;
          if (errors.length < MAX_ERRORS) errors.push({ row: rowNumber, message: "Customer Name is blank." });
          continue;
        }

        try {
          const existing = await findCustomer(companyId, fields.customerName, fields.phone, fields.email);
          if (existing) {
            await pool.query(
              `UPDATE contacts
                  SET name=$2,
                      phone=CASE WHEN $3<>'' THEN $3 ELSE phone END,
                      email=CASE WHEN $4<>'' THEN $4 ELSE email END,
                      address=CASE WHEN $5<>'' THEN $5 ELSE address END,
                      type='customer',
                      notes=CASE
                        WHEN $6::text IS NULL OR $6='' THEN notes
                        WHEN notes IS NULL OR notes='' THEN $6
                        WHEN position($6 in notes)>0 THEN notes
                        ELSE notes || E'\\n' || $6
                      END,
                      updated_at=now()
                WHERE id=$1 AND company_id=$7`,
              [
                existing.id,
                fields.customerName,
                fields.phone,
                fields.email,
                fields.address,
                fields.notes,
                companyId,
              ],
            );
            updated += 1;
          } else {
            await pool.query(
              `INSERT INTO contacts(company_id,name,phone,email,address,type,notes)
               VALUES ($1,$2,$3,$4,$5,'customer',$6)`,
              [
                companyId,
                fields.customerName,
                fields.phone,
                fields.email || null,
                fields.address || null,
                fields.notes,
              ],
            );
            created += 1;
          }
        } catch (error) {
          skipped += 1;
          logger.warn({ err: error, rowNumber }, "Tradify customer import row failed");
          if (errors.length < MAX_ERRORS) errors.push({ row: rowNumber, message: "This customer could not be imported." });
        }
      }

      res.json({ kind: "customers", totalRows: rows.length, created, updated, skipped, errors });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Customer import failed." });
    }
  },
);

function siteFields(headers: string[], row: CsvRow) {
  const { value } = rowAccessor(headers, row);
  return {
    customerName: value("Customer", "Customer Name"),
    siteName: value("Site Name", "Site"),
    phone: value("Phone Number", "Phone", "Mobile Number", "Mobile"),
    street: value("Physical Address Street", "Address Street", "Street", "Address"),
    city: value("Physical Address City", "City"),
    region: value("Physical Address Region", "Region", "County"),
    postcode: value("Physical Address Postal Code", "Postal Code", "Postcode"),
    country: value("Physical Address Country", "Country"),
    notes: value("Notes", "Note"),
  };
}

router.post(
  "/imports/tradify/sites",
  textBody({ type: ["text/csv", "text/plain"], limit: "5mb" }),
  async (req, res): Promise<void> => {
    try {
      if (typeof req.body !== "string") {
        res.status(400).json({ error: "Upload a Tradify site CSV file." });
        return;
      }

      const { headers, rows } = parseCsv(req.body);
      const preview = req.query.preview === "true";
      const sample = rows.slice(0, 5).map((row) => siteFields(headers, row));
      const validRows = rows.filter((row) => {
        const fields = siteFields(headers, row);
        return Boolean(fields.customerName && fields.siteName);
      }).length;

      if (preview) {
        res.json({
          kind: "sites",
          totalRows: rows.length,
          validRows,
          skippedRows: rows.length - validRows,
          headers,
          sample,
        });
        return;
      }

      const companyId = await pilotCompanyId();
      const errors: ImportError[] = [];
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (let i = 0; i < rows.length; i += 1) {
        const rowNumber = i + 2;
        const fields = siteFields(headers, rows[i]);
        if (!fields.customerName || !fields.siteName) {
          skipped += 1;
          if (errors.length < MAX_ERRORS) {
            errors.push({ row: rowNumber, message: "Customer and Site Name are required." });
          }
          continue;
        }

        try {
          const contact = await pool.query<{ id: number }>(
            "SELECT id FROM contacts WHERE company_id=$1 AND lower(name)=lower($2) ORDER BY id LIMIT 1",
            [companyId, fields.customerName],
          );
          const contactId = contact.rows[0]?.id;
          if (!contactId) {
            skipped += 1;
            if (errors.length < MAX_ERRORS) {
              errors.push({
                row: rowNumber,
                message: `Customer "${fields.customerName}" was not found. Import customers first.`,
              });
            }
            continue;
          }

          const existing = await pool.query<{ id: number }>(
            `SELECT id FROM contact_sites
              WHERE company_id=$1 AND contact_id=$2
                AND lower(name)=lower($3)
                AND coalesce(postcode,'')=coalesce($4,'')
              ORDER BY id LIMIT 1`,
            [companyId, contactId, fields.siteName, fields.postcode || null],
          );

          if (existing.rows[0]) {
            await pool.query(
              `UPDATE contact_sites
                  SET address_street=CASE WHEN $2<>'' THEN $2 ELSE address_street END,
                      city=CASE WHEN $3<>'' THEN $3 ELSE city END,
                      region=CASE WHEN $4<>'' THEN $4 ELSE region END,
                      postcode=CASE WHEN $5<>'' THEN $5 ELSE postcode END,
                      country=CASE WHEN $6<>'' THEN $6 ELSE country END,
                      phone=CASE WHEN $7<>'' THEN $7 ELSE phone END,
                      notes=CASE WHEN $8<>'' THEN $8 ELSE notes END,
                      source='tradify',
                      updated_at=now()
                WHERE id=$1 AND company_id=$9`,
              [
                existing.rows[0].id,
                fields.street,
                fields.city,
                fields.region,
                fields.postcode,
                fields.country,
                fields.phone,
                fields.notes,
                companyId,
              ],
            );
            updated += 1;
          } else {
            await pool.query(
              `INSERT INTO contact_sites(
                 company_id,contact_id,name,address_street,city,region,postcode,country,phone,notes,source
               ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'tradify')`,
              [
                companyId,
                contactId,
                fields.siteName,
                fields.street || null,
                fields.city || null,
                fields.region || null,
                fields.postcode || null,
                fields.country || null,
                fields.phone || null,
                fields.notes || null,
              ],
            );
            created += 1;
          }
        } catch (error) {
          skipped += 1;
          logger.warn({ err: error, rowNumber }, "Tradify site import row failed");
          if (errors.length < MAX_ERRORS) errors.push({ row: rowNumber, message: "This site could not be imported." });
        }
      }

      res.json({ kind: "sites", totalRows: rows.length, created, updated, skipped, errors });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Site import failed." });
    }
  },
);

export default router;
