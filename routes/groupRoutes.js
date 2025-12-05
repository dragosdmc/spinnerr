import express from "express";
import { readConfig, saveConfig } from "./helpers.js";

const router = express.Router();

// GET all groups and their order
router.get("/", (req, res) => {
  const { groups, groupOrder } = readConfig();
  res.json({groups, groupOrder });
});

/// Add new group
router.post("/", (req, res) => {
  const { container, name, idleTimeout, active } = req.body;

  if (!container || (Array.isArray(container) && container.length === 0) || !name) {
    return res.status(400).json({ error: "Container(s) and Group Name are required" });
  }

  const config = readConfig();

  const allNames = config.containers.map(c => c.name);
  // Validate each container
  const invalidContainers = (Array.isArray(container) ? container : [container]).filter(
    c => !allNames.includes(c)
  );

  if (invalidContainers.length > 0) {
    return res.status(400).json({ error: `Container(s) do not exist: ${invalidContainers.join(", ")}` });
  }

  const newGroup = {
    container: Array.isArray(container) ? container : [container],
    name,
    idleTimeout: idleTimeout === undefined ? null : idleTimeout,
    active: active === undefined ? true : !!active,
  };

  config.groups.push(newGroup);
  saveConfig(config);

  res.json(newGroup);
});

// Update group by name
router.put("/:name", (req, res) => {
  const { name } = req.params;
  const { container, idleTimeout, active } = req.body;

  const config = readConfig();
  const group = (config.groups || []).find(g => g.name === name);

  if (!group) return res.status(404).json({ error: "Group not found" });

  if (container !== undefined) {
    // Normalize container to an array
    const containersArray = Array.isArray(container) ? container : [container];
    const allNames = config.containers.map(c => c.name);
    const invalidContainers = containersArray.filter(c => !allNames.includes(c));
    if (invalidContainers.length > 0) {
      return res
        .status(400)
        .json({ error: `Container(s) do not exist: ${invalidContainers.join(", ")}` });
    }
    group.container = containersArray;
  }

  if (idleTimeout !== undefined) group.idleTimeout = idleTimeout;
  if (active !== undefined) group.active = !!active;

  if (req.body.name !== undefined) {
    // Check for duplicate names
    const duplicate = config.groups.find(g => g.name === req.body.name && g !== group);
    if (duplicate) {
      return res.status(400).json({ error: "Group name already exists" });
    }
    group.name = req.body.name;
  }

  saveConfig(config);
  res.json(group);
});

// Delete group by name
router.delete("/:name", (req, res) => {
  const { name } = req.params;

  const config = readConfig();
  const groups = config.groups || [];
  const index = groups.findIndex(g => g.name === name);

  if (index === -1) return res.status(404).json({ error: "Group not found" });

  groups.splice(index, 1);
  saveConfig(config);

  res.json({ success: true });
});

// POST /api/groups/order
router.post("/order", (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: "Invalid order array" });

  const config = readConfig();

  // Ensure every name in order exists in groups
  const groupNames = config.groups.map(g => g.name);
  const validOrder = order.filter(name => groupNames.includes(name));

  // Update order in config
  config.groupOrder = validOrder;
  saveConfig(config);

  res.json({ message: "Group order saved", order: validOrder });
});

export default router;