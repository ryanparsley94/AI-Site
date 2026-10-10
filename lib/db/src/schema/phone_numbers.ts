import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const phoneNumbersTable = pgTable("phone_numbers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  assistantId: integer("assistant_id"),
  provider: text("provider").notNull().default("twilio"),
  providerSid: text("provider_sid"),
  phoneNumber: text("phone_number").notNull().unique(),
  label: text("label"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPhoneNumberSchema = createInsertSchema(phoneNumbersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPhoneNumber = z.infer<typeof insertPhoneNumberSchema>;
export type PhoneNumber = typeof phoneNumbersTable.$inferSelect;
