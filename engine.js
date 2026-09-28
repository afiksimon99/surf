/* SurfEngine — board-aware surf scoring for the Israeli coast (Herzliya → Caesarea).
 * Shared by the dashboard (browser) and the daily report (node). Pure functions, no I/O.
 * Forecast format (per zone, columnar arrays, local Asia/Jerusalem times "YYYY-MM-DDTHH:MM"):
 *   { t:[], hs:[], tp:[], dir:[], swH:[], swT:[], swD:[], s2H:[], s2T:[], s2D:[], wwH:[], wwT:[], wwD:[],
 *     wind:[], gust:[], wdir:[], sst:[], precip:[] }  (any array may be missing or hold nulls)
 *   daily: { date:[], sunrise:[], sunset:[], rain48:[] }
 */
(function (root) {
  "use strict";
  var G = 9.81, BREAK_C = 0.70;

  // ---------- Forecast zones (offshore grid points) ----------
  var ZONES = {
    herzliya: { nameHe: "הרצליה", lat: 32.180, lon: 34.775, windLat: 32.180, windLon: 34.800, sf: "Zvulun-Beach" },
    netanya:  { nameHe: "נתניה",  lat: 32.300, lon: 34.815, windLat: 32.300, windLon: 34.840, sf: "Netanya" },
    yanai:    { nameHe: "נעורים–בית ינאי", lat: 32.390, lon: 34.840, windLat: 32.390, windLon: 34.862, sf: "Neurim-Beach" },
    sdotyam:  { nameHe: "שדות ים–קיסריה", lat: 32.495, lon: 34.860, windLat: 32.495, windLon: 34.885, sf: "Shonit-Beach-Caesarea" }
  };

  // ---------- Spots ----------
  // facing = direction the beach looks out to sea (onshore wind comes FROM here).
  // exposure = multiplier on breaking height (open sand catches more, reef/marina less).
  // maxGood / closeout = breaking face height (m) where the spot starts to degrade / closes out.
  // shelter: wind sectors whose penalty is reduced (factor<1) or harsher (factor>1).
  // shadow: swell sectors partly blocked.
  var SPOTS = [
    { id: "sdot_yam", nameHe: "שדות ים", zone: "sdotyam", lat: 32.487, lon: 34.886, facing: 282,
      swellWin: [265, 310], exposure: 0.92, maxGood: 1.4, closeout: 2.0, slope: 0.04,
      shelter: [{ from: 160, to: 215, f: 0.6 }, { from: 330, to: 30, f: 1.2 }], shadow: [{ from: 305, to: 340, f: 0.85 }],
      bottom: "חול + ריף כורכר ~80 מ' מהחוף", level: "כל הרמות (הסלע – מתקדמים)",
      notes: "כמה פיקים: חופשונית (חול), הסלע (ריף ימני, כבד), ארובות בדרום. נסגר מעל גובה כתפיים בחול, נושב מהר עם רוח.",
      hazards: "סלעים במים נמוכים; זרם ליד הריף", surfline: "584204204e65fad6a7709aa7", slSlug: "sdot-yam", sf: "Shonit-Beach-Caesarea" },
    { id: "caesarea", nameHe: "קיסריה – האמות", zone: "sdotyam", lat: 32.529, lon: 34.899, facing: 283,
      swellWin: [270, 305], exposure: 0.9, maxGood: 1.8, closeout: 2.5, slope: 0.04,
      shelter: [{ from: 330, to: 30, f: 1.2 }], shadow: [],
      bottom: "חול + ריף כורכר", level: "בינוני+",
      notes: "לא עקבי, מעט גולשים. רוח צפונית חזקה כאן יותר מדרום.",
      hazards: "סלעים קרוב לחוף", surfline: "584204204e65fad6a7709aa5", slSlug: "caesarea" },
    { id: "beit_yanai", nameHe: "בית ינאי", zone: "yanai", lat: 32.391, lon: 34.862, facing: 282,
      swellWin: [265, 300], exposure: 1.05, maxGood: 1.5, closeout: 2.0, slope: 0.02,
      shelter: [], shadow: [],
      bottom: "חול, ברים משתנים", level: "כל הרמות",
      notes: "פתוח, A-frames. מצוין לפיש/לונג בימים קטנים ונקיים. כל רוח עם רכיב מזרחי עובדת. חוף קייטים בימי רוח.",
      hazards: "קייטים; שפך נחל אלכסנדר – זיהום אחרי גשם", surfline: "584204204e65fad6a7709aa8", slSlug: "beit-yanai" },
    { id: "neurim", nameHe: "נעורים", zone: "yanai", lat: 32.370, lon: 34.859, facing: 283,
      swellWin: [265, 300], exposure: 1.0, maxGood: 1.5, closeout: 2.2, slope: 0.02,
      shelter: [], shadow: [],
      bottom: "חוף חולי", level: "כל הרמות",
      notes: "פתוח, שמאליים וימניים, כמעט בלי צפיפות. בית ספר גלישה במקום.",
      hazards: "זרמי מערבולת בימים גדולים", surfline: "584204204e65fad6a7709aa8", slSlug: "beit-yanai" },
    { id: "netanya_poleg", nameHe: "נתניה – פולג", zone: "netanya", lat: 32.273, lon: 34.833, facing: 285,
      swellWin: [245, 300], exposure: 1.0, maxGood: 1.8, closeout: 2.5, slope: 0.025,
      shelter: [], shadow: [],
      bottom: "חול + מעט סלע", level: "כל הרמות",
      notes: "רחב, כמה פיקים, 3 מועדוני גלישה. עדיף בשפל/גאות עולה.",
      hazards: "שפך נחל פולג – זיהום אחרי גשם", surfline: "640a665799dd44dd3d0c88df", slSlug: "poleg-beach" },
    { id: "netanya_sironit", nameHe: "נתניה – סירונית/קונטיקי", zone: "netanya", lat: 32.323, lon: 34.846, facing: 285,
      swellWin: [240, 300], exposure: 0.9, maxGood: 2.5, closeout: 3.5, slope: 0.03,
      shelter: [{ from: 180, to: 250, f: 0.5 }], shadow: [],
      bottom: "חול בין שוברי גלים", level: "בינוני–מתקדם",
      notes: "שוברי הגלים מסדרים את הפיקים; עובד בימי סערה כשהחופים הפתוחים נושבים. צפוף, לוקליזם.",
      hazards: "שוברי גלים, צפיפות", surfline: "584204204e65fad6a7709aab", slSlug: "sironit-beach" },
    { id: "herzliya_sidna_ali", nameHe: "הרצליה – סידני עלי", zone: "herzliya", lat: 32.192, lon: 34.804, facing: 285,
      swellWin: [265, 300], exposure: 1.0, maxGood: 1.6, closeout: 2.2, slope: 0.025,
      shelter: [], shadow: [],
      bottom: "בר חול מתחת למצוק", level: "כל הרמות",
      notes: "חשוף, שמאליים וימניים בכל גאות. לרוב צפוף.",
      hazards: "נפילות סלעים מהמצוק, זרמים", surfline: "584204204e65fad6a7709aaa", slSlug: "sidna-ali" },
    { id: "herzliya_zvulun", nameHe: "הרצליה – זבולון", zone: "herzliya", lat: 32.176, lon: 34.800, facing: 285,
      swellWin: [260, 300], exposure: 1.0, maxGood: 2.0, closeout: 2.8, slope: 0.025,
      shelter: [{ from: 180, to: 250, f: 0.5 }], shadow: [],
      bottom: "חול + שובר T בדרום", level: "כל הרמות",
      notes: "ימים נקיים – פיקים צפונה. ימי סערה – ליד השובר הדרומי (מחזיק רוח ד/ד\"מ).",
      hazards: "זרמים חזקים", surfline: "584204204e65fad6a7709aac", slSlug: "zvulun" },
    { id: "herzliya_marina", nameHe: "הרצליה – מרינה (חוף הנכים)", zone: "herzliya", lat: 32.166, lon: 34.795, facing: 285,
      swellWin: [275, 320], exposure: 0.85, maxGood: 3.0, closeout: 4.0, slope: 0.03,
      shelter: [{ from: 160, to: 240, f: 0.3 }], shadow: [{ from: 200, to: 255, f: 0.6 }],
      bottom: "חול, A-frame ליד תעלה עמוקה", level: "בינוני+",
      notes: "ספוט חורף לסערות: המרינה חוסמת רוח דרומית, התעלה מכניסה גלים גדולים.",
      hazards: "צפיפות בימים טובים", surfline: "584204204e65fad6a7709aad", slSlug: "marina" }
  ];

  // ---------- Board types (breaking FACE height in metres, for an intermediate-advanced surfer) ----------
  var BOARD_TYPES = {
    longboard:  { nameHe: "לונגבורד", min: 0.3, opt: [0.4, 1.0], max: 1.5, tp: [7, 14], gf: 1.0, pmin: 0.3, steepOk: false, chop: 0.8 },
    softtop:    { nameHe: "סופט-טופ", min: 0.3, opt: [0.4, 0.9], max: 1.2, tp: [5, 14], gf: 1.1, pmin: 0.3, steepOk: false, chop: 0.8 },
    midlength:  { nameHe: "מיד-לנגת'/פאנבורד", min: 0.4, opt: [0.6, 1.4], max: 2.0, tp: [7, 13], gf: 0.7, pmin: 0.8, steepOk: false, chop: 0.6 },
    fish:       { nameHe: "פיש / טווין", min: 0.5, opt: [0.7, 1.4], max: 1.8, tp: [6, 10], gf: 0.48, pmin: 1.2, steepOk: false, chop: 0.5 },
    groveler:   { nameHe: "היבריד / גרובלר", min: 0.5, opt: [0.6, 1.3], max: 1.8, tp: [6, 10], gf: 0.44, pmin: 1.2, steepOk: false, chop: 0.5 },
    shortboard: { nameHe: "שורטבורד", min: 0.65, opt: [0.9, 2.2], max: 2.7, tp: [7, 14], gf: 0.37, pmin: 3, steepOk: true, chop: 0.3 },
    stepup:     { nameHe: "סטפ-אפ", min: 1.5, opt: [1.8, 3.0], max: 4.0, tp: [9, 16], gf: 0.40, pmin: 8, steepOk: true, chop: 0.3 },
    gun:        { nameHe: "גאן", min: 2.5, opt: [3.0, 5.0], max: 7.0, tp: [11, 20], gf: 0.45, pmin: 20, steepOk: true, chop: 0.2 }
  };
  // f scales the biggest comfortable wave (table values are for int_adv = 1.0)
  var SKILL = { beginner: { f: 0.55, he: "מתחיל" }, intermediate: { f: 0.85, he: "בינוני" }, int_adv: { f: 1.0, he: "בינוני-מתקדם" },
    advanced: { f: 1.1, he: "מתקדם" }, expert: { f: 1.3, he: "מומחה" } };

  // ---------- helpers ----------
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }
  function angdiff(a, b) { var d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; }
  function inSector(d, from, to) { d = (d + 360) % 360; return from <= to ? d >= from && d <= to : d >= from || d <= to; }
  function rad(d) { return d * Math.PI / 180; }
  function at(arr, i) { return arr ? num(arr[i]) : null; }
  var COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  var COMPASS_HE = ["צ", "צצ\"מ", "צ\"מ", "מצ\"מ", "מ", "מד\"מ", "ד\"מ", "דד\"מ", "ד", "דד\"מע", "ד\"מע", "מעד\"מע", "מע", "מעצ\"מע", "צ\"מע", "צצ\"מע"];
  function compass(d) { return COMPASS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16]; }
  function compassHe(d) { return COMPASS_HE[Math.round(((d % 360) + 360) % 360 / 22.5) % 16]; }
  function compassToDeg(s) { var i = COMPASS.indexOf(String(s).trim().toUpperCase()); return i < 0 ? null : i * 22.5; }

  // ---------- boards ----------
  function estimateVolume(b) {
    var L = num(b.lengthFt), W = num(b.widthIn), T = num(b.thicknessIn);
    if (!L || !W || !T) return null;
    var type = b.type && BOARD_TYPES[b.type] ? b.type : null;
    var k = type === "longboard" || type === "softtop" ? 0.61 : type === "fish" || type === "groveler" ? 0.58 : 0.54;
    return Math.round((L * 30.48) * (W * 2.54) * (T * 2.54) * k / 1000 * 10) / 10;
  }
  function classifyBoard(b) {
    var L = num(b.lengthFt), W = num(b.widthIn), tail = (b.tail || "").toLowerCase(), fins = (b.fins || "").toLowerCase();
    if (b.softtop) return "softtop";
    if (!L) return "fish";
    if (L >= 9) return "longboard";
    if (L >= 7 && W && W < 19.75) return L >= 7.5 ? "gun" : "stepup";
    if (L >= 7) return "midlength";
    if (W && W >= 21.5) return "midlength";
    if (tail.indexOf("swallow") >= 0 || tail.indexOf("fish") >= 0 || fins === "twin") return "fish";
    if (L < 6.6 && ((W && W >= 20.5) || tail.indexOf("swallow") >= 0 || tail.indexOf("fish") >= 0 || fins === "twin")) return "fish";
    if (L < 6.3 && W && W >= 20) return "groveler";
    if (L > 6.4 && W && W < 19.5) return "stepup";
    return "shortboard";
  }
  // Rider-specific wave window for a board.
  function boardProfile(board, rider) {
    rider = rider || {};
    var type = board.type && BOARD_TYPES[board.type] ? board.type : classifyBoard(board);
    var bt = BOARD_TYPES[type];
    var skill = SKILL[rider.skill] || SKILL.int_adv;
    var vol = num(board.volumeL) || estimateVolume(Object.assign({}, board, { type: type }));
    var weight = num(rider.weightKg);
    var gf = vol && weight ? vol / weight : null;
    var dev = gf ? clamp((gf - bt.gf) / bt.gf, -0.35, 0.45) : 0;
    var min = bt.min * (1 - 0.5 * dev);
    var optLo = bt.opt[0] * (1 - 0.2 * dev), optHi = bt.opt[1] * (1 - 0.15 * dev) * (0.85 + 0.15 * skill.f);
    var max = bt.max * (1 - 0.25 * dev) * skill.f;
    optHi = Math.min(optHi, max * 0.92); optLo = Math.min(optLo, optHi * 0.85); min = Math.min(min, optLo * 0.9);
    return { type: type, typeHe: bt.nameHe, min: min, opt: [optLo, optHi], max: max, tp: bt.tp, pmin: bt.pmin,
      steepOk: bt.steepOk, chop: bt.chop, volume: vol, volumeEstimated: !num(board.volumeL) && !!vol, gf: gf, skill: skill };
  }

  // ---------- physics ----------
  // Komar & Gaughan breaking height per swell partition, refraction by angle to beach normal.
  function partitions(z, i) {
    var parts = [], p;
    var list = [["swH", "swT", "swD", "swell"], ["s2H", "s2T", "s2D", "swell"], ["wwH", "wwT", "wwD", "wind"]];
    for (var k = 0; k < list.length; k++) {
      p = { h: at(z[list[k][0]], i), T: at(z[list[k][1]], i), d: at(z[list[k][2]], i), kind: list[k][3] };
      if (p.h && p.h > 0.05 && p.T && p.d !== null) parts.push(p);
    }
    if (!parts.length) {
      p = { h: at(z.hs, i), T: at(z.tp, i), d: at(z.dir, i), kind: "total" };
      if (p.h !== null && p.T && p.d !== null) parts.push(p);
    }
    return parts;
  }
  function breaking(spot, parts) {
    var sum2 = 0, e = 0, eT = 0, eSw = 0, dom = null, domE = -1;
    parts.forEach(function (p) {
      var delta = angdiff(p.d, spot.facing);
      var kdir = delta >= 90 ? 0 : Math.sqrt(Math.cos(rad(delta)));
      var win = inSector(p.d, spot.swellWin[0], spot.swellWin[1]) ? 1 : 0.75;
      (spot.shadow || []).forEach(function (s) { if (inSector(p.d, s.from, s.to)) win *= s.f; });
      var H = p.h * kdir * win;
      var hb = H > 0 ? 0.39 * Math.pow(G, 0.2) * Math.pow(p.T * H * H, 0.4) * BREAK_C * spot.exposure : 0;
      sum2 += hb * hb;
      var en = p.h * p.h * p.T; e += en; eT += en * p.T;
      if (p.kind !== "wind") eSw += en;
      if (en > domE) { domE = en; dom = p; }
    });
    var hasSplit = parts.some(function (p) { return p.kind === "wind"; }) || parts.some(function (p) { return p.kind === "swell"; });
    return { hb: Math.sqrt(sum2), tp: e ? eT / e : null, dom: dom, clean: hasSplit && e ? eSw / e : null };
  }

  function sizeHe(h) {
    if (h < 0.25) return "שטוח";
    if (h < 0.45) return "ברכיים";
    if (h < 0.7) return "ירכיים–מותניים";
    if (h < 1.0) return "מותניים–חזה";
    if (h < 1.3) return "חזה–כתפיים";
    if (h < 1.7) return "בגובה ראש";
    if (h < 2.3) return "מעל הראש";
    return "כפול ראש+";
  }
  function windTypeHe(rel) {
    if (rel >= 150) return "אופשור";
    if (rel >= 110) return "קרוס-אופשור";
    if (rel >= 70) return "רוח צד";
    if (rel >= 30) return "קרוס-אונשור";
    return "אונשור";
  }
  var LABELS = [
    [1.0, "FLAT", "שטוח", "flat"], [2.5, "VERY POOR", "גרוע מאוד", "vpoor"], [4.0, "POOR", "גרוע", "poor"],
    [5.0, "POOR TO FAIR", "גרוע עד סביר", "ptf"], [6.0, "FAIR", "סביר", "fair"], [7.0, "FAIR TO GOOD", "סביר עד טוב", "ftg"],
    [8.5, "GOOD", "טוב", "good"], [99, "EPIC", "אפי", "epic"]
  ];
  function label(score) { for (var k = 0; k < LABELS.length; k++) if (score < LABELS[k][0]) return { en: LABELS[k][1], he: LABELS[k][2], key: LABELS[k][3] }; }

  // ---------- scoring ----------
  function scoreHour(spot, z, i, prof) {
    var parts = partitions(z, i);
    if (!parts.length) return null;
    var br = breaking(spot, parts);
    var h = br.hb, Tp = br.tp || at(z.tp, i) || 6;
    var hs = at(z.hs, i) || Math.sqrt(parts.reduce(function (s, p) { return s + p.h * p.h; }, 0));

    // A. Board fit (trapezoid on breaking face height)
    var F;
    if (h < prof.min) F = 0.5 * clamp((h - 0.5 * prof.min) / (0.5 * prof.min), 0, 1);
    else if (h < prof.opt[0]) F = 0.5 + 0.5 * (h - prof.min) / Math.max(0.01, prof.opt[0] - prof.min);
    else if (h <= prof.opt[1]) F = 1;
    else if (h <= prof.max) F = 1 - 0.6 * (h - prof.opt[1]) / Math.max(0.01, prof.max - prof.opt[1]);
    else F = Math.max(0, 0.4 - 0.4 * (h - prof.max) / (0.3 * prof.max));
    var P = 0.49 * hs * hs * 0.9 * Tp;                       // wave power kW/m
    if (P < prof.pmin) F *= 0.7 + 0.3 * P / prof.pmin;
    var steep = 2 * Math.PI * hs / (G * Tp * Tp);
    var irib = (spot.slope || 0.025) / Math.sqrt(Math.max(steep, 1e-4));
    if (!prof.steepOk && h > 1.4 && irib > 0.45) F *= 0.8;
    if (Tp > prof.tp[1] && h > prof.opt[1]) F *= 0.9;
    if (Tp < prof.tp[0]) F *= Math.max(0.6, 1 - 0.06 * (prof.tp[0] - Tp));

    // Spot size limits (closeouts)
    var S = 1;
    if (h > spot.maxGood) S = h <= spot.closeout ? 1 - 0.35 * (h - spot.maxGood) / (spot.closeout - spot.maxGood)
      : Math.max(0.3, 0.65 - 0.5 * (h - spot.closeout) / spot.closeout);

    // B. Wave quality
    var qT = clamp((Tp - 4) / 6, 0, 1);
    // wave-model swell/wind-sea split is unreliable in the Med (often labels everything "swell"),
    // so blend it with a steepness-based cleanliness estimate
    var qSteep = clamp(1 - (steep - 0.008) / 0.03, 0.2, 0.9);
    var qClean = br.clean === null ? qSteep : 0.5 * br.clean + 0.5 * qSteep;
    var domD = br.dom ? br.dom.d : at(z.dir, i);
    var qDir = domD === null ? 0.7 : Math.max(0, Math.cos(rad(angdiff(domD, spot.facing)))) * (inSector(domD, spot.swellWin[0], spot.swellWin[1]) ? 1 : 0.6);
    var Q = 0.45 * qT + 0.35 * qClean + 0.20 * qDir;

    // C. Wind
    var ws = at(z.wind, i), wg = at(z.gust, i), wd = at(z.wdir, i), W = 0.7, rel = null;
    if (ws !== null && wd !== null) {
      var w = ws + 0.3 * Math.max(0, (wg !== null ? wg : ws) - ws);
      rel = angdiff(wd, spot.facing);
      var d = (1 - Math.cos(rad(rel))) / 2;                   // 0 onshore … 1 offshore
      if (w < 4) W = 1;
      else {
        W = 1 - (1 - d) * Math.pow(clamp((w - 4) / 16, 0, 1), 0.8) - d * 0.6 * clamp((w - 15) / 15, 0, 1);
        if (w >= 5 && w <= 12) W = Math.min(1, W + 0.1 * d);
      }
      // board chop tolerance: longboards shrug off light onshore more than shortboards
      W = 1 - (1 - W) * (1.15 - 0.3 * prof.chop);
      (spot.shelter || []).forEach(function (s) { if (inSector(wd, s.from, s.to)) W = 1 - (1 - W) * s.f; });
      W = clamp(W, 0, 1);
    }

    var core = (0.25 + 0.75 * W) * (0.15 + 0.85 * Q);
    var score = 10 * Math.pow(clamp(F, 0, 1), 0.8) * S * core;
    if (h < 0.25) score = Math.min(score, 0.8);
    if (score >= 8.5 && !(Q >= 0.8 && W >= 0.85 && S >= 0.95 && F >= 0.95 && Tp >= 9 && h >= prof.opt[0])) score = 8.4;
    return { t: z.t[i], h: h, lo: h * 0.75, hi: h * 1.2, tp: Tp, dir: domD, hs: hs, P: P,
      wind: ws, gust: wg, wdir: wd, rel: rel, F: F, S: S, Q: Q, W: W, qT: qT, clean: br.clean,
      score: Math.round(clamp(score, 0, 10) * 10) / 10 };
  }

  function hhmm(s) { var m = /T?(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] + (+m[2]) / 60 : null; }
  function daylight(z, date) {
    var k = z.daily && z.daily.date ? z.daily.date.indexOf(date) : -1;
    var rise = k >= 0 ? hhmm(z.daily.sunrise[k]) : 6.3, set = k >= 0 ? hhmm(z.daily.sunset[k]) : 18.3;
    return { rise: rise || 6.3, set: set || 18.3 };
  }
  var WINDOWS = { dawn: { he: "בוקר מוקדם" }, midday: { he: "צהריים" }, afternoon: { he: "אחה\"צ" } };
  function windowOf(hour, dl) { return hour < 9 ? "dawn" : hour < 15 ? "midday" : "afternoon"; }

  // Score all daylight hours of one day at one spot; pick best 2-hour session.
  function scoreDay(spot, forecast, date, prof, windows) {
    var z = forecast.zones[spot.zone]; if (!z) return null;
    var dl = daylight(z, date), hours = [];
    for (var i = 0; i < z.t.length; i++) {
      if (z.t[i].slice(0, 10) !== date) continue;
      var hr = hhmm(z.t[i]);
      if (hr < dl.rise - 0.75 || hr > dl.set - 0.5) continue;
      var r = scoreHour(spot, z, i, prof); if (!r) continue;
      r.hour = hr; r.win = windowOf(hr, dl); hours.push(r);
    }
    // consistency: penalise hour-to-hour jumps (±2h)
    hours.forEach(function (r, k) {
      var win = hours.slice(Math.max(0, k - 2), k + 3).map(function (x) { return x.h; });
      var m = win.reduce(function (a, b) { return a + b; }, 0) / win.length;
      var sd = Math.sqrt(win.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / win.length);
      r.C = 0.5 * r.qT + 0.5 * (1 - clamp(m ? sd / m : 0, 0, 1));
      r.score = Math.round(clamp(r.score * (0.9 + 0.1 * r.C), 0, 10) * 10) / 10;
      r.label = label(r.score);
    });
    var allowed = windows && windows.length ? windows : ["dawn", "midday", "afternoon"];
    var best = null;
    for (var k = 0; k < hours.length; k++) {
      if (allowed.indexOf(hours[k].win) < 0) continue;
      var nxt = hours[k + 1] && allowed.indexOf(hours[k + 1].win) >= 0 && hours[k + 1].hour - hours[k].hour <= 1.01 ? hours[k + 1] : null;
      var s = nxt ? (hours[k].score + nxt.score) / 2 : hours[k].score * 0.95;
      if (!best || s > best.score) best = { score: Math.round(s * 10) / 10, from: hours[k], to: nxt || hours[k] };
    }
    if (best) best.label = label(best.score);
    var zi = z.t.findIndex ? z.t.findIndex(function (t) { return t.slice(0, 10) === date && hhmm(t) >= 12; }) : -1;
    var k2 = z.daily && z.daily.date ? z.daily.date.indexOf(date) : -1;
    return { spot: spot, date: date, hours: hours, best: best, daylight: dl,
      sst: zi >= 0 ? at(z.sst, zi) : null, rain48: k2 >= 0 && z.daily.rain48 ? num(z.daily.rain48[k2]) : null };
  }

  // ---------- Hebrew explanations ----------
  function fmt(x, d) { return x === null || x === undefined ? "–" : Number(x).toFixed(d === undefined ? 1 : d); }
  function reasons(r, prof) {
    var out = [];
    var sizeTxt = "גלים " + fmt(r.lo) + "–" + fmt(r.hi) + " מ' (" + sizeHe(r.h) + ")";
    if (r.h < prof.min) out.push({ k: "neg", t: sizeTxt + " – קטן מדי ל" + prof.typeHe });
    else if (r.h < prof.opt[0]) out.push({ k: "mid", t: sizeTxt + " – גבולי, תצטרך חתירה חזקה" });
    else if (r.h <= prof.opt[1]) out.push({ k: "pos", t: sizeTxt + " – בטווח המושלם ל" + prof.typeHe });
    else if (r.h <= prof.max) out.push({ k: "mid", t: sizeTxt + " – בצד הגדול ל" + prof.typeHe });
    else out.push({ k: "neg", t: sizeTxt + " – גדול/תלול מדי ל" + prof.typeHe + ", שקול גלשן אחר" });
    if (r.S < 0.9) out.push({ k: "neg", t: "הספוט נוטה להיסגר בגודל הזה" });
    var T = Math.round(r.tp);
    out.push(T < 6 ? { k: "neg", t: "מחזור " + T + " ש' – קצר, גלים רכים ומבולגנים" }
      : T < 8 ? { k: "mid", t: "מחזור " + T + " ש' – סטנדרטי לים התיכון" }
      : { k: "pos", t: "מחזור " + T + " ש' – ארוך לים התיכון, סטים מסודרים" });
    if (r.wind !== null && r.rel !== null) {
      var wt = r.wind < 4 ? "כמעט ללא רוח – פני מים חלקים" : "רוח " + Math.round(r.wind) + " קשר " + windTypeHe(r.rel) + " (" + compassHe(r.wdir) + ")";
      out.push({ k: r.W >= 0.8 ? "pos" : r.W >= 0.5 ? "mid" : "neg", t: wt });
    }
    if (r.clean !== null && r.clean < 0.4) out.push({ k: "neg", t: "רוב האנרגיה היא ים רוח מקומי – צ'ופי" });
    return out;
  }
  function wetsuit(sst) {
    if (sst === null || sst === undefined) return null;
    if (sst >= 24) return "בגד ים / ליקרה";
    if (sst >= 21) return "טופ או שורטי 2 מ\"מ";
    if (sst >= 18) return "חליפה 3/2";
    if (sst >= 16) return "חליפה 4/3";
    return "חליפה 4/3 + נעלי ניאופרן";
  }

  // ---------- Daily report across boards & spots ----------
  function rankDay(forecast, boards, settings, date) {
    settings = settings || {};
    var rider = { weightKg: settings.weightKg, skill: settings.skill };
    var spots = SPOTS.filter(function (s) { return !settings.spots || settings.spots.indexOf(s.id) >= 0; });
    var res = [];
    (boards || []).filter(function (b) { return b.active !== false; }).forEach(function (b) {
      var prof = boardProfile(b, rider);
      spots.forEach(function (s) {
        var d = scoreDay(s, forecast, date, prof, settings.windows);
        if (d && d.best) res.push({ board: b, prof: prof, day: d, score: d.best.score + (s.id === settings.homeSpot ? 0.05 : 0) });
      });
    });
    res.sort(function (a, b) { return b.score - a.score; });
    return res;
  }
  function hm(h) { var H = Math.floor(h), M = Math.round((h - H) * 60); return (H < 10 ? "0" : "") + H + ":" + (M < 10 ? "0" : "") + M; }
  var DAYS_HE = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
  function dayHe(date) { var d = new Date(date + "T12:00:00Z"); return "יום " + DAYS_HE[d.getUTCDay()] + " " + d.getUTCDate() + "." + (d.getUTCMonth() + 1); }

  function reportText(forecast, boards, settings, date) {
    var ranked = rankDay(forecast, boards, settings, date);
    var thr = num(settings && settings.alertThreshold) || 5;
    if (!ranked.length) return { alert: false, text: "אין נתוני תחזית ל" + dayHe(date), top: null };
    var top = ranked[0], b = top.day.best, r = b.from;
    var head = top.score >= thr ? "כדאי לגלוש " + dayHe(date) + "!" : "לא שווה במיוחד " + dayHe(date) + " (" + b.label.he + ")";
    var lines = [head,
      "הכי טוב: " + top.day.spot.nameHe + " " + hm(b.from.hour) + "–" + hm(b.to.hour + 1) + " — " + b.score.toFixed(1) + "/10 (" + b.label.he + ") עם " + (top.board.name || top.prof.typeHe)];
    lines.push(reasons(r, top.prof).map(function (x) { return x.t; }).join(" · "));
    var seen = {}, others = [];
    ranked.slice(1).forEach(function (x) {
      if (x.board !== top.board || seen[x.day.spot.id] || x.day.spot.id === top.day.spot.id || others.length >= 3) return;
      seen[x.day.spot.id] = 1; others.push(x.day.spot.nameHe + " " + x.day.best.score.toFixed(1));
    });
    if (others.length) lines.push("חלופות: " + others.join(", "));
    var ws = wetsuit(top.day.sst); if (ws) lines.push("מים " + Math.round(top.day.sst) + "° – " + ws);
    if (top.day.rain48 !== null && top.day.rain48 > 10) lines.push("אזהרה: ירדו " + Math.round(top.day.rain48) + " מ\"מ גשם ב-48 שעות – סכנת זיהום ליד שפכי נחלים");
    return { alert: top.score >= thr, text: lines.join("\n"), top: top, ranked: ranked };
  }

  var api = { ZONES: ZONES, SPOTS: SPOTS, BOARD_TYPES: BOARD_TYPES, SKILL: SKILL, WINDOWS: WINDOWS,
    boardProfile: boardProfile, classifyBoard: classifyBoard, estimateVolume: estimateVolume,
    scoreHour: scoreHour, scoreDay: scoreDay, rankDay: rankDay, reportText: reportText, reasons: reasons,
    label: label, sizeHe: sizeHe, windTypeHe: windTypeHe, wetsuit: wetsuit, compass: compass, compassHe: compassHe,
    compassToDeg: compassToDeg, angdiff: angdiff, dayHe: dayHe, hm: hm, hhmm: hhmm, LABELS: LABELS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SurfEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
