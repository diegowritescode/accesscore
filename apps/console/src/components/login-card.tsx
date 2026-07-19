'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login } from '@/lib/client';
import { useT } from './i18n/language-provider';
import { Button, Callout, Field, Panel, Spinner, TextInput } from './ui';

const DEMO_EMAIL = 'demo@accesscore.dev';
const DEMO_PASSWORD = 'correct horse battery staple';

export function LoginCard() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await login(email, password);
    if (result.status === 'ok') {
      router.push('/console');
      router.refresh();
      return;
    }

    setPending(false);
    if (result.status === 'unauthorized') {
      setError(t('errors.invalidCredentials'));
    } else if (result.status === 'unavailable') {
      setError(t('errors.loginUnavailable'));
    } else {
      setError(result.message);
    }
  }

  function fillDemo() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-md">
      <Panel>
        <h1 className="text-xl font-semibold tracking-tight">{t('login.title')}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {t('login.subtitle', { resource: 'document:onboarding' })}
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label={t('login.email')}>
            <TextInput
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label={t('login.password')}>
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          {error ? <Callout tone="error">{error}</Callout> : null}

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={fillDemo} className="px-2">
              {t('login.resetDemo')}
            </Button>
            <Button type="submit" disabled={pending} className="min-w-28">
              {pending ? <Spinner /> : t('login.submit')}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
