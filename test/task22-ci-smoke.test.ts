import assert from "node:assert/strict";
import { test } from "node:test";

test("TASK-22: intentional CI failure blocks merge", () => {
  assert.fail("Intentional disposable CI verification; do not merge");
});
