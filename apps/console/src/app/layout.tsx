import type { Metadata } from 'next';
import { LanguageProvider } from '@/components/i18n/language-provider';
import { getLocale } from '@/lib/i18n-server';
import './globals.css';

export const metadata: Metadata = {
  title: 'AccessCore Console',
  description:
    'A live, explainable ReBAC + RBAC + ABAC authorization engine. Browse the schema and relationship graph, inspect policies, and check, expand, and simulate access decisions in real time.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">
        <LanguageProvider locale={locale}>{children}</LanguageProvider>
      </body>
    </html>
  );
}
