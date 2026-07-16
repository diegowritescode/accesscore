import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { Button } from '@/components/ui';

const features = [
  {
    title: 'Check',
    body: 'Ask one question — can this subject perform this action on this resource? Get permit or deny back, with an explainable trail of reason codes.',
  },
  {
    title: 'Expand',
    body: 'Walk the relationship graph the other way. List every subject that resolves into a relation across role aliases, nested groups, and hierarchy.',
  },
  {
    title: 'Simulate',
    body: 'Preview a policy change before shipping it. Compare the live decision against a proposed policy overlay, side by side, with a changed flag.',
  },
];

const capabilities = [
  ['ReBAC', 'Zanzibar-style relationship tuples with computed and tuple-to-userset rewrites.'],
  ['RBAC', 'Roles modelled as relations and resolved through the same graph.'],
  ['ABAC', 'Attribute conditions on the principal and environment, evaluated per request.'],
  ['Consistency', 'Optional zookie tokens for read-your-writes freshness guarantees.'],
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--color-brand)_28%,transparent),transparent)]"
          />
          <div className="mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
            <span className="inline-flex items-center rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted">
              Identity &amp; Access Management
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
              A live, explainable authorization engine.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
              AccessCore decides who can do what — and shows its work. Hybrid ReBAC, RBAC, and ABAC
              in a single policy decision point: relationship graphs, roles, and attribute
              conditions resolved in one call.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/playground">
                <Button className="px-5 py-2.5 text-base">Open the Playground</Button>
              </Link>
              <a href="https://auth.deviego.xyz/reference" target="_blank" rel="noreferrer">
                <Button variant="secondary" className="px-5 py-2.5 text-base">
                  Read the API reference
                </Button>
              </a>
            </div>
            <p className="mt-6 text-sm text-muted">
              A portfolio demo backed by a live API. Sign in with the seeded demo account —
              credentials are prefilled on the Playground.
            </p>
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
            <h2 className="text-xl font-semibold tracking-tight">One engine, three models</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              Most systems bolt these together. AccessCore resolves them in a single evaluation and
              returns the reasons behind every decision.
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
            <h2 className="text-xl font-semibold tracking-tight">Token-safe by design</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              This console is a backend-for-frontend. The browser never touches an access token —
              the Next.js server holds the session in an httpOnly cookie and proxies every
              authorization call to the AccessCore API server-side.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-8 text-sm text-muted sm:flex-row">
          <span>AccessCore — portfolio demo.</span>
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
