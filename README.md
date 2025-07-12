# Job Listing Scraper

An intelligent job scraping system that searches Google for job openings, scrapes detailed job information using Playwright, scores jobs based on your profile, and stores the top matches in a PostgreSQL database. The system runs automatically every 3 days and is containerized with Docker.

## 🚀 Features

- **Google Job Search**: Searches Google for job listings across multiple sites
- **Intelligent Scraping**: Uses Playwright to extract detailed job information
- **Smart Matching**: Scores jobs based on your resume/profile data
- **Top 5 Selection**: Automatically selects and stores the best matching jobs
- **Scheduled Execution**: Runs every 3 days automatically
- **Database Storage**: PostgreSQL database with comprehensive job data
- **Docker Support**: Fully containerized with Docker Compose
- **Multiple Run Modes**: Immediate run, scheduled, status check, and test modes

## 📋 Prerequisites

- [Bun](https://bun.sh) runtime
- [Docker](https://www.docker.com/) and Docker Compose
- PostgreSQL (handled by Docker)

## 🛠️ Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd job-listing-scraper
```

2. **Install dependencies**

```bash
bun install
```

3. **Configure your profile**
   Edit `src/util/resume.json` with your details:

```json
{
  "candidate": {
    "name": "Your Name",
    "email": "your.email@example.com",
    "roles": ["Full Stack Developer", "Backend Developer"],
    "tech_stack": ["Node.js", "React", "TypeScript", "PostgreSQL"],
    "location": ["Remote", "Your City"],
    "experience_years": 5
  }
}
```

4. **Set up environment variables**
   Copy `.env` and adjust settings if needed:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=job_scraper
DB_USER=scraper_user
DB_PASSWORD=scraper_password

# Scraping Configuration
SCRAPING_INTERVAL_DAYS=3
MAX_CONCURRENT_SCRAPERS=3
HEADLESS_MODE=true
TOP_JOBS_COUNT=5
MIN_SCORE_THRESHOLD=0.3
```

## 🐳 Docker Setup

**Start the database and application:**

```bash
docker-compose up -d
```

**View logs:**

```bash
docker-compose logs -f job-scraper
```

**Stop services:**

```bash
docker-compose down
```

## 💻 Usage

### Run Modes

**1. Default Mode (Run once + Start scheduler)**

```bash
bun run src/index.ts
```

**2. Run Immediately**

```bash
bun run src/index.ts run
```

**3. Scheduler Only**

```bash
bun run src/index.ts schedule
```

**4. Check Status & Recent Results**

```bash
bun run src/index.ts status
```

**5. Test Mode (Non-headless browser)**

```bash
bun run src/index.ts test
```

### Development Commands

**Start development server:**

```bash
bun run dev
```

**Run tests:**

```bash
bun test
```

## 🏗️ Architecture

### Core Components

1. **Google Search (`src/scrapers/google-search.ts`)**

   - Searches Google for job listings
   - Handles multiple job sites (LinkedIn, Indeed, YCombinator)
   - Extracts job URLs with metadata

2. **Job Parser (`src/scraper/parser.ts`)**

   - Extracts detailed job information using Playwright
   - Handles multiple site layouts dynamically
   - Calculates job relevance scores

3. **Job Matcher (`src/services/job-matcher.ts`)**

   - Scores jobs based on tech stack, role, location, and recency
   - Selects top 5 jobs per session
   - Generates match reasons and reports

4. **Scheduler (`src/services/scheduler.ts`)**

   - Runs scraping every 3 days
   - Handles cron scheduling and job management
   - Supports manual triggers

5. **Database Layer (`src/database/`)**
   - PostgreSQL with comprehensive schema
   - Tracks scraping sessions and job listings
   - Stores scoring and selection data

### Workflow

```
1. Load Resume Data → 2. Google Search → 3. Job Scraping → 4. Scoring & Ranking → 5. Database Storage
```

## 📊 Database Schema

### Tables

- **job_listings**: Stores all scraped job information
- **scraping_sessions**: Tracks each scraping run
- **preferred_sites**: Configuration for job sites
- **search_queries**: Logs all search queries

### Key Features

- Automatic deduplication of job URLs
- Session tracking for historical analysis
- Scoring system for job relevance
- Top picks marking for easy filtering

## 🎯 Job Scoring Algorithm

Jobs are scored based on:

- **Tech Stack Match (40%)**: Overlap with your skills
- **Role Title Match (30%)**: Relevance to desired roles
- **Location Preference (20%)**: Remote work or preferred cities
- **Recency Bonus (10%)**: How recently the job was posted

## 🔧 Configuration

### Environment Variables

| Variable                  | Default | Description                     |
| ------------------------- | ------- | ------------------------------- |
| `SCRAPING_INTERVAL_DAYS`  | 3       | Days between scraping runs      |
| `MAX_CONCURRENT_SCRAPERS` | 3       | Parallel browser instances      |
| `HEADLESS_MODE`           | true    | Run browsers in headless mode   |
| `TOP_JOBS_COUNT`          | 5       | Number of top jobs to select    |
| `MIN_SCORE_THRESHOLD`     | 0.3     | Minimum score for job selection |

### Resume Configuration

Update `src/util/resume.json` with:

- Personal information
- Desired roles and job titles
- Technical skills and technologies
- Location preferences
- Experience level

## 📈 Monitoring & Logs

**View application logs:**

```bash
docker-compose logs -f job-scraper
```

**Check database:**

```bash
docker-compose exec postgres psql -U scraper_user -d job_scraper
```

**Recent results:**

```bash
bun run src/index.ts status
```

## 🚨 Troubleshooting

### Common Issues

1. **Database Connection Failed**

   - Ensure PostgreSQL is running: `docker-compose up postgres`
   - Check database credentials in `.env`

2. **Playwright Browser Issues**

   - Install system dependencies: `bun install`
   - For Docker: Browser dependencies are included in Dockerfile

3. **No Jobs Found**

   - Check your resume.json configuration
   - Verify internet connection
   - Review search queries in logs

4. **Low Job Scores**
   - Adjust `MIN_SCORE_THRESHOLD` in `.env`
   - Update tech stack in resume.json
   - Check job matching algorithm

### Debug Mode

Run with debug logging:

```bash
LOG_LEVEL=debug bun run src/index.ts
```

## 🔮 Future Enhancements

- **Job Application Automation**: Auto-fill and submit applications
- **Email Notifications**: Get notified of new top jobs
- **Web Dashboard**: View results in a web interface
- **More Job Sites**: Add support for additional job boards
- **AI-Powered Matching**: Enhanced job relevance scoring
- **Resume Optimization**: Suggestions based on job requirements

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh) runtime
- Web scraping powered by [Playwright](https://playwright.dev)
- Database: [PostgreSQL](https://postgresql.org)
- Containerization: [Docker](https://docker.com)

---

**Happy Job Hunting! 🎯**
