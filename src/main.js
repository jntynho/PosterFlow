import "./style.css";
import {
  defaults,
  catalogs,
  languages,
  ratingSources,
  normalizeState,
  posterURL,
  manifestURL,
} from "./config.js";
let saved;
try {
  saved = JSON.parse(localStorage.getItem("posterflow-v1"));
} catch {}
let state = normalizeState(saved);
let step = 0,
  filter = "",
  result = "",
  busy = false,
  generation = 0,
  verification = "",
  verificationRequest;
let previewTimer,
  previewRequest = 0,
  previewURL = "",
  previewStatus = "idle";
const visibleSteps = () => (state.mode === "poster" ? [0, 2, 3] : [0, 1, 2, 3]);
const titles = [
  "Make it yours",
  "Curate your collection",
  "Find your signature style",
  "Your next watch starts here",
];
const descriptions = [
  "A little more detail. A much better-looking library.",
  "Bring the films and series you love into one beautiful library.",
  "Fine-tune the details. See your cover come to life.",
  "Everything is set. Bring your new look to Stremio.",
];
function icon(name) {
  const paths = {
    layers:
      '<rect x="4" y="3" width="12" height="15" rx="3"/><path d="M9 21h8a3 3 0 0 0 3-3V8"/>',
    image:
      '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 9M3 4v6h6"/>',
    shield:
      '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
    external:
      '<path d="M14 3h7v7M10 14 21 3M21 14v4a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h4"/>',
    sparkle:
      '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  };
  return `<svg class="${name === "external" ? "external-icon" : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sparkle}</svg>`;
}
const app = document.querySelector("#app");
function persist() {
  try {
    localStorage.setItem("posterflow-v1", JSON.stringify(state));
  } catch {
    notice(
      "Preferences could not be saved on this device. They will work for this session.",
    );
  }
  result = "";
  verification = "";
  busy = false;
  generation++;
  verificationRequest?.abort();
}
function notice(message) {
  const n = document.querySelector("#toast");
  n.textContent = message;
  n.hidden = false;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (n.hidden = true), 4500);
}
function toggle(key, title, desc) {
  return `<label class="setting"><span><strong>${title}</strong><small>${desc}</small></span><input type="checkbox" data-option="${key}" ${state[key] ? "checked" : ""}><span class="switch" aria-hidden="true"></span></label>`;
}
function options() {
  return `<div class="settings">${toggle("trendTags", "Trending labels", "Spot what everyone is watching.")}${toggle("qualityTags", "Quality badges", "4K, Dolby Vision and Atmos at a glance.")}${toggle("showGenre", "Genre labels", "A little context for your next pick.")}${toggle("showRating", "Ratings", "Know the score before you press play.")}${toggle("ageRating", "Age ratings", "Make more informed choices for every viewer.")}</div><div class="select-grid"><label>Rating source<select data-select="ratingSource">${ratingSources.map(([v, n]) => `<option value="${v}" ${state.ratingSource === v ? "selected" : ""}>${n}</option>`).join("")}</select></label><label>Poster language<select data-select="lang">${languages.map(([v, n]) => `<option value="${v}" ${state.lang === v ? "selected" : ""}>${n}</option>`).join("")}</select></label></div><p class="hint">Available badges vary by title. Watch progress requires account integration and is not available here yet.</p>`;
}
function content() {
  if (step === 0)
    return `<span class="eyebrow">YOUR LIBRARY, REIMAGINED</span><h2>Choose your setup</h2><p class="muted">A fresh look for your library, whichever way you watch.</p><div class="mode-grid">${[
      [
        "catalog",
        icon("layers"),
        "Catalogs + posters",
        "Discover curated movie and series lists, with beautiful, informative covers.",
        "The complete experience",
      ],
      [
        "poster",
        icon("image"),
        "Posters only",
        "Keep the catalogs you already love. Add custom covers with AIOMetadata.",
        "Works with AIOMetadata",
      ],
    ]
      .map(
        ([id, icon, title, desc, tag]) =>
          `<button class="mode ${state.mode === id ? "selected" : ""}" data-mode="${id}" aria-pressed="${state.mode === id}"><span class="mode-top"><span class="tile-icon">${icon}</span><span class="radio"></span></span><strong>${title}</strong><p>${desc}</p><span class="tag">${tag}</span></button>`,
      )
      .join(
        "",
      )}</div><div class="account-note"><span class="tile-icon">${icon("shield")}</span><div><strong>No account. No extra steps.</strong><p>Public catalogs are ready to go. Personal accounts and private lists are not supported in PosterFlow yet.</p><a href="https://btttr.cc/configure" target="_blank" rel="noopener noreferrer">Manage accounts on BetterPosters ${icon("external")}</a></div></div>`;
  if (step === 1)
    return `<div class="section-top"><div><span class="eyebrow">A WORLD WORTH EXPLORING</span><h2>Build your collection</h2></div><span class="count">${state.catalogs.length} selected</span></div><label class="search"><span>⌕</span><input id="search" type="search" placeholder="Find a catalog…" aria-label="Search catalogs"></label><div class="list-tools"><span>Public catalogs</span><button class="text-button" id="select-all">${state.catalogs.length === catalogs.length ? "Clear all" : "Select all"}</button></div><div class="catalog-grid" id="catalog-grid"></div><label class="sort-label">Catalog order<select data-select="sort">${[
      ["shuffle", "Shuffle · a fresh mix every hour"],
      ["original", "Original list order"],
      ["newest", "Newest releases first"],
      ["oldest", "Oldest releases first"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${state.sort === v ? "selected" : ""}>${n}</option>`,
      )
      .join("")}</select></label>`;
  if (step === 2)
    return `<span class="eyebrow">THE FINISHING TOUCHES</span><h2>Small details. Big difference.</h2><p class="muted">Choose what belongs on your covers. Leave the rest behind.</p>${options()}`;
  return `<div class="finish-icon">✓</div><span class="eyebrow">READY WHEN YOU ARE</span><h2>Meet your new library.</h2><p class="muted">${state.mode === "catalog" ? `${state.catalogs.length} catalogs, styled your way. Create your addon link to install in Stremio.` : "Create a poster URL and add it to your AIOMetadata settings."}</p><div class="summary"><span>Poster language <b>${languages.find((l) => l[0] === state.lang)?.[1]}</b></span><span>Rating source <b>${state.showRating ? ratingSources.find((r) => r[0] === state.ratingSource)?.[1] : "Hidden"}</b></span><span>Account <b>Not required</b></span></div><button class="primary wide" id="generate" ${busy ? "disabled" : ""}>${busy ? "Creating your link…" : state.mode === "catalog" ? "Create addon link →" : "Create poster URL →"}</button><div id="result" hidden><label for="output">Your link is ready</label><textarea id="output" readonly dir="ltr" rows="4"></textarea><div class="result-actions"><button class="secondary" id="copy">Copy link</button><a class="primary" id="install">Open Stremio ${icon("external")}</a></div><p id="instructions" class="hint"></p></div><p class="service-note">Posters and catalogs are served by BetterPosters. PosterFlow is an independent interface; generated links depend on that external service.</p>`;
}
function render() {
  const existingPreview = document.querySelector(".preview");
  app.innerHTML = `<div class="app-shell"><header class="topbar"><a class="brand" href="#" aria-label="PosterFlow home"><span class="brand-symbol" aria-hidden="true">${icon("layers")}</span>Poster<span>Flow</span></a><div class="header-meta"><span class="connection-dot"></span> MADE FOR STREMIO <span class="header-divider"></span><button class="text-button" id="reset">${icon("reset")} Reset</button></div></header><main><section class="intro"><span class="eyebrow"><span class="tiny-star">✦</span> A BETTER VIEW OF YOUR LIBRARY</span><h1>${titles[step]}<span class="title-dot">.</span></h1><p>${descriptions[step]}</p></section><nav class="stepper" aria-label="Setup steps">${["Your setup", "Your catalogs", "Poster style", "Install"].map((n, i) => `<button ${state.mode === "poster" && i === 1 ? "hidden" : ""} class="nav-step ${step === i ? "active" : ""} ${i < step ? "complete" : ""}" data-step="${i}" ${state.mode === "poster" && i === 1 ? "disabled" : ""} ${step === i ? 'aria-current="step"' : ""}><span class="step-number">${i < step ? "✓" : visibleSteps().indexOf(i) + 1}</span><span>${n}</span></button>`).join("")}</nav><div class="editor-layout"><aside class="preview" aria-label="Live poster preview"><div class="preview-heading"><div><span class="preview-overline">THE BIG PICTURE</span><h2>A preview of what’s next.</h2></div><span class="live-pill" id="preview-status" role="status"><i></i> Loading</span></div><div class="poster-stage"><div class="poster"><img width="400" height="600" decoding="async" id="poster-img" alt="Interstellar poster with your selected settings"><div class="image-fallback" hidden>${icon("image")}<strong>INTERSTELLAR</strong><small>The preview couldn’t load.<br>Check your connection and try again.</small><button id="retry" class="secondary">Try again</button></div></div><div class="stage-caption"><strong>Interstellar</strong><span>2014 <i>·</i> Christopher Nolan</span></div></div><div class="preview-bottom"><span>${icon("sparkle")} Your changes, in real time</span><button id="refresh" class="icon-button" aria-label="Refresh preview">${icon("reset")}</button></div><div class="preview-tip">A real cover, served by BetterPosters.<br>Some details depend on the available title data.</div></aside><section id="settings" class="panel" aria-label="Addon settings" tabindex="-1">${content()}<footer class="panel-footer"><button class="text-button" id="back" ${step === 0 ? "disabled" : ""}>${icon("back")} Back</button><span class="step-caption">STEP ${visibleSteps().indexOf(step) + 1} OF ${visibleSteps().length}</span>${step < 3 ? '<button class="primary" id="next">Continue ' + icon("arrow") + "</button>" : '<button class="text-button" id="edit">Edit poster style ' + icon("arrow") + "</button>"}</footer></section></div><footer class="site-footer"><span>Less clutter. More cinema.</span><span>Independent interface for <a href="https://btttr.cc" target="_blank" rel="noopener noreferrer">BetterPosters ${icon("external")}</a></span></footer></main></div><div id="toast" role="status" hidden></div>`;
  if (existingPreview)
    document.querySelector(".preview").replaceWith(existingPreview);
  document.querySelector(".brand").onclick = (e) => {
    e.preventDefault();
    step = 0;
    render();
  };
  document
    .querySelectorAll("[data-step]")
    .forEach((el) => (el.onclick = () => go(Number(el.dataset.step))));
  document.querySelectorAll("[data-mode]").forEach(
    (el) =>
      (el.onclick = () => {
        state.mode = el.dataset.mode;
        persist();
        render();
        document.querySelector(`[data-mode="${state.mode}"]`).focus();
      }),
  );
  document
    .querySelector("#next")
    ?.addEventListener("click", () =>
      go(step === 0 && state.mode === "poster" ? 2 : step + 1),
    );
  document.querySelector("#back").onclick = () =>
    go(step === 2 && state.mode === "poster" ? 0 : Math.max(0, step - 1));
  document.querySelector("#edit")?.addEventListener("click", () => go(2));
  document.querySelectorAll("[data-option]").forEach(
    (el) =>
      (el.onchange = () => {
        state[el.dataset.option] = el.checked;
        persist();
        syncRating();
        schedulePreview();
      }),
  );
  document.querySelectorAll("[data-select]").forEach(
    (el) =>
      (el.onchange = () => {
        state[el.dataset.select] = el.value;
        persist();
        syncRating();
        schedulePreview();
      }),
  );
  document.querySelector("#search")?.addEventListener("input", (e) => {
    filter = e.target.value;
    renderCatalogs();
  });
  document.querySelector("#select-all")?.addEventListener("click", () => {
    state.catalogs =
      state.catalogs.length === catalogs.length
        ? []
        : catalogs.map((c) => c[0]);
    persist();
    renderCatalogs();
  });
  document.querySelector("#reset").onclick = () => {
    if (confirm("Reset all preferences to their defaults?")) {
      state = { ...defaults, catalogs: [...defaults.catalogs] };
      step = 0;
      persist();
      render();
    }
  };
  document.querySelector("#refresh").onclick = () => updatePreview(true);
  document.querySelector("#retry").onclick = () => updatePreview(true);
  document.querySelector("#generate")?.addEventListener("click", generate);
  document.querySelector("#copy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(result);
      notice("Link copied to clipboard.");
    } catch {
      document.querySelector("#output").select();
      notice("Select the link and copy it manually.");
    }
  });
  renderCatalogs();
  syncRating();
  renderResult();
  updatePreview();
}
function renderCatalogs() {
  const grid = document.querySelector("#catalog-grid");
  if (!grid) return;
  const focused = document.activeElement?.closest(".catalog")?.dataset.id;
  grid.innerHTML = "";
  for (const [id, title, sub, icon] of catalogs.filter((c) =>
    c.join(" ").toLowerCase().includes(filter.trim().toLowerCase()),
  )) {
    const label = document.createElement("label");
    label.dataset.id = id;
    label.className =
      "catalog " + (state.catalogs.includes(id) ? "chosen" : "");
    label.innerHTML = `<span class="catalog-icon">${icon}</span><span><strong>${title}</strong><small>${sub}</small></span><input type="checkbox" aria-label="${title}" ${state.catalogs.includes(id) ? "checked" : ""}>`;
    label.querySelector("input").onchange = (e) => {
      state.catalogs = e.target.checked
        ? [...state.catalogs, id]
        : state.catalogs.filter((x) => x !== id);
      persist();
      renderCatalogs();
    };
    grid.append(label);
  }
  if (!grid.children.length)
    grid.textContent = "No catalogs found. Try another search.";
  document.querySelector(".count").textContent =
    `${state.catalogs.length} selected`;
  document.querySelector("#select-all").textContent =
    state.catalogs.length === catalogs.length ? "Clear all" : "Select all";
  if (focused)
    grid
      .querySelector(`[data-id="${focused}"] input`)
      ?.focus({ preventScroll: true });
}
function go(n) {
  if (!visibleSteps().includes(n)) return;
  if (n === 3 && state.mode === "catalog" && !state.catalogs.length) {
    notice("Choose at least one catalog to continue.");
    return;
  }
  step = n;
  filter = "";
  render();
  document.querySelector(".panel").focus({ preventScroll: true });
}
function syncRating() {
  const rating = document.querySelector('[data-select="ratingSource"]');
  if (rating) rating.disabled = !state.showRating;
}
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => updatePreview(), 200);
}
function setPreviewStatus(status) {
  previewStatus = status;
  const badge = document.querySelector("#preview-status");
  if (badge) {
    badge.textContent = {
      loading: "Loading…",
      ready: "Live preview",
      error: "Unavailable",
    }[status];
    badge.dataset.status = status;
  }
  document
    .querySelector(".poster")
    ?.setAttribute("aria-busy", String(status === "loading"));
}
function updatePreview(force = false) {
  clearTimeout(previewTimer);
  const url = posterURL(state, "tt0816692");
  if (!force && url === previewURL && previewStatus !== "idle") return;
  previewURL = url;
  const request = ++previewRequest;
  setPreviewStatus("loading");
  const img = document.querySelector("#poster-img"),
    fallback = document.querySelector(".image-fallback");
  const candidate = new Image();
  let timer,
    settled = false;
  const fail = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (request !== previewRequest) return;
    setPreviewStatus("error");
    img.hidden = true;
    fallback.hidden = false;
  };
  candidate.onload = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    if (request !== previewRequest) return;
    candidate.id = "poster-img";
    candidate.alt = img.alt;
    candidate.width = 400;
    candidate.height = 600;
    candidate.decoding = "async";
    img.replaceWith(candidate);
    fallback.hidden = true;
    setPreviewStatus("ready");
  };
  candidate.onerror = fail;
  timer = setTimeout(fail, 15000);
  candidate.src =
    url +
    (force ? (url.includes("?") ? "&" : "?") + "refresh=" + Date.now() : "");
}
function renderResult() {
  const container = document.querySelector("#result");
  if (!container) return;
  container.hidden = !result;
  const button = document.querySelector("#generate");
  button.disabled = busy;
  button.textContent = busy
    ? "Creating your link…"
    : result
      ? "Create link again →"
      : state.mode === "catalog"
        ? "Create addon link →"
        : "Create poster URL →";
  if (!result) return;
  document.querySelector("#output").value = result;
  const install = document.querySelector("#install");
  install.hidden = state.mode !== "catalog";
  if (state.mode === "catalog")
    install.href = result.replace("https://", "stremio://");
  document.querySelector("#instructions").textContent =
    state.mode === "catalog"
      ? verification
      : "In AIOMetadata, open Art Providers → URL Patterns → Poster URL Pattern. Paste this URL and keep {imdb_id} unchanged.";
}
async function generate() {
  if (busy) return;
  busy = true;
  const revision = generation;
  renderResult();
  try {
    const snapshot = normalizeState(state);
    const url =
      snapshot.mode === "catalog"
        ? await manifestURL(snapshot)
        : posterURL(snapshot);
    if (revision !== generation) return;
    result = url;
    verification = "Link created. Checking the BetterPosters addon…";
    renderResult();
    if (snapshot.mode === "catalog") {
      verificationRequest?.abort();
      const controller = new AbortController();
      verificationRequest = controller;
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Service request failed");
        const manifest = await response.json();
        if (
          manifest.id !== "community.betterposters" ||
          !Array.isArray(manifest.catalogs) ||
          !manifest.catalogs.length
        )
          throw new Error("Unexpected addon response");
        if (revision === generation) {
          verification =
            "Verified with BetterPosters. Open Stremio, review the addon, then confirm installation.";
          notice("Addon link verified.");
        }
      } catch {
        if (revision === generation) {
          verification =
            "Link created, but the external service could not be verified. Check your connection or try again before installing.";
          notice(
            "Could not verify BetterPosters. Your link is still available.",
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    } else
      notice("Poster URL created. Check the live preview before using it.");
  } catch (e) {
    if (revision === generation)
      notice(e.message || "Could not create your link. Please try again.");
  } finally {
    if (revision === generation) {
      busy = false;
      renderResult();
    }
  }
}
render();
