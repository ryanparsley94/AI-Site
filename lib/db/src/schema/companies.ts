import { pgTable, text, serial, timestamp, boolean, integer, smallint, time, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  timezone: text("timezone").notNull().default("Europe/London"),
  logoUrl: text("logo_url"),
  quoteTemplate: text("quote_template").notNull().default("classic"),
  quoteAccentColor: text("quote_accent_color").notNull().default("#f97316"),
  quoteTagline: text("quote_tagline"),
  paymentTerms: text("payment_terms"),
  quoteFooterText: text("quote_footer_text"),
  widgetKey: text("widget_key"),
  widgetColor: text("widget_color").default("#f97316"),
  widgetGreeting: text("widget_greeting").default("Hi! How can I help you today?"),
  widgetLeadNotify: boolean("widget_lead_notify").notNull().default(true),
  emailAutoSend: boolean("email_auto_send").notNull().default(false),
  voiceAgentName: text("voice_agent_name"),
  voiceId: text("voice_id").notNull().default("Polly.Amy-Neural"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;

export const companyBookingHoursTable = pgTable("company_booking_hours", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  dayOfWeek: smallint("day_of_week").notNull(),
  openTime: time("open_time"),
  closeTime: time("close_time"),
  bookable: boolean("bookable").notNull().default(false),
}, (table) => [
  unique("company_booking_hours_company_id_day_of_week_key").on(table.companyId, table.dayOfWeek),
]);
