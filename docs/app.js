"use strict";

const REPO_ZIP = "https://github.com/electronreaper/visio-stencils/archive/refs/heads/main.zip";

const state = {
  data: null,
  query: "",
  vendor: "",
  format: "all",
  sort: "vendor",
};

const els = {
  q: document.getElementById("q"),
  format: document.getElementById("format"),
  vendors: document.getElementById("vendors"),
  banner: document.getElementById("banner"),
  count: document.getElementById("count"),
  results: document.getElementById("results"),
  sort: document.getElementById("sort"),
  clear: document.getElementById("clear"),
  specimen: document.getElementById("specimen"),
  theme: document.getElementById("theme-toggle"),
  themeColor: document.getElementById("theme-color"),
};

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
  }
  for (const child of children || []) {
    if (child == null) continue;
    node.append(child);
  }
  return node;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) {
    const text = kb >= 10 ? String(Math.round(kb)) : kb.toFixed(1).replace(/\.0$/, "");
    return `${text} KB`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
}

function tokensFrom(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function haystack(stencil) {
  return [
    stencil.vendor,
    stencil.name,
    stencil.file,
    stencil.format,
    ...(stencil.masters || []),
    ...(stencil.aliases || []),
  ].join("\n").toLowerCase();
}

function matchesQuery(stencil, tokens) {
  if (!tokens.length) return true;
  const text = stencil._h;
  return tokens.every((token) => text.includes(token));
}

function highlight(text, tokens) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  if (!tokens.length) {
    frag.append(document.createTextNode(text));
    return frag;
  }
  const lower = text.toLowerCase();
  let index = 0;
  while (index < text.length) {
    let next = -1;
    let token = "";
    for (const candidate of tokens) {
      const at = lower.indexOf(candidate, index);
      if (at !== -1 && (next === -1 || at < next)) {
        next = at;
        token = candidate;
      }
    }
    if (next === -1) {
      frag.append(document.createTextNode(text.slice(index)));
      break;
    }
    if (next > index) frag.append(document.createTextNode(text.slice(index, next)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(next, next + token.length);
    frag.append(mark);
    index = next + token.length;
  }
  return frag;
}

function masterHit(stencil, tokens) {
  if (!tokens.length || tokens.some((token) => token.length < 2)) return null;
  const names = [...(stencil.masters || []), ...(stencil.aliases || [])];
  return names.find((name) => {
    const lower = name.toLowerCase();
    return tokens.every((token) => lower.includes(token));
  }) || null;
}

function compare(sort) {
  const text = (value) => (value || "").toLocaleLowerCase();
  if (sort === "name") {
    return (a, b) => text(a.name).localeCompare(text(b.name)) || text(a.vendor).localeCompare(text(b.vendor));
  }
  if (sort === "size") return (a, b) => b.bytes - a.bytes || text(a.name).localeCompare(text(b.name));
  if (sort === "shapes") {
    return (a, b) => (b.shapes == null ? -1 : b.shapes) - (a.shapes == null ? -1 : a.shapes)
      || text(a.vendor).localeCompare(text(b.vendor));
  }
  return (a, b) => text(a.vendor).localeCompare(text(b.vendor)) || text(a.name).localeCompare(text(b.name));
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.query = params.get("q") || "";
  state.vendor = params.get("vendor") || "";
  const format = params.get("format");
  state.format = format === "vss" || format === "vssx" ? format : "all";
  const sort = params.get("sort");
  state.sort = ["name", "size", "shapes", "vendor"].includes(sort) ? sort : "vendor";
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  if (state.vendor) params.set("vendor", state.vendor);
  if (state.format !== "all") params.set("format", state.format);
  if (state.sort !== "vendor") params.set("sort", state.sort);
  const query = params.toString();
  const next = query ? `${location.pathname}?${query}` : location.pathname;
  if (next !== `${location.pathname}${location.search}`) {
    history.replaceState(null, "", next);
  }
}

function syncControls() {
  els.q.value = state.query;
  els.sort.value = state.sort;
  for (const button of els.format.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.format === state.format));
  }
}

function pool(ignoreFormat) {
  const tokens = tokensFrom(state.query);
  return state.data.stencils.filter((stencil) => {
    if (state.vendor && stencil.vendor !== state.vendor) return false;
    if (!ignoreFormat && state.format !== "all" && stencil.format !== state.format) return false;
    return matchesQuery(stencil, tokens);
  });
}

function renderStats() {
  const totals = state.data.totals;
  const pairs = [
    ["stat-stencils", totals.stencils.toLocaleString()],
    ["stat-vendors", totals.vendors.toLocaleString()],
    ["stat-vssx", totals.vssx.toLocaleString()],
    ["stat-vss", totals.vss.toLocaleString()],
    ["stat-shapes", totals.shapes.toLocaleString()],
  ];
  for (const [id, value] of pairs) {
    document.getElementById(id).textContent = value;
  }
}

