import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const billingSubscriptionsTable = pgTable("billing_subscriptions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().unique(),
  plan: text("plan").notNull().default("office"),
  status: text("status").notNull().default("inactive"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBillingSubscriptionSchema = createInsertSchema(billingSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBillingSubscription = z.infer<typeof insertBillingSubscriptionSchema>;
export type BillingSubscription = typeof billingSubscriptionsTable.$inferSelect;
