import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

if (!process.env.PG_URI) {
  console.error("PG_URI is required.");
  process.exit(1);
}

const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() !== "false";

const pool = new Pool({ connectionString: process.env.PG_URI });

const run = async () => {
  const client = await pool.connect();

  try {
    const tables = ["pdf_chunks", "semantic_answer_cache"];

    for (const table of tables) {
      const exists = await client.query(
        `
          SELECT to_regclass($1) IS NOT NULL AS exists
        `,
        [table]
      );
      if (!exists.rows?.[0]?.exists) {
        console.log(`Skip: table ${table} not found`);
        continue;
      }

      const countRes = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      const count = countRes.rows?.[0]?.count ?? 0;
      console.log(`${table}: rows=${count}`);

      if (count === 0) continue;

      if (DRY_RUN) {
        console.log(`Dry run: would shift ${table}.class_date by +1 day`);
        continue;
      }

      await client.query(`UPDATE ${table} SET class_date = class_date + INTERVAL '1 day'`);
      console.log(`Updated: shifted ${table}.class_date by +1 day`);
    }
  } finally {
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error("Fix failed:", error.message);
  process.exit(1);
});

