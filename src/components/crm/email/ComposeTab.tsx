import { useState, useMemo } from 'react';
import { Send, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RichTextEditor } from './RichTextEditor';
import { useCrmContacts } from '@/hooks/useCrmContacts';
import { useCrmEmailTemplates } from '@/hooks/useCrmEmail';
import { useAddCrmMessage } from '@/hooks/useCrmLeadDetail';
import type { CrmContact } from '@/hooks/useCrmContacts';

export function ComposeTab() {
  const { data: contacts = [] } = useCrmContacts();
  const { data: templates = [] } = useCrmEmailTemplates();
  const addMessage = useAddCrmMessage();

  const [searchTo, setSearchTo] = useState('');
  const [selectedContact, setSelectedContact] = useState<CrmContact | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [toOpen, setToOpen] = useState(false);

  const filteredContacts = useMemo(() => {
    if (!searchTo) return contacts.slice(0, 10);
    const q = searchTo.toLowerCase();
    return contacts.filter(c =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [contacts, searchTo]);

  const loadTemplate = (id: string) => {
    const tpl = templates.find(t => t.id === id);
    if (tpl) {
      setSubject(tpl.subject);
      setBody(tpl.body_html ?? '');
    }
  };

  const handleSend = async () => {
    if (!selectedContact || !subject.trim() || !body.trim()) return;
    await addMessage.mutateAsync({
      contact_id: selectedContact.id,
      direction: 'outbound',
      content: `Subject: ${subject}\n\n${body}`,
      channel: 'email',
      sent_by: 'Agent',
      message_type: 'text',
    });
    setSelectedContact(null);
    setSearchTo('');
    setSubject('');
    setBody('');
  };

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-base font-semibold text-foreground">Compose Email</h2>

      {/* To */}
      <div>
        <Label>To</Label>
        <Popover open={toOpen} onOpenChange={setToOpen}>
          <PopoverTrigger asChild>
            <div className="relative cursor-pointer">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={selectedContact ? `${selectedContact.first_name} ${selectedContact.last_name} <${selectedContact.email ?? 'no email'}>` : searchTo}
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
                <div
                  key={c.id}
                  className="px-3 py-2.5 sm:py-2 hover:bg-muted/50 cursor-pointer text-sm min-h-[44px] sm:min-h-0 flex items-center"
                  onClick={() => { setSelectedContact(c); setToOpen(false); }}
                >
                  <span className="font-medium text-foreground">{c.first_name} {c.last_name}</span>
                  {c.email && <span className="text-muted-foreground ml-2 truncate">{c.email}</span>}
                </div>
              ))}
              {filteredContacts.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground text-center">No contacts found</p>}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Template selector */}
      {templates.length > 0 && (
        <div>
          <Label>Template (optional)</Label>
          <Select onValueChange={loadTemplate}>
            <SelectTrigger className="min-h-[44px] sm:min-h-0"><SelectValue placeholder="Load a template..." /></SelectTrigger>
            <SelectContent>
              {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Subject */}
      <div>
        <Label>Subject *</Label>
        <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject" maxLength={200} className="min-h-[44px] sm:min-h-0" />
      </div>

      {/* Body */}
      <div>
        <Label>Body *</Label>
        <RichTextEditor content={body} onChange={setBody} />
      </div>

      {/* Send button — full width on mobile, sticky */}
      <div className="flex justify-end sm:static sticky bottom-0 pb-3 sm:pb-0 pt-2 bg-background sm:bg-transparent">
        <Button
          className="gap-1.5 bg-[hsl(39_67%_55%)] hover:bg-[hsl(39_67%_48%)] text-white w-full sm:w-auto min-h-[44px]"
          disabled={!selectedContact || !subject.trim() || !body.trim() || addMessage.isPending}
          onClick={handleSend}
        >
          <Send className="w-4 h-4" /> {addMessage.isPending ? 'Sending...' : 'Send Email'}
        </Button>
      </div>
    </div>
  );
}
