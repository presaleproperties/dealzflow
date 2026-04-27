import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, ImageIcon, FileText } from "lucide-react";
import { PresaleProjectPicker } from "@/components/presale/PresaleProjectPicker";
import {
  projectThumbnail,
  type BridgeProjectFull,
} from "@/lib/presaleBridgeClient";

function pick<T = unknown>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  return [];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  );
}

function Empty() {
  return <span className="text-muted-foreground/60">—</span>;
}

export default function AdminProjectsPage() {
  const [project, setProject] = useState<BridgeProjectFull | null>(null);

  useEffect(() => {
    document.title = "Presale Projects — Admin";
  }, []);

  const thumb = projectThumbnail(project ?? undefined);
  const pitchDeckUrl = pick<string>(project, [
    "pitch_deck_url",
    "pitchDeckUrl",
    "deck_url",
    "presentation_url",
  ]);
  const floorPlans = asArray(
    pick(project, ["floor_plans", "floorPlans", "plans"]) as unknown,
  );
  const gallery = asArray(
    pick(project, ["gallery", "images", "photos"]) as unknown,
  );
  const priceMin = pick<number>(project, ["price_min", "priceMin", "min_price"]);
  const priceMax = pick<number>(project, ["price_max", "priceMax", "max_price"]);
  const priceRange = (project as any)?.priceRange ?? (project as any)?.price_range;
  const description = pick<string>(project, ["description", "summary", "blurb"]);

  const fmtMoney = (n?: number) =>
    typeof n === "number"
      ? n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
      : null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Presale Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live data from the Presale Properties bridge. Pick any project to inspect the
            full payload — proves end-to-end data flow.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Search</CardTitle>
          </CardHeader>
          <CardContent>
            <PresaleProjectPicker
              value={project?.slug}
              initialLabel={project?.name}
              onSelect={setProject}
            />
          </CardContent>
        </Card>

        {project && (
          <>
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-4 space-y-0">
                <div className="h-24 w-32 sm:h-20 sm:w-28 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground/60" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg sm:text-xl truncate">
                    {project.name ?? project.slug}
                  </CardTitle>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {project.developer && (
                      <Badge variant="secondary">{project.developer}</Badge>
                    )}
                    {project.neighborhood && <Badge variant="outline">{project.neighborhood}</Badge>}
                    {project.city && <Badge variant="outline">{project.city}</Badge>}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <Field label="Slug">{project.slug}</Field>
                <Field label="Developer">{project.developer ?? <Empty />}</Field>
                <Field label="Neighborhood">{project.neighborhood ?? <Empty />}</Field>
                <Field label="City">{project.city ?? <Empty />}</Field>
                <Field label="Price range">
                  {priceRange?.min || priceRange?.max
                    ? `${fmtMoney(priceRange.min) ?? "—"} – ${fmtMoney(priceRange.max) ?? "—"}`
                    : priceMin || priceMax
                      ? `${fmtMoney(priceMin) ?? "—"} – ${fmtMoney(priceMax) ?? "—"}`
                      : <Empty />}
                </Field>
                <Field label="Pitch deck">
                  {pitchDeckUrl ? (
                    <a
                      href={pitchDeckUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline break-all"
                    >
                      Open deck <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <Empty />
                  )}
                </Field>
                {description && (
                  <div className="sm:col-span-2 space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{description}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {(floorPlans.length > 0 || gallery.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {floorPlans.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Floor plans ({floorPlans.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {floorPlans.slice(0, 6).map((fp: any, i) => (
                        <div key={i} className="text-sm text-foreground/90 flex items-center justify-between gap-2">
                          <span className="truncate">{fp?.name ?? fp?.title ?? `Plan ${i + 1}`}</span>
                          {(fp?.url ?? fp?.pdf_url) && (
                            <a
                              href={fp.url ?? fp.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline shrink-0 inline-flex items-center gap-1"
                            >
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
                {gallery.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" /> Gallery ({gallery.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-1.5">
                        {gallery.slice(0, 9).map((g: any, i) => {
                          const url = typeof g === "string" ? g : g?.url ?? g?.image_url;
                          if (!url) return null;
                          return (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="block aspect-square rounded-md overflow-hidden bg-muted"
                            >
                              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            </a>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Raw bridge payload</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(JSON.stringify(project, null, 2))
                  }
                >
                  Copy JSON
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="text-[11px] bg-muted text-muted-foreground rounded-md p-3 overflow-auto max-h-96">
{JSON.stringify(project, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}

        {!project && (
          <div className="text-center py-16 text-sm text-muted-foreground">
            Pick a project above to see the live payload.
          </div>
        )}
      </div>
    </div>
  );
}
