import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { Pool } from "pg";

import Chat from "../src/models/Chat.js";
import Document from "../src/models/Document.js";
import LocationLog from "../src/models/LocationLog.js";
import User from "../src/models/User.js";

dotenv.config();

const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() !== "false";
const CONFIRM = (process.env.CONFIRM || "").toUpperCase();
const FLUSH_USERS = (process.env.FLUSH_USERS || "false").toLowerCase() === "true";
const FLUSH_UPLOADS = (process.env.FLUSH_UPLOADS || "true").toLowerCase() !== "false";

const cacheDir = path.resolve(process.cwd(), process.env.LANGCACHE_DIR || "./.cache");
const uploadsDir = path.resolve(process.cwd(), "uploads");

const requireEnv = (key) => {
  if (!process.env[key]) {
    throw new Error(`${key} is required`);
  }
  return process.env[key];
};

const log = (msg) => console.log(msg);

const rmDirIfExists = async (dirPath) => {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
};

const flushPg = async () => {
  const pgUri = requireEnv("PG_URI");
  const pool = new Pool({ connectionString: pgUri });
  const client = await pool.connect();

  try {
    const tables = ["pdf_chunks", "semantic_answer_cache"];
    for (const table of tables) {
      if (DRY_RUN) {
        log(`[dry] Postgres: TRUNCATE ${table}`);
        continue;
      }
      await client.query(`TRUNCATE TABLE ${table}`);
      log(`Postgres: truncated ${table}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
};

const flushMongo = async () => {
  const mongoUri = requireEnv("MONGO_URI");

  if (DRY_RUN) {
    log("[dry] MongoDB: deleteMany on Chat, Document, LocationLog" + (FLUSH_USERS ? ", User" : ""));
    return;
  }

  await mongoose.connect(mongoUri);
  log("MongoDB connected");

  try {
    await Promise.all([
      Chat.deleteMany({}),
      Document.deleteMany({}),
      LocationLog.deleteMany({})
    ]);
    log("MongoDB: cleared Chat, Document, LocationLog");

    if (FLUSH_USERS) {
      await User.deleteMany({});
      log("MongoDB: cleared User");
    }
  } finally {
    await mongoose.disconnect();
  }
};

const flushDisk = async () => {
  if (DRY_RUN) {
    log(`[dry] Disk: remove ${cacheDir}`);
    if (FLUSH_UPLOADS) log(`[dry] Disk: remove ${uploadsDir}`);
    return;
  }

  const removedCache = await rmDirIfExists(cacheDir);
  log(`Disk: removed cache dir ${cacheDir} (${removedCache ? "ok" : "missing"})`);

  if (FLUSH_UPLOADS) {
    const removedUploads = await rmDirIfExists(uploadsDir);
    log(`Disk: removed uploads dir ${uploadsDir} (${removedUploads ? "ok" : "missing"})`);
  }
};

const main = async () => {
  log(`DRY_RUN=${DRY_RUN} FLUSH_USERS=${FLUSH_USERS} FLUSH_UPLOADS=${FLUSH_UPLOADS}`);

  if (!DRY_RUN && CONFIRM !== "YES") {
    throw new Error('Refusing to run destructive flush. Re-run with CONFIRM=YES (and optionally DRY_RUN=false).');
  }

  await flushDisk();
  await flushPg();
  await flushMongo();

  log("Done.");
};

main().catch((error) => {
  console.error("Flush failed:", error.message);
  process.exit(1);
});

