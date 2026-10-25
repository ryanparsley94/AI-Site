type Query = (sql: string, values?: unknown[]) => Promise<{ rows: any[] }>;
let handler: Query = async () => { throw new Error("Test query handler not configured"); };
export function setQueryHandler(query: Query) { handler = query; }
export const pool = {
  query: (sql: string, values?: unknown[]) => handler(sql, values),
  connect: async () => ({
    query: (sql: string, values?: unknown[]) => handler(sql, values),
    release: () => undefined,
  }),
};
