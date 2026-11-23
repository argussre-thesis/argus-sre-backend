/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { updateOrganizationSettingsSchema } from "../src/schemas/organization.schema";

test("settings body replaces every setting", () => {
  const valid = {
    incidentGroupingWindowMinutes: 10,
    autoInvestigateEnabled: true,
    investigationLevel: "medium",
    conversationLevel: "high",
    webSearchToolEnabled: false,
    maxModelCalls: 10,
  };
  assert.deepEqual(updateOrganizationSettingsSchema.parse(valid), valid);

  for (const body of [
    { incidentGroupingWindowMinutes: 10 },
    { autoInvestigateEnabled: true },
    { ...valid, incidentGroupingWindowMinutes: 1441 },
    { ...valid, autoInvestigateEnabled: "yes" },
    { ...valid, investigationLevel: "max" },
    { ...valid, conversationLevel: undefined },
    { ...valid, maxModelCalls: 0 },
    { ...valid, maxModelCalls: 101 },
    { ...valid, extra: 1 },
  ]) {
    assert.equal(updateOrganizationSettingsSchema.safeParse(body).success, false);
  }
});
