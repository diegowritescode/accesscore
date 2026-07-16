import { cookies } from 'next/headers';
import { LoginCard } from '@/components/login-card';
import { Playground } from '@/components/playground/playground';
import { SiteHeader } from '@/components/site-header';
import { AC_TOKEN_COOKIE } from '@/lib/accesscore';

export default async function PlaygroundPage() {
  const store = await cookies();
  const authed = Boolean(store.get(AC_TOKEN_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader authed={authed} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {authed ? <Playground /> : <LoginCard />}
      </main>
    </div>
  );
}
