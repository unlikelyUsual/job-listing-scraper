import { chromium } from "playwright";

(async () => {
  // Setup
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // The actual interesting bit
  //   await context.route("**.jpg", (route) => route.abort());
  await page.goto("https://playwright.dev/");
  await page.screenshot({ path: `example.png` });

  // Teardown
  await context.close();
  await browser.close();
})();
