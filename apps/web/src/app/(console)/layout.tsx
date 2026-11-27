'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { setAccessToken } from '@/lib/session';

/** The frame of every signed-in page: who is signed in, and the way out. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();

  async function signOut(): Promise<void> {
    await fetch('/session/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    queryClient.clear();
    router.replace('/login');
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <nav aria-label="Main" className="flex items-center gap-6">
          <Link href="/properties" className="text-xl font-semibold">
            Porter
          </Link>
          <Link href="/properties" className="text-sm underline-offset-4 hover:underline">
            Buildings
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          {me.data && (
            <p className="text-right text-sm leading-tight">
              <span className="block">{me.data.fullName}</span>
              <span className="text-muted-foreground capitalize">{me.data.role}</span>
            </p>
          )}
          <Button variant="outline" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex flex-col gap-6">{children}</main>
    </div>
  );
}
