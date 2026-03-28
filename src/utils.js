export function t2m(t) { if (!t) return 0; var p = t.split(":"); return +p[0] * 60 + +p[1]; }
export function m2t(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mi = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mi < 10 ? "0" : "") + mi; }
export function snap30(m) { return Math.round(m / 30) * 30; }
export function fmtH(h) { if (h === undefined || h === null || isNaN(h)) return "0"; return h % 1 === 0 ? h.toFixed(0) : h.toFixed(1); }
export function tL(t) { if (!t) return ""; var m = t2m(t), h = Math.floor(m / 60), mi = m % 60, ap = h >= 12 ? "p" : "a"; h = h % 12 || 12; return h + ":" + (mi < 10 ? "0" : "") + mi + ap; }
export function hSpan(a, b) { return Math.max(0, Math.round((t2m(b) - t2m(a)) / 60 * 10) / 10); }
export function opHrs(hours) { var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; return DAYS.reduce(function (a, d) { var dh = hours[d]; return a + (dh && dh.isOpen ? hSpan(dh.open, dh.close) : 0); }, 0); }
export function scriptVolume(store, day) { var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; var ranking = store.dayRanking || DAYS.filter(function (d) { var dh = store.hours[d]; return dh && dh.isOpen; }); var idx = ranking.indexOf(day); if (idx < 0) return 5; var ties = store.dayTies || []; while (idx > 0 && ties.includes(idx - 1)) { idx--; } var n = ranking.length; if (n <= 1) return 5; return Math.round(10 - (idx / (n - 1)) * 9); }
export function firstName(p) { if (!p) return ""; var n = p.name || ""; if (!n) return "?"; if (n.startsWith("Staff RPh ")) return "S" + n.replace("Staff RPh ", ""); if (n.startsWith("OVNT RPh ")) return "OV" + n.replace("OVNT RPh ", ""); if (n.length <= 12) return n; return n.split(" ")[0]; }
