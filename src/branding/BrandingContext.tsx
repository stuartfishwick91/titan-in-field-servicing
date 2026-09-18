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
      setBrandingState(settings);
      writeSharedItem(STORAGE_KEY, JSON.stringify(settings));
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

export function fileToDataUrl(file: File, allowedTypes: string[], maxSizeMb = 5) {
  return new Promise<string>((resolve, reject) => {
    if (!allowedTypes.includes(file.type)) {
      reject(new Error("Unsupported file type."));
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      reject(new Error(`File must be ${maxSizeMb}MB or smaller.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
