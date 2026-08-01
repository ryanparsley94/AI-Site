import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assistantsTable = pgTable("assistants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  voice: text("voice").notNull().default("alloy"),
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
