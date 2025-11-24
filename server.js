import express from "express";
import { execSync } from "child_process";
import httpProxy from "http-proxy";
import path from "path";
import fs from "fs";
import configRoutes from "./routes/configRoutes.js";

const app = express();
const proxy = httpProxy.createProxyServer({});
const waitingPage = path.join("/app/public", "waiting.html");
const config = JSON.parse(fs.readFileSync("/app/config/config.json"));
const PORT = process.env.PORT || config.port
const UI_PORT = process.env.UI_PORT || 11000;
const containers = config.containers;

const DOCKER_PROXY_URL = process.env.DOCKER_PROXY_URL || null;
const HAS_SOCKET = fs.existsSync("/var/run/docker.sock");

const lastActivity = {};
containers.forEach(c => lastActivity[c.name] = Date.now());

//WEB UI

const ui = express();
ui.use(express.json());               // keep JSON parsing
ui.use("/config", configRoutes);      // API routes for config
ui.use(express.static("/app/public")); // serve the web UI files

ui.listen(UI_PORT, () => {
  log(`UI running on port ${UI_PORT}`);
});

//

function log(message, method) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${method}] ${message}`);
}

function runDockerCommand(cmd) {
  if (HAS_SOCKET) {
    return execSync(`docker ${cmd}`, { stdio: "pipe" }).toString().trim();
  } else if (DOCKER_PROXY_URL) {
    return execSync(`curl -s -X POST ${DOCKER_PROXY_URL}/containers/${cmd.replace(/\s.*/, "")}/${cmd.includes("start") ? "start" : "stop"}`).toString().trim();
  } else {
    throw new Error("No docker access method available");
  }
}

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

function startContainer(name) {
  if (!isContainerRunning(name)) {
    try {
      if (HAS_SOCKET) execSync(`docker start ${name}`, { stdio: "ignore" });
      else if (DOCKER_PROXY_URL) execSync(`curl -s -X POST ${DOCKER_PROXY_URL.replace("tcp://", "http://")}/containers/${name}/start`);
      log(`Container ${name} started`);
    } catch (e) {
      log(`Failed to start ${name}:`, e.message);
    }
  }
}

function stopContainer(name) {
  if (isContainerRunning(name)) {
    try {
      if (HAS_SOCKET) execSync(`docker stop ${name}`, { stdio: "ignore" });
      else if (DOCKER_PROXY_URL) execSync(`curl -s -X POST ${DOCKER_PROXY_URL.replace("tcp://", "http://")}/containers/${name}/stop`);
      log(`Container ${name} stopped due to inactivity`);
    } catch (e) {
      log(`Failed to stop ${name}:`, e.message);
    }
  }
}

app.get("/_status", async (req, res) => {
  const container = containers.find(c => c.host === req.hostname);
  if (!container) return res.json({ ready: false });
  try {
    const r = await fetch(`${container.url}/health`, { method: "GET" });
    res.json({ ready: r.ok });
  } catch {
    res.json({ ready: false });
  }
});

app.use(async (req, res, next) => {
  const container = containers.find(c => c.host === req.hostname);
  if (!container) return res.status(404).send("Container not found");

  lastActivity[container.name] = Date.now(); // update last activity

  if (isContainerRunning(container.name)) {
    return proxy.web(req, res, { target: container.url });
  } else {
    startContainer(container.name);
  }

  try {
    const r = await fetch(`${container.url}/health`, { method: "GET" });
    if (r.ok) {
      return proxy.web(req, res, { target: container.url });
    }
  } catch {}

  res.sendFile(waitingPage); // fallback waiting pag
});

proxy.on('proxyRes', (proxyRes, req) => {
  const container = containers.find(c => c.host === req.hostname);
  if (container) {
    lastActivity[container.name] = Date.now();
  }
});

setInterval(() => {
  const now = Date.now();
  containers.forEach(c => {
    if (now - lastActivity[c.name] > (c.idleTimeout || 300000)) {
      stopContainer(c.name);
    }
  });
}, 5000);

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] [${HAS_SOCKET ? 'socket' : 'proxy'}] Spinnerr running on port ${PORT}`);
});
