import crypto from "crypto";
import type { JobListing, ResumeData } from "../database/models.js";
import { GeminiClient } from "../llm/gemini-client.js";
import type { JobDetails } from "../scraper/parser.js";
import Logger from "../util/Logger.js";
import { connectRedis, redisClient } from "../util/redis-client.js";

const logger = new Logger();

export interface ScoredJob extends JobDetails {
  score: number;
  matchReasons: string[];
}

export class JobMatcher {
  private resumeData: ResumeData;
  private gemini: GeminiClient;

  constructor(resumeData: ResumeData) {
    this.resumeData = resumeData;
    this.gemini = new GeminiClient();
  }

  async scoreJob(jobDetails: JobDetails): Promise<ScoredJob> {
    // Create a hash key from resumeData and jobDetails
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(this.resumeData) + JSON.stringify(jobDetails))
      .digest("hex");
    const redisKey = `gemini:score:${hash}`;

    await connectRedis();
    // Try to get from Redis
    const cached = await redisClient.get(redisKey);
    if (cached) {
      const { score, matchReasons } = JSON.parse(cached);
      return {
        ...jobDetails,
        score,
        matchReasons,
      };
    }

    // Call Gemini LLM to get score and match reasons
    const { score, matchReasons } = await this.gemini.scoreJob(
      this.resumeData,
      jobDetails
    );

    // Cache result in Redis (set TTL to 7 days)
    await redisClient.set(redisKey, JSON.stringify({ score, matchReasons }), {
      EX: 60 * 60 * 24 * 7,
    });

    return {
      ...jobDetails,
      score,
      matchReasons,
    };
  }

  async scoreMultipleJobs(jobs: JobDetails[]): Promise<ScoredJob[]> {
    logger.debug(`🎯 Scoring ${jobs.length} jobs with Gemini...`);
    const scoredJobs = await Promise.all(jobs.map((job) => this.scoreJob(job)));
    scoredJobs.sort((a, b) => b.score - a.score);
    logger.debug(
      `✅ Jobs scored. Top score: ${scoredJobs[0]?.score.toFixed(2) || "N/A"}`
    );
    return scoredJobs;
  }

  selectTopJobs(scoredJobs: ScoredJob[], count: number = 5): ScoredJob[] {
    const minScore = parseFloat(process.env.MIN_SCORE_THRESHOLD || "0.3");
    const qualifiedJobs = scoredJobs.filter((job) => job.score >= minScore);

    if (qualifiedJobs.length === 0) {
      logger.debug(`⚠️ No jobs meet minimum score threshold of ${minScore}`);
      return scoredJobs.slice(0, count);
    }

    const topJobs = qualifiedJobs.slice(0, count);
    logger.debug(
      `🏆 Selected ${topJobs.length} top jobs (min score: ${minScore})`
    );
    return topJobs;
  }

  convertToJobListing(
    scoredJob: ScoredJob,
    sessionId: number
  ): Omit<JobListing, "id"> {
    return {
      title: scoredJob.title,
      company: scoredJob.company,
      company_url: scoredJob.company_url,
      job_url: scoredJob.job_url,
      description: scoredJob.description,
      requirements: scoredJob.requirements,
      tech_stack: scoredJob.tech_stack,
      salary_range: scoredJob.salary_range,
      location: scoredJob.location,
      posted_date: scoredJob.posted_date,
      score: scoredJob.score,
      session_id: sessionId,
      scraped_at: new Date(),
    };
  }

  convertMultipleToJobListings(
    scoredJobs: ScoredJob[],
    sessionId: number
  ): Omit<JobListing, "id">[] {
    return scoredJobs.map((job) => this.convertToJobListing(job, sessionId));
  }

  generateJobReport(scoredJobs: ScoredJob[]): {
    totalJobs: number;
    averageScore: number;
    topTechStack: string[];
    topCompanies: string[];
    locationDistribution: Record<string, number>;
    scoreDistribution: {
      excellent: number;
      good: number;
      fair: number;
      poor: number;
    };
  } {
    if (scoredJobs.length === 0) {
      return {
        totalJobs: 0,
        averageScore: 0,
        topTechStack: [],
        topCompanies: [],
        locationDistribution: {},
        scoreDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
      };
    }

    const averageScore =
      scoredJobs.reduce((sum, job) => sum + job.score, 0) / scoredJobs.length;

    const techStackCount: Record<string, number> = {};
    scoredJobs.forEach((job) => {
      (job.tech_stack || []).forEach((tech) => {
        techStackCount[tech] = (techStackCount[tech] || 0) + 1;
      });
    });

    const topTechStack = Object.entries(techStackCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tech]) => tech);

    const companyCount: Record<string, number> = {};
    scoredJobs.forEach((job) => {
      companyCount[job.company] = (companyCount[job.company] || 0) + 1;
    });

    const topCompanies = Object.entries(companyCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([company]) => company);

    const locationDistribution: Record<string, number> = {};
    scoredJobs.forEach((job) => {
      const location = job.location || "Unknown";
      locationDistribution[location] =
        (locationDistribution[location] || 0) + 1;
    });

    const scoreDistribution = {
      excellent: scoredJobs.filter((job) => job.score > 0.8).length,
      good: scoredJobs.filter((job) => job.score > 0.6 && job.score <= 0.8)
        .length,
      fair: scoredJobs.filter((job) => job.score > 0.4 && job.score <= 0.6)
        .length,
      poor: scoredJobs.filter((job) => job.score <= 0.4).length,
    };

    return {
      totalJobs: scoredJobs.length,
      averageScore,
      topTechStack,
      topCompanies,
      locationDistribution,
      scoreDistribution,
    };
  }
}
