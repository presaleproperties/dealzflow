import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExternalLink, Activity, FileText, Eye, MousePointerClick, RefreshCw, Mail, Wand2 } from "lucide-react";
import { toast } from "sonner";

type Row = {
  contact_id: string | null;
  email: string | null;
  name: string | null;
  sessions: number;
  forms: number;
  views: number;
  engagement: number;
  last_activity: string | null;
};

const TABLES = [
  { key: "sessions", table: "crm_lead_behavior_sessions", time: "started_at" },
  { key: "forms", table: "crm_lead_behavior_forms", time: "submitted_at" },
  { key: "views", table: "crm_lead_behavior_views", time: "viewed_at" },
  { key: "engagement", table: "crm_lead_behavior_engagement", time: "occurred_at" },
] as const;

export default function CrmBehaviorLeadsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "linked" | "orphan">("all");
  const [search, setSearch] = useState("");
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [backfilling, setBackfilling] = useState(false);

  const runBackfill = async () => {
    setBackfilling(true);
    const { data, error } = await supabase.rpc("backfill_behavior_notes" as any);
    setBackfilling(false);
    if (error) {
      toast.error(`Backfill failed: ${error.message}`);
      return;
    }
    const d = data as any;
    toast.success(
      `Backfilled — views:${d?.views ?? 0} sessions:${d?.sessions ?? 0} forms:${d?.forms ?? 0} engagement:${d?.engagement ?? 0}`
    );
    load();
  };

  const load = async () => {
    setLoading(true);
    const map = new Map<string, Row>();
    const totalsAcc: Record<string, number> = {};

    for (const t of TABLES) {
      const { data, error } = await supabase
        .from(t.table as any)
        .select(`contact_id, email, ${t.time}`)
        .order(t.time, { ascending: false })
        .limit(2000);
      if (error) continue;
      totalsAcc[t.key] = data?.length || 0;
      for (const r of data || []) {
        const row: any = r;
        const key = row.contact_id || (row.email ? `email:${row.email.toLowerCase()}` : null);
        if (!key) continue;
        const existing = map.get(key) || {
          contact_id: row.contact_id,
          email: row.email,
          name: null,
          sessions: 0,
          forms: 0,
          views: 0,
          engagement: 0,
          last_activity: null,
        };
        (existing as any)[t.key] += 1;
        const ts = row[t.time];
        if (ts && (!existing.last_activity || ts > existing.last_activity)) existing.last_activity = ts;
        if (!existing.email && row.email) existing.email = row.email;
        if (!existing.contact_id && row.contact_id) existing.contact_id = row.contact_id;
        map.set(key, existing);
      }
    }

    // hydrate names for known contact_ids
    const ids = Array.from(map.values()).map((r) => r.contact_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      const byId = new Map((contacts || []).map((c) => [c.id, c]));
      for (const row of map.values()) {
        if (row.contact_id) {
          const c = byId.get(row.contact_id);
          if (c) row.name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email;
        }
      }
    }

    // try matching email-only rows to contacts
    const emails = Array.from(map.values())
      .filter((r) => !r.contact_id && r.email)
      .map((r) => r.email!.toLowerCase());
    if (emails.length) {
      const { data: contacts } = await supabase
        .from("crm_contacts")
        .select("id, first_name, last_name, email")
        .in("email", emails);
      const byEmail = new Map((contacts || []).map((c) => [(c.email || "").toLowerCase(), c]));
      for (const row of map.values()) {
        if (!row.contact_id && row.email) {
          const c = byEmail.get(row.email.toLowerCase());
          if (c) {
            row.contact_id = c.id;
            row.name = `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email;
          }
        }
      }
    }

    const list = Array.from(map.values()).sort(
      (a, b) => (b.last_activity || "").localeCompare(a.last_activity || "")
    );
    setRows(list);
    setTotals(totalsAcc);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (filter === "linked" && !r.contact_id) return false;
    if (filter === "orphan" && r.contact_id) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(r.email?.toLowerCase().includes(q) || r.name?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Behavior-Tracked Leads</h1>
          <p className="text-sm text-muted-foreground">
            Leads with records in <code>crm_lead_behavior_*</code> tables. Use this to verify URL rendering on a real lead.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {TABLES.map((t) => (
          <Card key={t.key} className="p-4">
            <div className="text-xs uppercase text-muted-foreground tracking-wide">{t.key}</div>
            <div className="text-2xl font-semibold mt-1">{totals[t.key] ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-1">total records</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {(["all", "linked", "orphan"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "linked" ? "Linked to Lead" : "Orphan (email only)"}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} leads</span>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Lead</th>
                <th className="text-left p-3">Email</th>
                <th className="text-center p-3"><Activity className="h-3.5 w-3.5 inline" /> Sessions</th>
                <th className="text-center p-3"><FileText className="h-3.5 w-3.5 inline" /> Forms</th>
                <th className="text-center p-3"><Eye className="h-3.5 w-3.5 inline" /> Views</th>
                <th className="text-center p-3"><MousePointerClick className="h-3.5 w-3.5 inline" /> Engage</th>
                <th className="text-left p-3">Last Activity</th>
                <th className="text-right p-3">Open</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
                  No behavior records found. Once the Presale → CRM bridge writes data, leads will appear here.
                </td></tr>
              ) : (
                filtered.map((r, i) => (
                  <tr key={i} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      {r.name || <span className="text-muted-foreground italic">Unknown</span>}
                      {!r.contact_id && (
                        <Badge variant="outline" className="ml-2 text-[10px]">orphan</Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground flex items-center gap-1">
                      {r.email ? (<><Mail className="h-3 w-3" /> {r.email}</>) : "—"}
                    </td>
                    <td className="text-center p-3">{r.sessions || "·"}</td>
                    <td className="text-center p-3">{r.forms || "·"}</td>
                    <td className="text-center p-3">{r.views || "·"}</td>
                    <td className="text-center p-3">{r.engagement || "·"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {r.last_activity ? new Date(r.last_activity).toLocaleString() : "—"}
                    </td>
                    <td className="text-right p-3">
                      {r.contact_id ? (
                        <Link to={`/crm/leads/${r.contact_id}`}>
                          <Button size="sm" variant="ghost">
                            Open <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">no link</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
