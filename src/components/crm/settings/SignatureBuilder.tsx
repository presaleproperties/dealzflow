import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, X, Phone, Mail, Globe, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SignatureBuilderData {
  photo_url: string;
  full_name: string;
  title: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  social_instagram: string;
  social_facebook: string;
  social_linkedin: string;
  social_tiktok: string;
  social_youtube: string;
}

const EMPTY_DATA: SignatureBuilderData = {
  photo_url: '', full_name: '', title: '', company: '',
  phone: '', email: '', website: '', address: '',
  social_instagram: '', social_facebook: '', social_linkedin: '',
  social_tiktok: '', social_youtube: '',
};

interface Props {
  initialData?: SignatureBuilderData | null;
  senderName?: string;
  onChange: (html: string, data: SignatureBuilderData) => void;
}

export function generateSignatureHtml(d: SignatureBuilderData): string {
  const gold = '#D4A843';
  const socialIcons: { key: keyof SignatureBuilderData; label: string; icon: string }[] = [
    { key: 'social_instagram', label: 'Instagram', icon: 'https://cdn.simpleicons.org/instagram/D4A843' },
    { key: 'social_facebook', label: 'Facebook', icon: 'https://cdn.simpleicons.org/facebook/D4A843' },
    { key: 'social_linkedin', label: 'LinkedIn', icon: 'https://cdn.simpleicons.org/linkedin/D4A843' },
    { key: 'social_tiktok', label: 'TikTok', icon: 'https://cdn.simpleicons.org/tiktok/D4A843' },
    { key: 'social_youtube', label: 'YouTube', icon: 'https://cdn.simpleicons.org/youtube/D4A843' },
  ];

  const activeSocials = socialIcons.filter(s => d[s.key]);

  const contactRows = [
    d.phone ? `<tr><td style="padding:2px 8px 2px 0;vertical-align:middle;"><img src="https://cdn.simpleicons.org/phone/888888" alt="phone" width="14" height="14" style="display:block;"/></td><td style="padding:2px 0;font-size:13px;color:#666666;font-family:Arial,sans-serif;">${d.phone}</td></tr>` : '',
    d.email ? `<tr><td style="padding:2px 8px 2px 0;vertical-align:middle;"><img src="https://cdn.simpleicons.org/gmail/888888" alt="email" width="14" height="14" style="display:block;"/></td><td style="padding:2px 0;font-size:13px;color:#666666;font-family:Arial,sans-serif;"><a href="mailto:${d.email}" style="color:#666666;text-decoration:none;">${d.email}</a></td></tr>` : '',
    d.website ? `<tr><td style="padding:2px 8px 2px 0;vertical-align:middle;"><img src="https://cdn.simpleicons.org/googlechrome/888888" alt="web" width="14" height="14" style="display:block;"/></td><td style="padding:2px 0;font-size:13px;color:#666666;font-family:Arial,sans-serif;"><a href="https://${d.website.replace(/^https?:\/\//, '')}" style="color:#666666;text-decoration:none;">${d.website.replace(/^https?:\/\//, '')}</a></td></tr>` : '',
    d.address ? `<tr><td style="padding:2px 8px 2px 0;vertical-align:middle;"><img src="https://cdn.simpleicons.org/googlemaps/888888" alt="address" width="14" height="14" style="display:block;"/></td><td style="padding:2px 0;font-size:13px;color:#666666;font-family:Arial,sans-serif;">${d.address}</td></tr>` : '',
  ].filter(Boolean).join('');

  const socialsHtml = activeSocials.length > 0
    ? `<tr><td colspan="2" style="padding-top:8px;">${activeSocials.map(s => `<a href="${d[s.key]}" style="display:inline-block;margin-right:8px;" target="_blank"><img src="${s.icon}" alt="${s.label}" width="18" height="18" style="display:inline-block;"/></a>`).join('')}</td></tr>`
    : '';

  const photoHtml = d.photo_url
    ? `<td style="vertical-align:top;padding-right:14px;"><img src="${d.photo_url}" alt="${d.full_name}" width="70" height="70" style="border-radius:50%;object-fit:cover;display:block;"/></td>`
    : '';

  return `<table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;"><tr>${photoHtml}<td style="vertical-align:top;"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="font-size:16px;font-weight:bold;color:#222222;padding-bottom:2px;font-family:Arial,sans-serif;">${d.full_name || ''}</td></tr>${d.title ? `<tr><td style="font-size:13px;color:#555555;padding-bottom:1px;font-family:Arial,sans-serif;">${d.title}</td></tr>` : ''}${d.company ? `<tr><td style="font-size:13px;color:#555555;padding-bottom:6px;font-family:Arial,sans-serif;">${d.company}</td></tr>` : ''}<tr><td style="border-top:2px solid ${gold};padding-top:6px;"></td></tr>${contactRows}${socialsHtml}</table></td></tr></table>`;
}

