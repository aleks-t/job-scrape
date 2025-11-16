// ================================
// SHARED UTILITIES
// ================================

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getRawValue(obj, key) {
  const val = obj?.[key];
  if (!val) return null;
  if (typeof val === "object" && "raw" in val) return val.raw;
  return val;
}

// Batch process promises to avoid overwhelming servers
export async function batchProcess(items, batchSize, processFn) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(items.length / batchSize)} (${batch.length} items)...`);
    
    const batchResults = await Promise.allSettled(batch.map(processFn));
    results.push(...batchResults);
    
    // Small delay between batches
    if (i + batchSize < items.length) {
      await delay(500);
    }
  }
  
  return results;
}

