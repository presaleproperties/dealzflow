import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type ResultRow = {
  action: string;
  ok: boolean;
  status: number;
  ms: number;
  error?: string;
  sample?: unknown;
};

const ALL_ACTIONS = [
  "search-projects",
  "get-project",
  "list-neighborhoods",
  "list-developers",
  "list-agents",
  "get-agent",
  "get-lead-behavior",
  "render-email",
] as const;

export default function BridgeStatusPage() {
  const [params, setParams] = useState({
    q: "vancouver",
    slug: "",
    agentSlug: "",
    projectSlug: "",
    templateStyle: "modern",
    leadName: "Test Lead",
    email: "",
    phone: "",
  });
  const [results, setResults] = useState<Record<string, ResultRow>>({});
  const [runningAll, setRunningAll] = useState(false);
  const [runningOne, setRunningOne] = useState<string | null>(null);

  const setParam = (key: keyof typeof params) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setParams((p) => ({ ...p, [key]: e.target.value }));

  async function call(action: string | "run-all") {
    const { data, error } = await supabase.functions.invoke("bridge-status", {
      body: { action, params },
    });
    if (error) throw new Error(error.message);
    return data;
  }

  async function runAll() {
    setRunningAll(true);
    try {
      const data = await call("run-all");
      const map: Record<string, ResultRow> = {};
      (data?.results ?? []).forEach((r: ResultRow) => (map[r.action] = r));
      setResults(map);
      const okCount = Object.values(map).filter((r) => r.ok).length;
      toast.success(`Bridge check: ${okCount}/${ALL_ACTIONS.length} passed`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunningAll(false);
    }
  }

  async function runOne(action: string) {
    setRunningOne(action);
    try {
      const data = await call(action);
      setResults((prev) => ({ ...prev, [action]: data as ResultRow }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunningOne(null);
    }
  }

  useEffect(() => {
    document.title = "Bridge Status — Presale Properties";
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-5xl px-6 py-10 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Presale Bridge Status</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live health check for the 8 Presale Properties bridge endpoints.
            </p>
          </div>
          <Button onClick={runAll} disabled={runningAll}>
            {runningAll && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run all checks
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Test parameters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="search q" value={params.q} onChange={setParam("q")} />
            <Field label="project slug (get-project)" value={params.slug} onChange={setParam("slug")} />
            <Field label="agent slug" value={params.agentSlug} onChange={setParam("agentSlug")} />
            <Field label="render: projectSlug" value={params.projectSlug} onChange={setParam("projectSlug")} />
            <Field label="render: templateStyle" value={params.templateStyle} onChange={setParam("templateStyle")} />
            <Field label="render: leadName" value={params.leadName} onChange={setParam("leadName")} />
            <Field label="behavior: email" value={params.email} onChange={setParam("email")} />
            <Field label="behavior: phone" value={params.phone} onChange={setParam("phone")} />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {ALL_ACTIONS.map((action) => {
            const r = results[action];
            return (
              <Card key={action} className="overflow-hidden">
                <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    {r ? (
                      r.ok ? (
                        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive shrink-0" />
                      )
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    )}
                    <code className="text-sm font-medium truncate">bridge-{action}</code>
                    {r && (
                      <Badge variant={r.ok ? "secondary" : "destructive"}>
                        {r.status} · {r.ms}ms
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runOne(action)}
                    disabled={runningOne === action}
                  >
                    {runningOne === action && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Test
                  </Button>
                </div>
                {r && (
                  <CardContent className="pt-3">
                    {r.error && (
                      <p className="text-sm text-destructive mb-2">{r.error}</p>
                    )}
                    <pre className="text-xs bg-muted text-muted-foreground rounded-md p-3 overflow-auto max-h-72">
{JSON.stringify(r.sample, null, 2)}
                    </pre>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input value={value} onChange={onChange} className="h-9" />
    </div>
  );
}
