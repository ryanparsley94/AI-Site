import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

export const integrationsTable = pgTable("integrations", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull().unique(), // 'google' | 'quickbooks' | 'xero'
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  metadata: jsonb("metadata"), // e.g. QB realm ID, Xero tenant ID
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
});

export type Integration = typeof integrationsTable.$inferSelect;
