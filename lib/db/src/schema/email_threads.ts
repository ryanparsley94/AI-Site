import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailThreadsTable = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull().default(""),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull().default(""),
  bodyHtml: text("body_html"),
  // pending = awaiting approval, sent = reply sent, dismissed = no reply needed
  status: text("status").notNull().default("pending"),
  aiReply: text("ai_reply"),
  editedReply: text("edited_reply"),
  contactId: integer("contact_id"),
  messageId: text("message_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmailThreadSchema = createInsertSchema(emailThreadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailThread = z.infer<typeof insertEmailThreadSchema>;
export type EmailThread = typeof emailThreadsTable.$inferSelect;
