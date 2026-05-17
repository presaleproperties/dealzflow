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

// Audit helper: classify what coalesce did to one field.
//  - 'preserved' : existing had a value; incoming differed but was ignored
//  - 'unchanged' : existing == incoming (or both null) — no-op
//  - 'updated'   : existing was null and incoming filled it in
//  - 'inserted'  : no prior row existed and incoming has a value
export type FieldAction = "inserted" | "updated" | "preserved" | "unchanged";

const normalizeForCompare = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  return String(v);
};

export const classifyField = (
  existingVal: unknown,
  incomingVal: unknown,
  isNewRow: boolean,
): FieldAction => {
  const e = normalizeForCompare(existingVal);
  const i = normalizeForCompare(incomingVal);
  if (isNewRow) return i === null ? "unchanged" : "inserted";
  if (e !== null && i !== null && e !== i) return "preserved";
  if (e === null && i !== null) return "updated";
  return "unchanged";
};

export interface FieldAudit {
  field: string;
  action: FieldAction;
  old_value: string | null;
  new_value: string | null;
}

export const buildFieldAudits = (
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
  fields: string[],
): FieldAudit[] => {
  const isNewRow = !existing;
  const out: FieldAudit[] = [];
  for (const f of fields) {
    const e = existing?.[f];
    const i = incoming[f];
    const action = classifyField(e, i, isNewRow);
    if (action === "unchanged") continue;
    out.push({
      field: f,
      action,
      old_value: normalizeForCompare(e),
      new_value: normalizeForCompare(i),
    });
  }
  return out;
};
