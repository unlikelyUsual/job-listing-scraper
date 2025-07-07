import type { Page } from "playwright";

export async function extractJobDetails(page: Page): Promise<unknown> {
  const title = await page.$eval("h1", (el) => el.textContent?.trim());
  const applyLink = await page.$eval("a[href*='apply']", (a) => a.href);
  const body = await page.$eval("body", (el) => el.innerText);

  const techStack = extractKeywords(body);
  return title && applyLink
    ? {
        title,
        applyLink,
        company_url: new URL(page.url()).hostname,
        tech_stack: techStack,
        scraped_at: new Date().toISOString(),
      }
    : null;
}

function extractKeywords(text: string): string[] {
  const stack = ["Node.js", "React", "TypeScript", "Next.js", "Python"];
  return stack.filter((keyword) => text.includes(keyword));
}
