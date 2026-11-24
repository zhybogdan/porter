'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import type { components } from '@porter/contract';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { setAccessToken } from '@/lib/session';

type Problem = components['schemas']['ProblemDetail'];

class LoginError extends Error {}

async function logIn(credentials: { email: string; password: string }): Promise<string> {
  const response = await fetch('/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(credentials),
  }).catch(() => {
    throw new LoginError('The server could not be reached. Try again in a moment.');
  });

  if (response.ok) {
    return ((await response.json()) as { accessToken: string }).accessToken;
  }
  if (response.status === 401) {
    throw new LoginError('Wrong email or password.');
  }
  const problem = (await response.json().catch(() => null)) as Problem | null;
  throw new LoginError(problem?.detail ?? 'Something went wrong on the server. Try again.');
}

export default function LoginPage() {
  const router = useRouter();
  const login = useMutation({
    mutationFn: logIn,
    onSuccess: (token) => {
      setAccessToken(token);
      router.replace('/');
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    login.mutate({
      email: form.get('email') as string,
      password: form.get('password') as string,
    });
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>Sign in to Porter</h1>
          </CardTitle>
          <CardDescription>The console for building managers.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {login.error && (
              <p role="alert" className="text-sm text-destructive">
                {login.error.message}
              </p>
            )}
            <Button type="submit" disabled={login.isPending}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
