import type { EditableAsset } from "./assetStore";
import type { BulkTankRecord } from "./bulkTankStore";
import type { FuelScheduleEntry, FuelShift } from "./fuelScheduleStore";
import type { FuelSubmissionEntry } from "./fuelSubmissionStore";

export function prepareFuelFarmEntry(input: {
  assetNumber: string; tankId: string; employee: string; litres: number; smu: number;
  shift: FuelShift; id: string; now: Date;
}, assets: EditableAsset[], tanks: BulkTankRecord[], fuel: FuelSubmissionEntry[], schedule: FuelScheduleEntry[]) {
  const asset = assets.find(item => item.assetNumber === input.assetNumber);
  const tank = tanks.find(item => item.id === input.tankId && item.productId === "diesel");
  if (!asset) throw new Error("Select an asset from Asset Management.");
  if (asset.status === "Maintenance" || asset.status === "In Service") throw new Error("This asset is in service or maintenance. Update its status before recording a fuel-up.");
  if (!tank) throw new Error("Select a diesel tank from Bulk Storage.");
  if (!Number.isFinite(input.litres) || input.litres <= 0) throw new Error("Enter fuel litres greater than zero.");
  if (!Number.isFinite(input.smu) || input.smu < 0) throw new Error("Enter a valid, non-negative SMU.");
  if (!Number.isFinite(tank.currentLitres) || input.litres > tank.currentLitres) throw new Error("The selected fuel farm tank has insufficient stock.");
  if (input.shift !== "Day Shift" && input.shift !== "Night Shift") throw new Error("Select a valid shift.");
  const existing = schedule.find(item => item.assetNumber === asset.assetNumber && item.shift === input.shift);
  const live: FuelScheduleEntry = {
    ...(existing ?? { id: `farm-${input.id}`, requiresFuelWindow: false, scheduledWindow: null, priority: "Medium", unscheduled: true }),
    assetNumber: asset.assetNumber, make: asset.make, model: asset.model, assetType: asset.type,
    shift: input.shift, smu: input.smu, status: "Fuelled", litresAdded: input.litres,
    assignedEmployee: input.employee, assignedFuelSource: "Fuel Farm", assignedServiceTruckId: null,
    lastFuelTime: input.now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
  const entry: FuelSubmissionEntry = {
    id: input.id, asset: asset.assetNumber, employee: input.employee,
    date: input.now.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }),
    shift: input.shift, smu: input.smu, litres: input.litres,
    fuelSource: "Fuel Farm", fuelTankId: tank.id, fuelTankName: tank.name,
    submitted: false, locked: false,
  };
  return {
    fuel: [entry, ...fuel],
    tanks: tanks.map(item => item.id === tank.id ? { ...item,
      currentLitres: item.currentLitres - input.litres,
      expectedLitres: (item.expectedLitres ?? item.currentLitres) - input.litres,
    } : item),
    schedule: existing ? schedule.map(item => item.id === existing.id ? live : item) : [live, ...schedule],
  };
}
