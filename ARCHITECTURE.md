# Project Architecture

This document explains the modular structure of the job scraper.

## 📁 Directory Structure

```
.
├── scraper.js              # Main orchestrator
├── server.js               # Express web server
├── scrapers/               # Individual job board scrapers
│   ├── ashby.js           # Ashby scraper
│   ├── greenhouse.js      # Greenhouse scraper
│   ├── lever.js           # Lever scraper
│   └── workable.js        # Workable scraper
├── utils/                  # Shared utilities
│   ├── helpers.js         # Common functions (delay, stripHtml, etc.)
│   └── serp.js            # SERP API search functionality
└── public/                 # Frontend files
    ├── index.html
    ├── app.js
    ├── styles.css
    └── toast-modal.css
```

## 🔧 How It Works

### 1. **Main Orchestrator** (`scraper.js`)
- Coordinates the entire scraping process
- Calls SERP API to discover companies with recent job postings
- Delegates scraping to individual job board modules
- Aggregates all results into `jobs.json`

### 2. **Scrapers** (`scrapers/*.js`)
Each scraper module exports:
- `extractXSlug(url)` - Extracts company identifier from URL
- `fetchXJobs(org)` - Gets job listings from the job board
- `fetchXDetail(org, jobId)` - Gets full job details (if needed)
- `scrapeX(orgs, all)` - Main scraping function that populates the results array

**Benefits:**
- ✅ Easy to debug individual job boards
- ✅ Easy to add new job boards (just create a new file)
- ✅ Easy to disable a job board (comment out the import)
- ✅ Clear separation of concerns

### 3. **Utilities** (`utils/*.js`)
Shared functionality used across all scrapers:
- `delay(ms)` - Rate limiting helper
- `stripHtml(html)` - Removes HTML tags from descriptions
- `serpSearch(site, keyword, daysBack)` - SERP API integration

### 4. **Web Server** (`server.js`)
- Serves the frontend dashboard
- Runs the scraper daily
- Provides `/jobs` API endpoint

## 🚀 Adding a New Job Board

To add a new job board (e.g., "SmartRecruiters"):

1. Create `scrapers/smartrecruiters.js`:
```javascript
import { delay, stripHtml } from "../utils/helpers.js";

export function extractSmartRecruitersSlug(url) {
  // Extract company identifier from URL
}

export async function fetchSmartRecruitersJobs(company) {
  // Fetch job listings
}

export async function scrapeSmartRecruiters(companies, all) {
  // Main scraping logic
}
```

2. Update `scraper.js`:
```javascript
import { 
  extractSmartRecruitersSlug, 
  scrapeSmartRecruiters 
} from "./scrapers/smartrecruiters.js";

// In main():
const smartrecruitersLinks = await serpSearch("jobs.smartrecruiters.com", ARG_SEARCH, ARG_DAYS);
const smartrecruitersOrgs = [...new Set(smartrecruitersLinks.map(extractSmartRecruitersSlug).filter(Boolean))];

await scrapeSmartRecruiters(smartrecruitersOrgs, all);
```

3. Update the frontend (`public/index.html`, `public/styles.css`) to include the new source.

That's it! The modular structure makes it easy to scale.

## 🔍 Rate Limiting

Each scraper implements rate limiting to avoid 429 errors:
- 1000ms delay between companies
- 800ms delay between job detail requests

Adjust these values in individual scraper files if needed.

## 🌐 Environment Variables

- `SERP_API_KEY` - Your SerpAPI key
- `SEARCH_QUERY` - Optional search keyword (default: "")
- `DAYS_BACK` - How many days back to search (default: 3)
- `PORT` - Web server port (default: 8080)

