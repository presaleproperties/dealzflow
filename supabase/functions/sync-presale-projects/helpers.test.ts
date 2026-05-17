import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { coalesce, firstString, pickFloorPlansUrl, pickHero } from "./helpers.ts";

Deno.test("coalesce: preserves existing non-null when incoming is null", () => {
  assertEquals(coalesce("https://existing.pdf", null), "https://existing.pdf");
  assertEquals(coalesce("https://existing.pdf", undefined), "https://existing.pdf");
});

Deno.test("coalesce: preserves existing non-null when incoming is also a value (never overwrites)", () => {
  assertEquals(coalesce("keep-me", "fresh-from-bridge"), "keep-me");
  assertEquals(coalesce(42, 99), 42);
});

Deno.test("coalesce: fills null/undefined existing with incoming value", () => {
  assertEquals(coalesce(null, "https://incoming.pdf"), "https://incoming.pdf");
  assertEquals(coalesce(undefined, "https://incoming.pdf"), "https://incoming.pdf");
});

Deno.test("coalesce: returns null when both sides empty", () => {
  assertEquals(coalesce(null, null), null);
  assertEquals(coalesce(undefined, undefined), null);
});

Deno.test("coalesce: treats empty string existing as null and uses incoming", () => {
  assertEquals(coalesce("", "https://incoming.pdf"), "https://incoming.pdf");
  assertEquals(coalesce("   ", "https://incoming.pdf"), "https://incoming.pdf");
});

Deno.test("coalesce: treats empty string incoming as null and keeps existing null", () => {
  assertEquals(coalesce(null, ""), null);
  assertEquals(coalesce(null, "   "), null);
});

Deno.test("firstString: returns first non-empty trimmed string", () => {
  assertEquals(firstString(null, undefined, "", "  hello  ", "world"), "hello");
  assertEquals(firstString(0, false, "ok"), "ok");
  assertEquals(firstString(null, undefined, ""), null);
});

Deno.test("pickFloorPlansUrl: extracts URL from string, array of objects, missing", () => {
  assertEquals(pickFloorPlansUrl({ floor_plans: "https://fp.pdf" }), "https://fp.pdf");
  assertEquals(
    pickFloorPlansUrl({ floor_plans: [{ pdf_url: "https://a.pdf" }, { url: "https://b.pdf" }] }),
    "https://a.pdf",
  );
  assertEquals(
    pickFloorPlansUrl({ floorPlans: [{ href: "https://c.pdf" }] }),
    "https://c.pdf",
  );
  assertEquals(pickFloorPlansUrl({}), null);
  assertEquals(pickFloorPlansUrl(null), null);
  assertEquals(pickFloorPlansUrl({ floor_plans: [{ name: "no-url" }] }), null);
});

Deno.test("pickHero: prefers full.hero_image_url, falls back through chain to summary", () => {
  assertEquals(pickHero({ hero_image_url: "https://hero.jpg" }, {}), "https://hero.jpg");
  assertEquals(pickHero({ featured_image: "https://feat.jpg" }, {}), "https://feat.jpg");
  assertEquals(pickHero({}, { featured_image: "https://sum.jpg" }), "https://sum.jpg");
  assertEquals(pickHero(null, null), null);
});

// ---------- Integration-style: simulate the upsert payload merge ----------

interface FakeExisting {
  brochure_url: string | null;
  floor_plans_url: string | null;
  hero_image_url: string | null;
  notes: string | null;
}

const buildPayload = (existing: FakeExisting, full: any, summary: any) => {
  const incomingDeck = firstString(full?.pitch_deck_url, full?.pitchDeckUrl, full?.brochure_url);
  const incomingFloorPlans = pickFloorPlansUrl(full);
  const incomingHero = pickHero(full, summary);
  const incomingDescription = firstString(full?.description, full?.overview, full?.summary);
  return {
    brochure_url: coalesce(existing.brochure_url, incomingDeck),
    floor_plans_url: coalesce(existing.floor_plans_url, incomingFloorPlans),
    hero_image_url: coalesce(existing.hero_image_url, incomingHero),
    notes: coalesce(existing.notes, incomingDescription),
  };
};

Deno.test("payload merge: empty existing rows are fully backfilled from bridge", () => {
  const existing: FakeExisting = {
    brochure_url: null, floor_plans_url: null, hero_image_url: null, notes: null,
  };
  const full = {
    pitch_deck_url: "https://deck.pdf",
    floor_plans: [{ url: "https://fp.pdf" }],
    hero_image_url: "https://hero.jpg",
    description: "Luxurious presale tower in Surrey.",
  };
  const payload = buildPayload(existing, full, {});
  assertEquals(payload.brochure_url, "https://deck.pdf");
  assertEquals(payload.floor_plans_url, "https://fp.pdf");
  assertEquals(payload.hero_image_url, "https://hero.jpg");
  assertEquals(payload.notes, "Luxurious presale tower in Surrey.");
});

