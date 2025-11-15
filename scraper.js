#!/usr/bin/env node

import fs from "fs";
import { serpSearch } from "./utils/serp.js";
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
const ARG_DAYS = parseInt(process.env.DAYS_BACK || "3", 10);

// ================================
// MAIN
// ================================
async function main() {
  console.log("=== SERP DISCOVERY ===");

  // Discover orgs from SERP
  const ashbyLinks = await serpSearch("jobs.ashbyhq.com", ARG_SEARCH, ARG_DAYS);
  const greenhouseLinks = await serpSearch("boards.greenhouse.io", ARG_SEARCH, ARG_DAYS);
  const leverLinks = await serpSearch("jobs.lever.co", ARG_SEARCH, ARG_DAYS);
  const workableLinks = await serpSearch("apply.workable.com", ARG_SEARCH, ARG_DAYS);

  // Extract unique org identifiers
  const ashbyOrgs = [...new Set(ashbyLinks.map(extractAshbySlug).filter(Boolean))];
  const greenhouseOrgs = [...new Set(greenhouseLinks.map(extractGreenhouseSlug).filter(Boolean))];
  const leverOrgs = [...new Set(leverLinks.map(extractLeverSlug).filter(Boolean))];
  const workableAccounts = [...new Set(workableLinks.map(extractWorkableAccount).filter(Boolean))];

  console.log("[scraper] Ashby orgs:", ashbyOrgs.length);
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

  // Save results
  fs.writeFileSync("jobs.json", JSON.stringify(all, null, 2));
  console.log("[scraper] Saved jobs.json");
}

main().catch(err => {
  console.error("[scraper] Fatal error:", err);
  process.exit(1);
});
