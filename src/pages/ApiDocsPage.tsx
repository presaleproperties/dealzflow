import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useIsAdmin } from '@/hooks/useAdmin';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { PageLoader } from '@/components/ui/page-loader';
import { cn } from '@/lib/utils';

const BASE_URL_HINT = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/zara-api`;

interface Endpoint {
  method: string;
  path: string;
  description: string;
  example?: { request?: string; response: string };
}

const ENDPOINTS: Record<string, Endpoint[]> = {
  "Leads (pipeline_prospects)": [
    { method: "GET", path: "/leads", description: "List all leads. Supports ?search=, ?status=, ?limit=, ?offset=", example: { response: '{ "success": true, "data": [...], "count": 42 }' } },
    { method: "GET", path: "/leads/:id", description: "Get a single lead by ID" },
    { method: "POST", path: "/leads", description: "Create a new lead", example: { request: '{ "client_name": "John Doe", "user_id": "...", "temperature": "hot" }', response: '{ "success": true, "data": { ... } }' } },
    { method: "PUT", path: "/leads/:id", description: "Update a lead" },
    { method: "DELETE", path: "/leads/:id", description: "Delete a lead" },
    { method: "POST", path: "/leads/bulk", description: "Bulk upsert up to 500 leads" },
  ],
  "Deals": [
    { method: "GET", path: "/deals", description: "List all deals" },
    { method: "GET", path: "/deals/:id", description: "Get a single deal" },
    { method: "POST", path: "/deals", description: "Create a deal", example: { request: '{ "client_name": "Jane", "deal_type": "BUY", "user_id": "..." }', response: '{ "success": true, "data": { ... } }' } },
    { method: "PUT", path: "/deals/:id", description: "Update a deal" },
    { method: "DELETE", path: "/deals/:id", description: "Delete a deal" },
    { method: "POST", path: "/deals/bulk", description: "Bulk upsert up to 500 deals" },
  ],
  "Clients (client_inventory)": [
    { method: "GET", path: "/clients", description: "List all clients" },
    { method: "GET", path: "/clients/:id", description: "Get a single client" },
    { method: "POST", path: "/clients", description: "Create a client" },
    { method: "PUT", path: "/clients/:id", description: "Update a client" },
    { method: "DELETE", path: "/clients/:id", description: "Delete a client" },
    { method: "POST", path: "/clients/bulk", description: "Bulk upsert up to 500 clients" },
  ],
  "Events (daily_focus)": [
    { method: "GET", path: "/events", description: "List all events/tasks" },
    { method: "GET", path: "/events/:id", description: "Get a single event" },
    { method: "POST", path: "/events", description: "Create an event" },
    { method: "PUT", path: "/events/:id", description: "Update an event" },
    { method: "DELETE", path: "/events/:id", description: "Delete an event" },
  ],
  Utility: [
    { method: "GET", path: "/schema", description: "List all tables with their column names", example: { response: '{ "success": true, "data": { "deals": ["id","client_name",...], ... } }' } },
    { method: "GET", path: "/search?q=&tables=", description: "Full-text search across leads, clients, deals" },
    { method: "POST", path: "/sync/rezen", description: "Manually trigger a reZEN platform sync" },
  ],
};

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function ApiDocsPage() {
  const { user, loading } = useAuth();
  const { data: isAdmin, isLoading: isCheckingAdmin } = useIsAdmin();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isAdmin) {
      supabase
        .from("api_keys" as any)
        .select("key")
        .eq("label", "Zara AI Agent")
        .eq("is_active", true)
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) setApiKey((data as any).key);
        });
    }
  }, [isAdmin]);

  if (loading || isCheckingAdmin) return <div className="min-h-screen flex items-center justify-center"><PageLoader /></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const maskedKey = apiKey ? `${'•'.repeat(apiKey.length - 6)}${apiKey.slice(-6)}` : '—';

  const toggleGroup = (g: string) => setExpandedGroups(prev => ({ ...prev, [g]: !prev[g] }));

  return (
    <AppLayout>
      <div className="flex-1 overflow-auto">
        <Header title="Zara API Documentation" subtitle="External agent REST API reference" />
        <div className="p-4 space-y-4 max-w-4xl mx-auto">
          {/* Auth section */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                All requests to <code className="text-primary">/api/zara/*</code> require the <code>x-api-key</code> header.
              </p>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
                <span className="text-xs font-medium text-muted-foreground shrink-0">API Key:</span>
                <code className="text-xs flex-1 truncate font-mono">
                  {revealed ? apiKey : maskedKey}
                </code>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setRevealed(v => !v)}>
                  {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2"
                  onClick={() => { if (apiKey) { navigator.clipboard.writeText(apiKey); setCopied(true); setTimeout(() => setCopied(false), 2000); } }}
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>

              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
                <span className="text-xs font-medium text-muted-foreground shrink-0">Base URL:</span>
                <code className="text-xs flex-1 truncate font-mono">{BASE_URL_HINT}</code>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2"
                  onClick={() => { navigator.clipboard.writeText(BASE_URL_HINT); setCopiedUrl(true); setTimeout(() => setCopiedUrl(false), 2000); }}
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </Button>
              </div>

              <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
                <p className="text-[10px] text-muted-foreground font-medium mb-1">Example cURL:</p>
                <pre className="text-[10px] font-mono text-foreground/80 whitespace-pre-wrap">
{`curl -H "x-api-key: YOUR_KEY" \\
  ${BASE_URL_HINT}/schema`}
                </pre>
              </div>

              <div className="flex gap-2 text-[10px]">
                <Badge variant="outline" className="text-[10px]">Rate limit: 200 req/min</Badge>
                <Badge variant="outline" className="text-[10px]">All calls logged</Badge>
                <Badge variant="outline" className="text-[10px]">JSON responses</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Endpoints */}
          {Object.entries(ENDPOINTS).map(([group, endpoints]) => {
            const expanded = expandedGroups[group] ?? true;
            return (
              <Card key={group}>
                <CardHeader className="pb-0">
                  <button onClick={() => toggleGroup(group)} className="flex items-center gap-2 w-full text-left">
                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    <CardTitle className="text-sm flex-1">{group}</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">{endpoints.length}</Badge>
                  </button>
                </CardHeader>
                {expanded && (
                  <CardContent className="pt-3 space-y-2">
                    {endpoints.map((ep, i) => (
                      <div key={i} className="p-2 rounded-lg border border-border/30 bg-muted/20 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge className={cn("text-[10px] font-mono border", METHOD_COLORS[ep.method])}>
                            {ep.method}
                          </Badge>
                          <code className="text-xs font-mono text-foreground/80">{ep.path}</code>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{ep.description}</p>
                        {ep.example && (
                          <div className="space-y-1">
                            {ep.example.request && (
                              <div className="p-1.5 rounded bg-muted/40">
                                <p className="text-[9px] text-muted-foreground font-medium">Request body:</p>
                                <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap">{ep.example.request}</pre>
                              </div>
                            )}
                            <div className="p-1.5 rounded bg-muted/40">
                              <p className="text-[9px] text-muted-foreground font-medium">Response:</p>
                              <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap">{ep.example.response}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Response format */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Response Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                  <p className="text-[10px] text-emerald-400 font-medium mb-1">Success</p>
                  <pre className="text-[10px] font-mono text-foreground/70">{`{
  "success": true,
  "data": <result>,
  "count": <number>
}`}</pre>
                </div>
                <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20">
                  <p className="text-[10px] text-red-400 font-medium mb-1">Error</p>
                  <pre className="text-[10px] font-mono text-foreground/70">{`{
  "success": false,
  "error": "<message>",
  "code": <status>
}`}</pre>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
