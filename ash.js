// ================================
// IMPORTS
// ================================
import fetch from "node-fetch";
import fs from "fs";
import { load } from "cheerio";
import { decode } from "html-entities";
import pLimit from "p-limit";

// ================================
// CONFIG
// ================================
const SERP_API_KEY = process.env.SERP_API_KEY || "";
const GOOGLE_SEARCH_URL = "https://serpapi.com/search.json";

const limit = pLimit(25); // HIGH concurrency but safe

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
  organic.forEach((r) => r.link && urls.add(r.link));
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
          jobPostings { id title locationName workplaceType employmentType compensationTierSummary }
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
          id title locationName workplaceType employmentType descriptionHtml
          compensationTierSummary scrapeableCompensationSalarySummary
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

  console.error("=== JOB SCRAPER STARTED ===");

  const all = [];

  // ASHBY
  const ashUrls = await fetchGoogleResults("jobs.ashbyhq.com", keyword, daysBack);
  const ashOrgs = [...new Set(ashUrls.map(extractAshbyOrg).filter(Boolean))];

  for (const org of ashOrgs) {
    const short = await fetchAshbyJobs(org);

    const detailed = await Promise.all(
      short.map((job) =>
        limit(async () => {
          const [detail, ts] = await Promise.all([
            fetchAshbyDetail(org, job.id),
            fetchAshbyTimestamp(org, job.id)
          ]);

          if (!passesDateFilter(ts, daysBack)) return null;

          return {
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
          };
        })
      )
    );

    all.push(...detailed.filter(Boolean));
  }

  // GREENHOUSE
  const ghUrls = await fetchGoogleResults("boards.greenhouse.io", keyword, daysBack);
  const ghOrgs = [...new Set(ghUrls.map(extractGreenhouseOrg).filter(Boolean))];

  for (const org of ghOrgs) {
    const jobs = await fetchGreenhouseJobs(org);
    for (const j of jobs) {
      const ts = j.created_at || j.updated_at;
      if (!passesDateFilter(ts, daysBack)) continue;

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

  // SORT: MOST RECENT FIRST
  all.sort((a, b) => {
    const A = Date.parse(a.timestamp) || 0;
    const B = Date.parse(b.timestamp) || 0;
    return B - A;
  });

  // SAVE TO /tmp for Railway
  fs.writeFileSync("/tmp/jobs.json", JSON.stringify(all, null, 2));

  console.log(JSON.stringify({ jobs: all, count: all.length }, null, 2));
}

main();
