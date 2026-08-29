export type OilTemplateCompartment = {
  id: string;
  compartment: string;
  product: string;
  capacity: number;
  active: boolean;
};

export type OilTemplate = {
  id: string;
  make: string;
  model: string;
  type: string;
  notes: string;
  lastUpdated: string;
  compartments: OilTemplateCompartment[];
};

const STORAGE_KEY = "titan-oil-templates-v1";

export const defaultOilTemplates: OilTemplate[] = [
  {
    id: "template-cat-793f",
    make: "CAT",
    model: "793F",
    type: "Haul Truck",
    notes: "Standard haul truck oil configuration.",
    lastUpdated: "06 Jul 2026",
    compartments: [
      { id: "cat793f-engine", compartment: "Engine", product: "15W-40 Engine Oil", capacity: 280, active: true },
      { id: "cat793f-hydraulic", compartment: "Hydraulic", product: "Hydraulic Oil 46", capacity: 410, active: true },
      { id: "cat793f-transmission", compartment: "Transmission", product: "Transmission Oil", capacity: 185, active: true },
      { id: "cat793f-final-drive", compartment: "Final Drive", product: "Final Drive 50", capacity: 55, active: true },
      { id: "cat793f-coolant", compartment: "Coolant", product: "Coolant", capacity: 250, active: true },
    ],
  },
  {
    id: "template-hitachi-ex2500",
    make: "Hitachi",
    model: "EX2500",
    type: "Excavator",
    notes: "Large excavator oil template.",
    lastUpdated: "06 Jul 2026",
    compartments: [
      { id: "ex2500-engine", compartment: "Engine", product: "15W-40 Engine Oil", capacity: 190, active: true },
      { id: "ex2500-hydraulic", compartment: "Hydraulic", product: "Hydraulic Oil 46", capacity: 850, active: true },
      { id: "ex2500-swing", compartment: "Swing", product: "Gear Oil", capacity: 90, active: true },
      { id: "ex2500-final-drive", compartment: "Final Drive", product: "Final Drive Oil", capacity: 75, active: true },
      { id: "ex2500-coolant", compartment: "Coolant", product: "Coolant", capacity: 180, active: true },
    ],
  },
  {
    id: "template-cat-d10t",
    make: "CAT",
    model: "D10T",
    type: "Dozer",
    notes: "Track dozer oil template.",
    lastUpdated: "06 Jul 2026",
    compartments: [
      { id: "d10t-engine", compartment: "Engine", product: "15W-40 Engine Oil", capacity: 90, active: true },
      { id: "d10t-hydraulic", compartment: "Hydraulic", product: "Hydraulic Oil 46", capacity: 180, active: true },
      { id: "d10t-transmission", compartment: "Transmission", product: "Transmission Oil", capacity: 150, active: true },
      { id: "d10t-final-drive", compartment: "Final Drive", product: "Final Drive 50", capacity: 60, active: true },
      { id: "d10t-coolant", compartment: "Coolant", product: "Coolant", capacity: 120, active: true },
    ],
  },
  {
    id: "template-epiroc-md6310",
    make: "Epiroc",
    model: "MD6310",
    type: "Drill",
    notes: "Drill oil and compressor template.",
    lastUpdated: "06 Jul 2026",
    compartments: [
      { id: "md6310-engine", compartment: "Engine", product: "15W-40 Engine Oil", capacity: 75, active: true },
      { id: "md6310-compressor", compartment: "Compressor", product: "Compressor Oil", capacity: 120, active: true },
      { id: "md6310-hydraulic", compartment: "Hydraulic", product: "Hydraulic Oil 46", capacity: 210, active: true },
      { id: "md6310-coolant", compartment: "Coolant", product: "Coolant", capacity: 100, active: true },
    ],
  },
];

export function loadOilTemplates() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as OilTemplate[] : defaultOilTemplates;
  } catch {
    return defaultOilTemplates;
  }
}

export function saveOilTemplates(templates: OilTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  window.dispatchEvent(new Event("titan-oil-templates-updated"));
}

export function findOilTemplate(make: string, model: string, templates = loadOilTemplates()) {
  return templates.find((template) =>
    template.make.trim().toLowerCase() === make.trim().toLowerCase() &&
    template.model.trim().toLowerCase() === model.trim().toLowerCase(),
  );
}
