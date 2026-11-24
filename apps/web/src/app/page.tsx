'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { setAccessToken } from '@/lib/session';

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // The profile comes from `GET /me`, not from the token: the token says who
  // the user was when it was signed, the database says who they are now.
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data, error } = await api.GET('/me');
      if (!data) throw new Error(error?.detail ?? 'Could not load your profile.');
      return data;
    },
  });

  async function signOut(): Promise<void> {
    await fetch('/session/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    queryClient.clear();
    router.replace('/login');
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Porter</h1>
        <Button variant="outline" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>

      {me.isPending && <p className="text-muted-foreground">Loading your profile…</p>}

      {me.isError && (
        <p role="alert" className="text-destructive">
          {me.error.message}{' '}
          <Button variant="link" className="h-auto p-0" onClick={() => void me.refetch()}>
            Try again
          </Button>
        </p>
      )}

      {me.data && (
        <section aria-label="Your account" className="grid gap-1">
          <p className="text-lg">{me.data.fullName}</p>
          <p className="text-muted-foreground">
            {me.data.email} · <span className="capitalize">{me.data.role}</span>
          </p>
        </section>
      )}
    </main>
  );
}
