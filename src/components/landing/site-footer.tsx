import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border/60 bg-background/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span className="font-display text-lg font-bold">Карточная</span>
          </div>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            © {new Date().getFullYear()} Карточная. {t.footer.rights}.
          </p>
        </div>
        <FooterCol
          title={t.footer.product}
          links={[t.nav.features, t.nav.gallery, t.nav.pricing, t.nav.blog]}
        />
        <FooterCol
          title={t.footer.company}
          links={[t.footer.about, t.footer.contacts]}
        />
        <FooterCol
          title={t.footer.legal}
          links={[t.footer.offer, t.footer.privacy]}
        />
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        {links.map((l) => (
          <li key={l}>
            <a href="#" className="transition-colors hover:text-foreground">
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
