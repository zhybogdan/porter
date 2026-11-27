'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PropertyForm } from '@/components/property-form';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/me';
import { createProperty, propertyKeys } from '@/lib/properties';
import { useTimeZones } from '@/lib/time-zones';

export default function NewPropertyPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const timeZones = useTimeZones();

  async function save(values: Parameters<typeof createProperty>[0]): Promise<void> {
    const created = await createProperty(values);
    // The new building is known in full, version included: an edit opened
    // right after needs no GET. The list is only marked stale, because where
    // the new row lands in it is the API's ordering to decide, not this page's.
    queryClient.setQueryData(propertyKeys.detail(created.property.id), created);
    await queryClient.invalidateQueries({ queryKey: propertyKeys.list });
    router.push('/properties');
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Add a building</h1>

      {me.data && me.data.role !== 'manager' && (
        <p className="text-muted-foreground">Only a manager can add buildings.</p>
      )}

      {me.data?.role === 'manager' && timeZones && (
        <PropertyForm
          initial={{ name: '', address: '', timezone: timeZones.current }}
          submitLabel="Add building"
          allowUnchanged
          onSubmit={save}
          cancel={
            <Button variant="ghost" asChild>
              <Link href="/properties">Cancel</Link>
            </Button>
          }
        />
      )}
    </>
  );
}
