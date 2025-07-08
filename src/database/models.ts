export interface JobListing {
  id?: number;
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
  scraped_at?: Date;
  score?: number;
  is_top_pick?: boolean;
  session_id?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface ScrapingSession {
  id?: number;
  session_date: Date;
  total_jobs_found?: number;
  top_jobs_selected?: number;
  search_queries?: string[];
  status?: "running" | "completed" | "failed";
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
}

export interface PreferredSite {
  id?: number;
  name: string;
  base_url: string;
  is_active?: boolean;
  scraper_config?: any;
  created_at?: Date;
}

export interface SearchQuery {
  id?: number;
  query: string;
  site?: string;
  results_count?: number;
  session_id?: number;
  executed_at?: Date;
}

export interface ResumeData {
  candidate: {
    name: string;
    email: string;
    phone: string;
    portfolio: string;
    location: string[];
    experience_years: number;
    roles: string[];
    tech_stack: string[];
    resume_links: {
      pdf: string;
      linkedin: string;
      github: string;
    };
  };
}
