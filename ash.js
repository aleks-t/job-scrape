// ================================
// IMPORTS
// ================================
import fs from "fs";
import { decode } from "html-entities";
import * as cheerio from "cheerio";
// Node.js 18+ has native fetch, no need to import

// ================================
// ENV VARIABLES
// ================================
const SERP_API_KEY = process.env.SERP_API_KEY;
const WEBSHARE_API_KEY = process.env.WEBSHARE_API_KEY;

if (!SERP_API_KEY) console.error("❌ SERP_API_KEY missing");
if (!WEBSHARE_API_KEY) console.error("❌ WEBSHARE_API_KEY missing");

// ================================
// CLI ARGS
// ================================
const ARG_SEARCH =
  process.argv[2] && isNaN(process.argv[2]) ? process.argv[2] : null;

const ARG_DAYS =
  Number(isNaN(process.argv[2]) ? process.argv[3] : process.argv[2]) || 3;

console.log("[scraper] Search:", ARG_SEARCH || "none");
console.log("[scraper] Days back:", ARG_DAYS);

// ================================
// HELPERS
// ================================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function todayMinus(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function stripHtml(html) {
  if (!html) return "";
  const decoded = decode(html);
  return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractAshbySlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.ashbyhq.com")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
    } catch {
    return null;
  }
}

function extractGreenhouseSlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("boards.greenhouse.io")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

function extractLeverSlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.lever.co")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

// ================================
// SERP FETCHER
// ================================
async function serpSearch(site, keyword, daysBack) {
  const query = keyword
    ? `site:${site} ${keyword}`
    : `site:${site}`;

    const params = new URLSearchParams({
      api_key: SERP_API_KEY,
      q: query,
      num: "10",
    start: "0",
    });
    
    if (daysBack) {
      params.set("tbs", `qdr:d${daysBack}`);
    }
    
  const urls = new Set();

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    const json = await res.json();

    if (json.organic_results) {
      json.organic_results.forEach(r => {
        if (r.link) urls.add(r.link);
      });
    }
      
    } catch (err) {
    console.error("[scraper] SERP error:", err.message);
  }
  
  return [...urls];
}

// ================================
// ASHBY FETCHERS
// ================================
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

  try {
    const res = await fetch(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams",
      {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      console.error(`[scraper] Ashby list error ${res.status} for ${org}`);
      return [];
    }

    const json = await res.json();
    return json.data?.jobBoard?.jobPostings || [];

  } catch (err) {
    console.error(`[scraper] Ashby list fail for ${org}:`, err.message);
    return [];
  }
}

async function fetchAshbyDetail(org, id) {
  const body = {
    operationName: "ApiJobPosting",
    variables: { organizationHostedJobsPageName: org, jobPostingId: id },
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
        }
      }
    `
  };

  try {
    const res = await fetch(
      "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobPosting",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) return null;

    const json = await res.json();
    return json.data?.jobPosting || null;

  } catch {
    return null;
  }
}

// ================================
// GREENHOUSE FETCHER
// ================================
async function fetchGreenhouseJobs(org) {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${org}/jobs?content=true`
    );

    if (!res.ok) return [];

    const json = await res.json();
    return json.jobs || [];

  } catch {
    return [];
  }
}

