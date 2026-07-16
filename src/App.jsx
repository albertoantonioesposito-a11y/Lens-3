import { useState, useEffect, useMemo, useCallback } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, LabelList,
} from "recharts";
import {
  ClerkProvider,
  SignIn,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from "@clerk/clerk-react";

// ─── TOKENS ──────────────────────────────────────────────────
const C = {
  bg: "#070d1a", surface: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.08)",
  ink: "#e2e8f0", muted: "rgba(255,255,255,0.4)",
  indigo: "#6366f1", violet: "#8b5cf6",
  green: "#22c55e", amber: "#f59e0b", orange: "#f97316", red: "#ef4444",
  teal: "#14b8a6", sky: "#38bdf8",
};

const FASCE = [
  { max: 25,  label: "BASSO",    color: "#22c55e", glow: "rgba(34,197,94,0.35)"  },
  { max: 50,  label: "MODERATO", color: "#f59e0b", glow: "rgba(245,158,11,0.35)" },
  { max: 75,  label: "ALTO",     color: "#f97316", glow: "rgba(249,115,22,0.35)" },
  { max: 101, label: "CRITICO",  color: "#ef4444", glow: "rgba(239,68,68,0.35)"  },
];
const fascia = (s) => FASCE.find((f) => s < f.max) || FASCE[3];

const INV_FASCE = [
  { max: 30,  label: "BASSO",    color: "#ef4444", glow: "rgba(239,68,68,0.35)"  },
  { max: 55,  label: "MODERATO", color: "#f59e0b", glow: "rgba(245,158,11,0.35)" },
  { max: 75,  label: "BUONO",    color: "#14b8a6", glow: "rgba(20,184,166,0.35)" },
  { max: 101, label: "ALTO",     color: "#22c55e", glow: "rgba(34,197,94,0.35)"  },
];
const invFascia = (s) => INV_FASCE.find((f) => s < f.max) || INV_FASCE[3];

const SEV = {
  critica: { color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)",  label: "CRITICA" },
  alta:    { color: "#f97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.2)", label: "ALTA"    },
  media:   { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", label: "MEDIA"   },
  bassa:   { color: "#38bdf8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.2)", label: "BASSA"   },
};

const DIMENSIONI_BASE = [
  { id: "LEG", nome: "Legale & Giudiziario", peso: 25, icon: "⚖️", desc: "Procedimenti, sanzioni antitrust, interdittive" },
  { id: "FIN", nome: "Solidità Finanziaria",  peso: 20, icon: "📊", desc: "Insolvenze, concordati, segnali di stress" },
  { id: "MED", nome: "Media & Percezione",    peso: 20, icon: "📰", desc: "Copertura stampa, inchieste, sentiment" },
  { id: "ESG", nome: "ESG & Lavoro",          peso: 15, icon: "🌿", desc: "Ambiente, sicurezza, vertenze sindacali" },
  { id: "GOV", nome: "Governance",            peso: 10, icon: "🏛️", desc: "Liste sanzioni, PEP, assetti opachi" },
  { id: "CYB", nome: "Cyber & Privacy",       peso: 10, icon: "🔐", desc: "Data breach, sanzioni Garante" },
];

const FASI = [
  { label: "Ricerca globale azienda",                          icon: "🌐" },
  { label: "Analisi rischio + Potenzialita in parallelo",      icon: "⚡" },
  { label: "Validazione fonti e calcolo score",                icon: "📐" },
];

// ─── VALIDATION ENGINE ───────────────────────────────────────
const AUTH_SOURCES = ["agcm","garanteprivacy","banca","mef.gov","anac","consob","opensanctions",
  "corriere","sole24ore","reuters","ansa","ilsole","ministero","governo.it","normattiva",
  "camera.it","senato.it","giustizia.it","registroimprese"];
const LOW_AUTH = ["facebook","reddit","quora","wikipedia","blogspot","wordpress.com"];

function validateSource(src) {
  let score = 0;
  const url   = (src.url   || "").toLowerCase();
  const title = (src.titolo || "").toLowerCase();
  // 1. authority (0-2)
  if (AUTH_SOURCES.some((a) => url.includes(a) || title.includes(a))) score += 2;
  else if (!LOW_AUTH.some((l) => url.includes(l))) score += 1;
  // 2. recency (0-2)
  if (src.year) {
    const age = new Date().getFullYear() - parseInt(src.year, 10);
    if (age <= 2) score += 2;
    else if (age <= 4) score += 1;
  } else { score += 1; }
  // 3. corroboration (0-2)
  score += src.corroborated ? 2 : 1;
  // 4. specificity (0-1)
  if (src.hasSpecifics) score += 1;
  // 5. official record (0-1)
  if (src.isOfficial) score += 1;
  // 6. ai consistency (0-1) — always 1
  score += 1;
  // 7. no contradiction (0-1)
  if (!src.contradicted) score += 1;
  return Math.min(score, 10);
}

function enrichSources(fonti, red_flags) {
  return (fonti || []).map((s, idx) => {
    const url = (s.url || "").toLowerCase();
    const isOfficial = ["gov","governo","agcm","garante","anac","consob","ministero","giustizia","camera.it","senato.it"].some((k) => url.includes(k));
    const hasSpecifics = !!(s.titolo || "").match(/\d{4}|\d+[\.,]\d+|euro|sanzione|multa|condanna|sentenza/i);
    const kw = (s.titolo || "").toLowerCase().split(" ").filter((w) => w.length > 4);
    const corroborated = (fonti || []).filter((_, i) => i !== idx).some((o) => kw.some((k) => (o.titolo || "").toLowerCase().includes(k)));
    const year = ((s.titolo || "") + (s.url || "")).match(/\b(20\d{2})\b/)?.[1];
    return { ...s, isOfficial, hasSpecifics, corroborated, year, contradicted: false };
  });
}

// ─── API ─────────────────────────────────────────────────────
function repairJson(str) {
  let s = str.trimEnd().replace(/,\s*$/, "");
  const opens = { "{": "}", "[": "]" };
  const stack = [];
  let inStr = false, esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(opens[ch]);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  if (inStr) s += '"';
  while (stack.length) s += stack.pop();
  return s;
}

function extractJson(text) {
  // Rimuove markdown, testo prima/dopo il JSON
  let clean = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  // Trova il primo { e l'ultimo } bilanciato
  const a = clean.indexOf("{");
  if (a === -1) throw new Error("Risposta non valida dal modello");
  // Cerca la } che bilancia la prima {
  let depth = 0, end = -1;
  let inStr = false, esc = false;
  for (let i = a; i < clean.length; i++) {
    const ch = clean[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\" && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{") depth++;
    if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const candidate = end !== -1 ? clean.slice(a, end + 1) : clean.slice(a);
  try { return JSON.parse(candidate); } catch (_) {}
  try { return JSON.parse(repairJson(candidate)); }
  catch (e) { throw new Error("Risposta incompleta. Riprova. (" + e.message + ")"); }
}

// ─── ANTHROPIC API con Prompt Caching ────────────────────────
// Separa la parte statica (istruzioni) da quella dinamica (query)
// La parte statica viene cachata — risparmio ~70% sui token ripetuti
function buildCachedMessages(systemPrompt, userQuery) {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" }, // cachata per 5 minuti
        },
        {
          type: "text",
          text: userQuery, // parte variabile — non cachata
        },
      ],
    },
  ];
}

