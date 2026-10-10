import { pgTable, text, serial, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const callsTable = pgTable("calls", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  callerName: text("caller_name").notNull(),
  callerPhone: text("caller_phone").notNull(),
  status: text("status").notNull().default("unresolved"),
  outcome: text("outcome").notNull().default(""),
  duration: integer("duration").notNull().default(0),
  assistantName: text("assistant_name").notNull(),
  notes: text("notes"),
  jobId: integer("job_id"),
  contactId: integer("contact_id"),
  reviewed: boolean("reviewed").notNull().default(false),
  transcript: jsonb("transcript").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCallSchema = createInsertSchema(callsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof callsTable.$inferSelect;
