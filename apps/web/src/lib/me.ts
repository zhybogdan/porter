import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { callApi } from './problem';

/**
 * The signed-in user, from `GET /me`.
 *
 * From the database and not from the token: the token says who the user was
 * when it was signed, the database says who they are now. Shared by the
 * header and by every page that shows a button only to a manager.
 */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => (await callApi(() => api.GET('/me'))).data,
  });
}
