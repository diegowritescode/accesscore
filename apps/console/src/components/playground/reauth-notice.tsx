'use client';

import { useRouter } from 'next/navigation';
import { logout } from '@/lib/client';
import { Button, Callout } from '../ui';

export function ReauthNotice() {
  const router = useRouter();

  async function handleReauth() {
    await logout();
    router.refresh();
  }

  return (
    <Callout tone="warning">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>Your session has expired. Log in again to continue.</span>
        <Button variant="secondary" onClick={handleReauth}>
          Log in again
        </Button>
      </div>
    </Callout>
  );
}