async function callAPI(messages, maxTok) {
  // Se il messaggio è già strutturato (array di content), usalo direttamente
  // Altrimenti lo passa come stringa semplice
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTok || 2500,
      messages,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Errore API");
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// ─── PROMPT CON CACHING ──────────────────────────────────────
// Parte statica = istruzioni fisse (cachata)
// Parte dinamica = nome azienda + settore (non cachata)

const DISAMBIG_SYSTEM = (
  "Sei un motore di identificazione aziendale globale. " +
  "Ricevi un nome azienda e restituisci i candidati mondiali con match >= 70%. " +
  "Esegui 2 ricerche web (inglese + lingua locale). " +
  "Rispondi SOLO con JSON puro, zero testo aggiuntivo, zero backtick. " +
  'Schema: {"candidati":[{"nome":"","paese":"","citta":"","settore":"","cf_vat":"","tipo":"spa|srl|ltd|inc|gmbh|altro","match_pct":0,"desc_breve":"max 8 parole"}]}. ' +
  "Max 5 candidati ordinati per match_pct decrescente. Se azienda univoca: 1 solo candidato."
);

const RISK_SYSTEM = (
  "Sei un analista senior di due diligence reputazionale globale. " +
  "Esegui 5 ricerche web in tutte le lingue pertinenti cercando: lawsuit, sanction, investigation, fraud, bankruptcy, data-breach, ESG-violation, governance-issue. " +
  "Fonti prioritarie: OFAC, EU Sanctions, ONU, SEC, Companies House, Bundesanzeiger, KBIS, AGCM, Garante Privacy, ANAC, stampa internazionale, registri imprese locali. " +
  "Rispondi SOLO con JSON puro, zero testo, zero backtick. " +
  'Schema: {"azienda":{"nome":"","identificativo":"n.d.","settore":"","sede":"","paese":""},' +
  '"confidence":"alta|media|bassa",' +
  '"dimensioni":[{"id":"LEG","score":0,"sintesi":""},{"id":"FIN","score":0,"sintesi":""},{"id":"MED","score":0,"sintesi":""},{"id":"ESG","score":0,"sintesi":""},{"id":"GOV","score":0,"sintesi":""},{"id":"CYB","score":0,"sintesi":""}],' +
  '"red_flags":[{"titolo":"","severita":"critica|alta|media|bassa","descrizione":"","fonte":"","data":"","fonti_multiple":false}],' +
  '"punti_forza":[""],"fonti":[{"titolo":"","url":""}],"nota":""}. ' +
  "Score 0-100 (100=rischio massimo). Sintesi max 12 parole. Max 5 red_flags, max 7 fonti."
);

const INVEST_SYSTEM = (
  "Sei un analista di investment intelligence globale. " +
  "Esegui 4 ricerche web cercando: nuovi contratti, espansione internazionale, crescita fatturato, partnership, premi, bandi vinti, nuovi prodotti. " +
  "Rispondi SOLO con JSON puro, zero testo, zero backtick. " +
  'Schema: {"invest_score":0,"verdict":"acquista|monitora|evita","sintesi":"","trend":"crescita|stabile|declino",' +
  '"dimensioni_inv":[{"id":"GROWTH","nome":"Crescita ricavi","score":0,"sintesi":""},{"id":"MARKET","nome":"Posizione mercato","score":0,"sintesi":""},{"id":"INNOV","nome":"Innovazione","score":0,"sintesi":""},{"id":"TEAM","nome":"Management","score":0,"sintesi":""},{"id":"RISK_ADJ","nome":"Rischio aggiustato","score":0,"sintesi":""}],' +
  '"news_positive":[{"titolo":"","sintesi":"","fonte":"","data":"","url":""}],' +
  '"swot":{"strengths":[""],"weaknesses":[""],"opportunities":[""],"threats":[""]},' +
  '"fonti_inv":[{"titolo":"","url":""}],"nota_inv":""}. ' +
  "invest_score 0-100. Sintesi max 12 parole. Max 4 news, max 5 fonti."
);

function buildDisambiguationPrompt(query, settore) {
  // Sistema cachato + query dinamica
  return [
    {
      role: "user",
      content: [
        { type: "text", text: DISAMBIG_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: 'Azienda da identificare: "' + query + '"' + (settore ? " settore: " + settore : "") },
      ],
    },
  ];
}

function buildRiskPrompt(query, settore) {
  return [
    {
      role: "user",
      content: [
        { type: "text", text: RISK_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: 'Analizza: "' + query + '"' + (settore ? " settore: " + settore : "") },
      ],
    },
  ];
}

function buildInvestPrompt(query, riskScore, settore) {
  return [
    {
      role: "user",
      content: [
        { type: "text", text: INVEST_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: 'Analizza potenzialita: "' + query + '"' + (settore ? " settore: " + settore : "") + ". Risk score reputazionale noto: " + riskScore + "/100." },
      ],
    },
  ];
}

// ─── UI ATOMS ────────────────────────────────────────────────
function Badge({ label, color }) {
  return (
    <span style={{
      fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, fontWeight: 700,
      color, background: color + "18", border: "1px solid " + color + "35",
      padding: "2px 8px", borderRadius: 4, letterSpacing: "0.1em", flexShrink: 0,
    }}>{label}</span>
  );
}

function ConfChip({ val }) {
  const MAP = {
    alta:  { color: "#22c55e", label: "Alta affidabilita" },
    media: { color: "#f59e0b", label: "Affidabilita media" },
    bassa: { color: "#ef4444", label: "Bassa affidabilita" },
  };
  const m = MAP[val] || MAP.media;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: m.color,
      background: m.color + "14", border: "1px solid " + m.color + "30",
      padding: "4px 10px", borderRadius: 20,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, display: "inline-block" }} />
      {m.label}
    </span>
  );
}

function Skel({ h = 16, radius = 6, style = {} }) {
  return (
    <div style={{
      height: h, borderRadius: radius,
      background: "rgba(255,255,255,0.05)",
      animation: "shimmer 1.6s ease-in-out infinite",
      ...style,
    }} />
  );
}

function ScoreBar({ score, color, animated }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(score), animated ? 300 : 0);
    return () => clearTimeout(t);
  }, [score, animated]);
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
      <div style={{
        height: "100%", width: w + "%", background: color,
        boxShadow: "0 0 8px " + color, borderRadius: 2,
        transition: "width 1s cubic-bezier(0.34,1,0.64,1)",
      }} />
    </div>
  );
}

