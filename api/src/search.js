// Lexical BM25 search over the SOP corpus. This is keyword retrieval, not neural embeddings,
// and the site must describe it that way.

const tokenize = (s) => s.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}.]+/u).filter((w) => w.length > 1);

export function createIndex(docs, { k1 = 1.2, b = 0.75 } = {}) {
  const toks = docs.map((d) => tokenize(`${d.title} ${d.title} ${d.text}`));
  const avg = toks.reduce((n, t) => n + t.length, 0) / Math.max(toks.length, 1);
  const df = new Map();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  const idf = (w) => Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));

  return function search(query, limit = 3) {
    const q = [...new Set(tokenize(query))];
    return docs
      .map((doc, i) => {
        const tf = new Map();
        for (const w of toks[i]) tf.set(w, (tf.get(w) ?? 0) + 1);
        let score = 0;
        for (const w of q) {
          const f = tf.get(w) ?? 0;
          if (f) score += idf(w) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avg)));
        }
        return { doc, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b2) => b2.score - a.score)
      .slice(0, limit)
      .map(({ doc, score }) => ({ id: doc.id, title: doc.title, text: doc.text, score: Number(score.toFixed(3)) }));
  };
}