function renderSpecimen() {
  const wanted = [
    ["Dell", /PowerEdge Blade/i],
    ["NetApp", /^NetApp AFF Series$/],
    ["HPE", /ProLiant DL/],
    ["APC", /Racks and Accessories/],
  ];
  const picks = wanted.map(([vendor, pattern]) => {
    const rows = state.data.stencils.filter((item) => item.vendor === vendor);
    return rows.find((item) => pattern.test(item.name))
      || rows.find((item) => item.shapes)
      || rows[0];
  }).filter(Boolean);
  els.specimen.replaceChildren();
  if (!picks.length) {
    els.specimen.hidden = true;
    return;
  }
  els.specimen.hidden = false;
  for (const stencil of picks) {
    const meta = stencil.shapes
      ? `${stencil.shapes.toLocaleString()} shapes · .${stencil.format}`
      : `.${stencil.format}`;
    els.specimen.append(el("div", { class: "specimen-card" }, [
      el("span", { class: "specimen-vendor", text: stencil.vendor }),
      el("strong", { text: stencil.name }),
      el("span", { class: "specimen-meta", text: meta }),
    ]));
  }
}

function renderVendors() {
  const tokens = tokensFrom(state.query);
  const counts = new Map();
  for (const stencil of state.data.stencils) {
    if (state.format !== "all" && stencil.format !== state.format) continue;
    if (!matchesQuery(stencil, tokens)) continue;
    counts.set(stencil.vendor, (counts.get(stencil.vendor) || 0) + 1);
  }
  const allCount = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const entries = [{ name: "", label: "All vendors", count: allCount }].concat(
    state.data.vendors.map((vendor) => ({
      name: vendor.name,
      label: vendor.name,
      count: counts.get(vendor.name) || 0,
    }))
  );
  els.vendors.replaceChildren();
  for (const entry of entries) {
    const pressed = state.vendor === entry.name;
    const button = el("button", {
      type: "button",
      class: "vendor-btn",
      "aria-pressed": String(pressed),
    });
    if (!pressed && entry.count === 0) button.disabled = true;
    button.append(
      el("span", { text: entry.label }),
      el("span", { class: "count", text: String(entry.count) })
    );
    button.addEventListener("click", () => {
      state.vendor = entry.name;
      render();
    });
    els.vendors.append(button);
  }
}

function renderFormats() {
  const base = state.data.stencils.filter((stencil) => {
    if (state.vendor && stencil.vendor !== state.vendor) return false;
    return matchesQuery(stencil, tokensFrom(state.query));
  });
  const counts = {
    all: base.length,
    vssx: base.filter((stencil) => stencil.format === "vssx").length,
    vss: base.filter((stencil) => stencil.format === "vss").length,
  };
  const labels = { all: "All", vssx: ".vssx", vss: ".vss" };
  for (const button of els.format.querySelectorAll("button")) {
    const key = button.dataset.format;
    const pressed = state.format === key;
    button.textContent = `${labels[key]} ${counts[key]}`;
    button.setAttribute("aria-pressed", String(pressed));
    button.disabled = !pressed && counts[key] === 0;
  }
}

function renderBanner() {
  els.banner.replaceChildren();
  if (!state.vendor) {
    els.banner.hidden = true;
    return;
  }
  const vendor = state.data.vendors.find((item) => item.name === state.vendor);
  if (!vendor) {
    els.banner.hidden = true;
    return;
  }
  els.banner.hidden = false;
  const shapes = vendor.shapes
    ? `${vendor.shapes.toLocaleString()} shapes`
    : "no indexed shapes";
  const copy = el("div", {}, [
    el("h3", { text: vendor.name }),
    el("p", {
      text: `${vendor.count} stencil${vendor.count === 1 ? "" : "s"} · ${formatBytes(vendor.bytes)} · ${shapes}`,
    }),
  ]);
  const zip = el("a", {
    class: "btn primary",
    href: vendor.zip,
    download: `${vendor.name}.zip`,
    text: "Download .zip",
  });
  const folder = el("a", {
    class: "btn",
    href: vendor.treeUrl,
    target: "_blank",
    rel: "noopener noreferrer",
    text: "View folder",
  });
  const note = el("p", {
    class: "note",
    text: "The zip is published with this site. The folder link opens the same files on GitHub.",
  });
  els.banner.append(copy, el("div", { class: "banner-actions" }, [zip, folder]), note);
}

