/*
 * Fragrance Cards for Home Assistant
 * https://github.com/9retirement6irk/homeassistant_cards
 *
 * Four tile-style cards that pick up your theme (glass/gloss themes included):
 *   custom:pura-mini-card          one Pura diffuser: pods, intensity, toggles
 *   custom:room-fragrance-card     today's pick + Pura + Scentsy + extras for a room
 *   custom:fragrance-picks-card    today's suggested scent per room
 *   custom:fragrance-loaded-card   what's loaded in each room
 *   custom:fragrance-stash-card    what's on the shelf, from your todo lists
 *   custom:fragrance-inventory-card manage the todo lists: counts, ratings, used up
 */

const VERSION = "0.2.0";

/* ------------------------------------------------------------------ helpers */

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const NAMED_COLORS = {
  primary: "var(--primary-color)", accent: "var(--accent-color)", red: "var(--red-color, #f44336)",
  pink: "var(--pink-color, #e91e63)", purple: "var(--purple-color, #926bc7)", "deep-purple": "var(--deep-purple-color, #6e41ab)",
  indigo: "var(--indigo-color, #3f51b5)", blue: "var(--blue-color, #2196f3)", "light-blue": "var(--light-blue-color, #03a9f4)",
  cyan: "var(--cyan-color, #00bcd4)", teal: "var(--teal-color, #009688)", green: "var(--green-color, #4caf50)",
  "light-green": "var(--light-green-color, #8bc34a)", lime: "var(--lime-color, #cddc39)", yellow: "var(--yellow-color, #ffeb3b)",
  amber: "var(--amber-color, #ffc107)", orange: "var(--orange-color, #ff9800)", "deep-orange": "var(--deep-orange-color, #ff6f22)",
  brown: "var(--brown-color, #795548)", grey: "var(--grey-color, #9e9e9e)", "blue-grey": "var(--blue-grey-color, #607d8b)",
  disabled: "var(--disabled-color, #bdbdbd)",
};
const color = (c, fallback) => {
  if (!c) return fallback;
  if (Array.isArray(c)) return `rgb(${c.join(",")})`;
  return NAMED_COLORS[c] || c;
};

const titleCase = (s) => String(s || "").replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

const deviceName = (hass, id) => {
  const d = hass?.devices?.[id];
  return d ? d.name_by_user || d.name || "" : "";
};

const friendly = (hass, id) => hass?.states?.[id]?.attributes?.friendly_name || id || "";

/** Find a Pura device's entities by translation key, so renamed entities keep working. */
function findPura(hass, deviceId) {
  const found = { bays: {} };
  if (!hass || !deviceId) return found;
  const bay = (n) => (found.bays[n] ||= { slot: n });
  for (const e of Object.values(hass.entities || {})) {
    if (e.device_id !== deviceId || (e.platform && e.platform !== "pura")) continue;
    const id = e.entity_id;
    const domain = id.split(".")[0];
    const key = e.translation_key || "";
    const m = domain === "sensor" && /^bay_(\d)_(fragrance|fragrance_remaining)$/.exec(key);
    if (m) bay(Number(m[1]))[m[2] === "fragrance" ? "name" : "remaining"] = id;
    else if (domain === "sensor" && key === "fragrance") bay(1).name = id;
    else if (domain === "sensor" && key === "fragrance_remaining") bay(1).remaining = id;
    else if (domain === "select" && key === "fragrance") found.fragrance = id;
    else if (domain === "select" && key === "intensity") found.intensity = id;
    else if (domain === "switch" && key === "diffusion_mode") found.auto_alternate = id;
    else if (domain === "light") found.nightlight = id;
  }
  return found;
}

/** "Key: value" lines in a todo item's description. */
function parseDesc(desc) {
  const fields = {};
  for (const line of String(desc || "").split("\n")) {
    const m = /^([^:]{1,40}):\s*(.*)$/.exec(line);
    if (m) fields[m[1].trim()] = m[2].trim();
  }
  return fields;
}

