import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { X, Send, Save, Clock, Mail, Users, Eye, CalendarIcon, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUpdateEmailTemplate, type EmailTemplate } from '@/hooks/useEmailTemplates';

const MAILERLITE_GROUPS = [
  { id: '184309315779167647', name: 'Rail District', subs: 456 },
  { id: '184309315813770674', name: 'Burquitlam', subs: 381 },
  { id: '184309315796993450', name: 'Gardena', subs: 312 },
  { id: '184309315828450744', name: 'SOCO', subs: 284 },
  { id: '184309315844179392', name: 'Walker House', subs: 260 },
  { id: '184309315858859464', name: 'High Street', subs: 247 },
  { id: '184309315877733838', name: 'Town & Centre', subs: 185 },
  { id: '184309315912336855', name: 'Heath', subs: 158 },
  { id: '184309315895559634', name: 'Butterfly', subs: 160 },
  { id: '184309315930162651', name: 'Woodward', subs: 150 },
  { id: '184309315946939875', name: 'Atlin', subs: 129 },
  { id: '184309315964765676', name: 'Belvedere', subs: 122 },
  { id: '184309315982591473', name: 'Holland', subs: 119 },
  { id: '184309316000417271', name: 'PURA', subs: 115 },
  { id: '184309316016145916', name: 'Mirada Estates', subs: 113 },
  { id: '184309316032923137', name: '40Listings', subs: 109 },
  { id: '184309316051797511', name: 'Century City', subs: 98 },
  { id: '184309316069623311', name: 'QUINN', subs: 91 },
  { id: '184309316097934879', name: 'Jericho', subs: 86 },
  { id: '184309316115760683', name: 'Portwood', subs: 85 },
  { id: '184309316133586489', name: 'Renfrew', subs: 83 },
  { id: '184309316152460869', name: 'FORME ON 54', subs: 71 },
  { id: '184309316170286672', name: 'Guilden', subs: 68 },
  { id: '184309316187063895', name: 'Solana', subs: 58 },
  { id: '184309316202792548', name: 'Mountvue', subs: 49 },
  { id: '184309316218521200', name: 'BAND Townline', subs: 46 },
  { id: '184309316233201273', name: 'North Village', subs: 42 },
  { id: '184309316246832769', name: 'Hendrix', subs: 36 },
  { id: '184309316341204657', name: 'Manchester', subs: 29 },
  { id: '184309316263609991', name: 'Ironwood', subs: 27 },
  { id: '184309316278290065', name: 'Inlet Port Moody', subs: 24 },
  { id: '184309316308698784', name: 'Georgetown', subs: 18 },
  { id: '184309316325476008', name: 'Fleetwood Village', subs: 16 },
  { id: '184309316359030461', name: 'Eastin', subs: 11 },
  { id: '184408359920731577', name: 'Hot Leads', subs: null, tag: 'nurture' },
  { id: '184408361726379558', name: 'Long Term Nurture', subs: null, tag: 'nurture' },
  { id: '184408354030880263', name: 'Eden - 7 Day Nurture', subs: null, tag: 'nurture' },
  { id: '184408356024222866', name: 'Rail District - 7 Day Nurture', subs: null, tag: 'nurture' },
  { id: '184408357824627803', name: 'Jericho - 7 Day Nurture', subs: null, tag: 'nurture' },
  { id: '113386099697517938', name: 'Realtors', subs: 806 },
  { id: '77265375494931891', name: 'Past Client', subs: 200 },
  { id: '136474708968212022', name: 'Expo 2024 Attendees', subs: 193 },
  { id: '138653354878305861', name: 'Presale Academy Waitlist', subs: 62 },
];

