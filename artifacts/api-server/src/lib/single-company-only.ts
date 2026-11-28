import { pool } from "@workspace/db";
import { createSingleCompanyGuard } from "./single-company-guard";

export const singleCompanyOnly = createSingleCompanyGuard(async () => {
  const result = await pool.query<{ id: number }>("SELECT id FROM companies ORDER BY id LIMIT 2");
  return result.rows.length;
});
