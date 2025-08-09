
-- Listing Table
CREATE TABLE IF NOT EXISTS job_listings (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    company VARCHAR(255) NOT NULL,
    company_url VARCHAR(500),
    job_url VARCHAR(500) UNIQUE NOT NULL,
    description TEXT,
    requirements TEXT,
    tech_stack TEXT[],
    salary_range VARCHAR(100),
    location VARCHAR(255),
    posted_date DATE,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    score DECIMAL(3,2) DEFAULT 0.0,
    is_top_pick BOOLEAN DEFAULT FALSE,
    session_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scraping Table
CREATE TABLE IF NOT EXISTS scraping_sessions (
    id SERIAL PRIMARY KEY,
    session_date DATE NOT NULL,
    total_jobs_found INTEGER DEFAULT 0,
    top_jobs_selected INTEGER DEFAULT 0,
    search_queries TEXT[],
    status VARCHAR(50) DEFAULT 'running',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Sites Table
CREATE TABLE IF NOT EXISTS preferred_sites (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    scraper_config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Search Table
CREATE TABLE IF NOT EXISTS search_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    site VARCHAR(100),
    results_count INTEGER DEFAULT 0,
    session_id INTEGER REFERENCES scraping_sessions(id),
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index
CREATE INDEX IF NOT EXISTS idx_job_listings_session_id ON job_listings(session_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_score ON job_listings(score DESC);
CREATE INDEX IF NOT EXISTS idx_job_listings_scraped_at ON job_listings(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_listings_is_top_pick ON job_listings(is_top_pick);
CREATE INDEX IF NOT EXISTS idx_scraping_sessions_date ON scraping_sessions(session_date DESC);

-- Insert default preferred sites
INSERT INTO preferred_sites (name, base_url, scraper_config) VALUES
('YCombinator', 'https://www.ycombinator.com/jobs', '{"type": "ycombinator", "pagination": true}'),
('LinkedIn', 'https://www.linkedin.com/jobs', '{"type": "linkedin", "requires_auth": true}'),
('Indeed', 'https://indeed.com', '{"type": "indeed", "pagination": true}'),
('AngelList', 'https://angel.co/jobs', '{"type": "angellist", "pagination": true}')
ON CONFLICT DO NOTHING;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_job_listings_updated_at 
    BEFORE UPDATE ON job_listings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
