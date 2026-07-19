import { cookies } from 'next/headers';
import {
  AC_LANG_COOKIE,
  DEFAULT_LOCALE,
  isLocale,
  translator,
  type Locale,
  type Translate,
} from './i18n';

export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(AC_LANG_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getT(): Promise<Translate> {
  return translator(await getLocale());
}
