import { Client } from "@notionhq/client";

/**
 * Create a Notion client for a specific user's access token.
 * Tokens are server-only and never exposed to the client.
 */
export function createNotionClient(accessToken: string): Client {
  return new Client({
    auth: accessToken,
    timeoutMs: 30_000,
  });
}

/* ------------------------------------------------------------------ */
/*  Rate-limit-aware request wrapper                                   */
/* ------------------------------------------------------------------ */

const INITIAL_BACKOFF_MS = 1000;
const MAX_RETRIES = 5;

export async function notionRequest<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  let attempt = 0;
  let backoff = INITIAL_BACKOFF_MS;

  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      const isRateLimit =
        err instanceof Object &&
        "code" in err &&
        (err as { code: string }).code === "rate_limited";
      const isTimeout =
        err instanceof Object &&
        "code" in err &&
        (err as { code: string }).code === "request_timeout";

      if ((isRateLimit || isTimeout) && attempt < retries) {
        // Use Retry-After header if available, else exponential backoff
        const retryAfterMs =
          err instanceof Object && "headers" in err
            ? parseInt(
                (err as { headers: Record<string, string> }).headers?.[
                  "retry-after"
                ] || "0",
                10
              ) * 1000
            : 0;
        const waitMs = Math.max(retryAfterMs, backoff);
        await sleep(waitMs);
        backoff *= 2;
        continue;
      }
      throw err;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Batched page query — handles Notion's pagination                   */
/*  Uses dataSources.query (Notion SDK v5+)                            */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFilter = any;

interface QueryDataSourceParams {
  database_id: string;
  filter?: AnyFilter;
  sorts?: AnyFilter;
  start_cursor?: string;
  page_size?: number;
}

export async function queryAllPages(
  client: Client,
  params: QueryDataSourceParams
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Array<any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: Array<any> = [];
  let cursor: string | undefined = params.start_cursor;
  let hasMore = true;

  while (hasMore) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryParams: any = {
      data_source_id: params.database_id,
      page_size: params.page_size || 100,
    };
    if (cursor) queryParams.start_cursor = cursor;
    if (params.filter) queryParams.filter = params.filter;
    if (params.sorts) queryParams.sorts = params.sorts;

    const response = await notionRequest(() =>
      client.dataSources.query(queryParams)
    );

    results.push(...response.results);
    hasMore = response.has_more;
    cursor = response.next_cursor ?? undefined;
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Fetch pages modified since a given time                            */
/* ------------------------------------------------------------------ */

export async function queryPagesSince(
  client: Client,
  databaseId: string,
  since: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Array<any>> {
  return queryAllPages(client, {
    database_id: databaseId,
    filter: {
      timestamp: "last_edited_time",
      last_edited_time: {
        on_or_after: since,
      },
    },
    sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
  });
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
