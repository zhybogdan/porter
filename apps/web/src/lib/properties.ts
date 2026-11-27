import type { components } from '@porter/contract';
import { z } from 'zod';
import { api } from './api';
import { ApiProblem, callApi } from './problem';

export type Property = components['schemas']['Property'];
type PropertyPage = components['schemas']['PropertyPage'];

/** A building together with the version it was read at. */
export interface VersionedProperty {
  property: Property;
  /** The `ETag` header: sent back as `If-Match` to change this building. */
  etag: string;
}

/**
 * Cache keys. The list and the single building are separate branches, so
 * saving a building can invalidate the list without also refetching the
 * building under a form that is still on screen.
 */
export const propertyKeys = {
  list: ['properties', 'list'] as const,
  detail: (id: string) => ['properties', 'detail', id] as const,
};

const PAGE_SIZE = 20;

export async function listProperties(cursor: string | undefined): Promise<PropertyPage> {
  const { data } = await callApi(() =>
    api.GET('/properties', { params: { query: { cursor, limit: PAGE_SIZE } } }),
  );
  return data;
}

function versioned(property: Property, response: Response): VersionedProperty {
  const etag = response.headers.get('ETag');
  // Every building response carries one. Without it the form could not save,
  // so this is said now rather than as a 428 after the user has typed.
  if (!etag) throw new ApiProblem(response.status, 'The server did not say which version this is.');
  return { property, etag };
}

export async function getProperty(id: string): Promise<VersionedProperty> {
  const { data, response } = await callApi(() =>
    api.GET('/properties/{id}', { params: { path: { id } } }),
  );
  return versioned(data, response);
}

export async function createProperty(values: PropertyFormValues): Promise<VersionedProperty> {
  const { data, response } = await callApi(() => api.POST('/properties', { body: values }));
  return versioned(data, response);
}

export async function updateProperty(
  id: string,
  etag: string,
  changes: Partial<PropertyFormValues>,
): Promise<VersionedProperty> {
  const { data, response } = await callApi(() =>
    api.PATCH('/properties/{id}', {
      params: { path: { id }, header: { 'If-Match': etag } },
      body: changes,
    }),
  );
  return versioned(data, response);
}

/**
 * What the form checks before it sends anything.
 *
 * A copy of the API's rules in `CreatePropertyDto`, kept here so a mistake is
 * shown as the user types instead of after a round trip. The API still checks
 * everything itself and stays the final word: if the two copies drift apart,
 * its 422 is shown next to the field the same way, so the worst case is a
 * later message, never a wrong save.
 */
export const propertyFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter the name of the building.')
    .max(200, 'Keep the name to 200 characters or fewer.'),
  address: z
    .string()
    .trim()
    .min(1, 'Enter the address.')
    .max(500, 'Keep the address to 500 characters or fewer.'),
  timezone: z.string().min(1, 'Choose the time zone of the building.'),
});

/** What the fields hold while the user types. */
export type PropertyFormInput = z.input<typeof propertyFormSchema>;
/** What the form hands over once the schema has passed it: trimmed. */
export type PropertyFormValues = z.output<typeof propertyFormSchema>;
export type PropertyFormFields = keyof PropertyFormValues;
export const PROPERTY_FIELDS: readonly PropertyFormFields[] = ['name', 'address', 'timezone'];
