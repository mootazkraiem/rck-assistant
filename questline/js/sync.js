/* Storage backends and boot. Picks one mode, then starts the UI (app.js) with a store:
     desktop  pywebview app (index.html?desktop=1): progress in the shared sync folder via Python
     viewer   dashboard opened from <sync folder>/app/ with no app: read-only merge of everyone's files
     local    plain browser: localStorage (the original single-user mode)
   Every store exposes the same async interface; app.js never knows which one it has. */
(function () {
  "use strict";
  window.QUESTLINE_SYNC = { items: [], push(x) { this.items.push(x); } }; // filled by questline-team.js / progress/*.js
  const L = window.QuestlineLogic;
  const app = document.getElementById("app");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = src; s.onload = () => resolve(true); s.onerror = () => { s.remove(); resolve(false); };
      document.head.appendChild(s);
    });
  }
  function browserDownload(filename, text, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    return Promise.resolve(true);
  }
  function browserOpenUri(uri) {
    const a = document.createElement("a"); a.href = uri; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    return Promise.resolve(true);
  }

  /* ───────── local (browser localStorage) ───────── */
  function localStore() {
    const STORE_KEY = "questline-state-v1", SNAP_KEY = "questline-snapshots-v1", MAX = 15;
    const store = { kind: "local", storageOk: true, session: { mode: "local" } };
    const read = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (e) { store.storageOk = false; return fb; } };
    const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { store.storageOk = false; return false; } };
    const snaps = () => { const s = read(SNAP_KEY, []); return Array.isArray(s) ? s : []; };
    // One-time carry-over from the tool's earlier name (keys rck-cc-*).
    try {
      for (const k of ["state", "snapshots", "ui"]) {
        const oldKey = `rck-cc-${k}-v1`, newKey = `questline-${k}-v1`;
        if (localStorage.getItem(oldKey) !== null && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, localStorage.getItem(oldKey));
      }
    } catch (e) { /* storage unavailable: nothing to migrate */ }
    store.load = async () => { const raw = read(STORE_KEY, null); return (raw && L.validateState(raw).state) || L.emptyState(); };
    store.addSnapshot = async (reason, state) => {
      const list = snaps(); list.unshift({ at: new Date().toISOString(), reason, state: clone(state) });
      write(SNAP_KEY, list.slice(0, MAX));
    };
    store.save = async (state) => {
      const ok = write(STORE_KEY, state);
      const last = snaps()[0];
      if (ok && (!last || last.at.slice(0, 10) !== state.updatedAt.slice(0, 10))) await store.addSnapshot("Automatic daily snapshot", state);
      return ok ? { ok: true } : { ok: false, error: "Browser storage unavailable. Export a backup!" };
    };
    store.snapshots = async () => snaps().map((s, i) => ({ id: String(i), at: s.at, reason: s.reason }));
    store.readSnapshot = async (id) => snaps()[+id].state;
    store.refresh = async () => null;
    store.download = browserDownload;
    store.openUri = browserOpenUri;
    return store;
  }

  /* ───────── viewer (read-only, files from the sync folder) ───────── */
  async function tryViewer() {
    // Only the published copy lives in <sync folder>/app/; elsewhere, don't probe.
    if (!/\/app\/(index\.html)?$/i.test(location.pathname)) return null;
    if (!(await loadScript("../questline-team.js"))) return null;
    const team = window.QUESTLINE_SYNC.items.find((x) => x && x.kind === "team");
    if (!team) return null;
    await Promise.all(team.members.map((m) => loadScript(`../progress/${encodeURIComponent(m.id)}.js`)));
    const entries = window.QUESTLINE_SYNC.items.filter((x) => x && x.kind === "progress").map((x) => ({ user: x.user, state: L.validateState(x.state).state || L.emptyState() }));
    const merged = L.mergeStates(entries, team);
    return {
      kind: "viewer", storageOk: true,
      session: { mode: "viewer", team, savedAt: entries.map((e) => e.state.updatedAt).filter(Boolean).sort().pop() || null },
      load: async () => merged,
      save: async () => ({ ok: false, error: "Read-only view" }),
      refresh: async () => null,
      snapshots: async () => [], readSnapshot: async () => null, addSnapshot: async () => {},
      download: browserDownload, openUri: browserOpenUri
    };
  }

  /* ───────── desktop (pywebview → Python → sync folder) ───────── */
  function waitForPywebview() {
    return new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve(window.pywebview.api);
      window.addEventListener("pywebviewready", () => resolve(window.pywebview.api), { once: true });
    });
  }
  async function call(api, name, ...args) {
    const r = await api[name](...args);
    if (!r || !r.ok) throw new Error((r && r.error) || `${name} failed`);
    return r.result;
  }
  function desktopStore(api, loaded) {
    let team = loaded.team;
    const me = loaded.session.user;
    const entriesFrom = (res) => res.entries.map((e) => ({ user: e.user, state: L.validateState(e.state).state || L.emptyState() }));
    // Fingerprint of everyone else's files: refresh() only merges when a colleague saved something.
    const fingerprint = (res) => JSON.stringify([res.team.updatedAt, res.entries.filter((e) => e.user !== me).map((e) => [e.user, e.savedAt])]);
    let lastPrint = fingerprint(loaded);
    const store = {
      kind: "desktop", storageOk: true, api,
      session: { mode: "desktop", user: me, name: loaded.session.name, role: loaded.session.role, team, syncFolder: loaded.session.sync_folder, ignored: loaded.ignored, errors: loaded.errors },
      load: async () => L.mergeStates(entriesFrom(loaded), team),
      save: async (state) => {
        try { const r = await call(api, "save", state); store.storageOk = true; return { ok: true, savedAt: r.savedAt }; }
        catch (e) { store.storageOk = false; return { ok: false, error: "Not saved to the sync folder: " + e.message }; }
      },
      /* Re-read everyone's files and merge with my in-memory state (my unsaved edits keep their newer stamps). */
      refresh: async (mine) => {
        const res = await call(api, "load");
        const print = fingerprint(res);
        if (print === lastPrint) return null;
        lastPrint = print;
        team = res.team;
        Object.assign(store.session, { team, role: res.session.role, ignored: res.ignored, errors: res.errors });
        const others = entriesFrom(res).filter((e) => e.user !== me);
        return L.mergeStates([{ user: me, state: mine }, ...others], team);
      },
      snapshots: async () => (await call(api, "list_backups")).map((b) => ({ id: b.name, at: b.at, reason: b.reason })),
      addSnapshot: async (reason, state) => { await call(api, "add_backup", reason, state); },
      readSnapshot: async (id) => (await call(api, "read_backup", id)).state,
      download: async (filename, text) => { const p = await call(api, "save_text", filename, text); return !!p; },
      openUri: async (uri) => { await call(api, "open_uri", uri); return true; },
      team: {
        add: async (name, role) => { team = await call(api, "team_add", name, role); store.session.team = team; },
        setRole: async (uid, role) => { team = await call(api, "team_set_role", uid, role); store.session.team = team; },
        remove: async (uid) => { team = await call(api, "team_remove", uid); store.session.team = team; },
        publish: async () => call(api, "publish"),
        openFolder: async () => call(api, "open_folder"),
        disconnect: async () => call(api, "disconnect")
      }
    };
    return store;
  }

  /* First run: the header's search bar becomes "paste your shared folder path". Asked once per PC;
     the answer is stored in %APPDATA%\Questline\config.json. */
  async function setupScreen(api, err) {
    const wrap = document.querySelector(".search-wrap");
    const search = document.getElementById("globalSearch");
    search.hidden = true;
    const bar = document.createElement("form");
    bar.className = "setup-bar"; bar.autocomplete = "off";
    bar.innerHTML = `
      <input type="text" id="setupFolder" value="${esc((err && err.sync_folder) || "")}" placeholder="Paste your shared folder path, then press Enter" aria-label="Shared folder path" required>
      <button class="icon-btn" id="setupBrowse" type="button" title="Browse for the folder" aria-label="Browse">📁</button>
      <input type="text" id="setupName" placeholder="Your name" aria-label="Your name" title="Shown to your team: assignments, activity, history" required>
      <button class="btn primary" type="submit">Connect</button>`;
    wrap.appendChild(bar);
    const show = (msg) => {
      app.innerHTML = `
      <div class="card" style="max-width:680px;margin:30px auto">
        <h1>Connect Questline to your shared folder</h1>
        ${msg ? `<div class="callout bad"><strong>${esc(msg)}</strong></div>` : ""}
        <p class="lead-text">In the bar at the top: paste the shared folder path, type your name, press Enter.</p>
        <p class="secondary"><strong>Folder:</strong> the one OneDrive/SharePoint syncs to this PC. In File Explorer, right-click it, choose <strong>Copy as path</strong>, then paste. Quotes are removed for you.</p>
        <p class="secondary"><strong>Your name:</strong> what your manager and colleague see next to your assignments, status changes and activity.</p>
        <ul class="secondary small">
          <li><strong>New, empty folder:</strong> you become the owner, then add your colleague and manager on the Team page.</li>
          <li><strong>Folder the team already uses:</strong> your name must match the one the owner added.</li>
        </ul>
        <p class="small muted">Asked only once on this PC. To change it later: Team → Disconnect this PC.</p>
      </div>`;
    };
    show(err && err.error);
    const folderEl = document.getElementById("setupFolder");
    folderEl.focus();
    document.getElementById("setupBrowse").onclick = async () => {
      try { const f = await call(api, "choose_folder"); if (f) folderEl.value = f; } catch (e) { show(e.message); }
    };
    await new Promise((resolve) => {
      bar.onsubmit = async (ev) => {
        ev.preventDefault();
        try { await call(api, "setup", folderEl.value, document.getElementById("setupName").value); resolve(); }
        catch (e) { show(e.message); folderEl.focus(); }
      };
    });
    bar.remove();
    search.hidden = false;
  }

  async function boot() {
    const params = new URLSearchParams(location.search);
    let store;
    if (params.get("desktop") === "1") {
      app.innerHTML = '<p class="muted" style="padding:20px">Connecting to the sync folder…</p>';
      const api = await waitForPywebview();
      for (;;) {
        const s = await call(api, "session");
        if (s.configured) break;
        await setupScreen(api, s);
      }
      try { store = desktopStore(api, await call(api, "load")); }
      catch (e) { app.innerHTML = `<div class="card"><h2>Cannot read the sync folder</h2><p>${esc(e.message)}</p></div>`; return; }
    } else {
      store = (await tryViewer()) || localStore();
    }
    window.QuestlineStart(store, await store.load());
  }
  boot();
})();
