import type { FuelSubmissionEntry } from "./fuelSubmissionStore";
import type { ServiceEntryRecord } from "./serviceEntryStore";

// Accept the formats already written by the prototype without guessing ambiguous dates.
export function isToday(value: string | undefined, today = new Date()) {
  if (!value) return false;
  const isoDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return value === isoDate || value === today.toLocaleDateString()
    || value === today.toLocaleDateString("en-AU")
    || value === today.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function calculateDashboardMetrics(fuel: FuelSubmissionEntry[], service: ServiceEntryRecord[], today = new Date()) {
  const todayFuel = fuel.filter((entry) => isToday(entry.date, today));
  const todayService = service.filter((entry) => isToday(entry.date, today));
  const positive = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
  return {
    // Service-entry fuel is also recorded in the fuel register: count it once.
    fuelLitres: todayFuel.reduce((sum, entry) => sum + positive(entry.litres), 0),
    oilLitres: todayService.reduce((sum, entry) => sum + entry.oils.reduce((subtotal, oil) => subtotal + positive(oil.litres), 0), 0),
    machinesFuelled: new Set(todayFuel.filter((entry) => positive(entry.litres)).map((entry) => entry.asset.trim().toLowerCase())).size,
  };
}