// ================================
// LEVER FETCHERS
// ================================
async function fetchLeverJobs(org) {
  const url = `https://jobs.lever.co/${org}`;
  console.log(`[scraper] Lever list: ${url}`);
  
  try {
    const res = await fetch(url);
    
    if (!res.ok) {
      console.error(`[scraper] Lever list error ${res.status} for ${org}`);
      return [];
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const jobs = [];
    
    $(".posting").each((_, el) => {
      const id = $(el).attr("data-qa-posting-id") || "";
      const title = $(el).find('h5[data-qa="posting-name"]').text().trim();
      const href = $(el).find("a.posting-title").attr("href") || "";
      const url = href.startsWith("http") ? href : `https://jobs.lever.co/${org}/${id}`;
      
      const categories = $(el)
        .find(".posting-categories span")
        .map((_, s) => $(s).text().trim())
        .get();
      
      jobs.push({
        id,
        title,
        categories: categories.join(", "),
        url
      });
    });
    
    return jobs;
  } catch (err) {
    console.error(`[scraper] Lever list fail for ${org}:`, err.message);
    return [];
  }
}

async function fetchLeverDetail(jobUrl) {
  try {
    const res = await fetch(jobUrl);
    
    if (!res.ok) {
      console.error(`[scraper] Lever detail error ${res.status}`);
      return { description: "", location: "" };
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const description = $('[data-qa="job-description"]')
      .text()
      .replace(/\s+/g, " ")
      .trim();
    
    // Try to extract location
    const location = $(".posting-categories .location").text().trim() || "";
    
    return { description, location };
  } catch (err) {
    console.error(`[scraper] Lever detail fail:`, err.message);
    return { description: "", location: "" };
  }
}

// ================================
// MAIN
// ================================
async function main() {
  console.log("=== SERP DISCOVERY ===");

  // Discover orgs
  const ashbyLinks = await serpSearch("jobs.ashbyhq.com", ARG_SEARCH, ARG_DAYS);
  const greenhouseLinks = await serpSearch("boards.greenhouse.io", ARG_SEARCH, ARG_DAYS);
  const leverLinks = await serpSearch("jobs.lever.co", ARG_SEARCH, ARG_DAYS);

  const ashbyOrgs = [...new Set(ashbyLinks.map(extractAshbySlug).filter(Boolean))];
  const greenhouseOrgs = [...new Set(greenhouseLinks.map(extractGreenhouseSlug).filter(Boolean))];
  const leverOrgs = [...new Set(leverLinks.map(extractLeverSlug).filter(Boolean))];

  console.log("[scraper] Ashby orgs:", ashbyOrgs.length);
  console.log("[scraper] Greenhouse orgs:", greenhouseOrgs.length);
  console.log("[scraper] Lever orgs:", leverOrgs.length);

  const all = [];

  // =======================
  // ASHBY
  // =======================
  for (const org of ashbyOrgs) {
    console.log("[scraper] Fetching Ashby jobs:", org);

    // Add delay before fetching each org to avoid rate limiting
    await delay(1000);
    
    const list = await fetchAshbyJobs(org);

    for (const j of list) {
      // Add delay between requests to avoid rate limiting (increased to 800ms)
      await delay(800);
      
      const detail = await fetchAshbyDetail(org, j.id);

      all.push({
            source: "ashby",
            organization: org,
        id: j.id,
        title: detail?.title || j.title,
        locationName: detail?.locationName || j.locationName,
        workplaceType: detail?.workplaceType || j.workplaceType,
        employmentType: detail?.employmentType || j.employmentType,
        compensation: detail?.compensationTierSummary || j.compensationTierSummary || "",
        description: detail?.descriptionHtml ? stripHtml(detail.descriptionHtml) : "",
        url: `https://jobs.ashbyhq.com/${org}/${j.id}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  // =======================
  // GREENHOUSE
  // =======================
  for (const org of greenhouseOrgs) {
    console.log("[scraper] Fetching Greenhouse jobs:", org);

    // Add delay between organizations to avoid rate limiting (increased to 1000ms)
    await delay(1000);
    
      const jobs = await fetchGreenhouseJobs(org);
      
    for (const j of jobs) {
      all.push({
        source: "greenhouse",
        organization: org,
        id: j.id,
        title: j.title,
        locationName: j.location?.name || "",
        workplaceType: "",
        employmentType: "",
        compensation: "",
        description: stripHtml(j.content),
        url: j.absolute_url,
        timestamp: new Date().toISOString()
      });
    }
  }

  // =======================
  // LEVER
  // =======================
  for (const org of leverOrgs) {
    console.log("[scraper] Fetching Lever jobs:", org);

    // Add delay between organizations to avoid rate limiting
    await delay(1000);
    
    const jobs = await fetchLeverJobs(org);

    for (const j of jobs) {
      // Add delay between detail requests
      await delay(800);
      
      const detail = await fetchLeverDetail(j.url);
      
      all.push({
        source: "lever",
        organization: org,
        id: j.id,
        title: j.title,
        locationName: detail.location || "",
        workplaceType: "",
        employmentType: "",
        compensation: "",
        description: detail.description,
        url: j.url,
        timestamp: new Date().toISOString()
      });
    }
  }

  console.log("[scraper] Total jobs:", all.length);

  fs.writeFileSync("jobs.json", JSON.stringify(all, null, 2));
  console.log("[scraper] Saved jobs.json");
}

main().catch(err => {
  console.error("Fatal error:", err);
});
