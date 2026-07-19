import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui';
import { getT } from '@/lib/i18n-server';

export default async function LandingPage() {
  const t = await getT();

  const features = [
    { title: t('landing.featureCheckTitle'), body: t('landing.featureCheckBody') },
    { title: t('landing.featureExpandTitle'), body: t('landing.featureExpandBody') },
    { title: t('landing.featureSimulateTitle'), body: t('landing.featureSimulateBody') },
  ];

  const capabilities: [string, string][] = [
    ['ReBAC', t('landing.rebacDesc')],
    ['RBAC', t('landing.rbacDesc')],
    ['ABAC', t('landing.abacDesc')],
    [t('landing.consistencyTerm'), t('landing.consistencyDesc')],
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--color-brand)_18%,transparent),transparent)]"
          />
          <div className="mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
            <span className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted">
              {t('landing.badge')}
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              {t('landing.title')}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              {t('landing.subtitle')}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/console">
                <Button className="px-5 py-2.5 text-base">{t('landing.openConsole')}</Button>
              </Link>
              <a href="https://auth.deviego.xyz/reference" target="_blank" rel="noreferrer">
                <Button variant="secondary" className="px-5 py-2.5 text-base">
                  {t('landing.readApi')}
                </Button>
              </a>
            </div>
            <p className="mt-6 text-sm text-muted">{t('landing.demoNote')}</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-8">
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-line-strong"
              >
                <h2 className="text-lg font-semibold text-fg">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-2xl border border-line bg-surface p-8">
            <h2 className="text-xl font-semibold tracking-tight">{t('landing.modelsTitle')}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {t('landing.modelsBody')}
            </p>
            <dl className="mt-8 grid gap-6 sm:grid-cols-2">
              {capabilities.map(([term, description]) => (
                <div key={term} className="border-l-2 border-brand/50 pl-4">
                  <dt className="font-mono text-sm font-semibold text-brand-strong">{term}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted">{description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="rounded-2xl border border-line bg-surface-2 p-8">
            <h2 className="text-xl font-semibold tracking-tight">{t('landing.tokenSafeTitle')}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {t('landing.tokenSafeBody')}
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted sm:flex-row">
          <span>{t('landing.footer')}</span>
          <a
            href="https://auth.deviego.xyz/reference"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-fg"
          >
            auth.deviego.xyz/reference
          </a>
        </div>
      </footer>
    </div>
  );
}
