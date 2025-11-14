// ================================
// IMPORTS
// ================================
import fetch from "node-fetch";
import fs from "fs";
import { load } from "cheerio";
import { decode } from "html-entities";

// ================================
// CONFIG
// ================================
const SERP_API_KEY = process.env.SERP_API_KEY || "";
const GOOGLE_SEARCH_URL = "https://serpapi.com/search.json";

const timestampCache = new Map();

// ================================
// HELPERS
// ================================
function stripHtml(html) {
  if (!html) return "";
  try {
    const decoded = decode(html);
    const $ = load(decoded);
    return $.text().replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) return { keyword: null, daysBack: 7 };
  if (args.length === 1 && /^\d+$/.test(args[0])) {
    return { keyword: null, daysBack: parseInt(args[0]) };
  }
  if (args.length === 1) return { keyword: args[0], daysBack: null };
  if (args.length === 2)
    return { keyword: args[0], daysBack: parseInt(args[1]) };
  throw new Error("Usage: node ash.js [keyword] [days]");
}

function passesDateFilter(timestampStr, daysBack) {
  if (!daysBack || !timestampStr) return true;
  const ts = Date.parse(timestampStr);
  if (isNaN(ts)) return true;
  const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

async function fetchGoogleResults(site, keyword, daysBack) {
  const urls = new Set();
  let q = `site:${site}`;
  if (keyword) q += ` ${keyword}`;

  const params = new URLSearchParams({
    api_key: SERP_API_KEY,
    q,
    num: "10"
  });

  if (daysBack) params.set("tbs", `qdr:d${daysBack}`);

  const res = await fetch(`${GOOGLE_SEARCH_URL}?${params}`);
  const json = await res.json();

  const organic = json.organic_results || [];
  organic.forEach(r => r.link && urls.add(r.link));

  return [...urls];
}

// ================================
// ASHBY
// ================================
function extractAshbyOrg(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.ashbyhq.com")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

async function fetchAshbyJobs(org) {
  const body = {
    operationName: "ApiJobBoardWithTeams",
    variables: { organizationHostedJobsPageName: org },
    query: `
      query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
        jobBoard: jobBoardWithTeams(
          organizationHostedJobsPageName: $organizationHostedJobsPageName
        ) {
          jobPostings { 
            id 
            title 
            locationName 
            workplaceType 
            employmentType 
            compensationTierSummary 
          }
        }
      }
    `
  };

  const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  return json.data?.jobBoard?.jobPostings || [];
}

async function fetchAshbyDetail(org, jobId) {
  const body = {
    operationName: "ApiJobPosting",
    variables: { organizationHostedJobsPageName: org, jobPostingId: jobId },
    query: `
      query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
        jobPosting(
          organizationHostedJobsPageName: $organizationHostedJobsPageName
          jobPostingId: $jobPostingId
        ) {
          id 
          title 
          locationName 
          workplaceType 
          employmentType
          descriptionHtml
          compensationTierSummary
          scrapeableCompensationSalarySummary
        }
      }
    `
  };

  const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  return json.data?.jobPosting || null;
}

async function fetchAshbyTimestamp(org, jobId) {
  if (timestampCache.has(jobId)) return timestampCache.get(jobId);

  const url = `https://jobs.ashbyhq.com/${org}/${jobId}`;
  const res = await fetch(url);
  const html = await res.text();
  const $ = load(html);

  let posted = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (posted) return;
    try {
      const obj = JSON.parse($(el).text());
      const arr = Array.isArray(obj) ? obj : [obj];
      for (const o of arr) {
        if (o.datePosted) {
          posted = o.datePosted;
          break;
        }
      }
    } catch {}
  });

  if (!posted) {
    posted = $('meta[property="article:published_time"]').attr("content") || null;
  }

  timestampCache.set(jobId, posted);
  return posted;
}

// ================================
// GREENHOUSE
// ================================
function extractGreenhouseOrg(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("boards.greenhouse.io")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

async function fetchGreenhouseJobs(org) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${org}/jobs?content=true`;
  const res = await fetch(url);
  const data = await res.json();
  return data.jobs || [];
}

// ================================
// MAIN
// ================================
async function main() {
  const { keyword, daysBack } = parseArgs();

  console.log("[scraper] Starting…");

  const all = [];
  let ashbyCount = 0;
  let greenhouseCount = 0;

  // ------------------------------------
  // ASHBY
  // ------------------------------------
  console.log("[scraper] Searching Ashby orgs…");

  const ashUrls = await fetchGoogleResults("jobs.ashbyhq.com", keyword, daysBack);
  const ashOrgs = [...new Set(ashUrls.map(extractAshbyOrg).filter(Boolean))];

  for (const org of ashOrgs) {
    console.log(`[scraper] Ashby org: ${org}`);
    const short = await fetchAshbyJobs(org);

    for (const job of short) {
      const [detail, ts] = await Promise.all([
        fetchAshbyDetail(org, job.id),
        fetchAshbyTimestamp(org, job.id)
      ]);

      if (!passesDateFilter(ts, daysBack)) continue;

      ashbyCount++;
      all.push({
        source: "ashby",
        organization: org,
        id: job.id,
        title: job.title,
        locationName: detail?.locationName || job.locationName || "",
        workplaceType: detail?.workplaceType || job.workplaceType || "",
        employmentType: detail?.employmentType || job.employmentType || "",
        compensation:
          detail?.scrapeableCompensationSalarySummary ||
          detail?.compensationTierSummary ||
          job.compensationTierSummary ||
          "",
        url: `https://jobs.ashbyhq.com/${org}/${job.id}`,
        description: stripHtml(detail?.descriptionHtml || ""),
        timestamp: ts || ""
      });
    }
  }

  // ------------------------------------
  // GREENHOUSE
  // ------------------------------------
  const ghUrls = await fetchGoogleResults("boards.greenhouse.io", keyword, daysBack);
  const ghOrgs = [...new Set(ghUrls.map(extractGreenhouseOrg).filter(Boolean))];

  for (const org of ghOrgs) {
    console.log(`[scraper] Greenhouse org: ${org}`);
    const jobs = await fetchGreenhouseJobs(org);

    for (const j of jobs) {
      const ts = j.created_at || j.updated_at;
      if (!passesDateFilter(ts, daysBack)) continue;

      greenhouseCount++;
      all.push({
        source: "greenhouse",
        organization: org,
        id: j.id,
        title: j.title,
        locationName: j.location?.name || "",
        workplaceType: "",
        employmentType: "",
        compensation: "",
        url: j.absolute_url,
        description: stripHtml(j.content || ""),
        timestamp: ts || ""
      });
    }
  }

  // ------------------------------------
  // SUMMARY PRINT
  // ------------------------------------
  console.log("====================================");
  console.log(`[scraper] Ashby jobs: ${ashbyCount}`);
  console.log(`[scraper] Greenhouse jobs: ${greenhouseCount}`);
  console.log(`[scraper] TOTAL jobs: ${all.length}`);
  console.log("====================================");

  // Save file
  const filePath = "/app/jobs.json";
  console.log("[scraper] Writing to:", filePath);
  fs.writeFileSync(filePath, JSON.stringify(all, null, 2));
}

main();
