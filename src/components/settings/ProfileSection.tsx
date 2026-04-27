import { useState, useEffect, useRef } from 'react';
import { User, Upload, Trash2, Loader2, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * The "complete profile" used across Dealzflow + the CRM.
 *
 * Source of truth: `public.profiles` (one row per user). Headshot is stored
 * in the public `avatars` storage bucket under `<user-id>/headshot.<ext>`
 * so it can be loaded by anything that needs a public URL — email
 * signatures, lead detail headers, the right-rail avatar, etc.
 */
export default function ProfileSection() {
  const { user } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const update = useUpdateProfile();

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '');
      setTitle(profile.title ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  const initials =
    (fullName || user?.email || '?')
      .split(/[\s@]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || '?';

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file (PNG, JPG, etc.)');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error('Headshot must be smaller than 3 MB');
      return;
    }
    if (!user) return;
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${user.id}/headshot.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      await update.mutateAsync({ avatar_url: url });
      toast.success('Headshot updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    try {
      const { data: list } = await supabase.storage.from('avatars').list(user.id);
      if (list && list.length > 0) {
        await supabase.storage
          .from('avatars')
          .remove(list.map((f) => `${user.id}/${f.name}`));
      }
    } catch { /* non-fatal */ }
    await update.mutateAsync({ avatar_url: null });
  };

  const handleSave = () => {
    update.mutate(
      {
        full_name: fullName.trim() || null,
        title: title.trim() || null,
        phone: phone.trim() || null,
      },
      { onSuccess: () => toast.success('Profile saved') },
    );
  };

  if (isLoading) return null;

  return (
    <Card className="rounded-[10px] lg:rounded-xl">
      <CardHeader className="flex flex-row items-center gap-2 px-3 sm:px-6">
        <User className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <CardTitle className="text-base sm:text-lg">Your Profile</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Used across Dealzflow and the CRM — your headshot, name and contact info appear in
            email signatures, lead pages, and your team directory.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 px-3 sm:px-6">
        {/* Headshot */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="h-24 w-24 ring-2 ring-border/60">
            <AvatarImage
              src={profile?.avatar_url ?? undefined}
              alt={fullName || 'Profile'}
              className="object-cover object-center"
            />
            <AvatarFallback className="text-base font-semibold bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-2 flex-1 min-w-0">
            <div>
              <Label className="text-sm font-medium">Headshot</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Square image works best. Max 3 MB.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarUpload(f);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="h-3.5 w-3.5 mr-1.5" /> {profile?.avatar_url ? 'Replace' : 'Upload'}</>
                )}
              </Button>
              {profile?.avatar_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Identity fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Full name</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Uzair Muhammad"
              className="min-h-[44px] sm:min-h-0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Job title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Realtor • Presale Properties"
              className="min-h-[44px] sm:min-h-0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(604) 555-0123"
              className="min-h-[44px] sm:min-h-0"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              Email
            </Label>
            <Input
              value={user?.email ?? ''}
              disabled
              className="min-h-[44px] sm:min-h-0 bg-muted/40 text-muted-foreground"
            />
            <p className="text-[11px] text-muted-foreground">Login email — change in account security.</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={update.isPending} className="min-h-[44px] sm:min-h-0">
            {update.isPending ? 'Saving…' : 'Save Profile'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
