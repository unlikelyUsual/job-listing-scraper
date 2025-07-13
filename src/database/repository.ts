import { pool } from "../config/database.js";
import type {
  JobListing,
  PreferredSite,
  ScrapingSession,
  SearchQuery,
} from "./models.js";

export class JobRepository {
  // Create a new scraping session
  async createSession(
    sessionData: Omit<ScrapingSession, "id">
  ): Promise<number> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO scraping_sessions (session_date, search_queries, status) 
         VALUES ($1, $2, $3) RETURNING id`,
        [
          sessionData.session_date,
          sessionData.search_queries,
          sessionData.status || "running",
        ]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  // Update scraping session
  async updateSession(
    sessionId: number,
    updates: Partial<ScrapingSession>
  ): Promise<void> {
    const client = await pool.connect();
    try {
      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.total_jobs_found !== undefined) {
        setClause.push(`total_jobs_found = $${paramIndex++}`);
        values.push(updates.total_jobs_found);
      }
      if (updates.top_jobs_selected !== undefined) {
        setClause.push(`top_jobs_selected = $${paramIndex++}`);
        values.push(updates.top_jobs_selected);
      }
      if (updates.status !== undefined) {
        setClause.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }
      if (updates.completed_at !== undefined) {
        setClause.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completed_at);
      }
      if (updates.error_message !== undefined) {
        setClause.push(`error_message = $${paramIndex++}`);
        values.push(updates.error_message);
      }

      if (setClause.length > 0) {
        values.push(sessionId);
        await client.query(
          `UPDATE scraping_sessions SET ${setClause.join(
            ", "
          )} WHERE id = $${paramIndex}`,
          values
        );
      }
    } finally {
      client.release();
    }
  }

  // Insert job listing
  async insertJobListing(job: Omit<JobListing, "id">): Promise<number> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO job_listings 
         (title, company, company_url, job_url, description, requirements, tech_stack, 
          salary_range, location, posted_date, score, session_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
         ON CONFLICT (job_url) DO UPDATE SET
         title = EXCLUDED.title,
         company = EXCLUDED.company,
         description = EXCLUDED.description,
         score = EXCLUDED.score,
         updated_at = CURRENT_TIMESTAMP
         RETURNING id`,
        [
          job.title,
          job.company,
          job.company_url,
          job.job_url,
          job.description,
          job.requirements,
          job.tech_stack,
          job.salary_range,
          job.location,
          job.posted_date,
          job.score,
          job.session_id,
        ]
      );
      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  // Mark jobs as top picks
  async markTopPicks(jobIds: number[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE job_listings SET is_top_pick = TRUE WHERE id = ANY($1)`,
        [jobIds]
      );
    } finally {
      client.release();
    }
  }

  // Get top jobs for a session
  async getTopJobsForSession(
    sessionId: number,
    limit: number = 5
  ): Promise<JobListing[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM job_listings 
         WHERE session_id = $1 
         ORDER BY score DESC, scraped_at DESC 
         LIMIT $2`,
        [sessionId, limit]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Get all jobs for a session
  async getJobsForSession(sessionId: number): Promise<JobListing[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM job_listings WHERE session_id = $1 ORDER BY score DESC`,
        [sessionId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Get recent sessions
  async getRecentSessions(limit: number = 10): Promise<ScrapingSession[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM scraping_sessions ORDER BY session_date DESC LIMIT $1`,
        [limit]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Get preferred sites
  async getPreferredSites(): Promise<PreferredSite[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM preferred_sites WHERE is_active = TRUE ORDER BY name`
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  // Log search query
  async logSearchQuery(query: SearchQuery): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO search_queries (query, site, results_count, session_id) 
         VALUES ($1, $2, $3, $4)`,
        [query.query, query.site, query.results_count, query.session_id]
      );
    } finally {
      client.release();
    }
  }

  // Check if job URL already exists
  async jobExists(jobUrl: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT id FROM job_listings WHERE job_url = $1`,
        [jobUrl]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  // Get last scraping session date
  async getLastScrapingDate(): Promise<Date | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT MAX(session_date) as last_date FROM scraping_sessions WHERE status = 'completed'`
      );
      return result.rows[0].last_date || null;
    } finally {
      client.release();
    }
  }
}

export const jobRepository = new JobRepository();
