import { en } from './en';
import { zh } from './zh';
import { ja } from './ja';

type Translations = typeof en;
const dicts: Record<string, Translations> = { en, zh, ja };

export function t(path: string, lang: string = 'en'): string {
  const dict = dicts[lang] || en;
  const keys = path.split('.');

  let current: any = dict;
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = current[key];
    } else {
      // Fallback to English if key not found in current language
      if (lang !== 'en') {
        return t(path, 'en');
      }
      return path; // Return key path if not found in English either
    }
  }

  return typeof current === 'string' ? current : path;
}
