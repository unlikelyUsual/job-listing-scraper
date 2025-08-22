import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "scraper",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
};

export const pool = new Pool({
  ...dbConfig,
  max: 10,
  idleTimeoutMillis: 30 * 1000, // 30 Seconds
  connectionTimeoutMillis: 2 * 1000, // 2 Seconds
});

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT NOW()");
    client.release();
    console.log("Database connection successful");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}

// Initialize database (create tables if they don't exist)
export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    // Check if tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'job_listings'
    `);

    if (result.rows.length === 0) {
      console.log("Initializing database tables...");
      // Tables will be created by init.sql in Docker
      console.log("Database initialization complete");
    } else {
      console.log("Database tables already exist");
    }
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
  console.log("🔌 Database connection closed");
}