// ─── GAUGE ───────────────────────────────────────────────────
function polarPt(cx, cy, r, deg) {
  const rad = ((deg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arc(cx, cy, r, a0, a1) {
  const p0 = polarPt(cx, cy, r, a0), p1 = polarPt(cx, cy, r, a1);
  return "M " + p0.x + " " + p0.y + " A " + r + " " + r + " 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + p1.x + " " + p1.y;
}

function Gauge({ score, bands, animated, size }) {
  const sz   = size || 300;
  const bArr = bands || FASCE;
  const [d, setD] = useState(0);
  useEffect(() => {
    if (!animated) { setD(score); return; }
    let fr;
    const s0 = performance.now(), dur = 1200;
    const run = (n) => {
      const t = Math.min((n - s0) / dur, 1);
      const e = 1 - Math.pow(1 - t, 3);
      setD(Math.round(e * score));
      if (t < 1) fr = requestAnimationFrame(run);
    };
    fr = requestAnimationFrame(run);
    return () => cancelAnimationFrame(fr);
  }, [score, animated]);

  const cx = sz / 2, cy = sz * 0.47, r = sz * 0.36;
  const fs  = bArr.find((f) => score < f.max) || bArr[bArr.length - 1];
  const ang = (Math.min(d, 100) / 100) * 180;
  const tip = polarPt(cx, cy, r - 14, ang);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={sz} height={sz * 0.54} viewBox={"0 0 " + sz + " " + sz * 0.54}>
        <path d={arc(cx, cy, r, 0, 180)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={18} />
        {bArr.map((b, i) => {
          const from = i === 0 ? 0 : bArr[i - 1].max;
          const to   = Math.min(b.max, 100);
          const active = fs.label === b.label;
          return (
            <path key={i}
              d={arc(cx, cy, r, (from / 100) * 180, (to / 100) * 180 - 1)}
              fill="none" stroke={b.color} strokeWidth={18}
              opacity={active ? 1 : 0.18}
              style={{ filter: active ? "drop-shadow(0 0 8px " + b.color + ")" : "none", transition: "opacity 0.6s ease" }}
            />
          );
        })}
        {[0, 25, 50, 75, 100].map((t) => {
          const p = polarPt(cx, cy, r + 14, (t / 100) * 180);
          return (
            <text key={t} x={p.x} y={p.y + 4} textAnchor="middle"
              style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, fill: "rgba(255,255,255,0.3)" }}>
              {t}
            </text>
          );
        })}
        <line x1={cx} y1={cy} x2={tip.x} y2={tip.y}
          stroke="white" strokeWidth={2} strokeLinecap="round"
          style={{ transition: "all 1.2s cubic-bezier(0.34,1.56,0.64,1)", filter: "drop-shadow(0 0 4px rgba(255,255,255,0.6))" }} />
        <circle cx={cx} cy={cy} r={6} fill="white" />
        <circle cx={cx} cy={cy} r={3} fill="#070d1a" />
        <text x={cx} y={cy - 28} textAnchor="middle"
          style={{ fontFamily: "Inter, sans-serif", fontSize: sz * 0.17, fontWeight: 800, fill: fs.color, filter: "drop-shadow(0 0 16px " + (fs.glow || fs.color) + ")", transition: "fill 0.6s ease" }}>
          {d}
        </text>
      </svg>
      <div style={{ textAlign: "center", marginTop: -2 }}>
        <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: "0.12em", color: fs.color }}>
          {bands === INV_FASCE ? "POTENZIALE " : "RISCHIO "}{fs.label}
        </div>
        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.muted, marginTop: 2 }}>
          {bands === INV_FASCE ? "Investment Score" : "Reputational Risk Score"} · 0–100
        </div>
      </div>
    </div>
  );
}

