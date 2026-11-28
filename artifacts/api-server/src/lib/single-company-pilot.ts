import { pool } from "@workspace/db";
import type { RequestHandler } from "express";
import { PilotCompanyError, singlePilotCompanyId } from "./single-company-pilot-policy";

export async function getSinglePilotCompanyId(): Promise<number> {
  const result = await pool.query<{ id: number }>(
    "SELECT id FROM companies ORDER BY id LIMIT 2",
  );
  return singlePilotCompanyId(result.rows.map((row) => row.id));
}

export const requireSingleCompanyPilot: RequestHandler = async (_req, res, next) => {
  try {
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
