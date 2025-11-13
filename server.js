// server.js
import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

const app = express();
const PORT = process.env.PORT || 8080;

const __dirnamePath = path.resolve();

// Serve public folder (HTML, JS, CSS)
const publicPath = path.join(__dirnamePath, "public");
app.use(express.static(publicPath));

// Debug log on startup
console.log("[server] Public folder:", publicPath);
if (fs.existsSync(publicPath)) {
  console.log("[server] Files:", fs.readdirSync(publicPath));
} else {
  console.log("[server] WARNING: Public folder missing!");
}

// ===============================
// API ENDPOINT: Return latest jobs
// ===============================
app.get("/api/jobs", (req, res) => {
  const filePath = "/tmp/jobs.json";

  if (!fs.existsSync(filePath)) {
    return res.status(200).json({
      jobs: [],
      count: 0,
      lastUpdated: null
    });
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const jobs = JSON.parse(raw);

    res.status(200).json({
      jobs,
      count: jobs.length,
      lastUpdated: fs.statSync(filePath).mtime
    });
  } catch (err) {
    console.error("[server] Failed reading jobs.json", err);
    res.status(500).json({ error: "Failed reading job cache" });
  }
});

// ===============================
// API: manual trigger (optional)
// ===============================
app.post("/api/scrape", (req, res) => {
  runScraper(7);
  res.json({ status: "started" });
});

// ===============================
// UI fallback route
// ===============================
app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// ===============================
// SCRAPER RUNNER
// ===============================
function runScraper(daysBack) {
  console.log(`[server] Automatic scrape triggered for past ${daysBack} days...`);

  const child = spawn("node", ["ash.js", String(daysBack)], {
    stdio: "inherit"
  });

  child.on("close", (code) => {
    console.log(`[server] Scraper finished with code ${code}`);
  });
}

// Run immediately on startup (past week)
runScraper(7);

// Run every 24 hours
const ONE_DAY = 24 * 60 * 60 * 1000;
setInterval(() => runScraper(7), ONE_DAY);

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
