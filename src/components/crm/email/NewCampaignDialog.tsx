import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Loader2 } from 'lucide-react';
import { RichTextEditor } from './RichTextEditor';
import { useCrmEmailTemplates, useCreateCampaign } from '@/hooks/useCrmEmail';
import { useCrmContacts, LEAD_STATUSES, LEAD_SOURCES, PROJECTS } from '@/hooks/useCrmContacts';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewCampaignDialog({ open, onOpenChange }: Props) {
  const { data: templates = [] } = useCrmEmailTemplates();
  const { data: contacts = [] } = useCrmContacts();
  const createCampaign = useCreateCampaign();

  const [step, setStep] = useState(0);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  // Local CRM filter mode
  const [filterType, setFilterType] = useState('all');
  const [filterValue, setFilterValue] = useState('');
  // MailerLite group selection
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [scheduleType, setScheduleType] = useState<'now' | 'schedule'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [isSending, setIsSending] = useState(false);

  const recipientCount = (() => {
    if (filterType === 'all') return contacts.length;
    return contacts.filter(c => {
      if (filterType === 'status') return c.status === filterValue;
      if (filterType === 'source') return c.source === filterValue;
      if (filterType === 'project') return c.project === filterValue;
      return true;
    }).length;
  })();

  const loadTemplate = (id: string) => {
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body_html ?? '');
    }
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSend = async () => {
    setIsSending(true);
    try {
      const segmentFilter: Record<string, string | number | boolean | null> = { type: filterType };
      if (filterType !== 'all') segmentFilter.value = filterValue;

      await createCampaign.mutateAsync({
        subject,
        body_html: body,
        status: scheduleType === 'now' ? 'sent' : 'scheduled',
        recipients_count: recipientCount,
        segment_filter: segmentFilter,
        sent_at: scheduleType === 'now' ? new Date().toISOString() : scheduleDate ? new Date(scheduleDate).toISOString() : undefined,
      });
      resetAndClose();
    } catch {
      // error is handled by mutation hooks
    } finally {
      setIsSending(false);
    }
  };

  const resetAndClose = () => {
    setStep(0);
    setSubject('');
    setBody('');
    setFilterType('all');
    setFilterValue('');
    setSelectedGroupIds([]);
    setScheduleType('now');
    setScheduleDate('');
    onOpenChange(false);
  };

  const filterOptions = filterType === 'status' ? [...LEAD_STATUSES]
    : filterType === 'source' ? [...LEAD_SOURCES]
    : filterType === 'project' ? [...PROJECTS]
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>

        {!isMailerLiteConnected && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <span className="text-amber-700 dark:text-amber-400">
              MailerLite not connected. Campaign will be saved locally only. Connect MailerLite in CRM Settings to send real emails.
            </span>
          </div>
        )}

        <Tabs value={String(step)} onValueChange={v => setStep(Number(v))}>
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="0">Template</TabsTrigger>
            <TabsTrigger value="1" disabled={!subject && step < 1}>Content</TabsTrigger>
            <TabsTrigger value="2" disabled={(!subject || !body) && step < 2}>Audience</TabsTrigger>
            <TabsTrigger value="3" disabled={(!subject || !body) && step < 3}>Send</TabsTrigger>
          </TabsList>

          {/* Step 0: Template */}
          <TabsContent value="0" className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose a template or start blank.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div
                className="border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => { setSubject(''); setBody(''); setStep(1); }}
              >
                <p className="text-sm font-medium text-foreground">Blank Email</p>
                <p className="text-xs text-muted-foreground">Start from scratch</p>
              </div>
              {templates.map(t => (
                <div
                  key={t.id}
                  className="border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => { loadTemplate(t.id); setStep(1); }}
                >
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{t.subject}</p>
                  {t.project && (
                    <Badge variant="outline" className="border-0 text-[10px] mt-1" style={{ background: 'hsl(39 67% 55% / 0.15)', color: 'hsl(39 67% 55%)' }}>
                      {t.project}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Step 1: Content */}
          <TabsContent value="1" className="space-y-3">
            <div>
              <Label>Subject *</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line" maxLength={200} />
            </div>
            <div>
              <Label>Body *</Label>
              <RichTextEditor content={body} onChange={setBody} />
            </div>
            <div className="flex justify-end">
              <Button size="sm" disabled={!subject.trim() || !body.trim()} onClick={() => setStep(2)}>Next: Audience</Button>
            </div>
          </TabsContent>

          {/* Step 2: Audience */}
          <TabsContent value="2" className="space-y-3">
            {isMailerLiteConnected ? (
              <>
                <p className="text-sm text-muted-foreground">Select MailerLite groups to send to. Leave empty to send to all subscribers.</p>
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  {mlGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No groups found. Sync contacts first in CRM Settings.</p>
                  ) : (
                    mlGroups.map(g => (
                      <label key={g.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border/50 hover:bg-muted/20 cursor-pointer transition-colors">
                        <Checkbox
                          checked={selectedGroupIds.includes(g.id)}
                          onCheckedChange={() => toggleGroup(g.id)}
                        />
                        <div className="flex-1">
                          <span className="text-sm font-medium text-foreground">{g.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{g.active_count || 0} subscribers</span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>Filter by</Label>
                  <Select value={filterType} onValueChange={v => { setFilterType(v); setFilterValue(''); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Leads</SelectItem>
                      <SelectItem value="status">Status</SelectItem>
                      <SelectItem value="source">Source</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {filterType !== 'all' && (
                  <div>
                    <Label>Value</Label>
                    <Select value={filterValue} onValueChange={setFilterValue}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {filterOptions.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="bg-muted/30 rounded-lg p-3">
              <p className="text-sm font-medium text-foreground">{recipientCount} recipients</p>
              <p className="text-xs text-muted-foreground">will receive this campaign</p>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setStep(3)}>Next: Send</Button>
            </div>
          </TabsContent>

          {/* Step 3: Preview & Send */}
          <TabsContent value="3" className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4 space-y-2">
              <p className="text-xs text-muted-foreground">Subject</p>
              <p className="text-sm font-medium text-foreground">{subject}</p>
              <p className="text-xs text-muted-foreground mt-2">Recipients</p>
              <p className="text-sm text-foreground">
                {recipientCount} {isMailerLiteConnected ? 'subscribers' : 'leads'}
                {isMailerLiteConnected && selectedGroupIds.length > 0 && (
                  <span className="text-muted-foreground"> · {selectedGroupIds.length} group{selectedGroupIds.length !== 1 ? 's' : ''}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-2">Sending via</p>
              <p className="text-sm text-foreground">{isMailerLiteConnected ? 'MailerLite' : 'Local (not sent)'}</p>
              <p className="text-xs text-muted-foreground mt-2">Preview</p>
              <div className="bg-card border border-border rounded-lg p-3 text-sm prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: body }} />
            </div>
            <div className="flex items-center gap-3">
              <Select value={scheduleType} onValueChange={v => setScheduleType(v as 'now' | 'schedule')}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Send Now</SelectItem>
                  <SelectItem value="schedule">Schedule</SelectItem>
                </SelectContent>
              </Select>
              {scheduleType === 'schedule' && (
                <Input type="datetime-local" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-auto" />
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
              <Button
                className="bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white gap-1.5"
                disabled={isSending || (scheduleType === 'schedule' && !scheduleDate)}
                onClick={handleSend}
              >
                {isSending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isSending ? 'Sending...' : scheduleType === 'now' ? 'Send Now' : 'Schedule'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
