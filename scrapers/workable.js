import { delay, stripHtml, batchProcess } from "../utils/helpers.js";

// ================================
// WORKABLE SCRAPER
// ================================

export function extractWorkableAccount(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("apply.workable.com")) return null;
    return u.pathname.split("/").filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

export async function fetchWorkableJobs(account) {
  const url = `https://apply.workable.com/api/v3/accounts/${account}/jobs`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json, text/plain, */*',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: '',
        department: [],
        location: [],
        workplace: [],
        worktype: []
      })
    });

    if (!response.ok) {
      console.error(`Workable list error ${response.status} for ${account}`);
      return [];
    }

    const data = await response.json();
    return data.results || [];
  } catch (err) {
    console.error(`Workable list exception for ${account}:`, err.message);
    return [];
  }
}

export async function fetchWorkableDetail(account, shortcode) {
  const url = `https://apply.workable.com/api/v2/accounts/${account}/jobs/${shortcode}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'accept': 'application/json, text/plain, */*',
      }
    });

    if (!response.ok) {
      console.error(`Workable detail error ${response.status} for ${account}/${shortcode}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error(`Workable detail exception for ${account}/${shortcode}:`, err.message);
    return null;
  }
}

export async function scrapeWorkable(accounts, all) {
  console.log(`[workable] Scraping ${accounts.length} accounts in batches of 5...`);
  
  const results = await batchProcess(accounts, 5, async (account) => {
      try {
        const jobList = await fetchWorkableJobs(account);
        console.log(`[workable] ${account}: ${jobList.length} jobs`);
        const jobs = [];
        
        // Process up to 100 jobs per company (reasonable limit)
        const jobsToProcess = jobList.slice(0, 100);
        
        for (const job of jobsToProcess) {
          await delay(100); // Small delay between job details
          const detail = await fetchWorkableDetail(account, job.shortcode);
          if (!detail) continue;

          const location = job.locations && job.locations[0] 
            ? `${job.locations[0].city || ''}, ${job.locations[0].region || ''}`.trim().replace(/^,\s*|,\s*$/g, '')
            : (job.location ? `${job.location.city || ''}, ${job.location.region || ''}`.trim().replace(/^,\s*|,\s*$/g, '') : '');

          jobs.push({
            source: "workable",
            organization: account.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            id: job.id.toString(),
            title: detail.title || job.title,
            locationName: location,
            workplaceType: job.workplace || "",
            employmentType: job.type || "",
            compensation: "",
            description: stripHtml(detail.description || ''),
            url: `https://apply.workable.com/${account}/j/${job.shortcode}/`,
            publishedDate: job.published || detail.published || null,
            timestamp: new Date().toISOString()
          });
        }
        
        if (jobList.length > 100) {
          console.log(`[workable] ${account}: Limited to 100 of ${jobList.length} jobs`);
        }
        
        return jobs;
      } catch (err) {
        console.error(`[workable] Error with ${account}:`, err.message);
        return [];
      }
    });
  
  return results;
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      all.push(...result.value);
    }
  });
  
  console.log(`[workable] Scraped ${all.filter(j => j.source === 'workable').length} jobs`);
}

