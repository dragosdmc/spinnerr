import express from "express";
import configManager from "../configManager.js";

const router = express.Router();

// get config
router.get("/", (req, res) => {
  res.json(configManager.config);
});

// update port
router.post("/port", (req, res) => {
  const { port } = req.body;
  configManager.set("port", Number(port));
  res.json({ ok: true });
});

// add container
router.post("/add", (req, res) => {
  configManager.addContainer(req.body);
  res.json({ ok: true });
});

// update container
router.post("/update", (req, res) => {
  const { name, updates } = req.body;
  configManager.updateContainer(name, updates);
  res.json({ ok: true });
});

// delete container
router.post("/delete", (req, res) => {
  const { name } = req.body;
  configManager.removeContainer(name);
  res.json({ ok: true });
});

export default router;
