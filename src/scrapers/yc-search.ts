import type { JobDetails } from "../scraper/parser.js";
import Logger from "../util/Logger.js";
import { playwrightManager } from "./playwright-manager.js";

const logger = new Logger();

class searchYCJobs {
  async searchRole(roles: string[]): Promise<JobDetails[]> {
    try {
      await playwrightManager.initialize();
      const context = await playwrightManager.createContext();
      const page = await playwrightManager.createPage(context);

      await page.goto("https://www.ycombinator.com/jobs", {
        waitUntil: "domcontentloaded",
      });

      // Wait for job cards to load
      await playwrightManager.waitForSelector(
        page,
        "section.border-retro-sectionBorder .space-y-2",
        {
          timeout: 10_000,
        }
      );

      // Scrape job listings using Playwright's $$eval for detailed info
      const results = (await page.$$eval(
        "li.my-2.flex",
        (elements, searchRoles: string[]) => {
          // Ensure searchRoles is an array
          const rolesArray = Array.isArray(searchRoles) ? searchRoles : [];

          return elements
            .map((li) => {
              // Company info
              const companyLogo =
                li.querySelector("a img")?.getAttribute("src") || "";
              const companyProfile =
                li.querySelector("a")?.getAttribute("href") || "";
              const companyName =
                li.querySelector("span.font-bold")?.textContent?.trim() || "";
              const companyDescription =
                li.querySelector("span.text-xs")?.textContent?.trim() || "";

              // Job info
              const jobTitleEl = li.querySelector("a.text-linkColor");
              const jobTitle = jobTitleEl?.textContent?.trim() || "";
              const jobLink =
                li.querySelector("a.border-brand-200")?.getAttribute("href") ||
                "";

              // Details
              const details = li.querySelectorAll(
                ".flex.flex-wrap.items-center > div.whitespace-nowrap"
              );
              const jobType = details[0]?.textContent?.trim() || "";
              const department = details[1]?.textContent?.trim() || "";
              const stack = details[2]?.textContent?.trim() || "";
              const salary = details[3]?.textContent?.trim() || "";
              const location = details[4]?.textContent?.trim() || "";

              // Apply link
              const applyLink =
                li.querySelector("a.ycdc-btn")?.getAttribute("href") || "";

              // Role match logic
              const isRoleMatch = rolesArray.some((searchRole: string) =>
                jobTitle.toLowerCase().includes(searchRole.toLowerCase())
              );

              console.log("YC Job Found:", { isRoleMatch, jobTitle, jobLink });

              if (isRoleMatch && jobTitle && jobLink) {
                return {
                  title: jobTitle,
                  company: companyName,
                  company_url: companyProfile,
                  job_url: jobLink,
                  description: companyDescription,
                  requirements: "",
                  tech_stack: stack
                    ? stack.split(",").map((item) => item.trim())
                    : [],
                  salary_range: salary,
                  location: location,
                  posted_date: new Date(),
                  //   title: `${jobTitle} at ${companyName}`,
                  //   url: jobLink.startsWith("http")
                  //     ? jobLink
                  //     : `https://www.workatastartup.com${jobLink}`,
                  //   snippet: `${companyDescription} | ${jobType} | ${department} | ${stack} | ${salary} | ${location}`,
                  //   site: "workatastartup.com",
                };
              }
              return null;
            })
            .filter(Boolean);
        },
        roles
      )) as JobDetails[];

      await playwrightManager.closeContext(context);
      return results.slice(0, 20);
    } catch (error) {
      logger.error("YC jobs search failed:", error);
      return [];
    }
  }
}

export const ycJobSearcher = new searchYCJobs();
