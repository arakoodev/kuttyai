import { safeSearch } from './toolkit/index.js'

export async function runPerplexSearch({ query, policy, keys, openai, model, topK=6, prompts={} }){
  const ctx = { policy, openai, model, prompts, keys };
  const search = await safeSearch({ query, topK }, ctx);
  if (!search.safe) return { safe:false, error: search.reason || 'search_failed' };
  const docs = search.results.slice(0, topK);
  let answer = '';
  if (process.env.KUTTYAI_TEST_MOCK==='1'){
    answer = 'Rain happens when tiny water droplets in clouds join together and fall to the ground as raindrops. The sun warms lakes and oceans, water turns into vapor, forms clouds, and then falls back as rain—this cycle keeps water moving on Earth. [1][2]';
  } else {
    const system = ctx.prompts.system || 'You are a friendly kids tutor. Explain answers simply in 4-6 short sentences. Avoid scary or mature topics.';
    const session = ctx.prompts.perplexsearch || '';
    const content = [
      { role: 'system', content: system },
      { role: 'user', content: `${session}\nQuestion: ${query}\n\nUse these sources to answer. Cite with [1], [2], ... where relevant:\n\n${docs.map((d,i)=>`[${i+1}] ${d.title} — ${d.link}`).join('\n')}` }
    ];
    const resp = await openai.chat.completions.create({ model, messages: content, temperature: 0.3 });
    answer = resp?.choices?.[0]?.message?.content || '';
  }
  const review = await reviewAnswerSafety(answer, ctx);
  if (!review.safe) return { safe:false, reason: review.reason || 'unsafe_answer', review };
  return { safe:true, answer, sources: docs, review };
}

async function reviewAnswerSafety(text, ctx){
  const banned = (ctx.policy?.bannedTerms || []).map(t=>String(t).toLowerCase());
  const low = String(text || '').toLowerCase();
  for (const term of banned){
    if (low.includes(term)) return { safe:false, decision:'block', llm:'banned-term', reason:`banned term: ${term}` };
  }
  if (process.env.KUTTYAI_TEST_MOCK==='1'){
    return { safe:true, decision:'allow', llm:'allow' };
  }
  let decision='allow';
  let llm='';
  try {
    const system = ctx.prompts.guardian || 'You check if text is appropriate for kids. Reply with either "allow" or "block".';
    const messages = [
      { role:'system', content:system },
      { role:'user', content:text }
    ];
    const resp = await ctx.openai.chat.completions.create({ model: ctx.model, messages, temperature:0 });
    llm = resp?.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    decision = llm.includes('block') ? 'block' : 'allow';
  } catch {}
  if (decision !== 'allow') return { safe:false, decision, llm };
  return { safe:true, decision, llm };
}
