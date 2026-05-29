/* Portia dashboard template - client-side renderer with i18n.
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
 *     score_max: 10,                 // all scores are on a 0-score_max scale
 *     kpi: {
 *       total: 190, high: 96, medium: 94, low: 0,
 *       avg: 5.8,                      // 0-10
 *       top_hazard_code: "LS",         // hazard code, stable across langs
 *       top_hazard_label: "Landslide"  // English fallback if no code
 *     },
 *     tier: { label: "High", color: "#96253a" },  // canonical English
 *     hazards: [
 *       { code:"EQ", name:"Earthquake", value: 3.0 },  // 0-4 hazard means
 *       ...
 *     ],
 *     worst: { name, city, score, tier } | null,   // score 0-10
 *     best:  { name, city, score, tier } | null,
 *     branches: [
 *       // score 0-10; settlement "U"|"P"|"R" (urban/peri-urban/rural);
 *       // lat/lon present only when the branch was geocoded.
 *       { name, city, state, match_type, score, tier, settlement, h:[0-4]*8, lat?, lon? },
 *       ...
 *     ],
 *     branches_note: "Showing 75 of 190..." | null,
 *     regions: [                     // per-state aggregation, worst-first
 *       { name, count, avg_score, tier, high, medium, low },
 *       ...
 *     ],
 *     coverage: {                    // optional; absent on older payloads
 *       uploaded: 190, matched: 165, unmatched: 25
 *     } | null,
 *     score_dimensions: null,        // reserved for future multi-dim methodology
 *     // The fields below are still emitted for ad-hoc LLM queries but the
 *     // dashboard no longer renders Water / Site / Country-context panels.
 *     // Climate Trajectory IS still shown.
 *     trajectory: { country, base_tas, fut_tas, d_tas, d_pr } | null,
 *     water: {...} | null, site: [...] | null, context: {...} | null  // not rendered
 *   }
 *
 * String fields in the payload (tier.label, hazards[i].name, kpi.top_hazard_label,
 * branches[].tier, branches[].match_type) are emitted in canonical English by
 * the Python tool. The dashboard maps them client-side to the active language
 * via the LOCALES dict below. Hazard codes (EQ, TS, ...) and tier labels
 * (High, Medium, Low, Unmatched) are the join keys - keep them in sync with
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
      page_title: (fsp) => `Portia PCRA - ${fsp}`,
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
      hazard_profile_title: "Hazard exposure profile (portfolio mean, 0-4 scale)",
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
      water_title: (country) => `Water risk - ${country}`,
      water_source: "Source: WRI Aqueduct 4.0 country-level baseline (scored 0 = no risk, 5 = extreme).",
      water_stress: "Water stress",
      water_drought: "Drought",
      water_region: (r) => `Region: ${r}`,

      // Trajectory tab
      trajectory_title: (country) => `Climate trajectory - ${country}`,
      trajectory_source: "CMIP6 SSP2-4.5 ensemble, 2040-2059 vs. CRU 1991-2020 baseline. Source: World Bank CCKP.",
      trajectory_base_temp: "Baseline temp",
      trajectory_future_temp: "2050 temp",
      trajectory_delta_temp: "Δ temperature",
      trajectory_delta_precip: "Δ precipitation",

      // Site tab
      site_title: "Site climate",
      site_source: "Annual climatology averages at each branch's coordinates (NASA POWER 30-year climatology).",
      site_col_branch: "Branch",
      site_col_city: "City",
      site_col_mean_t: "Mean T (°C)",
      site_col_max_t: "Max T (°C)",
      site_col_min_t: "Min T (°C)",
      site_col_precip: "Precip (mm/day)",
      site_col_wind: "Wind 10m (m/s)",

      // Context tab
      context_title: (country) => `Country context - ${country}`,
      context_source: "Source: ND-GAIN Country Index - overall climate-adaptation score (0-100, higher is better), broken into vulnerability (0-1, lower is better) and readiness (0-1, higher is better).",
      context_ndgain: "ND-GAIN score",
      context_vulnerability: "Vulnerability",
      context_readiness: "Readiness",
      context_lower_better: "lower is better",
      context_higher_better: "higher is better",

      // Plain-language summary narrative - composed client-side from the
      // existing payload fields. `data` is built by renderSummaryNarrative().
      // Bold spans use **markdown** and are parsed safely with renderBoldMarkdown.
      narrative: (data) => {
        const cov = data.coverage_all
          ? `this assessment covers all ${data.total} branches`
          : `this assessment covers ${data.total} branches (${data.matched} matched into hazard data)`;
        const worst = data.worst
          ? ` - **${data.worst.name}** (score ${data.worst.score}, ${data.worst.tier_display}) is the worst-exposed branch`
          : "";
        return `${data.fsp_name} operates across ${data.country_phrase}; ${cov}. ` +
               `Portfolio sits at **${data.tier_display}** tier (avg score ${data.avg}) ` +
               `with **${data.top_hazard}** as the dominant hazard${worst}.`;
      },

      // Per-panel "ⓘ" info callouts - opened via native <details>. Each
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
        ["Dataset version:", "World Bank CCKP - CMIP6 SSP2-4.5 ensemble, 2040-2059 vs. CRU 1991-2020 baseline."],
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

      // Methodology tab - structured table of all input data sources.
      methodology_title: "Methodology & Data Sources",
      methodology_intro: "All inputs to the Light PCRA, with their resolution, vintage, and license.",
      methodology_table_headers: ["Source", "Purpose", "Resolution", "Vintage", "License"],
      methodology_sources: [
        {source: "GFDRR ThinkHazard v2", purpose: "Hazard screening - 8 hazards each scored 0-4", resolution: "ADM2 (province / department / county)", vintage: "2017", license: "CC BY 4.0"},
        {source: "GeoNames cities500", purpose: "Branch geocoding", resolution: "City centroid", vintage: "Continuously updated", license: "CC BY 4.0"},
        {source: "WRI Aqueduct 4.0", purpose: "Water stress + drought (country baseline; available to the analyst on request)", resolution: "Country aggregate", vintage: "2023", license: "CC BY 4.0"},
        {source: "World Bank CCKP", purpose: "Climate projection to 2050 (Climate Trajectory tab)", resolution: "Country, CMIP6 SSP2-4.5 ensemble", vintage: "2024", license: "CC BY 4.0"},
        {source: "NASA POWER", purpose: "30-year climatology at branch coordinates (available to the analyst on request)", resolution: "~0.5° grid (~55 km)", vintage: "30-year window", license: "Public domain"},
        {source: "ND-GAIN Country Index", purpose: "Country vulnerability + adaptation readiness (available to the analyst on request)", resolution: "Country", vintage: "Annual", license: "CC BY-SA 4.0"},
      ],
      methodology_score_title: "Composite risk score",
      methodology_score_body: "Per-branch score is normalised to 0-10: Score = (WeightedAverage − 1) / 3 × 10, where WeightedAverage is the mean of the reported hazard levels (1-4) multiplied by a settlement factor (Rural ×1.25, Peri-urban ×1.10, Urban ×1.00 - smaller settlements carry higher climate risk: lower adaptive capacity and fewer financial buffers). Settlement type is inferred from city population (GeoNames); unknown defaults to Peri-urban. Branches with no ThinkHazard match are tagged Unmatched and excluded from KPI aggregates. Tier thresholds: High ≥ 6.7, Medium 3.4-6.7, Low < 3.4.",
      methodology_limitations_title: "Limitations",
      methodology_limitations_body: "ThinkHazard methodology v2 dates from 2017; ADM2 granularity may be coarser than a branch's actual exposure. Water risk, climate trajectory, and country context are country-level; branch-level conditions can differ substantially. Sub-national alternatives are on the roadmap.",

      // Footer
      footer_text: "Created by Portia, your personal climate analyst",

      // ── Light PCRA upgrade additions ──
      nav_regions: "Region Scores",
      nav_map: "Risk Map",
      sidebar_toggle: "Show / hide sidebar",
      export_excel: "Export to Excel",
      export_failed: "Sorry - the Excel export failed. Please try again.",
      table_col_settlement: "Settlement",
      filter_settlement: "Settlement",
      settlement_U: "Urban",
      settlement_P: "Peri-urban",
      settlement_R: "Rural",
      regions_title: "Region risk scores",
      regions_intro: "Average composite score (0-10) of the matched branches in each region. Click a column to sort.",
      regions_col_region: "Region",
      regions_col_branches: "Branches",
      map_title: "Branch risk map",
      map_intro: "Geocoded branches plotted by location, coloured by tier and sized by score.",
      map_note: (shown, total) => `Showing ${shown} of ${total} branches with coordinates.`,
      map_toggle_hint: "Click to show or hide this risk tier",
    },
    es: {
      // Page chrome
      app_eyebrow: "Evaluación de Riesgo Climático del Portafolio",
      sidebar_section: "Riesgo climático",
      page_title: (fsp) => `Portia PCRA - ${fsp}`,
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
      hazard_profile_title: "Perfil de exposición a amenazas (promedio del portafolio, escala 0-4)",
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
      water_title: (country) => `Riesgo hídrico - ${country}`,
      water_source: "Fuente: línea base nacional WRI Aqueduct 4.0 (puntuado 0 = sin riesgo, 5 = extremo).",
      water_stress: "Estrés hídrico",
      water_drought: "Sequía",
      water_region: (r) => `Región: ${r}`,

      // Trajectory tab
      trajectory_title: (country) => `Trayectoria climática - ${country}`,
      trajectory_source: "Ensamble CMIP6 SSP2-4.5, 2040-2059 vs. línea base CRU 1991-2020. Fuente: World Bank CCKP.",
      trajectory_base_temp: "Temp. base",
      trajectory_future_temp: "Temp. 2050",
      trajectory_delta_temp: "Δ temperatura",
      trajectory_delta_precip: "Δ precipitación",

      // Site tab
      site_title: "Clima del sitio",
      site_source: "Promedios climatológicos anuales en las coordenadas de cada sucursal (climatología NASA POWER de 30 años).",
      site_col_branch: "Sucursal",
      site_col_city: "Ciudad",
      site_col_mean_t: "T media (°C)",
      site_col_max_t: "T máx (°C)",
      site_col_min_t: "T mín (°C)",
      site_col_precip: "Precip (mm/día)",
      site_col_wind: "Viento 10m (m/s)",

      // Context tab
      context_title: (country) => `Contexto del país - ${country}`,
      context_source: "Fuente: Índice de País ND-GAIN - puntuación general de adaptación climática (0-100, mayor es mejor), desglosada en vulnerabilidad (0-1, menor es mejor) y preparación (0-1, mayor es mejor).",
      context_ndgain: "Puntaje ND-GAIN",
      context_vulnerability: "Vulnerabilidad",
      context_readiness: "Preparación",
      context_lower_better: "menor es mejor",
      context_higher_better: "mayor es mejor",

      // Plain-language summary narrative - Spanish version.
      narrative: (data) => {
        const cov = data.coverage_all
          ? `esta evaluación cubre las ${data.total} sucursales`
          : `esta evaluación cubre ${data.total} sucursales (${data.matched} con coincidencia)`;
        const worst = data.worst
          ? ` - **${data.worst.name}** (puntaje ${data.worst.score}, ${data.worst.tier_display}) es la sucursal más expuesta`
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
        ["Versión:", "World Bank CCKP - ensamble CMIP6 SSP2-4.5, 2040-2059 vs. línea base CRU 1991-2020."],
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

      // Methodology tab - Spanish.
      methodology_title: "Metodología y fuentes de datos",
      methodology_intro: "Todas las entradas del Light PCRA, con su resolución, vigencia y licencia.",
      methodology_table_headers: ["Fuente", "Propósito", "Resolución", "Vigencia", "Licencia"],
      methodology_sources: [
        {source: "GFDRR ThinkHazard v2", purpose: "Detección de amenazas - 8 amenazas cada una 0-4", resolution: "ADM2 (provincia / departamento / condado)", vintage: "2017", license: "CC BY 4.0"},
        {source: "GeoNames cities500", purpose: "Geocodificación de sucursales", resolution: "Centroide de ciudad", vintage: "Actualización continua", license: "CC BY 4.0"},
        {source: "WRI Aqueduct 4.0", purpose: "Estrés hídrico + sequía (línea base nacional; disponible para el analista a solicitud)", resolution: "Agregado nacional", vintage: "2023", license: "CC BY 4.0"},
        {source: "World Bank CCKP", purpose: "Proyección climática a 2050 (pestaña Trayectoria climática)", resolution: "Nacional, ensamble CMIP6 SSP2-4.5", vintage: "2024", license: "CC BY 4.0"},
        {source: "NASA POWER", purpose: "Climatología de 30 años en coordenadas de sucursal (disponible para el analista a solicitud)", resolution: "Cuadrícula ~0.5° (~55 km)", vintage: "Ventana de 30 años", license: "Dominio público"},
        {source: "Índice de País ND-GAIN", purpose: "Vulnerabilidad + preparación de adaptación nacional (disponible para el analista a solicitud)", resolution: "Nacional", vintage: "Anual", license: "CC BY-SA 4.0"},
      ],
      methodology_score_title: "Puntaje compuesto de riesgo",
      methodology_score_body: "El puntaje por sucursal se normaliza a 0-10: Puntaje = (PromedioPonderado − 1) / 3 × 10, donde PromedioPonderado es la media de los niveles de amenaza reportados (1-4) multiplicada por un factor de asentamiento (Rural ×1.25, Periurbano ×1.10, Urbano ×1.00 - los asentamientos más pequeños tienen mayor riesgo climático: menor capacidad de adaptación y menos colchones financieros). El tipo de asentamiento se infiere de la población de la ciudad (GeoNames); si se desconoce, se asume Periurbano. Las sucursales sin coincidencia ThinkHazard se etiquetan como Sin coincidencia y se excluyen de los KPIs. Umbrales: Alto ≥ 6.7, Medio 3.4-6.7, Bajo < 3.4.",
      methodology_limitations_title: "Limitaciones",
      methodology_limitations_body: "La metodología ThinkHazard v2 es de 2017; la granularidad ADM2 puede ser más gruesa que la exposición real de una sucursal. Riesgo hídrico, trayectoria climática y contexto nacional son a nivel país; las condiciones a nivel de sucursal pueden diferir sustancialmente. Hay alternativas sub-nacionales en la hoja de ruta.",

      // Footer
      footer_text: "Creado por Portia, tu analista climático personal",

      // ── Light PCRA upgrade additions ──
      nav_regions: "Puntajes por región",
      nav_map: "Mapa de riesgo",
      sidebar_toggle: "Mostrar / ocultar barra lateral",
      export_excel: "Exportar a Excel",
      export_failed: "Lo sentimos - la exportación a Excel falló. Inténtalo de nuevo.",
      table_col_settlement: "Asentamiento",
      filter_settlement: "Asentamiento",
      settlement_U: "Urbano",
      settlement_P: "Periurbano",
      settlement_R: "Rural",
      regions_title: "Puntajes de riesgo por región",
      regions_intro: "Puntaje compuesto promedio (0-10) de las sucursales con coincidencia en cada región. Haz clic en una columna para ordenar.",
      regions_col_region: "Región",
      regions_col_branches: "Sucursales",
      map_title: "Mapa de riesgo de sucursales",
      map_intro: "Sucursales geocodificadas ubicadas por coordenadas, coloreadas por nivel y dimensionadas por puntaje.",
      map_note: (shown, total) => `Mostrando ${shown} de ${total} sucursales con coordenadas.`,
      map_toggle_hint: "Haz clic para mostrar u ocultar este nivel de riesgo",
    },
  };

  // Reverse map from canonical English hazard label (used in older
  // payloads or as a fallback when top_hazard_code is missing) to code.
  const HAZARD_LABEL_TO_CODE = {
    "Earthquake": "EQ", "Tsunami": "TS", "Cyclone": "CY",
    "River Flood": "FL", "Urban Flood": "UF", "Coastal Flood": "CF",
    "Landslide": "LS", "Extreme Heat": "EH",
  };

  // Mutable runtime state - currentLang is initialized at main(); cachedPayload
  // is the parsed payload, kept so we can re-render on language switch without
  // refetching.
  let currentLang = "en";
  let cachedPayload = null;

  const NAV_DEFS = [
    {slug:"summary",     key:"nav_summary"},
    {slug:"branches",    key:"nav_branches"},
    {slug:"regions",     key:"nav_regions"},
    {slug:"map",         key:"nav_map"},
    {slug:"trajectory",  key:"nav_trajectory"},
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
    // Preserve the active tab when re-rendering - buildNav re-creates the
    // nav and would otherwise reset to the first tab.
    const active = document.querySelector(".nav-item.active");
    const activeSlug = active ? active.dataset.tab : null;
    renderAll(cachedPayload);
    if (activeSlug) setActive(activeSlug);
  }

  // ── URL decode ──────────────────────────────────────────────────────
  async function getPayload() {
    const params = new URLSearchParams(window.location.search);
    // Strategy A: ?id=<gist_id> - fetch the JSON payload from a GitHub gist.
    const gistId = params.get("id");
    if (gistId) return await fetchGistPayload(gistId);
    // Strategy B: ?d=<base64url-gzip-json> - decode inline.
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
    // Public api.github.com endpoint - no auth needed once we have the ID.
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
    if (v == null || isNaN(v)) return "-";
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
  // Coverage color and banner - surface partial branch coverage prominently.
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
    banner.appendChild(el("span", {class:"coverage-banner-icon", "aria-hidden":"true"}, ""));
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
  // Settlement code (U/P/R) → localized label. Unknown codes show "-".
  function settlementLabel(code) {
    if (!code) return "-";
    return t("settlement_" + code) || "-";
  }
  function settlementClass(code) {
    return {U:"s-u", P:"s-p", R:"s-r"}[code] || "s-x";
  }
  // Score column header carries the explicit 0-max range, e.g. "Score (0-10)".
  function scoreColLabel(payload) {
    const max = (payload && payload.score_max) || 10;
    return t("table_col_score") + " (0-" + max + ")";
  }
  // Format a score with its scale suffix, e.g. "5.8 / 10".
  function scoreWithMax(score, payload) {
    const max = (payload && payload.score_max) || 10;
    if (score == null || isNaN(score)) return "-";
    return score + " / " + max;
  }

  // ── Tab navigation ──────────────────────────────────────────────────
  function setActive(slug) {
    document.querySelectorAll(".nav-item").forEach(n =>
      n.classList.toggle("active", n.dataset.tab === slug));
    document.querySelectorAll(".panel").forEach(p =>
      p.classList.toggle("active", p.id === "tab-" + slug));
    // The map can only size/init once its container is visible.
    if (slug === "map") {
      ensureMap();
      if (_map) setTimeout(() => _map.invalidateSize(), 0);
    }
  }

  function buildNav(payload) {
    const nav = document.getElementById("nav");
    nav.innerHTML = "";
    nav.appendChild(el("div", {class:"nav-section"}, t("sidebar_section")));
    const visible = NAV_DEFS.filter(d => {
      if (d.slug === "summary" || d.slug === "branches" || d.slug === "methodology") return true;
      if (d.slug === "regions") return !!(payload.regions && payload.regions.length);
      if (d.slug === "map") return (payload.branches || []).some(b => b.lat != null && b.lon != null);
      if (d.slug === "trajectory") return !!payload.trajectory;
      return false;
    });
    visible.forEach((d, i) => {
      const label = t(d.key);
      const a = el("a", {
        class: "nav-item" + (i === 0 ? " active" : ""),
        "data-tab": d.slug,
        title: label,   // tooltip — identifies the icon when the rail is collapsed
      });
      a.appendChild(el("span", {class:"nav-ico nav-ico-" + d.slug}));
      a.appendChild(el("span", {class:"nav-label"}, label));
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
      : (payload.kpi.top_hazard_label || "-");
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
    let topHazardDisplay = "-";
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
      {label: t("kpi_avg"),         value: scoreWithMax(payload.kpi.avg, payload), color: "var(--yellow)"},
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
    // Sort highest exposure first (highest bar at the top).
    const hazardsSorted = payload.hazards.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
    hazardsSorted.forEach(h => {
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
    sub.appendChild(document.createTextNode(
      `${b.city} · ${t("score_word")} ${scoreWithMax(b.score, cachedPayload)} · `));
    sub.appendChild(el("span", {class:"tp " + tierClass(b.tier)}, tierLabel(b.tier)));
    c.appendChild(sub);
    return c;
  }

  // Branch table - interactive: text-filter, region/tier/match dropdowns,
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
    settlement: "",
    sortKey: null,
    sortDir: 1,
  };
  // Sort weight for the settlement column - rural (higher risk) sorts highest.
  const SETTLEMENT_ORDER = {R:3, P:2, U:1};

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
      {label:t("table_col_branch"),     align:"left",   value:(b)=>(b.name||"").toLowerCase()},
      {label:t("table_col_city"),       align:"left",   value:(b)=>(b.city||"").toLowerCase()},
      {label:t("table_col_region"),     align:"left",   value:(b)=>(b.state||"").toLowerCase()},
      {label:t("table_col_settlement"), align:"center", value:(b)=>(SETTLEMENT_ORDER[b.settlement] || 0)},
      {label:t("table_col_match"),      align:"center", value:(b)=>matchBucket(b.match_type)},
      {label:scoreColLabel(payload),    align:"center", value:(b)=>(b.score==null ? -1 : Number(b.score))},
      {label:t("table_col_tier"),       align:"center", value:(b)=>(TIER_ORDER[b.tier] || 0)},
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

    // Settlement filter (rural / peri-urban / urban), ordered R → P → U.
    const settlements = Array.from(new Set(
      payload.branches.map(b => b.settlement).filter(Boolean)
    )).sort((a, b) => (SETTLEMENT_ORDER[b]||0) - (SETTLEMENT_ORDER[a]||0));
    const settlementOpts = settlements.map(code => ({value: code, display: settlementLabel(code)}));
    host.appendChild(makeSelect(t("filter_settlement"), settlementOpts, branchState.settlement,
      (v) => { branchState.settlement = v; applyFilters(); }));

    // Export the (full) branch + region tables to a real .xlsx workbook.
    host.appendChild(makeExcelButton(payload));

    const reset = el("button", {type:"button", class:"branch-filter-reset"},
                     t("filter_reset"));
    reset.addEventListener("click", () => {
      branchState.text = ""; branchState.region = "";
      branchState.tier = ""; branchState.match = ""; branchState.settlement = "";
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
    if (branchState.settlement)
      out = out.filter(b => (b.settlement||"") === branchState.settlement);

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
    const setlTd = el("td", {class:"ccenter"});
    setlTd.appendChild(el("span", {
      class:"pill " + settlementClass(b.settlement),
      title: settlementLabel(b.settlement),
    }, b.settlement || "-"));
    tr.appendChild(setlTd);
    const matchTd = el("td", {class:"ccenter"});
    matchTd.appendChild(el("span", {class:"pill " + matchClass(b.match_type)},
                              matchLabel(b.match_type)));
    tr.appendChild(matchTd);
    tr.appendChild(el("td", {class:"ccenter score"}, b.score == null ? "-" : String(b.score)));
    const tierTd = el("td", {class:"ccenter"});
    tierTd.appendChild(el("span", {class:"tp " + tierClass(b.tier)}, tierLabel(b.tier)));
    tr.appendChild(tierTd);
    (b.h || []).forEach(v => {
      tr.appendChild(el("td", {class:"h h" + v}, levelLabel(v)));
    });
    return tr;
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

  // ── Region score table ──────────────────────────────────────────────
  // Aggregated per-state rows from payload.regions (count / avg 0-10 / tier /
  // High-Medium-Low counts). Sortable like the branch table; exports to Excel.
  const REGION_TIER_ORDER = {High:3, Medium:2, Low:1, Unmatched:0};
  const regionState = {rows: [], colDefs: [], sortKey: null, sortDir: 1};

  function renderRegions(payload) {
    const tab = document.getElementById("tab-regions");
    tab.innerHTML = "";
    const regions = payload.regions || [];
    if (!regions.length) return;

    const head = el("div", {class:"section-head-row"});
    head.appendChild(el("div", {class:"card-title"}, t("regions_title")));
    head.appendChild(makeExcelButton(payload));
    tab.appendChild(head);
    tab.appendChild(el("div", {class:"card-sub mb12"}, t("regions_intro")));

    const colDefs = [
      {label:t("regions_col_region"), align:"left",   value:(r)=>(r.name||"").toLowerCase()},
      {label:t("regions_col_branches"),align:"center",value:(r)=>r.count||0},
      {label:scoreColLabel(payload), align:"center",  value:(r)=>(r.avg_score==null?-1:Number(r.avg_score))},
      {label:t("table_col_tier"),     align:"center", value:(r)=>(REGION_TIER_ORDER[r.tier]||0)},
      {label:t("tier_High"),          align:"center", value:(r)=>r.high||0},
      {label:t("tier_Medium"),        align:"center", value:(r)=>r.medium||0},
      {label:t("tier_Low"),           align:"center", value:(r)=>r.low||0},
    ];
    regionState.rows = regions.slice();
    regionState.colDefs = colDefs;

    const wrap = el("div", {class:"tbl-wrap"});
    const table = el("table");
    const thead = el("thead");
    const trh = el("tr", {id:"region-thead"});
    colDefs.forEach((col, i) => {
      const th = el("th", {
        class:(col.align==="center"?"ccenter ":"")+"sortable",
        "data-sort-key":String(i),
      });
      th.appendChild(document.createTextNode(col.label));
      th.appendChild(el("span", {class:"sort-ind region-sort-ind", "data-for":String(i)}, ""));
      th.addEventListener("click", () => {
        if (regionState.sortKey === i) regionState.sortDir *= -1;
        else { regionState.sortKey = i; regionState.sortDir = 1; }
        applyRegionSort();
      });
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);
    table.appendChild(el("tbody", {id:"region-tbody"}));
    wrap.appendChild(table);
    tab.appendChild(wrap);
    applyRegionSort();
  }

  function applyRegionSort() {
    const {rows, colDefs, sortKey, sortDir} = regionState;
    let out = rows;
    if (sortKey != null && colDefs[sortKey]) {
      const col = colDefs[sortKey];
      out = rows.slice().sort((a, b) => {
        const va = col.value(a), vb = col.value(b);
        if (va === vb) return 0;
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * sortDir;
        return (va < vb ? -1 : 1) * sortDir;
      });
    }
    document.querySelectorAll(".region-sort-ind").forEach(node => {
      const k = Number(node.getAttribute("data-for"));
      node.textContent = (sortKey === k) ? (sortDir > 0 ? " ▲" : " ▼") : "";
    });
    const tbody = document.getElementById("region-tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    out.forEach(r => {
      const tr = el("tr");
      tr.appendChild(el("td", {class:"bname"}, r.name));
      tr.appendChild(el("td", {class:"ccenter"}, String(r.count)));
      tr.appendChild(el("td", {class:"ccenter score"}, r.avg_score == null ? "-" : String(r.avg_score)));
      const tierTd = el("td", {class:"ccenter"});
      tierTd.appendChild(el("span", {class:"tp " + tierClass(r.tier)}, tierLabel(r.tier)));
      tr.appendChild(tierTd);
      tr.appendChild(el("td", {class:"ccenter"}, String(r.high)));
      tr.appendChild(el("td", {class:"ccenter"}, String(r.medium)));
      tr.appendChild(el("td", {class:"ccenter"}, String(r.low)));
      tbody.appendChild(tr);
    });
  }

  // ── Risk map ─────────────────────────────────────────────────────────
  // Interactive Leaflet map (pan/zoom, themed CARTO basemap) showing the
  // FSP's geocoded branches as circle markers coloured by tier and sized by
  // score, with a styled hover tooltip. Leaflet loads from a CDN (the one
  // external dependency, approved for the map). If it's unavailable we fall
  // back to a dependency-free SVG scatter so the tab is never empty.
  const MAP_TIER_COLOR = {
    High: "#d8607a", Medium: "#f1974c", Low: "#8bbc3a", Unmatched: "#a8a399",
  };
  let _map = null;          // Leaflet map instance
  let _mapTiles = null;     // current tile layer
  let _mapPayload = null;   // payload kept for lazy init
  let _mapReady = false;    // whether the canvas has been initialised
  let _mapLayers = {};      // per-tier Leaflet layer groups (for toggling)

  function cartoTileUrl() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    return light
      ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  }
  function addMapTiles() {
    if (!_map || !window.L) return;
    if (_mapTiles) { _map.removeLayer(_mapTiles); _mapTiles = null; }
    _mapTiles = window.L.tileLayer(cartoTileUrl(), {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    }).addTo(_map);
  }

  function renderMap(payload) {
    const tab = document.getElementById("tab-map");
    tab.innerHTML = "";
    // Tear down any previous instance (re-render happens on language switch).
    if (_map) { try { _map.remove(); } catch (_) {} }
    _map = null; _mapTiles = null; _mapReady = false; _mapPayload = null;

    const pts = (payload.branches || []).filter(b => b.lat != null && b.lon != null);
    if (!pts.length) return;
    _mapPayload = payload;

    const card = el("div", {class:"card"});
    card.appendChild(el("div", {class:"card-title"}, t("map_title")));
    card.appendChild(el("div", {class:"card-sub mb12"}, t("map_intro")));
    card.appendChild(el("div", {id:"risk-map-canvas"}));
    // Legend doubles as a per-tier toggle: click to show/hide that tier.
    const legend = el("div", {class:"map-legend"});
    [["High", t("tier_High")], ["Medium", t("tier_Medium")], ["Low", t("tier_Low")]]
      .forEach(([canon, label]) => {
        const item = el("button", {
          type:"button", class:"map-legend-item", "data-tier":canon,
          "aria-pressed":"true", title:t("map_toggle_hint"),
        });
        item.appendChild(el("span", {class:"map-legend-dot", style:`background:${MAP_TIER_COLOR[canon]}`}));
        item.appendChild(document.createTextNode(label));
        item.addEventListener("click", () => toggleMapTier(canon, item));
        legend.appendChild(item);
      });
    card.appendChild(legend);
    card.appendChild(el("div", {class:"card-sub", style:"margin-top:8px;"},
      t("map_note", pts.length, (payload.branches || []).length)));
    tab.appendChild(card);

    // Leaflet needs a visible, sized container, so defer init until the Map
    // tab is actually shown (see setActive). If it's already active, init now.
    const active = document.querySelector(".nav-item.active");
    if (active && active.dataset.tab === "map") ensureMap();
  }

  // Lazily initialise the map the first time its tab becomes visible.
  function ensureMap() {
    if (_mapReady || !_mapPayload) return;
    const canvas = document.getElementById("risk-map-canvas");
    if (!canvas) return;
    const pts = (_mapPayload.branches || []).filter(b => b.lat != null && b.lon != null);
    if (!pts.length) return;
    _mapReady = true;

    if (!window.L) { renderMapSvgFallback(canvas, pts); return; }
    const L = window.L;
    _map = L.map(canvas, {scrollWheelZoom: true});
    // Drop Leaflet's own prefix (the flag + "Leaflet" link). The OSM/CARTO
    // tile credit stays - it's required by the free tile usage terms.
    _map.attributionControl.setPrefix(false);
    addMapTiles();
    // One layer group per tier so the legend can toggle them on/off.
    _mapLayers = {
      High: L.layerGroup(), Medium: L.layerGroup(),
      Low: L.layerGroup(), Unmatched: L.layerGroup(),
    };
    const latlngs = [];
    // Draw worst last so High markers sit on top.
    pts.slice().sort((a, b) => (a.score || 0) - (b.score || 0)).forEach(p => {
      const sc = p.score == null ? 0 : p.score;
      const m = L.circleMarker([p.lat, p.lon], {
        radius: 5 + sc / 10 * 7,
        color: "#ffffff", weight: 1, opacity: 0.9,
        fillColor: MAP_TIER_COLOR[p.tier] || MAP_TIER_COLOR.Unmatched,
        fillOpacity: 0.85,
      });
      m.bindTooltip(mapTooltipHtml(p), {className: "portia-map-tip", sticky: true, direction: "top", opacity: 1});
      (_mapLayers[p.tier] || _mapLayers.Unmatched).addLayer(m);
      latlngs.push([p.lat, p.lon]);
    });
    Object.values(_mapLayers).forEach(g => g.addTo(_map));
    if (latlngs.length === 1) _map.setView(latlngs[0], 9);
    else _map.fitBounds(latlngs, {padding: [30, 30]});
  }

  // Toggle a tier's markers on/off from the legend.
  function toggleMapTier(tier, btn) {
    const group = _mapLayers[tier];
    if (!_map || !group) return;
    const on = _map.hasLayer(group);
    if (on) { _map.removeLayer(group); btn.classList.add("legend-off"); btn.setAttribute("aria-pressed", "false"); }
    else { group.addTo(_map); btn.classList.remove("legend-off"); btn.setAttribute("aria-pressed", "true"); }
  }

  function mapTooltipHtml(p) {
    const max = (_mapPayload && _mapPayload.score_max) || 10;
    const score = p.score == null ? "-" : p.score + " / " + max;
    const row = (label, value) =>
      `<div class="ptip-row"><span>${xmlEscape(label)}</span><b>${xmlEscape(value)}</b></div>`;
    return `<div class="ptip-title">${xmlEscape(p.name || "")}</div>` +
      row(t("table_col_city"), p.city || "-") +
      row(t("table_col_region"), p.state || "-") +
      row(t("table_col_settlement"), settlementLabel(p.settlement)) +
      row(t("table_col_score"), score) +
      row(t("table_col_tier"), tierLabel(p.tier));
  }

  // Fallback when Leaflet can't load: a simple SVG scatter (no basemap).
  function renderMapSvgFallback(canvas, pts) {
    const W = 760, H = 460, PAD = 28;
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    pts.forEach(p => {
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
    });
    let latSpan = maxLat - minLat || 1, lonSpan = maxLon - minLon || 1;
    minLat -= latSpan * 0.08; maxLat += latSpan * 0.08;
    minLon -= lonSpan * 0.08; maxLon += lonSpan * 0.08;
    latSpan = maxLat - minLat; lonSpan = maxLon - minLon;
    const cosLat = Math.cos((minLat + maxLat) / 2 * Math.PI / 180) || 1;
    const dataW = lonSpan * cosLat, dataH = latSpan;
    const scale = Math.min((W - 2 * PAD) / dataW, (H - 2 * PAD) / dataH);
    const offX = (W - dataW * scale) / 2, offY = (H - dataH * scale) / 2;
    const projX = (lon) => offX + (lon - minLon) * cosLat * scale;
    const projY = (lat) => offY + (maxLat - lat) * scale;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "risk-map");
    pts.slice().sort((a, b) => (a.score || 0) - (b.score || 0)).forEach(p => {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", projX(p.lon).toFixed(1));
      c.setAttribute("cy", projY(p.lat).toFixed(1));
      const sc = p.score == null ? 0 : p.score;
      c.setAttribute("r", (4 + sc / 10 * 6).toFixed(1));
      c.setAttribute("fill", MAP_TIER_COLOR[p.tier] || MAP_TIER_COLOR.Unmatched);
      c.setAttribute("class", "risk-map-pt");
      const title = document.createElementNS(ns, "title");
      title.textContent = `${p.name}${p.city ? " · " + p.city : ""} · ${t("score_word")} ${sc} · ${tierLabel(p.tier)}`;
      c.appendChild(title);
      svg.appendChild(c);
    });
    canvas.classList.add("risk-map-fallback");
    canvas.appendChild(svg);
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

  // ── Excel export (dependency-free .xlsx writer) ──────────────────────
  // Builds a minimal OOXML workbook (one sheet per table, inline strings) and
  // packs it into a ZIP with STORED (uncompressed) entries + CRC32. No
  // external library - this repo ships only plain files (see CLAUDE.md).
  const CRC_TABLE = (function () {
    const tbl = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      tbl[n] = c >>> 0;
    }
    return tbl;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function strBytes(s) { return new TextEncoder().encode(s); }
  function xmlEscape(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function u16(n) { return new Uint8Array([n & 255, (n >> 8) & 255]); }
  function u32(n) { return new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]); }
  function concatBytes(arr) {
    let len = 0; arr.forEach(a => len += a.length);
    const out = new Uint8Array(len);
    let o = 0;
    arr.forEach(a => { out.set(a, o); o += a.length; });
    return out;
  }
  function colLetter(n) {            // 0-based column index → A, B, … AA, …
    let s = ""; n++;
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  function sheetName(name) {          // Excel: ≤31 chars, none of []:*?/\
    return String(name).replace(/[\[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
  }
  function sheetXml(rows) {
    let body = "";
    rows.forEach((row, r) => {
      let cells = "";
      row.forEach((val, c) => {
        const ref = colLetter(c) + (r + 1);
        if (typeof val === "number" && isFinite(val)) {
          cells += `<c r="${ref}"><v>${val}</v></c>`;
        } else {
          cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(val == null ? "" : val)}</t></is></c>`;
        }
      });
      body += `<row r="${r + 1}">${cells}</row>`;
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }
  function buildXlsxBlob(sheets) {
    const n = sheets.length;
    let overrides = "";
    for (let i = 1; i <= n; i++) overrides += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    let sheetTags = "", wbRels = "";
    sheets.forEach((sh, i) => {
      sheetTags += `<sheet name="${xmlEscape(sheetName(sh.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
      wbRels += `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`;
    });
    const files = [
      {name: "[Content_Types].xml", data: strBytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        overrides + `</Types>`)},
      {name: "_rels/.rels", data: strBytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`)},
      {name: "xl/workbook.xml", data: strBytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>${sheetTags}</sheets></workbook>`)},
      {name: "xl/_rels/workbook.xml.rels", data: strBytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels}</Relationships>`)},
    ];
    sheets.forEach((s, i) => files.push({name: `xl/worksheets/sheet${i + 1}.xml`, data: strBytes(sheetXml(s.rows))}));

    // ZIP (stored, no compression).
    const chunks = [], central = [];
    let offset = 0;
    files.forEach(f => {
      const nameB = strBytes(f.name), data = f.data, crc = crc32(data), size = data.length;
      const lh = concatBytes([
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameB.length), u16(0), nameB,
      ]);
      chunks.push(lh, data);
      central.push(concatBytes([
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(size), u32(size), u16(nameB.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), nameB,
      ]));
      offset += lh.length + data.length;
    });
    const centralBytes = concatBytes(central);
    const eocd = concatBytes([
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBytes.length), u32(offset), u16(0),
    ]);
    chunks.push(centralBytes, eocd);
    return new Blob(chunks, {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }

  // Assemble the workbook rows from the payload (Branches + Regions sheets).
  function buildExportData(payload) {
    const max = (payload && payload.score_max) || 10;
    const scoreHdr = t("table_col_score") + " (0-" + max + ")";
    const haz = (payload.hazards || []).map(h => hazardName(h));
    const branchHeader = [
      t("table_col_branch"), t("table_col_city"), t("table_col_region"),
      t("table_col_settlement"), t("table_col_match"), scoreHdr, t("table_col_tier"),
    ].concat(haz);
    const branchRows = (payload.branches || []).map(b => {
      const row = [
        b.name || "", b.city || "", b.state || "",
        settlementLabel(b.settlement), matchLabel(b.match_type),
        (b.score == null ? "" : Number(b.score)), tierLabel(b.tier),
      ];
      (b.h || []).forEach(v => row.push(levelLabel(v)));
      return row;
    });
    const regionHeader = [
      t("regions_col_region"), t("regions_col_branches"), scoreHdr, t("table_col_tier"),
      t("tier_High"), t("tier_Medium"), t("tier_Low"),
    ];
    const regionRows = (payload.regions || []).map(r => [
      r.name, r.count, (r.avg_score == null ? "" : Number(r.avg_score)),
      tierLabel(r.tier), r.high, r.medium, r.low,
    ]);
    const sheets = [{name: t("nav_branches"), rows: [branchHeader].concat(branchRows)}];
    if (regionRows.length) sheets.push({name: t("nav_regions"), rows: [regionHeader].concat(regionRows)});
    return sheets;
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = el("a", {href: url, download: filename});
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.remove(); }, 1000);
  }
  function makeExcelButton(payload) {
    const btn = el("button", {type: "button", class: "export-btn"});
    btn.appendChild(el("span", {class: "export-btn-ico", "aria-hidden": "true"}, "⤓"));
    btn.appendChild(document.createTextNode(t("export_excel")));
    btn.addEventListener("click", () => {
      try {
        const blob = buildXlsxBlob(buildExportData(payload));
        const safe = (payload.fsp_name || "portia").replace(/[^\w\-]+/g, "_").slice(0, 40);
        downloadBlob(blob, `Portia_PCRA_${safe}.xlsx`);
      } catch (e) {
        console.error("Excel export failed", e);
        alert(t("export_failed"));
      }
    });
    return btn;
  }

  // Collapsible left sidebar. Persists in localStorage so the choice sticks
  // across dashboards. The toggle button lives in the topbar.
  const SIDEBAR_KEY = "portia.sidebar";
  function applySidebarState(collapsed) {
    const app = document.getElementById("app");
    if (app) app.classList.toggle("sidebar-collapsed", !!collapsed);
    const btn = document.getElementById("sidebar-toggle");
    if (btn) btn.setAttribute("aria-expanded", String(!collapsed));
  }
  function initSidebarToggle() {
    const btn = document.getElementById("sidebar-toggle");
    if (!btn) return;
    let collapsed = false;
    try { collapsed = localStorage.getItem(SIDEBAR_KEY) === "1"; } catch (_) {}
    applySidebarState(collapsed);
    btn.setAttribute("aria-label", t("sidebar_toggle"));
    btn.title = t("sidebar_toggle");
    btn.addEventListener("click", () => {
      const app = document.getElementById("app");
      const now = !(app && app.classList.contains("sidebar-collapsed"));
      applySidebarState(now);
      try { localStorage.setItem(SIDEBAR_KEY, now ? "1" : "0"); } catch (_) {}
      // The content area resized — let the map re-fit after the transition.
      if (_map) setTimeout(() => _map.invalidateSize(), 230);
    });
  }

  // Theme toggle - initial value is applied by an inline script in
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
      // Swap the basemap to match the new theme.
      if (_map) addMapTiles();
    });
  }

  // Language switcher - initial value matches the lang attribute the
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
  // by setLang() when the user switches language - every renderX function
  // clears its target container first so re-rendering is idempotent.
  function renderAll(payload) {
    buildNav(payload);
    renderTopbar(payload);
    renderSummary(payload);
    renderBranches(payload);
    renderRegions(payload);
    renderMap(payload);
    renderTrajectory(payload);
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
      initSidebarToggle();
      document.getElementById("app").hidden = false;
    } catch (e) {
      const err = document.getElementById("error");
      err.hidden = false;
      err.innerHTML = `
        <h2>${t("error_title")}</h2>
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
