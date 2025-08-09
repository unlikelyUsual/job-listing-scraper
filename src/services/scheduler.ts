import cron from "node-cron";
import { jobRepository } from "../database/repository.js";
import Logger from "../util/Logger.js";

const logger = new Logger();

export interface SchedulerConfig {
  intervalDays: number;
  enabled: boolean;
  timezone?: string;
}

export class JobScrapingScheduler {
  protected config: SchedulerConfig;
  private task: cron.ScheduledTask | null = null;
  private onScrapingTrigger: () => Promise<void>;

  constructor(
    onScrapingTrigger: () => Promise<void>,
    config: SchedulerConfig = {
      intervalDays: parseInt(process.env.SCRAPING_INTERVAL_DAYS || "3"),
      enabled: true,
      timezone: "Asia/Kolkata",
    }
  ) {
    this.onScrapingTrigger = onScrapingTrigger;
    this.config = config;
  }

  start(): void {
    if (!this.config.enabled) {
      logger.debug("📅 Scheduler is disabled");
      return;
    }

    // Calculate cron expression for every N days at 9 AM
    const cronExpression = this.calculateCronExpression();

    logger.debug(`📅 Starting scheduler with expression: ${cronExpression}`);
    logger.debug(
      `⏰ Next run will be every ${this.config.intervalDays} days at 9:00 AM`
    );

    this.task = cron.schedule(
      cronExpression,
      async () => {
        try {
          logger.debug("🚀 Scheduled job scraping triggered");
          await this.executeScrapingJob();
        } catch (error) {
          logger.error("❌ Scheduled scraping failed:", error);
        }
      },
      {
        scheduled: true,
        timezone: this.config.timezone,
      }
    );

    logger.debug("✅ Job scraping scheduler started");
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.debug("🛑 Job scraping scheduler stopped");
    }
  }

  async executeScrapingJob(): Promise<void> {
    try {
      // Check if we should run based on last scraping date
      const shouldRun = await this.shouldRunScraping();

      if (!shouldRun) {
        logger.debug("⏭️ Skipping scraping - too soon since last run");
        return;
      }

      logger.debug("🎯 Executing scheduled job scraping...");
      await this.onScrapingTrigger();
      logger.debug("✅ Scheduled job scraping completed");
    } catch (error) {
      logger.error("❌ Error during scheduled scraping:", error);
      throw error;
    }
  }

  private async shouldRunScraping(): Promise<boolean> {
    try {
      const lastScrapingDate = await jobRepository.getLastScrapingDate();

      if (!lastScrapingDate) {
        logger.debug("🆕 No previous scraping found - running first time");
        return true;
      }

      const now = new Date();
      const daysSinceLastRun = Math.floor(
        (now.getTime() - lastScrapingDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      logger.debug(`📊 Days since last scraping: ${daysSinceLastRun}`);

      return daysSinceLastRun >= this.config.intervalDays;
    } catch (error) {
      logger.error("❌ Error checking last scraping date:", error);
      // If we can't check, assume we should run
      return true;
    }
  }

  private calculateCronExpression(): string {
    // Run every N days at 9:00 AM
    // Since cron doesn't support "every N days" directly, we'll use a different approach
    // For now, we'll run daily and check if we should actually execute
    return "0 9 * * *"; // Every day at 9:00 AM, but we'll check shouldRunScraping()
  }

  // Manual trigger for testing or immediate execution
  async triggerManualScraping(): Promise<void> {
    logger.debug("🔧 Manual scraping triggered");
    try {
      await this.executeScrapingJob();
    } catch (error) {
      logger.error("❌ Manual scraping failed:", error);
      throw error;
    }
  }

  // Get next scheduled run time
  getNextRunTime(): Date | null {
    if (!this.task) {
      return null;
    }

    try {
      // This is a simplified calculation - in a real implementation,
      // you might want to use a more sophisticated scheduling library
      const now = new Date();
      const nextRun = new Date(now);
      nextRun.setDate(nextRun.getDate() + this.config.intervalDays);
      nextRun.setHours(9, 0, 0, 0);

      return nextRun;
    } catch (error) {
      logger.error("❌ Error calculating next run time:", error);
      return null;
    }
  }

  // Get scheduler status
  getStatus(): {
    enabled: boolean;
    intervalDays: number;
    isRunning: boolean;
    nextRunTime: Date | null;
    lastRunTime: Date | null;
  } {
    return {
      enabled: this.config.enabled,
      intervalDays: this.config.intervalDays,
      isRunning: this.task !== null,
      nextRunTime: this.getNextRunTime(),
      lastRunTime: null, // This would need to be tracked separately
    };
  }

  // Update scheduler configuration
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    const wasRunning = this.task !== null;

    if (wasRunning) {
      this.stop();
    }

    this.config = { ...this.config, ...newConfig };

    if (wasRunning && this.config.enabled) {
      this.start();
    }

    logger.debug("🔧 Scheduler configuration updated:", this.config);
  }
}

// Utility function to create a scheduler with default configuration
export function createJobScheduler(
  onScrapingTrigger: () => Promise<void>
): JobScrapingScheduler {
  return new JobScrapingScheduler(onScrapingTrigger);
}

// Advanced scheduler that can handle multiple intervals
export class AdvancedJobScheduler extends JobScrapingScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();

  // Add multiple scheduled tasks
  addScheduledTask(
    name: string,
    cronExpression: string,
    taskFunction: () => Promise<void>
  ): void {
    if (this.tasks.has(name)) {
      logger.debug(`⚠️ Task ${name} already exists, stopping previous task`);
      this.tasks.get(name)?.stop();
    }

    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          logger.debug(`🚀 Executing scheduled task: ${name}`);
          await taskFunction();
          logger.debug(`✅ Completed scheduled task: ${name}`);
        } catch (error) {
          logger.error(`❌ Task ${name} failed:`, error);
        }
      },
      {
        scheduled: true,
        timezone: this.config.timezone,
      }
    );

    this.tasks.set(name, task);
    logger.debug(`📅 Added scheduled task: ${name} (${cronExpression})`);
  }

  // Remove a scheduled task
  removeScheduledTask(name: string): boolean {
    const task = this.tasks.get(name);
    if (task) {
      task.stop();
      this.tasks.delete(name);
      logger.debug(`🗑️ Removed scheduled task: ${name}`);
      return true;
    }
    return false;
  }

  // Stop all tasks
  stopAll(): void {
    super.stop();

    for (const [name, task] of this.tasks) {
      task.stop();
      logger.debug(`🛑 Stopped task: ${name}`);
    }

    this.tasks.clear();
    logger.debug("🛑 All scheduled tasks stopped");
  }

  // Get all active tasks
  getActiveTasks(): string[] {
    return Array.from(this.tasks.keys());
  }
}
