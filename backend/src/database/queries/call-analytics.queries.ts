import type pg from 'pg';
import { pool, withTransaction } from '../pool.js';

const FILTER_CHUNK_SIZE = 10_000;

export interface LastCalledAtRow {
  remote_party_number: string;
  last_called_at: string | null;
}

export interface CallCountResult {
  call_count: string;
  filter_count: number;
}

/**
 * Last call timestamp per requested number.
 * Uses unnest + LEFT JOIN so every input number appears (null if never called).
 */
export async function getLastCalledAtByRemotePartyNumbers(
  remotePartyNumbers: string[]
): Promise<LastCalledAtRow[]> {
  const { rows } = await pool.query<LastCalledAtRow>(
    `
    SELECT
      f.remote_party_number,
      MAX(c.called_at)::text AS last_called_at
    FROM unnest($1::text[]) AS f(remote_party_number)
    LEFT JOIN call_analytics c ON c.remote_party_number = f.remote_party_number
    GROUP BY f.remote_party_number
    ORDER BY f.remote_party_number
    `,
    [remotePartyNumbers]
  );
  return rows;
}

async function loadFilterTempTable(
  client: pg.PoolClient,
  remotePartyNumbers: string[]
): Promise<number> {
  await client.query(`
    CREATE TEMP TABLE tmp_remote_party_filter (
      remote_party_number TEXT NOT NULL PRIMARY KEY
    ) ON COMMIT DROP
  `);

  for (let i = 0; i < remotePartyNumbers.length; i += FILTER_CHUNK_SIZE) {
    const chunk = remotePartyNumbers.slice(i, i + FILTER_CHUNK_SIZE);
    await client.query(
      `
      INSERT INTO tmp_remote_party_filter (remote_party_number)
      SELECT DISTINCT unnest($1::text[])
      ON CONFLICT (remote_party_number) DO NOTHING
      `,
      [chunk]
    );
  }

  const { rows } = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM tmp_remote_party_filter`
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Total call rows matching any of the filter numbers.
 * Temp table + hash join scales to millions of distinct filter values.
 */
export async function countCallsByRemotePartyNumbers(
  remotePartyNumbers: string[]
): Promise<CallCountResult> {
  return withTransaction(async (client) => {
    const filterCount = await loadFilterTempTable(client, remotePartyNumbers);

    const { rows } = await client.query<{ call_count: string }>(
      `
      SELECT COUNT(*)::text AS call_count
      FROM call_analytics c
      INNER JOIN tmp_remote_party_filter f
        ON f.remote_party_number = c.remote_party_number
      `
    );

    return {
      call_count: rows[0]?.call_count ?? '0',
      filter_count: filterCount,
    };
  });
}
