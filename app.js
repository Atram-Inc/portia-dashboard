/* Portia dashboard template — client-side renderer with i18n.
 * Reads `?d=<base64url-gzipped-json>` (or `?id=<gist_id>`), plus
 * optional `?lang=<en|es>`, decompresses/fetches the payload, and
 * populates the HTML scaffold in index.html with the FSP's data.
 *
 * Expected payload shape (see _build_dashboard_payload() in the Python tool):
 *
 *   {
 *     v: 1,                          // payload version
 *     fsp_name: "...",
 *     country_display: "Colombia",   // pretty country phrase
 *     gen_date: "May 23, 2026",
 *     source_note: "Source: ..." | null,
 *     kpi: {
 *       total: 190, high: 96, medium: 94, low: 0,
 *       avg: 20.2,
 *       top_hazard_code: "LS",         // hazard code, stable across langs
 *       top_hazard_label: "Landslide"  // English fallback if no code
 *     },
 *     tier: { label: "High", color: "#96253a" },  // canonical English
 *     hazards: [
 *       { code:"EQ", name:"Earthquake", value: 3.0 },
 *       ...
 *     ],
 *     worst: { name, city, score, tier } | null,
 *     best:  { name, city, score, tier } | null,
 *     branches: [
 *       { name, city, state, match_type, score, tier, h:[0-4]*8 },
 *       ...
 *     ],
 *     branches_note: "Showing 75 of 190..." | null,
 *     coverage: {                    // optional; absent on older payloads
 *       uploaded: 190, matched: 165, unmatched: 25
 *     } | null,
 *     water: { country, water_stress: {v, label}, drought: {v, label}, region } | null,
 *     trajectory: { country, base_tas, fut_tas, d_tas, d_pr } | null,
 *     site: [ { name, city, t2m, t2m_max, t2m_min, precip, wind } ] | null,
 *     context: { country, ndgain, vulnerability, readiness } | null
 *   }
 *
 * String fields in the payload (tier.label, hazards[i].name, kpi.top_hazard_label,
 * branches[].tier, branches[].match_type) are emitted in canonical English by
 * the Python tool. The dashboard maps them client-side to the active language
 * via the LOCALES dict below. Hazard codes (EQ, TS, ...) and tier labels
 * (High, Medium, Low, Unmatched) are the join keys — keep them in sync with
 * the Python tool's HAZARDS / _risk_tier values.
 */

