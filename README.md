# Job Scraper Dashboard

A beautiful web dashboard that automatically scrapes job postings from Ashby, Greenhouse, Lever, and Workable job boards daily.

## Features

- 🔄 **Automatic Daily Scraping** - Runs every 24 hours
- 🏢 **Grouped by Company** - Jobs organized by company with expand/collapse functionality
- 💰 **Full Job Details** - Shows compensation, location, workplace type, and more
- 🎨 **Beautiful UI** - Modern, responsive interface with gradient design
- 🔍 **Smart Search** - Search by title, company, location, or description
- 📊 **Filtering & Sorting** - Filter by source, sort by recent/title/company
- 📱 **Mobile Friendly** - Works perfectly on all devices
- ⚡ **Rate Limited** - Built-in delays to avoid 402/429 errors

## Local Development

1. Set environment variables:
```bash
export SERP_API_KEY="your_serpapi_key"
export WEBSHARE_API_KEY="your_webshare_key"
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser to `http://localhost:8080`

## Deploy to Railway

1. Push your code to GitHub

2. Go to [Railway](https://railway.app) and create a new project

3. Connect your GitHub repository

4. Add environment variables in Railway:
   - `SERP_API_KEY` - Your SerpAPI key
   - `WEBSHARE_API_KEY` - Your Webshare proxy key (optional)
   - `PORT` - Set to 8080 (or Railway will auto-detect)

5. Railway will automatically:
   - Detect Node.js 18+
   - Install dependencies
   - Run `npm start`

6. Your dashboard will be live!

**Note:** This app requires Node.js 18 or higher (uses native fetch API).

## Configuration

- **Scrape Schedule**: Edit the interval in `server.js` (default: 24 hours)
- **Days to Scrape**: Default is 3 days, can be changed via `DAYS_BACK` env var
- **Port**: Set `PORT` environment variable (default: 8080)
- **Rate Limiting**: 800ms between job details, 1000ms between organizations

## API Endpoints

- `GET /jobs` - Get all scraped jobs

## Manual Scraping

To manually scrape jobs:

```bash
npm run scrape [keyword] [days]
```

Examples:
- `npm run scrape 7` - Last 7 days, all jobs
- `npm run scrape "engineer" 3` - "engineer" keyword, last 3 days

## UI Features

- **Flat List View**: Jobs displayed in a clean, scannable list
- **Expandable Descriptions**: Long descriptions have "Read more" buttons to expand
- **Hide Companies**: Hide companies with too many jobs (persists across sessions)
- **Pagination**: 50 jobs per page for fast loading
- **Live Updates**: Dashboard auto-refreshes every 2 minutes
- **Smart Filters**: Search, filter by source (Ashby/Greenhouse/Lever/Workable), and sort

## Project Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for details on the modular structure and how to add new job boards.

