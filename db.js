import "dotenv/config";
import { Pool, types } from "pg";

// Keep PostgreSQL DATE values as YYYY-MM-DD strings.
types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});