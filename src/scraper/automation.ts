import { readFile } from "fs/promises";
import { initializeDatabase, testConnection } from "../config/database.js";
import type { ResumeData } from "../database/models.js";
import { jobRepository } from "../database/repository.js";
import { googleJobSearcher } from "../scrapers/google-search.js";
import { playwrightManager } from "../scrapers/playwright-manager.js";
import { ycJobSearcher } from "../scrapers/yc-search.js";
import { JobMatcher } from "../services/job-matcher.js";
import Logger from "../util/Logger.js";
import { JobParser, type JobDetails } from "./parser.js";

const logger = new Logger();

export class JobScrapingAutomation {
  private resumeData: ResumeData;
  private jobParser: JobParser;
  private jobMatcher: JobMatcher;

  constructor(resumeData: ResumeData) {
    this.resumeData = resumeData;
    this.jobParser = new JobParser(resumeData);
    this.jobMatcher = new JobMatcher(resumeData);
  }

  async initialize(): Promise<void> {
    const dbConnected = await testConnection();

    if (!dbConnected) {
      throw new Error("Failed to connect to database");
    }

    await initializeDatabase();

    await playwrightManager.initialize();

    logger.debug("Job scraping automation initialized");
  }

  async executeFullScrapingCycle(): Promise<{
    sessionId: number;
    totalJobsFound: number;
    topJobsSelected: number;
    averageScore: number;
  }> {
    logger.debug("Starting full job scraping cycle...");

    // Create new scraping session
    const sessionId = await jobRepository.createSession({
      session_date: new Date(),
      search_queries: this.resumeData.data.roles,
      status: "running",
    });

    try {
      logger.debug("Searching for jobs on Google...");
      const searchResults = await googleJobSearcher.searchAllRoles(
        this.resumeData,
        ["linkedin.com", "indeed.com", "ycombinator.com"]
      );

      logger.debug(`Found ${searchResults.length} job URLs from Google search`);

      // Step 2: Scrape detailed job information
      logger.debug("Scraping detailed job information...");
      const jobDetails = [];

      for (const searchResult of searchResults.slice(0, 50)) {
        // Limit to 50 jobs per session
        try {
          const context = await playwrightManager.createContext();
          const page = await playwrightManager.createPage(context);

          await page.goto(searchResult.url, { waitUntil: "networkidle" });
          const details = await this.jobParser.extractJobDetails(page);

          if (details) {
            jobDetails.push(details);
          }

          await playwrightManager.closeContext(context);

          // Add delay between requests to be respectful
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          logger.error(`Failed to scrape job: ${searchResult.url}`, error);
        }
      }

      logger.debug(`Successfully scraped ${jobDetails.length} job details`);

      // Step 3: Score and rank jobs
      logger.debug("Scoring and ranking jobs...");
      const scoredJobs = await this.jobMatcher.scoreMultipleJobs(jobDetails);
      const topJobs = this.jobMatcher.selectTopJobs(
        scoredJobs,
        parseInt(process.env.TOP_JOBS_COUNT || "5")
      );

      // Step 4: Save jobs to database
      logger.debug("Saving jobs to database...");
      const jobListings = this.jobMatcher.convertMultipleToJobListings(
        scoredJobs,
        sessionId
      );

      for (const jobListing of jobListings) {
        await jobRepository.insertJobListing(jobListing);
      }

      // Mark top jobs
      const topJobIds = [];
      for (const topJob of topJobs) {
        const jobListing = this.jobMatcher.convertToJobListing(
          topJob,
          sessionId
        );
        const jobId = await jobRepository.insertJobListing(jobListing);
        topJobIds.push(jobId);
      }

      await jobRepository.markTopPicks(topJobIds);

      // Update session with results
      await jobRepository.updateSession(sessionId, {
        total_jobs_found: scoredJobs.length,
        top_jobs_selected: topJobs.length,
        status: "completed",
        completed_at: new Date(),
      });

      // Generate report
      const report = this.jobMatcher.generateJobReport(scoredJobs);

      logger.debug("Scraping cycle completed successfully!");
      logger.debug(
        `Results: ${report.totalJobs} jobs found, ${topJobs.length} top picks selected`
      );
      logger.debug(`Average score: ${(report.averageScore * 100).toFixed(1)}%`);

      return {
        sessionId,
        totalJobsFound: report.totalJobs,
        topJobsSelected: topJobs.length,
        averageScore: report.averageScore,
      };
    } catch (error) {
      logger.error("Scraping cycle failed:", error);

      // Update session with error
      await jobRepository.updateSession(sessionId, {
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date(),
      });

      throw error;
    }
  }

