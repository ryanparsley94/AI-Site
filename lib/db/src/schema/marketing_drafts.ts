import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketingDraftsTable = pgTable("marketing_drafts", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id"),
  jobTitle: text("job_title").notNull(),
  clientName: text("client_name").notNull(),
  clientPhone: text("client_phone"),
  clientEmail: text("client_email"),
  channel: text("channel").notNull().default("sms"),
  deliveryStatus: text("delivery_status").notNull().default("not_sent"),
  deliveryVersion: integer("delivery_version").notNull().default(0),
  deliveryError: text("delivery_error"),
  providerMessageId: text("provider_message_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  companyName: text("company_name").notNull().default(""),
  // review_request | followup
  type: text("type").notNull().default("review_request"),
  // pending | approved | dismissed
  status: text("status").notNull().default("pending"),
  draftMessage: text("draft_message"),
  editedMessage: text("edited_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMarketingDraftSchema = createInsertSchema(marketingDraftsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMarketingDraft = z.infer<typeof insertMarketingDraftSchema>;
export type MarketingDraft = typeof marketingDraftsTable.$inferSelect;
