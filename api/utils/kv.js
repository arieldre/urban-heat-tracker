/**
 * KV storage layer: Upstash Redis (primary) + Vercel Blob (backup).
 * Reads hit KV first; on miss they fall back to blob and backfill KV.
 * Writes go to KV, then fire-and-forget to blob as backup.
 */
import { Redis } from '@upstash/redis';
import { list, put } from '@vercel/blob';

// Singleton — reuse the same connection across requests in the same function instance.
let _redis = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      url:   process.env.KV_REST_API_URL?.trim(),
      token: process.env.KV_REST_API_TOKEN?.trim(),
    });
  }
  return _redis;
}

// 'creatives/dashboard.json' → 'creatives:dashboard'
function toKvKey(blobKey) {
  return blobKey.replace(/\//g, ':').replace(/\.json$/, '');
}

async function readBlob(blobKey) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const { blobs } = await list({ prefix: blobKey, token });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

async function writeBlob(blobKey, data) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return;
  try {
    await put(blobKey, JSON.stringify(data), {
      access: 'private', contentType: 'application/json', allowOverwrite: true, token,
    });
  } catch (e) {
    console.error('[blob-backup] write failed for', blobKey, ':', e.message);
  }
}

/**
 * Read from KV. Falls back to blob on miss/error; backfills KV from blob.
 * @param {string} blobKey  e.g. 'creatives/dashboard.json'
 */
export async function kvGet(blobKey) {
  const kvKey = toKvKey(blobKey);
  try {
    const val = await getRedis().get(kvKey);
    if (val != null) return val;
  } catch (e) {
    console.error('[kv] read error, falling back to blob:', e.message);
  }
  const data = await readBlob(blobKey);
  if (data != null) {
    getRedis().set(kvKey, data).catch(e => console.error('[kv] backfill failed:', e.message));
  }
  return data;
}

/**
 * Write to KV (primary) and blob (fire-and-forget backup).
 * @param {string} blobKey  e.g. 'creatives/dashboard.json'
 * @param {*}      data     JSON-serialisable value
 */
export async function kvSet(blobKey, data) {
  const kvKey = toKvKey(blobKey);
  await getRedis().set(kvKey, data);
  writeBlob(blobKey, data).catch(e => console.error('[blob-backup] kvSet failed for', blobKey, ':', e.message));
}
