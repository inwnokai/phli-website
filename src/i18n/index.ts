import { th } from './th';
import { en, type Copy } from './en';

export type Lang = 'th' | 'en';
export type PageKey = 'home' | 'healthCheck' | 'demo' | 'security' | 'investors' | 'privacy';

export const langs: Lang[] = ['th', 'en'];

const slugs: Record<PageKey, string> = {
  home: '',
  healthCheck: 'health-check/',
  demo: 'demo/',
  security: 'security/',
  investors: 'investors/',
  privacy: 'privacy/',
};

export function t(lang: Lang): Copy {
  return lang === 'en' ? en : th;
}

/** Thai lives at the root, English under /en/. */
export function href(lang: Lang, page: PageKey, hash = ''): string {
  const base = lang === 'en' ? '/en/' : '/';
  return base + slugs[page] + hash;
}

export function other(lang: Lang): Lang {
  return lang === 'en' ? 'th' : 'en';
}