function setFields(desc, changes) {
  const lines = String(desc || "").split("\n").filter((l, i, a) => !(l === "" && i === a.length - 1));
  const done = new Set();
  const out = lines.map((line) => {
    const m = /^([^:]{1,40}):\s*(.*)$/.exec(line);
    if (m && Object.prototype.hasOwnProperty.call(changes, m[1].trim())) {
      done.add(m[1].trim());
      return `${m[1].trim()}: ${changes[m[1].trim()]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(changes)) if (!done.has(k)) out.push(`${k}: ${v}`);
  return out.join("\n");
}

const num = (v, d = 0) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : d;
};

const stars = (v) => {
  const m = /(\d)\s*\/\s*5/.exec(String(v || ""));
  return m ? Number(m[1]) : 0;
};

/** "Pura: slot 1 Simmered Cider, medium (68) — reason" / "Scentsy: 🆕Stargazing (65) — reason" */
function parseSuggestion(text) {
  const t = String(text || "").trim();
  if (!t || ["unknown", "unavailable"].includes(t)) return null;
  const [head, ...rest] = t.split(/\s+[—–-]\s+/);
  const reason = rest.join(" — ").trim();
  let m = /^Pura:\s*slot\s*(\d)\s+(.+?)(?:,\s*([a-z]+))?\s*(?:\((\d+)\))?$/i.exec(head.trim());
  if (m) return { kind: "pura", slot: Number(m[1]), name: m[2].trim(), intensity: (m[3] || "").toLowerCase(), score: m[4], reason };
  m = /^Scentsy:\s*(.+?)\s*(?:\((\d+)\))?$/i.exec(head.trim());
  if (m) return { kind: "scentsy", name: m[1].replace(/^🆕\s*/u, "").trim(), isNew: /🆕/u.test(m[1]), score: m[2], reason };
  return { kind: "text", name: head.trim(), reason };
}

/* ------------------------------------------------------------------ styles */

const STYLE = `
:host{display:block;color:var(--primary-text-color);--fc-radius:var(--ha-card-border-radius,12px);--fc-gap:var(--grid-card-gap,8px)}
.stack{display:flex;flex-direction:column;gap:var(--fc-gap)}
ha-card{overflow:hidden}
.tile{display:flex;align-items:center;gap:10px;padding:10px}
.ticon{--c:var(--state-icon-color,#44739e);width:36px;height:36px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
  background:color-mix(in srgb,var(--c) 20%,transparent);color:var(--c);cursor:pointer;border:none;padding:0;position:relative}
.ticon.off{--c:var(--state-inactive-color,var(--disabled-text-color,#9e9e9e))}
.ticon ha-icon{--mdc-icon-size:22px}
.info{display:flex;flex-direction:column;min-width:0;flex:1}
.name{font-size:14px;font-weight:500;line-height:20px;color:var(--primary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.state{font-size:12px;line-height:16px;color:var(--secondary-text-color);overflow:hidden;text-overflow:ellipsis}
.wrap{white-space:normal}
.body{padding:0 10px 10px;display:flex;flex-direction:column;gap:8px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.gridn{display:grid;grid-template-columns:repeat(var(--n,4),minmax(0,1fr));gap:8px}
.well{border-radius:calc(var(--fc-radius) - 2px);background:rgba(0,0,0,.24);box-shadow:inset 0 2px 5px rgba(0,0,0,.45),0 1px 0 rgba(255,255,255,.07)}
.btn{font:inherit;font-size:13px;color:var(--primary-text-color);cursor:pointer;border-radius:calc(var(--fc-radius) - 2px);
  border:1px solid rgba(255,255,255,.16);min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 12px;box-sizing:border-box;
  background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.06) 48%,rgba(255,255,255,0) 50%),rgba(127,127,127,.14);
  box-shadow:0 1px 3px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.25)}
.btn ha-icon{--mdc-icon-size:18px}
.btn.on{color:#fff;border-color:rgba(255,255,255,.35);
  background:linear-gradient(180deg,rgba(255,255,255,.4),rgba(255,255,255,.12) 48%,rgba(255,255,255,0) 50%),var(--c,var(--primary-color));
  box-shadow:0 0 10px color-mix(in srgb,var(--c,var(--primary-color)) 65%,transparent),inset 0 1px 0 rgba(255,255,255,.5)}
.btn.round{width:40px;height:40px;min-height:40px;padding:0;border-radius:50%;flex:none}
.btn.small{min-height:30px;padding:0 10px;font-size:12px;border-radius:15px}
.btn:focus-visible,.slot:focus-visible,.ticon:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
.slot{font:inherit;color:var(--primary-text-color);text-align:left;border:none;cursor:pointer;padding:8px;display:flex;align-items:center;gap:10px;min-width:0}
.slot.sel{box-shadow:inset 0 2px 5px rgba(0,0,0,.45),0 0 0 1.5px var(--c),0 0 10px color-mix(in srgb,var(--c) 60%,transparent)}
.slot img,.slot svg{width:28px;height:52px;object-fit:contain;flex:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))}
.slot .t{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.slot .n{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.slot .s{font-size:12px;color:var(--secondary-text-color)}
.slot .s.low{color:var(--error-color,#db4437)}
.level{display:block;height:6px;border-radius:3px;background:rgba(0,0,0,.45);box-shadow:inset 0 1px 2px rgba(0,0,0,.8);overflow:hidden}
.level>span{display:block;height:100%;border-radius:3px;background:linear-gradient(180deg,rgba(255,255,255,.5),var(--c) 60%)}
.level.low>span{--c:var(--error-color,#db4437)}
.slider{padding:4px 12px 2px}
.slider label{display:flex;justify-content:space-between;font-size:12px;color:var(--secondary-text-color)}
.slider label b{color:var(--primary-text-color);font-weight:600}
input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:36px;background:transparent;margin:0;cursor:pointer;--c:var(--primary-color)}
input[type=range]::-webkit-slider-runnable-track{height:8px;border-radius:4px;background:rgba(0,0,0,.45);box-shadow:inset 0 1px 3px rgba(0,0,0,.85),0 1px 0 rgba(255,255,255,.08)}
input[type=range]::-moz-range-track{height:8px;border-radius:4px;background:rgba(0,0,0,.45);box-shadow:inset 0 1px 3px rgba(0,0,0,.85),0 1px 0 rgba(255,255,255,.08)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;margin-top:-8px;border-radius:50%;border:1px solid rgba(255,255,255,.5);
  background:radial-gradient(circle at 50% 28%,rgba(255,255,255,.95),rgba(255,255,255,.35) 32%,rgba(255,255,255,0) 52%),radial-gradient(circle at 50% 80%,color-mix(in srgb,var(--c) 55%,#fff),var(--c) 70%);
  box-shadow:0 2px 5px rgba(0,0,0,.55),0 0 8px color-mix(in srgb,var(--c) 60%,transparent)}
input[type=range]::-moz-range-thumb{width:24px;height:24px;border-radius:50%;border:1px solid rgba(255,255,255,.5);
  background:radial-gradient(circle at 50% 28%,rgba(255,255,255,.95),rgba(255,255,255,.35) 32%,rgba(255,255,255,0) 52%),radial-gradient(circle at 50% 80%,color-mix(in srgb,var(--c) 55%,#fff),var(--c) 70%);
  box-shadow:0 2px 5px rgba(0,0,0,.55)}
select,input[type=search],input[type=text]{font:inherit;font-size:14px;color:var(--primary-text-color);border:none;outline:none;height:40px;padding:0 10px;box-sizing:border-box;min-width:0}
select option{color:#000}
.select{flex:none;width:min(46%,190px)}
.muted{font-size:12px;color:var(--secondary-text-color)}
.heading{display:flex;align-items:center;gap:8px;padding:4px 2px 0;font-size:16px;font-weight:500;color:var(--primary-text-color)}
.heading ha-icon{--mdc-icon-size:20px}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden}
.bar>span{display:block;height:100%;background:linear-gradient(180deg,rgba(255,255,255,.5),var(--c) 55%)}
.fam{display:grid;grid-template-columns:62px minmax(0,1fr) 46px;align-items:center;gap:8px;font-size:13px}
.fam .l{color:var(--secondary-text-color);font-size:12px;text-align:right}
.legend{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--secondary-text-color)}
.legend i{width:8px;height:8px;border-radius:2px;background:var(--c)}
.big{font-size:28px;font-weight:700;line-height:1.15}
.stat{padding:10px 12px;display:flex;flex-direction:column;gap:2px}
.stat .k{font-size:12px;font-weight:600;color:var(--c)}
.item{padding:8px 10px;display:flex;flex-direction:column;gap:8px}
.item .top{display:flex;align-items:center;gap:10px}
.item .top .t{display:flex;flex-direction:column;min-width:0;flex:1;cursor:pointer}
.item .top .t .n{font-size:14px;font-weight:600}
.item .count{min-width:22px;text-align:center;font-weight:700}
.dot{width:10px;height:10px;border-radius:50%;flex:none;background:radial-gradient(circle at 40% 30%,#fff,var(--c) 60%);box-shadow:0 0 6px var(--c)}
.starbtn{font-size:18px;background:none;border:none;cursor:pointer;color:var(--disabled-text-color,#888);padding:2px;line-height:1}
.starbtn.on{color:#f4c542;text-shadow:0 0 6px rgba(244,197,66,.5)}
.tabs{display:grid;grid-template-columns:repeat(var(--n,2),minmax(0,1fr));gap:4px;padding:4px}
.tab{font:inherit;font-size:13px;height:36px;border:none;border-radius:calc(var(--fc-radius) - 4px);background:transparent;color:var(--secondary-text-color);cursor:pointer}
.tab.btn{color:var(--primary-text-color);font-weight:600}
.search{display:flex;align-items:center;gap:8px;padding:0 10px}
.search input{flex:1;background:transparent;height:40px}
.empty{padding:12px;text-align:center;color:var(--secondary-text-color);font-size:13px}
.roomrow{padding:10px;display:flex;flex-direction:column;gap:6px}
.roomrow .head{display:flex;align-items:center;gap:10px}
.roomrow .ticon{width:32px;height:32px}
.roomrow .ticon ha-icon{--mdc-icon-size:18px}
.roomrow .title{display:flex;flex-direction:column;min-width:0;flex:1;cursor:pointer}
.roomrow .room{font-size:12px;color:var(--secondary-text-color);line-height:16px}
.roomrow .pick{font-size:15px;font-weight:600;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tag{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;line-height:18px;padding:0 7px;border-radius:9px;white-space:nowrap;
  color:var(--c);background:color-mix(in srgb,var(--c) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 35%,transparent)}
.score{font-size:12px;font-weight:700;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;
  color:var(--primary-text-color);background:radial-gradient(circle at 50% 30%,rgba(255,255,255,.25),rgba(255,255,255,0) 60%),color-mix(in srgb,var(--c) 45%,transparent);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),0 1px 3px rgba(0,0,0,.4)}
.reason{font-size:13px;line-height:18px;color:var(--secondary-text-color);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}
.reason.open{display:block}
.chips{display:flex;gap:4px;flex-wrap:wrap}
.chips .tag{--c:var(--secondary-text-color);font-weight:500}
.pods{display:grid;grid-template-columns:repeat(var(--n,2),minmax(0,1fr));gap:6px}
.pod{display:flex;align-items:center;gap:8px;padding:6px 8px;min-width:0}
.pod img,.pod svg{width:18px;height:34px;object-fit:contain;flex:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))}
.pod .t{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.pod .n{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pod.on{box-shadow:inset 0 2px 5px rgba(0,0,0,.45),0 0 0 1.5px var(--c),0 0 8px color-mix(in srgb,var(--c) 55%,transparent)}
.pod .level{height:4px}
:host([flat]) .btn,:host([flat]) .btn.on{background-image:none;box-shadow:none}
:host([flat]) .well{box-shadow:none;background:rgba(127,127,127,.12)}
:host([flat]) input[type=range]::-webkit-slider-thumb{background:var(--c);box-shadow:none}
:host([flat]) .level>span,:host([flat]) .bar>span{background:var(--c)}
`;

/* A drawn pod, shown when Pura has no picture for the fragrance. */
const podSvg = (pct, c) => {
  const h = Math.max(0, Math.min(100, pct)) * 0.48;
  return `<svg viewBox="0 0 44 80" aria-hidden="true"><rect x="14" y="2" width="16" height="18" rx="3" fill="#f2f1ec"/><path d="M17 5v12M20 5v12M23 5v12M26 5v12" stroke="#d6d4cc"/><rect x="12" y="20" width="20" height="6" rx="1" fill="#e4e2db"/><rect x="6" y="26" width="32" height="52" rx="5" fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.45)"/><rect x="8" y="${76 - h}" width="28" height="${h}" rx="4" fill="${c}"/><rect x="9" y="29" width="3.5" height="45" rx="1.75" fill="#fff" opacity=".3"/></svg>`;
};

/* ------------------------------------------------------------------ base */

class FcBase extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._key = "";
    this.shadowRoot.addEventListener("click", (ev) => this._click(ev));
    this.shadowRoot.addEventListener("change", (ev) => this._change(ev));
    this.shadowRoot.addEventListener("input", (ev) => this._input(ev));
    this.shadowRoot.addEventListener("keydown", (ev) => this._keydown(ev));
  }

  setConfig(config) {
    this._config = { ...this.constructor.defaults(), ...config };
    this.toggleAttribute("flat", this._config.gloss === false);
    this._key = "";
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  static defaults() {
    return {};
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: "auto", min_columns: 6 };
  }

  /** Keys of the entities this card shows; the card re-renders only when one changes. */
  _watch() {
    return [];
  }

  _stateKey() {
    const h = this._hass;
    return this._watch()
      .filter(Boolean)
      .map((id) => {
        const s = h?.states?.[id];
        return s ? `${id}=${s.state}|${s.last_updated}` : `${id}=-`;
      })
      .join(";");
  }

  _render(force) {
    if (!this._config || !this._hass) return;
    const busy = this._dragging || (this.shadowRoot.activeElement && this.shadowRoot.activeElement.matches?.("select,input[type=search],input[type=text]"));
    const key = this._stateKey() + "#" + (this._localKey ? this._localKey() : "");
    if (!force && (busy || key === this._key)) return;
    this._key = key;
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>${this._html()}`;
  }

  _call(domain, service, data) {
    return this._hass.callService(domain, service, data).catch((err) => this._toast(err?.message || String(err)));
  }

  _toast(message) {
    this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message }, bubbles: true, composed: true }));
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _navigate(path) {
    if (!path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  _toggle(entityId) {
    if (!entityId) return;
    const domain = entityId.split(".")[0];
    const service = domain === "input_button" || domain === "button" ? "press" : "toggle";
    return this._call(domain, service, { entity_id: entityId });
  }

  _click(ev) {
    const el = ev.target.closest("[data-a]");
    if (el) this._action(el.dataset.a, el, ev);
  }

  _change(ev) {
    const el = ev.target.closest("[data-a]");
    if (el) this._action(el.dataset.a, el, ev);
  }

  _input(ev) {
    const el = ev.target.closest("[data-live]");
    if (el) this._live(el.dataset.live, el, ev);
  }

  _keydown(ev) {
    if (ev.key === "Enter") {
      const el = ev.target.closest("[data-enter]");
      if (el) this._action(el.dataset.enter, el, ev);
    }
  }

  _action() {}

  _live() {}

  /** Act on a parsed suggestion: start the Pura slot and intensity, or pick the Scentsy bar and warm it. */
  async _startSuggestion(s, room) {
    const h = this._hass;
    if (!s || !room) return;
    if (s.kind === "pura" && room.pura_device_id) {
      const p = findPura(h, room.pura_device_id);
      if (!p.fragrance) return;
      await this._call("select", "select_option", { entity_id: p.fragrance, option: `slot_${s.slot}` });
      const options = h.states[p.intensity]?.attributes?.options || [];
      if (s.intensity && options.includes(s.intensity)) {
        setTimeout(() => this._call("select", "select_option", { entity_id: p.intensity, option: s.intensity }), 1500);
      }
    } else if (s.kind === "scentsy" && room.scentsy_entity) {
      const options = h.states[room.scentsy_entity]?.attributes?.options || [];
      const option = options.find((o) => o.toLowerCase() === s.name.toLowerCase());
      if (option) await this._call(room.scentsy_entity.split(".")[0], "select_option", { entity_id: room.scentsy_entity, option });
      const warmers = (room.warmers || []).map((w) => (typeof w === "string" ? w : w.entity));
      if (warmers.length) await this._call("homeassistant", "turn_on", { entity_id: warmers });
    }
  }

  /** Two taps to confirm: the first arms the button, the second within 4 s runs it. */
  _armed(key) {
    if (this._arm === key) {
      this._arm = "";
      clearTimeout(this._armTimer);
      this._render(true);
      return true;
    }
    this._arm = key;
    clearTimeout(this._armTimer);
    this._armTimer = setTimeout(() => { this._arm = ""; this._render(true); }, 4000);
    this._render(true);
    return false;
  }

  /** A tile header like the built-in tile card. */
  _tile({ icon, name, state, c, off, iconAction, iconData = "", trailing = "", wrapState = false }) {
    return `<div class="tile">
      <button class="ticon${off ? " off" : ""}" style="--c:${c}" data-a="${iconAction || ""}" ${iconData} aria-label="${esc(name)}">
        <ha-icon icon="${esc(icon)}"></ha-icon></button>
      <div class="info"><span class="name">${esc(name)}</span><span class="state${wrapState ? " wrap" : ""}">${state}</span></div>
      ${trailing}
    </div>`;
  }
}

/* ------------------------------------------------------------------ Pura block (shared) */

const PuraMixin = (Base) =>
  class extends Base {
    _pura() {
      return findPura(this._hass, this._config.device_id || this._config.pura_device_id);
    }

    _puraWatch() {
      const p = this._pura();
      const ids = [p.fragrance, p.intensity, p.auto_alternate, p.nightlight];
      for (const b of Object.values(p.bays)) ids.push(b.name, b.remaining);
      return ids;
    }

    _puraHtml(opts) {
      const h = this._hass;
      const cfg = this._config;
      const p = this._pura();
      const c = color(cfg.color, "var(--teal-color, #009688)");
      if (!p.fragrance) {
        return `<ha-card>${this._tile({ icon: cfg.icon || "mdi:scent", name: opts.name || "Pura", state: "Pick a Pura diffuser in the card settings", c, off: true })}</ha-card>`;
      }
      const sel = h.states[p.fragrance]?.state || "off";
      const running = sel.startsWith("slot_");
      const bays = Object.values(p.bays).sort((a, b) => a.slot - b.slot);
      const low = Number(cfg.low_threshold ?? 20);
      const intensityState = p.intensity ? h.states[p.intensity] : null;
      const levels = (intensityState?.attributes?.options || []).filter((o) => o !== "off");
      const level = intensityState?.state;
      const activeBay = bays.find((b) => `slot_${b.slot}` === sel);
      const activeName = activeBay ? h.states[activeBay.name]?.state : "";
      const stateText = running
        ? `${esc(activeName || "Diffusing")}${level && level !== "off" ? " · " + esc(titleCase(level)) : ""}`
        : sel === "unavailable" ? "Unavailable" : "Off · tap a pod to start";

      const power = cfg.show_power === false ? "" :
        `<button class="btn round${running ? " on" : ""}" style="--c:${c}" data-a="pura-power" aria-label="${running ? "Turn off" : "Start the fullest pod"}"><ha-icon icon="mdi:power"></ha-icon></button>`;

      const slots = bays.map((b) => {
        const st = h.states[b.name];
        const name = st?.state && !["unknown", "unavailable"].includes(st.state) ? st.state : `Slot ${b.slot}`;
        const pct = num(h.states[b.remaining]?.state, 0);
        const isLow = pct <= low;
        const active = `slot_${b.slot}` === sel;
        const pic = cfg.show_pod_images !== false && st?.attributes?.entity_picture;
        const img = pic ? `<img src="${esc(pic)}" alt="">` : podSvg(pct, isLow ? "var(--error-color,#db4437)" : c);
        return `<button class="slot well${active ? " sel" : ""}" style="--c:${c}" data-a="pura-slot" data-slot="${b.slot}" aria-pressed="${active}" aria-label="${esc(name)}, ${pct}% left">
          ${img}<span class="t"><span class="n">${esc(name)}</span>
          <span class="level${isLow ? " low" : ""}"><span style="width:${pct}%"></span></span>
          <span class="s${isLow ? " low" : ""}">${pct}%${active ? " · diffusing" : isLow ? " · running low" : " left"}</span></span></button>`;
      }).join("");

      const showControls = running || cfg.compact_when_off === false;
      const slider = cfg.show_intensity !== false && showControls && levels.length && p.intensity
        ? `<div class="slider well"><label><span>Intensity</span><b>${esc(titleCase(level === "off" ? "" : level))}</b></label>
           <input type="range" style="--c:${c}" min="1" max="${levels.length}" step="1" value="${Math.max(1, levels.indexOf(level) + 1)}" data-a="pura-intensity" aria-label="Intensity" ${running ? "" : "disabled"}></div>`
        : "";
      const toggles = [];
      if (cfg.show_auto_alternate !== false && p.auto_alternate && showControls) {
        const on = h.states[p.auto_alternate]?.state === "on";
        toggles.push(`<button class="btn${on ? " on" : ""}" style="--c:${c}" role="switch" aria-checked="${on}" data-a="toggle" data-entity="${p.auto_alternate}"><ha-icon icon="mdi:swap-horizontal"></ha-icon>Auto-alternate</button>`);
      }
      if (cfg.show_nightlight !== false && p.nightlight && showControls) {
        const on = h.states[p.nightlight]?.state === "on";
        toggles.push(`<button class="btn${on ? " on" : ""}" style="--c:var(--amber-color,#ffc107)" role="switch" aria-checked="${on}" data-a="toggle" data-entity="${p.nightlight}"><ha-icon icon="mdi:weather-night"></ha-icon>Nightlight</button>`);
      }

      return `<ha-card>
        ${this._tile({ icon: cfg.icon || "mdi:scent", name: opts.name, state: stateText, c, off: !running, iconAction: "more-info", iconData: `data-entity="${p.fragrance}"`, trailing: power })}
        <div class="body">
          ${slots ? `<div class="grid2">${slots}</div>` : ""}
          ${slider}
          ${toggles.length ? `<div class="row">${toggles.join("")}</div>` : ""}
        </div></ha-card>`;
    }

    _puraAction(a, el) {
      const h = this._hass;
      const p = this._pura();
      if (a === "pura-power") {
        const sel = h.states[p.fragrance]?.state || "off";
        if (sel.startsWith("slot_")) return this._call("select", "select_option", { entity_id: p.fragrance, option: "off" });
        const best = Object.values(p.bays).sort((x, y) => num(h.states[y.remaining]?.state) - num(h.states[x.remaining]?.state))[0];
        if (best) return this._call("select", "select_option", { entity_id: p.fragrance, option: `slot_${best.slot}` });
      }
      if (a === "pura-slot") {
        const option = `slot_${el.dataset.slot}`;
        const sel = h.states[p.fragrance]?.state;
        return this._call("select", "select_option", { entity_id: p.fragrance, option: sel === option ? "off" : option });
      }
      if (a === "pura-intensity") {
        const levels = (h.states[p.intensity]?.attributes?.options || []).filter((o) => o !== "off");
        const option = levels[Number(el.value) - 1];
        if (option) return this._call("select", "select_option", { entity_id: p.intensity, option });
      }
      return undefined;
    }
  };

/* ------------------------------------------------------------------ Pura Mini */

class PuraMiniCard extends PuraMixin(FcBase) {
  static defaults() {
    return { show_intensity: true, show_auto_alternate: true, show_nightlight: true, show_power: true, show_pod_images: true, compact_when_off: true, low_threshold: 20, gloss: true };
  }

  static getStubConfig(hass) {
    const e = Object.values(hass?.entities || {}).find((x) => x.platform === "pura" && x.device_id);
    return { device_id: e?.device_id || "" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "device_id", required: true, selector: { device: { integration: "pura" } } },
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "color", selector: { ui_color: {} } },
        { type: "expandable", name: "", title: "Show", flatten: true, schema: [
          { type: "grid", name: "", schema: [
            { name: "show_intensity", selector: { boolean: {} } },
            { name: "show_auto_alternate", selector: { boolean: {} } },
            { name: "show_nightlight", selector: { boolean: {} } },
            { name: "show_power", selector: { boolean: {} } },
            { name: "show_pod_images", selector: { boolean: {} } },
            { name: "compact_when_off", selector: { boolean: {} } },
            { name: "gloss", selector: { boolean: {} } },
          ] },
          { name: "low_threshold", selector: { number: { min: 0, max: 100, unit_of_measurement: "%", mode: "box" } } },
        ] },
      ],
      computeLabel: (s) => LABELS[s.name] || titleCase(s.name),
      computeHelper: (s) => HELPERS[s.name],
    };
  }

  _watch() {
    return this._puraWatch();
  }

  _html() {
    const name = this._config.name || deviceName(this._hass, this._config.device_id) || "Pura";
    return this._puraHtml({ name });
  }

  _action(a, el) {
    if (a === "more-info") return this._moreInfo(el.dataset.entity);
    if (a === "toggle") return this._toggle(el.dataset.entity);
    return this._puraAction(a, el);
  }
}

/* ------------------------------------------------------------------ Room Fragrance */

class RoomFragranceCard extends PuraMixin(FcBase) {
  static defaults() {
    return { show_suggestion: true, show_scores: true, show_pura: true, show_scentsy: true, show_intensity: true, show_auto_alternate: true, show_nightlight: true, show_power: true, show_pod_images: true, compact_when_off: true, low_threshold: 20, gloss: true, warmers: [], entities: [] };
  }

  static getStubConfig(hass) {
    const e = Object.values(hass?.entities || {}).find((x) => x.platform === "pura" && x.device_id);
    return { title: "Fragrance", pura_device_id: e?.device_id || "" };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "title_icon", selector: { icon: {} } },
        ] },
        { type: "expandable", name: "", title: "Today's pick", flatten: true, schema: [
          { name: "suggestion_entity", selector: { entity: { domain: ["input_text", "sensor", "text"] } } },
          { name: "scores_entity", selector: { entity: { domain: ["input_text", "sensor", "text"] } } },
          { name: "refresh_entity", selector: { entity: { domain: ["input_button", "button", "script", "automation"] } } },
          { type: "grid", name: "", schema: [
            { name: "show_suggestion", selector: { boolean: {} } },
            { name: "show_scores", selector: { boolean: {} } },
          ] },
        ] },
        { type: "expandable", name: "", title: "Pura", flatten: true, schema: [
          { name: "pura_device_id", selector: { device: { integration: "pura" } } },
          { type: "grid", name: "", schema: [
            { name: "pura_name", selector: { text: {} } },
            { name: "color", selector: { ui_color: {} } },
            { name: "show_pura", selector: { boolean: {} } },
            { name: "show_intensity", selector: { boolean: {} } },
            { name: "show_auto_alternate", selector: { boolean: {} } },
            { name: "show_nightlight", selector: { boolean: {} } },
            { name: "show_pod_images", selector: { boolean: {} } },
            { name: "compact_when_off", selector: { boolean: {} } },
          ] },
          { name: "low_threshold", selector: { number: { min: 0, max: 100, unit_of_measurement: "%", mode: "box" } } },
        ] },
        { type: "expandable", name: "", title: "Scentsy", flatten: true, schema: [
          { name: "scentsy_entity", selector: { entity: { domain: ["input_select", "select"] } } },
          { name: "warmers", selector: { entity: { multiple: true, domain: ["switch", "light", "input_boolean"] } } },
          { type: "grid", name: "", schema: [
            { name: "scentsy_name", selector: { text: {} } },
            { name: "scentsy_color", selector: { ui_color: {} } },
            { name: "show_scentsy", selector: { boolean: {} } },
            { name: "warmer_columns", selector: { number: { min: 1, max: 6, mode: "box" } } },
          ] },
        ] },
        { type: "expandable", name: "", title: "More tiles", flatten: true, schema: [
          { name: "entities", selector: { entity: { multiple: true } } },
        ] },
        { name: "gloss", selector: { boolean: {} } },
      ],
      computeLabel: (s) => LABELS[s.name] || titleCase(s.name),
      computeHelper: (s) => HELPERS[s.name],
    };
  }

  _watch() {
    const c = this._config;
    return [c.suggestion_entity, c.scores_entity, c.scentsy_entity, ...(c.warmers || []), ...(c.entities || []), ...(c.show_pura === false ? [] : this._puraWatch())];
  }

  getCardSize() {
    return 10;
  }

  _html() {
    const c = this._config;
    const h = this._hass;
    const parts = [];
    if (c.title) parts.push(`<div class="heading">${c.title_icon ? `<ha-icon icon="${esc(c.title_icon)}"></ha-icon>` : ""}<span>${esc(c.title)}</span></div>`);

    if (c.show_suggestion !== false && c.suggestion_entity) {
      const s = parseSuggestion(h.states[c.suggestion_entity]?.state);
      if (s) {
        const headline = s.kind === "pura"
          ? `${esc(s.name)} on Pura${s.intensity ? ", " + esc(s.intensity) : ""}`
          : s.kind === "scentsy" ? `${esc(s.name)} in the Scentsy warmers` : esc(s.name);
        const scores = c.show_scores !== false && c.scores_entity ? String(h.states[c.scores_entity]?.state || "") : "";
        const next = scores && !["unknown", "unavailable"].includes(scores) ? scores.split("·").map((x) => x.trim()).filter((x) => !x.startsWith(s.name)).slice(0, 2).join(" · ") : "";
        const canStart = s.kind === "pura" ? !!this._pura().fragrance : s.kind === "scentsy" ? !!c.scentsy_entity : false;
        parts.push(`<ha-card>
          ${this._tile({ icon: "mdi:creation", name: "Today's pick", c: "var(--amber-color,#ffc107)", wrapState: true,
            state: `<span style="color:var(--primary-text-color)">${headline}.</span> ${esc(s.reason)}${next ? `<br>Next: ${esc(next)}` : ""}`,
            iconAction: "more-info", iconData: `data-entity="${c.suggestion_entity}"` })}
          <div class="body"><div class="row" style="padding-left:46px">
            ${canStart ? `<button class="btn on" style="--c:var(--amber-color,#ffc107)" data-a="start-pick">Start it</button>` : ""}
            ${c.refresh_entity ? `<button class="btn round" aria-label="Refresh suggestions" data-a="toggle" data-entity="${c.refresh_entity}"><ha-icon icon="mdi:refresh"></ha-icon></button>` : ""}
          </div></div></ha-card>`);
      }
    }

    if (c.show_pura !== false && (c.pura_device_id || c.device_id)) {
      parts.push(this._puraHtml({ name: c.pura_name || "Pura" }));
    }

    if (c.show_scentsy !== false && (c.scentsy_entity || (c.warmers || []).length)) {
      const sc = color(c.scentsy_color, "var(--purple-color, #926bc7)");
      const sel = c.scentsy_entity ? h.states[c.scentsy_entity] : null;
      const warmers = (c.warmers || []).map((w) => (typeof w === "string" ? { entity: w } : w));
      const onCount = warmers.filter((w) => h.states[w.entity]?.state === "on").length;
      const opts = (sel?.attributes?.options || []).map((o) => `<option ${o === sel.state ? "selected" : ""}>${esc(o)}</option>`).join("");
      const picker = sel ? `<select class="well select" data-a="scentsy-select" aria-label="${esc(c.scentsy_name || "Scentsy bar")}">${opts}</select>` : "";
      const btns = warmers.map((w) => {
        const on = h.states[w.entity]?.state === "on";
        const label = w.name || friendly(h, w.entity).replace(/\s*scentsy\s*/i, " ").trim();
        return `<button class="btn${on ? " on" : ""}" style="--c:${sc}" role="switch" aria-checked="${on}" data-a="toggle" data-entity="${w.entity}"><ha-icon icon="${esc(w.icon || "mdi:candle")}"></ha-icon>${esc(label)}</button>`;
      }).join("");
      parts.push(`<ha-card>
        ${this._tile({ icon: "mdi:candle", name: c.scentsy_name || "Scentsy bar", c: sc, off: warmers.length ? onCount === 0 : false,
          state: warmers.length ? `${onCount} of ${warmers.length} warming` : esc(sel?.state || ""), iconAction: "more-info", iconData: `data-entity="${c.scentsy_entity || ""}"`, trailing: picker })}
        ${btns ? `<div class="body"><div class="gridn" style="--n:${Number(c.warmer_columns) || Math.min(4, warmers.length)}">${btns}</div></div>` : ""}
      </ha-card>`);
    }

    for (const id of c.entities || []) parts.push(this._entityTile(typeof id === "string" ? { entity: id } : id));
    return `<div class="stack">${parts.join("")}</div>`;
  }

  _entityTile(cfg) {
    const h = this._hass;
    const st = h.states[cfg.entity];
    const domain = cfg.entity.split(".")[0];
    const on = st?.state === "on";
    const c = color(cfg.color, domain === "light" ? "var(--state-light-active-color, var(--amber-color,#ffc107))" : "var(--state-icon-active-color, var(--primary-color))");
    const icon = cfg.icon || st?.attributes?.icon || (domain === "light" ? "mdi:lightbulb" : domain === "switch" ? "mdi:toggle-switch" : "mdi:eye");
    const brightness = domain === "light" && (st?.attributes?.supported_color_modes || []).some((m) => m !== "onoff");
    const pct = on ? Math.round((st?.attributes?.brightness || 0) / 2.55) : 0;
    const state = domain === "light" && on && brightness ? `${pct}%` : esc(st ? titleCase(st.state) : "Unavailable");
    const trailing = brightness
      ? `<div class="well select slider" style="padding:0 10px"><input type="range" style="--c:${c}" min="0" max="100" value="${pct}" data-a="brightness" data-entity="${cfg.entity}" aria-label="${esc(friendly(h, cfg.entity))} brightness"></div>`
      : "";
    const toggleable = ["light", "switch", "input_boolean", "fan"].includes(domain);
    return `<ha-card>${this._tile({ icon, name: cfg.name || friendly(h, cfg.entity), state, c, off: toggleable && !on, iconAction: toggleable ? "toggle" : "more-info", iconData: `data-entity="${cfg.entity}"`, trailing })}</ha-card>`;
  }

  _action(a, el) {
    const c = this._config;
    if (a === "more-info") return this._moreInfo(el.dataset.entity);
    if (a === "toggle") return this._toggle(el.dataset.entity);
    if (a === "scentsy-select") return this._call(c.scentsy_entity.split(".")[0], "select_option", { entity_id: c.scentsy_entity, option: el.value });
    if (a === "brightness") {
      const v = Number(el.value);
      return v > 0 ? this._call("light", "turn_on", { entity_id: el.dataset.entity, brightness_pct: v }) : this._call("light", "turn_off", { entity_id: el.dataset.entity });
    }
    if (a === "start-pick") return this._startPick();
    return this._puraAction(a, el);
  }

  _startPick() {
    const c = this._config;
    return this._startSuggestion(parseSuggestion(this._hass.states[c.suggestion_entity]?.state), { pura_device_id: c.pura_device_id || c.device_id, scentsy_entity: c.scentsy_entity, warmers: c.warmers });
  }
}

/* ------------------------------------------------------------------ Today's picks */

const ROOM_FIELDS = {
  name: { label: "Room name", required: true, selector: { text: {} } },
  icon: { label: "Icon", selector: { icon: {} } },
  suggestion_entity: { label: "Suggestion", selector: { entity: { domain: ["input_text", "sensor", "text"] } } },
  scores_entity: { label: "Top scores", selector: { entity: { domain: ["input_text", "sensor", "text"] } } },
  pura_device_id: { label: "Pura diffuser", selector: { device: { integration: "pura" } } },
  scentsy_entity: { label: "Scentsy bar picker", selector: { entity: { domain: ["input_select", "select"] } } },
  warmers: { label: "Warmers", selector: { entity: { multiple: true, domain: ["switch", "light", "input_boolean"] } } },
  navigation_path: { label: "Tap opens", selector: { text: {} } },
};

const ago = (iso) => {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, n] of units) if (s >= n) { const v = Math.floor(s / n); return `${v} ${u}${v === 1 ? "" : "s"} ago`; }
  return "";
};

class FragrancePicksCard extends FcBase {
  static defaults() {
    return { title: "Whole home", icon: "mdi:home-heart", show_updated: true, show_reason: true, show_scores: true, show_start: true, max_scores: 4, gloss: true, rooms: [] };
  }

  static getStubConfig() {
    return { summary_entity: "input_text.scent_suggestion_whole_home", refresh_entity: "input_button.refresh_scent_suggestions", rooms: [] };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "summary_entity", selector: { entity: { domain: ["input_text", "sensor", "text"] } } },
        { name: "refresh_entity", selector: { entity: { domain: ["input_button", "button", "script", "automation"] } } },
        { name: "rooms", selector: { object: { multiple: true, label_field: "name", description_field: "suggestion_entity", fields: ROOM_FIELDS } } },
        { type: "expandable", name: "", title: "Show", flatten: true, schema: [
          { type: "grid", name: "", schema: [
            { name: "show_updated", selector: { boolean: {} } },
            { name: "show_reason", selector: { boolean: {} } },
            { name: "show_scores", selector: { boolean: {} } },
            { name: "show_start", selector: { boolean: {} } },
            { name: "gloss", selector: { boolean: {} } },
            { name: "max_scores", selector: { number: { min: 0, max: 10, mode: "box" } } },
          ] },
        ] },
      ],
      computeLabel: (s) => LABELS[s.name] || titleCase(s.name),
      computeHelper: (s) => HELPERS[s.name],
    };
  }

  getCardSize() {
    return 3 + 2 * (this._config?.rooms?.length || 0);
  }

  _watch() {
    const c = this._config;
    const ids = [c.summary_entity];
    for (const r of c.rooms || []) {
      ids.push(r.suggestion_entity, r.scores_entity, r.scentsy_entity);
      const p = findPura(this._hass, r.pura_device_id);
      ids.push(p.fragrance);
    }
    return ids;
  }

  _localKey() {
    return [this._arm, JSON.stringify(this._open || {}), Math.floor(Date.now() / 60000)].join("#");
  }

  _html() {
    const c = this._config;
    const h = this._hass;
    const sum = c.summary_entity ? h.states[c.summary_entity] : null;
    const armed = this._arm === "refresh";
    const regen = c.refresh_entity
      ? `<button class="btn${armed ? " on" : ""}" style="--c:var(--amber-color,#ffc107)" data-a="refresh" aria-label="Regenerate suggestions"><ha-icon icon="mdi:refresh"></ha-icon>${armed ? "Tap again" : "Regenerate"}</button>`
      : "";
    const summary = sum && !["unknown", "unavailable", ""].includes(sum.state) ? esc(sum.state) : "No suggestions yet";
    const updated = c.show_updated !== false && sum ? `<span class="muted"><ha-icon icon="mdi:clock-outline" style="--mdc-icon-size:14px;vertical-align:-2px"></ha-icon> Updated ${esc(ago(sum.last_changed))}</span>` : "";

    const rows = (c.rooms || []).map((r, i) => {
      const s = parseSuggestion(h.states[r.suggestion_entity]?.state);
      const icon = r.icon || "mdi:home";
      if (!s) {
        return `<div class="well roomrow"><div class="head"><span class="ticon off"><ha-icon icon="${esc(icon)}"></ha-icon></span>
          <span class="title"><span class="room">${esc(r.name)}</span><span class="pick" style="color:var(--secondary-text-color)">No pick yet</span></span></div></div>`;
      }
      const isPura = s.kind === "pura";
      const tagC = isPura ? "var(--teal-color,#009688)" : "var(--purple-color,#926bc7)";
      const tagText = isPura ? `Pura · slot ${s.slot}${s.intensity ? " · " + titleCase(s.intensity) : ""}` : s.kind === "scentsy" ? "Scentsy" : "";
      let running = false;
      if (isPura && r.pura_device_id) {
        const p = findPura(h, r.pura_device_id);
        running = h.states[p.fragrance]?.state === `slot_${s.slot}`;
      } else if (s.kind === "scentsy" && r.scentsy_entity) {
        const warm = (r.warmers || []).some((w) => h.states[typeof w === "string" ? w : w.entity]?.state === "on");
        running = h.states[r.scentsy_entity]?.state?.toLowerCase() === s.name.toLowerCase() && warm;
      }
      const canStart = c.show_start !== false && ((isPura && r.pura_device_id) || (s.kind === "scentsy" && r.scentsy_entity));
      const start = running
        ? `<span class="tag" style="--c:var(--green-color,#4caf50)">On now</span>`
        : canStart ? `<button class="btn small on" style="--c:var(--amber-color,#ffc107)" data-a="start" data-i="${i}">Start</button>` : "";
      const scores = String(h.states[r.scores_entity]?.state || "");
      const others = c.show_scores !== false && scores && !["unknown", "unavailable"].includes(scores)
        ? scores.split("·").map((x) => x.trim()).filter((x) => x && !x.toLowerCase().startsWith(s.name.toLowerCase())).slice(0, Number(c.max_scores ?? 4))
        : [];
      const open = this._open?.[i];
      return `<div class="well roomrow">
        <div class="head">
          <button class="ticon" style="--c:var(--amber-color,#ffc107)" data-a="nav" data-i="${i}" aria-label="${esc(r.name)}"><ha-icon icon="${esc(icon)}"></ha-icon></button>
          <span class="title" data-a="nav" data-i="${i}"><span class="room">${esc(r.name)}</span><span class="pick">${esc(s.name)}</span></span>
          ${s.score ? `<span class="score" style="--c:${tagC}" title="Score">${esc(s.score)}</span>` : ""}
          ${start}
        </div>
        <div class="chips">${tagText ? `<span class="tag" style="--c:${tagC}">${esc(tagText)}</span>` : ""}${s.isNew ? `<span class="tag" style="--c:var(--green-color,#4caf50)">New to you</span>` : ""}</div>
        ${c.show_reason !== false && s.reason ? `<span class="reason${open ? " open" : ""}" data-a="expand" data-i="${i}" role="button" tabindex="0" aria-expanded="${!!open}">${esc(s.reason)}</span>` : ""}
        ${others.length ? `<div class="chips">${others.map((o) => `<span class="tag">${esc(o)}</span>`).join("")}</div>` : ""}
      </div>`;
    }).join("");

    return `<ha-card>
      ${this._tile({ icon: c.icon, name: c.title, c: "var(--deep-orange-color,#ff6f22)", state: summary, wrapState: true, iconAction: "more-info", iconData: `data-entity="${c.summary_entity || ""}"` })}
      <div class="body">
        ${updated || regen ? `<div class="row" style="justify-content:space-between;padding-left:46px">${updated}${regen}</div>` : ""}
        ${rows}
      </div></ha-card>`;
  }

  _action(a, el) {
    const c = this._config;
    const r = c.rooms?.[Number(el.dataset.i)];
    if (a === "more-info") return this._moreInfo(el.dataset.entity);
    if (a === "refresh") {
      if (this._armed("refresh")) {
        this._toast("Asking for fresh scent suggestions…");
        return this._toggle(c.refresh_entity);
      }
      return undefined;
    }
    if (a === "expand") { (this._open ||= {})[el.dataset.i] = !this._open[el.dataset.i]; return this._render(true); }
    if (a === "nav") return r?.navigation_path ? this._navigate(r.navigation_path) : this._moreInfo(r?.suggestion_entity);
    if (a === "start" && r) return this._startSuggestion(parseSuggestion(this._hass.states[r.suggestion_entity]?.state), r);
    return undefined;
  }

  _keydown(ev) {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.('[data-a="expand"]')) {
      ev.preventDefault();
      return this._action("expand", ev.target);
    }
    return super._keydown(ev);
  }
}

/* ------------------------------------------------------------------ Loaded now */

class FragranceLoadedCard extends FcBase {
  static defaults() {
    return { title: "Loaded now", icon: "mdi:spray", show_pod_images: true, show_scentsy: true, low_threshold: 30, critical_threshold: 15, gloss: true, rooms: [] };
  }

  static getStubConfig(hass) {
    const devs = [...new Set(Object.values(hass?.entities || {}).filter((e) => e.platform === "pura" && e.device_id).map((e) => e.device_id))];
    return { rooms: devs.slice(0, 4).map((d) => ({ name: deviceName(hass, d) || "Room", pura_device_id: d })) };
  }

  static getConfigForm() {
    const fields = { name: ROOM_FIELDS.name, icon: ROOM_FIELDS.icon, pura_device_id: ROOM_FIELDS.pura_device_id, scentsy_entity: ROOM_FIELDS.scentsy_entity, warmers: ROOM_FIELDS.warmers, navigation_path: ROOM_FIELDS.navigation_path };
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "rooms", selector: { object: { multiple: true, label_field: "name", fields } } },
        { type: "expandable", name: "", title: "Show", flatten: true, schema: [
          { type: "grid", name: "", schema: [
            { name: "show_header", selector: { boolean: {} } },
            { name: "show_pod_images", selector: { boolean: {} } },
            { name: "show_scentsy", selector: { boolean: {} } },
            { name: "gloss", selector: { boolean: {} } },
            { name: "low_threshold", selector: { number: { min: 0, max: 100, unit_of_measurement: "%", mode: "box" } } },
            { name: "critical_threshold", selector: { number: { min: 0, max: 100, unit_of_measurement: "%", mode: "box" } } },
          ] },
        ] },
      ],
      computeLabel: (s) => LABELS[s.name] || titleCase(s.name),
      computeHelper: (s) => HELPERS[s.name],
    };
  }

  getCardSize() {
    return 2 + 2 * (this._config?.rooms?.length || 0);
  }

  _watch() {
    const ids = [];
    for (const r of this._config.rooms || []) {
      const p = findPura(this._hass, r.pura_device_id);
      ids.push(p.fragrance, r.scentsy_entity, ...(r.warmers || []).map((w) => (typeof w === "string" ? w : w.entity)));
      for (const b of Object.values(p.bays)) ids.push(b.name, b.remaining);
    }
    return ids;
  }

  _html() {
    const c = this._config;
    const h = this._hass;
    const teal = "var(--teal-color,#009688)";
    let diffusing = 0;
    let warming = 0;
    const rows = (c.rooms || []).map((r, i) => {
      const p = findPura(h, r.pura_device_id);
      const sel = h.states[p.fragrance]?.state || "";
      const bays = Object.values(p.bays).sort((a, b) => a.slot - b.slot);
      const levels = bays.map((b) => num(h.states[b.remaining]?.state, 100));
      const min = levels.length ? Math.min(...levels) : 100;
      const iconC = min < Number(c.critical_threshold) ? "var(--error-color,#db4437)" : min < Number(c.low_threshold) ? "var(--orange-color,#ff9800)" : teal;
      const active = bays.find((b) => `slot_${b.slot}` === sel);
      if (active) diffusing += 1;
      const warmers = (r.warmers || []).map((w) => (typeof w === "string" ? w : w.entity));
      const warmOn = warmers.filter((w) => h.states[w]?.state === "on").length;
      if (warmOn) warming += 1;
      const bar = r.scentsy_entity ? h.states[r.scentsy_entity]?.state : "";
      const hasBar = bar && !["None", "none", "unknown", "unavailable", ""].includes(bar);
      const scentsy = c.show_scentsy === false || !r.scentsy_entity ? ""
        : hasBar ? `<span class="tag" style="--c:var(--purple-color,#926bc7)"><ha-icon icon="mdi:candle" style="--mdc-icon-size:12px"></ha-icon>${esc(bar)}${warmers.length ? (warmOn ? " · warming" : " · off") : ""}</span>`
        : `<span class="muted">No Scentsy bar</span>`;
      const pods = bays.map((b, j) => {
        const st = h.states[b.name];
        const name = st?.state && !["unknown", "unavailable"].includes(st.state) ? st.state : `Slot ${b.slot}`;
        const pct = levels[j];
        const low = pct < Number(c.low_threshold);
        const on = `slot_${b.slot}` === sel;
        const pic = c.show_pod_images !== false && st?.attributes?.entity_picture;
        return `<div class="pod well${on ? " on" : ""}" style="--c:${teal}" title="${esc(name)}">
          ${pic ? `<img src="${esc(pic)}" alt="">` : podSvg(pct, low ? "var(--error-color,#db4437)" : teal)}
          <span class="t"><span class="n">${esc(name)}</span><span class="level${pct < Number(c.critical_threshold) ? " low" : ""}"><span style="width:${pct}%"></span></span>
          <span class="state${low ? "" : ""}" style="${low ? "color:var(--error-color,#db4437)" : ""}">${pct}%${on ? " · on" : ""}</span></span></div>`;
      }).join("");
      const status = active ? `Diffusing ${esc(h.states[active.name]?.state || "")}` : p.fragrance ? "Pura idle" : "";
      return `<div class="well roomrow">
        <div class="head">
          <button class="ticon${active || warmOn ? "" : " off"}" style="--c:${iconC}" data-a="nav" data-i="${i}" aria-label="${esc(r.name)}"><ha-icon icon="${esc(r.icon || "mdi:scent")}"></ha-icon></button>
          <span class="title" data-a="nav" data-i="${i}"><span class="pick" style="font-size:14px">${esc(r.name)}</span><span class="room">${status}</span></span>
          ${scentsy}
        </div>
        ${pods ? `<div class="pods" style="--n:${Math.max(1, bays.length)}">${pods}</div>` : ""}
      </div>`;
    }).join("");
    const state = [`${diffusing} diffusing`, c.show_scentsy === false ? "" : `${warming} warming`].filter(Boolean).join(" · ");
    const header = c.show_header === false ? "" : this._tile({ icon: c.icon, name: c.title, state, c: teal, off: !diffusing && !warming });
    return `<ha-card>${header}<div class="body"${header ? "" : ' style="padding-top:10px"'}>${rows}</div></ha-card>`;
  }

  _action(a, el) {
    const r = this._config.rooms?.[Number(el.dataset.i)];
    if (a === "nav" && r) return r.navigation_path ? this._navigate(r.navigation_path) : this._moreInfo(findPura(this._hass, r.pura_device_id).fragrance);
    return undefined;
  }
}

/* ------------------------------------------------------------------ todo-backed cards */

const TodoMixin = (Base) =>
  class extends Base {
    connectedCallback() {
      this._subscribe();
    }

    disconnectedCallback() {
      for (const u of Object.values(this._subs || {})) Promise.resolve(u).then((f) => f && f()).catch(() => {});
      this._subs = {};
    }

    set hass(hass) {
      const first = !this._hass;
      super.hass = hass;
      if (first || !this._subs || !Object.keys(this._subs).length) this._subscribe();
    }

    get hass() {
      return this._hass;
    }

    setConfig(config) {
      super.setConfig(config);
      this.disconnectedCallback();
      this._subscribe();
    }

    _lists() {
      const c = this._config;
      const out = [];
      if (c.pura_list) out.push({ id: "pura", entity: c.pura_list, name: c.pura_label || "Pura pods", unit: "pod", count_key: c.pura_count_key || "Pods", level_key: c.pura_level_key || "Pod level", c: color(c.pura_color, "var(--teal-color, #009688)") });
      if (c.scentsy_list) out.push({ id: "scentsy", entity: c.scentsy_list, name: c.scentsy_label || "Scentsy bars", unit: "bar", count_key: c.scentsy_count_key || "Bars", level_key: c.scentsy_level_key || "", c: color(c.scentsy_color, "var(--purple-color, #926bc7)") });
      return out;
    }

    _subscribe() {
      if (!this._hass?.connection || !this._config || !this.isConnected) return;
      this._subs ||= {};
      this._items ||= {};
      for (const l of this._lists()) {
        if (this._subs[l.entity]) continue;
        this._subs[l.entity] = this._hass.connection
          .subscribeMessage((msg) => {
            this._items[l.entity] = msg.items || [];
            this._render(true);
          }, { type: "todo/item/subscribe", entity_id: l.entity })
          .catch((err) => {
            delete this._subs[l.entity];
            this._error = err?.message || String(err);
            this._render(true);
          });
      }
    }

    /** Items still in stock, parsed. */
    _stock(l) {
      return (this._items?.[l.entity] || [])
        .filter((i) => i.status === "needs_action")
        .map((i) => {
          const f = parseDesc(i.description);
          const count = num(f[l.count_key], 1);
          const level = l.level_key && f[l.level_key] ? num(f[l.level_key], 100) : 100;
          const others = Object.entries(f).filter(([k, v]) => k !== l.count_key && /^(car refills|bricks|refills)$/i.test(k) && num(v) > 0).map(([k, v]) => `${num(v)} ${num(v) === 1 ? k.toLowerCase().replace(/s$/, "") : k.toLowerCase()}`);
          return { uid: i.uid, name: i.summary, desc: i.description || "", f, count, level, others, brand: f.Brand || "", family: f.Category || "Other", stars: stars(f.Stars), lastUsed: f["Last used"] || "", list: l };
        });
    }

    _remaining(it) {
      return it.count <= 0 ? 0 : it.count - 1 + it.level / 100;
    }
  };

/* ------------------------------------------------------------------ Stash */

class FragranceStashCard extends TodoMixin(FcBase) {
  static defaults() {
    return { pura_list: "todo.pura_pods", scentsy_list: "todo.scentsy_bars", show_totals: true, show_families: true, show_low: true, low_threshold: 0.75, max_low: 6, gloss: true };
  }

  static getStubConfig() {
    return { pura_list: "todo.pura_pods", scentsy_list: "todo.scentsy_bars" };
  }

  static getConfigForm() {
    return {
      schema: [
        { type: "grid", name: "", schema: [
          { name: "title", selector: { text: {} } },
          { name: "manage_path", selector: { text: {} } },
        ] },
        { type: "expandable", name: "", title: "Lists", flatten: true, schema: [
          { name: "pura_list", selector: { entity: { domain: "todo" } } },
          { name: "scentsy_list", selector: { entity: { domain: "todo" } } },
          { type: "grid", name: "", schema: [
            { name: "pura_color", selector: { ui_color: {} } },
            { name: "scentsy_color", selector: { ui_color: {} } },
            { name: "pura_count_key", selector: { text: {} } },
            { name: "scentsy_count_key", selector: { text: {} } },
          ] },
        ] },
        { type: "expandable", name: "", title: "Show", flatten: true, schema: [
          { type: "grid", name: "", schema: [
            { name: "show_totals", selector: { boolean: {} } },
            { name: "show_families", selector: { boolean: {} } },
            { name: "show_low", selector: { boolean: {} } },
            { name: "gloss", selector: { boolean: {} } },
            { name: "low_threshold", selector: { number: { min: 0, max: 5, step: 0.1, mode: "box" } } },
            { name: "max_low", selector: { number: { min: 1, max: 30, mode: "box" } } },
          ] },
        ] },
      ],
      computeLabel: (s) => LABELS[s.name] || titleCase(s.name),
      computeHelper: (s) => HELPERS[s.name],
    };
  }

  _localKey() {
    return JSON.stringify(Object.keys(this._items || {}).map((k) => (this._items[k] || []).length)) + (this._error || "");
  }

  _html() {
    const c = this._config;
    const lists = this._lists();
    if (this._error) return `<ha-card><div class="empty">${esc(this._error)}</div></ha-card>`;
    const stock = lists.map((l) => ({ l, items: this._stock(l) }));
    const scents = stock.reduce((n, s) => n + s.items.length, 0);
    const lowItems = stock.flatMap((s) => s.items.filter((it) => this._remaining(it) < Number(c.low_threshold)))
      .sort((a, b) => this._remaining(a) - this._remaining(b));
    const manage = c.manage_path ? `<button class="btn" data-a="manage">Manage</button>` : "";

    const parts = [];
    let body = "";
    if (c.show_totals !== false) {
      body += `<div class="grid2">${stock.map(({ l, items }) => {
        const total = items.reduce((n, it) => n + Math.max(0, it.count), 0);
        return `<div class="well stat" style="--c:${l.c}"><span class="k">${esc(l.name)}</span><span class="big">${total}</span><span class="muted">${items.length} scents</span></div>`;
      }).join("")}</div>`;
    }
    if (c.show_families !== false) {
      const fams = {};
      for (const { l, items } of stock) for (const it of items) (fams[it.family] ||= {})[l.id] = ((fams[it.family] || {})[l.id] || 0) + 1;
      const rows = Object.entries(fams).sort((a, b) => sum(b[1]) - sum(a[1]));
      const max = Math.max(1, ...rows.map(([, v]) => sum(v)));
      body += `<div class="row" style="justify-content:space-between"><b style="font-size:13px;font-weight:600">By family</b><span class="row">${lists.map((l) => `<span class="legend" style="--c:${l.c}"><i></i>${esc(l.name.split(" ")[0])}</span>`).join("")}</span></div>`;
      body += rows.map(([name, v]) => `<div class="fam"><span>${esc(name)}</span>
        <div class="bar well">${lists.map((l) => `<span style="--c:${l.c};width:${((v[l.id] || 0) / max) * 100}%"></span>`).join("")}</div>
        <span class="l">${lists.map((l) => v[l.id] || 0).join(" · ")}</span></div>`).join("");
    }
    parts.push(`<ha-card>${this._tile({ icon: c.icon || "mdi:package-variant-closed", name: c.title || "Stash", c: color(c.color, "var(--teal-color, #009688)"),
      state: `${scents} scents${c.show_low !== false ? ` · ${lowItems.length} running low` : ""}`, iconAction: c.manage_path ? "manage" : "", trailing: manage })}
      <div class="body">${body}</div></ha-card>`);

    if (c.show_low !== false && lowItems.length) {
      const rows = lowItems.slice(0, Number(c.max_low) || 6).map((it) => {
        const why = it.count <= 0 ? (it.others.length ? `only ${it.others.join(", ")}` : "none left") : it.level < 100 ? `last ${it.list.unit}, ${Math.round(it.level)}%` : `last ${it.list.unit}`;
        return `<div class="well row" style="padding:8px 10px;flex-wrap:nowrap"><span class="dot" style="--c:${it.list.c}"></span>
          <span class="info"><span class="name" style="font-size:13px">${esc(it.name)}</span><span class="state">${esc([it.brand, it.list.name].filter(Boolean).join(" · "))}</span></span>
          <span class="muted" style="color:var(--error-color,#db4437);text-align:right">${esc(why)}</span></div>`;
      }).join("");
      parts.push(`<ha-card>${this._tile({ icon: "mdi:alert-outline", name: "Running low", state: "Last pods and empty bars", c: "var(--deep-orange-color,#ff6f22)" })}<div class="body">${rows}</div></ha-card>`);
    }
    return `<div class="stack">${parts.join("")}</div>`;
  }

  _action(a) {
    if (a === "manage") this._navigate(this._config.manage_path);
  }
}

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

/* ------------------------------------------------------------------ Inventory */

class FragranceInventoryCard extends TodoMixin(FcBase) {
  static defaults() {
    return { pura_list: "todo.pura_pods", scentsy_list: "todo.scentsy_bars", show_search: true, show_families: true, show_add: true, sort: "family", max_items: 50, gloss: true };
  }

  static getStubConfig() {
    return { pura_list: "todo.pura_pods", scentsy_list: "todo.scentsy_bars" };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { type: "expandable", name: "", title: "Lists", flatten: true, schema: [
          { name: "pura_list", selector: { entity: { domain: "todo" } } },
          { name: "scentsy_list", selector: { entity: { domain: "todo" } } },
          { type: "grid", name: "", schema: [
            { name: "pura_color", selector: { ui_color: {} } },
            { name: "scentsy_color", selector: { ui_color: {} } },
            { name: "pura_count_key", selector: { text: {} } },
            { name: "scentsy_count_key", selector: { text: {} } },
            { name: "pura_level_key", selector: { text: {} } },
          ] },
        ] },
        { type: "expandable", name: "", title: "Show", flatten: true, schema: [
          { type: "grid", name: "", schema: [
            { name: "show_search", selector: { boolean: {} } },
            { name: "show_families", selector: { boolean: {} } },
            { name: "show_add", selector: { boolean: {} } },
            { name: "gloss", selector: { boolean: {} } },
            { name: "sort", selector: { select: { mode: "dropdown", options: [
              { value: "family", label: "Family, then name" }, { value: "name", label: "Name" }, { value: "count", label: "Fewest first" }, { value: "stars", label: "Best rated first" },
            ] } } },
            { name: "max_items", selector: { number: { min: 5, max: 500, mode: "box" } } },
          ] },
        ] },
      ],
      computeLabel: (s) => LABELS[s.name] || titleCase(s.name),
      computeHelper: (s) => HELPERS[s.name],
    };
  }

  getCardSize() {
    return 10;
  }

  _localKey() {
    return [this._tab, this._q, this._fam, this._open, this._adding, JSON.stringify(Object.values(this._items || {}).map((v) => v.map((i) => i.summary + i.description + i.status).join("|"))), this._error].join("#");
  }

  _currentList() {
    const lists = this._lists();
    return lists.find((l) => l.id === this._tab) || lists[0];
  }

  _html() {
    const c = this._config;
    if (this._error) return `<ha-card><div class="empty">${esc(this._error)}</div></ha-card>`;
    const lists = this._lists();
    const l = this._currentList();
    if (!l) return `<ha-card><div class="empty">Pick a todo list in the card settings.</div></ha-card>`;
    const all = this._stock(l);
    const fams = {};
    for (const it of all) fams[it.family] = (fams[it.family] || 0) + 1;
    const q = (this._q || "").toLowerCase();
    let items = all.filter((it) => (!this._fam || it.family === this._fam) && (!q || `${it.name} ${it.brand} ${it.f.Notes || ""}`.toLowerCase().includes(q)));
    const sorts = {
      name: (a, b) => a.name.localeCompare(b.name),
      family: (a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name),
      count: (a, b) => this._remaining(a) - this._remaining(b) || a.name.localeCompare(b.name),
      stars: (a, b) => b.stars - a.stars || a.name.localeCompare(b.name),
    };
    items.sort(sorts[c.sort] || sorts.family);
    const shown = items.slice(0, Number(c.max_items) || 50);

    const tabs = lists.length > 1
      ? `<div class="tabs well" role="tablist" style="--n:${lists.length}">${lists.map((x) => `<button class="tab${x.id === l.id ? " btn" : ""}" role="tab" aria-selected="${x.id === l.id}" data-a="tab" data-tab="${x.id}">${esc(x.name)} · ${this._stock(x).length}</button>`).join("")}</div>`
      : "";
    const search = c.show_search !== false
      ? `<label class="well search"><ha-icon icon="mdi:magnify" style="--mdc-icon-size:18px;color:var(--secondary-text-color)"></ha-icon><input type="search" placeholder="Search scents, brands or notes" value="${esc(this._q || "")}" data-live="search" aria-label="Search"></label>`
      : "";
    const chips = c.show_families !== false
      ? `<div class="row">${[["", "All", all.length], ...Object.entries(fams).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, k, v])]
          .map(([k, label, n]) => `<button class="btn small${(this._fam || "") === k ? " on" : ""}" style="--c:${l.c}" aria-pressed="${(this._fam || "") === k}" data-a="fam" data-fam="${esc(k)}">${esc(label)} ${n}</button>`).join("")}</div>`
      : "";
    const add = this._adding
      ? `<div class="well row" style="padding:8px">
          <input type="text" class="well" style="flex:2 1 160px" placeholder="Scent name" data-live="add-name" data-enter="add-save" aria-label="Scent name">
          <input type="text" class="well" style="flex:1 1 90px" placeholder="Brand" data-live="add-brand" data-enter="add-save" aria-label="Brand">
          <select class="well" style="flex:1 1 100px" data-live="add-family" aria-label="Family">${Object.keys(fams).sort().map((k) => `<option>${esc(k)}</option>`).join("")}<option>Other</option></select>
          <button class="btn on" style="--c:${l.c}" data-a="add-save">Add</button><button class="btn" data-a="add-cancel">Cancel</button></div>`
      : "";

    const rows = shown.map((it) => {
      const open = this._open === it.uid;
      const meta = [it.brand, it.stars ? "★".repeat(it.stars) : "", it.level < 100 ? `open ${Math.round(it.level)}%` : "", it.count <= 0 && it.others.length ? it.others.join(", ") : ""].filter(Boolean).join(" · ");
      const detail = open
        ? `<div style="display:flex;flex-direction:column;gap:6px;padding:0 2px 2px">
            ${it.f.Notes ? `<span class="state wrap" style="color:var(--primary-text-color)">${esc(it.f.Notes)}</span>` : ""}
            ${it.f.Feels ? `<span class="state wrap">${esc(it.f.Feels)}</span>` : ""}
            <span class="muted">${esc([it.family, it.lastUsed && it.lastUsed !== "unknown" ? `last used ${it.lastUsed}` : ""].filter(Boolean).join(" · "))}</span>
            <div class="row"><span style="flex:1">${[1, 2, 3, 4, 5].map((n) => `<button class="starbtn${n <= it.stars ? " on" : ""}" data-a="rate" data-uid="${it.uid}" data-n="${n}" aria-label="Rate ${n} of 5">★</button>`).join("")}</span>
            <button class="btn" style="color:var(--error-color,#db4437)" data-a="used" data-uid="${it.uid}">Used one up</button></div></div>`
        : "";
      return `<div class="well item"><div class="top">
          <span class="dot" style="--c:${l.c}"></span>
          <span class="t" data-a="open" data-uid="${it.uid}" role="button" tabindex="0" aria-expanded="${open}"><span class="n">${esc(it.name)}</span><span class="state">${esc(meta || it.family)}</span></span>
          <div class="row" style="flex-wrap:nowrap;gap:4px" role="group" aria-label="${esc(it.name)} count">
            <button class="btn round" style="width:34px;height:34px;min-height:34px" data-a="dec" data-uid="${it.uid}" aria-label="One fewer">−</button>
            <span class="count">${it.count}</span>
            <button class="btn round" style="width:34px;height:34px;min-height:34px" data-a="inc" data-uid="${it.uid}" aria-label="One more">+</button>
          </div></div>${detail}</div>`;
    }).join("");

    const more = items.length > shown.length ? `<div class="empty">${items.length - shown.length} more; search or pick a family to narrow it down.</div>` : "";
    const addBtn = c.show_add !== false && !this._adding ? `<button class="btn on" style="--c:${l.c}" data-a="add">+ Add</button>` : "";

    return `<ha-card>
      ${this._tile({ icon: c.icon || "mdi:bottle-tonic-outline", name: c.title || "Inventory", c: l.c, state: `${esc(l.name)}${this._fam ? " · " + esc(this._fam) : ""} · ${items.length} scents`, iconAction: "list-info", trailing: addBtn })}
      <div class="body">${tabs}${add}${search}${chips}${rows || `<div class="empty">Nothing matches.</div>`}${more}</div></ha-card>`;
  }

  _live(kind, el) {
    if (kind === "search") {
      this._q = el.value;
      const pos = el.selectionStart;
      this._render(true);
      const input = this.shadowRoot.querySelector('input[data-live="search"]');
      if (input) {
        input.focus();
        try { input.setSelectionRange(pos, pos); } catch (e) { /* not supported */ }
      }
    } else if (kind.startsWith("add-")) {
      (this._draft ||= {})[kind.slice(4)] = el.value;
    }
  }

  _find(uid) {
    return this._stock(this._currentList()).find((it) => it.uid === uid);
  }

  _update(it, changes, status) {
    const data = { item: it.uid, description: setFields(it.desc, changes) };
    if (status) data.status = status;
    return this._hass.callService("todo", "update_item", data, { entity_id: it.list.entity }).catch((err) => this._toast(err?.message || String(err)));
  }

  _action(a, el) {
    const l = this._currentList();
    if (a === "tab") { this._tab = el.dataset.tab; this._fam = ""; this._open = ""; return this._render(true); }
    if (a === "fam") { this._fam = el.dataset.fam; return this._render(true); }
    if (a === "open") { this._open = this._open === el.dataset.uid ? "" : el.dataset.uid; return this._render(true); }
    if (a === "list-info") return this._moreInfo(l?.entity);
    if (a === "add") { this._adding = true; this._draft = {}; this._render(true); return this.shadowRoot.querySelector('[data-live="add-name"]')?.focus(); }
    if (a === "add-cancel") { this._adding = false; return this._render(true); }
    if (a === "add-save") {
      const d = this._draft || {};
      const fam = d.family || this.shadowRoot.querySelector('[data-live="add-family"]')?.value || "Other";
      if (!d.name?.trim()) return this._toast("Enter a scent name first.");
      const lines = [d.brand ? `Brand: ${d.brand.trim()}` : "", `Category: ${fam}`, `${l.count_key}: 1`, l.level_key ? `${l.level_key}: 100%` : "", "Stars: unrated", "Last used: unknown"].filter(Boolean);
      this._adding = false;
      this._render(true);
      return this._hass.callService("todo", "add_item", { item: d.name.trim(), description: lines.join("\n") }, { entity_id: l.entity }).catch((err) => this._toast(err?.message || String(err)));
    }
    const it = el.dataset.uid ? this._find(el.dataset.uid) : null;
    if (!it) return undefined;
    if (a === "inc") return this._update(it, { [l.count_key]: String(it.count + 1) });
    if (a === "dec") return this._update(it, { [l.count_key]: String(Math.max(0, it.count - 1)) });
    if (a === "rate") return this._update(it, { Stars: `${el.dataset.n}/5` });
    if (a === "used") {
      const left = Math.max(0, it.count - 1);
      const changes = { [l.count_key]: String(left) };
      if (l.level_key && it.f[l.level_key] !== undefined) changes[l.level_key] = "100%";
      const done = left === 0 && !it.others.length;
      if (done) this._toast(`${it.name} is used up and checked off the list.`);
      return this._update(it, changes, done ? "completed" : undefined);
    }
    return undefined;
  }

  _keydown(ev) {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.('[data-a="open"]')) {
      ev.preventDefault();
      return this._action("open", ev.target);
    }
    return super._keydown(ev);
  }
}

/* ------------------------------------------------------------------ editor labels */

const LABELS = {
  device_id: "Pura diffuser", pura_device_id: "Pura diffuser", name: "Name", icon: "Icon", color: "Accent color",
  show_intensity: "Intensity slider", show_auto_alternate: "Auto-alternate button", show_nightlight: "Nightlight button",
  show_power: "Power button", show_pod_images: "Pod pictures", compact_when_off: "Hide controls while off", gloss: "Glossy buttons",
  low_threshold: "Running low below", title: "Title", title_icon: "Title icon", suggestion_entity: "Suggestion",
  scores_entity: "Top scores", refresh_entity: "Refresh button", show_suggestion: "Show today's pick", show_scores: "Show next picks",
  pura_name: "Pura tile name", show_pura: "Show Pura", scentsy_entity: "Scentsy bar picker", warmers: "Warmers",
  scentsy_name: "Scentsy tile name", scentsy_color: "Scentsy color", show_scentsy: "Show Scentsy", warmer_columns: "Warmer columns",
  entities: "Extra tiles (lights, switches)", manage_path: "Manage button opens", pura_list: "Pura pods list", scentsy_list: "Scentsy bars list",
  pura_color: "Pura color", pura_count_key: "Pura count field", scentsy_count_key: "Scentsy count field", pura_level_key: "Open pod level field",
  show_totals: "Totals", show_families: "Families", show_low: "Running low", max_low: "Running low rows", show_search: "Search",
  show_add: "Add button", sort: "Sort", max_items: "Rows shown",
  summary_entity: "Whole-home summary", rooms: "Rooms", show_updated: "Updated time", show_reason: "Why", show_start: "Start buttons",
  max_scores: "Runner-ups shown", critical_threshold: "Red below", show_header: "Header",
};

const HELPERS = {
  low_threshold: "Pura Mini: slot % that shows red. Stash: flag scents with less than this many left; an open pod at 52% counts as 0.52.",
  manage_path: "A dashboard path, e.g. /lovelace/fragrance",
  pura_count_key: "The line in each item's description that holds the count, e.g. Pods",
  scentsy_count_key: "e.g. Bars",
  pura_level_key: "e.g. Pod level",
  suggestion_entity: "Text like \"Pura: slot 1 Simmered Cider, medium (68) — reason\" or \"Scentsy: Stargazing (65) — reason\"",
  entities: "Shown as tiles under the card, with a brightness slider for dimmable lights.",
  refresh_entity: "Pressed by Regenerate (tap twice to confirm).",
  rooms: "Each room: its suggestion, Pura diffuser and Scentsy picker.",
};

/* ------------------------------------------------------------------ register */

const CARDS = [
  ["pura-mini-card", PuraMiniCard, "Pura Mini", "One Pura diffuser: pods with pictures, intensity slider and toggles."],
  ["room-fragrance-card", RoomFragranceCard, "Room Fragrance", "Today's pick, Pura, Scentsy warmers and extra tiles for one room."],
  ["fragrance-picks-card", FragrancePicksCard, "Fragrance Picks", "Today's suggested scent for each room, with Start and Regenerate."],
  ["fragrance-loaded-card", FragranceLoadedCard, "Fragrance Loaded", "What's loaded in each room: Pura pods with levels, and the Scentsy bar."],
  ["fragrance-stash-card", FragranceStashCard, "Fragrance Stash", "What's on the shelf from your todo lists: totals, families, running low."],
  ["fragrance-inventory-card", FragranceInventoryCard, "Fragrance Inventory", "Manage pods and bars in your todo lists: counts, ratings, used up, add."],
];

window.customCards = window.customCards || [];
for (const [tag, cls, name, description] of CARDS) {
  if (!customElements.get(tag)) customElements.define(tag, cls);
  if (!window.customCards.some((c) => c.type === tag)) {
    window.customCards.push({ type: tag, name, description, preview: false, documentationURL: "https://github.com/9retirement6irk/homeassistant_cards" });
  }
}

console.info(`%c FRAGRANCE-CARDS %c ${VERSION} `, "color:#fff;background:#009688;font-weight:700", "color:#009688;background:#fff");

export { parseDesc, setFields, parseSuggestion, findPura };
