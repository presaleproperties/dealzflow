import { useState, useMemo, useRef, useEffect } from 'react';
import { Send, Search, Users, Filter, ChevronDown, ChevronUp, Eye, FileText, X, Monitor, Smartphone, Code, Lock } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor } from './RichTextEditor';
import { TemplatePicker } from './TemplatePicker';
import { useCrmContacts, useDynamicFilterOptions, LEAD_STATUSES, LEAD_SOURCES, AGENTS, LEAD_TYPES } from '@/hooks/useCrmContacts';
import { formatContactName } from '@/lib/format';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { useBridgeSendEmail } from '@/hooks/useBridgeEmail';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import { useEmailSettings } from '@/hooks/useEmailSettings';
import { MultiSelectFilter } from '@/components/crm/leads/MultiSelectFilter';
import { ContactTypeFilter } from '@/components/crm/leads/ContactTypeFilter';
import type { CrmContact } from '@/hooks/useCrmContacts';
import type { CrmEmailTemplate } from '@/hooks/useCrmEmail';
import { useIsMobile } from '@/hooks/use-mobile';

type SendMode = 'individual' | 'campaign';

function replaceMergeTags(html: string, contact: CrmContact | null, senderName?: string, agentEmail?: string, agentPhone?: string): string {
  let result = html;
  if (contact) {
    result = result.replace(/\{\{lead_name\}\}/gi, `${contact.first_name} ${contact.last_name}`);
    result = result.replace(/\{\{first_name\}\}/gi, contact.first_name || '');
    result = result.replace(/\{\{last_name\}\}/gi, contact.last_name || '');
  }
  result = result.replace(/\{\{agent_name\}\}/gi, senderName || 'Agent');
  result = result.replace(/\{\{agent_email\}\}/gi, agentEmail || '');
  result = result.replace(/\{\{agent_phone\}\}/gi, agentPhone || '');
  result = result.replace(/\{\{company_name\}\}/gi, 'The Presale Properties Group');
  return result;
}

