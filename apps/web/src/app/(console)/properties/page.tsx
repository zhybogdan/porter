'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMe } from '@/lib/me';
import { listProperties, propertyKeys } from '@/lib/properties';

export default function PropertiesPage() {
  const me = useMe();
  const isManager = me.data?.role === 'manager';

  // Pages by cursor: each answer names the next page and nothing more, so
  // there is no "page 3 of 7" to show, only "show more" until the API says
  // there is nothing left. The pages already loaded stay on screen.
  const buildings = useInfiniteQuery({
    queryKey: propertyKeys.list,
    queryFn: ({ pageParam }) => listProperties(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const rows = buildings.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Buildings</h1>
        {isManager && (
          <Button asChild>
            <Link href="/properties/new">Add a building</Link>
          </Button>
        )}
      </div>

      {buildings.isPending && <p className="text-muted-foreground">Loading buildings…</p>}

      {buildings.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
          <p>{buildings.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => void buildings.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {buildings.isSuccess && rows.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="font-medium">No buildings yet.</p>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? 'Add the first one, and its units and residents can follow.'
              : me.data?.role === 'resident'
                ? 'Once a manager moves you into a unit, its building shows up here.'
                : 'Buildings appear here once a manager adds them.'}
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead className="hidden sm:table-cell">Time zone</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((building) => (
              <TableRow key={building.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/properties/${building.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {building.name}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-normal">{building.address}</TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {building.timezone}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {buildings.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={buildings.isFetchingNextPage}
          onClick={() => void buildings.fetchNextPage()}
        >
          {buildings.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      )}
    </>
  );
}
