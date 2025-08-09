import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import Logger from "../util/Logger.js";

const logger = new Logger();

export interface PlaywrightConfig {
  headless?: boolean;
  maxConcurrency?: number;
  screenshotOnError?: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export class PlaywrightManager {
  private browser: Browser | null = null;
  private contexts: BrowserContext[] = [];
  private config: PlaywrightConfig;

  constructor(config: PlaywrightConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      maxConcurrency: config.maxConcurrency ?? 3,
      screenshotOnError: config.screenshotOnError ?? true,
      userAgent:
        config.userAgent ??
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: config.viewport ?? { width: 1920, height: 1080 },
    };
  }

  async initialize(): Promise<void> {
    try {
      logger.debug("🚀 Initializing Playwright browser...");
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      });
      logger.debug("✅ Playwright browser initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Playwright browser:", error);
      throw error;
    }
  }

  async createContext(): Promise<BrowserContext> {
    if (!this.browser) {
      throw new Error("Browser not initialized. Call initialize() first.");
    }

    if (this.contexts.length >= this.config.maxConcurrency!) {
      throw new Error(
        `Maximum concurrency limit (${this.config.maxConcurrency}) reached`
      );
    }

    try {
      const context = await this.browser.newContext({
        userAgent: this.config.userAgent,
        viewport: this.config.viewport,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      // Block unnecessary resources for faster scraping
      await context.route(
        "**/*.{png,jpg,jpeg,gif,svg,css,woff,woff2}",
        (route) => {
          route.abort();
        }
      );

      // Block ads and tracking
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (
          url.includes("google-analytics") ||
          url.includes("googletagmanager") ||
          url.includes("facebook.com/tr") ||
          url.includes("doubleclick") ||
          url.includes("googlesyndication")
        ) {
          route.abort();
        } else {
          route.continue();
        }
      });

      this.contexts.push(context);
      logger.debug(
        `📄 Created new browser context (${this.contexts.length}/${this.config.maxConcurrency})`
      );
      return context;
    } catch (error) {
      logger.error("❌ Failed to create browser context:", error);
      throw error;
    }
  }

  async createPage(context?: BrowserContext): Promise<Page> {
    const ctx = context || (await this.createContext());

    try {
      const page = await ctx.newPage();

      // Set reasonable timeouts
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // Handle console logs
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          logger.debug(`🌐 Browser console error: ${msg.text()}`);
        }
      });

      // Handle page errors
      page.on("pageerror", (error) => {
        logger.debug(`🌐 Page error: ${error.message}`);
      });

      return page;
    } catch (error) {
      logger.error("❌ Failed to create page:", error);
      throw error;
    }
  }

  async takeScreenshot(page: Page, filename: string): Promise<void> {
    if (!this.config.screenshotOnError) return;

    try {
      await page.screenshot({
        path: `screenshots/${filename}`,
        fullPage: true,
      });
      logger.debug(`📸 Screenshot saved: ${filename}`);
    } catch (error) {
      logger.error("❌ Failed to take screenshot:", error);
    }
  }

  async handleError(page: Page, error: Error, context: string): Promise<void> {
    logger.error(`❌ Error in ${context}:`, error);

    if (this.config.screenshotOnError) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await this.takeScreenshot(page, `error-${context}-${timestamp}.png`);
    }
  }

  async closeContext(context: BrowserContext): Promise<void> {
    try {
      await context.close();
      this.contexts = this.contexts.filter((ctx) => ctx !== context);
      logger.debug(
        `🔒 Closed browser context (${this.contexts.length} remaining)`
      );
    } catch (error) {
      logger.error("❌ Failed to close context:", error);
    }
  }

  async closeAll(): Promise<void> {
    try {
      // Close all contexts
      await Promise.all(this.contexts.map((ctx) => ctx.close()));
      this.contexts = [];

      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      logger.debug("🔒 All browser resources closed");
    } catch (error) {
      logger.error("❌ Failed to close browser resources:", error);
    }
  }

  async waitForSelector(
    page: Page,
    selector: string,
    options: { timeout?: number; visible?: boolean } = {}
  ): Promise<boolean> {
    try {
      await page.waitForSelector(selector, {
        timeout: options.timeout || 10000,
        state: options.visible ? "visible" : "attached",
      });
      return true;
    } catch (error) {
      logger.debug(`⏰ Selector not found: ${selector}`);
      return false;
    }
  }

  async safeClick(page: Page, selector: string): Promise<boolean> {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.click();
        return true;
      }
      return false;
    } catch (error) {
      logger.debug(`🖱️ Failed to click: ${selector}`);
      return false;
    }
  }

  async safeType(page: Page, selector: string, text: string): Promise<boolean> {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.fill(text);
        return true;
      }
      return false;
    } catch (error) {
      logger.debug(`⌨️ Failed to type in: ${selector}`);
      return false;
    }
  }

  async scrollToBottom(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        return new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
    } catch (error) {
      logger.debug("📜 Failed to scroll to bottom");
    }
  }
}

export const playwrightManager = new PlaywrightManager({
  headless: process.env.HEADLESS_MODE === "true",
  maxConcurrency: parseInt(process.env.MAX_CONCURRENT_SCRAPERS || "3"),
  screenshotOnError: process.env.SCREENSHOT_ON_ERROR === "true",
});
