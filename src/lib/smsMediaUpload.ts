// Upload helper for MMS / WhatsApp media. Returns public URLs that Twilio can fetch.
// Files are stored in the `crm-sms-media` bucket under `outbound/<userId>/<timestamp>-<name>`.
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'crm-sms-media';
const MAX_BYTES = 5 * 1024 * 1024; // 5MB Twilio limit per attachment
const ALLOWED = /^(image|video|audio|application\/pdf)/;

export async function uploadSmsMedia(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id || 'anon';

  const urls: string[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      throw new Error(`${file.name} exceeds 5MB limit`);
    }
    if (!ALLOWED.test(file.type)) {
      throw new Error(`${file.name}: unsupported type (${file.type})`);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `outbound/${userId}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    // Use a signed URL (12h) — Twilio fetches the media at send time.
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60 * 12);

    if (signErr || !signed?.signedUrl) {
      throw new Error(signErr?.message || 'Could not generate media URL');
    }
    urls.push(signed.signedUrl);
  }

  return urls;
}
