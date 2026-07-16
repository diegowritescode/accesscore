'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { logout } from '@/lib/client';
import type { Identity } from '@/lib/identity';
import { Logo } from '../logo';
import {
  ExternalIcon,
  GraphIcon,
  LogoutIcon,
  OverviewIcon,
  PlaygroundIcon,
  PolicyIcon,
  SchemaIcon,
} from '../icons';
import { Badge, Spinner, cn } from '../ui';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { href: '/console', label: 'Overview', icon: OverviewIcon, exact: true },
  { href: '/console/schema', label: 'Schema', icon: SchemaIcon },
  { href: '/console/relationships', label: 'Relationships', icon: GraphIcon },
  { href: '/console/playground', label: 'Playground', icon: PlaygroundIcon },
  { href: '/console/policies', label: 'Policies', icon: PolicyIcon },
];

const API_REFERENCE = 'https://auth.deviego.xyz/reference';

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

export function ConsoleShell({
  identity,
  children,
}: {
  identity: Identity;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    setSigningOut(true);
    await logout();
    router.push('/login');
    router.refresh();
  }

  const who = identity.email ?? identity.subject;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <Link href="/console" className="flex items-center gap-2.5 px-5 py-5">
          <Logo className="h-7 w-7" />
          <span className="text-sm font-semibold tracking-tight">
            AccessCore <span className="text-muted">Console</span>
          </span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-soft text-brand-strong'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <a
          href={API_REFERENCE}
          target="_blank"
          rel="noreferrer"
          className="mx-3 mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <ExternalIcon className="h-[18px] w-[18px]" />
          API reference
        </a>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/85 px-5 backdrop-blur">
          <Link href="/console" className="flex items-center gap-2 md:hidden">
            <Logo className="h-6 w-6" />
            <span className="text-sm font-semibold">AccessCore</span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{who}</div>
              <div className="text-xs text-muted">Signed in</div>
            </div>
            {identity.aal !== null ? <Badge tone="brand">AAL {identity.aal}</Badge> : null}
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-60"
            >
              {signingOut ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <LogoutIcon className="h-[18px] w-[18px]" />
              )}
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-2 md:hidden">
          {NAV.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  active ? 'bg-brand-soft text-brand-strong' : 'text-muted hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-5 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
