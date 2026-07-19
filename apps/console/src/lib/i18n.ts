import { dictionaries } from './dictionaries';

export const AC_LANG_COOKIE = 'ac_lang';

export type Locale = 'en' | 'es';

export const LOCALES: Locale[] = ['en', 'es'];
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

export type Vars = Record<string, string | number>;
export type Translate = (key: string, vars?: Vars) => string;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  return interpolate(template, vars);
}

export function translator(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars);
}
