const operationalKeys = [
  "titan-assets-v2", "titan-bulk-tanks-v1", "titan-workshop-stock-v1",
  "titan-service-trucks-v1", "titan-oil-templates-v1", "titan-fuel-schedule-v3",
  "titan-service-entries-v1", "titan-fuel-submissions-v2", "titan-stock-adjustment-register-v1",
  "titan-system-alert-settings-v1", "titan-branding-settings-v1",
  "titan-daily-fuel-sheet-export-history-v1", "titan-employee-assigned-truck",
  "titan-daily-fuel-submitted-at", "titan-supervisor-message-read",
];

export function createLocalBackup(storage: Pick<Storage, "getItem">, now = new Date()) {
  const values: Record<string, unknown> = {};
  for (const key of operationalKeys) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try { values[key] = JSON.parse(raw); }
    catch { values[key] = raw; }
  }
  // Never include PINs, current-user sessions, or authentication tokens.
  const profiles = storage.getItem("titan-managed-users-v1");
  if (profiles) {
    try {
      const parsed = JSON.parse(profiles);
      if (Array.isArray(parsed)) values["titan-managed-users-v1"] = parsed.map(({ pin: _pin, ...profile }) => profile);
    } catch { /* Invalid user records are not exported as raw credential data. */ }
  }
  return { format: "titan-trial-backup", version: 1, exportedAt: now.toISOString(), scope: "this-browser-only", values };
}

export function downloadLocalBackup() {
  const backup = createLocalBackup(localStorage);
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `titan-trial-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
