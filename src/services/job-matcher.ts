import type { JobListing, ResumeData } from "../database/models.js";
import type { JobDetails } from "../scraper/parser.js";
import { JobParser } from "../scraper/parser.js";
import Logger from "../util/Logger.js";

const logger = new Logger();

export interface ScoredJob extends JobDetails {
  score: number;
  matchReasons: string[];
}

export class JobMatcher {
  private resumeData: ResumeData;
  private jobParser: JobParser;

  constructor(resumeData: ResumeData) {
    this.resumeData = resumeData;
    this.jobParser = new JobParser(resumeData);
  }

  scoreJob(jobDetails: JobDetails): ScoredJob {
    const score = this.jobParser.calculateJobScore(jobDetails);
    const matchReasons = this.generateMatchReasons(jobDetails, score);

    return {
      ...jobDetails,
      score,
      matchReasons,
    };
  }

  scoreMultipleJobs(jobs: JobDetails[]): ScoredJob[] {
    logger.debug(`🎯 Scoring ${jobs.length} jobs...`);

    const scoredJobs = jobs.map((job) => this.scoreJob(job));

    // Sort by score (highest first)
    scoredJobs.sort((a, b) => b.score - a.score);

    logger.debug(
      `✅ Jobs scored. Top score: ${scoredJobs[0]?.score.toFixed(2) || "N/A"}`
    );
    return scoredJobs;
  }

  selectTopJobs(scoredJobs: ScoredJob[], count: number = 5): ScoredJob[] {
    const minScore = parseFloat(process.env.MIN_SCORE_THRESHOLD || "0.3");

    // Filter jobs that meet minimum score threshold
    const qualifiedJobs = scoredJobs.filter((job) => job.score >= minScore);

    if (qualifiedJobs.length === 0) {
      logger.debug(`⚠️ No jobs meet minimum score threshold of ${minScore}`);
      // If no jobs meet threshold, take top jobs anyway but log warning
      return scoredJobs.slice(0, count);
    }

    const topJobs = qualifiedJobs.slice(0, count);
    logger.debug(
      `🏆 Selected ${topJobs.length} top jobs (min score: ${minScore})`
    );

    return topJobs;
  }

  private generateMatchReasons(
    jobDetails: JobDetails,
    score: number
  ): string[] {
    const reasons: string[] = [];
    const candidate = this.resumeData.candidate;

    // Tech stack matches
    const jobTechStack = jobDetails.tech_stack || [];
    const techMatches = jobTechStack.filter((tech) =>
      candidate.tech_stack.some(
        (userTech) => userTech.toLowerCase() === tech.toLowerCase()
      )
    );

    if (techMatches.length > 0) {
      reasons.push(
        `Tech stack match: ${techMatches.slice(0, 3).join(", ")}${
          techMatches.length > 3 ? "..." : ""
        }`
      );
    }

    // Role title matches
    const titleLower = jobDetails.title.toLowerCase();
    const roleMatches = candidate.roles.filter((role) =>
      titleLower.includes(role.toLowerCase())
    );

    if (roleMatches.length > 0) {
      reasons.push(`Role match: ${roleMatches[0]}`);
    }

    // Location matches
    const locationLower = (jobDetails.location || "").toLowerCase();
    const locationMatches = candidate.location.filter((loc) =>
      locationLower.includes(loc.toLowerCase())
    );

    if (locationMatches.length > 0) {
      reasons.push(`Location match: ${locationMatches[0]}`);
    } else if (
      locationLower.includes("remote") ||
      locationLower.includes("work from home")
    ) {
      reasons.push("Remote work available");
    }

    // Recency
    if (jobDetails.posted_date) {
      const daysDiff = Math.floor(
        (Date.now() - jobDetails.posted_date.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysDiff <= 1) {
        reasons.push("Posted today");
      } else if (daysDiff <= 3) {
        reasons.push("Recently posted");
      }
    }

    // Experience level indicators
    const description = (jobDetails.description || "").toLowerCase();
    const requirements = (jobDetails.requirements || "").toLowerCase();
    const fullText = `${description} ${requirements}`;

    if (fullText.includes("senior") && candidate.experience_years >= 5) {
      reasons.push("Senior level match");
    } else if (
      fullText.includes("mid-level") &&
      candidate.experience_years >= 3
    ) {
      reasons.push("Mid-level match");
    }

    // Salary indicators
    if (jobDetails.salary_range) {
      reasons.push("Salary information available");
    }

    // Company type indicators
    if (fullText.includes("startup") || fullText.includes("early stage")) {
      reasons.push("Startup opportunity");
    }

    if (reasons.length === 0) {
      reasons.push(`Overall match score: ${(score * 100).toFixed(0)}%`);
    }

    return reasons;
  }

  // Convert JobDetails to JobListing for database storage
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

  // Batch convert multiple scored jobs
  convertMultipleToJobListings(
    scoredJobs: ScoredJob[],
    sessionId: number
  ): Omit<JobListing, "id">[] {
    return scoredJobs.map((job) => this.convertToJobListing(job, sessionId));
  }

  // Generate summary report for a set of jobs
  generateJobReport(scoredJobs: ScoredJob[]): {
    totalJobs: number;
    averageScore: number;
    topTechStack: string[];
    topCompanies: string[];
    locationDistribution: Record<string, number>;
    scoreDistribution: {
      excellent: number; // > 0.8
      good: number; // 0.6 - 0.8
      fair: number; // 0.4 - 0.6
      poor: number; // < 0.4
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

    // Calculate average score
    const averageScore =
      scoredJobs.reduce((sum, job) => sum + job.score, 0) / scoredJobs.length;

    // Count tech stack occurrences
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

    // Count company occurrences
    const companyCount: Record<string, number> = {};
    scoredJobs.forEach((job) => {
      companyCount[job.company] = (companyCount[job.company] || 0) + 1;
    });

    const topCompanies = Object.entries(companyCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([company]) => company);

    // Location distribution
    const locationDistribution: Record<string, number> = {};
    scoredJobs.forEach((job) => {
      const location = job.location || "Unknown";
      locationDistribution[location] =
        (locationDistribution[location] || 0) + 1;
    });

    // Score distribution
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