Deno.test("payload merge: manually-edited fields are NEVER overwritten by bridge", () => {
  const existing: FakeExisting = {
    brochure_url: "https://manual-deck.pdf",
    floor_plans_url: "https://manual-fp.pdf",
    hero_image_url: "https://manual-hero.jpg",
    notes: "Custom agent notes.",
  };
  const full = {
    pitch_deck_url: "https://bridge-deck.pdf",
    floor_plans: [{ url: "https://bridge-fp.pdf" }],
    hero_image_url: "https://bridge-hero.jpg",
    description: "Bridge description.",
  };
  const payload = buildPayload(existing, full, {});
  assertEquals(payload.brochure_url, "https://manual-deck.pdf");
  assertEquals(payload.floor_plans_url, "https://manual-fp.pdf");
  assertEquals(payload.hero_image_url, "https://manual-hero.jpg");
  assertEquals(payload.notes, "Custom agent notes.");
});

Deno.test("payload merge: partially-populated rows fill only the null gaps", () => {
  const existing: FakeExisting = {
    brochure_url: "https://manual-deck.pdf",
    floor_plans_url: null,
    hero_image_url: null,
    notes: "Existing notes",
  };
  const full = {
    pitch_deck_url: "https://bridge-deck.pdf", // should NOT overwrite manual
    floor_plans: [{ url: "https://bridge-fp.pdf" }], // SHOULD fill null
    hero_image_url: "https://bridge-hero.jpg", // SHOULD fill null
    description: "Bridge description", // should NOT overwrite existing notes
  };
  const payload = buildPayload(existing, full, {});
  assertEquals(payload.brochure_url, "https://manual-deck.pdf");
  assertEquals(payload.floor_plans_url, "https://bridge-fp.pdf");
  assertEquals(payload.hero_image_url, "https://bridge-hero.jpg");
  assertEquals(payload.notes, "Existing notes");
});

Deno.test("payload merge: bridge returning nulls leaves existing nulls as null (no crash)", () => {
  const existing: FakeExisting = {
    brochure_url: null, floor_plans_url: null, hero_image_url: null, notes: null,
  };
  const payload = buildPayload(existing, {}, {});
  assertEquals(payload.brochure_url, null);
  assertEquals(payload.floor_plans_url, null);
  assertEquals(payload.hero_image_url, null);
  assertEquals(payload.notes, null);
});

import { buildFieldAudits, classifyField } from "./helpers.ts";

Deno.test("classifyField: inserted for new row with value", () => {
  assertEquals(classifyField(undefined, "x", true), "inserted");
  assertEquals(classifyField(undefined, null, true), "unchanged");
});

Deno.test("classifyField: updated when existing null and incoming present", () => {
  assertEquals(classifyField(null, "x", false), "updated");
  assertEquals(classifyField("", "x", false), "updated");
});

Deno.test("classifyField: preserved when existing differs from incoming", () => {
  assertEquals(classifyField("keep", "fresh", false), "preserved");
});

Deno.test("classifyField: unchanged when equal or both null", () => {
  assertEquals(classifyField("same", "same", false), "unchanged");
  assertEquals(classifyField(null, null, false), "unchanged");
  assertEquals(classifyField("keep", null, false), "unchanged");
});

Deno.test("buildFieldAudits: existing row mixes preserved + updated, skips unchanged", () => {
  const existing = { brochure_url: "old.pdf", hero_image_url: null, city: "Surrey" };
  const incoming = { brochure_url: "new.pdf", hero_image_url: "hero.jpg", city: "Surrey", notes: null };
  const audits = buildFieldAudits(existing, incoming, ["brochure_url","hero_image_url","city","notes"]);
  assertEquals(audits.length, 2);
  const a = Object.fromEntries(audits.map(x => [x.field, x]));
  assertEquals(a.brochure_url.action, "preserved");
  assertEquals(a.brochure_url.old_value, "old.pdf");
  assertEquals(a.brochure_url.new_value, "new.pdf");
  assertEquals(a.hero_image_url.action, "updated");
  assertEquals(a.hero_image_url.new_value, "hero.jpg");
});

Deno.test("buildFieldAudits: new row marks present fields as inserted", () => {
  const audits = buildFieldAudits(null, { city: "Langley", notes: null }, ["city","notes"]);
  assertEquals(audits.length, 1);
  assertEquals(audits[0].field, "city");
  assertEquals(audits[0].action, "inserted");
  assertEquals(audits[0].old_value, null);
});
