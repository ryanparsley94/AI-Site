import { pgTable, text, serial, timestamp, numeric, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  quoteId: integer("quote_id"),
  jobId: integer("job_id"),
  status: text("status").notNull().default("draft"),
  issueDate: text("issue_date").notNull(),
  dueDate: text("due_date").notNull(),
  lineItems: jsonb("line_items").notNull().default([]),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  vatPercent: numeric("vat_percent", { precision: 5, scale: 2 }).notNull().default("20"),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  clientName: text("client_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
