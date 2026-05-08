
## Scheduler Audit & Overhaul

After reading every scheduler file (page, 9 panels, hook, 2 public pages, 12 edge functions), here is what's broken or missing and what I'll ship.

### Critical bugs found

1. **Broken cancel/reschedule links in every transactional email.** `scheduler-send-emails` builds URLs as `/book/{slug}/cancel?...` and `/book/{slug}/{event}?reschedule=...`, but the actual public routes are `/r/{slug}/...`. Every confirmation, reminder, and cancellation email currently sends 404 links.
2. **No `/r/:slug/cancel` route exists.** Even with the URL fixed, invitees have no way to cancel themselves — there's no page to handle `?b=<id>`.
3. **Booking detail = `alert()` dialog.** Both `SchedulerBookingsPanel` and `SchedulerCalendarPanel` use raw `alert()` to show booking details — no link to the lead, no email/SMS actions, no reschedule for the agent.
4. **Public confirmation hides everything useful.** After a booking the success screen shows date + name only. No location/meeting link, no "add to calendar" .ics, no cancel/reschedule links — invitees email the agent asking "where's the meeting?".
5. **`confirm()` and `alert()` in public booking flow.** Errors like `slot_taken` / `stripe_not_configured` use `alert()`. Looks broken on a premium booking page.

### CRM integration gaps

6. **No way to share a booking link from a lead.** `LeadQuickActions`, `ShowingsTab`, email composer, and SMS composer have zero scheduler awareness. Agents have to leave the lead and copy from `/crm/scheduler`.
7. **Lead detail doesn't show the lead's bookings.** Bookings are written to `crm_scheduler_bookings` with `contact_id` set, but `ShowingsTab` only renders legacy showings. Bookings disappear from the lead's view.
8. **No "Send booking link" merge token in emails/SMS.** Templates can't reference `{{booking_link}}` or `{{booking_link:event-slug}}`.

### Polish & UX

9. `SchedulerCalendarPanel` only loads `upcoming` + `past` (100 cap) — calendar view misses older months when navigating. Events should refetch on `datesSet`.
10. Bookings list has no empty-state CTA ("Share your link to get bookings").
11. No availability "date overrides" UI even though the table + edge function support it (block off vacation days, holiday hours).
12. Onboarding dialog claims "5 starter event types installed" but never actually seeds them — relies on a DB trigger we should verify and surface clearly.
13. Profile slug save: no uniqueness check, raw Postgres error surfaces on collision.

### What I'll ship (3 phases)

**Phase 1 — Fix the critical bugs (highest priority)**
- Fix `scheduler-send-emails` to emit `/r/{slug}/...` URLs (use `PUBLIC_BASE` + `/r/`), and make `PUBLIC_BASE` resolve from request origin / env so it works on `dealzflow.ca`, preview, and `commissioniq.lovable.app`.
- New page `src/pages/public/PublicBookingCancelPage.tsx` mounted at `/r/:teamSlug/cancel?b=<id>` — fetches booking summary, shows date/time + reason field + "Cancel my booking" button, calls `scheduler-cancel`.
- Upgrade public confirmation screen: show meeting link / address / phone instructions, "Add to Google Calendar" + "Download .ics" buttons (build .ics client-side), and the cancel/reschedule links.
- Replace every `alert()` / `confirm()` in `PublicBookingPage` with inline error banners (toast-style div, gold/amber accent, matches editorial style).

**Phase 2 — CRM integration (the "seamless" part the user asked for)**
- New `src/components/crm/leads/SendBookingLinkDialog.tsx`: agent picks any of their active event types, optionally pre-fills invitee name/email/phone from the lead, generates the URL (with `?prefill_name=…&prefill_email=…&prefill_phone=…`), and offers Copy / Email / SMS actions. Email/SMS hand off to the existing `ComposeEmailDialog` / SMS composer with the link pre-inserted.
- Wire `PublicBookingPage` to read `prefill_*` query params into the form fields.
- New "Share booking link" entry in `LeadQuickActions` (gold accent, between Email and Showing).
- Replace `ShowingsTab` content with a unified list that merges legacy `crm_showings` + `crm_scheduler_bookings` for the contact, sorted by date, with status pills. Add "Send booking link" CTA at top.
- Add `{{booking_link}}` and `{{booking_link:event-slug}}` merge tokens to both client (`renderForRecipient`) and server (`crm-mass-send-email/renderForLead`) renderers, resolving against the sending agent's slug. (Per the Email Merge Syntax memory.)

**Phase 3 — Scheduler dashboard polish**
- Replace `SchedulerBookingsPanel`'s `alert()` with a proper booking detail sheet (Sheet from shadcn): full invitee info, custom answers, location, status pill, link to `/crm/leads/{contact_id}`, Copy meeting link, Reschedule (opens public reschedule URL in new tab), Cancel (with reason prompt), Resend confirmation.
- Same sheet wired to `SchedulerCalendarPanel`'s `eventClick`. Calendar refetches bookings on `datesSet` (use a date-ranged query instead of `upcoming/past`).
- Empty state on bookings tab: when `total === 0`, show illustrated empty card with Copy Link + "Send to a lead" buttons.
- Add a compact "Date overrides" card to `SchedulerAvailabilityPanel`: list upcoming overrides, "Add date off" / "Add custom hours for date" buttons writing to `crm_scheduler_availability_overrides`.
- Slug uniqueness check on save (catch Postgres `23505` unique violation, show "That URL is taken — try another").

### Out of scope (not touching this round)

- Stripe payment flow (already works, no reported issues).
- Google Calendar OAuth (already in place, `scheduler-onboarding` step 3).
- Reminders cron (`scheduler-reminders` is already wired and running).
- Daily digest (`scheduler-daily-digest` is already wired).
- Mobile-specific scheduler page (the `/crm/scheduler` page is desktop-first; mobile gets bottom-nav route into the same page).

### Technical notes

- All transactional URLs become origin-aware: edge function reads `req.headers.get('origin')` falling back to `Deno.env.get('PUBLIC_BASE_URL')` falling back to `https://dealzflow.ca`. Falls back gracefully when called server-to-server.
- Booking detail sheet reuses existing `<Sheet>` + `<Pill>` primitives (per CRM Pill Primitive memory). No new components beyond the dialog and the sheet.
- `.ics` generation is pure client-side (no edge fn needed).
- Per the user's "prompt-before-automated-changes" memory: I will NOT auto-add starter event types — I'll keep the existing trigger behavior and just clarify the onboarding copy.
- No new tables. Uses existing `crm_scheduler_*` tables and `crm_showings`.

Estimated: ~14 file edits, 2 new files, 1 edge fn fix, 0 migrations.
