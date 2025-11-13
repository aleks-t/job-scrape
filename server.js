import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static frontend
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Simple in-memory status flag
let isRunning = false;

// Endpoint to check status
app.get("/api/status", (req, res) => {
  res.json({ isRunning });
});

// Manual trigger if needed
app.post("/api/scrape", async (req, res) => {
  if (isRunning) return res.json({ status: "already-running" });

  isRunning = true;
  runScraper(req.body.days || 1);
  res.json({ status: "started" });
});

// Auto-run scraper
function runScraper(daysBack = 1) {
  console.log("[server] Auto-scraper triggered…");

  const child = spawn("node", ["ash.js", String(daysBack)], {
    stdio: "inherit"
  });

  child.on("close", (code) => {
    console.log(`[server] Scraper completed with exit code ${code}`);
    isRunning = false;
  });
}

// Auto-scrape on startup
runScraper(1);

// Auto-scrape every 30 minutes
setInterval(() => runScraper(1), 30 * 60 * 1000);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
