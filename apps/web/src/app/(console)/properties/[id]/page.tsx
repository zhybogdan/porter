'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { PropertyForm } from '@/components/property-form';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { ApiProblem } from '@/lib/problem';
import { getProperty, propertyKeys, updateProperty, type PropertyFormValues } from '@/lib/properties';

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const [reloadedAfterConflict, setReloadedAfterConflict] = useState(false);

  const building = useQuery({
    queryKey: propertyKeys.detail(id),
    queryFn: () => getProperty(id),
    // Not refetched behind the user's back while they edit. The form keeps
    // the version it was opened with either way -- that is the point of
    // If-Match -- but a form that silently reloaded would throw away what
    // they typed.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // A missing building does not appear on a second try.
    retry: (count, error) => !(error instanceof ApiProblem && error.status === 404) && count < 1,
  });

  const isManager = me.data?.role === 'manager';
  const title = building.data?.property.name ?? 'Building';

  async function save(
    etag: string,
    _values: PropertyFormValues,
    changed: Partial<PropertyFormValues>,
  ): Promise<void> {
    const saved = await updateProperty(id, etag, changed);
    queryClient.setQueryData(propertyKeys.detail(id), saved);
    await queryClient.invalidateQueries({ queryKey: propertyKeys.list });
    router.push('/properties');
  }

  async function loadLatest(): Promise<void> {
    await building.refetch();
    setReloadedAfterConflict(true);
  }

  const backLink = (
    <Button variant="ghost" asChild>
      <Link href="/properties">{isManager ? 'Cancel' : 'Back to buildings'}</Link>
    </Button>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">{title}</h1>

      {(building.isPending || building.isFetching) && !building.isError && (
        <p className="text-muted-foreground">Loading the building…</p>
      )}

      {building.isError && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-destructive">
            {building.error instanceof ApiProblem && building.error.status === 404
              ? 'This building does not exist, or it is not one of yours.'
              : building.error.message}
          </p>
          {backLink}
        </div>
      )}

      {/* Shown only once the fetch has settled, and rebuilt after every fetch:
          the values on screen and the version sent back always come from the
          same answer. */}
      {building.data && !building.isFetching && isManager && (
        <>
          {reloadedAfterConflict && (
            <p role="status" className="rounded-md border p-4 text-sm">
              This is the latest version. Your earlier changes were not saved; make them again if
              they are still needed.
            </p>
          )}
          <PropertyForm
            key={building.dataUpdatedAt}
            initial={{
              name: building.data.property.name,
              address: building.data.property.address,
              timezone: building.data.property.timezone,
            }}
            submitLabel="Save changes"
            onSubmit={(values, changed) => save(building.data.etag, values, changed)}
            renderProblem={(problem) =>
              problem.status === 412 ? (
                <div className="flex flex-col items-start gap-3">
                  <p>
                    Someone changed this building while you were editing it, so your changes were
                    not saved. Load the latest version to see what they changed.
                  </p>
                  {/* `type="button"`: this sits inside the form, where a button
                      without a type submits it -- the stale values would go
                      out once more and earn a second 412. */}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void loadLatest()}
                  >
                    Load the latest version
                  </Button>
                </div>
              ) : (
                problem.message
              )
            }
            cancel={backLink}
          />
        </>
      )}

      {building.data && me.data && !isManager && (
        <>
          <dl className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <dt className="text-muted-foreground">Address</dt>
            <dd>{building.data.property.address}</dd>
            <dt className="text-muted-foreground">Time zone</dt>
            <dd>{building.data.property.timezone}</dd>
          </dl>
          <div>{backLink}</div>
        </>
      )}
    </>
  );
}
