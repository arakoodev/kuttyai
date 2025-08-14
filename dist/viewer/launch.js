
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

export function openInElectron(htmlString, policy={}, viewType='generic'){
  const tmp = path.join(os.tmpdir(), `kuttyai_view_${Date.now()}.html`);
  fs.writeFileSync(tmp, htmlString, "utf8");
  const electron = process.platform === "win32" ? "node_modules/.bin/electron.cmd" : "node_modules/.bin/electron";
  const main = path.join(path.dirname(new URL(import.meta.url).pathname), "electron-main.js");
  const child = spawn(electron, [main], {
    stdio: "ignore",
    env: { ...process.env, KUTTYAI_VIEW_FILE: tmp },
    detached: true,
    cwd: process.cwd()
  });
  child.unref();
}
