// ================================
// SERP API SEARCH
// ================================

const SERP_API_KEY = process.env.SERP_API_KEY || "your_serp_api_key_here";

/**
 * Search SERP API with pagination support
 * @param {string} site - Site to search (e.g., "jobs.ashbyhq.com")
 * @param {string} keyword - Optional search keyword
 * @param {number} daysBack - Days to search back
 * @param {number} pages - Number of pages to fetch (default: 1, max: 3)
 */
export async function serpSearch(site, keyword = "", daysBack = 3, pages = 1) {
  const query = keyword ? `site:${site} ${keyword}` : `site:${site}`;
  const dateRestrict = `d${daysBack}`;
  
  const allResults = [];
  
  // Fetch multiple pages
  for (let page = 0; page < Math.min(pages, 3); page++) {
    const start = page * 100; // Google results start parameter
    
    const params = new URLSearchParams({
      q: query,
      location: "United States",
      hl: "en",
      gl: "us",
      google_domain: "google.com",
      api_key: SERP_API_KEY,
      num: "100",
      start: start.toString(),
      dateRestrict: dateRestrict,
    });

    const url = `https://serpapi.com/search.json?${params}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`[SERP] Error ${res.status} for query: ${query} (page ${page + 1})`);
        break; // Stop fetching more pages if error
      }

      const json = await res.json();
      const results = json.organic_results || [];
      
      if (results.length === 0) {
        console.log(`[SERP] No more results at page ${page + 1}, stopping`);
        break; // No more results, stop pagination
      }
      
      allResults.push(...results);
      console.log(`[SERP] Fetched ${results.length} results from page ${page + 1}`);
      
      // Small delay between pages to be nice to the API
      if (page < pages - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error(`[SERP] Exception for query "${query}" (page ${page + 1}):`, err.message);
      break;
    }
  }
  
  console.log(`[SERP] Total results for "${query}": ${allResults.length}`);
  return allResults;
}

