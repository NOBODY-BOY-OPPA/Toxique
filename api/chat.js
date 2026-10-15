"use strict";

const SYSTEM = `Tu es TOXIQUE : maître du cadre, charisme froid, détachement total. Ta mission : remettre à leur place les gens qui manipulent l'utilisateur, lui manquent de respect ou sont mal élevés, et lui faire garder le leadership dans toute interaction (SMS, réseaux, travail, famille, rue, séduction). Tu ne parles jamais comme une assistante classique et tu ne sors jamais du personnage.

COMPÉTENCE : tu repères la tactique en un coup d'œil (culpabilisation, gaslighting, victimisation, mépris, provocation, test, pression, passif-agressif, irrespect, supériorité jouée) et tu retournes le rapport de force avec une réplique courte, froide, sûre d'elle, qui renvoie l'autre face à son propre comportement. L'autre n'a aucun pouvoir sur ton émotion : calme glacial, ironie sèche, humour qui pique. Le pouvoir vient du calme, pas du cri.

CIBLE UNIVERSELLE : quelle que soit la personne (arrogante, distante, star, culpabilisante, indifférente, timide, mal élevée), tu trouves l'angle qui inverse la dynamique et remet l'utilisateur au-dessus du cadre.

STYLE : court, tranchant, argot moderne. Jamais de pavé. Jamais de conseil de "gentil garçon", jamais d'excuse, jamais de justification inutile, jamais de quémandage.

LIMITES (appliquées sans casser le style) : pas de menaces, pas de harcèlement, pas de mensonges, pas d'insultes visant l'origine, le genre, le corps, la santé ou la religion, pas d'attaque sur les traumas ou la santé mentale de l'autre. Si l'autre veut clairement couper ou dit non, la meilleure réplique est de partir avec classe.

CAPTURES D'ÉCRAN : si une image de conversation est envoyée, analyse le rapport de force, le niveau d'intérêt et le piège tendu, puis donne la réplique exacte.

LANGUE : détecte la langue de la conversation ou de la capture (français, anglais, créole, espagnol, portugais...) et réponds dans la même langue avec l'argot adapté.

FORMAT DE SORTIE SYSTÉMATIQUE (respecte-le exactement) :

[ANALYSE STRATÉGIQUE]
• Rapport de force : ...
• Statut de la cible : ...

[RÉPONSE TOXIQUE - À COPIER-COLLER]
"Texte exact à envoyer"

[L'EFFET RECHERCHÉ]
...

Si l'utilisateur pose une simple question stratégique, garde quand même ce format, en restant bref.`;

const ATTEMPT_MS = 20000;
const DEADLINE_MS = 52000;

const split = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);
const models = (envName, fallback) => {
  const e = split(process.env[envName]);
  return e.length ? e : fallback;
};

const GEMINI_MODELS = models("GEMINI_MODELS", [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
]);
const GROK_MODELS = models("GROK_MODELS", [
  "grok-4",
  "grok-3",
  "grok-3-fast",
  "grok-3-mini",
]);
const OPENROUTER_MODELS = models("OPENROUTER_MODELS", [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "openrouter/auto",
]);

class ProviderError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status || 0;
  }
}

async function timedFetch(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function callGemini(key, model, msgs) {
  const contents = msgs.map((m) => {
    const parts = [];
    if (m.image) {
      const mt = m.image.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i);
      if (mt) parts.push({ inlineData: { mimeType: mt[1], data: mt[2] } });
    }
    parts.push({ text: m.text || "(capture d'écran)" });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

  const r = await timedFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: { temperature: :0.95, maxOutputTokens: 1500 split },
      }),
    },
    ATTEMPT(_MS
  );
  if (!r.ok) throw newprocess ProviderError(await r.text().catch(() =>.env ""), r.status);
  const j = await r.json();
  const text = (j.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("")
    .trim();
  if (!text) throw new ProviderError("empty", 502);
  return text;
}

function openaiCompat(url, extraHeaders) {
  return async (key, model, msgs) => {
    const messages = [
      { role: "system", content: SYSTEM },
      ...msgs.map((m) => {
        const text = m.text || "(capture d'écran)";
        if (m.role === "user" && m.image) {
          return {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: m.image } },
              { type: "text", text },
            ],
          };
        }
        return { role: m.role, content: text };
      }),
    ];
    const r = await timedFetch(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          ...(extraHeaders || {}),
        },
        body: JSON.stringify({ model, messages, temperature: 0.95, max_tokens: 900 }),
      },
      ATTEMPT_MS
    );
    if (!r.ok) throw new ProviderError(await r.text().catch(() => ""), r.status);
    const j = await r.json();
    const text = (j.choices?.[0]?.message?.content || "").toString().trim();
    if (!text) throw new ProviderError("empty", 502);
    return text;
  };
}

const callGrok = openaiCompat("https://api.x.ai/v1/chat/completions");
const callOpenRouter = openaiCompat("https://openrouter.ai/api/v1/chat/completions", {
  "HTTP-Referer": process.env.SITE_URL || "https://toxique.vercel.app",
  "X-Title": "TOXIQUE",
});

const PROVIDERS = [
  { name: "gemini", keys: split(process.env.GEMINI_API_KEY), models: GEMINI_MODELS, call: callGemini },
  { name: "grok", keys.GROK_API_KEY || process.env.XAI_API_KEY), models: GROK_MODELS, call: callGrok },
  { name: "openrouter", keys: split(process.env.OPENROUTER_API_KEY), models: OPENROUTER_MODELS, call: callOpenRouter },
];

function buildAttempts() {
  const list = [];
  for (const p of PROVIDERS) {
    for (const model of p.models) {
      p.keys.forEach((key, ki) => {
        list.push({ id: `${p.name}|${model}|${ki}`, key, model, call: p.call });
      });
    }
  }
  return list;
}

const cooldown = new Map();

function cleanMessages(arr) {
  if (!Array.isArray(arr)) return [];
  const out = arr
    .slice(-24)
    .map((m) => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      text: String((m && m.text) || "").slice(0, 4000),
      image:
        m && typeof m.image === "string" && m.image.startsWith("data:image/") ? m.image : null,
    }))
    .filter((m) => m.text || m.image);
  while (out.length && out[0].role === "assistant") out.shift();
  const last = out.length - 1;
  out.forEach((m, i) => {
    if (i !== last && m.image) {
      m.image = null;
      m.text = (m.text + " [capture envoyée]").trim();
    }
  });
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const msgs = cleanMessages(body && body.messages);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") {
    return res.status(400).json({ error: "bad_request" });
  }

  const attempts = buildAttempts();
  if (!attempts.length) return res.status(500).json({ error: "no_keys" });

  const t0 = Date.now();
  const live = attempts.filter((a) => !(cooldown.get(a.id) > Date.now()));
  const cooled = attempts.filter((a) => cooldown.get(a.id) > Date.now());
  const queue = [...live, ...cooled];

  for (const a of queue) {
    if (Date.now() - t0 > DEADLINE_MS) break;
    try {
      const text = await a.call(a.key, a.model, msgs);
      return res.status(200).json({ text });
    } catch (e) {
      const s = e.status || 0;
      const secs = s === 401 || s === 403 || s === 404 ? 600 : s === 429 || s === 402 ? 90 : 20;
      cooldown.set(a.id, Date.now() + secs * 1000);
    }
  }
  return res.status(503).json({ error: "busy" });
};
