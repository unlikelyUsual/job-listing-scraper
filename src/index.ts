import { readFile } from "fs/promises";
import { closeDatabase } from "./config/database.js";
import type { ResumeData } from "./database/models.js";
import {
  dailyJobDiscovery,
  JobScrapingAutomation,
} from "./scraper/automation.js";
import { createJobScheduler } from "./services/scheduler.js";
import Logger from "./util/Logger.js";

const logger = new Logger();

async function test() {
  const resumeJson = await readFile("src/util/resume.json", "utf-8");
  const resumeData: ResumeData = JSON.parse(resumeJson);

  logger.debug(`👤 Loaded profile for: `, resumeData);

  // Create automation instance
  const automation = new JobScrapingAutomation(resumeData);
  await automation.initialize();
}

async function main() {
  logger.debug("🚀 Starting Job Listing Scraper...");

  try {
    // Load resume data
    const resumeJson = await readFile("src/util/resume.json", "utf-8");
    const resumeData: ResumeData = JSON.parse(resumeJson);

    logger.debug(`Loaded profile for: `, resumeData.data.name);

    // Create automation instance
    const automation = new JobScrapingAutomation(resumeData);

    // Check if we should run immediately or just start scheduler
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case "run":
        // Run immediately
        logger.debug("Running job scraping immediately...");
        await automation.initialize();
        const results = await automation.executeFullScrapingCycle();
        logger.debug("Scraping results:", results);
        await automation.cleanup();
        break;

      case "schedule":
        // Start scheduler only
        logger.debug("Starting scheduler mode...");
        const scheduler = createJobScheduler(async () => {
          const automation = new JobScrapingAutomation(resumeData);
          await automation.initialize();
          await automation.executeFullScrapingCycle();
          await automation.cleanup();
        });

        scheduler.start();
        logger.debug("✅ Scheduler started. Press Ctrl+C to stop.");

        // Keep the process running
        process.on("SIGINT", async () => {
          logger.debug("🛑 Shutting down gracefully...");
          scheduler.stop();
          await closeDatabase();
          process.exit(0);
        });

        // Keep alive
        setInterval(() => {
          // Just keep the process running
        }, 60000);
        break;

      case "status":
        // Show recent results
        logger.debug("📊 Fetching recent results...");
        await automation.initialize();
        const recentResults = await automation.getRecentResults();

        console.log("\n📈 Recent Scraping Sessions:");
        recentResults.sessions.forEach((session, index) => {
          console.log(
            `${index + 1}. ${session.session_date} - ${session.status}`
          );
          console.log(
            `   Jobs found: ${session.total_jobs_found || 0}, Top picks: ${
              session.top_jobs_selected || 0
            }`
          );
        });

        console.log("\n🏆 Recent Top Jobs:");
        recentResults.topJobs.slice(0, 10).forEach((job, index) => {
          console.log(
            `${index + 1}. ${job.title} at ${job.company} (Score: ${(
              job.score * 100
            ).toFixed(1)}%)`
          );
          console.log(`   ${job.job_url}`);
        });

        await automation.cleanup();
        break;

      case "test":
        // Test mode - run with limited scope
        logger.debug("🧪 Running in test mode...");
        process.env.HEADLESS_MODE = "false"; // Show browser for testing
        await automation.initialize();

        // Override to search fewer jobs for testing
        const originalMethod = automation.executeFullScrapingCycle;
        automation.executeFullScrapingCycle = async function () {
          logger.debug("🧪 Test mode: Limited scraping");
          // You could add test-specific logic here
          return originalMethod.call(this);
        };

        const testResults = await automation.executeFullScrapingCycle();
        logger.debug("🧪 Test results:", testResults);
        await automation.cleanup();
        break;

      default:
        // Default: run with scheduler
        logger.debug("Starting default mode (run once + scheduler)...");

        // Run once immediately
        await automation.initialize();
        const initialResults = await automation.executeFullScrapingCycle();
        logger.debug("📊 Initial scraping results:", initialResults);
        await automation.cleanup();

        // Then start scheduler for future runs
        const defaultScheduler = createJobScheduler(dailyJobDiscovery);
        defaultScheduler.start();

        logger.debug(
          "✅ Initial run completed. Scheduler started for future runs."
        );
        logger.debug(
          "💡 Use 'bun run src/index.ts schedule' to run scheduler only"
        );
        logger.debug("💡 Use 'bun run src/index.ts run' to run immediately");
        logger.debug(
          "💡 Use 'bun run src/index.ts status' to see recent results"
        );

        // Graceful shutdown
        process.on("SIGINT", async () => {
          logger.debug("🛑 Shutting down gracefully...");
          defaultScheduler.stop();
          await closeDatabase();
          process.exit(0);
        });

        // Keep alive
        setInterval(() => {
          // Just keep the process running
        }, 60000);
        break;
    }
  } catch (error) {
    logger.error("Application failed:", error);
    await closeDatabase();
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", async (error) => {
  logger.error("Uncaught Exception:", error);
  await closeDatabase();
  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  await closeDatabase();
  process.exit(1);
});

// Start the application
test().catch(async (error) => {
  logger.error("💥 Fatal error:", error);
  await closeDatabase();
  process.exit(1);
});
