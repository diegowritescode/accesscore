'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logout } from '@/lib/client';
import { Button } from './ui';
import { Logo } from './logo';

export function SiteHeader({ authed = false }: { authed?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await logout();
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b border-line/70 bg-ink/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="text-sm font-semibold tracking-tight">
            AccessCore <span className="text-muted">Playground</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <a
            href="https://auth.deviego.xyz/reference"
            target="_blank"
            rel="noreferrer"
            className="hidden rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-fg sm:inline-block"
          >
            API reference
          </a>
          {authed ? (
            <Button variant="secondary" onClick={handleLogout} disabled={pending}>
              {pending ? 'Signing out…' : 'Log out'}
            </Button>
          ) : (
            <Link href="/playground">
              <Button variant="secondary">Open playground</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
