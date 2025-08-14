
#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { run } from "../src/index.js";
import { openInElectron } from "../viewer/launch.js";

const program = new Command();
program.name("kuttyai").description("KuttyAI — Guardian child-safety orchestrator").version("0.2.0");

function findLastTool(jsonlPath, toolName){
  if (!jsonlPath || !fs.existsSync(jsonlPath)) return null;
  const lines = fs.readFileSync(jsonlPath, "utf8").trim().split(/\r?\n/);
  for (let i=lines.length-1; i>=0; i--){
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.type === "tool" && obj.name === toolName) return obj.out;
    } catch {}
  }
  return null;
}

program.command("run")
  .option("--profile <name>", "Profile (hardened|dev)", "hardened")
  .requiredOption("-p, --prompt <pathOrUrl>", "Prompt file or URL (hierarchical XML recommended)")
  .option("-a, --agents <path>", "Agents/personas file (md/txt)")
  .option("-t, --tools <pathOrUrl>", "Tools JSON/YAML/XML (file or URL)")
  .option("--banned <path>", "JSON file of banned terms")
  .option("--domains <path>", "JSON file of allowed domains")
  .option("-m, --model <name>", "OpenAI model (default env KUTTYAI_MODEL or gpt-4.1-mini)")
  .option("-i, --input <text>", "User input (if omitted, reads stdin)")
  .option("--max-steps <n>", "Max tool-call steps", "16")
  .option("--jsonl <file>", "Save conversation JSONL")
  .option("--out <file>", "Save final assistant text")
  .option("--electron", "Auto-open Electron viewer for visual tools", false)
  .action(async (opts)=>{
    const jsonl = opts.jsonl || path.join(os.tmpdir(), `kuttyai_${Date.now()}.jsonl`);
    await run({ promptPathOrUrl: opts.prompt, agentsPath: opts.agents, toolsPathOrUrl: opts.tools, bannedPath: opts.banned, domainsPath: opts.domains, model: opts.model, userInput: opts.input, maxSteps: parseInt(String(opts.maxSteps),10)||16, jsonlPath: jsonl });
    if (opts.electron){
      const y = findLastTool(jsonl, "safeYouTubeSearch");
      const g = findLastTool(jsonl, "safeImageGallery");
      let html = null;
      if (y && y.embedHtml) html = y.embedHtml;
      else if (g && g.galleryHtml) html = g.galleryHtml;
      if (html) openInElectron(html);
    }
  });

program.command("perplexsearch")
  .option("--profile <name>", "Profile (hardened|dev)", "hardened")
  .description("Child-safe Perplexity-like search")
  .option("-i, --input <text>", "User query")
  .option("--banned <path>", "JSON file of banned terms")
  .option("--domains <path>", "JSON file of allowed domains")
  .option("-m, --model <name>", "OpenAI model (default env KUTTYAI_MODEL or gpt-4.1-mini)")
  .option("--max-steps <n>", "Max steps", "4")
  .option("--jsonl <file>", "Save JSONL")
  .action(async (opts)=>{
    const prompt = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "kuttyai-prompt.v1.4.xml");
    const tools = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "examples", "tools.guardian.json");
    const jsonl = opts.jsonl || path.join(os.tmpdir(), `kuttyai_${Date.now()}.jsonl`);
    await run({ promptPathOrUrl: prompt, toolsPathOrUrl: tools, bannedPath: opts.banned, domainsPath: opts.domains, model: opts.model, userInput: opts.input, maxSteps: parseInt(String(opts.maxSteps),10)||4, jsonlPath: jsonl });
  });

program.command("gallery")
  .option("--profile <name>", "Profile (hardened|dev)", "hardened")
  .description("Child-safe image gallery search (Electron display supported)")
  .option("-i, --input <text>", "User query")
  .option("--banned <path>", "JSON file of banned terms")
  .option("--domains <path>", "JSON file of allowed domains")
  .option("-m, --model <name>", "OpenAI model")
  .option("--max-steps <n>", "Max steps", "2")
  .option("--electron", "Open Electron viewer", true)
  .action(async (opts)=>{
    const prompt = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "kuttyai-prompt.v1.4.xml");
    const tools = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "examples", "tools.guardian.json");
    const jsonl = path.join(os.tmpdir(), `kuttyai_${Date.now()}.jsonl`);
    const input = opts.input || "cute rain cloud drawings for kids";
    await run({ promptPathOrUrl: prompt, toolsPathOrUrl: tools, bannedPath: opts.banned, domainsPath: opts.domains, model: opts.model, userInput: input, maxSteps: parseInt(String(opts.maxSteps),10)||2, jsonlPath: jsonl });
    const g = findLastTool(jsonl, "safeImageGallery");
    if (opts.electron && g && g.galleryHtml) openInElectron(g.galleryHtml, { allowDomains: JSON.parse(require('node:fs').readFileSync(opts.domains,'utf8')).domains || JSON.parse(require('node:fs').readFileSync(opts.domains,'utf8')), bannedTerms: JSON.parse(require('node:fs').readFileSync(opts.banned,'utf8')).banned || JSON.parse(require('node:fs').readFileSync(opts.banned,'utf8')) }, 'gallery');
  });

program.command("youtube")
  .option("--profile <name>", "Profile (hardened|dev)", "hardened")
  .description("Child-safe YouTube search (Electron display supported)")
  .option("-i, --input <text>", "User query")
  .option("--banned <path>", "JSON file of banned terms")
  .option("--domains <path>", "JSON file of allowed domains")
  .option("-m, --model <name>", "OpenAI model")
  .option("--max-steps <n>", "Max steps", "2")
  .option("--electron", "Open Electron viewer", true)
  .action(async (opts)=>{
    const prompt = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "kuttyai-prompt.v1.4.xml");
    const tools = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "examples", "tools.guardian.json");
    const jsonl = path.join(os.tmpdir(), `kuttyai_${Date.now()}.jsonl`);
    const input = opts.input || "water cycle for kids video";
    await run({ promptPathOrUrl: prompt, toolsPathOrUrl: tools, bannedPath: opts.banned, domainsPath: opts.domains, model: opts.model, userInput: input, maxSteps: parseInt(String(opts.maxSteps),10)||2, jsonlPath: jsonl });
    const y = findLastTool(jsonl, "safeYouTubeSearch");
    if (opts.electron && y && y.embedHtml) openInElectron(y.embedHtml, { allowDomains: JSON.parse(require('node:fs').readFileSync(opts.domains,'utf8')).domains || JSON.parse(require('node:fs').readFileSync(opts.domains,'utf8')), bannedTerms: JSON.parse(require('node:fs').readFileSync(opts.banned,'utf8')).banned || JSON.parse(require('node:fs').readFileSync(opts.banned,'utf8')) }, 'youtube');
  });

program.parseAsync(process.argv);
