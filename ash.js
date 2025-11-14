// ================================
// ash.js — Final Full Rewrite
// ================================
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { load } from "cheerio";
import { decode } from "html-entities";

// Output file
const OUTPUT_FILE = path.join(process.cwd(), "jobs.json");
console.error("[scraper] Writing to:", OUTPUT_FILE);

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

  return { keyword: args[0], daysBack: parseInt(args[1]) };
}

function passesDateFilter(ts, daysBack) {
  if (!daysBack || !ts) return true;
  const time = Date.parse(ts);
  if (isNaN(time)) return true;
  const cutoff = Date.now() - daysBack * 86400000;
  return time >= cutoff;
}

async function fetchGoogle(site, keyword, daysBack) {
  const params = new URLSearchParams({
    api_key: SERP_API_KEY,
    q: `site:${site}${keyword ? " " + keyword : ""}`,
    num: "10"
  });

  if (daysBack) params.set("tbs", `qdr:d${daysBack}`);

  const res = await fetch(`${GOOGLE_SEARCH_URL}?${params}`);
  const json = await res.json();
  const out = new Set();

  (json.organic_results || []).forEach(r => {
    if (r.link) out.add(r.link);
  });

  return [...out];
}

// ================================
// ASHBY
// ================================
function extractAshbyOrg(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.ashbyhq.com")) return null;
    return u.pathname.split("/").filter(Boolean)[0];
  } catch {
    return null;
  }
}

async function fetchAshbyJobs(org) {
  const query = `
    query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
      jobBoard: jobBoardWithTeams(
        organizationHostedJobsPageName: $organizationHostedJobsPageName
      ) {
        jobPostings { id title locationName workplaceType employmentType compensationTierSummary }
      }
    }
  `;

  const body = {
    operationName: "ApiJobBoardWithTeams",
    variables: { organizationHostedJobsPageName: org },
    query
  };

  const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  return json.data?.jobBoard?.jobPostings || [];
}

async function fetchAshbyDetail(org, id) {
  const query = `
    query ApiJobPosting($organizationHostedJobsPageName: String!, $jobPostingId: String!) {
      jobPosting(organizationHostedJobsPageName: $organizationHostedJobsPageName, jobPostingId: $jobPostingId) {
        id title locationName workplaceType employmentType compensationTierSummary scrapeableCompensationSalarySummary descriptionHtml
      }
    }
  `;

  const body = {
    operationName: "ApiJobPosting",
    variables: { organizationHostedJobsPageName: org, jobPostingId: id },
    query
  };

  const res = await fetch("https://jobs.ashbyhq.com/api/non-user-graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await res.json();
  return json.data?.jobPosting || null;
}

async function fetchAshbyTimestamp(org, id) {
  if (timestampCache.has(id)) return timestampCache.get(id);

  const url = `https://jobs.ashbyhq.com/${org}/${id}`;
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

  timestampCache.set(id, posted);
  return posted;
}

// ================================
// GREENHOUSE
// ================================
function extractGreenhouseOrg(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("boards.greenhouse.io")) return null;
    return u.pathname.split("/").filter(Boolean)[0];
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

  console.error("[scraper] Starting…");

  const all = [];

  // ASHBY
  console.error("[scraper] Searching Ashby orgs…");
  const ashUrls = await fetchGoogle("jobs.ashbyhq.com", keyword, daysBack);
  const ashOrgs = [...new Set(ashUrls.map(extractAshbyOrg).filter(Boolean))];

  for (const org of ashOrgs) {
    console.error("[scraper] Ashby org:", org);

    const list = await fetchAshbyJobs(org);
    for (const j of list) {
      const [detail, ts] = await Promise.all([
        fetchAshbyDetail(org, j.id),
        fetchAshbyTimestamp(org, j.id)
      ]);

      if (!passesDateFilter(ts, daysBack)) continue;

      all.push({
        source: "ashby",
        organization: org,
        id: j.id,
        title: j.title,
        locationName: detail?.locationName || j.locationName || "",
        workplaceType: detail?.workplaceType || "",
        employmentType: detail?.employmentType || "",
        compensation:
          detail?.scrapeableCompensationSalarySummary ||
          detail?.compensationTierSummary ||
          "",
        url: `https://jobs.ashbyhq.com/${org}/${j.id}`,
        description: stripHtml(detail?.descriptionHtml || ""),
        timestamp: ts || ""
      });
    }
  }

  // GREENHOUSE
  console.error("[scraper] Searching Greenhouse orgs…");
  const ghUrls = await fetchGoogle("boards.greenhouse.io", keyword, daysBack);
  const ghOrgs = [...new Set(ghUrls.map(extractGreenhouseOrg).filter(Boolean))];

  for (const org of ghOrgs) {
    console.error("[scraper] Greenhouse org:", org);

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
        url: j.absolute_url,
        description: stripHtml(j.content || ""),
        timestamp: ts || ""
      });
    }
  }

  // Sort newest first
  all.sort((a, b) => {
    return (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0);
  });

  // Save
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(all, null, 2));
  console.error(`[scraper] Saved ${all.length} jobs.`);

  console.log(JSON.stringify({ jobs: all, count: all.length }, null, 2));
}

main();
