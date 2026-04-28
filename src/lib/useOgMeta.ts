// Inject Open Graph + Twitter card meta tags into <head>.
// Replaces existing tags with the same property/name so updates work.
import { useEffect } from 'react';

export interface OgMeta {
  title: string;
  description?: string;
  image?: string;
  url?: string;
}

function setMeta(attr: 'property' | 'name', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}='${key}']`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

export function useOgMeta({ title, description, image, url }: OgMeta) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (title) document.title = title;
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:type', 'website');
    if (description) {
      setMeta('property', 'og:description', description);
      setMeta('name', 'description', description);
    }
    if (image) {
      setMeta('property', 'og:image', image);
      setMeta('property', 'og:image:width', '1200');
      setMeta('property', 'og:image:height', '630');
      setMeta('name', 'twitter:image', image);
    }
    if (url) setMeta('property', 'og:url', url);
    setMeta('name', 'twitter:card', 'summary_large_image');
    if (title) setMeta('name', 'twitter:title', title);
    if (description) setMeta('name', 'twitter:description', description);
  }, [title, description, image, url]);
}
