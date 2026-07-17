import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Marketplace = "wb" | "ozon" | "ym";

export const MARKETPLACES: { id: Marketplace; label: string; short: string }[] = [
  { id: "ozon", label: "Ozon", short: "Ozon" },
  { id: "wb", label: "Wildberries", short: "WB" },
  { id: "ym", label: "Яндекс Маркет", short: "ЯМ" },
];

const STORAGE_KEY = "kartochnaya:mp";
const URL_PARAM = "mp";

type Ctx = {
  marketplace: Marketplace;
  setMarketplace: (mp: Marketplace) => void;
};

const MarketplaceContext = createContext<Ctx | null>(null);

function readInitial(): Marketplace {
  if (typeof window === "undefined") return "wb";
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get(URL_PARAM);
  if (fromUrl === "wb" || fromUrl === "ozon" || fromUrl === "ym") return fromUrl;
  const fromLs = window.localStorage.getItem(STORAGE_KEY);
  if (fromLs === "wb" || fromLs === "ozon" || fromLs === "ym") return fromLs;
  return "wb";
}

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [marketplace, setMp] = useState<Marketplace>("wb");

  // Hydrate on client only to avoid SSR mismatch.
  useEffect(() => {
    setMp(readInitial());
  }, []);

  const setMarketplace = (mp: Marketplace) => {
    setMp(mp);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, mp);
      const url = new URL(window.location.href);
      url.searchParams.set(URL_PARAM, mp);
      window.history.replaceState({}, "", url.toString());
    }
  };

  const value = useMemo(() => ({ marketplace, setMarketplace }), [marketplace]);
  return <MarketplaceContext.Provider value={value}>{children}</MarketplaceContext.Provider>;
}

export function useMarketplace(): Ctx {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) throw new Error("useMarketplace must be used within MarketplaceProvider");
  return ctx;
}
