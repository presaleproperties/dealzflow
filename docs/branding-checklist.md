# Dealzflow Branding Audit Checklist

Single source of truth: **`src/assets/logo-mark.png`** (the green house + up-arrow on white, square, ≥512px). Every square brand slot below must be regenerated from this file. The wordmark is always **Dealzflow** (no spaces, capital D, "flow" rendered in gold `#D7A542` when the design supports it).

Run the automated audit any time you change a logo, favicon, or brand string:

```bash
node scripts/brand-audit.mjs
```

The script exits non-zero if any slot drifts from the unified mark.

---

## Slot-by-slot checklist

### 1. Canonical mark
- [ ] `src/assets/logo-mark.png` is square, ≥512×512, white background, house+arrow centered.
- [ ] `src/assets/dealzflow-icon.png` mirrors the mark for explicit icon use.
- [ ] `src/assets/dealzflow-logo.png` is the horizontal lockup (icon + "Dealzflow" wordmark) for headers.

### 2. Browser favicon
- [ ] `public/favicon.png` — 512×512, hash-matches canonical.
- [ ] `public/favicon-32.png` — 32×32, downscaled from canonical.
- [ ] `index.html` links both with a `?v=N` cache-bust query.
- [ ] No leftover `public/favicon.ico` from prior brand.

### 3. PWA manifest icons
- [ ] `public/icon-192.png` — 192×192.
- [ ] `public/icon-512.png` — 512×512, hash-matches canonical.
- [ ] `public/app-icon-1024.png` — 1024×1024 for app stores / install prompts.
- [ ] `public/manifest.json` declares 192, 512 with both `purpose: "any"` **and** `purpose: "maskable"`.
- [ ] `manifest.json` `name` = `Dealzflow`, `short_name` = `Dealzflow`, `start_url` = `/dashboard`.

### 4. Apple touch icon
- [ ] `public/apple-touch-icon.png` — 180×180, no transparency (iOS adds its own rounding).
- [ ] `index.html` links 180/167/152 sizes (all may point at the 192 file).
- [ ] `apple-mobile-web-app-title` meta tag = `Dealzflow`.

### 5. Open Graph / Twitter share card
- [ ] `public/og-image.png` — landscape, ~1200×630 (1.91:1), shows the house mark + "Dealzflow" wordmark + tagline.
- [ ] `index.html` `og:image` and `twitter:image` both point at `/og-image.png`.
- [ ] `og:site_name` = `Dealzflow`. `og:title` / `twitter:title` start with `Dealzflow`.
- [ ] No occurrences of `CommissionIQ` anywhere in `<head>`.

### 6. PWA splash screen
- [ ] `public/splash-screen.png` — square, ≥1024×1024, mark centered on background that matches `theme_color` / `background_color` in the manifest.

### 7. In-app logo usage
Every component import must point at `@/assets/logo-mark.png`, `@/assets/dealzflow-logo.png`, or `@/assets/dealzflow-icon.png`. Verified slots:
- [ ] `src/components/layout/TopNav.tsx`
- [ ] `src/components/layout/Sidebar.tsx`
- [ ] `src/components/layout/BottomNav.tsx`
- [ ] `src/components/layout/MobileAppHeader.tsx`
- [ ] `src/pages/AuthPage.tsx`
- [ ] `src/pages/AcceptInvitePage.tsx`
- [ ] `src/components/ui/page-loader.tsx`

### 8. Brand-name strings
- [ ] `<title>` in `index.html` starts with **Dealzflow**.
- [ ] Manifest `name` / `short_name` = **Dealzflow**.
- [ ] No `CommissionIQ`, `commissioniq`, or other legacy brand strings anywhere in `index.html`, `manifest.json`, or `src/`.

### 9. After any change
- [ ] Bump the favicon cache-bust (`?v=N` → `?v=N+1`) in `index.html`.
- [ ] Run `node scripts/brand-audit.mjs` and confirm `All brand slots use the unified house mark + Dealzflow wordmark. ✨`.
- [ ] Hard-refresh the preview / clear PWA cache so the OS picks up the new icons.