interface Props {
  template: EmailTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignComposer({ template, open, onOpenChange }: Props) {
  const updateTemplate = useUpdateEmailTemplate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [fromName, setFromName] = useState('Uzair - Presale Properties');
  const [fromEmail, setFromEmail] = useState('uzair@presaleproperties.com');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [scheduleLater, setScheduleLater] = useState(false);
  const [scheduleDate, setScheduleDate] = useState<Date>();
  const [autoResend, setAutoResend] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');

  useEffect(() => {
    if (open && template) {
      setCampaignName(`${template.name} - ${format(new Date(), 'MMM d, yyyy')}`);
      setSubject(template.subject ?? '');
      setPreviewText(template.preview_text ?? '');
      setSelectedGroups([]);
      setScheduleLater(false);
      setAutoResend(false);
    }
  }, [open, template]);

  useEffect(() => {
    if (iframeRef.current && open) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(template?.html_content || '<p style="color:#888;font-family:sans-serif;padding:20px;">No content</p>');
        doc.close();
      }
    }
  }, [open, template]);

  const toggleGroup = (id: string) => {
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const totalRecipients = selectedGroups.reduce((sum, gid) => {
    const group = MAILERLITE_GROUPS.find(g => g.id === gid);
    return sum + (group?.subs ?? 0);
  }, 0);

  const filteredGroups = MAILERLITE_GROUPS.filter(g =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const projectGroups = filteredGroups.filter(g => !('tag' in g) || !g.tag);
  const nurtureGroups = filteredGroups.filter(g => 'tag' in g && g.tag === 'nurture');
  const specialGroups = filteredGroups.filter(g => ['113386099697517938', '77265375494931891', '136474708968212022', '138653354878305861'].includes(g.id));
  const regularGroups = projectGroups.filter(g => !specialGroups.find(s => s.id === g.id));

  const handleSend = async () => {
    if (!subject.trim()) { toast.error('Subject line is required'); return; }
    if (selectedGroups.length === 0) { toast.error('Select at least one recipient group'); return; }

    setSending(true);
    try {
      // Update template usage
      await updateTemplate.mutateAsync({
        id: template.id,
        updates: {
          times_used: template.times_used + 1,
          last_used_at: new Date().toISOString(),
        },
      });

      // Store campaign in localStorage
      const campaigns = JSON.parse(localStorage.getItem('df_campaigns') || '[]');
      campaigns.unshift({
        id: crypto.randomUUID(),
        name: campaignName,
        template_name: template.name,
        subject,
        groups: selectedGroups.map(gid => MAILERLITE_GROUPS.find(g => g.id === gid)?.name ?? gid),
        recipients: totalRecipients,
        sent_at: scheduleLater && scheduleDate ? scheduleDate.toISOString() : new Date().toISOString(),
        status: scheduleLater ? 'scheduled' : 'sent',
        open_rate: null,
        click_rate: null,
        auto_resend: autoResend,
      });
      localStorage.setItem('df_campaigns', JSON.stringify(campaigns));

      toast.success(
        scheduleLater
          ? `Campaign scheduled for ${format(scheduleDate!, 'MMM d, yyyy h:mm a')}`
          : `Campaign queued for sending to ${totalRecipients.toLocaleString()} recipients`
      );
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to send campaign');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = () => {
    const campaigns = JSON.parse(localStorage.getItem('df_campaigns') || '[]');
    campaigns.unshift({
      id: crypto.randomUUID(),
      name: campaignName,
      template_name: template.name,
      subject,
      groups: selectedGroups.map(gid => MAILERLITE_GROUPS.find(g => g.id === gid)?.name ?? gid),
      recipients: totalRecipients,
      sent_at: null,
      status: 'draft',
      open_rate: null,
      click_rate: null,
    });
    localStorage.setItem('df_campaigns', JSON.stringify(campaigns));
    toast.success('Campaign saved as draft');
    onOpenChange(false);
  };

  const handleTestEmail = () => {
    if (!testEmail.trim()) { toast.error('Enter a test email address'); return; }
    toast.success(`Test email sent to ${testEmail}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[95vw] lg:max-w-5xl max-h-[92vh] p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Send Campaign</DialogTitle>

        <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card/80">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-foreground">Send as Campaign</h2>
              <p className="text-[11px] text-muted-foreground">Using: {template?.name}</p>
            </div>
          </div>
          {selectedGroups.length > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Users className="w-3 h-3" />
              {totalRecipients.toLocaleString()} recipients
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 flex-1 overflow-hidden" style={{ maxHeight: 'calc(92vh - 120px)' }}>
          {/* Left — Settings */}
          <ScrollArea className="lg:col-span-3 border-r border-border/30">
            <div className="p-5 space-y-5">
              {/* Template Preview */}
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Template Preview</Label>
                <div className="rounded-lg border border-border/40 bg-white overflow-hidden">
                  <iframe
                    ref={iframeRef}
                    title="Campaign Preview"
                    className="w-full border-0"
                    style={{ height: '200px' }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>

              {/* Campaign Settings */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Campaign Settings
                </h3>
                <div>
                  <Label className="text-xs">Campaign Name</Label>
                  <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} className="h-9" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Subject Line *</Label>
                    <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">Preview Text</Label>
                    <Input value={previewText} onChange={e => setPreviewText(e.target.value)} placeholder="Inbox preview" className="h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">From Name</Label>
                    <Input value={fromName} onChange={e => setFromName(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-xs">From Email</Label>
                    <Input value={fromEmail} onChange={e => setFromEmail(e.target.value)} className="h-9" />
                  </div>
                </div>
              </div>

              {/* Send Options */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Send Options
                </h3>
                <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">Schedule for Later</p>
                      <p className="text-[10px] text-muted-foreground">Choose when to send</p>
                    </div>
                  </div>
                  <Switch checked={scheduleLater} onCheckedChange={setScheduleLater} />
                </div>

                {scheduleLater && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left h-9", !scheduleDate && "text-muted-foreground")}>
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {scheduleDate ? format(scheduleDate, 'PPP p') : 'Pick date & time'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={setScheduleDate}
                        disabled={(date) => date < new Date()}
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                )}

                <div className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">Auto-resend to non-openers</p>
                      <p className="text-[10px] text-muted-foreground">Resend 48h later with modified subject</p>
                    </div>
                  </div>
                  <Switch checked={autoResend} onCheckedChange={setAutoResend} />
                </div>
              </div>

              {/* Test Email */}
              <div className="space-y-2">
                <Label className="text-xs">Send Test Email</Label>
                <div className="flex gap-2">
                  <Input
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    placeholder="test@email.com"
                    className="h-9 flex-1"
                  />
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={handleTestEmail}>
                    <Send className="w-3.5 h-3.5" /> Send Test
                  </Button>
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Right — Groups */}
          <div className="lg:col-span-2 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border/30">
              <h3 className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
                <Users className="w-3.5 h-3.5" /> Recipient Groups
              </h3>
              <Input
                value={groupSearch}
                onChange={e => setGroupSearch(e.target.value)}
                placeholder="Search groups..."
                className="h-8 text-xs"
              />
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-4">
                {/* Project Groups */}
                {regularGroups.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">Projects</p>
                    <div className="space-y-0.5">
                      {regularGroups.map(g => (
                        <label
                          key={g.id}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-xs",
                            selectedGroups.includes(g.id) ? "bg-primary/10" : "hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={selectedGroups.includes(g.id)}
                            onCheckedChange={() => toggleGroup(g.id)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="flex-1 truncate">{g.name}</span>
                          {g.subs !== null && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">{g.subs}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nurture Groups */}
                {nurtureGroups.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">Nurture Sequences</p>
                    <div className="space-y-0.5">
                      {nurtureGroups.map(g => (
                        <label
                          key={g.id}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-xs",
                            selectedGroups.includes(g.id) ? "bg-primary/10" : "hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={selectedGroups.includes(g.id)}
                            onCheckedChange={() => toggleGroup(g.id)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="flex-1 truncate">{g.name}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-border/40">nurture</Badge>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Special Groups */}
                {specialGroups.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-1">Special Lists</p>
                    <div className="space-y-0.5">
                      {specialGroups.map(g => (
                        <label
                          key={g.id}
                          className={cn(
                            "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-xs",
                            selectedGroups.includes(g.id) ? "bg-primary/10" : "hover:bg-muted/40"
                          )}
                        >
                          <Checkbox
                            checked={selectedGroups.includes(g.id)}
                            onCheckedChange={() => toggleGroup(g.id)}
                            className="h-3.5 w-3.5"
                          />
                          <span className="flex-1 truncate">{g.name}</span>
                          {g.subs !== null && (
                            <span className="text-[10px] text-muted-foreground tabular-nums">{g.subs}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Selected summary */}
            <div className="px-4 py-2.5 border-t border-border/30 bg-muted/20">
              <p className="text-[11px] text-muted-foreground">
                {selectedGroups.length === 0
                  ? 'No groups selected'
                  : `${selectedGroups.length} group${selectedGroups.length > 1 ? 's' : ''} · ~${totalRecipients.toLocaleString()} recipients`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border/50 bg-card/80">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSaveDraft}>
              <Save className="w-3.5 h-3.5" /> Save as Draft
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleSend}
              disabled={sending || !subject.trim() || selectedGroups.length === 0}
            >
              <Send className="w-3.5 h-3.5" />
              {sending ? 'Sending...' : scheduleLater ? 'Schedule Campaign' : 'Send Campaign'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