(function () {
  "use strict";

  const SUPPORTED_LANGS = ["en", "es"];
  const LANG_STORAGE_KEY = "portia.lang";
  const HAZARD_CODES = ["EQ","TS","CY","FL","UF","CF","LS","EH"];

  // ── i18n strings ────────────────────────────────────────────────────
  const LOCALES = {
    en: {
      // Page chrome
      app_eyebrow: "Portfolio Climate Risk Assessment",
      sidebar_section: "Climate Risk",
      page_title: (fsp) => `Portia PCRA — ${fsp}`,
      portfolio_tier: (tier) => `Portfolio · ${tier}`,
      error_title: "Could not render dashboard",
      error_body: "The dashboard payload couldn't be parsed.",

      // Nav
      nav_summary: "Executive Summary",
      nav_branches: "Branch Risk Table",
      nav_water: "Water Risk",
      nav_trajectory: "Climate Trajectory",
      nav_site: "Site Climate",
      nav_context: "Country Context",
      nav_methodology: "Methodology",

      // Hazards (mapped from payload code → display name)
      hazard_EQ: "Earthquake",
      hazard_TS: "Tsunami",
      hazard_CY: "Cyclone",
      hazard_FL: "River Flood",
      hazard_UF: "Urban Flood",
      hazard_CF: "Coastal Flood",
      hazard_LS: "Landslide",
      hazard_EH: "Extreme Heat",

      // Tiers (canonical English → display)
      tier_High: "High",
      tier_Medium: "Medium",
      tier_Low: "Low",
      tier_Unmatched: "Unmatched",

      // Levels (0..4)
      level_0: "No Data",
      level_1: "Very Low",
      level_2: "Low",
      level_3: "Medium",
      level_4: "High",

      // Match types
      match_exact: "exact",
      match_fuzzy: "fuzzy",
      match_region: "region",
      match_not_found: "not found",

      // Summary tab
      kpi_total: "Total branches",
      kpi_coverage: "Coverage",
      kpi_high: "High risk",
      kpi_medium: "Medium risk",
      kpi_low: "Low risk",
      kpi_avg: "Avg. score",
      kpi_top_hazard: "Top hazard",
      coverage_tooltip: (matched, total) => `${matched} of ${total} branches assessed`,
      coverage_banner_lead: (unmatched, total) =>
        `${unmatched} of ${total} branches could not be assessed.`,
      coverage_banner_hint:
        'Filter the Branch Risk Table by Match → "not found" to see them.',
      hazard_profile_title: "Hazard exposure profile (portfolio mean, 0–4 scale)",
      worst_branch_title: "Worst-exposed branch",
      best_branch_title: "Best-positioned branch",
      score_word: "score",

      // Branch table
      filter_search: "Search",
      filter_search_placeholder: "Branch or city…",
      filter_region: "Region",
      filter_tier: "Tier",
      filter_match: "Match",
      filter_all: "All",
      filter_reset: "Reset",
      branch_count_all: (n) => `${n} branches`,
      branch_count_filtered: (shown, total) => `${shown} of ${total} branches shown`,
      table_col_branch: "Branch",
      table_col_city: "City",
      table_col_region: "Region",
      table_col_match: "Match",
      table_col_score: "Score",
      table_col_tier: "Tier",

      // Water tab
      water_title: (country) => `🌊 Water risk — ${country}`,
      water_source: "Source: WRI Aqueduct 4.0 country-level baseline (scored 0 = no risk, 5 = extreme).",
      water_stress: "Water stress",
      water_drought: "Drought",
      water_region: (r) => `Region: ${r}`,

      // Trajectory tab
      trajectory_title: (country) => `📈 Climate trajectory — ${country}`,
      trajectory_source: "CMIP6 SSP2-4.5 ensemble, 2040–2059 vs. CRU 1991–2020 baseline. Source: World Bank CCKP.",
      trajectory_base_temp: "Baseline temp",
      trajectory_future_temp: "2050 temp",
      trajectory_delta_temp: "Δ temperature",
      trajectory_delta_precip: "Δ precipitation",

      // Site tab
      site_title: "🌡 Site climate",
      site_source: "Annual climatology averages at each branch's coordinates (NASA POWER 30-year climatology).",
      site_col_branch: "Branch",
      site_col_city: "City",
      site_col_mean_t: "Mean T (°C)",
      site_col_max_t: "Max T (°C)",
      site_col_min_t: "Min T (°C)",
      site_col_precip: "Precip (mm/day)",
      site_col_wind: "Wind 10m (m/s)",

      // Context tab
      context_title: (country) => `🌱 Country context — ${country}`,
      context_source: "Source: ND-GAIN Country Index — overall climate-adaptation score (0–100, higher is better), broken into vulnerability (0–1, lower is better) and readiness (0–1, higher is better).",
      context_ndgain: "ND-GAIN score",
      context_vulnerability: "Vulnerability",
      context_readiness: "Readiness",
      context_lower_better: "lower is better",
      context_higher_better: "higher is better",

      // Plain-language summary narrative — composed client-side from the
      // existing payload fields. `data` is built by renderSummaryNarrative().
      // Bold spans use **markdown** and are parsed safely with renderBoldMarkdown.
      narrative: (data) => {
        const cov = data.coverage_all
          ? `this assessment covers all ${data.total} branches`
          : `this assessment covers ${data.total} branches (${data.matched} matched into hazard data)`;
        const worst = data.worst
          ? ` — **${data.worst.name}** (score ${data.worst.score}, ${data.worst.tier_display}) is the worst-exposed branch`
          : "";
        return `${data.fsp_name} operates across ${data.country_phrase}; ${cov}. ` +
               `Portfolio sits at **${data.tier_display}** tier (avg score ${data.avg}) ` +
               `with **${data.top_hazard}** as the dominant hazard${worst}.`;
      },

      // Per-panel "ⓘ" info callouts — opened via native <details>. Each
      // entry is an array of [label, value] rows documenting that panel's
      // dataset resolution, version, license, and limitations.
      info_aria: "Source information",
      info_water: [
        ["Resolution:", "Country-level baseline (WRI publishes sub-basin data but the dashboard currently uses the country-aggregated CSV)."],
        ["Dataset version:", "WRI Aqueduct 4.0 (2023)."],
        ["License:", "CC BY 4.0."],
        ["Limitations:", "Country aggregate; branch-level water risk may differ significantly from this score."],
      ],
      info_trajectory: [
        ["Resolution:", "Country-level ensemble mean."],
        ["Dataset version:", "World Bank CCKP — CMIP6 SSP2-4.5 ensemble, 2040–2059 vs. CRU 1991–2020 baseline."],
        ["License:", "CC BY 4.0."],
        ["Limitations:", "Single emissions scenario; uncertainty bands not shown."],
      ],
      info_site: [
        ["Resolution:", "Point (lat/lon) sampled from NASA POWER's ~0.5° (~55 km) grid at each branch's coordinates."],
        ["Dataset version:", "NASA POWER 30-year climatology."],
        ["License:", "Public domain."],
        ["Limitations:", "Historical climatology, not a future projection. Only the top 75 worst-exposed branches are sampled."],
      ],
      info_context: [
        ["Resolution:", "Country-level annual index."],
        ["Dataset version:", "ND-GAIN Country Index (Notre Dame Global Adaptation Initiative)."],
        ["License:", "CC BY-SA 4.0."],
        ["Limitations:", "Captures national adaptation capacity; does not vary by branch location within a country."],
      ],

      // Methodology tab — structured table of all input data sources.
      methodology_title: "📘 Methodology & Data Sources",
      methodology_intro: "All inputs to the Light PCRA, with their resolution, vintage, and license.",
      methodology_table_headers: ["Source", "Purpose", "Resolution", "Vintage", "License"],
      methodology_sources: [
        {source: "GFDRR ThinkHazard v2", purpose: "Hazard screening — 8 hazards each scored 0–4", resolution: "ADM2 (province / department / county)", vintage: "2017", license: "CC BY 4.0"},
        {source: "GeoNames cities500", purpose: "Branch geocoding", resolution: "City centroid", vintage: "Continuously updated", license: "CC BY 4.0"},
        {source: "WRI Aqueduct 4.0", purpose: "Water stress + drought (Water Risk tab)", resolution: "Country aggregate", vintage: "2023", license: "CC BY 4.0"},
        {source: "World Bank CCKP", purpose: "Climate projection to 2050 (Climate Trajectory tab)", resolution: "Country, CMIP6 SSP2-4.5 ensemble", vintage: "2024", license: "CC BY 4.0"},
        {source: "NASA POWER", purpose: "30-year climatology at branch coordinates (Site Climate tab)", resolution: "~0.5° grid (~55 km)", vintage: "30-year window", license: "Public domain"},
        {source: "ND-GAIN Country Index", purpose: "Country vulnerability + adaptation readiness (Country Context tab)", resolution: "Country", vintage: "Annual", license: "CC BY-SA 4.0"},
      ],
      methodology_score_title: "Composite risk score",
      methodology_score_body: "Per-branch score = sum of reported hazard levels × (8 / number of hazards with data). Branches with no ThinkHazard match are tagged Unmatched and excluded from KPI aggregates. Tier thresholds: High ≥ 20, Medium 12–19, Low < 12.",
      methodology_limitations_title: "Limitations",
      methodology_limitations_body: "ThinkHazard methodology v2 dates from 2017; ADM2 granularity may be coarser than a branch's actual exposure. Water risk, climate trajectory, and country context are country-level; branch-level conditions can differ substantially. Sub-national alternatives are on the roadmap.",

      // Footer
      footer_text: "Created by Portia, your personal climate analyst",
    },
    es: {
      // Page chrome
      app_eyebrow: "Evaluación de Riesgo Climático del Portafolio",
      sidebar_section: "Riesgo climático",
      page_title: (fsp) => `Portia PCRA — ${fsp}`,
      portfolio_tier: (tier) => `Cartera · ${tier}`,
      error_title: "No se pudo renderizar el panel",
      error_body: "No se pudo procesar el contenido del panel.",

      // Nav
      nav_summary: "Resumen ejecutivo",
      nav_branches: "Tabla de riesgo por sucursal",
      nav_water: "Riesgo hídrico",
      nav_trajectory: "Trayectoria climática",
      nav_site: "Clima del sitio",
      nav_context: "Contexto del país",
      nav_methodology: "Metodología",

      // Hazards
      hazard_EQ: "Terremoto",
      hazard_TS: "Tsunami",
      hazard_CY: "Ciclón",
      hazard_FL: "Inundación fluvial",
      hazard_UF: "Inundación urbana",
      hazard_CF: "Inundación costera",
      hazard_LS: "Deslizamiento",
      hazard_EH: "Calor extremo",

      // Tiers
      tier_High: "Alto",
      tier_Medium: "Medio",
      tier_Low: "Bajo",
      tier_Unmatched: "Sin coincidencia",

      // Levels
      level_0: "Sin datos",
      level_1: "Muy bajo",
      level_2: "Bajo",
      level_3: "Medio",
      level_4: "Alto",

      // Match types
      match_exact: "exacta",
      match_fuzzy: "aproximada",
      match_region: "región",
      match_not_found: "sin coincidencia",

      // Summary tab
      kpi_total: "Sucursales totales",
      kpi_coverage: "Cobertura",
      kpi_high: "Riesgo alto",
      kpi_medium: "Riesgo medio",
      kpi_low: "Riesgo bajo",
      kpi_avg: "Puntaje promedio",
      kpi_top_hazard: "Amenaza principal",
      coverage_tooltip: (matched, total) => `${matched} de ${total} sucursales evaluadas`,
      coverage_banner_lead: (unmatched, total) =>
        `${unmatched} de ${total} sucursales no pudieron ser evaluadas.`,
      coverage_banner_hint:
        'Filtra la Tabla de riesgo por sucursal en Coincidencia → "sin coincidencia" para verlas.',
      hazard_profile_title: "Perfil de exposición a amenazas (promedio del portafolio, escala 0–4)",
      worst_branch_title: "Sucursal más expuesta",
      best_branch_title: "Sucursal mejor posicionada",
      score_word: "puntaje",

      // Branch table
      filter_search: "Buscar",
      filter_search_placeholder: "Sucursal o ciudad…",
      filter_region: "Región",
      filter_tier: "Nivel",
      filter_match: "Coincidencia",
      filter_all: "Todos",
      filter_reset: "Restablecer",
      branch_count_all: (n) => `${n} sucursales`,
      branch_count_filtered: (shown, total) => `${shown} de ${total} sucursales mostradas`,
      table_col_branch: "Sucursal",
      table_col_city: "Ciudad",
      table_col_region: "Región",
      table_col_match: "Coincidencia",
      table_col_score: "Puntaje",
      table_col_tier: "Nivel",

      // Water tab
      water_title: (country) => `🌊 Riesgo hídrico — ${country}`,
      water_source: "Fuente: línea base nacional WRI Aqueduct 4.0 (puntuado 0 = sin riesgo, 5 = extremo).",
      water_stress: "Estrés hídrico",
      water_drought: "Sequía",
      water_region: (r) => `Región: ${r}`,

      // Trajectory tab
      trajectory_title: (country) => `📈 Trayectoria climática — ${country}`,
      trajectory_source: "Ensamble CMIP6 SSP2-4.5, 2040–2059 vs. línea base CRU 1991–2020. Fuente: World Bank CCKP.",
      trajectory_base_temp: "Temp. base",
      trajectory_future_temp: "Temp. 2050",
      trajectory_delta_temp: "Δ temperatura",
      trajectory_delta_precip: "Δ precipitación",

      // Site tab
      site_title: "🌡 Clima del sitio",
      site_source: "Promedios climatológicos anuales en las coordenadas de cada sucursal (climatología NASA POWER de 30 años).",
      site_col_branch: "Sucursal",
      site_col_city: "Ciudad",
      site_col_mean_t: "T media (°C)",
      site_col_max_t: "T máx (°C)",
      site_col_min_t: "T mín (°C)",
      site_col_precip: "Precip (mm/día)",
      site_col_wind: "Viento 10m (m/s)",

      // Context tab
      context_title: (country) => `🌱 Contexto del país — ${country}`,
      context_source: "Fuente: Índice de País ND-GAIN — puntuación general de adaptación climática (0–100, mayor es mejor), desglosada en vulnerabilidad (0–1, menor es mejor) y preparación (0–1, mayor es mejor).",
      context_ndgain: "Puntaje ND-GAIN",
      context_vulnerability: "Vulnerabilidad",
      context_readiness: "Preparación",
      context_lower_better: "menor es mejor",
      context_higher_better: "mayor es mejor",

      // Plain-language summary narrative — Spanish version.
      narrative: (data) => {
        const cov = data.coverage_all
          ? `esta evaluación cubre las ${data.total} sucursales`
          : `esta evaluación cubre ${data.total} sucursales (${data.matched} con coincidencia)`;
        const worst = data.worst
          ? ` — **${data.worst.name}** (puntaje ${data.worst.score}, ${data.worst.tier_display}) es la sucursal más expuesta`
          : "";
        return `${data.fsp_name} opera en ${data.country_phrase}; ${cov}. ` +
               `La cartera está en el nivel **${data.tier_display}** (puntaje promedio ${data.avg}) ` +
               `con **${data.top_hazard}** como amenaza dominante${worst}.`;
      },

      // Per-panel "ⓘ" info callouts (Spanish).
      info_aria: "Información de la fuente",
      info_water: [
        ["Resolución:", "Línea base nacional (WRI publica datos sub-nacionales por cuenca pero el panel actualmente usa el CSV agregado por país)."],
        ["Versión:", "WRI Aqueduct 4.0 (2023)."],
        ["Licencia:", "CC BY 4.0."],
        ["Limitaciones:", "Agregado nacional; el riesgo hídrico a nivel de sucursal puede diferir significativamente."],
      ],
      info_trajectory: [
        ["Resolución:", "Promedio nacional del ensamble."],
        ["Versión:", "World Bank CCKP — ensamble CMIP6 SSP2-4.5, 2040–2059 vs. línea base CRU 1991–2020."],
        ["Licencia:", "CC BY 4.0."],
        ["Limitaciones:", "Un solo escenario de emisiones; no se muestran bandas de incertidumbre."],
      ],
      info_site: [
        ["Resolución:", "Punto (lat/lon) muestreado de la cuadrícula NASA POWER de ~0.5° (~55 km) en las coordenadas de cada sucursal."],
        ["Versión:", "Climatología NASA POWER de 30 años."],
        ["Licencia:", "Dominio público."],
        ["Limitaciones:", "Climatología histórica, no proyección futura. Solo se muestrean las 75 sucursales más expuestas."],
      ],
      info_context: [
        ["Resolución:", "Índice nacional anual."],
        ["Versión:", "Índice de País ND-GAIN (Notre Dame Global Adaptation Initiative)."],
        ["Licencia:", "CC BY-SA 4.0."],
        ["Limitaciones:", "Captura la capacidad nacional de adaptación; no varía por ubicación de sucursal dentro del país."],
      ],

      // Methodology tab — Spanish.
      methodology_title: "📘 Metodología y fuentes de datos",
      methodology_intro: "Todas las entradas del Light PCRA, con su resolución, vigencia y licencia.",
      methodology_table_headers: ["Fuente", "Propósito", "Resolución", "Vigencia", "Licencia"],
      methodology_sources: [
        {source: "GFDRR ThinkHazard v2", purpose: "Detección de amenazas — 8 amenazas cada una 0–4", resolution: "ADM2 (provincia / departamento / condado)", vintage: "2017", license: "CC BY 4.0"},
        {source: "GeoNames cities500", purpose: "Geocodificación de sucursales", resolution: "Centroide de ciudad", vintage: "Actualización continua", license: "CC BY 4.0"},
        {source: "WRI Aqueduct 4.0", purpose: "Estrés hídrico + sequía (pestaña Riesgo hídrico)", resolution: "Agregado nacional", vintage: "2023", license: "CC BY 4.0"},
        {source: "World Bank CCKP", purpose: "Proyección climática a 2050 (pestaña Trayectoria climática)", resolution: "Nacional, ensamble CMIP6 SSP2-4.5", vintage: "2024", license: "CC BY 4.0"},
        {source: "NASA POWER", purpose: "Climatología de 30 años en coordenadas de sucursal (pestaña Clima del sitio)", resolution: "Cuadrícula ~0.5° (~55 km)", vintage: "Ventana de 30 años", license: "Dominio público"},
        {source: "Índice de País ND-GAIN", purpose: "Vulnerabilidad + preparación de adaptación nacional (pestaña Contexto del país)", resolution: "Nacional", vintage: "Anual", license: "CC BY-SA 4.0"},
      ],
      methodology_score_title: "Puntaje compuesto de riesgo",
      methodology_score_body: "Puntaje por sucursal = suma de los niveles de amenaza reportados × (8 / número de amenazas con datos). Las sucursales sin coincidencia ThinkHazard se etiquetan como Sin coincidencia y se excluyen de los KPIs agregados. Umbrales: Alto ≥ 20, Medio 12–19, Bajo < 12.",
      methodology_limitations_title: "Limitaciones",
      methodology_limitations_body: "La metodología ThinkHazard v2 es de 2017; la granularidad ADM2 puede ser más gruesa que la exposición real de una sucursal. Riesgo hídrico, trayectoria climática y contexto nacional son a nivel país; las condiciones a nivel de sucursal pueden diferir sustancialmente. Hay alternativas sub-nacionales en la hoja de ruta.",

      // Footer
      footer_text: "Creado por Portia, tu analista climático personal",
    },
  };

  // Reverse map from canonical English hazard label (used in older
  // payloads or as a fallback when top_hazard_code is missing) to code.
  const HAZARD_LABEL_TO_CODE = {
    "Earthquake": "EQ", "Tsunami": "TS", "Cyclone": "CY",
    "River Flood": "FL", "Urban Flood": "UF", "Coastal Flood": "CF",
    "Landslide": "LS", "Extreme Heat": "EH",
  };

  // Mutable runtime state — currentLang is initialized at main(); cachedPayload
  // is the parsed payload, kept so we can re-render on language switch without
  // refetching.
  let currentLang = "en";
  let cachedPayload = null;

  const NAV_DEFS = [
    {slug:"summary",     key:"nav_summary"},
    {slug:"branches",    key:"nav_branches"},
    {slug:"water",       key:"nav_water"},
    {slug:"trajectory",  key:"nav_trajectory"},
    {slug:"site",        key:"nav_site"},
    {slug:"context",     key:"nav_context"},
    {slug:"methodology", key:"nav_methodology"},
  ];

  // ── i18n helpers ────────────────────────────────────────────────────
  function detectInitialLang() {
    try {
      const u = new URLSearchParams(window.location.search).get("lang");
      if (u) {
        const norm = u.toLowerCase().slice(0, 2);
        if (SUPPORTED_LANGS.includes(norm)) return norm;
      }
      const stored = localStorage.getItem(LANG_STORAGE_KEY);
      if (stored && SUPPORTED_LANGS.includes(stored)) return stored;
      const nav = (navigator.language || "en").toLowerCase().slice(0, 2);
      if (SUPPORTED_LANGS.includes(nav)) return nav;
    } catch (_) { /* ignore */ }
    return "en";
  }

  function t(key, ...args) {
    const locale = LOCALES[currentLang] || LOCALES.en;
    let v = locale[key];
    if (v == null) v = LOCALES.en[key];
    if (v == null) return key;
    return typeof v === "function" ? v(...args) : v;
  }

  function setLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
    currentLang = lang;
    document.documentElement.setAttribute("lang", lang);
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch (_) {}
    if (!cachedPayload) return;
    // Preserve the active tab when re-rendering — buildNav re-creates the
    // nav and would otherwise reset to the first tab.
    const active = document.querySelector(".nav-item.active");
    const activeSlug = active ? active.dataset.tab : null;
    renderAll(cachedPayload);
    if (activeSlug) setActive(activeSlug);
  }

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
  // Coverage color and banner — surface partial branch coverage prominently.
  // Thresholds: 100% green, 95-99% yellow, 90-94% amber, 70-89% amber-strong,
  // < 70% red.
  function coverageColor(pct) {
    if (pct >= 100) return "#8bbc3a";
    if (pct >= 95)  return "var(--yellow)";
    if (pct >= 70)  return "var(--amber)";
    return "#d8607a";
  }
  function renderCoverageBanner(banner, cov) {
    banner.innerHTML = "";
    banner.className = "coverage-banner";
    if (!cov || !cov.unmatched || cov.unmatched <= 0) {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    const pct = cov.uploaded > 0 ? (cov.matched / cov.uploaded) * 100 : 100;
    banner.classList.add(pct < 70 ? "cb-alert" : "cb-warn");
    banner.appendChild(el("span", {class:"coverage-banner-icon", "aria-hidden":"true"}, "⚠"));
    const txt = el("div", {class:"coverage-banner-text"});
    txt.appendChild(el("strong", {}, t("coverage_banner_lead", cov.unmatched, cov.uploaded)));
    txt.appendChild(document.createTextNode(" " + t("coverage_banner_hint")));
    banner.appendChild(txt);
  }

  // Renders a string with **bold** spans into `target` as text + <strong>
  // nodes. Avoids innerHTML so we don't have to think about XSS even though
  // the source is our own LOCALES.
  function renderBoldMarkdown(text, target) {
    const parts = String(text).split(/\*\*(.+?)\*\*/g);
    parts.forEach((p, i) => {
      if (!p) return;
      if (i % 2 === 1) target.appendChild(el("strong", {}, p));
      else target.appendChild(document.createTextNode(p));
    });
  }

  // Native <details> info widget appended to a panel's card-title. The key
  // (e.g. "water", "trajectory") looks up an info_<key> entry in LOCALES,
  // which is an array of [label, value] rows.
  function makePanelInfo(key) {
    const rows = t("info_" + key);
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const det = el("details", {class:"panel-info"});
    det.appendChild(el("summary", {"aria-label": t("info_aria") || "Info"}, "ⓘ"));
    const body = el("div", {class:"panel-info-body"});
    rows.forEach(([label, value]) => {
      const row = el("div", {class:"pi-row"});
      row.appendChild(el("strong", {}, label + " "));
      row.appendChild(document.createTextNode(value));
      body.appendChild(row);
    });
    det.appendChild(body);
    return det;
  }

  // Build a panel title with a "ⓘ" callout appended. Used by every layer
  // panel (water, trajectory, site, context) so each surfaces its dataset
  // version + resolution + license without users having to scroll to the
  // Methodology tab.
  function titleWithInfo(titleText, infoKey) {
    const title = el("div", {class:"card-title"});
    title.appendChild(document.createTextNode(titleText));
    const info = makePanelInfo(infoKey);
    if (info) title.appendChild(info);
    return title;
  }

  // Hazard name lookup: prefers the payload's `code` field; falls back to
  // reverse-mapping the English `name` if no code is present (older payloads).
  function hazardName(h) {
    const code = h.code || HAZARD_LABEL_TO_CODE[h.name];
    return code ? t("hazard_" + code) : (h.name || "");
  }
  function tierLabel(tier) {
    return t("tier_" + tier) || tier;
  }
  function levelLabel(v) {
    return t("level_" + v) || "";
  }
  function matchLabel(mt) {
    if (!mt) return t("match_not_found");
    if (mt === "exact") return t("match_exact");
    if (/region/i.test(mt)) return t("match_region");
    if (/fuzzy/i.test(mt)) return t("match_fuzzy");
    return t("match_not_found");
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
    nav.innerHTML = "";
    nav.appendChild(el("div", {class:"nav-section"}, t("sidebar_section")));
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
      a.appendChild(el("span", {}, t(d.key)));
      a.addEventListener("click", () => setActive(d.slug));
      nav.appendChild(a);
    });
  }

  // ── Panel renderers ─────────────────────────────────────────────────
  function renderTopbar(payload) {
    const eyebrow = document.getElementById("topbar-eyebrow");
    if (eyebrow) eyebrow.textContent = t("app_eyebrow");

    const title = document.getElementById("title");
    const country = payload.country_display || "";
    title.innerHTML = "";
    title.appendChild(document.createTextNode(payload.fsp_name));
    if (country) {
      title.appendChild(document.createTextNode(", "));
      title.appendChild(el("span", {class:"topbar-country"}, country));
    }
    const chip = document.getElementById("tier-chip");
    chip.textContent = t("portfolio_tier", tierLabel(payload.tier.label));
    chip.style.background = payload.tier.color;
    document.title = t("page_title", payload.fsp_name);
  }

  // Plain-language portfolio narrative at the top of the Summary tab.
  // Composed from existing payload fields (no new server side needed);
  // hidden if any of the required fields is missing.
  function renderSummaryNarrative(payload) {
    const target = document.getElementById("summary-narrative");
    if (!target) return;
    target.innerHTML = "";
    if (!payload || !payload.kpi || !payload.tier) {
      target.hidden = true;
      return;
    }
    const cov = payload.coverage;
    const coverage_all = !cov || cov.unmatched === 0;
    const topHazardCode = payload.kpi.top_hazard_code;
    const topHazard = topHazardCode
      ? t("hazard_" + topHazardCode)
      : (payload.kpi.top_hazard_label || "—");
    const data = {
      fsp_name: payload.fsp_name,
      country_phrase: payload.country_display || "",
      coverage_all,
      total: cov ? cov.uploaded : payload.kpi.total,
      matched: cov ? cov.matched : payload.kpi.total,
      tier_display: tierLabel(payload.tier.label),
      avg: payload.kpi.avg,
      top_hazard: topHazard,
      worst: payload.worst ? {
        name: payload.worst.name,
        score: payload.worst.score,
        tier_display: tierLabel(payload.worst.tier),
      } : null,
    };
    const md = t("narrative", data);
    if (!md) { target.hidden = true; return; }
    target.hidden = false;
    renderBoldMarkdown(md, target);
  }

  function renderSummary(payload) {
    renderSummaryNarrative(payload);

    const kpis = document.getElementById("kpis");
    kpis.innerHTML = "";

    // Coverage banner + KPI. payload.coverage is added by the Python tool;
    // fall back to kpi.total for older payloads (treat as full coverage).
    const cov = payload.coverage || {
      uploaded: payload.kpi.total,
      matched: payload.kpi.total,
      unmatched: 0,
    };
    const coverageBanner = document.getElementById("coverage-banner");
    if (coverageBanner) renderCoverageBanner(coverageBanner, cov);

    const pct = cov.uploaded > 0
      ? Math.round((cov.matched / cov.uploaded) * 100)
      : 100;
    const covColor = coverageColor(pct);
    const covTitle = t("coverage_tooltip", cov.matched, cov.uploaded);

    // Resolve top-hazard display: prefer kpi.top_hazard_code (stable), fall
    // back to reverse-mapping the English label.
    let topHazardDisplay = "—";
    if (payload.kpi.top_hazard_code) {
      topHazardDisplay = t("hazard_" + payload.kpi.top_hazard_code);
    } else if (payload.kpi.top_hazard_label) {
      const code = HAZARD_LABEL_TO_CODE[payload.kpi.top_hazard_label];
      topHazardDisplay = code ? t("hazard_" + code) : payload.kpi.top_hazard_label;
    }

    const cards = [
      {label: t("kpi_total"),       value: String(cov.uploaded), color: "var(--cream)"},
      {label: t("kpi_coverage"),    value: pct + "%",            color: covColor, title: covTitle},
      {label: t("kpi_high"),        value: String(payload.kpi.high),   color: "#d8607a"},
      {label: t("kpi_medium"),      value: String(payload.kpi.medium), color: "var(--amber)"},
      {label: t("kpi_low"),         value: String(payload.kpi.low),    color: "#8bbc3a"},
      {label: t("kpi_avg"),         value: String(payload.kpi.avg),    color: "var(--yellow)"},
      {label: t("kpi_top_hazard"),  value: topHazardDisplay,           color: "var(--cream)"},
    ];
    cards.forEach(card => {
      const attrs = {class:"kpi"};
      if (card.title) attrs.title = card.title;
      const c = el("div", attrs);
      c.appendChild(el("div", {class:"kpi-v", style:`color:${card.color}`}, card.value));
      c.appendChild(el("div", {class:"kpi-l"}, card.label));
      kpis.appendChild(c);
    });

    // Update the static "Hazard exposure profile" section title.
    const summaryPanel = document.getElementById("tab-summary");
    const sectionTitle = summaryPanel
      ? summaryPanel.querySelector(".section-title") : null;
    if (sectionTitle) sectionTitle.textContent = t("hazard_profile_title");

    const bars = document.getElementById("hazard-bars");
    bars.innerHTML = "";
    payload.hazards.forEach(h => {
      const row = el("div", {class:"hbar-row"});
      row.appendChild(el("div", {class:"hbar-l"}, hazardName(h)));
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
    wb.innerHTML = "";
    if (payload.worst && payload.best && payload.worst.name !== payload.best.name) {
      const grid = el("div", {class:"grid-2 mt24"});
      grid.appendChild(makeWB(payload.worst, "bad", t("worst_branch_title")));
      grid.appendChild(makeWB(payload.best, "good", t("best_branch_title")));
      wb.appendChild(grid);
    }
  }
  function makeWB(b, kind, title) {
    const c = el("div", {class:"wb-card " + kind});
    c.appendChild(el("div", {class:"card-title"}, title));
    c.appendChild(el("div", {class:"card-big"}, b.name));
    const sub = el("div", {class:"card-sub"});
    sub.appendChild(document.createTextNode(`${b.city} · ${t("score_word")} ${b.score} · `));
    sub.appendChild(el("span", {class:"tp " + tierClass(b.tier)}, tierLabel(b.tier)));
    c.appendChild(sub);
    return c;
  }

  // Branch table — interactive: text-filter, region/tier/match dropdowns,
  // and column sort via clickable headers. State (filters + sort) is held
  // in `branchState` and a single applyFilters() call re-renders the tbody.
  const TIER_ORDER = {High:3, Medium:2, Low:1, Unmatched:0};
  const branchState = {
    rows: [],
    colDefs: [],
    text: "",
    region: "",
    tier: "",
    match: "",
    sortKey: null,
    sortDir: 1,
  };

  // Bucket the raw match_type into a canonical key for filtering. The key
  // is language-independent ("exact" / "fuzzy" / "region" / "not_found"); the
  // dropdown shows the localized display via matchLabel().
  function matchBucket(mt) {
    if (!mt) return "not_found";
    if (mt === "exact") return "exact";
    if (/region/i.test(mt)) return "region";
    if (/fuzzy/i.test(mt)) return "fuzzy";
    return "not_found";
  }

  function renderBranches(payload) {
    const noteEl = document.getElementById("branches-note");
    noteEl.textContent = payload.branches_note || "";

    const hazardCols = payload.hazards.map((h, i) => ({
      label: hazardName(h), align: "center",
      value: (b) => (b.h && typeof b.h[i] === "number") ? b.h[i] : -1,
    }));
    const colDefs = [
      {label:t("table_col_branch"), align:"left",   value:(b)=>(b.name||"").toLowerCase()},
      {label:t("table_col_city"),   align:"left",   value:(b)=>(b.city||"").toLowerCase()},
      {label:t("table_col_region"), align:"left",   value:(b)=>(b.state||"").toLowerCase()},
      {label:t("table_col_match"),  align:"center", value:(b)=>matchBucket(b.match_type)},
      {label:t("table_col_score"),  align:"center", value:(b)=>(b.score==null ? -1 : Number(b.score))},
      {label:t("table_col_tier"),   align:"center", value:(b)=>(TIER_ORDER[b.tier] || 0)},
    ].concat(hazardCols);

    const thead = document.getElementById("branch-thead");
    thead.innerHTML = "";
    colDefs.forEach((col, i) => {
      const th = el("th", {
        class: (col.align==="center" ? "ccenter " : "") + "sortable",
        "data-sort-key": String(i),
      });
      th.appendChild(document.createTextNode(col.label));
      th.appendChild(el("span", {class:"sort-ind", "data-for": String(i)}, ""));
      th.addEventListener("click", () => {
        if (branchState.sortKey === i) branchState.sortDir *= -1;
        else { branchState.sortKey = i; branchState.sortDir = 1; }
        applyFilters();
      });
      thead.appendChild(th);
    });

    branchState.rows = payload.branches.slice();
    branchState.colDefs = colDefs;

    buildFilterRow(payload);
    applyFilters();
  }

  function buildFilterRow(payload) {
    const host = document.getElementById("branch-filters");
    host.hidden = false;
    host.innerHTML = "";

    const textWrap = el("label", {class:"branch-filter"});
    textWrap.appendChild(el("span", {class:"branch-filter-label"}, t("filter_search")));
    const text = el("input", {
      type:"search", placeholder:t("filter_search_placeholder"),
      class:"branch-filter-input",
    });
    if (branchState.text) text.value = branchState.text;
    text.addEventListener("input", () => {
      branchState.text = text.value.trim().toLowerCase();
      applyFilters();
    });
    textWrap.appendChild(text);
    host.appendChild(textWrap);

    const regions = Array.from(new Set(
      payload.branches.map(b => (b.state || "").trim())
    )).filter(s => s.length > 0).sort((a,b) => a.localeCompare(b));
    host.appendChild(makeSelect(t("filter_region"), regions, branchState.region,
      (v) => { branchState.region = v; applyFilters(); }));

    const tiers = Array.from(new Set(payload.branches.map(b => b.tier || "")))
      .filter(t => t.length > 0)
      .sort((a,b) => (TIER_ORDER[b]||0) - (TIER_ORDER[a]||0));
    const tierOpts = tiers.map(canon => ({value: canon, display: tierLabel(canon)}));
    host.appendChild(makeSelect(t("filter_tier"), tierOpts, branchState.tier,
      (v) => { branchState.tier = v; applyFilters(); }));

    const matchBuckets = Array.from(new Set(
      payload.branches.map(b => matchBucket(b.match_type))
    )).sort();
    const matchOpts = matchBuckets.map(bk => ({
      value: bk,
      display: matchLabel(bk === "not_found" ? "" : bk),
    }));
    host.appendChild(makeSelect(t("filter_match"), matchOpts, branchState.match,
      (v) => { branchState.match = v; applyFilters(); }));

    const reset = el("button", {type:"button", class:"branch-filter-reset"},
                     t("filter_reset"));
    reset.addEventListener("click", () => {
      branchState.text = ""; branchState.region = "";
      branchState.tier = ""; branchState.match = "";
      branchState.sortKey = null; branchState.sortDir = 1;
      host.querySelectorAll("input,select").forEach(node => {
        node.value = "";
      });
      applyFilters();
    });
    host.appendChild(reset);
  }

  // makeSelect accepts options as either an array of strings (value = display)
  // or an array of {value, display} objects (separate canonical filter key
  // from localized display label).
  function makeSelect(label, options, currentValue, onChange) {
    const wrap = el("label", {class:"branch-filter"});
    wrap.appendChild(el("span", {class:"branch-filter-label"}, label));
    const sel = el("select", {class:"branch-filter-input"});
    sel.appendChild(el("option", {value:""}, t("filter_all")));
    options.forEach(opt => {
      const value = typeof opt === "string" ? opt : opt.value;
      const display = typeof opt === "string" ? opt : opt.display;
      const o = el("option", {value: value}, display);
      sel.appendChild(o);
    });
    if (currentValue) sel.value = currentValue;
    sel.addEventListener("change", () => onChange(sel.value));
    wrap.appendChild(sel);
    return wrap;
  }

  function applyFilters() {
    const {rows, colDefs, text, region, tier, match,
           sortKey, sortDir} = branchState;
    let out = rows;
    if (text) {
      out = out.filter(b =>
        (b.name||"").toLowerCase().includes(text) ||
        (b.city||"").toLowerCase().includes(text));
    }
    if (region) out = out.filter(b => (b.state||"") === region);
    if (tier)   out = out.filter(b => (b.tier||"") === tier);
    if (match)  out = out.filter(b => matchBucket(b.match_type) === match);

    if (sortKey != null && colDefs[sortKey]) {
      const col = colDefs[sortKey];
      out = out.slice().sort((a, b) => {
        const va = col.value(a), vb = col.value(b);
        if (va === vb) return 0;
        if (typeof va === "number" && typeof vb === "number") {
          return (va - vb) * sortDir;
        }
        return (va < vb ? -1 : 1) * sortDir;
      });
    }

    document.querySelectorAll(".sort-ind").forEach(node => {
      const k = Number(node.getAttribute("data-for"));
      node.textContent = (sortKey === k) ? (sortDir > 0 ? " ▲" : " ▼") : "";
    });

    const total = rows.length;
    const shown = out.length;
    const cnt = document.getElementById("branch-count");
    cnt.hidden = false;
    cnt.textContent = (shown === total)
      ? t("branch_count_all", total)
      : t("branch_count_filtered", shown, total);

    const tbody = document.getElementById("branch-tbody");
    tbody.innerHTML = "";
    out.forEach(b => tbody.appendChild(renderBranchRow(b)));
  }

  function renderBranchRow(b) {
    const tr = el("tr");
    tr.appendChild(el("td", {class:"bname"}, b.name));
    tr.appendChild(el("td", {}, b.city || ""));
    tr.appendChild(el("td", {}, b.state || ""));
    const matchTd = el("td", {class:"ccenter"});
    matchTd.appendChild(el("span", {class:"pill " + matchClass(b.match_type)},
                              matchLabel(b.match_type)));
    tr.appendChild(matchTd);
    tr.appendChild(el("td", {class:"ccenter score"}, b.score == null ? "—" : String(b.score)));
    const tierTd = el("td", {class:"ccenter"});
    tierTd.appendChild(el("span", {class:"tp " + tierClass(b.tier)}, tierLabel(b.tier)));
    tr.appendChild(tierTd);
    (b.h || []).forEach(v => {
      tr.appendChild(el("td", {class:"h h" + v}, levelLabel(v)));
    });
    return tr;
  }

  function renderWater(payload) {
    const tab = document.getElementById("tab-water");
    tab.innerHTML = "";
    if (!payload.water) return;
    const w = payload.water;
    const card = el("div", {class:"card mb16"});
    card.appendChild(titleWithInfo(t("water_title", w.country), "water"));
    card.appendChild(el("div", {class:"card-sub mb12"}, t("water_source")));
    const grid = el("div", {class:"grid-2"});
    grid.appendChild(stressBlock(t("water_stress"), w.water_stress));
    grid.appendChild(stressBlock(t("water_drought"), w.drought));
    card.appendChild(grid);
    if (w.region) {
      card.appendChild(el("div", {class:"card-sub", style:"margin-top:10px;"},
        t("water_region", w.region)));
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
    val.appendChild(el("span", {style:"font-size:0.7rem;color:var(--text-dim);font-family:'Inter',sans-serif;font-weight:500;"}, " /5"));
    d.appendChild(val);
    if (label) d.appendChild(el("div", {class:"card-sub", style:"margin-top:4px;"}, label));
    return d;
  }

  function renderTrajectory(payload) {
    const tab = document.getElementById("tab-trajectory");
    tab.innerHTML = "";
    if (!payload.trajectory) return;
    const tr = payload.trajectory;
    const card = el("div", {class:"card mb16"});
    card.appendChild(titleWithInfo(t("trajectory_title", tr.country), "trajectory"));
    card.appendChild(el("div", {class:"card-sub mb12"}, t("trajectory_source")));
    const grid = el("div", {class:"grid-4"});
    const cell = (label, value, color) => {
      const c = el("div");
      c.appendChild(el("div", {class:"kpi-l"}, label));
      c.appendChild(el("div", {class:"kpi-v", style: color ? `color:${color}` : ""}, value));
      return c;
    };
    grid.appendChild(cell(t("trajectory_base_temp"), fmt(tr.base_tas, 2, " °C")));
    grid.appendChild(cell(t("trajectory_future_temp"), fmt(tr.fut_tas, 2, " °C")));
    const dTas = tr.d_tas;
    grid.appendChild(cell(t("trajectory_delta_temp"),
      (dTas != null && dTas > 0 ? "+" : "") + fmt(dTas, 2, " °C"), "#d8607a"));
    const dPr = tr.d_pr;
    grid.appendChild(cell(t("trajectory_delta_precip"),
      (dPr != null && dPr > 0 ? "+" : "") + fmt(dPr, 2, " %"), "var(--yellow)"));
    card.appendChild(grid);
    tab.appendChild(card);
  }

  function renderSite(payload) {
    const tab = document.getElementById("tab-site");
    tab.innerHTML = "";
    if (!payload.site || !payload.site.length) return;
    tab.appendChild(titleWithInfo(t("site_title"), "site"));
    tab.appendChild(el("div", {class:"card-sub mb12"}, t("site_source")));
    const wrap = el("div", {class:"tbl-wrap"});
    const table = el("table");
    const thead = el("thead");
    const trh = el("tr");
    const headers = [
      t("site_col_branch"), t("site_col_city"), t("site_col_mean_t"),
      t("site_col_max_t"), t("site_col_min_t"), t("site_col_precip"),
      t("site_col_wind"),
    ];
    headers.forEach((h, i) => trh.appendChild(el("th", {class: i >= 2 ? "ccenter" : ""}, h)));
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = el("tbody");
    payload.site.forEach(s => {
      const row = el("tr");
      row.appendChild(el("td", {}, s.name));
      row.appendChild(el("td", {}, s.city || ""));
      row.appendChild(el("td", {class:"ccenter"}, fmt(s.t2m)));
      row.appendChild(el("td", {class:"ccenter"}, fmt(s.t2m_max)));
      row.appendChild(el("td", {class:"ccenter"}, fmt(s.t2m_min)));
      row.appendChild(el("td", {class:"ccenter"}, fmt(s.precip)));
      row.appendChild(el("td", {class:"ccenter"}, fmt(s.wind)));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    tab.appendChild(wrap);
  }

  function renderContext(payload) {
    const tab = document.getElementById("tab-context");
    tab.innerHTML = "";
    if (!payload.context) return;
    const ctx = payload.context;
    const card = el("div", {class:"card mb16"});
    card.appendChild(titleWithInfo(t("context_title", ctx.country), "context"));
    card.appendChild(el("div", {class:"card-sub mb12"}, t("context_source")));
    const grid = el("div", {class:"grid-4"});
    const score = ctx.ndgain != null ? Number(ctx.ndgain).toFixed(1) : "—";
    const vuln = ctx.vulnerability != null ? Number(ctx.vulnerability).toFixed(2) : "—";
    const rdy = ctx.readiness != null ? Number(ctx.readiness).toFixed(2) : "—";
    const colS = gainColor(ctx.ndgain, false);
    const colV = gainColor(ctx.vulnerability, true);
    const colR = gainColor(ctx.readiness, false);
    const mkCell = (label, value, color, sub, isNdgain) => {
      const c = el("div");
      c.appendChild(el("div", {class:"kpi-l"}, label));
      const val = el("div", {class:"kpi-v", style:`color:${color}`});
      val.appendChild(document.createTextNode(value));
      if (isNdgain) {
        val.appendChild(el("span", {style:"font-size:0.7rem;color:var(--text-dim);font-family:'Inter',sans-serif;font-weight:500;"}, " /100"));
      }
      c.appendChild(val);
      if (sub) c.appendChild(el("div", {class:"card-sub", style:"margin-top:4px;"}, sub));
      return c;
    };
    grid.appendChild(mkCell(t("context_ndgain"), score, colS, null, true));
    grid.appendChild(mkCell(t("context_vulnerability"), vuln, colV, t("context_lower_better"), false));
    grid.appendChild(mkCell(t("context_readiness"), rdy, colR, t("context_higher_better"), false));
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

  // Methodology panel: structured table of all data sources + score formula
  // + limitations. Content lives in LOCALES so it switches with the active
  // language. Stripped of static HTML in index.html.
  function renderMethodology(_payload) {
    const tab = document.getElementById("tab-methodology");
    tab.innerHTML = "";
    const card = el("div", {class:"card"});
    card.appendChild(el("div", {class:"card-title"}, t("methodology_title")));
    card.appendChild(el("div", {class:"card-sub mb12"}, t("methodology_intro")));

    // Sources table
    const tblWrap = el("div", {class:"tbl-wrap"});
    const table = el("table");
    const thead = el("thead");
    const trh = el("tr");
    const headers = t("methodology_table_headers") || [];
    headers.forEach((h, i) => trh.appendChild(el("th", {class: i >= 2 ? "ccenter" : ""}, h)));
    thead.appendChild(trh);
    table.appendChild(thead);
    const tbody = el("tbody");
    (t("methodology_sources") || []).forEach(s => {
      const tr = el("tr");
      tr.appendChild(el("td", {class:"bname"}, s.source));
      tr.appendChild(el("td", {}, s.purpose));
      tr.appendChild(el("td", {class:"ccenter"}, s.resolution));
      tr.appendChild(el("td", {class:"ccenter"}, s.vintage));
      tr.appendChild(el("td", {class:"ccenter"}, s.license));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tblWrap.appendChild(table);
    card.appendChild(tblWrap);

    // Score formula
    card.appendChild(el("div", {class:"meth-section-title"}, t("methodology_score_title")));
    card.appendChild(el("div", {class:"meth-section-body"}, t("methodology_score_body")));

    // Limitations
    card.appendChild(el("div", {class:"meth-section-title"}, t("methodology_limitations_title")));
    card.appendChild(el("div", {class:"meth-section-body"}, t("methodology_limitations_body")));

    tab.appendChild(card);
  }

  function renderFooter(payload) {
    const ftr = document.getElementById("ftr-text");
    ftr.textContent = t("footer_text") + " · " + payload.gen_date;
  }

  // Theme toggle — initial value is applied by an inline script in
  // index.html <head> before first paint, so by the time this runs the
  // attribute is already set correctly. We just wire the click handler
  // and persist subsequent flips. Storage key is kept in sync with the
  // inline script (portia.theme).
  function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") === "light"
        ? "light" : "dark";
      const next = cur === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("portia.theme", next); } catch (_) { /* ignore */ }
    });
  }

  // Language switcher — initial value matches the lang attribute the
  // inline script in index.html set before first paint. Subsequent
  // changes call setLang() which re-renders.
  function initLangSwitcher() {
    const sel = document.getElementById("lang-switcher");
    if (!sel) return;
    sel.value = currentLang;
    sel.addEventListener("change", () => setLang(sel.value));
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

  // Run the full render pipeline. Called once on initial load, and again
  // by setLang() when the user switches language — every renderX function
  // clears its target container first so re-rendering is idempotent.
  function renderAll(payload) {
    buildNav(payload);
    renderTopbar(payload);
    renderSummary(payload);
    renderBranches(payload);
    renderWater(payload);
    renderTrajectory(payload);
    renderSite(payload);
    renderContext(payload);
    renderMethodology(payload);
    renderFooter(payload);
  }

  // ── Main ────────────────────────────────────────────────────────────
  async function main() {
    currentLang = detectInitialLang();
    document.documentElement.setAttribute("lang", currentLang);
    try {
      cachedPayload = await getPayload();
      renderAll(cachedPayload);
      initThemeToggle();
      initLangSwitcher();
      document.getElementById("app").hidden = false;
    } catch (e) {
      const err = document.getElementById("error");
      err.hidden = false;
      err.innerHTML = `
        <h2>⚠ ${t("error_title")}</h2>
        <p>${t("error_body")}</p>
        <pre>${(e && e.message) || String(e)}</pre>
      `;
      console.error(e);
    } finally {
      hideLoading();
    }
  }
  main();
})();
