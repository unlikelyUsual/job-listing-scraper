import { readFile } from "fs/promises";
import type { ResumeData } from "../database/models.js";
import { JobScrapingAutomation } from "../scraper/automation.js";
import { JobParser } from "../scraper/parser.js";
import { googleJobSearcher } from "../scrapers/google-search.js";
import { playwrightManager } from "../scrapers/playwright-manager.js";
import { JobMatcher } from "../services/job-matcher.js";
import Logger from "../util/Logger.js";

const logger = new Logger();

async function testPlaywrightManager() {
  logger.debug("🧪 Testing Playwright Manager...");

  try {
    await playwrightManager.initialize();
    const context = await playwrightManager.createContext();
    const page = await playwrightManager.createPage(context);

    await page.goto("https://example.com");
    const title = await page.title();

    logger.debug(`✅ Page title: ${title}`);

    await playwrightManager.closeContext(context);
    await playwrightManager.closeAll();

    return true;
  } catch (error) {
    logger.error("❌ Playwright Manager test failed:", error);
    return false;
  }
}

async function testGoogleSearch() {
  logger.debug("🧪 Testing Google Search...");

  try {
    const resumeJson = await readFile("src/util/resume.json", "utf-8");
    const resumeData: ResumeData = JSON.parse(resumeJson);

    // Test with limited search
    const results = await googleJobSearcher.searchJobsForRole(
      "Software Engineer",
      ["linkedin.com"]
    );

    logger.debug(`✅ Found ${results.length} job results`);

    if (results.length > 0) {
      logger.debug(`📄 Sample result: ${results[0].title} - ${results[0].url}`);
    }

    return results.length > 0;
  } catch (error) {
    logger.error("❌ Google Search test failed:", error);
    return false;
  }
}

async function testJobParser() {
  logger.debug("🧪 Testing Job Parser...");

  try {
    const resumeJson = await readFile("src/util/resume.json", "utf-8");
    const resumeData: ResumeData = JSON.parse(resumeJson);

    const jobParser = new JobParser(resumeData);

    await playwrightManager.initialize();
    const context = await playwrightManager.createContext();
    const page = await playwrightManager.createPage(context);

    // Test with a known job site
    await page.goto("https://jobs.github.com/positions");

    // Mock job details for testing
    const mockJobDetails = {
      title: "Senior Software Engineer",
      company: "Test Company",
      company_url: "test.com",
      job_url: "https://test.com/job/123",
      description:
        "We are looking for a Senior Software Engineer with Node.js and React experience",
      tech_stack: ["Node.js", "React", "TypeScript"],
      location: "Remote",
    };

    const score = jobParser.calculateJobScore(mockJobDetails);
    logger.debug(`✅ Job score calculated: ${(score * 100).toFixed(1)}%`);

    await playwrightManager.closeContext(context);
    await playwrightManager.closeAll();

    return score > 0;
  } catch (error) {
    logger.error("❌ Job Parser test failed:", error);
    return false;
  }
}

async function testJobMatcher() {
  logger.debug("🧪 Testing Job Matcher...");

  try {
    const resumeJson = await readFile("src/util/resume.json", "utf-8");
    const resumeData: ResumeData = JSON.parse(resumeJson);

    const jobMatcher = new JobMatcher(resumeData);

    // Mock job details for testing
    const mockJobs = [
      {
        title: "Senior Full Stack Developer",
        company: "Tech Corp",
        company_url: "techcorp.com",
        job_url: "https://techcorp.com/job/1",
        description: "Full stack development with React and Node.js",
        tech_stack: ["React", "Node.js", "TypeScript"],
        location: "Remote",
        posted_date: new Date(),
      },
      {
        title: "Backend Engineer",
        company: "StartupXYZ",
        company_url: "startupxyz.com",
        job_url: "https://startupxyz.com/job/2",
        description: "Backend development with Python and PostgreSQL",
        tech_stack: ["Python", "PostgreSQL"],
        location: "San Francisco",
        posted_date: new Date(Date.now() - 86400000), // 1 day ago
      },
    ];

    const scoredJobs = jobMatcher.scoreMultipleJobs(mockJobs);
    const topJobs = jobMatcher.selectTopJobs(scoredJobs, 2);

    logger.debug(
      `✅ Scored ${scoredJobs.length} jobs, selected ${topJobs.length} top jobs`
    );

    if (topJobs.length > 0) {
      logger.debug(
        `🏆 Top job: ${topJobs[0].title} (Score: ${(
          topJobs[0].score * 100
        ).toFixed(1)}%)`
      );
      logger.debug(`📝 Match reasons: ${topJobs[0].matchReasons.join(", ")}`);
    }

    const report = jobMatcher.generateJobReport(scoredJobs);
    logger.debug(
      `📊 Report: ${report.totalJobs} jobs, avg score: ${(
        report.averageScore * 100
      ).toFixed(1)}%`
    );

    return topJobs.length > 0;
  } catch (error) {
    logger.error("❌ Job Matcher test failed:", error);
    return false;
  }
}

async function testFullIntegration() {
  logger.debug("🧪 Testing Full Integration...");

  try {
    const resumeJson = await readFile("src/util/resume.json", "utf-8");
    const resumeData: ResumeData = JSON.parse(resumeJson);

    const automation = new JobScrapingAutomation(resumeData);

    // Test initialization
    await automation.initialize();
    logger.debug("✅ Automation initialized successfully");

    // Test recent results (should work even with empty database)
    const recentResults = await automation.getRecentResults(1);
    logger.debug(
      `✅ Recent results: ${recentResults.sessions.length} sessions, ${recentResults.topJobs.length} top jobs`
    );

    await automation.cleanup();

    return true;
  } catch (error) {
    logger.error("❌ Full Integration test failed:", error);
    return false;
  }
}

async function runAllTests() {
  logger.debug("🚀 Starting Job Scraper Tests...");

  const tests = [
    { name: "Playwright Manager", fn: testPlaywrightManager },
    { name: "Google Search", fn: testGoogleSearch },
    { name: "Job Parser", fn: testJobParser },
    { name: "Job Matcher", fn: testJobMatcher },
    { name: "Full Integration", fn: testFullIntegration },
  ];

  const results = [];

  for (const test of tests) {
    logger.debug(`\n🧪 Running ${test.name} test...`);
    const result = await test.fn();
    results.push({ name: test.name, passed: result });

    if (result) {
      logger.debug(`✅ ${test.name} test PASSED`);
    } else {
      logger.debug(`❌ ${test.name} test FAILED`);
    }
  }

  // Summary
  logger.debug("\n📊 Test Results Summary:");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  results.forEach((result) => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    logger.debug(`  ${status} - ${result.name}`);
  });

  logger.debug(`\n🎯 Overall: ${passed}/${total} tests passed`);

  if (passed === total) {
    logger.debug("🎉 All tests passed! System is ready to use.");
  } else {
    logger.debug(
      "⚠️ Some tests failed. Please check the configuration and try again."
    );
  }

  return passed === total;
}

// Run tests if this file is executed directly
if (import.meta.main) {
  runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      logger.error("💥 Test runner failed:", error);
      process.exit(1);
    });
}

export { runAllTests };
