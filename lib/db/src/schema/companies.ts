import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  timezone: text("timezone").notNull().default("America/New_York"),
  logoUrl: text("logo_url"),
  widgetKey: text("widget_key"),
  widgetColor: text("widget_color").default("#f97316"),
  widgetGreeting: text("widget_greeting").default("Hi! How can I help you today?"),
  emailAutoSend: boolean("email_auto_send").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
