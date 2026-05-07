// Webhook Validation page
// ─────────────────────────
// Side-by-side audit of what the Presale webhook ingested vs what
// landed in the CRM. Use this to verify user behavior is being logged
// correctly, find unmatched events, and spot-check a single lead's
// activity coverage.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

type WindowDays = 1 | 7 | 30;

interface StreamStat {
  table: string;
  label: string;
  total: number;
  matched: number;
  unmatched: number;
}

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

async function countTable(
  table: string,
  timeCol: string,
  sinceIso: string,
  matchedOnly: "matched" | "unmatched" | "all",
) {
  let q = supabase
    .from(table as any)
    .select("*", { count: "exact", head: true })
    .gte(timeCol, sinceIso);
  if (matchedOnly === "matched") q = q.not("contact_id", "is", null);
  if (matchedOnly === "unmatched") q = q.is("contact_id", null);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

function useStreamStats(days: WindowDays) {
  return useQuery({
    queryKey: ["webhook-validation-streams", days],
    queryFn: async (): Promise<StreamStat[]> => {
      const sinceIso = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString();
      const streams: { table: string; label: string; timeCol: string }[] = [
        { table: "crm_activity_events", label: "Activity events", timeCol: "occurred_at" },
        { table: "crm_lead_behavior_views", label: "Property views", timeCol: "viewed_at" },
        { table: "crm_lead_behavior_sessions", label: "Sessions", timeCol: "started_at" },
        { table: "crm_lead_behavior_forms", label: "Form submissions", timeCol: "submitted_at" },
        { table: "crm_lead_behavior_engagement", label: "Email engagement", timeCol: "occurred_at" },
      ];

      const out: StreamStat[] = [];
      for (const s of streams) {
        const [total, matched] = await Promise.all([
          countTable(s.table, s.timeCol, sinceIso, "all"),
          countTable(s.table, s.timeCol, sinceIso, "matched"),
        ]);
        out.push({
          table: s.table,
          label: s.label,
          total,
          matched,
          unmatched: Math.max(0, total - matched),
        });
      }
      return out;
    },
  });
}

function useUnmatchedRecent(table: string, timeCol: string) {
  return useQuery({
    queryKey: ["webhook-validation-unmatched", table],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select("*")
        .is("contact_id", null)
        .order(timeCol, { ascending: false })
        .limit(25);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useEventTypeBreakdown(days: WindowDays) {
  return useQuery({
    queryKey: ["webhook-validation-event-types", days],
    queryFn: async () => {
      const sinceIso = new Date(
        Date.now() - days * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await supabase
        .from("crm_activity_events")
        .select("type, contact_id")
        .gte("occurred_at", sinceIso)
        .limit(5000);
      if (error) throw error;
      const map = new Map<string, { total: number; matched: number }>();
      for (const r of data ?? []) {
        const t = (r as any).type ?? "unknown";
        const e = map.get(t) ?? { total: 0, matched: 0 };
        e.total++;
        if ((r as any).contact_id) e.matched++;
        map.set(t, e);
      }
      return Array.from(map.entries())
        .map(([type, v]) => ({ type, ...v }))
        .sort((a, b) => b.total - a.total);
    },
  });
}

function useLeadProbe(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  return useQuery({
    enabled: email.length > 3 && email.includes("@"),
    queryKey: ["webhook-validation-probe", email],
    queryFn: async () => {
      const { data: contact } = await supabase
        .from("crm_contacts")
        .select("id, first_name, last_name, email, phone, source, created_at, presale_user_id")
        .eq("email", email)
        .maybeSingle();

      const contactId = contact?.id ?? null;
      const orFilter = contactId
        ? `contact_id.eq.${contactId},email.eq.${email}`
        : `email.eq.${email}`;
      const lookupTable = async (
        table: string,
        timeCol: string,
        emailCol: string,
      ) => {
        const filter = contactId
          ? `contact_id.eq.${contactId},${emailCol}.eq.${email}`
          : `${emailCol}.eq.${email}`;
        const { data, error } = await supabase
          .from(table as any)
          .select("*")
          .or(filter)
          .order(timeCol, { ascending: false })
          .limit(25);
        if (error) return { rows: [], error: error.message };
        return { rows: data ?? [], error: null };
      };

      const [activity, views, sessions, forms, engagement] = await Promise.all([
        (async () => {
          const { data, error } = await supabase
            .from("crm_activity_events")
            .select("*")
            .or(orFilter)
            .order("occurred_at", { ascending: false })
            .limit(50);
          return { rows: data ?? [], error: error?.message ?? null };
        })(),
        lookupTable("crm_lead_behavior_views", "viewed_at", "email"),
        lookupTable("crm_lead_behavior_sessions", "started_at", "email"),
        lookupTable("crm_lead_behavior_forms", "submitted_at", "email"),
        lookupTable("crm_lead_behavior_engagement", "occurred_at", "email"),
      ]);

      return { contact, activity, views, sessions, forms, engagement };
    },
  });
}

export default function WebhookValidationPage() {
  const [days, setDays] = useState<WindowDays>(7);
  const [emailQuery, setEmailQuery] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  const stats = useStreamStats(days);
  const types = useEventTypeBreakdown(days);
  const unmatchedActivity = useUnmatchedRecent("crm_activity_events", "occurred_at");
  const unmatchedViews = useUnmatchedRecent("crm_lead_behavior_views", "viewed_at");
  const probe = useLeadProbe(submittedEmail);

  const totalUnmatched = useMemo(
    () => (stats.data ?? []).reduce((acc, s) => acc + s.unmatched, 0),
    [stats.data],
  );

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Webhook Validation
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare events received from the Presale webhook against rows
            persisted in the CRM. Spot anonymous gaps, unmatched leads, and
            verify a single lead's activity coverage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["1", "7", "30"] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === Number(d) ? "default" : "outline"}
              onClick={() => setDays(Number(d) as WindowDays)}
            >
              Last {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* ── Ingestion summary ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Ingestion summary
            {stats.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            {stats.data && totalUnmatched === 0 && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="w-3 h-3" /> 100% matched
              </Badge>
            )}
            {stats.data && totalUnmatched > 0 && (
              <Badge variant="outline" className="gap-1">
                <AlertCircle className="w-3 h-3" />
                {totalUnmatched} unmatched
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stream</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Matched to lead</TableHead>
                <TableHead className="text-right">Anonymous</TableHead>
                <TableHead className="text-right">Match rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(stats.data ?? []).map((s) => (
                <TableRow key={s.table}>
                  <TableCell className="font-medium">{s.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.total}</TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-600">
                    {s.matched}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {s.unmatched}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(s.matched, s.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Activity event type breakdown ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Activity event types (last {days}d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Matched</TableHead>
                <TableHead className="text-right">Match rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(types.data ?? []).map((t) => (
                <TableRow key={t.type}>
                  <TableCell className="font-mono text-xs">{t.type}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.matched}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(t.matched, t.total)}
                  </TableCell>
                </TableRow>
              ))}
              {!types.isLoading && (types.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No activity events in window
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Unmatched recent ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent unmatched events</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="activity">
            <TabsList>
              <TabsTrigger value="activity">
                Activity ({unmatchedActivity.data?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="views">
                Views ({unmatchedViews.data?.length ?? 0})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="activity">
              <UnmatchedTable
                rows={unmatchedActivity.data ?? []}
                columns={["type", "lead_email", "project_slug", "occurred_at"]}
              />
            </TabsContent>
            <TabsContent value="views">
              <UnmatchedTable
                rows={unmatchedViews.data ?? []}
                columns={["property_name", "email", "presale_user_id", "viewed_at"]}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Lead probe ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Probe a lead by email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedEmail(emailQuery);
            }}
          >
            <div className="flex-1">
              <Label htmlFor="probe-email" className="sr-only">Email</Label>
              <Input
                id="probe-email"
                placeholder="lead@example.com"
                value={emailQuery}
                onChange={(e) => setEmailQuery(e.target.value)}
              />
            </div>
            <Button type="submit" className="gap-2">
              <Search className="w-4 h-4" /> Probe
            </Button>
          </form>

          {submittedEmail && probe.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
            </div>
          )}

          {submittedEmail && probe.data && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm space-y-1">
                <div className="font-medium">
                  {probe.data.contact ? (
                    `${probe.data.contact.first_name ?? ""} ${probe.data.contact.last_name ?? ""}`.trim() || probe.data.contact.email
                  ) : (
                    <span className="text-muted-foreground">No CRM contact for {submittedEmail}</span>
                  )}
                </div>
                {probe.data.contact && (
                  <div className="text-muted-foreground text-xs space-y-0.5">
                    <div>id: {probe.data.contact.id}</div>
                    <div>presale_user_id: {probe.data.contact.presale_user_id ?? "—"}</div>
                    <div>source: {probe.data.contact.source ?? "—"}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <ProbeStat label="Activity" count={probe.data.activity.rows.length} />
                <ProbeStat label="Views" count={probe.data.views.rows.length} />
                <ProbeStat label="Sessions" count={probe.data.sessions.rows.length} />
                <ProbeStat label="Forms" count={probe.data.forms.rows.length} />
                <ProbeStat label="Engagement" count={probe.data.engagement.rows.length} />
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-2">Activity timeline</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Linked?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {probe.data.activity.rows.slice(0, 25).map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(r.occurred_at), "MMM d, HH:mm")}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.type}</TableCell>
                        <TableCell className="text-xs">{r.project_slug ?? "—"}</TableCell>
                        <TableCell>
                          {r.contact_id ? (
                            <Badge variant="secondary" className="text-xs">linked</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">orphan</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {probe.data.activity.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                          No activity received for this email
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProbeStat({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <div className="text-2xl font-semibold tabular-nums">{count}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function UnmatchedTable({
  rows,
  columns,
}: {
  rows: any[];
  columns: string[];
}) {
  if (!rows.length) {
    return (
      <div className="text-center text-sm text-muted-foreground py-6">
        No unmatched rows — all events linked to a lead.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c} className="text-xs">{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            {columns.map((c) => (
              <TableCell key={c} className="text-xs font-mono whitespace-nowrap">
                {formatCell(r[c])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatCell(v: unknown) {
  if (v == null) return "—";
  if (typeof v === "string" && /\d{4}-\d{2}-\d{2}T/.test(v)) {
    try { return format(new Date(v), "MMM d, HH:mm"); } catch { return v; }
  }
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  return String(v);
}
