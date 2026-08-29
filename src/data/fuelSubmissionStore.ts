export type FuelSubmissionEntry = {
  id: string;
  date?: string;
  shift?: "Day Shift" | "Night Shift";
  employee: string;
  asset: string;
  smu?: number;
  litres: number;
  fuelSource: string;
  submitted: boolean;
  locked: boolean;
  submittedAt?: string;
  exportedAt?: string;
};

const STORAGE_KEY = "titan-fuel-submissions-v2";

export const defaultFuelSubmissions: FuelSubmissionEntry[] = [];

export function loadFuelSubmissions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as FuelSubmissionEntry[] : defaultFuelSubmissions;
  } catch {
    return defaultFuelSubmissions;
  }
}

export function saveFuelSubmissions(entries: FuelSubmissionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event("titan-fuel-submissions-updated"));
}
