import type { Page } from "playwright";
import type { ResumeData } from "../database/models.js";
import Logger from "../util/Logger.js";

const logger = new Logger();

export interface JobDetails {
  title: string;
  company: string;
  company_url?: string;
  job_url: string;
  description?: string;
  requirements?: string;
  tech_stack?: string[];
  salary_range?: string;
  location?: string;
  posted_date?: Date;
}

export class JobParser {
  private resumeData: ResumeData;

  constructor(resumeData: ResumeData) {
    this.resumeData = resumeData;
  }

  async extractJobDetails(page: Page): Promise<JobDetails | null> {
    try {
      const url = page.url();
      logger.debug(`Parsing job details from: ${url}`);

      await page.waitForLoadState("domcontentloaded");

      const jobDetails = await page.evaluate(() => {
        // Common selectors for job details across different sites
        const titleSelectors = [
          'h1[data-testid*="job-title"]',
          'h1[class*="job-title"]',
          'h1[class*="jobTitle"]',
          ".job-title h1",
          ".jobsearch-JobInfoHeader-title",
          '[data-testid="job-title"]',
          "h1",
        ];

        const companySelectors = [
          '[data-testid*="company"]',
          ".company-name",
          ".jobsearch-InlineCompanyRating",
          '[class*="company"]',
          'a[data-testid="company-name"]',
        ];

        const descriptionSelectors = [
          '[data-testid="job-description"]',
          ".job-description",
          ".jobsearch-jobDescriptionText",
          '[class*="description"]',
          "#job-description",
        ];

        const locationSelectors = [
          '[data-testid*="location"]',
          ".location",
          ".jobsearch-JobInfoHeader-subtitle",
          '[class*="location"]',
        ];

        const salarySelectors = [
          '[data-testid*="salary"]',
          ".salary",
          '[class*="salary"]',
          '[class*="compensation"]',
        ];

        // Helper function to find element by multiple selectors
        const findBySelectors = (selectors: string[]): Element | null => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent?.trim()) {
              return element;
            }
          }
          return null;
        };

        // Extract job details
        const titleElement = findBySelectors(titleSelectors);
        const companyElement = findBySelectors(companySelectors);
        const descriptionElement = findBySelectors(descriptionSelectors);
        const locationElement = findBySelectors(locationSelectors);
        const salaryElement = findBySelectors(salarySelectors);

        const title = titleElement?.textContent?.trim() || "";
        const company = companyElement?.textContent?.trim() || "";
        const description = descriptionElement?.textContent?.trim() || "";
        const location = locationElement?.textContent?.trim() || "";
        const salary = salaryElement?.textContent?.trim() || "";

        // Extract company URL from current page
        const companyUrl = new URL(window.location.href).hostname;

        return {
          title,
          company,
          description,
          location,
          salary,
          companyUrl,
          fullText: document.body.innerText,
        };
      });

      if (!jobDetails.title || !jobDetails.company) {
        logger.debug("Could not extract essential job details (title/company)");
        return null;
      }

      // Process extracted data
      const techStack = this.extractTechStack(jobDetails.fullText);
      const requirements = this.extractRequirements(jobDetails.fullText);
      const postedDate = this.extractPostedDate(jobDetails.fullText);

      const result: JobDetails = {
        title: jobDetails.title,
        company: jobDetails.company,
        company_url: jobDetails.companyUrl,
        job_url: url,
        description: jobDetails.description,
        requirements,
        tech_stack: techStack,
        salary_range: jobDetails.salary || undefined,
        location: jobDetails.location || undefined,
        posted_date: postedDate,
      };

      logger.debug(
        `Successfully parsed job: ${result.title} at ${result.company}`
      );

      return result;
    } catch (error) {
      logger.error("Failed to extract job details:", error);
      return null;
    }
  }

  private extractTechStack(text: string): string[] {
    const allTechStack = [
      ...this.resumeData.data.tech_stack,
      // Additional common technologies
      "JavaScript",
      "HTML",
      "CSS",
      "SQL",
      "Git",
      "Docker",
      "Kubernetes",
      "Angular",
      "Vue.js",
      "Express.js",
      "Django",
      "Flask",
      "Spring",
      "Laravel",
      "Ruby on Rails",
      "PHP",
      "C++",
      "C#",
      "Java",
      "Go",
      "Rust",
      "Swift",
      "Kotlin",
      "Flutter",
      "React Native",
      "Unity",
      "TensorFlow",
      "PyTorch",
      "Pandas",
      "NumPy",
      "Scikit-learn",
      "Elasticsearch",
      "Kafka",
      "RabbitMQ",
      "Nginx",
      "Apache",
      "Jenkins",
      "GitLab CI",
      "GitHub Actions",
      "Terraform",
      "Ansible",
    ];

    const foundTech = allTechStack.filter((tech) =>
      text.toLowerCase().includes(tech.toLowerCase())
    );

    // Remove duplicates and return
    return [...new Set(foundTech)];
  }

  private extractRequirements(text: string): string {
    const requirementSections = [
      "requirements:",
      "qualifications:",
      "what we're looking for:",
      "you should have:",
      "minimum requirements:",
      "required skills:",
      "must have:",
    ];

    const lowerText = text.toLowerCase();

    for (const section of requirementSections) {
      const index = lowerText.indexOf(section);
      if (index !== -1) {
        // Extract text after the requirements section (up to 1000 characters)
        const startIndex = index + section.length;
        const endIndex = Math.min(startIndex + 1000, text.length);
        return text.substring(startIndex, endIndex).trim();
      }
    }

    return "";
  }

  private extractPostedDate(text: string): Date | undefined {
    const datePatterns = [
      /posted\s+(\d+)\s+days?\s+ago/i,
      /(\d+)\s+days?\s+ago/i,
      /posted\s+(\d+)\s+hours?\s+ago/i,
      /(\d+)\s+hours?\s+ago/i,
      /posted\s+today/i,
      /posted\s+yesterday/i,
    ];

    const now = new Date();

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[0].toLowerCase().includes("today")) {
          return now;
        }
        if (match[0].toLowerCase().includes("yesterday")) {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          return yesterday;
        }
        if (match[1]) {
          const value = parseInt(match[1]);
          const date = new Date(now);

          if (match[0].toLowerCase().includes("hour")) {
            date.setHours(date.getHours() - value);
          } else {
            date.setDate(date.getDate() - value);
          }

          return date;
        }
      }
    }

    return undefined;
  }

  // Calculate job relevance score based on resume data
  calculateJobScore(jobDetails: JobDetails): number {
    let score = 0;
    const maxScore = 100;

    // Tech stack match (40% of score)
    const techStackScore = this.calculateTechStackScore(
      jobDetails.tech_stack || []
    );
    score += techStackScore * 0.4;

    // Role title match (30% of score)
    const titleScore = this.calculateTitleScore(jobDetails.title);
    score += titleScore * 0.3;

    // Location preference (20% of score)
    const locationScore = this.calculateLocationScore(
      jobDetails.location || ""
    );
    score += locationScore * 0.2;

    // Recency bonus (10% of score)
    const recencyScore = this.calculateRecencyScore(jobDetails.posted_date);
    score += recencyScore * 0.1;

    return Math.min(score, maxScore) / maxScore; // Normalize to 0-1
  }

  private calculateTechStackScore(jobTechStack: string[]): number {
    if (jobTechStack.length === 0) return 0;

    const userTechStack = this.resumeData.data.tech_stack;
    const matches = jobTechStack.filter((tech) =>
      userTechStack.some(
        (userTech) => userTech.toLowerCase() === tech.toLowerCase()
      )
    );

    return (
      (matches.length / Math.max(jobTechStack.length, userTechStack.length)) *
      100
    );
  }

  private calculateTitleScore(title: string): number {
    const userRoles = this.resumeData.data.roles;
    const titleLower = title.toLowerCase();

    for (const role of userRoles) {
      if (titleLower.includes(role.toLowerCase())) {
        return 100;
      }
    }

    // Partial matches
    const keywords = [
      "developer",
      "engineer",
      "software",
      "full stack",
      "backend",
      "frontend",
    ];
    const matches = keywords.filter((keyword) => titleLower.includes(keyword));

    return (matches.length / keywords.length) * 60; // Max 60 for partial matches
  }

  private calculateLocationScore(location: string): number {
    const userLocations = this.resumeData.data.location;
    const locationLower = location.toLowerCase();

    for (const userLocation of userLocations) {
      if (locationLower.includes(userLocation.toLowerCase())) {
        return 100;
      }
    }

    // Check for remote work
    if (
      locationLower.includes("remote") ||
      locationLower.includes("work from home")
    ) {
      return 100;
    }

    return 0;
  }

  private calculateRecencyScore(postedDate?: Date): number {
    if (!postedDate) return 50; // Neutral score if date unknown

    const now = new Date();
    const daysDiff = Math.floor(
      (now.getTime() - postedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff <= 1) return 100;
    if (daysDiff <= 3) return 80;
    if (daysDiff <= 7) return 60;
    if (daysDiff <= 14) return 40;
    if (daysDiff <= 30) return 20;

    return 0;
  }
}

// Legacy function for backward compatibility
export async function extractJobDetails(page: Page): Promise<unknown> {
  // This is a simplified version for backward compatibility
  try {
    const title = await page
      .$eval("h1", (el) => el.textContent?.trim())
      .catch(() => "");
    const body = await page.$eval("body", (el) => el.innerText).catch(() => "");

    const techStack = extractKeywords(body);
    return title
      ? {
          title,
          company_url: new URL(page.url()).hostname,
          tech_stack: techStack,
          scraped_at: new Date().toISOString(),
        }
      : null;
  } catch (error) {
    return null;
  }
}

function extractKeywords(text: string): string[] {
  const stack = ["Node.js", "React", "TypeScript", "Next.js", "Python"];
  return stack.filter((keyword) => text.includes(keyword));
}
