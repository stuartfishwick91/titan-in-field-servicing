import { generateAssetQrCode } from "./assetQr";
export { generateAssetQrCode } from "./assetQr";
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

function normaliseAsset(asset: EditableAsset): EditableAsset {
  const qrPayload = asset.qrPayload || defaultAssetQrPayload(asset.assetNumber);
  return {
    ...asset,
    qrPayload,
    qrCode: generateAssetQrCode(qrPayload),
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
