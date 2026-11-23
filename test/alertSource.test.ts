/// <reference types="node" />
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAlertSourceSchema,
  updateAlertSourceSchema,
} from "../src/schemas/alertSource.schema";

test("alert source input needs clusters, dedupes them, and checks the label", () => {
  const parsed = createAlertSourceSchema.parse({
    name: " Grafana prod ",
    clusterIds: ["a", "b", "a"],
  });
  assert.deepEqual(parsed, { name: "Grafana prod", clusterIds: ["a", "b"] });

  for (const body of [
    { name: "x", clusterIds: [] },
    { name: "x", clusterIds: ["a"], clusterLabel: "k8s-cluster" },
    { name: "", clusterIds: ["a"] },
    { name: "x", clusterIds: ["a"], organizationId: "org_other" },
  ]) {
    assert.equal(createAlertSourceSchema.safeParse(body).success, false);
  }
});

test("alert source update takes any subset of fields but not none", () => {
  assert.deepEqual(updateAlertSourceSchema.parse({ clusterLabel: "k8s_cluster" }), {
    clusterLabel: "k8s_cluster",
  });

  for (const body of [{}, { clusterIds: [] }, { tokenHash: "x" }]) {
    assert.equal(updateAlertSourceSchema.safeParse(body).success, false);
  }
});
