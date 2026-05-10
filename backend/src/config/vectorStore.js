import { Pool } from "pg";

const VECTOR_SIZE = Number(process.env.GEMINI_EMBEDDING_DIMENSIONS || 3072);

let pool;

const getPool = () => {
  if (!pool) {
    if (!process.env.PG_URI) {
      throw new Error("PG_URI is required for pgvector storage");
    }

    pool = new Pool({
      connectionString: process.env.PG_URI
    });
  }

  return pool;
};

const embeddingToLiteral = (embedding) => {
  return `[${embedding.join(",")}]`;
};

export const connectVectorStore = async () => {
  const client = await getPool().connect();

  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`
      CREATE TABLE IF NOT EXISTS pdf_chunks (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        subject_key TEXT NOT NULL,
        class_date DATE NOT NULL,
        file_name TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${VECTOR_SIZE}) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS pdf_chunks_lookup_idx
      ON pdf_chunks (teacher_id, subject_key, class_date)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS pdf_chunks_subject_date_idx
      ON pdf_chunks (subject_key, class_date)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS semantic_answer_cache (
        id TEXT PRIMARY KEY,
        subject_key TEXT NOT NULL,
        class_date DATE NOT NULL,
        model TEXT NOT NULL,
        intent_key TEXT NOT NULL DEFAULT '',
        question TEXT NOT NULL,
        embedding vector(${VECTOR_SIZE}) NOT NULL,
        answer TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      DO $$
      BEGIN
        ALTER TABLE semantic_answer_cache
          ADD COLUMN intent_key TEXT NOT NULL DEFAULT '';
      EXCEPTION
        WHEN duplicate_column THEN NULL;
      END $$;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS semantic_answer_cache_lookup_idx
      ON semantic_answer_cache (subject_key, class_date, model)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS semantic_answer_cache_intent_idx
      ON semantic_answer_cache (subject_key, class_date, model, intent_key)
    `);
  } finally {
    client.release();
  }

  console.log("pgvector connected");
};

export const insertPdfChunks = async (rows) => {
  if (rows.length === 0) return;

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    for (const row of rows) {
      await client.query(
        `
          INSERT INTO pdf_chunks (
            id,
            teacher_id,
            document_id,
            subject,
            subject_key,
            class_date,
            file_name,
            chunk_index,
            content,
            embedding
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector)
        `,
        [
          row.id,
          row.teacherId,
          row.documentId,
          row.subject,
          row.subjectKey,
          row.classDate,
          row.fileName,
          row.chunkIndex,
          row.text,
          embeddingToLiteral(row.vector)
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const deletePdfChunksByDocument = async (documentId) => {
  await getPool().query("DELETE FROM pdf_chunks WHERE document_id = $1", [
    documentId
  ]);
};

export const searchPdfChunks = async ({
  subjectKey,
  classDate,
  questionVector,
  limit = 5
}) => {
  const params = [subjectKey, classDate, embeddingToLiteral(questionVector), limit];
  const result = await getPool().query(
    `
      SELECT
        id,
        teacher_id AS "teacherId",
        document_id AS "documentId",
        subject,
        subject_key AS "subjectKey",
        class_date AS "classDate",
        file_name AS "fileName",
        chunk_index AS "chunkIndex",
        content AS text
      FROM pdf_chunks
      WHERE subject_key = $1
        AND class_date = $2
      ORDER BY embedding <=> $3::vector
      LIMIT $4
    `,
    params
  );

  return result.rows;
};

export const listPdfChunksForClass = async ({
  subjectKey,
  classDate,
  limit = Number(process.env.QUIZ_CONTEXT_CHUNKS || 18)
}) => {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 18));
  const result = await getPool().query(
    `
      SELECT
        id,
        content AS text,
        chunk_index AS "chunkIndex"
      FROM pdf_chunks
      WHERE subject_key = $1
        AND class_date = $2
      ORDER BY chunk_index ASC
      LIMIT $3
    `,
    [subjectKey, classDate, safeLimit]
  );

  return result.rows;
};

export const searchSemanticAnswerCache = async ({
  subjectKey,
  classDate,
  model,
  intentKey = "",
  questionVector,
  maxDistance = Number(process.env.SEMANTIC_CACHE_MAX_DISTANCE || 0.12)
}) => {
  const result = await getPool().query(
    `
      SELECT
        id,
        question,
        answer,
        (embedding <=> $4::vector) AS distance
      FROM semantic_answer_cache
      WHERE subject_key = $1
        AND class_date = $2
        AND model = $3
        AND intent_key = $5
      ORDER BY embedding <=> $4::vector
      LIMIT 1
    `,
    [subjectKey, classDate, model, embeddingToLiteral(questionVector), intentKey]
  );

  const row = result.rows?.[0];
  if (!row) return null;
  const distance = Number(row.distance);
  if (!Number.isFinite(distance)) return null;
  if (distance > maxDistance) return null;

  return { ...row, distance };
};

export const searchSemanticAnswerCacheByQuestion = async ({
  subjectKey,
  classDate,
  model,
  intentKey = "",
  question
}) => {
  const result = await getPool().query(
    `
      SELECT
        id,
        question,
        answer
      FROM semantic_answer_cache
      WHERE subject_key = $1
        AND class_date = $2
        AND model = $3
        AND intent_key = $4
        AND question = $5
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [subjectKey, classDate, model, intentKey, question]
  );

  return result.rows?.[0] || null;
};

export const insertSemanticAnswerCache = async ({
  id,
  subjectKey,
  classDate,
  model,
  intentKey = "",
  question,
  questionVector,
  answer
}) => {
  await getPool().query(
    `
      INSERT INTO semantic_answer_cache (
        id,
        subject_key,
        class_date,
        model,
        intent_key,
        question,
        embedding,
        answer
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      id,
      subjectKey,
      classDate,
      model,
      intentKey,
      question,
      embeddingToLiteral(questionVector),
      answer
    ]
  );
};
