import { integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { quotesTable } from "./quotes";

export const quoteVersionsTable = pgTable("quote_versions", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotesTable.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  workflow: jsonb("workflow").notNull(),
  totalIncVat: numeric("total_inc_vat", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex("quote_versions_quote_revision_idx").on(table.quoteId, table.revision)]);
