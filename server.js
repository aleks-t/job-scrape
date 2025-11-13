import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JOBS_FILE = path.join(__dirname, "latest-jobs.json");

// Serve static files
app.use(express.static("public"));
app.use(express.json());

// Store scraper status
let scraperStatus = {
  lastRun: null,
  isRunning: false,
  jobCount: 0,
  error: null
};

// Function to run the scraper
async function runScraper(days = 1) {
  if (scraperStatus.isRunning) {
    console.log("Scraper already running, skipping...");
    return;
  }

  scraperStatus.isRunning = true;
  scraperStatus.error = null;
  
  console.log(`Starting scraper for last ${days} days...`);
  
  return new Promise((resolve, reject) => {
    const scraper = spawn("node", ["ash.js", String(days)]);
    let output = "";
    let errorOutput = "";

    scraper.stdout.on("data", (data) => {
      output += data.toString();
    });

    scraper.stderr.on("data", (data) => {
      errorOutput += data.toString();
      console.log(data.toString());
    });

    scraper.on("close", (code) => {
      scraperStatus.isRunning = false;
      
      if (code === 0) {
        try {
          // Parse the JSON output
          const jobs = JSON.parse(output);
          
          // Save to latest-jobs.json
          fs.writeFileSync(JOBS_FILE, JSON.stringify({
            lastUpdated: new Date().toISOString(),
            count: jobs.length,
            jobs: jobs
          }, null, 2));
          
          scraperStatus.lastRun = new Date().toISOString();
          scraperStatus.jobCount = jobs.length;
          
          console.log(`Scraper completed successfully. Found ${jobs.length} jobs.`);
          resolve(jobs);
        } catch (err) {
          console.error("Error parsing scraper output:", err);
          scraperStatus.error = err.message;
          reject(err);
        }
      } else {
        console.error(`Scraper failed with code ${code}`);
        scraperStatus.error = `Scraper failed with code ${code}`;
        reject(new Error(`Scraper failed with code ${code}`));
      }
    });

    scraper.on("error", (err) => {
      scraperStatus.isRunning = false;
      scraperStatus.error = err.message;
      console.error("Error running scraper:", err);
      reject(err);
    });
  });
}

// API endpoint to get jobs
app.get("/api/jobs", (req, res) => {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const data = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
      res.json(data);
    } else {
      res.json({ 
        lastUpdated: null, 
        count: 0, 
        jobs: [],
        message: "No jobs scraped yet. First scrape will run soon."
      });
    }
  } catch (err) {
    console.error("Error reading jobs file:", err);
    res.status(500).json({ error: "Failed to read jobs data" });
  }
});

// API endpoint to get scraper status
app.get("/api/status", (req, res) => {
  res.json(scraperStatus);
});

// API endpoint to manually trigger scraper
app.post("/api/scrape", async (req, res) => {
  const days = req.body.days || 1;
  
  if (scraperStatus.isRunning) {
    return res.status(409).json({ error: "Scraper is already running" });
  }
  
  res.json({ message: "Scraper started", days });
  
  // Run scraper in background
  runScraper(days).catch(err => {
    console.error("Scraper error:", err);
  });
});

// Schedule scraper to run daily at 9 AM
cron.schedule("0 9 * * *", () => {
  console.log("Running scheduled daily scrape...");
  runScraper(1).catch(err => {
    console.error("Scheduled scrape failed:", err);
  });
});

// Run scraper on startup if no data exists
if (!fs.existsSync(JOBS_FILE)) {
  console.log("No existing jobs data. Running initial scrape...");
  setTimeout(() => {
    runScraper(1).catch(err => {
      console.error("Initial scrape failed:", err);
    });
  }, 5000); // Wait 5 seconds after startup
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`View dashboard at http://localhost:${PORT}`);
  console.log(`Scraper scheduled to run daily at 9 AM`);
});

