import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-card/60 p-0.5 text-xs font-medium",
        className,
      )}
    >
      {(["ru", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            "rounded-full px-3 py-1 uppercase tracking-wide transition-colors",
            lang === l
              ? "bg-gradient-brand text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
