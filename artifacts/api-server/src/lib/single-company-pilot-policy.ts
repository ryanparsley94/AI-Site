export class PilotCompanyError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "PilotCompanyError";
  }
}

export function singlePilotCompanyId(ids: number[]): number {
  if (ids.length === 0) {
    throw new PilotCompanyError(503, "Set up the business profile before using customer records.");
  }
  if (ids.length !== 1) {
    throw new PilotCompanyError(
      409,
      "Customer records are locked because several businesses exist. Individual business logins and tenant isolation must be enabled first.",
    );
  }
  return ids[0];
}
