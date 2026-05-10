import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), ".cache");

const CACHE_ENABLED =
  (process.env.LANGCACHE_ENABLED || process.env.CACHE_ENABLED || "true").toLowerCase() !==
  "false";

const CACHE_DIR = path.resolve(
  process.env.LANGCACHE_DIR || process.env.CACHE_DIR || DEFAULT_CACHE_DIR
);

const DEFAULT_TTL_SECONDS = Number(process.env.LANGCACHE_TTL_SECONDS || process.env.CACHE_TTL_SECONDS || 0);

const inMemory = new Map();

const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const nowMs = () => Date.now();

const isFresh = (createdAtMs, ttlSeconds) => {
  if (!ttlSeconds || ttlSeconds <= 0) return true;
  return nowMs() - createdAtMs <= ttlSeconds * 1000;
};

const readJsonIfExists = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const writeJsonAtomic = async (filePath, payload) => {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload), "utf8");
  await fs.rename(tmpPath, filePath);
};

export const getCachedValue = async ({
  namespace,
  keyParts,
  ttlSeconds = DEFAULT_TTL_SECONDS
}) => {
  if (!CACHE_ENABLED) return null;

  const key = `${namespace}:${sha256(JSON.stringify(keyParts))}`;

  const fromMem = inMemory.get(key);
  if (fromMem && isFresh(fromMem.createdAtMs, ttlSeconds)) {
    return fromMem.value;
  }

  const filePath = path.join(CACHE_DIR, namespace, `${sha256(key)}.json`);
  const payload = await readJsonIfExists(filePath);
  if (!payload) return null;
  if (!isFresh(payload.createdAtMs, ttlSeconds)) return null;

  inMemory.set(key, payload);
  return payload.value;
};

export const setCachedValue = async ({ namespace, keyParts, value }) => {
  if (!CACHE_ENABLED) return;

  const key = `${namespace}:${sha256(JSON.stringify(keyParts))}`;
  const filePath = path.join(CACHE_DIR, namespace, `${sha256(key)}.json`);
  const payload = { value, createdAtMs: nowMs() };

  inMemory.set(key, payload);
  await writeJsonAtomic(filePath, payload);
};

export const cacheEnabled = () => CACHE_ENABLED;
export const cacheDir = () => CACHE_DIR;
