/* גלי השרון — PWA. Live Open-Meteo forecast fetched on the phone, scored per board by engine.js.
 * Boards and settings live in localStorage on this device. */
(function () {
  "use strict";
  var E = window.SurfEngine;
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem("gs." + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("gs." + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  var DEFAULT_BOARDS = [{ id: "mango", name: "PIKO Mango", type: "fish", volumeL: 40, fins: "twin", active: true, createdAt: "2026-09-28T16:00:00Z" }];
  var DEFAULT_SETTINGS = { weightKg: 72, skill: "int_adv", homeSpot: "sdot_yam", windows: ["dawn", "midday", "afternoon"] };
  var state = {
    forecast: LS.get("forecast", null), boards: LS.get("boards", null) || DEFAULT_BOARDS,
    settings: Object.assign({}, DEFAULT_SETTINGS, LS.get("settings", {})),
    boardId: LS.get("boardId", null), date: null, open: {}, editing: null, loading: false, error: null, confirmDel: null
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function col(key) { return "var(--r-" + key + ")"; }
  function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 2600); }
  function localToday() { try { return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).slice(0, 10); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function addDays(d, n) { return new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10); }
  function fmt(x, d) { return x == null ? "–" : Number(x).toFixed(d == null ? 1 : d); }
  function rider() { return { weightKg: state.settings.weightKg, skill: state.settings.skill }; }
  function boardsSorted() { return state.boards.slice().sort(function (a, b) { return (a.createdAt || "").localeCompare(b.createdAt || ""); }); }
  function currentBoard() { var bs = boardsSorted(); return bs.find(function (b) { return b.id === state.boardId; }) || bs[0] || null; }
  function arrowSvg(deg, title) {
    return '<svg class="arrow" viewBox="0 0 16 16" aria-label="' + esc(title) + '"><g transform="rotate(' + ((deg + 180) % 360) + ' 8 8)"><path d="M8 1 L12 9 L8.9 8.2 L8.9 15 L7.1 15 L7.1 8.2 L4 9 Z" fill="currentColor"/></g></svg>';
  }

  /* ---------- data: Open-Meteo, straight from the phone ---------- */
  var MARINE = "wave_height,wave_direction,wave_period,wave_peak_period,swell_wave_height,swell_wave_direction,swell_wave_peak_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period,wind_wave_height,wind_wave_direction,wind_wave_peak_period,sea_surface_temperature";
  var WX = "wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation";
  async function fetchForecast() {
    var ids = Object.keys(E.ZONES), Z = ids.map(function (k) { return E.ZONES[k]; });
    var mUrl = "https://marine-api.open-meteo.com/v1/marine?latitude=" + Z.map(function (z) { return z.lat; }).join(",") + "&longitude=" + Z.map(function (z) { return z.lon; }).join(",") +
      "&hourly=" + MARINE + "&timezone=Asia%2FJerusalem&forecast_days=7&cell_selection=sea";
    var wUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + Z.map(function (z) { return z.windLat; }).join(",") + "&longitude=" + Z.map(function (z) { return z.windLon; }).join(",") +
      "&hourly=" + WX + "&daily=sunrise,sunset&wind_speed_unit=kn&timezone=Asia%2FJerusalem&forecast_days=7&past_days=2";
    var res = await Promise.all([fetch(mUrl), fetch(wUrl)]);
    if (!res[0].ok || !res[1].ok) throw new Error("HTTP " + res[0].status + "/" + res[1].status);
    var marine = await res[0].json(), wx = await res[1].json();
    if (!Array.isArray(marine)) marine = [marine]; if (!Array.isArray(wx)) wx = [wx];
    var today = localToday(), zones = {};
    ids.forEach(function (id, n) {
      var H = marine[n].hourly, W = wx[n].hourly, wi = {};
      W.time.forEach(function (t, i) { wi[t] = i; });
      var pick = function (a, i) { return a && a[i] !== undefined ? a[i] : null; };
      var r = { t: [], hs: [], tp: [], dir: [], swH: [], swT: [], swD: [], s2H: [], s2T: [], s2D: [], wwH: [], wwT: [], wwD: [], wind: [], gust: [], wdir: [], sst: [] };
      H.time.forEach(function (t, i) {
        if (t.slice(0, 10) < today) return;
        var j = wi[t];
        r.t.push(t); r.hs.push(pick(H.wave_height, i)); r.tp.push(pick(H.wave_peak_period, i) != null ? H.wave_peak_period[i] : pick(H.wave_period, i)); r.dir.push(pick(H.wave_direction, i));
        r.swH.push(pick(H.swell_wave_height, i)); r.swT.push(pick(H.swell_wave_peak_period, i)); r.swD.push(pick(H.swell_wave_direction, i));
        r.s2H.push(pick(H.secondary_swell_wave_height, i)); r.s2T.push(pick(H.secondary_swell_wave_period, i)); r.s2D.push(pick(H.secondary_swell_wave_direction, i));
        r.wwH.push(pick(H.wind_wave_height, i)); r.wwT.push(pick(H.wind_wave_peak_period, i)); r.wwD.push(pick(H.wind_wave_direction, i));
        r.sst.push(pick(H.sea_surface_temperature, i));
        r.wind.push(j === undefined ? null : W.wind_speed_10m[j]); r.gust.push(j === undefined ? null : W.wind_gusts_10m[j]); r.wdir.push(j === undefined ? null : W.wind_direction_10m[j]);
      });
      var rain48 = wx[n].daily.time.map(function (d) {
        var end = Date.parse(d + "T12:00:00Z"), start = end - 48 * 3600e3, s = 0;
        W.time.forEach(function (t, k) { var x = Date.parse(t + ":00Z"); if (x >= start && x < end) s += W.precipitation[k] || 0; });
        return Math.round(s * 10) / 10;
      });
      r.daily = { date: wx[n].daily.time, sunrise: wx[n].daily.sunrise, sunset: wx[n].daily.sunset, rain48: rain48 };
      if (!r.hs.some(function (v) { return v !== null; })) throw new Error("אין נתוני גלים לאזור " + E.ZONES[id].nameHe);
      zones[id] = r;
    });
    return { generatedAt: new Date().toISOString(), source: "Open-Meteo", resolution: "hourly", zones: zones };
  }
  async function refresh(force) {
    if (state.loading) return;
    var age = state.forecast ? Date.now() - Date.parse(state.forecast.generatedAt) : Infinity;
    if (!force && age < 45 * 60e3) return;
    state.loading = true; state.error = null; renderFresh();
    try { state.forecast = await fetchForecast(); LS.set("forecast", state.forecast); if (force) toast("התחזית עודכנה"); }
    catch (e) { state.error = navigator.onLine === false ? "אין חיבור – מוצגת התחזית האחרונה" : "העדכון נכשל – מוצגת התחזית האחרונה"; }
    state.loading = false; render();
  }

  /* ---------- rendering ---------- */
  function renderFresh() {
    var f = state.forecast, el = $("fresh"), bits = [];
    if (f) {
      var t = new Date(f.generatedAt);
      bits.push('<span class="chip">עודכן ' + esc(t.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit" })) + '</span>');
    }
    if (state.error) bits.push('<span class="chip" style="color:var(--neg)">' + esc(state.error) + '</span>');
    bits.push('<button class="btn sm ghost" id="refreshBtn" type="button"' + (state.loading ? " disabled" : "") + '>' + (state.loading ? '<span class="spin"></span> מעדכן' : "רענן") + '</button>');
    el.innerHTML = bits.join("");
    var rb = $("refreshBtn"); if (rb) rb.onclick = function () { refresh(true); };
  }
  function renderBoardBar() {
    var bs = boardsSorted(), cur = currentBoard(), el = $("boardBar");
    if (!bs.length) { el.innerHTML = '<span class="hint">אין גלשנים – הוסף גלשן בלשונית "גלשנים והגדרות".</span>'; return; }
    el.innerHTML = bs.map(function (b) {
      var p = E.boardProfile(b, rider());
      return '<button type="button" class="seg" data-b="' + esc(b.id) + '" aria-pressed="' + (cur && cur.id === b.id) + '"><b>' + esc(b.name || p.typeHe) + '</b><span>' + esc(p.typeHe) + '</span></button>';
    }).join("");
    el.querySelectorAll("[data-b]").forEach(function (n) { n.onclick = function () { state.boardId = n.dataset.b; LS.set("boardId", state.boardId); render(); }; });
  }
  function dates() {
    var f = state.forecast; if (!f) return [];
    var z = f.zones[Object.keys(f.zones)[0]], set = {};
    z.t.forEach(function (t) { set[t.slice(0, 10)] = 1; });
    var today = localToday();
    return Object.keys(set).filter(function (d) { return d >= today; }).sort().slice(0, 7);
  }
  function dayResults(date) {
    var b = currentBoard(); if (!b || !state.forecast) return [];
    var prof = E.boardProfile(b, rider());
    return E.SPOTS.map(function (sp) { return E.scoreDay(sp, state.forecast, date, prof, state.settings.windows); })
      .filter(function (d) { return d && d.hours.length; })
      .sort(function (a, b) { return (b.best ? b.best.score : 0) - (a.best ? a.best.score : 0); });
  }
  function renderDayBar() {
    var ds = dates(), el = $("dayBar"), today = localToday(), nowH = new Date().toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", hour: "2-digit", hour12: false }) | 0;
    if (!state.date || ds.indexOf(state.date) < 0) state.date = nowH >= 17 && ds.indexOf(addDays(today, 1)) >= 0 ? addDays(today, 1) : ds[0];
    el.innerHTML = ds.map(function (d) {
      var res = dayResults(d), top = res[0] && res[0].best;
      var nm = d === today ? "היום" : d === addDays(today, 1) ? "מחר" : E.dayHe(d).replace("יום ", "");
      return '<button type="button" class="seg" data-d="' + d + '" aria-pressed="' + (d === state.date) + '"><b>' + nm + '</b><span class="mono">' + (top ? top.score.toFixed(1) : "–") + '</span><i class="dot" style="background:' + (top ? col(top.label.key) : "var(--line)") + '"></i></button>';
    }).join("");
    el.querySelectorAll("[data-d]").forEach(function (n) { n.onclick = function () { state.date = n.dataset.d; render(); }; });
  }
  function meter(key) {
    return '<div class="meter" aria-hidden="true">' + ["vpoor", "poor", "ptf", "fair", "ftg", "good", "epic"].map(function (k) { return '<i style="background:' + col(k) + ';opacity:' + (k === key ? 1 : .18) + '"></i>'; }).join("") + '</div>';
  }
  function renderHero(res) {
    var el = $("hero"), b = currentBoard();
    if (!state.forecast) { el.innerHTML = '<div class="empty">' + (state.loading ? "טוען תחזית…" : "אין תחזית עדיין. לחץ רענן כשיש חיבור.") + '</div>'; return; }
    if (!b) { el.innerHTML = '<div class="empty">הוסף גלשן כדי לקבל דירוג.</div>'; return; }
    var top = res[0]; if (!top || !top.best) { el.innerHTML = '<div class="empty">אין שעות אור עם נתונים ביום הזה.</div>'; return; }
    var best = top.best, prof = E.boardProfile(b, rider());
    var rs = E.reasons(best.from, prof).map(function (x) { return '<li class="' + x.k + '">' + esc(x.t) + '</li>'; });
    var ws = E.wetsuit(top.sst); if (ws) rs.push('<li class="info">מים ' + Math.round(top.sst) + '° – ' + esc(ws) + '</li>');
    if (top.rain48 != null && top.rain48 > 10) rs.push('<li class="warn">ירדו ' + Math.round(top.rain48) + ' מ"מ גשם ב-48 שעות – הימנע משפכי נחלים (פולג, אלכסנדר, חדרה)</li>');
    el.innerHTML = '<div class="hero">' + meter(best.label.key) +
      '<div class="hero-main"><div class="score" style="color:' + col(best.label.key) + '">' + best.score.toFixed(1) + '<small>/10</small></div>' +
      '<div><span class="rating-pill" style="background:' + col(best.label.key) + '">' + esc(best.label.he) + '<small>' + best.label.en + '</small></span>' +
      '<h2>' + esc(top.spot.nameHe) + '</h2><div class="when">' + esc(E.dayHe(state.date)) + ' · <bdi class="mono">' + E.hm(best.from.hour) + '–' + E.hm(best.to.hour + 1) + '</bdi><br>' + esc(b.name || prof.typeHe) + '</div></div></div>' +
      '<ul class="reasons">' + rs.join("") + '</ul></div>';
  }
  function renderSpots(res) {
    var el = $("spots");
    if (!res.length) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="label-row"><span class="eyebrow">כל החופים · ' + esc(E.dayHe(state.date)) + '</span><span class="hint">עמודה = שעה · גובה = גלים · צבע = ציון</span></div>' +
      res.map(function (d) {
        var best = d.best, key = best ? best.label.key : "flat", open = !!state.open[d.spot.id], sp = d.spot;
        var strip = d.hours.map(function (h) {
          var inBest = best && (h === best.from || h === best.to);
          return '<i class="c" style="height:' + Math.max(6, Math.min(100, h.h / 2 * 100)) + '%;background:' + col(h.label.key) + ';opacity:' + (inBest ? 1 : .72) + '"></i>';
        }).join("");
        var rows = d.hours.map(function (h) {
          return '<tr><td class="mono">' + E.hm(h.hour) + '</td><td class="mono">' + fmt(h.lo) + '–' + fmt(h.hi) + '</td><td class="mono">' + Math.round(h.tp) + 's</td><td>' + (h.dir != null ? arrowSvg(h.dir, E.compass(h.dir)) + ' ' + E.compassHe(h.dir) : "–") + '</td>' +
            '<td>' + (h.wind != null ? arrowSvg(h.wdir, E.compass(h.wdir)) + ' <span class="mono">' + Math.round(h.wind) + (h.gust != null && h.gust > h.wind + 3 ? '-' + Math.round(h.gust) : '') + '</span> ' + E.windTypeHe(h.rel) : "–") + '</td>' +
            '<td class="s mono" style="background:' + col(h.label.key) + '">' + h.score.toFixed(1) + '</td></tr>';
        }).join("");
        var first = d.hours[0], last = d.hours[d.hours.length - 1];
        return '<article class="spot"><button type="button" class="spot-head" data-s="' + sp.id + '" aria-expanded="' + open + '">' +
          '<span class="stripe" style="background:' + col(key) + '"></span>' +
          '<span class="info"><span class="name">' + esc(sp.nameHe) + '</span><span class="meta">' + (best ? ('הכי טוב <bdi>' + E.hm(best.from.hour) + '–' + E.hm(best.to.hour + 1) + '</bdi> · ' + fmt(best.from.lo) + '–' + fmt(best.from.hi) + ' מ\' · ' + E.windTypeHe(best.from.rel == null ? 90 : best.from.rel)) : '–') + '</span></span>' +
          '<span class="sc"><b style="color:' + col(key) + '">' + (best ? best.score.toFixed(1) : "–") + '</b><span style="color:' + col(key) + '">' + (best ? esc(best.label.he) : "") + '</span></span></button>' +
          '<div class="strip" aria-hidden="true">' + strip + '</div><div class="strip-axis mono"><span>' + E.hm(first.hour) + '</span><span>' + E.hm(last.hour) + '</span></div>' +
          (open ? '<div class="detail"><div class="tbl-wrap"><table><thead><tr><th>שעה</th><th>גלים (מ\')</th><th>מחזור</th><th>כיוון גל</th><th>רוח (קשר)</th><th>ציון</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<dl class="spotnotes"><dt>קרקעית</dt><dd>' + esc(sp.bottom) + '</dd><dt>רמה</dt><dd>' + esc(sp.level) + '</dd><dt>אופי</dt><dd>' + esc(sp.notes) + '</dd><dt>סכנות</dt><dd>' + esc(sp.hazards) + '</dd>' +
            '<dt>נסגר מ-</dt><dd class="mono">~' + sp.closeout + ' מ\'</dd></dl>' +
            '<div class="small"><a href="https://www.surfline.com/surf-report/' + esc(sp.slSlug || "spot") + '/' + esc(sp.surfline) + '" target="_blank" rel="noopener">פתח ב-Surfline</a></div></div>' : '') +
          '</article>';
      }).join("");
    el.querySelectorAll("[data-s]").forEach(function (n) { n.onclick = function () { state.open[n.dataset.s] = !state.open[n.dataset.s]; renderSpots(res); }; });
  }
  function windowBar(p) {
    var pct = function (v) { return Math.max(0, Math.min(100, v / 3 * 100)); };
    return '<div class="window"><span class="ok" style="right:' + pct(p.min) + '%;width:' + (pct(p.max) - pct(p.min)) + '%"></span><span class="opt" style="right:' + pct(p.opt[0]) + '%;width:' + (pct(p.opt[1]) - pct(p.opt[0])) + '%"></span></div>' +
      '<div class="window-ax mono"><span>0</span><span>1</span><span>2</span><span>3 מ\'</span></div>';
  }
  function lenTxt(b) { if (!b.lengthFt) return ""; var ft = Math.floor(b.lengthFt + 1e-6), inch = Math.round((b.lengthFt - ft) * 12); return ft + "'" + inch + '"'; }
  function renderBoards() {
    var el = $("boardList");
    el.innerHTML = boardsSorted().map(function (b) {
      var p = E.boardProfile(b, rider());
      var dims = [lenTxt(b), b.widthIn ? b.widthIn + '"' : "", b.thicknessIn ? b.thicknessIn + '"' : ""].filter(Boolean).join(" × ");
      var vol = p.volume ? (p.volume.toFixed(1) + " ל'" + (p.volumeEstimated ? " (הערכה)" : "")) : "נפח לא ידוע";
      return '<div class="board' + (b.active === false ? ' off' : '') + '"><h3>' + esc(b.name || p.typeHe) + '</h3>' +
        '<div class="small muted">' + esc(p.typeHe) + (dims ? ' · <span class="mono">' + esc(dims) + '</span>' : '') + ' · ' + esc(vol) + (p.gf ? ' · יחס נפח/משקל <span class="mono">' + p.gf.toFixed(2) + '</span>' : '') + '</div>' +
        '<div class="range">אופטימום <b class="mono">' + fmt(p.opt[0]) + '–' + fmt(p.opt[1]) + '</b> מ\' · עובד <span class="mono">' + fmt(p.min) + '–' + fmt(p.max) + '</span></div>' + windowBar(p) +
        '<div class="acts"><button type="button" class="btn sm ghost" data-edit="' + esc(b.id) + '">עריכה</button><button type="button" class="btn sm ghost" data-del="' + esc(b.id) + '">' + (state.confirmDel === b.id ? 'בטוח? מחק' : 'מחק') + '</button></div></div>';
    }).join("") || '<p class="hint">עוד אין גלשנים.</p>';
    el.querySelectorAll("[data-edit]").forEach(function (n) { n.onclick = function () { openForm(state.boards.find(function (b) { return b.id === n.dataset.edit; })); }; });
    el.querySelectorAll("[data-del]").forEach(function (n) {
      n.onclick = function () {
        if (state.confirmDel === n.dataset.del) { state.boards = state.boards.filter(function (b) { return b.id !== n.dataset.del; }); state.confirmDel = null; LS.set("boards", state.boards); toast("הגלשן נמחק"); render(); }
        else { state.confirmDel = n.dataset.del; renderBoards(); }
      };
    });
  }
  function renderSettings() {
    var s = state.settings;
    if (document.activeElement !== $("st-weight")) $("st-weight").value = s.weightKg || "";
    $("st-skill").value = s.skill; $("st-home").value = s.homeSpot;
    $("st-windows").innerHTML = Object.keys(E.WINDOWS).map(function (k) { return '<label><input type="checkbox" id="st-w-' + k + '" data-w="' + k + '"' + (s.windows.indexOf(k) >= 0 ? " checked" : "") + '> ' + E.WINDOWS[k].he + '</label>'; }).join("");
    $("st-windows").querySelectorAll("[data-w]").forEach(function (n) {
      n.onchange = function () {
        var w = [].slice.call($("st-windows").querySelectorAll("[data-w]:checked")).map(function (x) { return x.dataset.w; });
        if (!w.length) { n.checked = true; return; } saveSettings({ windows: w });
      };
    });
  }
  function render() {
    renderFresh(); renderBoardBar(); renderDayBar();
    var res = state.date ? dayResults(state.date) : [];
    renderHero(res); renderSpots(res); renderBoards(); renderSettings();
  }

  /* ---------- forms ---------- */
  function formBoard() {
    var ft = parseFloat($("bf-lft").value), inch = parseFloat($("bf-lin").value) || 0;
    var n = function (id) { var v = parseFloat($(id).value); return isFinite(v) ? v : null; };
    return { name: $("bf-name").value.trim(), type: $("bf-type").value || null, lengthFt: isFinite(ft) ? Math.round((ft + inch / 12) * 1000) / 1000 : null,
      widthIn: n("bf-w"), thicknessIn: n("bf-t"), volumeL: n("bf-v"), fins: $("bf-fins").value || null, active: $("bf-active").checked };
  }
  function preview() {
    var p = E.boardProfile(formBoard(), rider());
    $("bf-preview").textContent = "יזוהה כ" + p.typeHe + (p.volume ? " · נפח " + p.volume.toFixed(1) + " ל'" + (p.volumeEstimated ? " (הערכה)" : "") : "") + " · אופטימום " + fmt(p.opt[0]) + "–" + fmt(p.opt[1]) + " מ', עובד " + fmt(p.min) + "–" + fmt(p.max) + " מ'";
  }
  function openForm(b) {
    state.editing = b ? b.id : null; $("boardForm").hidden = false;
    $("bf-name").value = b ? b.name || "" : ""; $("bf-type").value = b && b.type || "";
    var ft = b && b.lengthFt ? Math.floor(b.lengthFt + 1e-6) : ""; $("bf-lft").value = ft; $("bf-lin").value = b && b.lengthFt ? Math.round((b.lengthFt - ft) * 12) : "";
    $("bf-w").value = b && b.widthIn || ""; $("bf-t").value = b && b.thicknessIn || ""; $("bf-v").value = b && b.volumeL || ""; $("bf-fins").value = b && b.fins || "";
    $("bf-active").checked = b ? b.active !== false : true; preview(); $("boardForm").scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function saveBoard(e) {
    e.preventDefault();
    var b = formBoard(); if (!b.name) { toast("צריך שם לגלשן"); return; }
    var id = state.editing || ("b" + Date.now().toString(36));
    var prev = state.boards.find(function (x) { return x.id === id; });
    var doc = Object.assign({}, b, { id: id, createdAt: prev && prev.createdAt || new Date().toISOString() });
    state.boards = state.boards.filter(function (x) { return x.id !== id; }).concat([doc]);
    LS.set("boards", state.boards); $("boardForm").hidden = true; state.boardId = id; LS.set("boardId", id); toast("הגלשן נשמר"); render();
  }
  function saveSettings(patch) { state.settings = Object.assign({}, state.settings, patch); LS.set("settings", state.settings); render(); }

  /* ---------- tabs, install tip, boot ---------- */
  function showTab(name) {
    ["forecast", "boards"].forEach(function (t) {
      var on = t === name; $("tab-" + t).hidden = !on; $("tab-" + t).style.display = on ? "flex" : "none";
      $("t-" + t).setAttribute("aria-selected", on);
    });
    window.scrollTo(0, 0);
  }
  function installTip() {
    var standalone = window.navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (standalone || !ios || LS.get("tipDismissed", false)) return;
    var el = $("installTip"); el.hidden = false;
    el.innerHTML = '<div style="flex:1">להתקנה כאפליקציה: לחץ על <b>שיתוף</b> <svg class="arrow" viewBox="0 0 16 16"><path d="M8 1v9M4.5 4.5 8 1l3.5 3.5M3 8v6h10V8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg> ואז <b>הוסף למסך הבית</b>.</div><button type="button" class="btn sm ghost" id="tipX">סגור</button>';
    $("tipX").onclick = function () { el.hidden = true; LS.set("tipDismissed", true); };
  }
  function boot() {
    $("bf-type").innerHTML = '<option value="">זהה לפי מידות</option>' + Object.keys(E.BOARD_TYPES).map(function (k) { return '<option value="' + k + '">' + E.BOARD_TYPES[k].nameHe + '</option>'; }).join("");
    $("st-skill").innerHTML = Object.keys(E.SKILL).map(function (k) { return '<option value="' + k + '">' + E.SKILL[k].he + '</option>'; }).join("");
    $("st-home").innerHTML = E.SPOTS.map(function (s) { return '<option value="' + s.id + '">' + s.nameHe + '</option>'; }).join("");
    $("legend").innerHTML = E.LABELS.map(function (l) { return '<span style="background:' + col(l[3]) + '">' + l[2] + '</span>'; }).join("");
    $("addBoardBtn").onclick = function () { openForm(null); };
    $("bf-cancel").onclick = function () { $("boardForm").hidden = true; };
    $("boardForm").addEventListener("submit", saveBoard);
    $("boardForm").addEventListener("input", preview);
    $("st-weight").onchange = function () { var v = parseFloat(this.value); saveSettings({ weightKg: isFinite(v) ? v : null }); };
    $("st-skill").onchange = function () { saveSettings({ skill: this.value }); };
    $("st-home").onchange = function () { saveSettings({ homeSpot: this.value }); };
    $("t-forecast").onclick = function () { showTab("forecast"); };
    $("t-boards").onclick = function () { showTab("boards"); };
    if (!LS.get("boards", null)) LS.set("boards", state.boards);
    installTip(); render(); refresh(false);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(false); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  boot();
})();
