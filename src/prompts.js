import fs from 'node:fs'
import path from 'node:path'

// Load prompts from a local XML file or remote URL.
// Returns an object with tags as keys.
export async function loadPrompts(source){
  let target = source || 'kuttyai-prompt.v1.4.xml'
  if (!/^https?:/i.test(target)){
    target = path.resolve(target)
  }
  let xml = ''
  try {
    if (/^https?:/i.test(target)){
      const res = await fetch(target)
      xml = await res.text()
    } else {
      xml = fs.readFileSync(target,'utf8')
    }
  } catch {
    return {}
  }
  const out = {}
  const bodyMatch = xml.match(/<kuttyai[^>]*>([\s\S]*?)<\/kuttyai>/i)
  const body = bodyMatch ? bodyMatch[1] : xml
  const tagRegex = /<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>/g
  let m
  while ((m = tagRegex.exec(body))){
    out[m[1]] = m[2].trim()
  }
  return out
}
