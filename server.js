import express from "express";
import { execSync } from "child_process";
import httpProxy from "http-proxy";
import path from "path";
import fs from "fs";
import containerRoutes from "./routes/containerRoutes.js"; 

const app = express();
const proxy = httpProxy.createProxyServer({});
const waitingPage = path.join("/app/public", "waiting.html");
const config = JSON.parse(fs.readFileSync("/app/config/config.json"));
const PORT = process.env.PORT || config.port
let containers = config.containers;

const DOCKER_PROXY_URL = process.env.DOCKER_PROXY_URL || null;
const HAS_SOCKET = fs.existsSync("/var/run/docker.sock");

const lastActivity = {};
containers.forEach(c => lastActivity[c.name] = Date.now());


//---------------------------------------------------
// Log function
//---------------------------------------------------
function log(message, method) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${method}] ${message}`);
}

//---------------------------------------------------
// Check container status function
//---------------------------------------------------
function isContainerRunning(name) {
  if (HAS_SOCKET) {
    try {
      const output = execSync(`docker inspect -f '{{.State.Running}}' ${name}`).toString().trim();
      return output === "true";
    } catch {
      return false;
    }
  } else if (DOCKER_PROXY_URL) {
    try {
      const res = execSync(`curl -s ${DOCKER_PROXY_URL.replace("tcp://", "http://")}/containers/${name}/json`).toString();
      return JSON.parse(res).State.Running;
    } catch {
      return false;
    }
  }
  return false;
}

//---------------------------------------------------
// Start container function
//---------------------------------------------------
function startContainer(name) {
  if (!isContainerRunning(name)) {
    try {
      if (HAS_SOCKET) execSync(`docker start ${name}`, { stdio: "ignore" });
      else if (DOCKER_PROXY_URL) execSync(`curl -s -X POST ${DOCKER_PROXY_URL.replace("tcp://", "http://")}/containers/${name}/start`);
      log(`Started container <${name}>`);
    } catch (e) {
      log(`Failed to start ${name}:`, e.message);
    }
  }
}

//---------------------------------------------------
// Stop container function
//---------------------------------------------------
function stopContainer(name) {
  if (isContainerRunning(name)) {
    try {
      log(`Stopping container <${name}>`);
      if (HAS_SOCKET) execSync(`docker stop ${name}`, { stdio: "ignore" });
      else if (DOCKER_PROXY_URL) execSync(`curl -s -X POST ${DOCKER_PROXY_URL.replace("tcp://", "http://")}/containers/${name}/stop`);
    } catch (e) {
      log(`Failed to stop ${name}:`, e.message);
    }
  }
}

//---------------------------------------------------
// Expose control functions for backend
//---------------------------------------------------
app.use(express.json());
app.use("/api/containers", containerRoutes);

app.locals.startContainer = startContainer;
app.locals.stopContainer = stopContainer;
app.locals.isContainerRunning = isContainerRunning;
app.locals.lastActivity = lastActivity;

//---------------------------------------------------
// Web UI
//---------------------------------------------------
const UI_PORT = process.env.UI_PORT || 11000;

const ui = express();
ui.use(express.json());                     // keep JSON parsing
ui.use("/api/containers", containerRoutes); // container API routes
ui.use(express.static("/app/public/ui"));  // serve HTML/CSS/JS

ui.locals.isContainerRunning = isContainerRunning;
ui.locals.startContainer = startContainer;
ui.locals.stopContainer = stopContainer;
ui.locals.lastActivity = lastActivity;

// Start UI server
ui.listen(UI_PORT, () => {
  log(`UI running on port ${UI_PORT}`);
});


//---------------------------------------------------
// Main proxy middleware
//---------------------------------------------------
app.use(async (req, res, next) => {
  const container = containers.find(c => c.host === req.hostname);
  if (!container) return res.status(404).send("Container not found");

  // Update the timestamp when the container was last accessed via web requests
  lastActivity[container.name] = Date.now(); 

  // If the container is running, redirect to it's webpage, else start the container
  if (isContainerRunning(container.name)) {
    return proxy.web(req, res, { target: container.url });
  } else if (container.active){
    startContainer(container.name);
  }

  // If the service endpoint is reachable, serve the webpage; else serve the waiting page until ready
  try {
    const r = await fetch(`${container.url}/health`, { method: "GET" });
    if (r.ok) {
      return proxy.web(req, res, { target: container.url });
    }
  } catch {}

  res.sendFile(waitingPage);
});


//---------------------------------------------------
// Tracking the timeout
//---------------------------------------------------

const lastLog = {}; // track last log time per container

// Updated timeout for accessed endpoint, if accessed
proxy.on('proxyRes', (proxyRes, req) => {
  const container = containers.find(c => c.host === req.hostname);
  if (!container) return;

  lastActivity[container.name] = Date.now();

  const now = Date.now();
  if (!lastLog[container.name] || now - lastLog[container.name] > 5000) { // 5000 ms = 5 sec
    log(`${container.name} accessed on ${new Date(lastActivity[container.name]).toISOString()}, timeout reset`);
    lastLog[container.name] = now;
  }
});

//---------------------------------------------------
// Stop container after timeout
//---------------------------------------------------
setInterval(() => {
  const now = Date.now();
  containers.forEach(c => {
    if (c.active && now - lastActivity[c.name] > (c.idleTimeout || 60) * 1000 && isContainerRunning(c.name)) {
      stopContainer(c.name);
      log(`Container <${c.name}> stopped, timeout=${(c.idleTimeout || 60)} seconds`)
    }
  });
}, 5000);

//---------------------------------------------------
// Reload configuration function
//---------------------------------------------------
function reloadConfig() {
  try {
    const newConfig = JSON.parse(fs.readFileSync("/app/config/config.json"));
    
    // Merge lastActivity for existing containers
    newConfig.containers.forEach(c => {
      if (lastActivity[c.name] === undefined) {
        lastActivity[c.name] = Date.now();
      }
    });

    containers = newConfig.containers;
    log("Config reloaded, containers updated");
  } catch (e) {
    log("Failed to reload config:", e.message);
  }
}

//---------------------------------------------------
// Reload config when changed
//---------------------------------------------------
//fs.watch("/app/config/config.json", (eventType, filename) => {
//  if (eventType === "change") {
//    reloadConfig();
//  }
//});

fs.watchFile("/app/config/config.json", { interval: 500 }, () => {
  reloadConfig();
});

//---------------------------------------------------
// Main app, starts the app listening on the defined port
//---------------------------------------------------
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] [${HAS_SOCKET ? 'socket' : 'proxy'}] Spinnerr running on port ${PORT}`);
});