// ─── VALIDATION PANEL ─────────────────────────────────────────
function ValidationPanel({ sources, skipped }) {
  const [open, setOpen] = useState(false);
  const passed = sources.filter((s) => s.validScore >= 9).length;
  return (
    <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 12, marginBottom: 14 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14 }}>🔬</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Validazione statistica fonti</span>
          <Badge label={passed + "/" + sources.length + " sopra soglia 9/10"} color="#22c55e" />
          {skipped > 0 && <Badge label={skipped + " scartate"} color="#f59e0b" />}
        </div>
        <span style={{ fontSize: 11, color: C.muted, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 16px", borderTop: "1px solid rgba(99,102,241,0.1)" }}>
          <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 14px", lineHeight: 1.6 }}>
            7 metriche: autorita della fonte, recency, corroborazione, specificita, atto ufficiale, consistenza AI, assenza contraddizioni. Soglia ingresso: 9/10.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sources.map((s, i) => {
              const sc  = s.validScore;
              const col = sc >= 9 ? "#22c55e" : sc >= 7 ? "#f59e0b" : "#ef4444";
              const lbl = sc >= 9 ? "Validato " + sc + "/10" : sc >= 7 ? "Parziale " + sc + "/10" : "Scartato " + sc + "/10";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                  <span style={{ fontSize: 12, color: sc >= 9 ? "rgba(255,255,255,0.7)" : C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.titolo || s.url || "Fonte " + (i + 1)}
                  </span>
                  <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <div key={j} style={{ width: 6, height: 14, borderRadius: 2, background: j < sc ? col : "rgba(255,255,255,0.07)" }} />
                    ))}
                  </div>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, fontWeight: 700, color: col, background: col + "12", border: "1px solid " + col + "25", padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>
                    {lbl}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LOADING ─────────────────────────────────────────────────
function LoadingState({ fase }) {
  return (
    <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
        {FASI.map((f, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, opacity: i === fase ? 1 : i < fase ? 0.45 : 0.2, transition: "opacity 0.4s ease" }}>
            <span style={{ fontSize: 15 }}>{f.icon}</span>
            <span style={{ fontSize: 13, color: i === fase ? "rgba(255,255,255,0.9)" : C.muted, fontWeight: i === fase ? 600 : 400 }}>{f.label}</span>
            {i === fase && (
              <span style={{ display: "inline-flex", gap: 3 }}>
                {[0, 1, 2].map((j) => (
                  <span key={j} style={{ width: 4, height: 4, borderRadius: "50%", background: C.indigo, animation: "bounce 1s ease " + j * 0.15 + "s infinite" }} />
                ))}
              </span>
            )}
            {i < fase && <span style={{ fontSize: 12, color: C.green }}>✓</span>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Skel h={130} radius={12} style={{ gridColumn: "1 / -1" }} />
        {[1, 2, 3, 4].map((i) => <Skel key={i} h={72} radius={10} />)}
      </div>
    </div>
  );
}

// ─── DISCLAIMER ──────────────────────────────────────────────
function DisclaimerBar() {
  return (
    <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "10px 16px", display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>⚠️</span>
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
        <strong style={{ color: "#f59e0b" }}>Nota affidabilita dati: </strong>
        analisi generata tramite elaborazione automatica AI su fonti web pubbliche. Le informazioni potrebbero contenere imprecisioni, essere incomplete o non aggiornate. Non costituisce parere legale, finanziario o di compliance. Verifica sempre le informazioni critiche presso le fonti primarie.
      </p>
    </div>
  );
}

// ─── PESI PANEL ──────────────────────────────────────────────
function PesiPanel({ pesi, setPesi }) {
  const [open, setOpen] = useState(false);
  const tot = Object.values(pesi).reduce((a, b) => a + b, 0) || 1;
  return (
    <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "none", border: "none", padding: "13px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, opacity: 0.7 }}>⚙️</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Pesi del modello</span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.muted }}>· policy configurabile · ricalcolo live</span>
        </div>
        <span style={{ display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontSize: 11, color: C.muted }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid " + C.border }}>
          <p style={{ fontSize: 12, color: C.muted, margin: "12px 0 16px", lineHeight: 1.6 }}>
            Modifica i pesi in base alla policy aziendale o al settore del fornitore. Il composito si ricalcola in tempo reale.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px 24px" }}>
            {DIMENSIONI_BASE.map((d) => {
              const perc = Math.round((pesi[d.id] / tot) * 100);
              return (
                <div key={d.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>{d.icon} {d.nome}</span>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: perc > 20 ? C.amber : C.muted }}>{perc}%</span>
                  </div>
                  <input type="range" min="0" max="40" value={pesi[d.id]}
                    onChange={(e) => setPesi({ ...pesi, [d.id]: Number(e.target.value) })}
                    style={{ width: "100%", accentColor: C.indigo, cursor: "pointer" }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={() => setPesi(Object.fromEntries(DIMENSIONI_BASE.map((d) => [d.id, d.peso])))}
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid " + C.border, borderRadius: 7, padding: "6px 13px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.muted, cursor: "pointer" }}>
              Ripristina default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SWOT ─────────────────────────────────────────────────────
function SwotCell({ items, label, color, icon }) {
  return (
    <div style={{ background: color + "08", border: "1px solid " + color + "20", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, color, letterSpacing: "0.08em", marginBottom: 8 }}>{icon} {label}</div>
      {(items || []).map((item, i) => (
        <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", padding: "3px 0", lineHeight: 1.4 }}>· {item}</div>
      ))}
    </div>
  );
}

// ─── NEWS CARD ───────────────────────────────────────────────
function NewsCard({ news, index }) {
  const [hover, setHover] = useState(false);
  return (
    <a href={news.url || "#"} target="_blank" rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: "block", textDecoration: "none",
        background: hover ? "rgba(20,184,166,0.06)" : "rgba(255,255,255,0.02)",
        border: "1px solid " + (hover ? "rgba(20,184,166,0.25)" : "rgba(255,255,255,0.07)"),
        borderRadius: 10, padding: "12px 14px",
        transition: "all 0.2s ease", transform: hover ? "translateY(-1px)" : "none",
        animation: "fadeSlideIn 0.35s ease " + index * 0.07 + "s both",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 4, lineHeight: 1.4 }}>{news.titolo}</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{news.sintesi}</div>
        </div>
        <span style={{ fontSize: 12, color: C.teal, flexShrink: 0 }}>↗</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
        <span>{news.fonte}</span>
        {news.data && <span>· {news.data}</span>}
      </div>
    </a>
  );
}

// ─── DIM CARD ─────────────────────────────────────────────────
function DimCard({ d, pesoNorm, animated }) {
  const [hover, setHover] = useState(false);
  const fd  = fascia(d.score);
  const dim = DIMENSIONI_BASE.find((b) => b.id === d.id) || d;
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? "rgba(255,255,255,0.05)" : C.surface,
        border: "1px solid " + (hover ? "rgba(255,255,255,0.12)" : C.border),
        borderLeft: "4px solid " + fd.color,
        borderRadius: 10, padding: "14px 16px",
        transition: "all 0.2s ease", transform: hover ? "translateY(-1px)" : "none",
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>{dim.icon}</span>
          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, color: C.muted, marginBottom: 2 }}>{d.id} · {pesoNorm}%</div>
            <div style={{ fontWeight: 600, fontSize: 13.5, color: "rgba(255,255,255,0.85)" }}>{dim.nome}</div>
          </div>
        </div>
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 22, color: fd.color, textShadow: "0 0 12px " + fd.glow }}>{d.score}</span>
      </div>
      <ScoreBar score={d.score} color={fd.color} animated={animated} />
      <div style={{ fontSize: 12, color: C.muted, marginTop: 7, lineHeight: 1.45 }}>{d.sintesi}</div>
    </div>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────
function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px" }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.35 }}>🔎</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>Nessuna analisi avviata</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 28px" }}>
        Inserisci la ragione sociale o il Codice Fiscale. Lens restituisce analisi di rischio reputazionale e potenziale di investimento.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, textAlign: "left", maxWidth: 800, margin: "0 auto" }}>
        {DIMENSIONI_BASE.map((d) => (
          <div key={d.id} style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{d.icon}</div>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginBottom: 3 }}>{d.nome}</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.4 }}>{d.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────
export default function App() {
  const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <SignedOut>
        <div style={{
          minHeight: "100vh", background: "#070d1a",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontFamily: "Inter, system-ui, sans-serif",
        }}>
          <style>{"@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap')"}</style>
          {/* Logo + titolo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" style={{ filter: "drop-shadow(0 0 10px rgba(99,102,241,0.5))" }}>
              <defs>
                <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
              <circle cx="14" cy="14" r="10" fill="url(#lg1)" />
              <circle cx="14" cy="14" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
              <ellipse cx="11" cy="10.5" rx="3.5" ry="2" fill="rgba(255,255,255,0.3)" transform="rotate(-20 11 10.5)" />
              <line x1="21.5" y1="21.5" x2="29" y2="29" stroke="url(#lg1)" strokeWidth="3.5" strokeLinecap="round" />
            </svg>
            <div>
              <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", color: "#fff" }}>Lens</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Reputational Risk Intelligence</div>
            </div>
          </div>
          {/* Box login Clerk */}
          <SignIn
            appearance={{
              elements: {
                rootBox: { width: "100%", maxWidth: 400 },
                card: {
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 16,
                  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                },
                headerTitle: { color: "#fff" },
                headerSubtitle: { color: "rgba(255,255,255,0.5)" },
                formFieldLabel: { color: "rgba(255,255,255,0.7)" },
                formFieldInput: {
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  borderRadius: 8,
                },
                formButtonPrimary: {
                  background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                  borderRadius: 8,
                  fontWeight: 700,
                },
                footerActionLink: { color: "#818cf8" },
                identityPreviewText: { color: "rgba(255,255,255,0.7)" },
                identityPreviewEditButton: { color: "#818cf8" },
              },
            }}
          />
        </div>
      </SignedOut>
      <SignedIn>
        <LensApp />
      </SignedIn>
    </ClerkProvider>
  );
}

