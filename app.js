/* Portia dashboard template — client-side renderer
 * Reads the `?d=<base64url-gzipped-json>` URL parameter, decompresses it,
 * and populates the HTML scaffold in index.html with the FSP's data.
 *
 * Expected payload shape (see _build_payload() in the Python tool):
 *
 *   {
 *     v: 1,                          // payload version
 *     fsp_name: "...",
 *     country_display: "Colombia",   // pretty country phrase
 *     gen_date: "May 23, 2026",
 *     source_note: "Source: ..." | null,
 *     kpi: {
 *       total: 190, high: 96, medium: 94, low: 0,
 *       avg: 20.2, top_hazard_label: "Landslide"
 *     },
 *     tier: { label: "High", color: "#96253a" },
 *     hazards: [                     // 8 entries, all hazards in order
 *       { code:"EQ", name:"Earthquake", value: 3.0 },
 *       ...
 *     ],
 *     worst: { name, city, score, tier } | null,
 *     best:  { name, city, score, tier } | null,
 *     branches: [                    // up to 75 displayed
 *       { name, city, state, match_type, score, tier, h:[0-4]*8 },
 *       ...
 *     ],
 *     branches_note: "Showing 75 of 190..." | null,
 *     water: { country, water_stress: {v, label}, drought: {v, label}, region } | null,
 *     trajectory: { country, base_tas, fut_tas, d_tas, d_pr } | null,
 *     site: [ { name, city, t2m, t2m_max, t2m_min, precip, wind } ] | null,
 *     context: { country, ndgain, vulnerability, readiness } | null
 *   }
 */

