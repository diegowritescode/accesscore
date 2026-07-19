import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ConsoleShell } from '@/components/console/console-shell';
import { AC_TOKEN_COOKIE, AC_USER_COOKIE } from '@/lib/accesscore';
import { decodeIdentity } from '@/lib/identity';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get(AC_TOKEN_COOKIE)?.value;
  if (!token) {
    redirect('/login');
  }
  const email = store.get(AC_USER_COOKIE)?.value ?? null;
  const identity = decodeIdentity(token, email);

  return <ConsoleShell identity={identity}>{children}</ConsoleShell>;
}
