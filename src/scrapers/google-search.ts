import type { Page } from "playwright";
import type { ResumeData } from "../database/models.js";
import Logger from "../util/Logger.js";
import { playwrightManager } from "./playwright-manager.js";

const logger = new Logger();

export interface GoogleSearchResult {
  title: string;
  url: string;
  snippet: string;
  site: string;
}

export class GoogleJobSearcher {
  private async buildSearchQuery(role: string, site?: string): Promise<string> {
    let query = `"${role}" jobs`;

    if (site) {
      query += ` site:${site}`;
    }

    // Add location preferences
    query += ` (remote OR "work from home" OR bangalore OR "bengaluru")`;

    // Add time filter for recent jobs
    query += ` after:2024-01-01`;

    return query;
  }

  async searchJobsForRole(
    role: string,
    sites: string[] = []
  ): Promise<GoogleSearchResult[]> {
    const results: GoogleSearchResult[] = [];

    try {
      await playwrightManager.initialize();
      const context = await playwrightManager.createContext();
      const page = await playwrightManager.createPage(context);

      // If no specific sites, do a general search
      if (sites.length === 0) {
        const generalResults = await this.performSearch(page, role);
        results.push(...generalResults);
      } else {
        // Search each site individually
        for (const site of sites) {
          try {
            const siteResults = await this.performSearch(page, role, site);
            results.push(...siteResults);

            // Add delay between searches to avoid rate limiting
            await page.waitForTimeout(2000);
          } catch (error) {
            logger.error(`Failed to search ${site} for ${role}:`, error);
            await playwrightManager.handleError(
              page,
              error as Error,
              `google-search-${site}`
            );
          }
        }
      }

      await playwrightManager.closeContext(context);
      return results;
    } catch (error) {
      logger.error("Google search failed:", error);
      throw error;
    }
  }

  private async performSearch(
    page: Page,
    role: string,
    site?: string
  ): Promise<GoogleSearchResult[]> {
    const query = await this.buildSearchQuery(role, site);
    logger.debug(`Searching Google: ${query}`);

    try {
      // Navigate to Google
      await page.goto("https://www.google.com", { waitUntil: "networkidle" });

      // Handle cookie consent if present
      await this.handleCookieConsent(page);

      // Find search input and perform search
      const searchInput = 'input[name="q"], textarea[name="q"]';
      await playwrightManager.waitForSelector(page, searchInput);
      await playwrightManager.safeType(page, searchInput, query);

      // Submit search
      await page.keyboard.press("Enter");
      await page.waitForLoadState("networkidle");

      // Extract search results
      const results = await this.extractSearchResults(page, site);

      logger.debug(
        `Found ${results.length} results for "${role}" ${
          site ? `on ${site}` : ""
        }`
      );
      return results;
    } catch (error) {
      logger.error(`Search failed for query: ${query}`, error);
      throw error;
    }
  }

  private async handleCookieConsent(page: Page): Promise<void> {
    try {
      // Common cookie consent selectors
      const consentSelectors = [
        'button[id*="accept"]',
        'button[aria-label*="Accept"]',
        'button:has-text("Accept all")',
        'button:has-text("I agree")',
        "#L2AGLb", // Google's "I agree" button
      ];

      for (const selector of consentSelectors) {
        if (await playwrightManager.safeClick(page, selector)) {
          logger.debug("Handled cookie consent");
          await page.waitForTimeout(1000);
          break;
        }
      }
    } catch (error) {
      // Cookie consent handling is optional
      logger.debug("No cookie consent found or failed to handle");
    }
  }

  private async extractSearchResults(
    page: Page,
    targetSite?: string
  ): Promise<GoogleSearchResult[]> {
    try {
      // Wait for search results to load
      await playwrightManager.waitForSelector(page, "[data-ved]", {
        timeout: 10000,
      });

      const results = await page.evaluate((site) => {
        const searchResults: GoogleSearchResult[] = [];

        // Google search result selectors
        const resultElements = document.querySelectorAll("div[data-ved] h3");

        resultElements.forEach((titleElement) => {
          try {
            const linkElement = titleElement.closest("a") as HTMLAnchorElement;
            if (!linkElement) return;

            const url = linkElement.href;
            const title = titleElement.textContent?.trim() || "";

            // Find snippet
            const resultContainer = titleElement.closest("[data-ved]");
            const snippetElement = resultContainer?.querySelector(
              "[data-ved] span:not([class])"
            );
            const snippet = snippetElement?.textContent?.trim() || "";

            // Extract site domain
            const urlObj = new URL(url);
            const siteDomain = urlObj.hostname.replace("www.", "");

            // Filter by target site if specified
            if (site && !siteDomain.includes(site)) {
              return;
            }

            // Filter out non-job related results
            const jobKeywords = [
              "job",
              "career",
              "hiring",
              "position",
              "opening",
              "vacancy",
            ];
            const isJobRelated = jobKeywords.some(
              (keyword) =>
                title.toLowerCase().includes(keyword) ||
                snippet.toLowerCase().includes(keyword) ||
                url.toLowerCase().includes(keyword)
            );

            if (isJobRelated && title && url) {
              searchResults.push({
                title,
                url,
                snippet,
                site: siteDomain,
              });
            }
          } catch (error) {
            console.error("Error processing search result:", error);
          }
        });

        return searchResults;
      }, targetSite);

      // Remove duplicates based on URL
      const uniqueResults = results.filter(
        (result, index, self) =>
          index === self.findIndex((r) => r.url === result.url)
      );

      return uniqueResults.slice(0, 20); // Limit to top 20 results
    } catch (error) {
      logger.error("Failed to extract search results:", error);
      return [];
    }
  }

  async searchAllRoles(
    resumeData: ResumeData,
    preferredSites: string[] = []
  ): Promise<GoogleSearchResult[]> {
    const allResults: GoogleSearchResult[] = [];
    const roles = resumeData.data.roles;

    logger.debug(
      `Searching for ${roles.length} roles across ${
        preferredSites.length || "all"
      } sites`
    );

    for (const role of roles) {
      try {
        const roleResults = await this.searchJobsForRole(role, preferredSites);
        allResults.push(...roleResults);

        // Add delay between role searches
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error) {
        logger.error(`Failed to search for role: ${role}`, error);
      }
    }

    // Remove duplicates and sort by relevance
    const uniqueResults = allResults.filter(
      (result, index, self) =>
        index === self.findIndex((r) => r.url === result.url)
    );

    logger.debug(`✅ Total unique job results found: ${uniqueResults.length}`);
    return uniqueResults;
  }
}

export const googleJobSearcher = new GoogleJobSearcher();
