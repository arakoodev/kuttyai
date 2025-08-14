import { safeSearch } from './toolkit/index.js'

export async function runPerplexSearch({ query, policy, keys, openai, model, topK=6 }){
  const ctx = { policy, openai, model, prompts: {}, keys };
  const search = await safeSearch({ query, topK }, ctx);
  if (!search.safe) return { safe:false, error: search.reason || 'search_failed' };
  const docs = search.results.slice(0, topK);
  let answer = '';
  if (process.env.KUTTYAI_TEST_MOCK==='1'){
    answer = 'Rain happens when tiny water droplets in clouds join together and fall to the ground as raindrops. The sun warms lakes and oceans, water turns into vapor, forms clouds, and then falls back as rain—this cycle keeps water moving on Earth. [1][2]';
  } else {
    const content = [
      { role: 'system', content: 'You are a friendly kids tutor. Explain answers simply in 4-6 short sentences. Avoid scary or mature topics.' },
      { role: 'user', content: `Question: ${query}\n\nUse these sources to answer. Cite with [1], [2], ... where relevant:\n\n${docs.map((d,i)=>`[${i+1}] ${d.title} — ${d.link}`).join('\n')}` }
    ];
    const resp = await openai.chat.completions.create({ model, messages: content, temperature: 0.3 });
    answer = resp?.choices?.[0]?.message?.content || '';
  }
  return { safe:true, answer, sources: docs };
}
