import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readSharedItem, writeSharedItem } from "../cloud/sharedStorage";

export type BrandingSettings = {
  companyName: string;
  primaryColour: string;
  secondaryColour: string;
  logo: string;
  loginBackground: string;
  portalBackground: string;
  portalBackgroundOpacity: 0 | 25 | 50 | 75;
  sidebarImage: string;
  serviceTruckImage: string;
  bulkTankImage: string;
};

const STORAGE_KEY = "titan-branding-settings-v1";

export const defaultBranding: BrandingSettings = {
  companyName: "Titan Safety Systems",
  primaryColour: "#ffc20e",
  secondaryColour: "#0b1118",
  logo: "",
  loginBackground: "",
  portalBackground: "",
  portalBackgroundOpacity: 25,
  sidebarImage: "",
  serviceTruckImage: "",
  bulkTankImage: "",
};

type BrandingContextValue = {
  branding: BrandingSettings;
  setBranding: (settings: BrandingSettings) => void;
  resetBranding: () => void;
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

function loadStoredBranding() {
  try {
    const stored = readSharedItem(STORAGE_KEY);
    return stored ? { ...defaultBranding, ...JSON.parse(stored) } as BrandingSettings : defaultBranding;
  } catch {
    return defaultBranding;
  }
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBrandingState] = useState<BrandingSettings>(loadStoredBranding);

  useEffect(() => {
    const refresh = () => setBrandingState(loadStoredBranding());
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--yellow", branding.primaryColour);
    document.documentElement.style.setProperty("--yellow-2", branding.primaryColour);
    document.documentElement.style.setProperty("--brand-secondary", branding.secondaryColour);
  }, [branding.primaryColour, branding.secondaryColour]);

  const value = useMemo<BrandingContextValue>(() => ({
    branding,
    setBranding: (settings) => {
      writeSharedItem(STORAGE_KEY, JSON.stringify(settings));
      setBrandingState(settings);
    },
    resetBranding: () => {
      setBrandingState(defaultBranding);
      writeSharedItem(STORAGE_KEY, JSON.stringify(defaultBranding));
    },
  }), [branding]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (!context) {
    throw new Error("useBranding must be used inside BrandingProvider");
  }
  return context;
}

export async function fileToDataUrl(file: File, allowedTypes: string[], maxSizeMb = 5): Promise<string> {
  if (!allowedTypes.includes(file.type)) throw new Error("Unsupported file type.");
  if (file.size > maxSizeMb * 1024 * 1024) throw new Error(`File must be ${maxSizeMb}MB or smaller.`);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not read this image. Try a PNG or JPG version."));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Image has no usable dimensions.");
    // Bound embedded images before shared records and their recovery copy are saved.
    // WebP preserves transparent logo backgrounds, unlike JPEG.
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is unavailable in this browser.");
    let edge = 1200;
    for (let attempt = 0; attempt < 8; attempt++) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/webp", 0.85);
      if (result.length <= 160_000 && result.startsWith("data:image/")) return result;
      edge = Math.round(edge * 0.75);
    }
    throw new Error("This image is too detailed to save. Please choose a smaller logo image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
