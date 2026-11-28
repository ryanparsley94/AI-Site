import type { NextFunction, Request, Response } from "express";

export type CompanyCount = () => Promise<number>;

export function createSingleCompanyGuard(countCompanies: CompanyCount) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const count = await countCompanies();
      if (count > 1) {
        res.status(403).json({
          error: "This workspace is restricted to one business until individual company access is implemented. No business data was returned.",
        });
        return;
      }
      next();
    } catch {
      res.status(503).json({ error: "Business access could not be verified. Try again later." });
    }
  };
}
