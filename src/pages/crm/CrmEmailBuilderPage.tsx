import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Sparkles, Save, Send, Eye, Wand2, Mail, Monitor, Smartphone, Type, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Block =
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "image"; url: string; alt: string }
  | { id: string; type: "button"; text: string; url: string }
  | { id: string; type: "divider" };

const uid = () => Math.random().toString(36).slice(2, 9);

const renderHtml = (subject: string, blocks: Block[]) => {
  const body = blocks.map(b => {
    if (b.type === "heading") return `<h2 style="font:600 22px/1.3 'Plus Jakarta Sans',sans-serif;color:#0a0a0a;margin:24px 0 8px">${b.text}</h2>`;
    if (b.type === "paragraph") return `<p style="font:400 15px/1.6 'Plus Jakarta Sans',sans-serif;color:#333;margin:0 0 16px">${b.text}</p>`;
    if (b.type === "image") return `<img src="${b.url}" alt="${b.alt}" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0" />`;
    if (b.type === "button") return `<div style="margin:24px 0"><a href="${b.url}" style="display:inline-block;padding:12px 28px;background:#c9a86a;color:#fff;text-decoration:none;border-radius:8px;font:600 14px 'Plus Jakarta Sans',sans-serif">${b.text}</a></div>`;
    if (b.type === "divider") return `<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0" />`;
    return "";
  }).join("\n");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${subject}</title></head><body style="margin:0;background:#f5f5f5;padding:24px"><div style="max-width:600px;margin:0 auto;background:#fff;padding:32px;border-radius:12px">${body}</div></body></html>`;
};

export default function CrmEmailBuilderPage() {
  const [name, setName] = useState("Untitled email");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([
    { id: uid(), type: "heading", text: "Hi {{first_name}}," },
    { id: uid(), type: "paragraph", text: "I thought you might like this opportunity..." },
    { id: uid(), type: "button", text: "View Project", url: "https://dealzflow.ca" },
  ]);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const updateBlock = (id: string, patch: Partial<Block>) => setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } as Block : b));
  const removeBlock = (id: string) => setBlocks(prev => prev.filter(b => b.id !== id));
  const addBlock = (type: Block["type"]) => {
    const defaults: Record<string, any> = {
      heading: { text: "Heading" },
      paragraph: { text: "Write something..." },
      image: { url: "", alt: "" },
      button: { text: "Click me", url: "https://" },
      divider: {},
    };
    setBlocks(prev => [...prev, { id: uid(), type, ...defaults[type] } as Block]);
  };

  const generateWithAi = async () => {
    if (!aiPrompt.trim()) { toast.error("Describe what you want"); return; }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          system: "You are an expert real-estate email copywriter. Output strict JSON: { subject: string, preview: string, blocks: Array<{type: 'heading'|'paragraph'|'button', text: string, url?: string}> }. 4-7 blocks total. No markdown.",
          messages: [{ role: "user", content: aiPrompt }],
        },
      });
      if (error) throw error;
      const txt = (data as any)?.message || (data as any)?.text || "";
      const parsed = JSON.parse(txt.replace(/```json|```/g, "").trim());
      if (parsed.subject) setSubject(parsed.subject);
      if (parsed.preview) setPreviewText(parsed.preview);
      if (Array.isArray(parsed.blocks)) {
        setBlocks(parsed.blocks.map((b: any) => ({ id: uid(), ...b })));
      }
      toast.success("Generated");
    } catch (e: any) {
      toast.error(e?.message || "AI failed — try again");
    } finally {
      setGenerating(false);
    }
  };

  const html = renderHtml(subject || name, blocks);

  const saveAsTemplate = async () => {
    if (!name || !subject) { toast.error("Name and subject are required"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("email_templates").insert({
        name, subject, html_content: html, preview_text: previewText, source: "crm_builder",
      });
      if (error) throw error;
      toast.success("Saved to shared templates — synced with Presale");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-[1600px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center"><Wand2 className="h-4 w-4 text-primary" /></div>
            AI Email Builder
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Compose with blocks or describe what you want — saved to the shared template library.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={saveAsTemplate} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-5">
        {/* Builder */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">AI Assist</span></div>
            <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
              placeholder='e.g. "Email about a new presale in Burnaby with $20k incentive, professional but friendly tone"'
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <Button onClick={generateWithAi} disabled={generating} className="w-full" size="sm">
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate Email
            </Button>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold">Settings</p>
            <Input placeholder="Template name" value={name} onChange={e => setName(e.target.value)} />
            <Input placeholder="Subject line" value={subject} onChange={e => setSubject(e.target.value)} />
            <Input placeholder="Preview text" value={previewText} onChange={e => setPreviewText(e.target.value)} />
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold">Blocks</p>
            <div className="space-y-2">
              {blocks.map(b => (
                <div key={b.id} className="border border-border rounded-md p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{b.type}</span>
                    <button onClick={() => removeBlock(b.id)} className="text-[10px] text-destructive hover:underline">Remove</button>
                  </div>
                  {("text" in b) && <Input value={b.text} onChange={e => updateBlock(b.id, { text: e.target.value })} className="h-8 text-xs" />}
                  {b.type === "image" && (<>
                    <Input placeholder="Image URL" value={b.url} onChange={e => updateBlock(b.id, { url: e.target.value })} className="h-8 text-xs" />
                    <Input placeholder="Alt text" value={b.alt} onChange={e => updateBlock(b.id, { alt: e.target.value })} className="h-8 text-xs" />
                  </>)}
                  {b.type === "button" && <Input placeholder="Link URL" value={b.url} onChange={e => updateBlock(b.id, { url: e.target.value })} className="h-8 text-xs" />}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(["heading","paragraph","image","button","divider"] as const).map(t => (
                <Button key={t} size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => addBlock(t)}>+ {t}</Button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 justify-end">
            <Button size="sm" variant={device === "desktop" ? "default" : "outline"} onClick={() => setDevice("desktop")}><Monitor className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant={device === "mobile" ? "default" : "outline"} onClick={() => setDevice("mobile")}><Smartphone className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="bg-muted/30 border border-border rounded-xl p-6 flex justify-center">
            <iframe
              title="preview"
              srcDoc={html}
              className={cn("bg-white border border-border rounded-lg transition-all", device === "desktop" ? "w-full max-w-[680px] h-[700px]" : "w-[375px] h-[700px]")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
