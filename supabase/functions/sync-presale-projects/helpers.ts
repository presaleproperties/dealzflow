// Pure helpers extracted from index.ts so they can be unit-tested.
// Keep this file free of Deno-runtime / network imports.

export const firstString = (...vals: unknown[]): string | null => {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

export const pickFloorPlansUrl = (full: any): string | null => {
  const fp = full?.floor_plans ?? full?.floorPlans;
  if (!fp) return null;
  if (typeof fp === "string" && fp.trim()) return fp.trim();
  if (Array.isArray(fp)) {
    for (const item of fp) {
      const u = firstString(item?.url, item?.pdf_url, item?.file_url, item?.href, item?.src);
      if (u) return u;
    }
  }
  return null;
};

export const pickHero = (full: any, summary: any): string | null =>
  firstString(
    full?.hero_image_url, full?.heroImageUrl, full?.featured_image,
    full?.thumbnail_url, full?.image_url, full?.cover_url,
    summary?.featured_image, summary?.hero_image_url, summary?.image_url,
  );

// COALESCE: never overwrite an existing non-null value with NULL or with a
// freshly-null incoming value. Empty strings are treated as null.
export const coalesce = <T>(existingVal: T | null | undefined, incoming: T | null | undefined): T | null => {
  const normalize = (v: T | null | undefined): T | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.trim() === "") return null;
    return v;
  };
  return normalize(existingVal) ?? normalize(incoming) ?? null;
};
