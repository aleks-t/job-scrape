// ============================================
// ash.js – Unified Ashby + Greenhouse scraper
// ============================================

import fetch from "node-fetch";
import fs from "fs";

// CLI ARGS
const ARG_SEARCH = process.argv[2] && isNaN(process.argv[2]) ? process.argv[2] : null;
const ARG_DAYS = Number(isNaN(process.argv[2]) ? process.argv[3] : process.argv[2]) || 3;

console.log("Search:", ARG_SEARCH || "none");
console.log("Days back:", ARG_DAYS);

// SERP API CONFIG
const SERP_API_KEY = "REPLACE_WITH_YOUR_KEY";
const GOOGLE_SEARCH_URL = "https://serpapi.com/search.json";

// TIME HELPERS
const now = Date.now();
const cutoffTime = now - ARG_DAYS * 24 * 60 * 60 * 1000;

// -------------------------------
// SERP DISCOVERY
// -------------------------------
async function fetchGoogleResults(site, keyword, daysBack, maxPages = 4) {
  const urls = new Set();
  let q = `site:${site}`;
  if (keyword) q += ` ${keyword}`;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      api_key: SERP_API_KEY,
      q,
      num: "10",
      start: (page * 10).toString(),
      tbs: `qdr:d${daysBack}`
    });

    try {
      const r = await fetch(`${GOOGLE_SEARCH_URL}?${params.toString()}`);
      const json = await r.json();
      const organic = json.organic_results || [];
      organic.forEach(o => o.link && urls.add(o.link));
      if (organic.length === 0) break;
    } catch (e) {
      console.log("SERP error page", page + 1, e.message);
    }
  }
  return [...urls];
}

// -------------------------------
// ASHBY HELPERS
// -------------------------------
function extractAshbySlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.ashbyhq.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

// Ashby job list
async function fetchAshbyJobs(slug) {
  const body = JSON.stringify({
    operationName: "ApiJobBoardWithTeams",
    variables: { organizationHostedJobsPageName: slug },
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
            updatedAt
          }
        }
      }
    `
  });

  try {
    const r = await fetch(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      }
    );

    const json = await r.json();
    return json.data?.jobBoard?.jobPostings || [];
  } catch (e) {
    console.log("Ashby error for slug", slug, e.message);
    return [];
  }
}

// Ashby detail (optional description)
async function fetchAshbyDetail(slug, id) {
  const body = JSON.stringify({
    operationName: "ApiJobPosting",
    variables: {
      organizationHostedJobsPageName: slug,
      jobPostingId: id.toString()
    },
    query: `
      query ApiJobPosting(
        $organizationHostedJobsPageName: String!,
        $jobPostingId: String!
      ) {
        jobPosting(
          organizationHostedJobsPageName: $organizationHostedJobsPageName,
          jobPostingId: $jobPostingId
        ) {
          id
          descriptionHtml
        }
      }
    `
  });

  try {
    const r = await fetch(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
      }
    );
    const json = await r.json();
    return json.data?.jobPosting || null;
  } catch {
    return null;
  }
}

// -------------------------------
// GREENHOUSE HELPERS
// -------------------------------
function extractGreenhouseSlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("boards.greenhouse.io")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

async function fetchGreenhouseJobs(slug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    return data.jobs || [];
  } catch (e) {
    console.log("Greenhouse error for", slug, e.message);
    return [];
  }
}

// -------------------------------
// MAIN
// -------------------------------
async function main() {
  console.log("=== SERP DISCOVERY ===");

  const ashbyUrls = await fetchGoogleResults(
    "jobs.ashbyhq.com",
    ARG_SEARCH,
    ARG_DAYS
  );
  const ghUrls = await fetchGoogleResults(
    "boards.greenhouse.io",
    ARG_SEARCH,
    ARG_DAYS
  );

  const ashbySlugs = [...new Set(ashbyUrls.map(extractAshbySlug).filter(Boolean))];
  const ghSlugs = [...new Set(ghUrls.map(extractGreenhouseSlug).filter(Boolean))];

  console.log("Ashby orgs:", ashbySlugs.length);
  console.log("Greenhouse orgs:", ghSlugs.length);

  const finalJobs = [];

  // -------- ASHBY SCRAPE --------
  for (const slug of ashbySlugs) {
    console.log("Fetching Ashby:", slug);

    const jobs = await fetchAshbyJobs(slug);

    const recent = jobs.filter(j =>
      j.updatedAt && new Date(j.updatedAt).getTime() >= cutoffTime
    );

    if (recent.length === 0) continue;

    for (const j of recent) {
      const detail = await fetchAshbyDetail(slug, j.id);
      finalJobs.push({
        source: "ashby",
        organization: slug,
        id: j.id,
        title: j.title,
        locationName: j.locationName || "",
        workplaceType: j.workplaceType || "",
        employmentType: j.employmentType || "",
        url: `https://jobs.ashbyhq.com/${slug}/${j.id}`,
        timestamp: j.updatedAt,
        description: detail?.descriptionHtml
          ? stripHtml(detail.descriptionHtml)
          : ""
      });
    }
  }

  // -------- GREENHOUSE SCRAPE --------
  for (const slug of ghSlugs) {
    console.log("Fetching Greenhouse:", slug);

    const jobs = await fetchGreenhouseJobs(slug);

    const recent = jobs.filter(j => {
      const t = j.updated_at || j.created_at;
      return t && new Date(t).getTime() >= cutoffTime;
    });

    finalJobs.push(
      ...recent.map(j => ({
        source: "greenhouse",
        organization: slug,
        id: j.id,
        title: j.title,
        locationName: j.location?.name || "",
        workplaceType: "",
        employmentType: "",
        url: j.absolute_url,
        timestamp: j.updated_at || j.created_at,
        description: stripHtml(j.content || "")
      }))
    );
  }

  // -------- FILTER BY SEARCH TERM --------
  let filtered = finalJobs;
  if (ARG_SEARCH) {
    const k = ARG_SEARCH.toLowerCase();
    filtered = finalJobs.filter(j =>
      j.title.toLowerCase().includes(k) ||
      j.organization.toLowerCase().includes(k)
    );
  }

  // SORT BY DATE DESC
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  console.log("Total jobs:", filtered.length);

  fs.writeFileSync("jobs.json", JSON.stringify(filtered, null, 2));
  console.log("Saved jobs.json");
}

// Strip HTML tags
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

main();
