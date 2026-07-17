import { MARKETPLACES, useMarketplace, type Marketplace } from "@/lib/marketplace";
import { cn } from "@/lib/utils";

export function MarketplaceTabs() {
  const { marketplace, setMarketplace } = useMarketplace();

  return (
    <div
      role="tablist"
      aria-label="Маркетплейс"
      className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 p-1 backdrop-blur"
    >
      {MARKETPLACES.map((m) => {
        const active = marketplace === m.id;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            onClick={() => setMarketplace(m.id as Marketplace)}
            data-mp={m.id}
            className={cn(
              "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              active
                ? "mp-tab-active text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full mp-dot"
              data-mp={m.id}
            />
            <span className="hidden sm:inline">{m.label}</span>
            <span className="sm:hidden">{m.short}</span>
          </button>
        );
      })}
    </div>
  );
}
