import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join("/app/config/config.json");

class ConfigManager {
  constructor() {
    this.config = JSON.parse(fs.readFileSync(CONFIG_PATH));
  }

  load() {
    this.config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }

  save() {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  set(key, value) {
    this.config[key] = value;
    this.save();
  }

  addContainer(container) {
    this.config.containers.push(container);
    this.save();
  }

  updateContainer(name, updates) {
    const idx = this.config.containers.findIndex(c => c.name === name);
    if (idx !== -1) {
      this.config.containers[idx] = { ...this.config.containers[idx], ...updates };
      this.save();
    }
  }

  removeContainer(name) {
    this.config.containers = this.config.containers.filter(c => c.name !== name);
    this.save();
  }
}

const configManager = new ConfigManager();
export default configManager;
