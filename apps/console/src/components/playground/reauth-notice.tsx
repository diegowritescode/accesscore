'use client';

import { useRouter } from 'next/navigation';
import { logout } from '@/lib/client';
import { useT } from '../i18n/language-provider';
import { Button, Callout } from '../ui';

export function ReauthNotice() {
  const router = useRouter();
  const t = useT();

  async function handleReauth() {
    await logout();
    router.push('/login');
    router.refresh();
  }

  return (
    <Callout tone="warning">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{t('reauth.expired')}</span>
        <Button variant="secondary" onClick={handleReauth}>
          {t('reauth.loginAgain')}
        </Button>
      </div>
    </Callout>
  );
}