export default function SignatureBuilder({ initialData, senderName, onChange }: Props) {
  const [data, setData] = useState<SignatureBuilderData>(() => {
    if (initialData) return { ...EMPTY_DATA, ...initialData };
    return { ...EMPTY_DATA, full_name: senderName || '' };
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    onChange(generateSignatureHtml(data), data);
  }, [data]);

  const update = useCallback((field: keyof SignatureBuilderData, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${session.user.id}/headshot-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('crm-assets').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('crm-assets').getPublicUrl(path);
      update('photo_url', urlData.publicUrl);
      toast.success('Photo uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => update('photo_url', '');

  const fields: { key: keyof SignatureBuilderData; label: string; placeholder: string }[] = [
    { key: 'full_name', label: 'Full Name', placeholder: 'Uzair Muhammad' },
    { key: 'title', label: 'Title / Role', placeholder: 'Licensed Realtor' },
    { key: 'company', label: 'Company', placeholder: 'The Presale Properties Group' },
    { key: 'phone', label: 'Phone', placeholder: '604-767-6862' },
    { key: 'email', label: 'Email', placeholder: 'uzair@presaleproperties.com' },
    { key: 'website', label: 'Website', placeholder: 'presaleproperties.com' },
    { key: 'address', label: 'Address (optional)', placeholder: '123 Main St, Vancouver, BC' },
  ];

  const socialFields: { key: keyof SignatureBuilderData; label: string; placeholder: string }[] = [
    { key: 'social_instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
    { key: 'social_facebook', label: 'Facebook', placeholder: 'https://facebook.com/...' },
    { key: 'social_linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
    { key: 'social_tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
    { key: 'social_youtube', label: 'YouTube', placeholder: 'https://youtube.com/@...' },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left — Form */}
      <div className="space-y-3">
        {/* Photo upload */}
        <div className="space-y-1.5">
          <Label>Headshot / Photo</Label>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar className="h-20 w-20">
                {data.photo_url ? (
                  <AvatarImage src={data.photo_url} alt="Headshot" />
                ) : (
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <Camera className="h-6 w-6" />
                  </AvatarFallback>
                )}
              </Avatar>
              {data.photo_url && (
                <button
                  onClick={removePhoto}
                  className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground h-5 w-5 flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <div>
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <label className="cursor-pointer">
                  {uploading ? 'Uploading…' : data.photo_url ? 'Replace' : 'Upload Photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </Button>
              <p className="text-[11px] text-muted-foreground mt-1">Max 2MB · JPG, PNG</p>
            </div>
          </div>
        </div>

        {fields.map(f => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            <Input
              value={data[f.key]}
              onChange={e => update(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="h-9 text-sm"
            />
          </div>
        ))}

        <div className="pt-2 space-y-2">
          <Label className="text-xs font-semibold">Social Links</Label>
          {socialFields.map(f => (
            <div key={f.key} className="space-y-0.5">
              <Label className="text-[11px] text-muted-foreground">{f.label}</Label>
              <Input
                value={data[f.key]}
                onChange={e => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Right — Live Preview */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Live Preview</Label>
        <div className="rounded-lg border border-border/40 bg-white p-5 min-h-[200px]">
          <div dangerouslySetInnerHTML={{ __html: generateSignatureHtml(data) }} />
        </div>
      </div>
    </div>
  );
}
