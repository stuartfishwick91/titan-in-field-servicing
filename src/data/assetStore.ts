import { readSharedItem, writeSharedItem } from "../cloud/sharedStorage";
export type AssetOilConfiguration = {
  id: string;
  compartment: string;
  product: string;
  capacity: number;
  active: boolean;
};

export type EditableAsset = {
  assetNumber: string;
  make: string;
  model: string;
  type: string;
  serialNumber: string;
  fleet: string;
  department: string;
  status: "Active" | "Standby" | "Maintenance" | "In Service";
  notes: string;
  image: string;
  qrPayload: string;
  qrCode: string;
  oilConfiguration: AssetOilConfiguration[];
};

const STORAGE_KEY = "titan-assets-v2";

export const defaultEditableAssets: EditableAsset[] = [];

export function defaultAssetQrPayload(assetNumber: string) {
  return `TITAN-ASSET:${assetNumber || "NEW-ASSET"}`;
}

export function generateAssetQrCode(payload: string) {
  const size = 132;
  const modules = 21;
  const cell = size / modules;
  let seed = 0;
  for (let index = 0; index < payload.length; index += 1) {
    seed = (seed * 31 + payload.charCodeAt(index)) >>> 0;
  }
  const squares: string[] = [];
  const finder = (x: number, y: number) => {
    squares.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell * 7}" height="${cell * 7}" fill="#05080c"/>`);
    squares.push(`<rect x="${(x + 1) * cell}" y="${(y + 1) * cell}" width="${cell * 5}" height="${cell * 5}" fill="#ffc20e"/>`);
    squares.push(`<rect x="${(x + 2) * cell}" y="${(y + 2) * cell}" width="${cell * 3}" height="${cell * 3}" fill="#05080c"/>`);
  };
  finder(1, 1);
  finder(13, 1);
  finder(1, 13);
  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      const inFinder =
        (row >= 1 && row <= 7 && col >= 1 && col <= 7) ||
        (row >= 1 && row <= 7 && col >= 13 && col <= 19) ||
        (row >= 13 && row <= 19 && col >= 1 && col <= 7);
      if (inFinder) continue;
      const bit = ((seed + row * 17 + col * 29 + row * col * 7) % 5) < 2;
      if (bit) squares.push(`<rect x="${col * cell}" y="${row * cell}" width="${cell}" height="${cell}" fill="#05080c"/>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="#dbe6f1"/>${squares.join("")}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function normaliseAsset(asset: EditableAsset): EditableAsset {
  const qrPayload = asset.qrPayload || defaultAssetQrPayload(asset.assetNumber);
  return {
    ...asset,
    qrPayload,
    qrCode: asset.qrCode || generateAssetQrCode(qrPayload),
    oilConfiguration: (asset.oilConfiguration ?? []).map((oil) => ({
      id: oil.id,
      compartment: oil.compartment ?? (oil as unknown as { oilType?: string }).oilType ?? "Compartment",
      product: oil.product ?? (oil as unknown as { oilType?: string }).oilType ?? "Oil Type",
      capacity: oil.capacity,
      active: oil.active,
    })),
  };
}

export function loadAssets() {
  try {
    const stored = readSharedItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as EditableAsset[]).map(normaliseAsset) : defaultEditableAssets;
  } catch {
    return defaultEditableAssets;
  }
}

export function saveAssets(assets: EditableAsset[]) {
  writeSharedItem(STORAGE_KEY, JSON.stringify(assets));
  window.dispatchEvent(new Event("titan-assets-updated"));
}