function LensApp() {
  const [query, setQuery]         = useState("");
  const [settore, setSettore]     = useState("");
  const [stato, setStato]         = useState("idle"); // idle | disambiguating | choosing | loading | done | error
  const [fase, setFase]           = useState(0);
  const [candidati, setCandidati] = useState([]);
  const [report, setReport]       = useState(null);
  const [invReport, setInvReport] = useState(null);
  const [errore, setErrore]       = useState("");
  const [pesi, setPesi]           = useState(Object.fromEntries(DIMENSIONI_BASE.map((d) => [d.id, d.peso])));
  const [storico, setStorico]     = useState([]);
  const [followUp, setFollowUp]   = useState("");
  const [qa, setQa]               = useState([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [copiato, setCopiato]     = useState(false);
  const [tab, setTab]             = useState("rischio");
  const [focus, setFocus]         = useState(false);
  const timerHandle               = { current: null };

  useEffect(() => {
    if (stato === "loading") {
      setFase(0);
      timerHandle.current = setInterval(() => setFase((f) => Math.min(f + 1, FASI.length - 1)), 8000);
    }
    return () => clearInterval(timerHandle.current);
  }, [stato]);

  const composito = useMemo(() => {
    if (!report) return 0;
    const tot = Object.values(pesi).reduce((a, b) => a + b, 0) || 1;
    return Math.round(report.dims.reduce((acc, d) => acc + d.score * (pesi[d.id] / tot), 0));
  }, [report, pesi]);

  const validatedSources = useMemo(() => {
    if (!report) return [];
    return enrichSources(report.fonti, report.red_flags).map((s) => ({ ...s, validScore: validateSource(s) }));
  }, [report]);

  const skipped = validatedSources.filter((s) => s.validScore < 9).length;

  // Step 1 — cerca candidati globali, propone selezione se > 1
  const analizza = useCallback(async () => {
    if (!query.trim() || stato === "loading" || stato === "disambiguating") return;
    setStato("disambiguating"); setReport(null); setInvReport(null); setQa([]); setErrore(""); setCopiato(false); setTab("rischio"); setCandidati([]);
    try {
      const dText = await callAPI([{ role: "user", content: buildDisambiguationPrompt(query.trim(), settore.trim()) }], 500);
      const dJson = extractJson(dText);
      const lista = (dJson.candidati || []).filter((c) => (c.match_pct || 0) >= 70);
      if (lista.length <= 1) {
        // unico match o nessun candidato → analisi diretta
        const target = lista[0] ? lista[0].nome + (lista[0].paese ? " " + lista[0].paese : "") : query.trim();
        await analizzaTarget(target);
      } else {
        setCandidati(lista);
        setStato("choosing");
      }
    } catch (e) {
      // fallback: analisi diretta senza disambiguazione
      await analizzaTarget(query.trim());
    }
  }, [query, settore, stato, pesi]);

  // Step 2 — rischio e potenzialità in parallelo
  const analizzaTarget = useCallback(async (target) => {
    setStato("loading"); setCandidati([]);
    try {
      // Lancia entrambe le chiamate in parallelo
      const [riskText, invText] = await Promise.all([
        callAPI([{ role: "user", content: buildRiskPrompt(target, settore.trim()) }], 2500),
        callAPI([{ role: "user", content: buildInvestPrompt(target, 50, settore.trim()) }], 2000),
      ]);
      const riskJson = extractJson(riskText);
      const invJson  = extractJson(invText);
      const mappa = Object.fromEntries((riskJson.dimensioni || []).map((d) => [d.id, d]));
      const dims  = DIMENSIONI_BASE.map((d) => ({ ...d, ...(mappa[d.id] || { score: 0, sintesi: "Nessuna evidenza reperita." }) }));
      const tot   = Object.values(pesi).reduce((a, b) => a + b, 0) || 1;
      const comp  = Math.round(dims.reduce((acc, d) => acc + d.score * (pesi[d.id] / tot), 0));
      setReport({ ...riskJson, dims });
      setInvReport(invJson);
      setStorico((prev) => [
        { nome: riskJson.azienda?.nome || target, composito: comp, invest: invJson.invest_score || 0, flags: (riskJson.red_flags || []).length, confidence: riskJson.confidence },
        ...prev.filter((x) => x.nome !== (riskJson.azienda?.nome || target)),
      ].slice(0, 6));
      setStato("done");
    } catch (e) {
      setErrore(e.message);
      setStato("error");
    }
  }, [settore, pesi]);

  const approfondisci = useCallback(async () => {
    if (!followUp.trim() || qaLoading || !report) return;
    const domanda = followUp.trim();
    setQaLoading(true); setFollowUp("");
    try {
      const ctx = "Contesto: report su " + (report.azienda?.nome || "") + ", score rischio " + composito + "/100, invest " + (invReport?.invest_score || "n.d.") + "/100. Rispondi in max 120 parole, in italiano. Domanda: " + domanda;
      const risposta = await callAPI([{ role: "user", content: ctx }]);
      setQa((prev) => [...prev, { d: domanda, r: risposta }]);
    } catch (e) {
      setQa((prev) => [...prev, { d: domanda, r: "Errore: " + e.message }]);
    }
    setQaLoading(false);
  }, [followUp, qaLoading, report, composito, invReport]);

  const esporta = useCallback(() => {
    if (!report) return;
    const f   = fascia(composito);
    const tot = Object.values(pesi).reduce((a, b) => a + b, 0) || 1;
    const lines = [
      "DOSSIER REPUTAZIONALE E INVESTIMENTO — LENS",
      "Data: " + new Date().toLocaleDateString("it-IT"),
      "Azienda: " + (report.azienda?.nome || "") + " | " + (report.azienda?.identificativo || "") + " | " + (report.azienda?.settore || "") + " | " + (report.azienda?.sede || ""),
      "RISCHIO: " + composito + "/100 | " + f.label + " | Affidabilita: " + (report.confidence || ""),
      invReport ? ("INVEST: " + (invReport.invest_score || 0) + "/100 | " + invFascia(invReport.invest_score || 0).label + " | Verdict: " + (invReport.verdict || "")) : "",
      "", "DIMENSIONI RISCHIO:",
      ...report.dims.map((d) => "  " + d.nome + ": " + d.score + "/100 (" + Math.round((pesi[d.id] / tot) * 100) + "%) - " + d.sintesi),
      "", "RED FLAG:",
      ...(report.red_flags || []).map((r) => "  [" + (r.severita || "").toUpperCase() + "] " + (r.data || "") + " | " + r.titolo + " - " + r.descrizione + " (" + r.fonte + ")"),
      "", "FATTORI MITIGANTI:",
      ...(report.punti_forza || []).map((p) => "  - " + p),
      ...(invReport ? ["", "NEWS POSITIVE:", ...(invReport.news_positive || []).map((n) => "  - " + n.titolo + " (" + n.fonte + ", " + n.data + ")")] : []),
      "", "FONTI:", ...(report.fonti || []).map((s) => "  " + s.titolo + ": " + s.url),
      "", "Nota: " + (report.nota || ""),
      "", "DISCLAIMER: analisi AI su fonti web pubbliche. Dati soggetti a imprecisioni. Non sostituisce due diligence professionale.",
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    });
  }, [report, composito, pesi, invReport]);

  const tot   = Object.values(pesi).reduce((a, b) => a + b, 0) || 1;
  const radarData = report ? report.dims.map((d) => ({ dim: d.id, score: d.score })) : [];
  const barData   = report ? report.dims.map((d) => ({ nome: d.id, score: d.score, fill: fascia(d.score).color })) : [];

  const VERDICT = {
    acquista: { color: "#22c55e", icon: "✅", label: "ACQUISTA / INVESTI" },
    monitora: { color: "#f59e0b", icon: "⏳", label: "MONITORA" },
    evita:    { color: "#ef4444", icon: "🚫", label: "EVITA" },
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{
        "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');" +
        "*,*::before,*::after{box-sizing:border-box}" +
        "::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:3px}" +
        "input[type=range]{height:4px}" +
        "@keyframes shimmer{0%,100%{opacity:.5}50%{opacity:1}}" +
        "@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}" +
        "@keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
        "@keyframes fadeIn{from{opacity:0}to{opacity:1}}" +
        ".bcta:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 24px rgba(99,102,241,0.45)!important}" +
        ".bcta:active:not(:disabled){transform:translateY(0)}" +
        ".lh:hover{color:#818cf8!important}" +
        ".tbtn:hover{background:rgba(255,255,255,0.06)!important}"
      }</style>

      {/* HEADER */}
      <header style={{ borderBottom: "1px solid " + C.border, padding: "0 32px", backdropFilter: "blur(20px)", background: "rgba(7,13,26,0.85)", position: "sticky", top: 0, zIndex: 100, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0, filter: "drop-shadow(0 0 10px rgba(99,102,241,0.5))" }}>
            <defs>
              <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
              <linearGradient id="lg2" x1="0" y1="0" x2="0.6" y2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </linearGradient>
            </defs>
            <circle cx="14" cy="14" r="10" fill="url(#lg1)" />
            <circle cx="14" cy="14" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="1" fill="none" />
            <ellipse cx="11" cy="10.5" rx="3.5" ry="2" fill="url(#lg2)" transform="rotate(-20 11 10.5)" />
            <line x1="21.5" y1="21.5" x2="29" y2="29" stroke="url(#lg1)" strokeWidth="3.5" strokeLinecap="round" />
            <line x1="21.5" y1="21.5" x2="25" y2="25" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", background: "linear-gradient(135deg,#fff 30%,rgba(255,255,255,0.55))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Lens</span>
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.muted, background: "rgba(255,255,255,0.05)", border: "1px solid " + C.border, padding: "2px 7px", borderRadius: 4 }}>v4</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {stato === "done" && report && (
            <button onClick={esporta} className="bcta"
              style={{ display: "flex", alignItems: "center", gap: 6, background: copiato ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)", border: "1px solid " + (copiato ? "rgba(34,197,94,0.3)" : C.border), borderRadius: 8, padding: "7px 14px", color: copiato ? C.green : C.muted, fontFamily: "JetBrains Mono, monospace", fontSize: 11, cursor: "pointer", fontWeight: 600, transition: "all 0.2s" }}>
              {copiato ? "✓ Copiato" : "⧉ Esporta dossier"}
            </button>
          )}
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.18)" }}>fonti web pubbliche</span>
          <UserButton afterSignOutUrl="/" appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />
        </div>
      </header>

      <main style={{ maxWidth: 1160, margin: "0 auto", padding: "30px 22px 80px" }}>

        {/* SEARCH */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ background: focus ? "rgba(99,102,241,0.06)" : C.surface, border: "1px solid " + (focus ? "rgba(99,102,241,0.4)" : C.border), borderRadius: 14, padding: "6px 6px 6px 18px", display: "flex", gap: 8, alignItems: "center", transition: "all 0.2s ease", boxShadow: focus ? "0 0 0 3px rgba(99,102,241,0.1)" : "none" }}>
            <span style={{ fontSize: 16, opacity: 0.35 }}>🔍</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
              onKeyDown={(e) => e.key === "Enter" && analizza()}
              placeholder="Ragione sociale o Codice Fiscale / P.IVA..."
              style={{ flex: 2, background: "none", border: "none", outline: "none", fontSize: 15, color: "rgba(255,255,255,0.9)", fontFamily: "Inter, sans-serif", padding: "8px 0" }} />
            <div style={{ width: 1, height: 22, background: C.border }} />
            <input value={settore} onChange={(e) => setSettore(e.target.value)}
              onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
              onKeyDown={(e) => e.key === "Enter" && analizza()}
              placeholder="Settore (opzionale)"
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, color: C.muted, fontFamily: "Inter, sans-serif", padding: "8px 0" }} />
            <button onClick={analizza}
              disabled={["loading","disambiguating","choosing"].includes(stato) || !query.trim()}
              className="bcta"
              style={{ padding: "10px 22px", borderRadius: 9, background: ["loading","disambiguating","choosing"].includes(stato) || !query.trim() ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", color: "#fff", fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 13.5, cursor: ["loading","disambiguating","choosing"].includes(stato) || !query.trim() ? "not-allowed" : "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.3)", whiteSpace: "nowrap", transition: "all 0.15s ease" }}>
              {stato === "disambiguating" ? "Ricerca..." : stato === "loading" ? "Analisi..." : "Analizza →"}
            </button>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.22)", margin: "7px 0 0 4px" }}>Premi Invio o clicca Analizza · 30–80 secondi (rischio + investimento)</p>
        </div>

        <PesiPanel pesi={pesi} setPesi={setPesi} />

        {stato === "loading" && <LoadingState fase={fase} />}

        {stato === "error" && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span>⚠️</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.red }}>Analisi non completata</span>
            </div>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>{errore}</p>
            <button onClick={analizza} style={{ marginTop: 12, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "7px 16px", color: C.red, fontSize: 12, cursor: "pointer" }}>Riprova →</button>
          </div>
        )}

        {/* DISAMBIGUATING — ricerca candidati in corso */}
        {stato === "disambiguating" && (
          <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: 32, textAlign: "center" }}>
            <div style={{ display: "inline-flex", gap: 4, marginBottom: 16 }}>
              {[0,1,2].map((j) => (
                <span key={j} style={{ width: 8, height: 8, borderRadius: "50%", background: C.indigo, animation: "bounce 1s ease " + j * 0.18 + "s infinite", display: "inline-block" }} />
              ))}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "rgba(255,255,255,0.75)", marginBottom: 6 }}>Ricerca globale in corso...</div>
            <div style={{ fontSize: 12, color: C.muted }}>Identificazione aziende corrispondenti su fonti mondiali</div>
          </div>
        )}

        {/* CHOOSING — selezione tra candidati */}
        {stato === "choosing" && candidati.length > 0 && (
          <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: "24px 22px", animation: "fadeIn 0.3s ease" }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "rgba(255,255,255,0.9)", marginBottom: 4 }}>
                Trovate {candidati.length} aziende corrispondenti
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>
                Seleziona l'azienda da analizzare (match minimo 70%)
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {candidati.map((c, i) => {
                const pct = c.match_pct || 0;
                const col = pct >= 90 ? C.green : pct >= 80 ? C.teal : C.amber;
                return (
                  <button key={i}
                    onClick={() => analizzaTarget(c.nome + (c.paese ? ", " + c.paese : ""))}
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", textAlign: "left", transition: "all 0.18s ease" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.08)"; e.currentTarget.style.borderColor = "rgba(99,102,241,0.35)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontSize: 14.5, color: "rgba(255,255,255,0.9)" }}>{c.nome}</span>
                          {c.tipo && <Badge label={c.tipo.toUpperCase()} color={C.sky} />}
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 12, color: C.muted, flexWrap: "wrap" }}>
                          {c.paese   && <span>🌍 {c.paese}</span>}
                          {c.citta   && <span>📍 {c.citta}</span>}
                          {c.settore && <span>🏭 {c.settore}</span>}
                          {c.cf_vat  && <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5 }}>{c.cf_vat}</span>}
                        </div>
                        {c.desc_breve && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{c.desc_breve}</div>}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 20, color: col }}>{pct}%</div>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: C.muted }}>match</div>
                        <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginTop: 4, width: 60, overflow: "hidden" }}>
                          <div style={{ width: pct + "%", height: "100%", background: col, borderRadius: 2 }} />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setStato("idle"); setCandidati([]); }}
              style={{ marginTop: 14, background: "none", border: "1px solid " + C.border, borderRadius: 8, padding: "7px 14px", color: C.muted, fontSize: 12, cursor: "pointer", fontFamily: "JetBrains Mono, monospace" }}>
              ← Nuova ricerca
            </button>
          </div>
        )}

        {stato === "idle" && <EmptyState />}

        {stato === "done" && report && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            {/* Intestazione */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 14, flexWrap: "wrap" }}>
              <div>
                <h1 style={{ fontWeight: 800, fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 6px", background: "linear-gradient(135deg,#fff,rgba(255,255,255,0.6))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  {report.azienda?.nome || query}
                </h1>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {report.azienda?.identificativo && report.azienda.identificativo !== "n.d." && (
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: C.muted, background: "rgba(255,255,255,0.05)", padding: "2px 8px", borderRadius: 5 }}>{report.azienda.identificativo}</span>
                  )}
                  {report.azienda?.settore && <span style={{ fontSize: 12, color: C.muted }}>· {report.azienda.settore}</span>}
                  {report.azienda?.sede    && <span style={{ fontSize: 12, color: C.muted }}>· {report.azienda.sede}</span>}
                </div>
              </div>
              <ConfChip val={report.confidence} />
            </div>

            <DisclaimerBar />
            {validatedSources.length > 0 && <ValidationPanel sources={validatedSources} skipped={skipped} />}

            {/* TABS */}
            <div style={{ display: "flex", gap: 4, marginBottom: 18, background: "rgba(255,255,255,0.04)", border: "1px solid " + C.border, borderRadius: 10, padding: 4 }}>
              {[
                { id: "rischio", label: "🛡 Analisi Rischio",          score: composito,              color: fascia(composito).color },
                { id: "invest",  label: "📈 Potenzialita",             score: invReport?.invest_score, color: invReport ? invFascia(invReport.invest_score || 0).color : C.muted },
              ].map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className="tbtn"
                  style={{ flex: 1, padding: "9px 14px", borderRadius: 7, border: "none", cursor: "pointer", background: tab === t.id ? "rgba(255,255,255,0.08)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s ease" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: tab === t.id ? "rgba(255,255,255,0.9)" : C.muted }}>{t.label}</span>
                  {t.score != null && <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 700, color: t.color }}>{t.score}</span>}
                </button>
              ))}
            </div>

            {/* TAB RISCHIO */}
            {tab === "rischio" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, marginBottom: 14 }}>
                  {/* Gauge + charts */}
                  <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: "22px 18px", display: "flex", flexDirection: "column", gap: 18 }}>
                    <Gauge score={composito} bands={FASCE} animated size={300} />
                    <div style={{ height: 195 }}>
                      <ResponsiveContainer>
                        <RadarChart data={radarData} outerRadius="72%">
                          <PolarGrid stroke="rgba(255,255,255,0.07)" />
                          <PolarAngleAxis dataKey="dim" tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: C.muted }} />
                          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar dataKey="score" stroke={fascia(composito).color} fill={fascia(composito).color} fillOpacity={0.15} strokeWidth={2} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ height: 140 }}>
                      <ResponsiveContainer>
                        <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 36, top: 0, bottom: 0 }}>
                          <XAxis type="number" domain={[0, 100]} hide />
                          <YAxis type="category" dataKey="nome" width={40} tick={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: C.muted }} axisLine={false} tickLine={false} />
                          <Bar dataKey="score" barSize={8} radius={[0, 3, 3, 0]}>
                            {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            <LabelList dataKey="score" position="right" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: C.muted }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {/* Red flags */}
                  <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: "22px 18px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0, color: "rgba(255,255,255,0.85)" }}>Red Flag rilevate</h3>
                      <Badge
                        label={(report.red_flags || []).length + " trovate"}
                        color={(report.red_flags || []).length ? C.red : C.green}
                      />
                    </div>
                    {(report.red_flags || []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 16px" }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: C.green, marginBottom: 4 }}>Nessuna red flag</div>
                        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>Nessuna evidenza negativa significativa nelle fonti consultate.</div>
                      </div>
                    ) : (
                      (report.red_flags || []).map((flag, i) => {
                        const s = SEV[flag.severita] || SEV.media;
                        return (
                          <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", animation: "fadeSlideIn 0.35s ease " + i * 0.08 + "s both" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingTop: 3 }}>
                              <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, boxShadow: "0 0 8px " + s.color }} />
                              <div style={{ flex: 1, width: 1, background: "rgba(255,255,255,0.07)", marginTop: 5 }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 4 }}>
                                <Badge label={s.label} color={s.color} />
                                <span style={{ fontWeight: 600, fontSize: 13, color: "rgba(255,255,255,0.88)" }}>{flag.titolo}</span>
                              </div>
                              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginBottom: 5 }}>{flag.descrizione}</div>
                              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.25)" }}>
                                  {flag.fonte}{flag.data ? " · " + flag.data : ""}
                                </span>
                                {flag.fonti_multiple && <Badge label="Multi-fonte" color={C.sky} />}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {(report.punti_forza || []).length > 0 && (
                      <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 10 }}>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 7 }}>FATTORI MITIGANTI</div>
                        {report.punti_forza.map((p, i) => <div key={i} style={{ fontSize: 12.5, color: C.muted, padding: "3px 0", lineHeight: 1.4 }}>· {p}</div>)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dimensioni */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: C.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>Dettaglio dimensioni</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                    {report.dims.map((d) => <DimCard key={d.id} d={d} pesoNorm={Math.round((pesi[d.id] / tot) * 100)} animated />)}
                  </div>
                </div>

                {/* Fonti */}
                {(report.fonti || []).length > 0 && (
                  <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
                    <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 8 }}>FONTI CONSULTATE</div>
                    {report.fonti.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="lh"
                        style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.muted, textDecoration: "none", padding: "3px 0", transition: "color 0.15s" }}>
                        <span style={{ fontSize: 10, opacity: 0.4 }}>↗</span>{s.titolo || s.url}
                      </a>
                    ))}
                    {report.nota && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.22)", marginTop: 10, fontStyle: "italic", paddingTop: 8, borderTop: "1px solid " + C.border }}>{report.nota}</div>}
                  </div>
                )}
              </>
            )}

            {/* TAB INVESTIMENTO */}
            {tab === "invest" && (
              <>
                {!invReport ? (
                  <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: 28, textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>📈</div>
                    <div style={{ color: C.muted, fontSize: 13 }}>Analisi di investimento non disponibile. Esegui una nuova ricerca.</div>
                  </div>
                ) : (
                  <>
                    {/* Verdict */}
                    {(() => {
                      const v = VERDICT[invReport.verdict] || VERDICT.monitora;
                      return (
                        <div style={{ background: v.color + "0D", border: "1px solid " + v.color + "30", borderRadius: 12, padding: "14px 20px", marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 28 }}>{v.icon}</span>
                          <div>
                            <div style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 800, fontSize: 15, color: v.color, letterSpacing: "0.08em" }}>{v.label}</div>
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{invReport.sintesi}</div>
                          </div>
                          <div style={{ marginLeft: "auto", textAlign: "right" }}>
                            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.muted }}>TREND</div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: invReport.trend === "crescita" ? C.green : invReport.trend === "declino" ? C.red : C.amber }}>
                              {invReport.trend === "crescita" ? "↑ Crescita" : invReport.trend === "declino" ? "↓ Declino" : "→ Stabile"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, marginBottom: 14 }}>
                      {/* Gauge invest */}
                      <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: "22px 18px", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
                        <Gauge score={invReport.invest_score || 0} bands={INV_FASCE} animated size={260} />
                        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                          {(invReport.dimensioni_inv || []).map((d) => {
                            const col = d.score >= 70 ? C.green : d.score >= 45 ? C.teal : d.score >= 25 ? C.amber : C.red;
                            return (
                              <div key={d.id}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{d.nome}</span>
                                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: col, fontSize: 12 }}>{d.score}</span>
                                </div>
                                <ScoreBar score={d.score} color={col} animated />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* SWOT */}
                      <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 16, padding: "22px 18px" }}>
                        <h3 style={{ fontWeight: 700, fontSize: 14, margin: "0 0 14px", color: "rgba(255,255,255,0.85)" }}>Analisi SWOT</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <SwotCell items={invReport.swot?.strengths}    label="PUNTI DI FORZA" color={C.green}  icon="+" />
                          <SwotCell items={invReport.swot?.weaknesses}   label="DEBOLEZZE"     color={C.red}    icon="-" />
                          <SwotCell items={invReport.swot?.opportunities} label="OPPORTUNITA"  color={C.teal}   icon="◆" />
                          <SwotCell items={invReport.swot?.threats}      label="MINACCE"       color={C.amber}  icon="▲" />
                        </div>
                      </div>
                    </div>

                    {/* News positive */}
                    {(invReport.news_positive || []).length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: C.muted, fontWeight: 600, letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>News e segnali positivi</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                          {invReport.news_positive.map((n, i) => <NewsCard key={i} news={n} index={i} />)}
                        </div>
                      </div>
                    )}

                    {/* Fonti invest */}
                    {(invReport.fonti_inv || []).length > 0 && (
                      <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
                        <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: "0.1em", marginBottom: 8 }}>FONTI ANALISI INVESTIMENTO</div>
                        {invReport.fonti_inv.map((s, i) => (
                          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="lh"
                            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: C.muted, textDecoration: "none", padding: "3px 0", transition: "color 0.15s" }}>
                            <span style={{ fontSize: 10, opacity: 0.4 }}>↗</span>{s.titolo || s.url}
                          </a>
                        ))}
                        {invReport.nota_inv && <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.22)", marginTop: 8, fontStyle: "italic", paddingTop: 8, borderTop: "1px solid " + C.border }}>{invReport.nota_inv}</div>}
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Q&A */}
            <div style={{ background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, margin: "0 0 4px", color: "rgba(255,255,255,0.85)" }}>🤖 Analista AI</h3>
              <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 14px" }}>Es. "Dettagli sui procedimenti legali" · "Prospettive del settore" · "Chi sono i soci principali?"</p>
              {qa.map((item, i) => (
                <div key={i} style={{ marginBottom: 14, animation: "fadeSlideIn 0.3s ease" }}>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, color: "#818cf8", fontWeight: 600, marginBottom: 4 }}>▸ {item.d}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.65, color: C.muted, whiteSpace: "pre-wrap", paddingLeft: 12, borderLeft: "2px solid rgba(99,102,241,0.3)" }}>{item.r}</div>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8 }}>
                <input value={followUp} onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && approfondisci()}
                  placeholder="Fai una domanda sul report..."
                  style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid " + C.border, borderRadius: 9, padding: "10px 13px", fontSize: 13.5, color: "rgba(255,255,255,0.8)", fontFamily: "Inter, sans-serif", outline: "none" }} />
                <button onClick={approfondisci} disabled={qaLoading || !followUp.trim()} className="bcta"
                  style={{ padding: "10px 17px", background: qaLoading ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 9, color: "#fff", fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 13, cursor: qaLoading ? "wait" : "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.3)", transition: "all 0.15s ease" }}>
                  {qaLoading ? "..." : "Invia"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confronto sessione */}
        {storico.length > 1 && (
          <div style={{ background: C.surface, border: "1px solid " + C.border, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontWeight: 700, fontSize: 14, margin: 0, color: "rgba(255,255,255,0.85)" }}>Confronto sessione</h3>
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: C.muted }}>{storico.length} aziende</span>
            </div>
            {[...storico].sort((a, b) => a.composito - b.composito).map((s, i) => {
              const fr = fascia(s.composito);
              const fi = invFascia(s.invest || 0);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < storico.length - 1 ? "1px solid " + C.border : "none" }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "rgba(255,255,255,0.2)", width: 18 }}>#{i + 1}</span>
                  <span style={{ flex: "0 0 180px", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.8)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nome}</span>
                  <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: s.composito + "%", height: "100%", background: fr.color, boxShadow: "0 0 6px " + fr.color, borderRadius: 3 }} />
                  </div>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: 14, color: fr.color, width: 28, textAlign: "right" }}>{s.composito}</span>
                  <Badge label={fr.label} color={fr.color} />
                  <Badge label={"INV " + s.invest} color={fi.color} />
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.2)", width: 44 }}>{s.flags} flag</span>
                </div>
              );
            })}
          </div>
        )}

        {(stato === "done" || storico.length > 0) && (
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.2)", lineHeight: 1.6, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 14, margin: 0 }}>
            Lens elabora informazioni da fonti web pubbliche tramite AI. I dati sono soggetti a imprecisioni e non sostituiscono due diligence legale, visure camerali o report di agenzie accreditate. L analisi di investimento non costituisce consulenza finanziaria. Score calcolati su base statistica — solo fonti con indice di affidabilita pari o superiore a 9/10 contribuiscono al report.
          </p>
        )}
      </main>
    </div>
  );
}

