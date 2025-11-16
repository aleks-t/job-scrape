#!/usr/bin/env node

import 'dotenv/config';
import fs from "fs";
import { serpSearch } from "./utils/serp.js";
import { extractJobTitleFromSerp, findMatchingJob } from "./utils/matcher.js";
import { 
  extractAshbySlug, 
  scrapeAshby 
} from "./scrapers/ashby.js";
import { 
  extractGreenhouseSlug, 
  scrapeGreenhouse 
} from "./scrapers/greenhouse.js";
import { 
  extractLeverSlug, 
  scrapeLever 
} from "./scrapers/lever.js";
import { 
  extractWorkableAccount, 
  scrapeWorkable 
} from "./scrapers/workable.js";

// ================================
// CONFIG
// ================================
const ARG_SEARCH = process.env.SEARCH_QUERY || "";
const ARG_DAYS = 3; // Always 3 days for consistency
const ARG_PAGES = parseInt(process.env.SERP_PAGES || "2", 10); // Fetch 2 pages by default

// ================================
// MAIN
// ================================
async function main() {
  console.log("=== SERP DISCOVERY ===");
  console.log(`Fetching ${ARG_PAGES} page(s) from SERP API for last ${ARG_DAYS} days...\n`);

  // Discover orgs from SERP (fetch multiple pages)
  const ashbyLinks = await serpSearch("jobs.ashbyhq.com", ARG_SEARCH, ARG_DAYS, ARG_PAGES);
  const greenhouseLinks = await serpSearch("boards.greenhouse.io", ARG_SEARCH, ARG_DAYS, ARG_PAGES);
  const leverLinks = await serpSearch("jobs.lever.co", ARG_SEARCH, ARG_DAYS, ARG_PAGES);
  const workableLinks = await serpSearch("apply.workable.com", ARG_SEARCH, ARG_DAYS, ARG_PAGES);

  // Extract SERP job titles and snippets for matching
  console.log("\n=== EXTRACTING SERP JOB TITLES ===");
  
  // Debug: Show sample URLs from SERP
  if (ashbyLinks.length > 0) {
    console.log(`[debug] Sample Ashby URL from SERP: ${ashbyLinks[0].link}`);
  }
  if (greenhouseLinks.length > 0) {
    console.log(`[debug] Sample Greenhouse URL from SERP: ${greenhouseLinks[0].link}`);
  }
  if (leverLinks.length > 0) {
    console.log(`[debug] Sample Lever URL from SERP: ${leverLinks[0].link}`);
  }
  if (workableLinks.length > 0) {
    console.log(`[debug] Sample Workable URL from SERP: ${workableLinks[0].link}`);
  }
  
  const serpJobs = {
    ashby: ashbyLinks.map(link => {
      const org = extractAshbySlug(link.link);
      if (ashbyLinks.indexOf(link) === 0) {
        console.log(`[debug] First Ashby extraction: "${link.link}" → "${org}"`);
      }
      return {
        title: extractJobTitleFromSerp(link),
        snippet: link.snippet || '',
        org: org,
        link: link.link
      };
    }).filter(j => j.org),
    greenhouse: greenhouseLinks.map(link => ({
      title: extractJobTitleFromSerp(link),
      snippet: link.snippet || '',
      org: extractGreenhouseSlug(link.link),
      link: link.link
    })).filter(j => j.org),
    lever: leverLinks.map(link => ({
      title: extractJobTitleFromSerp(link),
      snippet: link.snippet || '',
      org: extractLeverSlug(link.link),
      link: link.link
    })).filter(j => j.org),
    workable: workableLinks.map(link => ({
      title: extractJobTitleFromSerp(link),
      snippet: link.snippet || '',
      org: extractWorkableAccount(link.link),
      link: link.link
    })).filter(j => j.org)
  };

  console.log(`[scraper] Found ${serpJobs.ashby.length} recent Ashby jobs in SERP`);
  console.log(`[scraper] Found ${serpJobs.greenhouse.length} recent Greenhouse jobs in SERP`);
  console.log(`[scraper] Found ${serpJobs.lever.length} recent Lever jobs in SERP`);
  console.log(`[scraper] Found ${serpJobs.workable.length} recent Workable jobs in SERP`);

  // Extract unique org identifiers
  const ashbyOrgs = [...new Set(ashbyLinks.map(link => extractAshbySlug(link.link)).filter(Boolean))];
  const greenhouseOrgs = [...new Set(greenhouseLinks.map(link => extractGreenhouseSlug(link.link)).filter(Boolean))];
  const leverOrgs = [...new Set(leverLinks.map(link => extractLeverSlug(link.link)).filter(Boolean))];
  const workableAccounts = [...new Set(workableLinks.map(link => extractWorkableAccount(link.link)).filter(Boolean))];

  console.log("\n[scraper] Ashby orgs:", ashbyOrgs.length);
  console.log("[scraper] Greenhouse orgs:", greenhouseOrgs.length);
  console.log("[scraper] Lever orgs:", leverOrgs.length);
  console.log("[scraper] Workable accounts:", workableAccounts.length);

  const all = [];

  // Scrape each job board
  console.log("\n=== SCRAPING ASHBY ===");
  await scrapeAshby(ashbyOrgs, all);

  console.log("\n=== SCRAPING GREENHOUSE ===");
  await scrapeGreenhouse(greenhouseOrgs, all);

  console.log("\n=== SCRAPING LEVER ===");
  await scrapeLever(leverOrgs, all);

  console.log("\n=== SCRAPING WORKABLE ===");
  await scrapeWorkable(workableAccounts, all);

  console.log("\n[scraper] Total jobs:", all.length);

  // Mark recently posted jobs by matching SERP titles and descriptions
  console.log("\n=== MARKING RECENT JOBS ===");
  let recentCount = 0;
  let titleMatches = 0;
  let descMatches = 0;

  for (const job of all) {
    const serpJobsForSource = serpJobs[job.source] || [];
    const serpJobsForOrg = serpJobsForSource.filter(sj => sj.org === job.organization);
    
    if (serpJobsForOrg.length > 0) {
      // Try to match against each SERP result (title first, then description)
      for (const serpJob of serpJobsForOrg) {
        const match = findMatchingJob(serpJob.title, [job], serpJob.snippet);
        if (match) {
          job.recentlyPosted = true;
          job.matchScore = match.score;
          job.matchType = match.matchType;
          recentCount++;
          
          if (match.matchType === 'title') {
            titleMatches++;
            console.log(`[match-title] ${job.source}/${job.organization}: "${serpJob.title}" → "${job.title}" (${match.score.toFixed(0)}%)`);
          } else if (match.matchType === 'description') {
            descMatches++;
            console.log(`[match-desc] ${job.source}/${job.organization}: "${job.title}" matched via description (${match.score.toFixed(0)}%)`);
          } else {
            console.log(`[match-weak] ${job.source}/${job.organization}: "${serpJob.title}" → "${job.title}" (${match.score.toFixed(0)}%)`);
          }
          break; // Only match once per job
        }
      }
    }
  }

  console.log(`\n[scraper] Marked ${recentCount} jobs as recently posted`);
  console.log(`[scraper]   - ${titleMatches} matched by title`);
  console.log(`[scraper]   - ${descMatches} matched by description`);
  console.log(`[scraper] Total jobs: ${all.length} (${recentCount} recent, ${all.length - recentCount} older)`);

  // Save results
  fs.writeFileSync("jobs.json", JSON.stringify(all, null, 2));
  console.log("[scraper] Saved jobs.json");
}

main().catch(err => {
  console.error("[scraper] Fatal error:", err);
  process.exit(1);
});
