import qrcode from "qrcode-generator";

const cache = new Map<string, string>();
export function generateAssetQrCode(payload: string) {
  const cached = cache.get(payload);
  if (cached) return cached;
  const code = qrcode(0, "M");
  code.addData(payload);
  code.make();
  const image = code.createDataURL(6, 24);
  if (cache.size > 500) cache.clear();
  cache.set(payload, image);
  return image;
}

export function resolveAssetQr<T extends { assetNumber: string; qrPayload?: string; status: string }>(payload: string, assets: T[]): T {
  const value = payload.trim();
  const number = value.replace(/^TITAN-ASSET:/i, "").trim();
  const matches = assets.filter(asset => asset.qrPayload?.trim() === value
    || asset.assetNumber.toLowerCase() === number.toLowerCase());
  if (matches.length !== 1) throw new Error(matches.length ? "This QR code matches more than one asset. Select the asset manually." : "This QR code does not match an asset in Asset Management.");
  if (["Maintenance", "In Service"].includes(matches[0].status)) throw new Error("This asset is in service or maintenance and cannot be fuelled.");
  return matches[0];
}