(function () {
  "use strict";

  const HAZARDS = ["EQ","TS","CY","FL","UF","CF","LS","EH"];
  const LEVEL_LABELS = ["No Data","Very Low","Low","Medium","High"];
  const NAV_DEFS = [
    {slug:"summary",     label:"Executive Summary"},
    {slug:"branches",    label:"Branch Risk Table"},
    {slug:"water",       label:"Water Risk"},
    {slug:"trajectory",  label:"Climate Trajectory"},
    {slug:"site",        label:"Site Climate"},
    {slug:"context",     label:"Country Context"},
    {slug:"methodology", label:"Methodology"},
  ];

  // ── URL decode ──────────────────────────────────────────────────────
  async function getPayload() {
    const params = new URLSearchParams(window.location.search);
    // Strategy A: ?id=<gist_id> — fetch the JSON payload from a GitHub gist.
    const gistId = params.get("id");
    if (gistId) return await fetchGistPayload(gistId);
    // Strategy B: ?d=<base64url-gzip-json> — decode inline.
    const raw = params.get("d") || window.location.hash.replace(/^#d=/, "");
    if (!raw) throw new Error("No data parameter (?id=... or ?d=...) in URL.");
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      raw.length + (4 - (raw.length % 4)) % 4, "=");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = await decompressGzip(bytes);
    return JSON.parse(text);
  }

  async function fetchGistPayload(gistId) {
    // Public api.github.com endpoint — no auth needed once we have the ID.
    const r = await fetch(
      `https://api.github.com/gists/${encodeURIComponent(gistId)}`,
      {headers: {"Accept": "application/vnd.github+json"}}
    );
    if (!r.ok) throw new Error(`Gist fetch failed: HTTP ${r.status}`);
    const data = await r.json();
    const files = data.files || {};
    const fileNames = Object.keys(files);
    if (!fileNames.length) throw new Error("Gist has no files.");
    const file = files[fileNames[0]];
    // If the gist payload was truncated by GitHub's API, follow raw_url.
    if (file.truncated && file.raw_url) {
      const r2 = await fetch(file.raw_url);
      if (!r2.ok) throw new Error(`Gist raw fetch failed: HTTP ${r2.status}`);
      return JSON.parse(await r2.text());
    }
    return JSON.parse(file.content);
  }

  async function decompressGzip(bytes) {
    // Native DecompressionStream API (Chrome 80+, FF 113+, Safari 16.4+).
    const stream = new Blob([bytes]).stream().pipeThrough(
      new DecompressionStream("gzip"));
    const text = await new Response(stream).text();
    return text;
  }

  // ── Rendering helpers ───────────────────────────────────────────────
  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    if (typeof children === "string") n.textContent = children;
    else for (const c of children) {
      if (c == null) continue;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return n;
  }

  function fmt(v, digits = 2, unit = "") {
    if (v == null || isNaN(v)) return "—";
    return Number(v).toFixed(digits) + unit;
  }

  function tierClass(t) {
    return {High:"t-h", Medium:"t-m", Low:"t-l"}[t] || "t-u";
  }
  function matchClass(mt) {
    if (mt === "exact") return "m-x";
    if (/fuzzy/i.test(mt)) return "m-f";
    if (/region/i.test(mt)) return "m-r";
    return "m-n";
  }
  function barColor(v) {
    if (v >= 3) return "#d8607a";
    if (v >= 2) return "#f1974c";
    if (v >= 1) return "#fde047";
    return "#8bbc3a";
  }

  // ── Tab navigation ──────────────────────────────────────────────────
  function setActive(slug) {
    document.querySelectorAll(".nav-item").forEach(n =>
      n.classList.toggle("active", n.dataset.tab === slug));
    document.querySelectorAll(".panel").forEach(p =>
      p.classList.toggle("active", p.id === "tab-" + slug));
  }

  function buildNav(payload) {
    const nav = document.getElementById("nav");
    nav.appendChild(el("div", {class:"nav-section"}, "Climate Risk"));
    const visible = NAV_DEFS.filter(d => {
      if (d.slug === "summary" || d.slug === "branches" || d.slug === "methodology") return true;
      if (d.slug === "water") return !!payload.water;
      if (d.slug === "trajectory") return !!payload.trajectory;
      if (d.slug === "site") return !!(payload.site && payload.site.length);
      if (d.slug === "context") return !!payload.context;
      return false;
    });
    visible.forEach((d, i) => {
      const a = el("a", {
        class: "nav-item" + (i === 0 ? " active" : ""),
        "data-tab": d.slug,
      });
      a.appendChild(el("span", {class:"nav-ico nav-ico-" + d.slug}));
      a.appendChild(el("span", {}, d.label));
      a.addEventListener("click", () => setActive(d.slug));
      nav.appendChild(a);
    });
  }

  // ── Panel renderers ─────────────────────────────────────────────────
  function renderTopbar(payload) {
    const title = document.getElementById("title");
    const country = payload.country_display || "";
    title.innerHTML = "";
    title.appendChild(document.createTextNode(payload.fsp_name));
    if (country) {
      title.appendChild(document.createTextNode(", "));
      title.appendChild(el("span", {class:"topbar-country"}, country));
    }
    const chip = document.getElementById("tier-chip");
    chip.textContent = `Portfolio · ${payload.tier.label}`;
    chip.style.background = payload.tier.color;
    document.title = `Portia PCRA — ${payload.fsp_name}`;
  }

  function renderSummary(payload) {
    const kpis = document.getElementById("kpis");
    const cards = [
      ["Total branches", String(payload.kpi.total), "var(--cream)"],
      ["High risk", String(payload.kpi.high), "#d8607a"],
      ["Medium risk", String(payload.kpi.medium), "var(--amber)"],
      ["Low risk", String(payload.kpi.low), "#8bbc3a"],
      ["Avg. score", String(payload.kpi.avg), "var(--yellow)"],
      ["Top hazard", payload.kpi.top_hazard_label || "—", "var(--cream)"],
    ];
    cards.forEach(([label, value, color]) => {
      const c = el("div", {class:"kpi"});
      c.appendChild(el("div", {class:"kpi-v", style:`color:${color}`}, value));
      c.appendChild(el("div", {class:"kpi-l"}, label));
      kpis.appendChild(c);
    });

    const bars = document.getElementById("hazard-bars");
    payload.hazards.forEach(h => {
      const row = el("div", {class:"hbar-row"});
      row.appendChild(el("div", {class:"hbar-l"}, h.name));
      const track = el("div", {class:"hbar-track"});
      track.appendChild(el("div", {
        class:"hbar-fill",
        style:`width:${(h.value/4*100).toFixed(1)}%;background:${barColor(h.value)};`,
      }));
      row.appendChild(track);
      row.appendChild(el("div", {class:"hbar-v"}, h.value.toFixed(1)));
      bars.appendChild(row);
    });

    const wb = document.getElementById("worst-best");
    if (payload.worst && payload.best && payload.worst.name !== payload.best.name) {
      const grid = el("div", {class:"grid-2 mt24"});
      grid.appendChild(makeWB(payload.worst, "bad", "Worst-exposed branch"));
      grid.appendChild(makeWB(payload.best, "good", "Best-positioned branch"));
      wb.appendChild(grid);
    }
  }
  function makeWB(b, kind, title) {
    const c = el("div", {class:"wb-card " + kind});
    c.appendChild(el("div", {class:"card-title"}, title));
    c.appendChild(el("div", {class:"card-big"}, b.name));
    const sub = el("div", {class:"card-sub"});
    sub.appendChild(document.createTextNode(`${b.city} · score ${b.score} · `));
    sub.appendChild(el("span", {class:"tp " + tierClass(b.tier)}, b.tier));
    c.appendChild(sub);
    return c;
  }

  function renderBranches(payload) {
    if (payload.branches_note) {
      document.getElementById("branches-note").textContent = payload.branches_note;
    }
    const thead = document.getElementById("branch-thead");
    const cols = ["Branch","City","Region","Match","Score","Tier"]
      .concat(payload.hazards.map(h => h.name));
    cols.forEach((label, i) => {
      thead.appendChild(el("th", {class: i >= 3 ? "ccenter" : ""}, label));
    });
    const tbody = document.getElementById("branch-tbody");
    payload.branches.forEach(b => {
      const tr = el("tr");
      tr.appendChild(el("td", {class:"bname"}, b.name));
      tr.appendChild(el("td", {}, b.city || ""));
      tr.appendChild(el("td", {}, b.state || ""));
      const matchTd = el("td", {class:"ccenter"});
      matchTd.appendChild(el("span", {class:"pill " + matchClass(b.match_type)}, b.match_type));
      tr.appendChild(matchTd);
      tr.appendChild(el("td", {class:"ccenter score"}, b.score == null ? "—" : String(b.score)));
      const tierTd = el("td", {class:"ccenter"});
      tierTd.appendChild(el("span", {class:"tp " + tierClass(b.tier)}, b.tier));
      tr.appendChild(tierTd);
      (b.h || []).forEach(v => {
        tr.appendChild(el("td", {class:"h h" + v}, LEVEL_LABELS[v] || ""));
      });
      tbody.appendChild(tr);
    });
  }

  function renderWater(payload) {
    if (!payload.water) return;
    const w = payload.water;
    const tab = document.getElementById("tab-water");
    const card = el("div", {class:"card mb16"});
    card.appendChild(el("div", {class:"card-title"}, "🌊 Water risk — " + w.country));
    card.appendChild(el("div", {class:"card-sub mb12"},
      "Source: WRI Aqueduct 4.0 country-level baseline (scored 0 = no risk, 5 = extreme)."));
    const grid = el("div", {class:"grid-2"});
    grid.appendChild(stressBlock("Water stress", w.water_stress));
    grid.appendChild(stressBlock("Drought", w.drought));
    card.appendChild(grid);
    if (w.region) {
      card.appendChild(el("div", {class:"card-sub", style:"margin-top:10px;"},
        "Region: " + w.region));
    }
    tab.appendChild(card);
  }
  function stressColor(v) {
    if (v == null || isNaN(v)) return "var(--stone)";
    if (v >= 3) return "#d8607a";
    if (v >= 2) return "var(--amber)";
    if (v >= 1) return "var(--yellow)";
    return "#8bbc3a";
  }
  function stressBlock(title, {v, label}) {
    const d = el("div");
    d.appendChild(el("div", {class:"kpi-l"}, title));
    const val = el("div", {class:"kpi-v", style:`color:${stressColor(v)}`});
    val.appendChild(document.createTextNode(v == null ? "—" : Number(v).toFixed(2)));
    val.appendChild(el("span", {style:"font-size:0.7rem;color:#a8a399;font-family:'Inter',sans-serif;font-weight:500;"}, " /5"));
    d.appendChild(val);
    if (label) d.appendChild(el("div", {class:"card-sub", style:"margin-top:4px;"}, label));
    return d;
  }

  function renderTrajectory(payload) {
    if (!payload.trajectory) return;
    const t = payload.trajectory;
    const tab = document.getElementById("tab-trajectory");
    const card = el("div", {class:"card mb16"});
    card.appendChild(el("div", {class:"card-title"}, "📈 Climate trajectory — " + t.country));
    card.appendChild(el("div", {class:"card-sub mb12"},
      "CMIP6 SSP2-4.5 ensemble, 2040–2059 vs. CRU 1991–2020 baseline. Source: World Bank CCKP."));
    const grid = el("div", {class:"grid-4"});
    const cell = (label, value, color) => {
      const c = el("div");
      c.appendChild(el("div", {class:"kpi-l"}, label));
      c.appendChild(el("div", {class:"kpi-v", style: color ? `color:${color}` : ""}, value));
      return c;
    };
    grid.appendChild(cell("Baseline temp", fmt(t.base_tas, 2, " °C")));
    grid.appendChild(cell("2050 temp", fmt(t.fut_tas, 2, " °C")));
    const dTas = t.d_tas;
    grid.appendChild(cell("Δ temperature",
      (dTas != null && dTas > 0 ? "+" : "") + fmt(dTas, 2, " °C"), "#d8607a"));
    const dPr = t.d_pr;
    grid.appendChild(cell("Δ precipitation",
      (dPr != null && dPr > 0 ? "+" : "") + fmt(dPr, 2, " %"), "var(--yellow)"));
    card.appendChild(grid);
    tab.appendChild(card);
  }

  function renderSite(payload) {
    if (!payload.site || !payload.site.length) return;
    const tab = document.getElementById("tab-site");
    tab.appendChild(el("div", {class:"card-sub mb12"},
      "Annual climatology averages at each branch's coordinates (NASA POWER 30-year climatology)."));
    const wrap = el("div", {class:"tbl-wrap"});
    const table = el("table");
    const thead = el("thead");
    const trh = el("tr");
    ["Branch","City","Mean T (°C)","Max T (°C)","Min T (°C)","Precip (mm/day)","Wind 10m (m/s)"]
      .forEach((h, i) => trh.appendChild(el("th", {class: i >= 2 ? "ccenter" : ""}, h)));
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = el("tbody");
    payload.site.forEach(s => {
      const tr = el("tr");
      tr.appendChild(el("td", {}, s.name));
      tr.appendChild(el("td", {}, s.city || ""));
      tr.appendChild(el("td", {class:"ccenter"}, fmt(s.t2m)));
      tr.appendChild(el("td", {class:"ccenter"}, fmt(s.t2m_max)));
      tr.appendChild(el("td", {class:"ccenter"}, fmt(s.t2m_min)));
      tr.appendChild(el("td", {class:"ccenter"}, fmt(s.precip)));
      tr.appendChild(el("td", {class:"ccenter"}, fmt(s.wind)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    tab.appendChild(wrap);
  }

  function renderContext(payload) {
    if (!payload.context) return;
    const ctx = payload.context;
    const tab = document.getElementById("tab-context");
    const card = el("div", {class:"card mb16"});
    card.appendChild(el("div", {class:"card-title"}, "🌱 Country context — " + ctx.country));
    card.appendChild(el("div", {class:"card-sub mb12"},
      "Source: ND-GAIN Country Index — overall climate-adaptation score (0–100, higher is better), broken into vulnerability (0–1, lower is better) and readiness (0–1, higher is better)."));
    const grid = el("div", {class:"grid-4"});
    const score = ctx.ndgain != null ? Number(ctx.ndgain).toFixed(1) : "—";
    const vuln = ctx.vulnerability != null ? Number(ctx.vulnerability).toFixed(2) : "—";
    const rdy = ctx.readiness != null ? Number(ctx.readiness).toFixed(2) : "—";
    const colS = gainColor(ctx.ndgain, false);
    const colV = gainColor(ctx.vulnerability, true);
    const colR = gainColor(ctx.readiness, false);
    const mkCell = (label, value, color, sub) => {
      const c = el("div");
      c.appendChild(el("div", {class:"kpi-l"}, label));
      const val = el("div", {class:"kpi-v", style:`color:${color}`});
      val.appendChild(document.createTextNode(value));
      if (label === "ND-GAIN score") {
        val.appendChild(el("span", {style:"font-size:0.7rem;color:#a8a399;font-family:'Inter',sans-serif;font-weight:500;"}, " /100"));
      }
      c.appendChild(val);
      if (sub) c.appendChild(el("div", {class:"card-sub", style:"margin-top:4px;"}, sub));
      return c;
    };
    grid.appendChild(mkCell("ND-GAIN score", score, colS));
    grid.appendChild(mkCell("Vulnerability", vuln, colV, "lower is better"));
    grid.appendChild(mkCell("Readiness", rdy, colR, "higher is better"));
    grid.appendChild(el("div"));
    card.appendChild(grid);
    tab.appendChild(card);
  }
  function gainColor(v, inverse) {
    if (v == null || isNaN(v)) return "var(--stone)";
    let f = Number(v);
    if (f >= 0 && f <= 1) f *= 100;
    if (inverse)
      return f < 35 ? "#8bbc3a" : f < 55 ? "var(--amber)" : "#d8607a";
    return f < 35 ? "#d8607a" : f < 55 ? "var(--amber)" : "#8bbc3a";
  }

  function renderFooter(payload) {
    const ftr = document.getElementById("ftr-text");
    ftr.textContent =
      "Created by Portia, your personal climate analyst · " + payload.gen_date;
  }

  // Fades out the inline-CSS loading screen from index.html and then
  // removes the node so it's no longer focusable. Safe to call multiple
  // times and safe even if #loading has already been removed.
  function hideLoading() {
    const lo = document.getElementById("loading");
    if (!lo) return;
    lo.classList.add("hide");
    setTimeout(() => {
      if (lo.parentNode) lo.parentNode.removeChild(lo);
    }, 300);
  }

  // ── Main ────────────────────────────────────────────────────────────
  async function main() {
    try {
      const payload = await getPayload();
      buildNav(payload);
      renderTopbar(payload);
      renderSummary(payload);
      renderBranches(payload);
      renderWater(payload);
      renderTrajectory(payload);
      renderSite(payload);
      renderContext(payload);
      renderFooter(payload);
      document.getElementById("app").hidden = false;
    } catch (e) {
      const err = document.getElementById("error");
      err.hidden = false;
      err.innerHTML = `
        <h2>⚠ Could not render dashboard</h2>
        <p>The dashboard payload couldn't be parsed.</p>
        <pre>${(e && e.message) || String(e)}</pre>
      `;
      console.error(e);
    } finally {
      hideLoading();
    }
  }
  main();
})();
