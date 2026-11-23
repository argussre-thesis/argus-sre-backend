/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { listIncidentsQuerySchema } from "../src/schemas/incident.schema";

test("incident list query coerces the limit and rejects unknown params", () => {
  assert.deepEqual(listIncidentsQuerySchema.parse({}), { limit: 50 });
  assert.deepEqual(
    listIncidentsQuerySchema.parse({ status: "OPEN", clusterId: "unknown", limit: "10", cursor: "c1" }),
    { status: "OPEN", clusterId: "unknown", limit: 10, cursor: "c1" },
  );

  for (const query of [
    { status: "open" },
    { status: ["OPEN", "RESOLVED"] },
    { limit: "0" },
    { limit: "101" },
    { limit: "abc" },
    { organizationId: "org_other" },
  ]) {
    assert.equal(listIncidentsQuerySchema.safeParse(query).success, false);
  }
});
