export const sharedKeys = [
  "titan-assets-v2", "titan-bulk-tanks-v1", "titan-workshop-stock-v1",
  "titan-service-trucks-v1", "titan-oil-templates-v1", "titan-fuel-schedule-v3",
  "titan-service-entries-v1", "titan-fuel-submissions-v2",
  "titan-stock-adjustment-register-v1", "titan-system-alert-settings-v1",
  "titan-branding-settings-v1", "titan-daily-fuel-sheet-export-history-v1",
] as const;

export type SharedDocuments = Record<string, string>;
let documents: SharedDocuments | null = null;
let onWrite: (() => void) | null = null;

export function useSharedDocuments(next: SharedDocuments, write: () => void) {
  documents = { ...next };
  onWrite = write;
}

export function closeSharedDocuments() { documents = null; onWrite = null; }
export function copySharedDocuments(): SharedDocuments { return { ...documents }; }
export function readSharedItem(key: string) {
  return documents ? documents[key] ?? null : localStorage.getItem(key);
}
export function writeSharedItem(key: string, value: string) {
  if (!sharedKeys.includes(key as typeof sharedKeys[number])) throw new Error("Unsupported shared record.");
  if (!documents || !onWrite) throw new Error("Sign in and load the shared trial before saving.");
  if (documents[key] === value) return;
  documents[key] = value;
  onWrite();
}

export function readDeviceDocuments(): SharedDocuments {
  const result: SharedDocuments = {};
  for (const key of sharedKeys) {
    const value = localStorage.getItem(key);
    if (value !== null) { JSON.parse(value); result[key] = value; }
  }
  return result;
}