  async scrapeYCJobs(): Promise<{
    sessionId: number;
    totalJobsFound: number;
    topJobsSelected: number;
    averageScore: number;
  }> {
    logger.debug(`Started scraping for YC Job board`);

    const sessionId = await jobRepository.createSession({
      session_date: new Date(),
      search_queries: this.resumeData.data.roles,
      status: "running",
    });

    try {
      logger.debug("Searching for jobs on YC Job board...");

      const searchResults: JobDetails[] = await ycJobSearcher.searchRole(
        this.resumeData.data.roles
      );

      logger.debug(`Found ${searchResults.length} job URLs from YC Job board`);

      // Step 2: Scrape detailed job information
      logger.debug("Scraping detailed job information...");

      // Step 3: Score and rank jobs
      logger.debug("Scoring and ranking jobs...");

      const scoredJobs = await this.jobMatcher.scoreMultipleJobs(searchResults);
      const topJobs = this.jobMatcher.selectTopJobs(
        scoredJobs,
        parseInt(process.env.TOP_JOBS_COUNT || "5")
      );

      // Step 4: Save jobs to database
      logger.debug("Saving jobs to database...");

      const jobListings = this.jobMatcher.convertMultipleToJobListings(
        scoredJobs,
        sessionId
      );

      await jobRepository.insertJobListings(jobListings);

      // Mark top jobs
      const topJobIds = await jobRepository.insertJobListings(topJobs);

      await jobRepository.markTopPicks(topJobIds);

      // Update session with results
      await jobRepository.updateSession(sessionId, {
        total_jobs_found: scoredJobs.length,
        top_jobs_selected: topJobs.length,
        status: "completed",
        completed_at: new Date(),
      });

      // Generate report
      const report = this.jobMatcher.generateJobReport(scoredJobs);

      logger.debug("Scraping cycle completed successfully!");

      logger.debug(
        `Results: ${report.totalJobs} jobs found, ${topJobs.length} top picks selected`
      );
      logger.debug(`Average score: ${(report.averageScore * 100).toFixed(1)}%`);

      return {
        sessionId,
        totalJobsFound: report.totalJobs,
        topJobsSelected: topJobs.length,
        averageScore: report.averageScore,
      };
    } catch (error) {
      logger.error("Scraping cycle failed:", error);

      // Update session with error
      await jobRepository.updateSession(sessionId, {
        status: "failed",
        error_message: error instanceof Error ? error.message : String(error),
        completed_at: new Date(),
      });

      throw error;
    }
  }

  async cleanup(): Promise<void> {
    logger.debug("Cleaning up resources...");
    await playwrightManager.closeAll();
    logger.debug("Cleanup completed");
  }

  // Get recent scraping results
  async getRecentResults(limit: number = 5): Promise<{
    sessions: any[];
    topJobs: any[];
  }> {
    const sessions = await jobRepository.getRecentSessions(limit);
    const topJobs = [];

    for (const session of sessions) {
      const sessionJobs = await jobRepository.getTopJobsForSession(session.id!);
      topJobs.push(...sessionJobs);
    }

    return { sessions, topJobs };
  }
}

// Legacy function for backward compatibility
export async function dailyJobDiscovery(): Promise<void> {
  try {
    // Load resume data
    const resumeJson = await readFile("src/util/resume.json", "utf-8");
    const resumeData: ResumeData = JSON.parse(resumeJson);

    // Create automation instance
    const automation = new JobScrapingAutomation(resumeData);

    // Initialize and run
    await automation.initialize();
    const results = await automation.executeFullScrapingCycle();

    logger.debug("Daily job discovery completed:", results);

    // Cleanup
    await automation.cleanup();
  } catch (error) {
    logger.error("Daily job discovery failed:", error);
    throw error;
  }
}
