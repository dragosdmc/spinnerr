import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();
const configPath = path.join("/app/config", "config.json");

// Helpers -------------------------------
function readConfig() {
  try {
    const raw = fs.readFileSync(configPath);
    const parsed = JSON.parse(raw);
    return { containers: parsed.containers || [] };
  } catch (err) {
    console.error("Failed to read config:", err);
    return { containers: [] };
  }
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Routes --------------------------------

// GET all containers
router.get("/", (req, res) => {
  res.json(readConfig().containers);
});

// GET one container
router.get("/:name", (req, res) => {
  const { containers } = readConfig();
  const container = containers.find(c => c.name === req.params.name);
  if (!container) return res.status(404).json({ error: "Container not found" });
  res.json(container);
});

// ADD container
router.post("/", (req, res) => {
  const newContainer = req.body;
  if (!newContainer || !newContainer.name) {
    return res.status(400).json({ error: "Missing container name" });
  }

  const config = readConfig();
  if (config.containers.find(c => c.name === newContainer.name)) {
    return res.status(400).json({ error: "Container already exists" });
  }

  config.containers.push(newContainer);
  saveConfig(config);
  res.json(newContainer);
});

// UPDATE container
router.put("/:name", (req, res) => {
  const updates = req.body;
  const config = readConfig();

  const container = config.containers.find(c => c.name === req.params.name);
  if (!container) return res.status(404).json({ error: "Container not found" });

  Object.assign(container, updates);
  saveConfig(config);
  res.json(container);
});

// DELETE container
router.delete("/:name", (req, res) => {
  const config = readConfig();
  const index = config.containers.findIndex(c => c.name === req.params.name);

  if (index === -1) return res.status(404).json({ error: "Container not found" });

  const deleted = config.containers.splice(index, 1)[0];
  saveConfig(config);
  res.json(deleted);
});

// Start a container
router.post("/:name/start", async (req, res) => {
  const name = req.params.name;

  try {
    const startContainer = req.app.locals.startContainer;
    await startContainer(name);
    res.json({ message: `Container ${name} started` });
  } catch (e) {
    res.status(500).json({ error: `Failed to start container ${name}`, details: e.message });
  }
});

// Stop a container
router.post("/:name/stop", async (req, res) => {
  const name = req.params.name;

  try {
    const stopContainer = req.app.locals.stopContainer;
    await stopContainer(name);
    res.json({ message: `Container ${name} stopped` });
  } catch (e) {
    res.status(500).json({ error: `Failed to stop container ${name}`, details: e.message });
  }
});

// Get LIVE status of a container
router.get("/:name/status", (req, res) => {
  const name = req.params.name;

  const isRunning = req.app.locals.isContainerRunning(name); // function
  const lastActivity = req.app.locals.lastActivity[name] || null; // just access property

  res.json({
    name,
    running: isRunning,
    lastActivity
  });
});

export default router;