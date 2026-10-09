import { pgTable, text, serial, timestamp, numeric, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  materials: jsonb("materials").notNull().default([]),
  grandTotal: numeric("grand_total", { precision: 12, scale: 2 }).notNull().default("0"),
  jobId: integer("job_id"),
  contactId: integer("contact_id"),
  callId: integer("call_id"),
  status: text("status").notNull().default("draft"),
  revision: integer("revision").notNull().default(1),
  workflow: jsonb("workflow"),
  companySnapshot: jsonb("company_snapshot"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptanceTokenHash: text("acceptance_token_hash").unique(),
  sharedAt: timestamp("shared_at", { withTimezone: true }),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  changeRequest: text("change_request"),
  // Pricing breakdown
  marginPercent: numeric("margin_percent", { precision: 5, scale: 2 }),
  vatPercent: numeric("vat_percent", { precision: 5, scale: 2 }),
  marginAmount: numeric("margin_amount", { precision: 12, scale: 2 }),
  vatAmount: numeric("vat_amount", { precision: 12, scale: 2 }),
  totalIncVat: numeric("total_inc_vat", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
