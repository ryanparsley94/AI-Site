import assert from "node:assert/strict";
import test from "node:test";
import { PilotCompanyError, singlePilotCompanyId } from "./single-company-pilot-policy";

test("single-company policy accepts exactly one synthetic business", () => {
  assert.equal(singlePilotCompanyId([42]), 42);
});

test("single-company policy fails closed when no business or multiple businesses exist", () => {
  assert.throws(() => singlePilotCompanyId([]), (error) =>
    error instanceof PilotCompanyError && error.statusCode === 503);
  assert.throws(() => singlePilotCompanyId([42, 84]), (error) =>
    error instanceof PilotCompanyError && error.statusCode === 409);
});
