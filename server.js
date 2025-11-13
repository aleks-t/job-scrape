import express from "express";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// ======================================
// STATIC FRONTEND
// ======================================
app.use(express.static(path.join(__dirname, "public")));

console.log("[server] Public folder:", path.join(__dirname, "public"));

// ======================================
// /jobs API ENDPOINT
// ======================================
app.get("/jobs", (req, res) => {
  const file = "/tmp/jobs.json";

  if (!fs.existsSync(file)) {
    console.log("[server] No /tmp/jobs.json file yet");
    return res.json({ jobs: [], count: 0 });
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return res.json({ jobs: parsed, count: parsed.length });
  } catch (err) {
    console.error("[server] Error reading /tmp/jobs.json:", err);
    return res.json({ jobs: [], count: 0 });
  }
});

// ======================================
// SCRAPER RUNNER
// ======================================
function runScraper() {
  console.log("[server] Starting scraper…");

  const scraper = spawn("node", ["ash.js"], {
    cwd: __dirname,
    stdio: "inherit"
  });

  scraper.on("close", (code) => {
    console.log(`[server] Scraper finished with code ${code}`);
  });
}

// Run scraper immediately on deploy
console.log("[server] Automatic scrape triggered on startup...");
runScraper();

// ======================================
// DAILY SCRAPE
// ======================================
const DAY = 24 * 60 * 60 * 1000;

setInterval(() => {
  console.log("[server] Daily scrape triggered...");
  runScraper();
}, DAY);

// ======================================
// START SERVER
// ======================================
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
