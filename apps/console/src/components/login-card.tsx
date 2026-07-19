'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login } from '@/lib/client';
import { Button, Callout, Field, Panel, Spinner, TextInput } from './ui';

const DEMO_EMAIL = 'demo@accesscore.dev';
const DEMO_PASSWORD = 'correct horse battery staple';

export function LoginCard() {
  const router = useRouter();
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
      setError('Invalid credentials. Check the email and password and try again.');
    } else if (result.status === 'unavailable') {
      setError('Authorization service unavailable. Please try again in a moment.');
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
        <h1 className="text-xl font-semibold tracking-tight">Sign in to the Console</h1>
        <p className="mt-1.5 text-sm text-muted">
          The demo account is prefilled. It owns{' '}
          <span className="font-mono">document:onboarding</span> and can use every console view.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label="Email">
            <TextInput
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
          <Field label="Password">
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
              Reset to demo
            </Button>
            <Button type="submit" disabled={pending} className="min-w-28">
              {pending ? <Spinner /> : 'Log in'}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
