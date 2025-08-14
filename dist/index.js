
import fs from "node:fs";
import { Readable } from "node:stream";
import { parse as parseYaml } from "yaml";
import { parseStringPromise as parseXml } from "xml2js";
import stripJsonComments from "strip-json-comments";
import OpenAI from "openai";
import { toOpenAITools } from "./toolkit/index.js";

const isHttp = (s) => /^https?:\/\//i.test(s||"");

async function fetchText(p) {
  if (!p) return "";
  if (isHttp(p)) {
    const https = await import("node:https");
    return await new Promise((resolve, reject)=>{
      const req = https.request(p, (res)=>{
        if (res.statusCode && res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode} for ${p}`));
        let data=""; res.setEncoding("utf8");
        res.on("data",(c)=> data+=c); res.on("end",()=> resolve(data));
      }); req.on("error", reject); req.end();
    });
  } else return fs.readFileSync(p,"utf8");
}

async function loadPrompt({ promptPathOrUrl, agentsPath }) {
  const main = await fetchText(promptPathOrUrl);
  const agents = agentsPath ? await fetchText(agentsPath) : "";
  return [main, agents].filter(Boolean).join("\n\n");
}

async function loadToolsFile(pathOrUrl) {
  if (!pathOrUrl) return null;
  const raw = await fetchText(pathOrUrl);
  try { return JSON.parse(stripJsonComments(raw)); } catch {}
  try { return parseYaml(raw);} catch {}
  try { return await parseXml(raw,{explicitArray:false}); } catch {}
  throw new Error("Unable to parse tools file (JSON/YAML/XML).");
}

function extractPrompts(systemPrompt) {
  const out = {};
  const re = (tag) => {
    const m = systemPrompt.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    return m ? m[1].trim() : null;
  };
  out.curatorPrompt = re("curatorPrompt");
  out.commentsModerationPrompt = re("commentsModerationPrompt");
  out.perplexSearchPrompt = re("perplexSearchPrompt");
  out.galleryPrompt = re("galleryPrompt");
  return out;
}

async function loadJson(p){
  if (!p) return null;
  const fsP = await import("node:fs/promises");
  try {
    const raw = await fsP.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch { return null; }
}
function normalizeBanned(obj){
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.map(String);
  let out = [];
  for (const k of ["banned","extra","terms","words","blocklist"]) if (Array.isArray(obj[k])) out = out.concat(obj[k].map(String));
  return out;
}
function normalizeDomains(obj){
  if (!obj) return [];
  if (Array.isArray(obj)) return obj.map(String);
  if (Array.isArray(obj.domains)) return obj.domains.map(String);
  return [];
}

function appendJsonl(file, obj){ if (!file) return; fs.appendFileSync(file, JSON.stringify(obj)+"\n"); }
function writeOut(file, text){ if (!file) return; fs.writeFileSync(file, text); }

export async function run(opts){
  const { promptPathOrUrl, agentsPath, toolsPathOrUrl, bannedPath, domainsPath, model, userInput, cwd=process.cwd(), maxSteps=16, jsonlPath, outPath, dryRun } = opts;
  const systemPrompt = await loadPrompt({ promptPathOrUrl, agentsPath });
  const prompts = extractPrompts(systemPrompt);
  const toolsFile = toolsPathOrUrl ? await loadToolsFile(toolsPathOrUrl) : null;
  const { specs: toolSpecs, impls: toolImpls } = toOpenAITools(toolsFile);

  const policy = {
    bannedTerms: normalizeBanned(await loadJson(bannedPath)),
    allowDomains: normalizeDomains(await loadJson(domainsPath))
  };

  if (dryRun){
    console.log("---- DRY RUN ----");
    console.log("Tools:", toolSpecs.map(t=>t.function.name));
    console.log("Policy:", policy);
    console.log("Prompts:", Object.keys(prompts).filter(k=>prompts[k]));
    return;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const modelName = model || process.env.KUTTYAI_MODEL || "gpt-4.1-mini";

  const messages = [{ role:"system", content: systemPrompt }];
  const inputText = userInput ?? await readAllFromStdin();
  if (inputText && inputText.trim()) messages.push({ role:"user", content: inputText });

  appendJsonl(jsonlPath, { type:"start", t:Date.now(), model:modelName, tools: toolSpecs.map(t=>t.function.name) });

  let steps = 0, finalText = "";
  while (steps < maxSteps){
    steps++;
    const resp = await client.chat.completions.create({ model: modelName, messages, tools: toolSpecs, tool_choice:"auto", temperature: 0.2 });
    const msg = resp.choices[0].message;
    appendJsonl(jsonlPath, { type:"assistant", t:Date.now(), msg });

    if (msg.tool_calls && msg.tool_calls.length){
      for (const call of msg.tool_calls){
        const name = call.function.name;
        let args = {}; try { args = JSON.parse(call.function.arguments || "{}"); } catch {}
        const impl = toolImpls[name];
        if (!impl){
          messages.push({ role:"tool", tool_call_id: call.id, content: JSON.stringify({ error:`Tool ${name} not implemented.` }) });
          continue;
        }
        try {
          const out = await impl(args, { cwd, openai: client, model: modelName, prompts, policy });
          const content = limit(JSON.stringify(out, null, 2), 8000);
          messages.push({ role:"tool", tool_call_id: call.id, content });
          appendJsonl(jsonlPath, { type:"tool", t:Date.now(), name, args, out });
        } catch (e) {
          messages.push({ role:"tool", tool_call_id: call.id, content: JSON.stringify({ error: String(e) }) });
        }
      }
      continue;
    }

    finalText = msg.content || "";
    messages.push({ role:"assistant", content: finalText });
    break;
  }
  if (steps >= maxSteps) finalText += `\n\n[Stopped after ${maxSteps} steps.]`;
  if (outPath) writeOut(outPath, finalText);
  console.log(finalText);
  appendJsonl(jsonlPath, { type:"end", t:Date.now(), steps });
}

async function readAllFromStdin(){
  if (process.stdin.isTTY) return "";
  const chunks = []; for await (const c of Readable.from(process.stdin)) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}
function limit(s,max){ if ((s||"").length<=max) return s; const h=Math.floor(max*0.7); const t=max-h-30; return s.slice(0,h)+`\n...[omitted]...\n`+s.slice(-t); }
