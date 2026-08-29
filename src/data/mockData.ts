export type Tank = {
  id: string;
  name: string;
  product: string;
  capacityLitres: number;
  currentLitres: number;
  lowLevelPercent: number;
};

export type Truck = {
  truckNumber: string;
  registration: string;
  status: "Ready" | "Refilling" | "Maintenance";
  operator: string;
  fuelLitres: number;
  oilLitres: number;
};

export type FuelStatus = {
  assetNumber: string;
  assetType: string;
  smu: number;
  status: "Fuelled" | "Not Fuelled";
  lastFuelUp: string;
  fuelSource: string;
  employee: string;
  litres: number;
  notes: string;
};

export type Submission = {
  id: string;
  time: string;
  employee: string;
  assetNumber: string;
  type: "Service Entry" | "Fuel Up" | "Refill" | "Daily Sheet";
  litres: number;
};

export type Asset = {
  assetNumber: string;
  type: string;
  makeModel: string;
  status: "Active" | "Standby" | "Maintenance";
  oilSpec: string;
};

export type Employee = {
  id: string;
  fullName: string;
  crew: string;
  role: string;
  active: boolean;
};

export const bulkTanks: Tank[] = [
  { id: "bt-1", name: "Fuel Farm Diesel", product: "Diesel", capacityLitres: 110000, currentLitres: 72400, lowLevelPercent: 25 },
  { id: "bt-2", name: "Bulk 15W-40", product: "Engine Oil", capacityLitres: 18000, currentLitres: 6900, lowLevelPercent: 30 },
  { id: "bt-3", name: "Bulk Hydraulic 68", product: "Hydraulic Oil", capacityLitres: 14000, currentLitres: 11200, lowLevelPercent: 25 },
];

export const workshopTanks: Tank[] = [
  { id: "ws-1", name: "Workshop 15W-40", product: "Engine Oil", capacityLitres: 5000, currentLitres: 3100, lowLevelPercent: 25 },
  { id: "ws-2", name: "Workshop Gear Oil", product: "Gear Oil", capacityLitres: 2600, currentLitres: 860, lowLevelPercent: 30 },
];

export const serviceTrucks: Truck[] = [
  { truckNumber: "ST-07", registration: "TSS-107", status: "Ready", operator: "Stuart Fishwick", fuelLitres: 9200, oilLitres: 1180 },
  { truckNumber: "ST-12", registration: "TSS-112", status: "Refilling", operator: "Alicia Brown", fuelLitres: 4100, oilLitres: 740 },
  { truckNumber: "ST-18", registration: "TSS-118", status: "Maintenance", operator: "Mark Chen", fuelLitres: 0, oilLitres: 210 },
];

export const fuelStatuses: FuelStatus[] = [
  { assetNumber: "RD4830", assetType: "CAT 793F", smu: 18422, status: "Fuelled", lastFuelUp: "02 Jul 2026 06:42", fuelSource: "ST-07", employee: "Stuart Fishwick", litres: 3820, notes: "Start of shift top up" },
  { assetNumber: "EX2501", assetType: "Hitachi EX2500", smu: 9321, status: "Not Fuelled", lastFuelUp: "Not fuelled", fuelSource: "-", employee: "-", litres: 0, notes: "Awaiting access" },
  { assetNumber: "MD6310-01", assetType: "Drill", smu: 12084, status: "Fuelled", lastFuelUp: "02 Jul 2026 07:15", fuelSource: "Fuel Farm", employee: "Alicia Brown", litres: 1840, notes: "Night shift handover" },
  { assetNumber: "WC2204", assetType: "Water Cart", smu: 7720, status: "Fuelled", lastFuelUp: "02 Jul 2026 08:04", fuelSource: "ST-12", employee: "Mark Chen", litres: 2680, notes: "Pit 3" },
  { assetNumber: "DZ6108", assetType: "Dozer", smu: 15490, status: "Not Fuelled", lastFuelUp: "Not fuelled", fuelSource: "-", employee: "-", litres: 0, notes: "On standby" },
  { assetNumber: "GR1412", assetType: "Grader", smu: 6438, status: "Fuelled", lastFuelUp: "02 Jul 2026 09:12", fuelSource: "ST-07", employee: "Stuart Fishwick", litres: 920, notes: "Road crew" },
];

export const recentSubmissions: Submission[] = [
  { id: "sub-1", time: "09:18", employee: "Stuart Fishwick", assetNumber: "GR1412", type: "Fuel Up", litres: 920 },
  { id: "sub-2", time: "08:47", employee: "Alicia Brown", assetNumber: "ST-12", type: "Refill", litres: 1600 },
  { id: "sub-3", time: "08:04", employee: "Mark Chen", assetNumber: "WC2204", type: "Fuel Up", litres: 2680 },
  { id: "sub-4", time: "07:51", employee: "Stuart Fishwick", assetNumber: "RD4830", type: "Service Entry", litres: 46 },
  { id: "sub-5", time: "06:10", employee: "Alicia Brown", assetNumber: "Crew A", type: "Daily Sheet", litres: 0 },
];

export const assets: Asset[] = [
  { assetNumber: "RD4830", type: "Haul Truck", makeModel: "CAT 793F", status: "Active", oilSpec: "15W-40 Engine Oil" },
  { assetNumber: "EX2501", type: "Excavator", makeModel: "Hitachi EX2500", status: "Active", oilSpec: "Hydraulic 68" },
  { assetNumber: "MD6310-01", type: "Drill", makeModel: "Epiroc MD6310", status: "Active", oilSpec: "Compressor Oil" },
  { assetNumber: "WC2204", type: "Water Cart", makeModel: "CAT 777", status: "Standby", oilSpec: "15W-40 Engine Oil" },
  { assetNumber: "DZ6108", type: "Dozer", makeModel: "CAT D10T", status: "Maintenance", oilSpec: "Final Drive 50" },
];

export const employees: Employee[] = [
  { id: "emp-1", fullName: "Stuart Fishwick", crew: "Crew A", role: "Employee", active: true },
  { id: "emp-2", fullName: "Alicia Brown", crew: "Crew A", role: "Supervisor", active: true },
  { id: "emp-3", fullName: "Mark Chen", crew: "Crew B", role: "Employee", active: true },
  { id: "emp-4", fullName: "Jordan Lee", crew: "Stores", role: "Planner", active: false },
];

export const alerts = [
  "Workshop Gear Oil is below reorder threshold.",
  "ST-18 is marked maintenance and unavailable for dispatch.",
  "EX2501 and DZ6108 have not been fuelled this shift.",
];

export const totals = {
  fuelUsed: fuelStatuses.reduce((sum, item) => sum + item.litres, 0),
  oilUsed: 1246,
};
