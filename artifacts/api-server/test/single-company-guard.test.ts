import assert from "node:assert/strict";
import test from "node:test";
import { createSingleCompanyGuard } from "../src/lib/single-company-guard.ts";

function invoke(count: number) {
  let status = 200;
  let body: unknown;
  let nextCalled = false;
  const res = {
    status(code: number) { status = code; return this; },
    json(value: unknown) { body = value; return this; },
  };
  const middleware = createSingleCompanyGuard(async () => count);
  return middleware({} as never, res as never, (() => { nextCalled = true; }) as never)
    .then(() => ({ status, body, nextCalled }));
}

test("single-company gate allows zero-company onboarding and the single-company app", async () => {
  assert.equal((await invoke(0)).nextCalled, true);
  assert.equal((await invoke(1)).nextCalled, true);
});

test("single-company gate blocks all authenticated business routes when a second company exists", async () => {
  const response = await invoke(2);
  assert.equal(response.status, 403);
  assert.equal(response.nextCalled, false);
  assert.match(String((response.body as { error: string }).error), /one business/i);
});
