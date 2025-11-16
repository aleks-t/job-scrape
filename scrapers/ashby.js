import { delay, stripHtml } from "../utils/helpers.js";

// ================================
// ASHBY SCRAPER
// ================================

export function extractAshbySlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.ashbyhq.com")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

export async function fetchAshbyJobs(org) {
  try {
    const res = await fetch(
      `https://jobs.ashbyhq.com/${org}?embed=true&departments=&locations=&remote=&page=0`
    );

    if (!res.ok) return [];

    const json = await res.json();
    return json.jobs || [];
  } catch {
    return [];
  }
}

export async function fetchAshbyDetail(org, jobId) {
  try {
    const res = await fetch(
      `https://jobs.ashbyhq.com/${org}/embed/job/${jobId}`
    );

    if (!res.ok) {
      console.error(`Ashby detail error ${res.status} for ${org}/${jobId}`);
      return null;
    }

    const json = await res.json();
    return json.job || null;
  } catch (err) {
    console.error(`Ashby detail exception for ${org}/${jobId}:`, err.message);
    return null;
  }
}

export async function scrapeAshby(orgs, all) {
  console.log(`[ashby] Scraping ${orgs.length} orgs concurrently...`);
  
  const results = await Promise.allSettled(
    orgs.map(async (org) => {
      try {
        const list = await fetchAshbyJobs(org);
        const jobs = [];
        
        for (const j of list) {
          await delay(100); // Small delay between job details
          const detail = await fetchAshbyDetail(org, j.id);
          
          jobs.push({
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
        
        return jobs;
      } catch (err) {
        console.error(`[ashby] Error with ${org}:`, err.message);
        return [];
      }
    })
  );
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  });
  
  console.log(`[ashby] Scraped ${all.filter(j => j.source === 'ashby').length} jobs`);
}

