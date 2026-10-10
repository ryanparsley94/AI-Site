import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactSitesTable = pgTable("contact_sites", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  contactId: integer("contact_id").notNull(),
  name: text("name").notNull(),
  addressStreet: text("address_street"),
  city: text("city"),
  region: text("region"),
  postcode: text("postcode"),
  country: text("country"),
  phone: text("phone"),
  notes: text("notes"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContactSiteSchema = createInsertSchema(contactSitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertContactSite = z.infer<typeof insertContactSiteSchema>;
export type ContactSite = typeof contactSitesTable.$inferSelect;
