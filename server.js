import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));

// Run scraper function
function runScraper() {
  console.log("[server] Starting scraper…");

  const scraper = spawn("node", ["ash.js"], {
    cwd: __dirname,
    stdio: "inherit"
  });

  scraper.on("close", code => {
    console.log(`[server] Scraper finished with code ${code}`);
  });
}

// API endpoint for jobs.json
app.get("/api/jobs", (req, res) => {
  try {
    const data = fs.readFileSync("/tmp/jobs.json", "utf8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.json({ jobs: [], error: "No jobs scraped yet" });
  }
});

// Trigger scrape on startup
console.log("[server] Automatic scrape triggered on startup...");
runScraper();

// Schedule scrape every 24 hours
setInterval(() => {
  console.log("[server] Daily scrape triggered…");
  runScraper();
}, 24 * 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