function renderCard(stencil, tokens, autoOpen) {
  const meta = [formatBytes(stencil.bytes)];
  if (stencil.shapes == null) meta.push("Legacy stencil");
  else meta.push(`${stencil.shapes.toLocaleString()} shape${stencil.shapes === 1 ? "" : "s"}`);

  const main = el("div", { class: "card-main" }, [
    el("p", { class: "card-vendor", text: stencil.vendor }),
    el("h3", { class: "card-title" }, [highlight(stencil.name, tokens)]),
    el("p", { class: "card-file" }, [highlight(stencil.file, tokens)]),
    el("p", { class: "card-meta", text: meta.join(" · ") }),
  ]);
  const hit = masterHit(stencil, tokens);
  if (hit) {
    const line = el("p", { class: "card-hit" });
    line.append("Matches shape: ");
    line.append(highlight(hit, tokens));
    main.append(line);
  }

  const badges = el("div", { class: "badges" }, [
    el("span", { class: `badge ${stencil.format}`, text: `.${stencil.format}` }),
  ]);
  if (stencil.usUnits) badges.append(el("span", { class: "badge units", text: "US units" }));
  const download = el("a", {
    class: "btn primary",
    href: stencil.downloadUrl,
    download: stencil.file,
    text: "Download",
  });
  download.setAttribute("aria-label", `Download ${stencil.file}`);
  const view = el("a", {
    class: "btn",
    href: stencil.githubUrl,
    target: "_blank",
    rel: "noopener noreferrer",
    text: "View",
  });
  const side = el("div", { class: "card-side" }, [
    badges,
    el("div", { class: "card-actions" }, [download, view]),
  ]);

  const card = el("article", { class: "card" }, [main, side]);
  if (stencil.masters && stencil.masters.length) {
    const details = el("details", { class: "shapes" });
    const summary = el("summary", {
      text: `Shape names (${stencil.masters.length.toLocaleString()})`,
    });
    const list = el("ul", { class: "masters" });
    const fill = () => {
      if (list.childElementCount) return;
      for (const name of stencil.masters) {
        list.append(el("li", {}, [highlight(name, tokens)]));
      }
    };
    if (hit && autoOpen) {
      details.open = true;
      fill();
    }
    details.addEventListener("toggle", () => {
      if (details.open) fill();
    });
    details.append(summary, list);
    card.append(details);
  }
  return card;
}

function renderResults() {
  const tokens = tokensFrom(state.query);
  const rows = pool(false).slice().sort(compare(state.sort));
  const total = state.data.totals.stencils;
  els.count.textContent = rows.length === total
    ? `${total.toLocaleString()} stencils`
    : `Showing ${rows.length.toLocaleString()} of ${total.toLocaleString()}`;
  document.title = state.vendor ? `${state.vendor} · Visio Stencils` : "Visio Stencils";
  const filtered = Boolean(state.query || state.vendor || state.format !== "all");
  els.clear.hidden = !filtered;
  els.results.replaceChildren();
  if (!rows.length) {
    const empty = el("div", { class: "empty" });
    const p = el("p", { text: "No stencils match." });
    empty.append(p);
    if (filtered) {
      const button = el("button", { type: "button", class: "btn", text: "Clear filters" });
      button.addEventListener("click", clearFilters);
      empty.append(button);
    }
    els.results.append(empty);
    return;
  }
  const list = el("div", { class: "results" });
  const autoOpen = rows.length <= 8;
  for (const stencil of rows) list.append(renderCard(stencil, tokens, autoOpen));
  els.results.append(list);
}

function render() {
  if (state.vendor && !state.data.vendors.some((vendor) => vendor.name === state.vendor)) {
    state.vendor = "";
  }
  writeUrl();
  syncControls();
  renderVendors();
  renderFormats();
  renderBanner();
  renderResults();
}

function clearFilters() {
  state.query = "";
  state.vendor = "";
  state.format = "all";
  state.sort = "vendor";
  render();
  els.q.focus();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  els.theme.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
  if (els.themeColor) els.themeColor.setAttribute("content", theme === "dark" ? "#121411" : "#f3f0e8");
}

function initTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current);
  els.theme.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
  });
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", (event) => {
    if (localStorage.getItem("theme")) return;
    applyTheme(event.matches ? "dark" : "light");
  });
}

function showError(message) {
  els.count.textContent = "Catalog unavailable";
  els.results.replaceChildren(el("div", { class: "notice" }, [
    el("p", { text: message }),
    el("p", {}, [
      document.createTextNode("You can still "),
      el("a", { href: REPO_ZIP, text: "download the repository" }),
      document.createTextNode(" or browse the "),
      el("a", {
        href: "https://github.com/electronreaper/visio-stencils/tree/main/stencils",
        text: "stencils folder",
      }),
      document.createTextNode("."),
    ]),
  ]));
}

async function init() {
  initTheme();
  readUrl();
  syncControls();
  els.q.addEventListener("input", () => {
    state.query = els.q.value;
    render();
  });
  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    render();
  });
  els.format.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    state.format = button.dataset.format;
    render();
  });
  els.clear.addEventListener("click", clearFilters);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const typing = target && (target.closest("input, textarea, select") || target.isContentEditable);
    if (typing) return;
    event.preventDefault();
    els.q.focus();
  });
  window.addEventListener("popstate", () => {
    readUrl();
    if (state.data) render();
  });

  try {
    const response = await fetch("stencils.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    for (const stencil of state.data.stencils) stencil._h = haystack(stencil);
    renderStats();
    renderSpecimen();
    render();
  } catch (error) {
    showError("The stencil list could not be loaded. Serve this folder over HTTP so stencils.json can be fetched.");
    console.error(error);
  }
}

init();
