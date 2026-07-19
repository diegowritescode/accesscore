import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LoginCard } from '@/components/login-card';
import { Logo } from '@/components/logo';
import { AC_TOKEN_COOKIE } from '@/lib/accesscore';

export default async function LoginPage() {
  const store = await cookies();
  if (store.get(AC_TOKEN_COOKIE)?.value) {
    redirect('/console');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <Logo className="h-8 w-8" />
        <span className="text-base font-semibold tracking-tight">
          AccessCore <span className="text-muted">Console</span>
        </span>
      </Link>
      <LoginCard />
      <Link href="/" className="mt-6 text-sm text-muted transition-colors hover:text-fg">
        ← Back to home
      </Link>
    </div>
  );
}
