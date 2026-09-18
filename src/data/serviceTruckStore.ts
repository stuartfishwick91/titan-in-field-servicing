import { readSharedItem, writeSharedItem } from "../cloud/sharedStorage";
export type ServiceTruckOilGroup = {
  id?: string;
  productId?: string;
  name: string;
  system: string;
  capacity: number;
  current: number;
  tone: "green" | "yellow";
};

export type ServiceTruckRecord = {
  truckId: string;
  registration: string;
  status: string;
  capacity: number;
  lastRefill: string;
  odometer: string;
  imageUrl: string;
  oilGroups: ServiceTruckOilGroup[];
};

export const SERVICE_TRUCKS_STORAGE_KEY = "titan-service-trucks-v1";

export const defaultServiceTrucks: ServiceTruckRecord[] = [
  {
    truckId: "RD4830",
    registration: "TSS-4830",
    status: "Active",
    capacity: 8000,
    lastRefill: "26 Jun 2026",
    odometer: "18,900 km",
    imageUrl: "",
    oilGroups: [
      { id: "rd4830-engine", productId: "engine-15w40", name: "Engine Oil 15W-40", system: "Engine", capacity: 1500, current: 1050, tone: "green" },
      { id: "rd4830-hyd46", productId: "hydraulic-46", name: "Hydraulic Oil 46", system: "Hydraulic Systems", capacity: 2000, current: 1200, tone: "yellow" },
      { id: "rd4830-hyd32", productId: "hydraulic-32", name: "Hydraulic Oil 32", system: "Hydraulic Systems", capacity: 1500, current: 900, tone: "yellow" },
      { id: "rd4830-trans", productId: "transmission", name: "Transmission Oil", system: "Transmission", capacity: 1000, current: 750, tone: "green" },
      { id: "rd4830-coolant", productId: "coolant", name: "Coolant", system: "Cooling System", capacity: 1000, current: 500, tone: "yellow" },
      { id: "rd4830-diesel", productId: "diesel", name: "Diesel Fuel", system: "Fuel", capacity: 1000, current: 700, tone: "green" },
    ],
  },
  {
    truckId: "ST102",
    registration: "TSS-102",
    status: "Active",
    capacity: 5100,
    lastRefill: "26 Jun 2026",
    odometer: "24,560 km",
    imageUrl: "",
    oilGroups: [
      { id: "st102-engine", productId: "engine-15w40", name: "Engine Oil 15W-40", system: "Engine", capacity: 900, current: 650, tone: "green" },
      { id: "st102-hyd32", productId: "hydraulic-32", name: "Hydraulic Oil 32", system: "Hydraulic Systems", capacity: 1200, current: 700, tone: "yellow" },
      { id: "st102-diesel", productId: "diesel", name: "Diesel Fuel", system: "Fuel", capacity: 3000, current: 1850, tone: "yellow" },
    ],
  },
  {
    truckId: "ST103",
    registration: "TSS-103",
    status: "Refilling",
    capacity: 6200,
    lastRefill: "25 Jun 2026",
    odometer: "21,440 km",
    imageUrl: "",
    oilGroups: [
      { id: "st103-engine", productId: "engine-15w40", name: "Engine Oil 15W-40", system: "Engine", capacity: 1200, current: 860, tone: "green" },
      { id: "st103-hyd46", productId: "hydraulic-46", name: "Hydraulic Oil 46", system: "Hydraulic Systems", capacity: 2000, current: 980, tone: "yellow" },
      { id: "st103-diesel", productId: "diesel", name: "Diesel Fuel", system: "Fuel", capacity: 3000, current: 2100, tone: "green" },
    ],
  },
  {
    truckId: "ST-07",
    registration: "TSS-107",
    status: "Active",
    capacity: 6100,
    lastRefill: "26 Jun 2026",
    odometer: "19,240 km",
    imageUrl: "",
    oilGroups: [
      { id: "st07-diesel", productId: "diesel", name: "Diesel", system: "Fuel", capacity: 3000, current: 1200, tone: "yellow" },
      { id: "st07-engine", productId: "engine-15w40", name: "Engine Oil 15W-40", system: "Engine", capacity: 900, current: 450, tone: "yellow" },
      { id: "st07-hyd46", productId: "hydraulic-46", name: "Hydraulic Oil 46", system: "Hydraulic Systems", capacity: 1200, current: 700, tone: "yellow" },
      { id: "st07-coolant", productId: "coolant", name: "Coolant", system: "Cooling System", capacity: 1000, current: 300, tone: "yellow" },
    ],
  },
];

function normaliseServiceTrucks(trucks: ServiceTruckRecord[]) {
  const seen = new Set<string>();
  return trucks.filter((truck) => {
    if (seen.has(truck.truckId)) return false;
    seen.add(truck.truckId);
    return true;
  });
}

export function loadServiceTrucks() {
  try {
    const stored = readSharedItem(SERVICE_TRUCKS_STORAGE_KEY);
    if (!stored) return defaultServiceTrucks;
    const parsed = JSON.parse(stored) as ServiceTruckRecord[];
    const normalised = normaliseServiceTrucks(parsed);
    return normalised;
  } catch {
    return defaultServiceTrucks;
  }
}

export function saveServiceTrucks(trucks: ServiceTruckRecord[]) {
  writeSharedItem(SERVICE_TRUCKS_STORAGE_KEY, JSON.stringify(normaliseServiceTrucks(trucks)));
  window.dispatchEvent(new Event("titan-service-trucks-updated"));
}