export function ComposeTab() {
  const { data: contacts = [] } = useCrmContacts();
  const dynamicOpts = useDynamicFilterOptions(contacts);
  const { data: templates = [] } = useCrmEmailTemplates();
  const addMessage = useAddCrmMessage();
  const bridgeSend = useBridgeSendEmail();
  const { data: emailSettings } = useEmailSettings();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();

  // Locked recipient list — populated when navigated from Leads bulk bar with ?contactIds=...
  // While locked, the filter UI is replaced by a banner showing the fixed recipient count.
  const lockedIds = useMemo(() => {
    const raw = searchParams.get('contactIds');
    if (!raw) return null;
    const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
    return ids.length > 0 ? new Set(ids) : null;
  }, [searchParams]);

  const [mode, setMode] = useState<SendMode>(lockedIds ? 'campaign' : 'individual');

  // If a locked list arrives mid-session, force campaign mode.
  useEffect(() => {
    if (lockedIds && mode !== 'campaign') setMode('campaign');
  }, [lockedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearLockedIds = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('contactIds');
    setSearchParams(next, { replace: true });
  };

  // Individual mode
  const [searchTo, setSearchTo] = useState('');
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [toOpen, setToOpen] = useState(false);

  // CC/BCC
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');

  // Campaign mode filters
  const [filterContactType, setFilterContactType] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterSource, setFilterSource] = useState<string[]>([]);
  const [filterAgent, setFilterAgent] = useState<string[]>([]);
  const [filterProject, setFilterProject] = useState<string[]>([]);
  const [filterLeadType, setFilterLeadType] = useState<string[]>([]);
  const [filterLanguage, setFilterLanguage] = useState<string[]>([]);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [includeAltEmails, setIncludeAltEmails] = useState(false);
  const [excludeSearch, setExcludeSearch] = useState('');
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [filtersExpanded, setFiltersExpanded] = useState(true);

  // Shared
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeSignature, setIncludeSignature] = useState(true);

  // Template state
  const [activeTemplate, setActiveTemplate] = useState<CrmEmailTemplate | null>(null);
  const [htmlBody, setHtmlBody] = useState('');
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isHtmlMode = !!activeTemplate;

  // From display
  const fromDisplay = useMemo(() => {
    const name = emailSettings?.sender_name;
    return name || 'Agent';
  }, [emailSettings]);

  const filteredContacts = useMemo(() => {
    if (!searchTo) return contacts.slice(0, 10);
    const q = searchTo.toLowerCase();
    return contacts.filter(c =>
      formatContactName(c.first_name, c.last_name).toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [contacts, searchTo]);

  // Campaign recipients
  const campaignRecipients = useMemo(() => {
    let list = contacts;
    // Locked-list mode: ignore the filter UI and only use the IDs handed off from Leads.
    if (lockedIds) {
      list = list.filter(c => lockedIds.has(c.id));
    } else {
      if (filterContactType) list = list.filter(c => c.contact_type === filterContactType);
      if (filterStatus.length > 0) list = list.filter(c => c.status && filterStatus.includes(c.status));
      if (filterSource.length > 0) list = list.filter(c => c.source && filterSource.includes(c.source));
      if (filterAgent.length > 0) list = list.filter(c => c.assigned_to && filterAgent.includes(c.assigned_to));
      if (filterProject.length > 0) list = list.filter(c =>
        filterProject.some(fp => (c.projects ?? []).includes(fp) || c.project === fp)
      );
      if (filterLeadType.length > 0) list = list.filter(c => c.lead_type && filterLeadType.includes(c.lead_type));
      if (filterLanguage.length > 0) list = list.filter(c => c.language && filterLanguage.includes(c.language));
      if (filterTags.length > 0) list = list.filter(c =>
        filterTags.some(ft => (c.tags ?? []).includes(ft))
      );
    }
    list = list.filter(c => c.email);
    list = list.filter(c => !excludedIds.has(c.id));
    return list;
  }, [contacts, lockedIds, filterContactType, filterStatus, filterSource, filterAgent, filterProject, filterLeadType, filterLanguage, filterTags, excludedIds]);

  const totalEmailAddresses = useMemo(() => {
    let count = campaignRecipients.length;
    if (includeAltEmails) {
      campaignRecipients.forEach(c => {
        if (c.email_secondary) count++;
        if (c.co_buyer_email) count++;
      });
    }
    return count;
  }, [campaignRecipients, includeAltEmails]);

  const excludeResults = useMemo(() => {
    if (!excludeSearch) return [];
    const q = excludeSearch.toLowerCase();
    return contacts.filter(c =>
      formatContactName(c.first_name, c.last_name).toLowerCase().includes(q) && !excludedIds.has(c.id)
    ).slice(0, 5);
  }, [contacts, excludeSearch, excludedIds]);

  // Update iframe when htmlBody changes
  useEffect(() => {
    if (iframeRef.current && isHtmlMode) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlBody || '<p style="color:#888;font-family:sans-serif;padding:20px;">No content</p>');
        doc.close();
      }
    }
  }, [htmlBody, isHtmlMode, previewWidth]);

  const handleSelectTemplate = (tpl: CrmEmailTemplate) => {
    setActiveTemplate(tpl);
    const agentPhone = (emailSettings as any)?.signature_builder_data?.phone || '';
    const agentEmail = emailSettings?.reply_to || '';
    const merged = replaceMergeTags(
      tpl.body_html || '',
      selectedContact,
      emailSettings?.sender_name || undefined,
      agentEmail,
      agentPhone,
    );
    setHtmlBody(merged);
    if (tpl.subject && !subject) setSubject(tpl.subject);
    setShowHtmlEditor(false);
  };

  const clearTemplate = () => {
    setActiveTemplate(null);
    setHtmlBody('');
  };

  const handleSend = async () => {
    const bodyContent = isHtmlMode ? htmlBody : body;
    if (mode === 'individual') {
      if (!selectedContact || !subject.trim() || (!bodyContent.trim())) return;
      await addMessage.mutateAsync({
        contact_id: selectedContact.id,
        direction: 'outbound',
        content: `Subject: ${subject}\n\n${bodyContent}`,
        channel: 'email',
        sent_by: 'Agent',
        message_type: 'text',
      });
      setSelectedContact(null);
      setSearchTo('');
      setCc('');
      setBcc('');
    }
    setSubject('');
    setBody('');
    clearTemplate();
  };

  const isSending = addMessage.isPending;
  const bodyContent = isHtmlMode ? htmlBody : body;

  const canSend = mode === 'individual'
    ? !!selectedContact && subject.trim() && bodyContent.trim()
    : campaignRecipients.length > 0 && subject.trim() && bodyContent.trim();

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-base font-semibold text-foreground">Compose Email</h2>

      {/* Mode toggle */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5 w-fit">
        <button
          onClick={() => setMode('individual')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'individual' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Individual
        </button>
        <button
          onClick={() => setMode('campaign')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${mode === 'campaign' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Campaign
        </button>
      </div>

      {/* Individual: From + To + CC/BCC */}
      {mode === 'individual' && (
        <>
          <div>
            <Label className="text-muted-foreground">From</Label>
            <div className="px-3 py-2 rounded-md border border-border/40 bg-muted/20 text-sm text-foreground/80">
              {fromDisplay}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>To</Label>
              <button onClick={() => setShowCcBcc(!showCcBcc)} className="text-[11px] font-medium text-primary hover:text-primary/80 transition-colors">
                {showCcBcc ? 'Hide CC/BCC' : 'CC BCC'}
              </button>
            </div>
            <Popover open={toOpen} onOpenChange={setToOpen}>
              <PopoverTrigger asChild>
                <div className="relative cursor-pointer">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={selectedContact ? `${formatContactName(selectedContact.first_name, selectedContact.last_name)} <${selectedContact.email ?? 'no email'}>` : searchTo}
                    onChange={e => { setSearchTo(e.target.value); setSelectedContact(null); setToOpen(true); }}
                    onFocus={() => setToOpen(true)}
                    placeholder="Search contact..."
                    className="pl-9 min-h-[44px] sm:min-h-0"
                  />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] sm:w-[400px] p-0" align="start">
                <div className="max-h-[200px] overflow-y-auto">
                  {filteredContacts.map(c => (
                    <div key={c.id} className="px-3 py-2.5 sm:py-2 hover:bg-muted/50 cursor-pointer text-sm min-h-[44px] sm:min-h-0 flex items-center" onClick={() => { setSelectedContact(c); setToOpen(false); }}>
                      <span className="font-medium text-foreground">{formatContactName(c.first_name, c.last_name)}</span>
                      {c.email && <span className="text-muted-foreground ml-2 truncate">{c.email}</span>}
                    </div>
                  ))}
                  {filteredContacts.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground text-center">No contacts found</p>}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {showCcBcc && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">CC</Label>
                <Input value={cc} onChange={e => setCc(e.target.value)} placeholder="email1@example.com, email2@example.com" className="min-h-[44px] sm:min-h-0" />
              </div>
              <div>
                <Label className="text-xs">BCC</Label>
                <Input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="email1@example.com, email2@example.com" className="min-h-[44px] sm:min-h-0" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Campaign: Recipients section */}
      {mode === 'campaign' && (
        <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-border/40">
          <button onClick={() => setFiltersExpanded(!filtersExpanded)} className="flex items-center gap-2 text-sm font-medium text-foreground w-full justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>Recipients</span>
              <Badge variant="secondary" className="text-[10px]">{campaignRecipients.length} contacts</Badge>
            </div>
            {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {filtersExpanded && (
            <div className="space-y-3">
              {lockedIds ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      Recipients locked from Leads selection
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {campaignRecipients.length} contact{campaignRecipients.length === 1 ? '' : 's'} with email · use the exclude box below to drop any individuals
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={clearLockedIds}>
                    Use filters instead
                  </Button>
                </div>
              ) : (
                <>
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <ContactTypeFilter value={filterContactType} onChange={setFilterContactType} />
                    <MultiSelectFilter label="Status" options={[...LEAD_STATUSES]} selected={filterStatus} onChange={setFilterStatus} />
                  </div>
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <MultiSelectFilter label="Source" options={[...LEAD_SOURCES]} selected={filterSource} onChange={setFilterSource} />
                    <MultiSelectFilter label="Assigned To" options={[...AGENTS]} selected={filterAgent} onChange={setFilterAgent} />
                  </div>
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <MultiSelectFilter label="Project" options={dynamicOpts.projects} selected={filterProject} onChange={setFilterProject} />
                    <MultiSelectFilter label="Lead Type" options={[...LEAD_TYPES]} selected={filterLeadType} onChange={setFilterLeadType} />
                  </div>
                  <div className={`grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <MultiSelectFilter label="Language" options={dynamicOpts.languages} selected={filterLanguage} onChange={setFilterLanguage} />
                    <MultiSelectFilter label="Tags" options={dynamicOpts.tags} selected={filterTags} onChange={setFilterTags} />
                  </div>
                </>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Checkbox id="include-alt" checked={includeAltEmails} onCheckedChange={(v) => setIncludeAltEmails(!!v)} />
                <label htmlFor="include-alt" className="text-xs text-foreground cursor-pointer">Include spouse/alt emails</label>
              </div>

              <div>
                <Label className="text-xs">Exclude contacts</Label>
                <Input value={excludeSearch} onChange={e => setExcludeSearch(e.target.value)} placeholder="Search to exclude..." className="h-8 text-xs" />
                {excludeResults.length > 0 && (
                  <div className="mt-1 border border-border rounded-md overflow-hidden">
                    {excludeResults.map(c => (
                      <button key={c.id} onClick={() => { setExcludedIds(prev => new Set([...prev, c.id])); setExcludeSearch(''); }} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-muted/40 text-left">
                        <span className="text-foreground">{formatContactName(c.first_name, c.last_name)}</span>
                        <span className="text-muted-foreground">{c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {excludedIds.size > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {Array.from(excludedIds).map(id => {
                      const c = contacts.find(x => x.id === id);
                      if (!c) return null;
                      return (
                        <Badge key={id} variant="secondary" className="text-[10px] cursor-pointer gap-0.5" onClick={() => setExcludedIds(prev => { const n = new Set(prev); n.delete(id); return n; })}>
                          {formatContactName(c.first_name, c.last_name)} ×
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="text-xs font-medium text-foreground bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                Sending to {campaignRecipients.length} contacts ({totalEmailAddresses} email addresses{includeAltEmails ? ' including spouse/alt emails' : ''})
              </div>
            </div>
          )}
        </div>
      )}

      {/* Template selector */}
      <div>
        <Label>Use Template</Label>
        {activeTemplate ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-sm">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <span className="text-foreground font-medium truncate">Template: {activeTemplate.name}</span>
            <button onClick={clearTemplate} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <Button variant="outline" className="w-full justify-start text-muted-foreground h-10" onClick={() => setTemplatePickerOpen(true)}>
            <FileText className="w-4 h-4 mr-2" />
            {templates.length > 0 ? 'Select a template...' : 'No templates yet'}
          </Button>
        )}
      </div>

      {/* Subject */}
      <div>
        <Label>Subject *</Label>
        <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" maxLength={200} className="min-h-[44px] sm:min-h-0" />
      </div>

      {/* Body — HTML mode vs plain mode */}
      {isHtmlMode ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Email Body (HTML Template)</Label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-0.5">
                <button onClick={() => setPreviewWidth('desktop')} className={`p-1 rounded transition-colors ${previewWidth === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setPreviewWidth('mobile')} className={`p-1 rounded transition-colors ${previewWidth === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>
              <button onClick={() => setShowHtmlEditor(!showHtmlEditor)} className="text-[11px] font-medium text-primary hover:text-primary/80 flex items-center gap-1">
                <Code className="w-3.5 h-3.5" />
                {showHtmlEditor ? 'Hide HTML' : 'Edit HTML'}
              </button>
            </div>
          </div>

          {/* HTML Preview */}
          <div className="flex justify-center">
            <div className="rounded-lg border border-border/40 bg-white overflow-hidden transition-all" style={{ width: previewWidth === 'desktop' ? '100%' : '375px', maxWidth: '100%' }}>
              <iframe ref={iframeRef} title="Email Preview" className="w-full border-0" style={{ height: '400px' }} sandbox="allow-same-origin" />
            </div>
          </div>

          {/* Raw HTML editor */}
          {showHtmlEditor && (
            <Textarea
              value={htmlBody}
              onChange={e => setHtmlBody(e.target.value)}
              className="min-h-[200px] font-mono text-xs bg-zinc-950 text-green-400 border-border/40"
              spellCheck={false}
            />
          )}
        </div>
      ) : (
        <div>
          <Label>Body *</Label>
          <RichTextEditor content={body} onChange={setBody} />
        </div>
      )}

      {/* Signature preview */}
      {emailSettings?.signature_html && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Checkbox id="include-sig" checked={includeSignature} onCheckedChange={(v) => setIncludeSignature(!!v)} />
            <label htmlFor="include-sig" className="text-[11px] text-muted-foreground/60 cursor-pointer flex items-center gap-1.5">
              <Eye className="h-3 w-3" />
              Include signature
            </label>
          </div>
          {includeSignature && (
            <div className="rounded-lg border border-border/30 bg-muted/10 p-3 opacity-60">
              <div className="text-xs text-muted-foreground mb-1.5">--</div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm" dangerouslySetInnerHTML={{ __html: emailSettings.signature_html }} />
            </div>
          )}
        </div>
      )}

      {/* Send button */}
      <div className="flex justify-end sm:static sticky bottom-0 pb-3 sm:pb-0 pt-2 bg-background sm:bg-transparent">
        <Button
          className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto min-h-[44px]"
          disabled={!canSend || isSending}
          onClick={handleSend}
        >
          <Send className="w-4 h-4" />
          {mode === 'campaign'
            ? `Send to ${campaignRecipients.length} contacts`
            : isSending ? 'Sending...' : 'Send Email'}
        </Button>
      </div>

      {/* Template Picker Modal */}
      <TemplatePicker open={templatePickerOpen} onOpenChange={setTemplatePickerOpen} onSelect={handleSelectTemplate} />
    </div>
  );
}
