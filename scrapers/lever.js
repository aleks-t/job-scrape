import * as cheerio from "cheerio";
import { decode } from "html-entities";
import { delay, stripHtml } from "../utils/helpers.js";

// ================================
// LEVER SCRAPER
// ================================

export function extractLeverSlug(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("jobs.lever.co")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

export async function fetchLeverJobs(org) {
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

export async function fetchLeverDetail(jobUrl) {
  try {
    const res = await fetch(jobUrl);
    
    if (!res.ok) {
      console.error(`[scraper] Lever detail error ${res.status}`);
      return { description: "", location: "" };
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const location = $(".posting-categories .location").text().trim();
    
    let description = "";
    const contentDiv = $(".content .description, .section-wrapper .section");
    if (contentDiv.length) {
      description = contentDiv
        .map((_, el) => $(el).text())
        .get()
        .join("\n\n")
        .trim();
      description = decode(description);
    }
    
    return { description, location };
  } catch (err) {
    console.error(`[scraper] Lever detail fail:`, err.message);
    return { description: "", location: "" };
  }
}

export async function scrapeLever(orgs, all) {
  for (const org of orgs) {
    console.log("[scraper] Fetching Lever jobs:", org);
    await delay(1000);
    
    const jobs = await fetchLeverJobs(org);

    for (const j of jobs) {
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
}

