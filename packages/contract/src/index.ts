import createClient, { type Client, type ClientOptions } from 'openapi-fetch';
import type { paths } from './schema.js';

/**
 * The Porter API as TypeScript sees it: every path, every status code and
 * every field, generated from `openapi.json` and never written by hand.
 *
 * Nothing here knows about tokens, refresh or error rendering. Those are
 * decisions of the application doing the calling -- the web console keeps its
 * tokens in one place and a script would keep them in another -- and a client
 * that made them here would have to be fought by every consumer that disagrees.
 */
export type PorterClient = Client<paths>;

export function createPorterClient(options: ClientOptions): PorterClient {
  return createClient<paths>(options);
}

export type { components, operations, paths } from './schema.js';
