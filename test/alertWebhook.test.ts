import assert from "node:assert/strict";
import { test } from "node:test";
import { alertFingerprint, isGrafanaTestAlert, resolveClusterId } from "../src/model/alertWebhookModel";
import { alertWebhookSchema } from "../src/schemas/alertWebhook.schema";

const alertmanagerPayload = {
  version: "4",
  groupKey: '{}:{alertname="HighErrorRate"}',
  status: "firing",
  receiver: "argus",
  alerts: [
    {
      status: "firing",
      labels: { alertname: "HighErrorRate", cluster: "prod-eu" },
      annotations: { summary: "5xx above 5%" },
      startsAt: "2026-10-14T09:00:00.000Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "http://prometheus/graph",
      fingerprint: "c8f5e3a1b2d4e6f7",
    },
  ],
};

const grafanaPayload = {
  ...alertmanagerPayload,
  orgId: 1,
  state: "alerting",
  title: "[FIRING:1] HighErrorRate",
  alerts: [
    {
      ...alertmanagerPayload.alerts[0],
      status: "resolved",
      endsAt: "2026-10-14T09:05:00.000Z",
      values: { A: 7.2 },
      silenceURL: "http://grafana/alerting/silence/new",
      dashboardURL: "",
    },
  ],
};

test("parses Alertmanager and Grafana payloads into the same alert shape", () => {
  const am = alertWebhookSchema.parse(alertmanagerPayload).alerts[0]!;
  assert.equal(am.status, "firing");
  assert.equal(am.startsAt.toISOString(), "2026-10-14T09:00:00.000Z");
  assert.equal(am.fingerprint, "c8f5e3a1b2d4e6f7");

  const grafana = alertWebhookSchema.parse(grafanaPayload).alerts[0]!;
  assert.equal(grafana.status, "resolved");
  assert.equal(grafana.endsAt?.toISOString(), "2026-10-14T09:05:00.000Z");
  assert.ok(!("values" in grafana));

  const noAnnotations = { ...alertmanagerPayload.alerts[0], annotations: undefined };
  assert.deepEqual(alertWebhookSchema.parse({ alerts: [noAnnotations] }).alerts[0]!.annotations, {});

  for (const body of [
    {},
    { alerts: [{ ...alertmanagerPayload.alerts[0], status: "pending" }] },
    { alerts: [{ ...alertmanagerPayload.alerts[0], startsAt: "not a date" }] },
  ]) {
    assert.equal(alertWebhookSchema.safeParse(body).success, false);
  }
});

test("works out the cluster per alert", () => {
  const one = { clusterLabel: "cluster", clusters: [{ cluster: { id: "c1", name: "prod-eu" } }] };
  const many = {
    clusterLabel: "k8s_cluster",
    clusters: [
      { cluster: { id: "c1", name: "prod-eu" } },
      { cluster: { id: "c2", name: "prod-us" } },
    ],
  };

  assert.equal(resolveClusterId(one, {}), "c1");
  assert.equal(resolveClusterId(one, { cluster: "prod-eu" }), "c1");
  assert.equal(resolveClusterId(one, { cluster: "minikube" }), null);
  assert.equal(resolveClusterId(many, { k8s_cluster: "prod-us" }), "c2");
  assert.equal(resolveClusterId(many, { cluster: "prod-us" }), null);
  assert.equal(resolveClusterId(many, { k8s_cluster: "staging" }), null);
  assert.equal(resolveClusterId({ clusterLabel: "cluster", clusters: [] }, {}), null);
});

test("uses the sender's fingerprint, else a stable hash of the labels", () => {
  assert.equal(alertFingerprint({ fingerprint: "abc", labels: {} }), "abc");

  const a = alertFingerprint({ labels: { alertname: "X", pod: "p1" } });
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a, alertFingerprint({ fingerprint: "", labels: { pod: "p1", alertname: "X" } }));
  assert.notEqual(a, alertFingerprint({ labels: { alertname: "X", pod: "p2" } }));
});

test("recognizes Grafana's test notification by its default labels", () => {
  assert.equal(isGrafanaTestAlert({ alertname: "TestAlert", instance: "Grafana" }), true);
  assert.equal(isGrafanaTestAlert({ alertname: "TestAlert", instance: "Grafana", cluster: "prod-eu" }), true);
  assert.equal(isGrafanaTestAlert({ alertname: "TestAlert", instance: "10.0.0.1:9100" }), false);
  assert.equal(isGrafanaTestAlert({ alertname: "HighErrorRate", instance: "Grafana" }), false);
});
