import pg from "pg";
import { assertNoSupplierDsn } from "./mounts.mjs";

let pool;

export function getPool(envMap = process.env) {
  if (pool) return pool;
  const url = String(envMap.DATABASE_URL || "").trim();
  if (!url) throw new Error("DATABASE_URL is required");
  assertNoSupplierDsn(envMap);
  pool = new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

export async function pingDb(envMap = process.env) {
  const url = String(envMap.DATABASE_URL || "").trim();
  if (!url) return { db: "unset" };
  assertNoSupplierDsn(envMap);
  const client = await getPool(envMap).connect();
  try {
    const r = await client.query("SELECT current_database() AS db");
    return { db: "connected", name: r.rows[0]?.db || null };
  } finally {
    client.release();
  }
}
