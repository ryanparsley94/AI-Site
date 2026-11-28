import { pool } from "@workspace/db";
import type { RequestHandler } from "express";

/**
 * Transitional V1 safety boundary, NOT multi-tenant authentication.
 * The current dashboard signs everyone in with one shared password,
 * so it must never choose an arbitrary company's private CRM records.
 * Replace this with an identity-bound companyId before SaaS launch.
 */
export class PilotCompanyError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "PilotCompanyError";
  }
}

export async function getSinglePilotCompanyId(): Promise<number> {
  const result = await pool.query<{ id: number }>(
    "SELECT id FROM companies ORDER BY id LIMIT 2",
  );
  if (result.rows.length === 0) {
    throw new PilotCompanyError(503, "Set up the business profile before using customer records.");
  }
  if (result.rows.length !== 1) {
    throw new PilotCompanyError(
      409,
      "Customer records are locked because several businesses exist. Individual business logins and tenant isolation must be enabled first.",
    );
  }
  return result.rows[0].id;
}

export const requireSingleCompanyPilot: RequestHandler = async (_req, res, next) => {
  try {
    // This is ONLY safe for a private, single-business proof of concept.
    // The route index must enforce adminOnly before mounting this middleware.
    res.locals.pilotCompanyId = await getSinglePilotCompanyId();
    next();
  } catch (error) {
    if (error instanceof PilotCompanyError) {
      res.setHeader("Cache-Control", "no-store");
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    next(error);
  }
};
