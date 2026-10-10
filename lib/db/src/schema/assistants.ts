import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assistantsTable = pgTable("assistants", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  name: text("name").notNull(),
  type: text("type").notNull().default("phone"),
  voice: text("voice").notNull().default("marin"),
  personality: text("personality").notNull().default("professional"),
  greeting: text("greeting").notNull().default("Thank you for calling. How can I help you today?"),
  instructions: text("instructions"),
  active: boolean("active").notNull().default(true),
  callsHandled: integer("calls_handled").notNull().default(0),
  jobsBooked: integer("jobs_booked").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssistantSchema = createInsertSchema(assistantsTable).omit({ id: true, createdAt: true, updatedAt: true, callsHandled: true, jobsBooked: true });
export type InsertAssistant = z.infer<typeof insertAssistantSchema>;
export type Assistant = typeof assistantsTable.$inferSelect;

// Training entries — structured knowledge injected into the assistant's system prompt
export const assistantTrainingTable = pgTable("assistant_training", {
  id: serial("id").primaryKey(),
  assistantId: integer("assistant_id").notNull().references(() => assistantsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(), // service | faq | area | hours | upsell
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAssistantTrainingSchema = createInsertSchema(assistantTrainingTable).omit({ id: true, createdAt: true });
export type InsertAssistantTraining = z.infer<typeof insertAssistantTrainingSchema>;
export type AssistantTraining = typeof assistantTrainingTable.$inferSelect;
