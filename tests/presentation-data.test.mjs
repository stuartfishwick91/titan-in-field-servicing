import test from "node:test";
import assert from "node:assert/strict";
import { calculateDashboardMetrics } from "../src/data/dashboardMetrics.ts";
import { createLocalBackup } from "../src/data/localBackup.ts";

test("dashboard uses today's records, counts assets once and avoids double-counting service fuel", () => {
  const today = new Date(2026, 8, 18, 12);
  const fuel = [
    { asset: "DT01", litres: 100, date: "2026-09-18" },
    { asset: "dt01", litres: 25, date: "18 Sept 2026" },
    { asset: "DT02", litres: 70, date: "2026-09-17" },
    { asset: "DT03", litres: 90 },
  ];
  fuel[1].date = today.toLocaleDateString("en-AU", {day:"2-digit",month:"short",year:"numeric"});
  const service = [
    { date: today.toLocaleDateString(), fuelAdded: 100, oils: [{ litres: 6 }, { litres: 4 }] },
    { date: "2026-09-17", fuelAdded: 70, oils: [{ litres: 500 }] },
  ];
  assert.deepEqual(calculateDashboardMetrics(fuel, service, today), { fuelLitres: 125, oilLitres: 10, machinesFuelled: 1 });
  assert.deepEqual(calculateDashboardMetrics([], [], today), { fuelLitres: 0, oilLitres: 0, machinesFuelled: 0 });
});

test("backup preserves records and images without exporting PINs, sessions or unrelated storage", () => {
  const data = {
    "titan-service-entries-v1": JSON.stringify([{ id: "test-entry", litres: 25 }]),
    "titan-branding-settings-v1": JSON.stringify({ logo: "data:image/png;base64,test" }),
    "titan-managed-users-v1": JSON.stringify([{ id: "employee", fullName: "Test User", pin: "9876" }]),
    "titan-current-user-v1": "private-session",
    "sb-project-auth-token": "private-token",
    "unrelated-setting": "private-value",
  };
  const backup = createLocalBackup({ getItem: (key) => data[key] ?? null });
  assert.deepEqual(backup.values["titan-service-entries-v1"], [{ id: "test-entry", litres: 25 }]);
  assert.equal(backup.values["titan-branding-settings-v1"].logo, "data:image/png;base64,test");
  assert.deepEqual(backup.values["titan-managed-users-v1"], [{ id: "employee", fullName: "Test User" }]);
  assert.doesNotMatch(JSON.stringify(backup), /9876|private-session|private-token|private-value/);
  assert.equal(backup.scope, "this-browser-only");
});
