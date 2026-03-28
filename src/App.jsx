import { useState, useEffect, useRef } from "react";
import { DAYS, Co, shadow, font, mono, PC, setTheme } from "./theme.js";
import { t2m, m2t, snap30, fmtH, tL, opHrs, firstName } from "./utils.js";
import { defPrefs, defHours, generateSchedule, validateCandidate, scoreTemplate, genSummaryText, genNarrative } from "./logic/scheduler.js";
import { Btn, Inp, Sel, TSel, Tog, NW, Card, Collapsible } from "./components/ui.jsx";
var INITIAL_STORE = { storeLabel: "", allocatedHoursPerWeek: 81, is24hr: false, rotationWeeks: 2, hours: defHours(), dayRanking: ["Mon", "Tue", "Fri", "Wed", "Thu", "Sat", "Sun"], dayTies: [3], peak: { weekday: [{ start: "12:00", end: "17:00" }], saturday: [{ start: "11:00", end: "16:00" }], sunday: [{ start: "12:00", end: "15:00" }] }, dspDays: [], pmAnchorBusiest: true };
function freshStore() { return JSON.parse(JSON.stringify(INITIAL_STORE)); }

export default function App() {
var [dark, setDark] = useState(false);
useEffect(function () {
var mq = window.matchMedia("(prefers-color-scheme: dark)");
setDark(mq.matches);
var handler = function (e) { setDark(e.matches); };
if (mq.addEventListener) mq.addEventListener("change", handler);
else if (mq.addListener) mq.addListener(handler);
return function () { if (mq.removeEventListener) mq.removeEventListener("change", handler); else if (mq.removeListener) mq.removeListener(handler); };
}, []);
setTheme(dark);
var [mode, setMode] = useState(null);
var [step, setStep] = useState(0);
var [store, setStore] = useState(freshStore);
var [pharms, setPharms] = useState([]);
var [editP, setEditP] = useState(null);
var [removing, setRemoving] = useState(null);
var [results, setResults] = useState(null);
var [curSched, setCurSched] = useState(null);
var [curOverrides, setCurOverrides] = useState({});
var [curScore, setCurScore] = useState(null);
var [whatIf, setWhatIf] = useState(null);
var [showWk, setShowWk] = useState(0);
var [resultPanel, setResultPanel] = useState(null);
var [showHelp, setShowHelp] = useState(false);
var [showMissing, setShowMissing] = useState(false);
var [flash, setFlash] = useState({});
var [teamWarning, setTeamWarning] = useState(null);
var [generating, setGenerating] = useState(false);
var [tipOpen, setTipOpen] = useState(false);
var [history, setHistory] = useState([]);
var flashTimers = useRef({});
function flashFor(key, duration) {
  if (flashTimers.current[key]) clearTimeout(flashTimers.current[key]);
  setFlash(function (f) { var n = {}; for (var k in f) n[k] = f[k]; n[key] = true; return n; });
  flashTimers.current[key] = setTimeout(function () { setFlash(function (f) { var n = {}; for (var k in f) n[k] = f[k]; delete n[key]; return n; }); delete flashTimers.current[key]; }, duration || 600);
}
function flashSet(key, val) { setFlash(function (f) { var n = {}; for (var k in f) n[k] = f[k]; if (val === false || val === undefined) delete n[key]; else n[key] = val; return n; }); }
useEffect(function () { var timers = flashTimers.current; return function () { Object.values(timers).forEach(clearTimeout); }; }, []);
useEffect(function () { function onKey(e) { if (e.key === "Escape") { if (showHelp) setShowHelp(false); } } document.addEventListener("keydown", onKey); return function () { document.removeEventListener("keydown", onKey); }; }, [showHelp]);
function addPharm() {
setTeamWarning(null);
var newP = { id: Date.now() + Math.random(), name: "", role: pharms.length === 0 ? "pm" : "staff", color: PC[pharms.length % PC.length], targetHours: 40, minHours: 32, maxHours: 48, payPeriodHours: 80, earliestStart: "", latestEnd: "", maxShiftLength: 13, minShiftLength: 6, earlyStartMinutes: null, prefs: defPrefs() };
setEditP(newP);
}
function savePharm() {
if (!editP) return;
var ep = { ...editP };
if (!ep.name.trim()) ep.name = ep.role === "pm" ? "PM" : ep.role === "ovnt" ? "OVNT RPh " + String.fromCharCode(65 + pharms.filter(function (p) { return p.role === "ovnt"; }).length) : ep.role === "dsp" ? "DSP" + (pharms.filter(function (p) { return p.role === "dsp"; }).length > 0 ? " " + String.fromCharCode(65 + pharms.filter(function (p) { return p.role === "dsp"; }).length) : "") : "Staff RPh " + String.fromCharCode(65 + pharms.filter(function (p) { return p.role === "staff"; }).length);
var base = +ep.targetHours || 40;
if (!ep._showRange || (!ep.minHours && !ep.maxHours)) { ep.minHours = base - 8; ep.maxHours = base + 8; }
if (ep._showRange && ep.minHours && ep.maxHours) { if (+ep.minHours > +ep.maxHours) { var tmp = ep.minHours; ep.minHours = ep.maxHours; ep.maxHours = tmp; } ep.targetHours = Math.round((+ep.minHours + +ep.maxHours) / 2 * 2) / 2; }
ep.payPeriodHours = (+ep.targetHours || 40) * 2;
delete ep._showRange;
setTeamWarning(null);
var existing = pharms.findIndex(function (p) { return p.id === ep.id; });
if (existing >= 0) setPharms(function (pr) { return pr.map(function (p) { return p.id === ep.id ? ep : p; }); });
else setPharms(function (pr) { return pr.concat([ep]); });
setEditP(null);
}
function initCurSched() { var g = {}; for (var w = 0; w < (store.rotationWeeks || 2); w++) { pharms.forEach(function (p) { DAYS.forEach(function (d) { g[w + "-" + p.id + "-" + d] = ""; }); }); } setCurSched(g); }
function cycleCurAssign(wi, pid, day) {
setCurSched(function (g) {
var ng = { ...g }; var k = wi + "-" + pid + "-" + day; var cur = g[k] || "";
if (cur) { ng[k] = ""; var rem = pharms.filter(function (p) { return p.role !== "ovnt" && p.id !== pid && (ng[wi + "-" + p.id + "-" + day] || ""); }); if (rem.length === 1) ng[wi + "-" + rem[0].id + "-" + day] = "F"; else if (rem.length === 2) { var allW = rem.every(function (r) { return ng[wi + "-" + r.id + "-" + day] === "W"; }); if (allW) { ng[wi + "-" + rem[0].id + "-" + day] = "O"; ng[wi + "-" + rem[1].id + "-" + day] = "C"; } } }
else { var othersOn = pharms.filter(function (p) { return p.role !== "ovnt" && p.id !== pid && (ng[wi + "-" + p.id + "-" + day] || ""); }); if (othersOn.length === 0) { ng[k] = "F"; } else if (othersOn.length === 1 && ng[wi + "-" + othersOn[0].id + "-" + day] === "F") { ng[wi + "-" + othersOn[0].id + "-" + day] = "O"; ng[k] = "C"; } else { ng[k] = "W"; } }
return ng;
});
}
function buildSchedFromGrid() {
if (!curSched) return null; var R = store.rotationWeeks || 2; var weeks = [];
for (var w = 0; w < R; w++) { var wk = {}; DAYS.forEach(function (d) { var dh = store.hours[d]; if (!dh || !dh.isOpen) { wk[d] = []; return; } var segS = t2m(dh.open), segE = t2m(dh.close);
var assignedP = pharms.filter(function (p) { return curSched[w + "-" + p.id + "-" + d]; }); var assigns = [];
var hasW = assignedP.some(function (p) { return curSched[w + "-" + p.id + "-" + d] === "W"; }); var ovlKey = "ovl-" + w + "-" + d;
if (hasW || assignedP.length >= 3 || curOverrides[ovlKey]) { assignedP.forEach(function (p) { var startKey = "os-" + w + "-" + d + "-" + p.id; var endKey = "oe-" + w + "-" + d + "-" + p.id; var pS = curOverrides[startKey] ? t2m(curOverrides[startKey]) : segS; var pE = curOverrides[endKey] ? t2m(curOverrides[endKey]) : segE; pE = Math.min(pE, pS + (p.maxShiftLength || 13) * 60); assigns.push({ pharmacistId: p.id, start: m2t(pS), end: m2t(pE) }); }); }
else { var ovrKey = w + "-" + d; var owC = curOverrides[ovrKey] ? t2m(curOverrides[ovrKey]) : snap30(segS + Math.round((segE - segS) * 0.55)); assignedP.forEach(function (p) { var role = curSched[w + "-" + p.id + "-" + d] || ""; var sS, sEn; if (role === "O") { sS = segS; sEn = snap30(owC + 60); } else if (role === "C") { sS = snap30(owC - 60); sEn = segE; } else { sS = segS; sEn = segE; } sEn = Math.min(sEn, sS + (p.maxShiftLength || 13) * 60); assigns.push({ pharmacistId: p.id, start: m2t(sS), end: m2t(sEn) }); }); }
wk[d] = assigns; }); weeks.push(wk); }
return { weeks: weeks };
}
function doGenerate() {
if (generating) return;
setGenerating(true);
setTimeout(doGenerateWork, 0);
}
function doGenerateWork() {
if (mode === "improve" && curSched) { var bs = buildSchedFromGrid(); if (bs) setCurScore(scoreTemplate(bs, pharms, store)); }
var bestRec = null, bestRecG = -1;
for (var ci = 0; ci < 40; ci++) { var sc = generateSchedule(store, pharms, "business", ci * 17 + 1); var vc = validateCandidate(sc, pharms, store); if (!vc.valid) continue; var ts = scoreTemplate(sc, pharms, store); if (ts.total > bestRecG) { bestRecG = ts.total; bestRec = { name: "Recommended", schedule: sc, score: ts }; } }
var allHonoredPharms = pharms.map(function (p) { var np = { ...p, prefs: { ...p.prefs, needs: {}, fixedDaysOff: [].concat(p.prefs.fixedDaysOff || []), preferredDaysOff: [].concat(p.prefs.preferredDaysOff || []), dayOverrides: Object.assign({}, p.prefs.dayOverrides || {}) } }; if (np.prefs.preferredWeekendDay) np.prefs.needs.weekendPref = true; if (np.prefs.preferEarly) np.prefs.needs.preferEarly = true; if (np.prefs.preferLate) np.prefs.needs.preferLate = true; if (np.prefs.noClopening) np.prefs.needs.noClopening = true; if (np.prefs.noBackToBackLong) np.prefs.needs.noBackToBackLong = true; if (np.prefs.threeDayWeekend) np.prefs.needs.threeDayWeekend = true; if ((np.prefs.preferredDaysOff || []).length > 0) np.prefs.needs.preferredDaysOff = true; if (np.prefs.maxConsecutiveWorkDays && np.prefs.maxConsecutiveWorkDays < 6) np.prefs.needs.maxConsecutiveWorkDays = true; if (np.prefs.consecutiveDaysOff > 1) np.prefs.needs.consecutiveDaysOff = true; return np; });
var bestAll = null, bestAllG = -1;
for (var ci2 = 0; ci2 < 40; ci2++) { var sc2 = generateSchedule(store, allHonoredPharms, "min_conflict", ci2 * 13 + 7); var vc2 = validateCandidate(sc2, pharms, store); if (!vc2.valid) continue; var ts2 = scoreTemplate(sc2, pharms, store); if (ts2.total > bestAllG) { bestAllG = ts2.total; bestAll = { name: "All Honored", schedule: sc2, score: ts2 }; } }
var all = []; if (bestRec) all.push(bestRec); if (bestAll && bestRec && Math.abs(bestAll.score.total - bestRec.score.total) >= 2) { all.push(bestAll); }
var prefCosts = [];
if (bestRec) {
pharms.forEach(function (p) {
if (p.role === "dsp" || p.role === "ovnt") return;
var pPrefs = [];
if (p.prefs.weekendPref === "every_other_off" && !p.prefs.preferredWeekendDay) pPrefs.push({ key: "weekendPref", label: firstName(p) + " every other weekend off", forceable: true });
if (p.prefs.preferredWeekendDay) pPrefs.push({ key: "preferredWeekendDay", label: firstName(p) + " prefers " + p.prefs.preferredWeekendDay + " off", forceable: true });
if (p.prefs.preferEarly) pPrefs.push({ key: "preferEarly", label: firstName(p) + " prefers opening", forceable: true });
if (p.prefs.preferLate) pPrefs.push({ key: "preferLate", label: firstName(p) + " prefers closing", forceable: true });
if (p.prefs.noClopening) pPrefs.push({ key: "noClopening", label: firstName(p) + " no close-to-open", forceable: true });
if ((p.prefs.preferredDaysOff || []).length > 0) pPrefs.push({ key: "preferredDaysOff", label: firstName(p) + " prefers " + p.prefs.preferredDaysOff.join(", ") + " off", forceable: true });
if (p.prefs.threeDayWeekend) pPrefs.push({ key: "threeDayWeekend", label: firstName(p) + " wants 3-day weekend", forceable: true });
if (p.prefs.noBackToBackLong) pPrefs.push({ key: "noBackToBackLong", label: firstName(p) + " no back-to-back long shifts", forceable: true });
if (p.prefs.maxConsecutiveWorkDays && p.prefs.maxConsecutiveWorkDays < 6) pPrefs.push({ key: "maxConsecutiveWorkDays", label: firstName(p) + " max " + p.prefs.maxConsecutiveWorkDays + " consecutive days", forceable: true });
if (p.prefs.consecutiveDaysOff > 1) pPrefs.push({ key: "consecutiveDaysOff", label: firstName(p) + " min " + p.prefs.consecutiveDaysOff + " consecutive off", forceable: true });
if (p.prefs.maxDaysPerWeek) pPrefs.push({ key: "maxDaysPerWeek", label: firstName(p) + " max " + p.prefs.maxDaysPerWeek + " days/wk", forceable: true });
if (p.prefs.maxOpeningPerWeek !== null && p.prefs.maxOpeningPerWeek !== undefined) pPrefs.push({ key: "maxOpeningPerWeek", label: firstName(p) + " max " + p.prefs.maxOpeningPerWeek + " opens/wk", forceable: true });
if (p.prefs.maxClosingPerWeek !== null && p.prefs.maxClosingPerWeek !== undefined) pPrefs.push({ key: "maxClosingPerWeek", label: firstName(p) + " max " + p.prefs.maxClosingPerWeek + " closes/wk", forceable: true });
pPrefs.forEach(function (pref) {
var isHonored = true;
var recTradeoffs = bestRec.score.perPerson.find(function (pp) { return pp.pharmacistId === p.id; });
if (recTradeoffs) { recTradeoffs.tradeoffs.forEach(function (t) { if (t.prefKey === pref.key) isHonored = false; }); }
if (!isHonored) {
var tweaked = pharms.map(function (q) { if (q.id !== p.id) return q; var nq = { ...q, prefs: { ...q.prefs, needs: { ...q.prefs.needs }, fixedDaysOff: [].concat(q.prefs.fixedDaysOff || []), preferredDaysOff: [].concat(q.prefs.preferredDaysOff || []), dayOverrides: Object.assign({}, q.prefs.dayOverrides || {}) } }; nq.prefs.needs[pref.key] = true; if (pref.key === "weekendPref" || pref.key === "preferredWeekendDay") { nq.prefs.weekendPref = "every_other_off"; nq.prefs.needs.weekendPref = true; } else { nq.prefs[pref.key] = true; } return nq; });
var bestForced = null, bestForcedG = -1;
for (var fi = 0; fi < 20; fi++) { var fsc = generateSchedule(store, tweaked, "business", fi * 11 + 3); var fvc = validateCandidate(fsc, pharms, store); if (!fvc.valid) continue; var fts = scoreTemplate(fsc, pharms, store); if (fts.total > bestForcedG) { bestForcedG = fts.total; bestForced = fts; } }
var delta = bestForced ? bestForced.total - bestRec.score.total : -99;
var fairDelta = bestForced ? (bestForced.components.fairness || 100) - (bestRec.score.components.fairness || 100) : 0;
var costLevel = delta >= -1 ? "low" : delta >= -4 ? "manageable" : delta >= -8 ? "expensive" : "not_advisable";
prefCosts.push({ pharmacistId: p.id, pharmacistName: firstName(p), color: p.color, prefKey: pref.key, label: pref.label, delta: delta, fairDelta: fairDelta, costLevel: costLevel, forcedGrade: bestForced ? bestForced.grade : "?", forcedScore: bestForced ? bestForced.total : null });
} else { prefCosts.push({ pharmacistId: p.id, pharmacistName: firstName(p), color: p.color, prefKey: pref.key, label: pref.label, delta: 0, fairDelta: 0, costLevel: "free", forcedGrade: bestRec.score.grade, forcedScore: null }); }
});
});
}
setResults(all); setWhatIf(prefCosts); setShowWk(0); setResultPanel(null); setGenerating(false); setStep(5);
}
function doReset() { setMode(null); setStep(0); setResults(null); setCurSched(null); setCurOverrides({}); setCurScore(null); setPharms([]); setShowWk(0); setResultPanel(null); setWhatIf(null); setFlash({}); setTeamWarning(null); setTipOpen(false); setHistory([]); setStore(freshStore()); }
var gc = function (g) { return !g ? Co.txD : g.startsWith("A") ? Co.gn : g.startsWith("B") ? Co.ac : g.startsWith("C") ? Co.am : Co.rd; };
var storeOpHrs = opHrs(store.hours);
var curOpHrs = mode === "improve" && store._hoursOfOpChanged && store._originalHours ? opHrs(store._originalHours) : storeOpHrs;
var curDemandHrs = mode === "improve" && store._hoursChanged && store._originalBudget ? +store._originalBudget : +store.allocatedHoursPerWeek;
var hasOverlap = (+store.allocatedHoursPerWeek || 0) > storeOpHrs;
var hasShortage = curOpHrs > 0 && curDemandHrs > 0 && curOpHrs > curDemandHrs;
var hasNewShortage = store._hoursOfOpChanged && storeOpHrs > 0 && (+store.allocatedHoursPerWeek || 0) > 0 && storeOpHrs > (+store.allocatedHoursPerWeek || 0);
var hasNoHoursChange = store._hoursOfOpChanged && store._originalHours && JSON.stringify(store.hours) === JSON.stringify(store._originalHours);
var combinedTarget = pharms.reduce(function (a, p) { return a + (+(p.targetHours) || 0); }, 0);
var resultsStep = 5;
var preResultsSteps = 5;
var curVisible = step + 1;
var progress = mode === null ? 0 : step >= resultsStep ? 100 : Math.round((curVisible / (preResultsSteps + 1)) * 100);
function pushHistory() { setHistory(function (h) { return h.concat([{ step: step, store: JSON.parse(JSON.stringify(store)), pharms: JSON.parse(JSON.stringify(pharms)) }]); }); }
function nextStep() { pushHistory(); setShowMissing(false); setStep(step + 1); }
function prevStep() { setShowMissing(false); setTeamWarning(null); setFlash({}); if (step === 0) { setMode(null); return; } setHistory(function (h) { if (h.length === 0) { setStep(step - 1); return h; } var prev = h[h.length - 1]; setStore(JSON.parse(JSON.stringify(prev.store))); setPharms(JSON.parse(JSON.stringify(prev.pharms))); setStep(prev.step); return h.slice(0, -1); }); }
function storeTopRow() { return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
<Card style={{ padding: 12, marginBottom: 0 }}>
<div style={{ fontSize: 13, fontWeight: 700, color: Co.tx, marginBottom: 8, textAlign: "center" }}>Store Label</div>
<Inp value={store.storeLabel} onChange={function (e) { setShowMissing(false); setStore(function (s) { return { ...s, storeLabel: e.target.value.slice(0, 10) }; }); }} placeholder="Optional" maxLength={10} style={{ fontSize: 15, textAlign: "center", width: "100%", height: 42, color: store.storeLabel ? Co.tx : Co.txD }} />
</Card>
<Card style={{ padding: 12, marginBottom: 0 }}>
<div style={{ fontSize: 13, fontWeight: 700, color: Co.tx, marginBottom: 8, textAlign: "center" }}>24-Hour Pharmacy?</div>
<div style={{ display: "flex", gap: 4 }}>
<div role="button" tabIndex={0} aria-pressed={store.is24hr} onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); var s2 = { ...store, is24hr: true }; if (!s2.ovnt) s2.ovnt = { wkdayIn: "21:00", wkdayOut: "08:00", wkndIn: "21:00", wkndOut: "09:00" }; setStore(s2); } }} onClick={function () { var s2 = { ...store, is24hr: true }; if (!s2.ovnt) s2.ovnt = { wkdayIn: "21:00", wkdayOut: "08:00", wkndIn: "21:00", wkndOut: "09:00" }; setStore(s2); }} style={{ flex: 1, padding: "10px 0", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center", background: store.is24hr ? Co.pu : "transparent", color: store.is24hr ? "#fff" : Co.txMu, border: "1px solid " + (store.is24hr ? Co.pu : Co.bdr) }}>Yes</div>
<div role="button" tabIndex={0} aria-pressed={!store.is24hr} onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStore(function (s) { return { ...s, is24hr: false }; }); } }} onClick={function () { setStore(function (s) { return { ...s, is24hr: false }; }); }} style={{ flex: 1, padding: "10px 0", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center", background: !store.is24hr ? Co.tx + "15" : "transparent", color: !store.is24hr ? Co.tx : Co.txMu, border: "1px solid " + (!store.is24hr ? Co.tx + "40" : Co.bdr) }}>No</div>
</div>
</Card>
</div>; }
function overnightCard() { return <Card style={{ borderLeft: "3px solid " + Co.pu }}>
<div style={{ fontSize: 14, fontWeight: 700, color: Co.pu, marginBottom: 4 }}>Overnight RPh Shift</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 10 }}>7 nights on, 7 nights off.</div>
<div style={{ fontSize: 11, fontWeight: 600, color: Co.txMu, marginBottom: 4 }}>Weekdays</div>
<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><span style={{ fontSize: 12 }}>In</span><TSel value={(store.ovnt || {}).wkdayIn || "21:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkdayIn: v } }; }); }} /><div style={{ width: 1, height: 20, background: Co.bdrL, marginLeft: 2 }} /><span style={{ fontSize: 12 }}>Out</span><TSel value={(store.ovnt || {}).wkdayOut || "08:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkdayOut: v } }; }); }} /></div>
<div style={{ fontSize: 11, fontWeight: 600, color: Co.txMu, marginBottom: 4 }}>Weekends</div>
<div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 12 }}>In</span><TSel value={(store.ovnt || {}).wkndIn || "21:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkndIn: v } }; }); }} /><div style={{ width: 1, height: 20, background: Co.bdrL, marginLeft: 2 }} /><span style={{ fontSize: 12 }}>Out</span><TSel value={(store.ovnt || {}).wkndOut || "09:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkndOut: v } }; }); }} /></div>
</Card>; }
return (
<div style={{ minHeight: "100vh", background: Co.bg, color: Co.tx, textWrap: "pretty", ...font }}>
<style>{"@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap'); @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes shimmer{0%{background-position:200% 50%}100%{background-position:-200% 50%}}"}</style>
{/* HEADER BAR */}
<div className="header-bar" style={{ background: Co.card, borderBottom: "1px solid " + Co.bdr }}>
<div className="header-brand" style={{ opacity: mode === null ? 0.5 : 1 }}><span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em", color: Co.tx }}><span style={{ color: Co.ac }}>Rx</span>Rotation</span><span style={{ fontSize: 8, fontWeight: 600, color: Co.txMu, letterSpacing: 0.3, padding: "1px 3px", background: Co.bg, border: "1px solid " + Co.bdr, borderRadius: 2, position: "relative", top: -2 }}>LITE</span></div>
<div className="header-divider" />
<span style={{ fontSize: 9, color: Co.txMu, whiteSpace: "nowrap", flexShrink: 0, letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>Madden Frameworks</span>
{mode !== null ? <div style={{ display: "flex", alignItems: "center", marginLeft: 6, flexShrink: 0 }}><div className="header-divider" style={{ marginRight: 6 }} /><span style={{ fontSize: 9, fontWeight: 700, color: mode === "improve" ? Co.ac : Co.tl, letterSpacing: 0.3, textTransform: "uppercase", padding: "1px 4px", background: (mode === "improve" ? Co.ac : Co.tl) + "15", borderRadius: 2 }}>{mode === "improve" ? "Improve" : "New"}</span></div> : null}
<div style={{ flex: 1, minWidth: 2 }} />
<div role="button" tabIndex={0} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="icon-btn" onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDark(!dark); } }} onClick={function () { setDark(!dark); }} style={{ marginRight: 3 }}><span>{dark ? "\u2600\uFE0F" : "\uD83C\uDF19"}</span></div>
<div role="button" tabIndex={0} aria-label="Help" className="icon-btn" onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowHelp(true); } }} onClick={function () { setShowHelp(true); }}><span>{"\u2139\uFE0F"}</span></div>
</div>
{mode !== null && step < resultsStep ? <div className="progress-bar"><div className="progress-bar-fill" style={{ width: progress + "%" }} /></div> : null}
{/* HELP PANEL */}
{showHelp ? (
<div role="dialog" aria-modal="true" aria-label="Help" className="help-overlay">
<div onClick={function () { setShowHelp(false); }} className="help-backdrop" />
<div className="help-panel">
<div style={{ background: "linear-gradient(135deg, #3D9A6D 0%, #2D7A54 50%, #236645 100%)", padding: "28px 20px 22px", color: "#fff" }}>
<div style={{ display: "flex", alignItems: "flex-start" }}><div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85, marginBottom: 6 }}>Madden Frameworks</div><div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}><span style={{ color: "#6BC4A0" }}>Rx</span>Rotation</span><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, padding: "2px 7px", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 4, verticalAlign: "middle", position: "relative", top: -2 }}>LITE</span></div></div><div role="button" tabIndex={0} aria-label="Close help" onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowHelp(false); } }} onClick={function () { setShowHelp(false); }} style={{ fontSize: 18, cursor: "pointer", opacity: 0.7, padding: "2px 6px", marginTop: -4 }}>{"\u2715"}</div></div>
<div style={{ fontSize: 13, opacity: 0.9, marginTop: 8, lineHeight: 1.5 }}>Build optimized pharmacist schedules. The system evaluates every template against six weighted business criteria and surfaces the strongest option.</div>
</div>
<div style={{ padding: "16px 20px 32px" }}>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "16px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>How It Works</div>
{[{ n: "1", t: "Set up your store", d: "Store label (optional), weekly demand hours, rotation length (2\u20135 weeks), operating hours, and day-of-week traffic ranking." }, { n: "2", t: "Add your team", d: "Pharmacy Manager, Staff Pharmacist(s), and optionally DSP or Overnight RPh. Set preferences and constraints for each person." }, { n: "3", t: "Generate", d: "The system runs the schedule engine across all six scoring criteria and returns a recommended template with a letter grade, preference impact analysis, and full breakdown." }].map(function (s) {
return <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 12 }}>
<div style={{ width: 28, height: 28, borderRadius: 14, background: Co.ac, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
<div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{s.t}</div><div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.5 }}>{s.d}</div></div>
</div>;
})}
</div>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "16px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Two Starting Points</div>
<div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
<div style={{ width: 36, height: 36, borderRadius: 8, background: Co.acS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{"\uD83D\uDD04"}</div>
<div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700 }}>Improve existing schedule</div><div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.5 }}>Something changed. Enter your current template on an interactive grid, see how it grades, and get a stronger recommendation with a side-by-side comparison.</div></div>
</div>
<div style={{ display: "flex", gap: 10 }}>
<div style={{ width: 36, height: 36, borderRadius: 8, background: Co.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{"\uD83D\uDCC4"}</div>
<div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700 }}>Build from scratch</div><div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.5 }}>No existing template. Set up your store and team, then generate a recommended schedule with full analysis.</div></div>
</div>
</div>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "16px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>How Scoring Works</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 10 }}>Every template receives a letter grade (A+ through F) based on six weighted business criteria.</div>
{[{ l: "Coverage", w: "30%", c: Co.ac, d: "Every open hour has a pharmacist on duty" }, { l: "Demand Fit", w: "20%", c: Co.gn, d: "Scheduled hours align with weekly demand hours" }, { l: "Fairness", w: "15%", c: Co.tl, d: "Weekends, opens, and closes distributed equitably across team" }, { l: "Peak Strength", w: "15%", c: Co.am, d: "Strongest pharmacist on duty during highest-traffic windows" }, { l: "Sustainability", w: "10%", c: Co.tl, d: "Workload burden distributed evenly, no one person overloaded" }, { l: "Preferences", w: "10%", c: Co.pu, d: "Individual pharmacist preferences honored where possible" }].map(function (f) {
return <div key={f.l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid " + Co.bdrL }}><div style={{ width: 4, height: 24, borderRadius: 2, background: f.c, flexShrink: 0 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{f.l}</div><div style={{ fontSize: 11, color: Co.txMu }}>{f.d}</div></div><div style={{ ...mono, fontSize: 12, fontWeight: 700, color: f.c, flexShrink: 0 }}>{f.w}</div></div>;
})}
</div>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "16px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Needs vs. Wants</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 10 }}>Each pharmacist preference can be flagged as a Need or a Want. This determines how the system handles tradeoffs.</div>
<div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
<div style={{ flex: 1, padding: "10px 12px", background: Co.rdS, borderRadius: 8, borderLeft: "3px solid " + Co.rd }}><div style={{ fontSize: 12, fontWeight: 700, color: Co.rd, marginBottom: 3 }}>NEED</div><div style={{ fontSize: 11, color: Co.txM, lineHeight: 1.5 }}>Strong constraint. The system honors this unless it would break store coverage or viability. Overrides are flagged as serious compromises.</div></div>
<div style={{ flex: 1, padding: "10px 12px", background: Co.amS, borderRadius: 8, borderLeft: "3px solid " + Co.am }}><div style={{ fontSize: 12, fontWeight: 700, color: Co.am, marginBottom: 3 }}>WANT</div><div style={{ fontSize: 11, color: Co.txM, lineHeight: 1.5 }}>Soft preference. The business can override this when a stronger schedule requires it. Shows as a normal tradeoff.</div></div>
</div>
</div>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "16px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Understanding Results</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 10 }}>The results page gives you one recommended schedule plus the tools to understand every tradeoff.</div>
{[{ ico: "\u2605", t: "Recommended Schedule", d: "The highest-scoring template across all six criteria. Includes a weekly grid with shift times, per-person stats, and a letter grade." }, { ico: "\u26A0", t: "Conflict Report", d: "Per-person checklist of every preference: met or unmet. Shows fixed constraints, tradeoff details, and need/want severity. Built for the shared screen." }, { ico: "\u29C9", t: "Rotation View", d: "Color-coded grid of the full rotation at a glance. See who works every day across all weeks in one view." }, { ico: "\u2261", t: "Preference Impact", d: "Point cost of forcing each unmet preference. Categorized as free, low cost, manageable, or expensive." }, { ico: "\u2753", t: "What If We Honored Everything?", d: "Shows what happens if every preference is treated as a need. Displays the score cost and component breakdown so you can see exactly where the tradeoff hits." }, { ico: "\u21C4", t: "vs. Current", d: "In Improve mode, a side-by-side comparison shows point deltas across every scoring component and highlights what the new schedule fixes." }].map(function (item) {
return <div key={item.t} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
<div style={{ width: 28, height: 28, borderRadius: 6, background: Co.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{item.ico}</div>
<div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 1 }}>{item.t}</div><div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.5 }}>{item.d}</div></div>
</div>;
})}
</div>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "16px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Template Grid Codes</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 10 }}>When entering your current schedule in Improve mode, tap cells to assign pharmacists to days.</div>
<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
{[{ code: "F", label: "Full day", desc: "One person covers open to close", color: Co.tl }, { code: "O", label: "Opens", desc: "First half of a split day", color: "#5B8DEF" }, { code: "C", label: "Closes", desc: "Second half of a split day", color: Co.pu }, { code: "W", label: "Working", desc: "Three or more people on a day", color: Co.am }].map(function (g) {
return <div key={g.code} style={{ flex: "1 1 45%", padding: "8px 10px", background: g.color + "0c", borderRadius: 6, border: "1px solid " + g.color + "20", marginBottom: 4 }}>
<div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ ...mono, fontSize: 16, fontWeight: 700, color: g.color }}>{g.code}</span><span style={{ fontSize: 12, fontWeight: 600 }}>{g.label}</span></div>
<div style={{ fontSize: 11, color: Co.txMu, marginTop: 2 }}>{g.desc}</div>
</div>;
})}
</div>
</div>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "16px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Pharmacist Roles</div>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
{[{ role: "PM", full: "Pharmacy Manager", desc: "One per store. Anchored to busiest day.", color: Co.ac }, { role: "Staff RPh", full: "Staff Pharmacist", desc: "One or more. Shares rotation with PM.", color: Co.rd }, { role: "DSP", full: "Other RPh", desc: "Supplemental coverage on specific days.", color: Co.tl }, { role: "OVNT", full: "Overnight", desc: "24hr only. 7-on/7-off rotation.", color: Co.pu }].map(function (r) {
return <div key={r.role} style={{ padding: "10px 12px", borderRadius: 8, background: r.color + "0c", border: "1px solid " + r.color + "20" }}>
<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><div style={{ ...mono, fontSize: 13, fontWeight: 700, color: r.color }}>{r.role}</div><div style={{ fontSize: 11, color: Co.txMu }}>{r.full}</div></div>
<div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.4 }}>{r.desc}</div>
</div>;
})}
</div>
</div>
<div style={{ background: "linear-gradient(135deg, " + Co.pu + "18 0%, " + Co.pu + "08 100%)", borderRadius: 10, border: "1px solid " + Co.pu + "25", padding: "16px 16px", marginBottom: 12 }}>
<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
<div style={{ width: 32, height: 32, borderRadius: 8, background: Co.pu + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{"\uD83C\uDF19"}</div>
<div style={{ fontSize: 13, fontWeight: 700 }}>24-Hour Stores</div>
</div>
<div style={{ fontSize: 12, color: Co.txM, lineHeight: 1.6, marginBottom: 10 }}>Supports 24-hour pharmacies with configurable overnight RPh shifts.</div>
<div style={{ display: "flex", gap: 6 }}>
{[{ n: "Weekday", v: "Custom in/out" }, { n: "Weekend", v: "Separate times" }, { n: "Rotation", v: "7-on / 7-off" }].map(function (item) {
return <div key={item.n} style={{ flex: 1, padding: "8px 8px", background: Co.card, borderRadius: 6, textAlign: "center" }}>
<div style={{ fontSize: 11, fontWeight: 700, color: Co.pu }}>{item.n}</div>
<div style={{ fontSize: 11, color: Co.txMu, marginTop: 2 }}>{item.v}</div>
</div>;
})}
</div>
</div>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "18px 16px", marginBottom: 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Privacy by Design</div>
<div style={{ fontSize: 12, color: Co.txMu, lineHeight: 1.5, marginBottom: 12 }}>Zero data stored. Zero data transmitted. Everything runs in your browser and resets when you close the tab.</div>
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
{[{ ico: "\u2205", l: "No database", c: Co.gn }, { ico: "\u21E5", l: "No network calls", c: Co.ac }, { ico: "\u29B0", l: "Session only", c: Co.am }, { ico: "\u2387", l: "Labels optional", c: Co.txMu }].map(function (item) {
return <div key={item.l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: Co.bg, borderRadius: 6 }}>
<div style={{ fontSize: 14, color: item.c, flexShrink: 0 }}>{item.ico}</div>
<div style={{ fontSize: 11, fontWeight: 600, color: Co.txM }}>{item.l}</div>
</div>;
})}
</div>
</div>
<div style={{ textAlign: "center", padding: "16px 0 4px" }}>
<div style={{ fontSize: 12, fontWeight: 700, color: Co.txMu, letterSpacing: 0.5, marginBottom: 4 }}>MADDEN FRAMEWORKS</div>
<div style={{ fontSize: 12, color: Co.txD }}>Schedule strength first. Preferences second.</div>
</div>
</div>
</div>
</div>
) : null}
<div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 80px" }}>
{/* LANDING PAGE */}
{mode === null && (
<div style={{ paddingTop: 12 }}>
<div style={{ marginBottom: 20, paddingLeft: 4, position: "relative" }}>
<svg width="80" height="80" viewBox="0 0 24 24" style={{ position: "absolute", top: -4, right: 24, opacity: 0.1, animation: "spin 20s linear infinite" }}><path d="M21 2v6h-6" fill="none" stroke={Co.ac} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" fill="none" stroke={Co.ac} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 22v-6h6" fill="none" stroke={dark ? "#ffffff" : "#1c1917"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" fill="none" stroke={dark ? "#ffffff" : "#1c1917"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
<div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.03em", color: Co.tx, lineHeight: 1.1 }}><span style={{ color: Co.ac }}>Rx</span>Rotation <span style={{ fontSize: 13, fontWeight: 600, color: Co.txMu, letterSpacing: 0.5, padding: "2px 8px", background: Co.bg, border: "1px solid " + Co.bdr, borderRadius: 4, verticalAlign: "middle", position: "relative", top: -2 }}>LITE</span></div>
<div style={{ fontSize: 16, color: Co.txMu, marginTop: 8, lineHeight: 1.5 }}>Build stronger pharmacist schedules.<br />See the tradeoffs. Pick what fits.</div>
</div>
<div role="button" tabIndex={0} aria-label="Improve current schedule" onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMode("improve"); } }} onClick={function () { setMode("improve"); }} className="landing-card-improve" style={{ background: "linear-gradient(135deg, #3D9A6D 0%, #2D7A54 60%, #236645 100%)", boxShadow: "0 8px 32px rgba(61,154,109,0.25)", marginBottom: 14 }}>
<div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: 60, background: "rgba(255,255,255,0.06)" }} />
<div style={{ position: "relative" }}><div style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>Most common path</div><div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Improve current schedule</div><div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.7, marginBottom: 20 }}>Enter what you{"'"}re running now.<br />See how it grades, where it{"'"}s weak,<br />and what{"'"}s stronger.</div><div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, background: "rgba(255,255,255,0.2)", padding: "10px 20px", borderRadius: 10 }}>Get started {"\u2192"}</div></div>
</div>
<div role="button" tabIndex={0} aria-label="Build a new template" onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMode("scratch"); } }} onClick={function () { setMode("scratch"); }} className="landing-card-scratch" style={{ background: Co.card, boxShadow: shadow.md, border: "1px solid " + Co.bdr }}>
<div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: Co.ac, borderRadius: "16px 0 0 16px" }} />
<div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ flex: 1 }}><div style={{ fontSize: 16, fontWeight: 700, color: Co.tx, marginBottom: 6 }}>Build a new template</div><div style={{ fontSize: 13, color: Co.txMu, lineHeight: 1.5 }}>New store or new team. Start from zero.</div></div><div style={{ fontSize: 20, color: Co.ac, fontWeight: 700, flexShrink: 0 }}>{"\u2192"}</div></div>
</div>
<div style={{ marginTop: 24, display: "flex", justifyContent: "center", alignItems: "center" }}>
{[{ v: "6", l: "Criteria" }, { v: "1", l: "Recommendation" }, { v: "0", l: "Stored" }].map(function (s, si) { return <div key={s.l} style={{ display: "flex", alignItems: "center" }}>{si > 0 ? <div style={{ width: 1, height: 32, background: Co.bdr, margin: "0 20px", flexShrink: 0 }} /> : null}<div style={{ textAlign: "center" }}><div style={{ ...mono, fontSize: 26, fontWeight: 700, color: Co.ac, lineHeight: 1 }}>{s.v}</div><div style={{ fontSize: 13, fontWeight: 600, color: Co.txMu, marginTop: 4 }}>{s.l}</div></div></div>; })}
</div>
<div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: Co.txMu }}>Nothing is saved. No data leaves your device.</div>
<div style={{ marginTop: 32, paddingBottom: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}><div style={{ padding: "8px 20px", border: "1px solid " + Co.bdrL, borderRadius: 20, fontSize: 11, fontWeight: 600, color: Co.txD, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>Madden Frameworks {"\u00B7"} {"\u00A9"} 2026</div><div style={{ fontSize: 13, color: Co.txD, opacity: 0.5, fontStyle: "italic" }}>Smart systems. Better judgment.</div></div>
</div>
)}
{/* STEP 0: Store basics */}
{step === 0 && mode === "scratch" && (
<div>
<div className="section-heading">Store basics</div>
<div style={{ fontSize: 13, color: Co.txMu, marginBottom: 16 }}>Set your RPh demand hours and rotation length.</div>
{storeTopRow()}
{/* RPH DEMAND HOURS */}
<Card style={{ padding: "14px 16px", marginBottom: 10 }}>
<div style={{ display: "flex", alignItems: "center" }}>
<span style={{ fontSize: 14, fontWeight: 700, color: showMissing && store.allocatedHoursPerWeek === "" ? Co.rd : Co.tx }}>RPh Demand Hours{showMissing && store.allocatedHoursPerWeek === "" ? <span style={{ color: Co.rd }}> *</span> : null}</span>
<div style={{ flex: 1 }} />
<Inp type="number" step="0.5" value={store.allocatedHoursPerWeek === "" ? "" : store.allocatedHoursPerWeek} onChange={function (e) { setShowMissing(false); setStore(function (s) { return { ...s, allocatedHoursPerWeek: e.target.value === "" ? "" : Math.max(0, +e.target.value) }; }); }} onBlur={function () { setStore(function (s) { return { ...s, allocatedHoursPerWeek: s.allocatedHoursPerWeek === "" ? 81 : s.allocatedHoursPerWeek }; }); }} style={{ ...mono, fontSize: 17, fontWeight: 700, textAlign: "center", width: 74, height: 42, border: showMissing && store.allocatedHoursPerWeek === "" ? "1.5px solid " + Co.rd : "1px solid " + Co.bdr, padding: "2px 6px" }} />
<span style={{ fontSize: 13, color: Co.txMu, marginLeft: 8, flexShrink: 0 }}>hours/week</span>
</div>
</Card>
{/* ROTATION CYCLE LENGTH */}
<Card style={{ padding: "14px 16px", marginBottom: 10 }}>
<div style={{ display: "flex", alignItems: "center" }}>
<span style={{ fontSize: 14, fontWeight: 700, color: Co.tx }}>Rotation Cycle Length</span>
<div style={{ flex: 1 }} />
<Sel value={store.rotationWeeks} onChange={function (v) { setStore(function (s) { return { ...s, rotationWeeks: +v }; }); }} style={{ width: 128, padding: "12px 28px 14px 10px", ...mono, fontSize: 15, fontWeight: 700 }}><option value={2}>2 weeks</option><option value={3}>3 weeks</option><option value={4}>4 weeks</option><option value={5}>5 weeks</option></Sel>
</div>
</Card>
{store.is24hr ? overnightCard() : null}
</div>
)}
{step === 0 && mode === "improve" && (
<div>
<div className="section-heading">Store basics</div>
<div style={{ fontSize: 13, color: Co.txMu, marginBottom: 16 }}>Confirm what{"'"}s staying the same and what{"'"}s changing.</div>
{storeTopRow()}
{/* RPH DEMAND HOURS */}
<Card style={{ padding: "14px 16px", marginBottom: 10 }}>
<div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
<span style={{ fontSize: 14, fontWeight: 700, color: Co.tx }}>Current RPh Demand Hours</span>
<div style={{ flex: 1 }} />
<Inp type="number" step="0.5" value={store._hoursChanged ? (store._originalBudget === "" ? "" : store._originalBudget) : (store.allocatedHoursPerWeek === "" ? "" : store.allocatedHoursPerWeek)} onChange={function (e) { setShowMissing(false); var v = e.target.value === "" ? "" : Math.max(0, +e.target.value); setStore(function (s) { if (s._hoursChanged) { return { ...s, _originalBudget: v }; } return { ...s, allocatedHoursPerWeek: v }; }); }} onBlur={function () { setStore(function (s) { if (s._hoursChanged) { return { ...s, _originalBudget: s._originalBudget === "" ? 81 : s._originalBudget }; } return { ...s, allocatedHoursPerWeek: s.allocatedHoursPerWeek === "" ? 81 : s.allocatedHoursPerWeek }; }); }} style={{ ...mono, fontSize: 17, fontWeight: 700, textAlign: "center", width: 74, height: 42, border: showMissing && store.allocatedHoursPerWeek === "" ? "1.5px solid " + Co.rd : "1px solid " + Co.bdr, padding: "2px 6px" }} />
<span style={{ fontSize: 13, color: Co.txMu, marginLeft: 8, flexShrink: 0 }}>hours/week</span>
</div>
<div className="seg-control" style={{ border: "1px solid " + Co.bdr }}>
<div onClick={function () { setStore(function (s) { return { ...s, _hoursChanged: false, allocatedHoursPerWeek: s._originalBudget || s.allocatedHoursPerWeek }; }); }} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: !store._hoursChanged ? Co.ac : "transparent", color: !store._hoursChanged ? "#fff" : Co.txMu }}>Same for new template</div>
<div onClick={function () { setStore(function (s) { return { ...s, _hoursChanged: true, _originalBudget: s._originalBudget || s.allocatedHoursPerWeek }; }); }} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: store._hoursChanged ? Co.am : "transparent", color: store._hoursChanged ? "#fff" : Co.txMu, borderLeft: "1px solid " + Co.bdr }}>Changed</div>
</div>
{store._hoursChanged ? <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + Co.bdrL, display: "flex", alignItems: "center" }}>
<span style={{ fontSize: 14, color: Co.am, fontWeight: 700 }}>New RPh Demand Hours</span>
<div style={{ flex: 1 }} />
<Inp type="number" step="0.5" value={store.allocatedHoursPerWeek === "" ? "" : store.allocatedHoursPerWeek} onChange={function (e) { setStore(function (s) { return { ...s, allocatedHoursPerWeek: e.target.value === "" ? "" : Math.max(0, +e.target.value) }; }); }} style={{ ...mono, fontSize: 17, fontWeight: 700, textAlign: "center", width: 74, height: 42, padding: "2px 6px" }} />
<span style={{ fontSize: 13, color: Co.txMu, marginLeft: 8, flexShrink: 0 }}>hours/week</span>
</div> : null}
{store._hoursChanged ? (function () { var cur = +(store._originalBudget || 0); var nw = +(store.allocatedHoursPerWeek || 0); var diff = nw - cur; if (diff === 0 || !cur) return null; return <div style={{ marginTop: 6, fontSize: 12, color: diff > 0 ? Co.gn : Co.rd, fontWeight: 600 }}>{diff > 0 ? "\u25B2" : "\u25BC"} {fmtH(Math.abs(diff))}h {diff > 0 ? "increase" : "decrease"} ({fmtH(cur)}h {"\u2192"} {fmtH(nw)}h)</div>; })() : null}
</Card>
{/* ROTATION CYCLE LENGTH */}
<Card style={{ padding: "14px 16px", marginBottom: 10 }}>
<div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
<span style={{ fontSize: 14, fontWeight: 700, color: Co.tx }}>Current Rotation Cycle Length</span>
<div style={{ flex: 1 }} />
<Sel value={store._rotChanged ? (store._originalRot || store.rotationWeeks) : store.rotationWeeks} onChange={function (v) { setStore(function (s) { if (s._rotChanged) { return { ...s, _originalRot: +v }; } return { ...s, rotationWeeks: +v }; }); }} style={{ width: 128, padding: "12px 28px 14px 10px", ...mono, fontSize: 15, fontWeight: 700 }}><option value={2}>2 weeks</option><option value={3}>3 weeks</option><option value={4}>4 weeks</option><option value={5}>5 weeks</option></Sel>
</div>
<div className="seg-control" style={{ border: "1px solid " + Co.bdr }}>
<div onClick={function () { setStore(function (s) { return { ...s, _rotChanged: false, rotationWeeks: s._originalRot || s.rotationWeeks }; }); }} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: !store._rotChanged ? Co.ac : "transparent", color: !store._rotChanged ? "#fff" : Co.txMu }}>Same for new template</div>
<div onClick={function () { setStore(function (s) { return { ...s, _rotChanged: true, _originalRot: s._originalRot || s.rotationWeeks }; }); }} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: store._rotChanged ? Co.am : "transparent", color: store._rotChanged ? "#fff" : Co.txMu, borderLeft: "1px solid " + Co.bdr }}>Changed</div>
</div>
{store._rotChanged ? <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + Co.bdrL }}>
<div style={{ fontSize: 12, color: Co.txMu, lineHeight: 1.5, transition: "transform 0.15s, box-shadow 0.15s", padding: "10px 12px", background: Co.amS, borderRadius: 8, border: "1px solid " + Co.am + "30", transform: flash.rot ? "scale(1.02)" : "none", boxShadow: flash.rot ? "0 0 0 2px " + Co.am + "50" : "none" }}>Changing rotation cycle length will result in a fundamentally different template. Go back to the home screen and use <span style={{ fontWeight: 700, color: Co.tx }}>Build a new template</span> instead.</div>
</div> : null}
</Card>
{/* OVERNIGHT SHIFT DETAILS */}
{store.is24hr ? (
<Card style={{ borderLeft: "3px solid " + Co.pu }}>
<div style={{ fontSize: 14, fontWeight: 700, color: Co.pu, marginBottom: 4 }}>Overnight RPh Shift</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 10 }}>7 nights on, 7 nights off.</div>
<div style={{ fontSize: 11, fontWeight: 600, color: Co.txMu, marginBottom: 4 }}>Weekdays</div>
<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><span style={{ fontSize: 12 }}>In</span><TSel value={(store.ovnt || {}).wkdayIn || "21:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkdayIn: v } }; }); }} /><div style={{ width: 1, height: 20, background: Co.bdrL, marginLeft: 2 }} /><span style={{ fontSize: 12 }}>Out</span><TSel value={(store.ovnt || {}).wkdayOut || "08:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkdayOut: v } }; }); }} /></div>
<div style={{ fontSize: 11, fontWeight: 600, color: Co.txMu, marginBottom: 4 }}>Weekends</div>
<div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 12 }}>In</span><TSel value={(store.ovnt || {}).wkndIn || "21:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkndIn: v } }; }); }} /><div style={{ width: 1, height: 20, background: Co.bdrL, marginLeft: 2 }} /><span style={{ fontSize: 12 }}>Out</span><TSel value={(store.ovnt || {}).wkndOut || "09:00"} onChange={function (v) { setStore(function (s) { return { ...s, ovnt: { ...(s.ovnt || {}), wkndOut: v } }; }); }} /></div>
{mode === "improve" ? <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid " + Co.bdrL }}>
<div style={{ fontSize: 12, fontWeight: 700, color: Co.tx, marginBottom: 6 }}>Staying a 24-hour pharmacy?</div>
<div style={{ display: "flex", gap: 4 }}>
<div onClick={function () { setStore(function (s) { return { ...s, _24hrChanging: false }; }); }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: !store._24hrChanging ? Co.pu : "transparent", color: !store._24hrChanging ? "#fff" : Co.txMu, border: "1px solid " + (!store._24hrChanging ? Co.pu : Co.bdr) }}>Yes</div>
<div onClick={function () { setStore(function (s) { return { ...s, _24hrChanging: true }; }); }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: store._24hrChanging ? Co.am : "transparent", color: store._24hrChanging ? "#fff" : Co.txMu, border: "1px solid " + (store._24hrChanging ? Co.am : Co.bdr) }}>No</div>
</div>
{store._24hrChanging ? <div style={{ marginTop: 8, fontSize: 12, color: Co.txMu, lineHeight: 1.5, padding: "10px 12px", background: Co.amS, borderRadius: 8, border: "1px solid " + Co.am + "30", transition: "transform 0.15s, box-shadow 0.15s", transform: flash.hr24 ? "scale(1.02)" : "none", boxShadow: flash.hr24 ? "0 0 0 2px " + Co.am + "50" : "none" }}>Transitioning from 24-hour to a non-24-hour operating model is a major structural change. Go back to the home screen and use <span style={{ fontWeight: 700, color: Co.tx }}>Build a new template</span> instead.</div> : null}
</div> : null}
</Card>
) : null}
</div>
)}
{/* STEP 1: Operating Hours */}
{step === 1 && (
<div>
<div className="section-heading" style={{ marginBottom: 2 }}>{store.is24hr ? "Daytime pharmacy hours" : mode === "improve" ? "Hours of operation" : "Operating hours"}</div>
<div style={{ fontSize: 13, color: Co.txMu, marginBottom: 10, lineHeight: 1.6 }}>{store.is24hr ? "When does the daytime pharmacy operate?" : mode === "improve" ? <span>Confirm current hours below.<br />If they{"\u2019"}re changing, you{"\u2019"}ll enter the new ones too.</span> : "When is the pharmacy open?"}</div>
<Card style={{ padding: 14 }}>
{mode === "improve" ? <div style={{ fontSize: 13, fontWeight: 700, color: Co.tx, marginBottom: 2 }}>Current Operating Hours <span style={{ fontWeight: 500, color: Co.txMu }}>{"\u00B7"} {fmtH(mode === "improve" && store._hoursChanged && store._originalBudget ? store._originalBudget : store.allocatedHoursPerWeek)}h demand</span></div> : null}
{mode === "improve" ? <div style={{ fontSize: 11, color: Co.txMu, marginBottom: 6 }}>{store._hoursOfOpChanged ? "Locked \u2014 switch to Same to edit." : "The hours your existing template is built around."}</div> : null}
{DAYS.map(function (d) {
var isLocked = mode === "improve" && store._hoursOfOpChanged;
var srcHours = isLocked && store._originalHours ? store._originalHours : store.hours;
var dh = srcHours[d]; var dayHrs = dh.isOpen ? ((t2m(dh.close) - t2m(dh.open)) / 60) : 0;
return <div key={d} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 0", borderBottom: "1px solid " + Co.bdrL, opacity: isLocked ? 0.6 : 1 }}>
<div style={{ width: 28, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{d}</div>
{isLocked ? null : (d === "Sun" ? <Tog small value={dh.isOpen} onChange={function (v) { setStore(function (s) { var h = { ...s.hours }; h[d] = { ...h[d], isOpen: v }; var r = (s.dayRanking || DAYS).slice(); var t = (s.dayTies || []).slice(); if (!v) { var ri = r.indexOf(d); if (ri >= 0) { t = t.filter(function (ti) { return ti !== ri && ti !== ri - 1; }).map(function (ti) { return ti > ri ? ti - 1 : ti; }); r.splice(ri, 1); } } else if (!r.includes(d)) { r.push(d); } return { ...s, hours: h, dayRanking: r, dayTies: t }; }); }} /> : null)}
{isLocked ? <span style={{ fontSize: 12, color: Co.txMu, flex: 1 }}>{dh.isOpen ? tL(dh.open) + " \u2013 " + tL(dh.close) : "Closed"}</span>
: (dh.isOpen ? <div style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }}><TSel value={dh.open} onChange={function (v) { setStore(function (s) { var h = { ...s.hours }; h[d] = { ...h[d], open: v }; return { ...s, hours: h }; }); }} style={{ flex: 1, minWidth: 0, width: "auto" }} /><span style={{ fontSize: 11, color: Co.txD, flexShrink: 0 }}>{"\u2013"}</span><TSel value={dh.close} onChange={function (v) { setStore(function (s) { var h = { ...s.hours }; h[d] = { ...h[d], close: v }; return { ...s, hours: h }; }); }} style={{ flex: 1, minWidth: 0, width: "auto" }} /></div> : <span style={{ fontSize: 11, color: Co.txD, flex: 1 }}>Closed</span>)}
<span style={{ ...mono, fontSize: 11, color: dh.isOpen ? Co.txMu : Co.txD, minWidth: 24, textAlign: "right", flexShrink: 0 }}>{dh.isOpen ? fmtH(dayHrs) + "h" : ""}</span>
</div>;
})}
<div style={{ display: "flex", alignItems: "center", marginTop: 4, padding: "4px 0", gap: 8 }}><span style={{ fontSize: 12, fontWeight: 600 }}>Total</span><span style={{ ...mono, fontSize: 13, fontWeight: 700, color: Co.tx }}>{fmtH(mode === "improve" && store._hoursOfOpChanged && store._originalHours ? opHrs(store._originalHours) : storeOpHrs)}h/wk</span><div style={{ flex: 1 }} />{(function () {
var curOpH = mode === "improve" && store._hoursOfOpChanged && store._originalHours ? opHrs(store._originalHours) : storeOpHrs;
var curDemand = mode === "improve" && store._hoursChanged && store._originalBudget ? +store._originalBudget : +store.allocatedHoursPerWeek;
if (curOpH <= 0 || curDemand <= 0) return null;
var diff = curDemand - curOpH;
var clr = diff > 0 ? Co.tl : diff === 0 ? Co.txMu : Co.rd;
var bg2 = diff > 0 ? Co.tlS : diff === 0 ? Co.bg : Co.rdS;
var shortMsg = diff > 0 ? fmtH(diff) + "h buffer" : diff === 0 ? "Exact coverage" : fmtH(Math.abs(diff)) + "h short — adjust to continue";
return <div style={{ display: "inline-flex", fontSize: 11, color: clr, fontWeight: 600, padding: "4px 10px", background: bg2, borderRadius: 4, transition: "transform 0.15s, box-shadow 0.15s", transform: flash.shortage && diff < 0 ? "scale(1.04)" : "none", boxShadow: flash.shortage && diff < 0 ? "0 0 0 2px " + Co.rd + "60" : "none" }}>{shortMsg}</div>;
})()}</div>
</Card>
{mode === "improve" ? <div>
<div style={{ display: "flex", gap: 6, borderRadius: 8, marginBottom: store._hoursOfOpChanged ? 0 : 24 }}>
<div onClick={function () { flashSet("newShortage", false); setStore(function (s) { if (s._originalHours) { return { ...s, _hoursOfOpChanged: false, hours: s._originalHours }; } return { ...s, _hoursOfOpChanged: false }; }); }} style={{ flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", lineHeight: 1.4, borderRadius: 8, background: !store._hoursOfOpChanged ? Co.ac : Co.card, color: !store._hoursOfOpChanged ? "#fff" : Co.txMu, border: "1px solid " + (!store._hoursOfOpChanged ? Co.ac : Co.bdr) }}>Same operating hours<br />for new template</div>
<div onClick={function () { if (hasShortage) { flashFor("shortage"); return; } setStore(function (s) { var snapshot = JSON.parse(JSON.stringify(s.hours)); return { ...s, _hoursOfOpChanged: true, _originalHours: snapshot, hours: JSON.parse(JSON.stringify(snapshot)) }; }); }} style={{ flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", lineHeight: 1.4, borderRadius: 8, background: store._hoursOfOpChanged ? Co.am : Co.card, color: store._hoursOfOpChanged ? "#fff" : Co.txMu, border: "1px solid " + (store._hoursOfOpChanged ? Co.am : Co.bdr), opacity: hasShortage && !store._hoursOfOpChanged ? 0.5 : 1 }}>Hours of operation<br />have changed</div>
</div>
{store._hoursOfOpChanged ? <Card style={{ marginTop: 10, borderLeft: "3px solid " + Co.am }}>
<div style={{ fontSize: 14, fontWeight: 700, color: Co.am, marginBottom: 8 }}>New Operating Hours <span style={{ fontWeight: 500, color: Co.txMu }}>{"\u00B7"} {fmtH(store.allocatedHoursPerWeek)}h demand</span></div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 8 }}>Edit the hours that will change. Leave unchanged days as-is.</div>
{hasNoHoursChange && flash.newShortage ? <div style={{ fontSize: 11, color: Co.rd, fontWeight: 600, marginBottom: 8, padding: "6px 10px", background: Co.rdS, borderRadius: 6, transition: "transform 0.15s, box-shadow 0.15s", transform: flash.newShortage === 2 ? "scale(1.03)" : "none", boxShadow: flash.newShortage === 2 ? "0 0 0 2px " + Co.rd + "60" : "none" }}>No changes detected. Edit at least one day or switch back to Same.</div> : null}
{DAYS.map(function (d) {
var dh = store.hours[d]; var oh = store._originalHours ? store._originalHours[d] : dh;
var changed = oh && dh && (oh.isOpen !== dh.isOpen || oh.open !== dh.open || oh.close !== dh.close);
var dayHrs = dh.isOpen ? ((t2m(dh.close) - t2m(dh.open)) / 60) : 0;
return <div key={d} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 0", borderBottom: "1px solid " + Co.bdrL }}>
<div style={{ width: 28, fontSize: 12, fontWeight: 600, flexShrink: 0, color: changed ? Co.am : Co.tx }}>{d}</div>
{d === "Sun" ? <Tog small value={dh.isOpen} onChange={function (v) { setStore(function (s) { var h = { ...s.hours }; h[d] = { ...h[d], isOpen: v }; var r = (s.dayRanking || DAYS).slice(); var t = (s.dayTies || []).slice(); if (!v) { var ri = r.indexOf(d); if (ri >= 0) { t = t.filter(function (ti) { return ti !== ri && ti !== ri - 1; }).map(function (ti) { return ti > ri ? ti - 1 : ti; }); r.splice(ri, 1); } } else if (!r.includes(d)) { r.push(d); } return { ...s, hours: h, dayRanking: r, dayTies: t }; }); }} /> : null}
{dh.isOpen ? <div style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }}><TSel value={dh.open} onChange={function (v) { setStore(function (s) { var h = { ...s.hours }; h[d] = { ...h[d], open: v }; return { ...s, hours: h }; }); }} style={{ flex: 1, minWidth: 0, width: "auto" }} /><span style={{ fontSize: 11, color: Co.txD, flexShrink: 0 }}>{"\u2013"}</span><TSel value={dh.close} onChange={function (v) { setStore(function (s) { var h = { ...s.hours }; h[d] = { ...h[d], close: v }; return { ...s, hours: h }; }); }} style={{ flex: 1, minWidth: 0, width: "auto" }} /></div> : <span style={{ fontSize: 11, color: Co.txD, flex: 1 }}>Closed</span>}
<span style={{ ...mono, fontSize: 11, color: changed ? Co.am : (dh.isOpen ? Co.txMu : Co.txD), minWidth: 24, textAlign: "right", flexShrink: 0 }}>{dh.isOpen ? fmtH(dayHrs) + "h" : ""}</span>
</div>;
})}
{(function () { var newTotal = opHrs(store.hours); var oldTotal = store._originalHours ? opHrs(store._originalHours) : newTotal; var hDiff = newTotal - oldTotal; var newDemand = +store.allocatedHoursPerWeek; var bufDiff = newDemand - newTotal; var bufClr = bufDiff > 0 ? Co.tl : bufDiff === 0 ? Co.txMu : Co.rd; var bufBg = bufDiff > 0 ? Co.tlS : bufDiff === 0 ? Co.bg : Co.rdS; var bufMsg = bufDiff > 0 ? fmtH(bufDiff) + "h buffer" : bufDiff === 0 ? "Exact coverage" : fmtH(Math.abs(bufDiff)) + "h short — adjust to continue"; return <div style={{ display: "flex", alignItems: "center", marginTop: 4, padding: "4px 0", gap: 8 }}><span style={{ fontSize: 12, fontWeight: 600 }}>New Total</span><span style={{ ...mono, fontSize: 13, fontWeight: 700, color: Co.tx }}>{fmtH(newTotal)}h/wk</span>{hDiff !== 0 ? <span style={{ fontSize: 11, fontWeight: 600, color: hDiff > 0 ? Co.gn : Co.rd }}>{hDiff > 0 ? "\u25B2" : "\u25BC"} {fmtH(Math.abs(hDiff))}h</span> : null}<div style={{ flex: 1 }} />{newDemand > 0 ? <div style={{ display: "inline-flex", fontSize: 11, color: bufClr, fontWeight: 600, padding: "4px 10px", background: bufBg, borderRadius: 4, transition: "transform 0.15s, box-shadow 0.15s", transform: flash.newShortage && bufDiff < 0 ? "scale(1.04)" : "none", boxShadow: flash.newShortage && bufDiff < 0 ? "0 0 0 2px " + Co.rd + "60" : "none" }}>{bufMsg}</div> : null}</div>; })()}
</Card> : null}
</div> : null}
</div>
)}
{/* STEP 2: Store Traffic */}
{step === 2 && (
<div>
<div className="section-heading">Store traffic</div>
<div style={{ fontSize: 13, color: Co.txMu, marginBottom: 14 }}>Which days are busiest? Tap arrows to reorder. Tap = to tie.</div>
<Card>
<div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Busiest to least busy</div>
{(function () {
var rnk = store.dayRanking || DAYS.filter(function (d) { var dh = store.hours[d]; return dh && dh.isOpen; });
var ties = store.dayTies || [];
var displayRanks = []; var curRank = 1;
for (var ri = 0; ri < rnk.length; ri++) { if (ri > 0 && ties.includes(ri - 1)) { displayRanks.push(displayRanks[ri - 1]); } else { displayRanks.push(curRank); } curRank = ri + 2; }
var result = [];
rnk.forEach(function (d, i) {
var dh = store.hours[d]; if (!dh || !dh.isOpen) return;
var tiedBelow = ties.includes(i); var tiedAbove = i > 0 && ties.includes(i - 1);
var groupStart = i; while (groupStart > 0 && ties.includes(groupStart - 1)) groupStart--;
var barW = Math.round(100 - (groupStart / Math.max(rnk.length - 1, 1)) * 60);
var barColor = groupStart < 2 ? Co.rd : groupStart < 4 ? Co.am : Co.tl;
var canUp = i > 0, canDown = i < rnk.length - 1;
result.push(<div key={d} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: tiedBelow ? "none" : "1px solid " + Co.bdrL }}>
<span style={{ fontSize: 12, fontWeight: 700, color: Co.txMu, width: 16, textAlign: "center" }}>{tiedAbove ? "" : displayRanks[i]}</span>
<span style={{ fontSize: 12, fontWeight: 600, width: 30 }}>{d}</span>
<div style={{ flex: 1, height: 6, background: Co.bg, borderRadius: 4, overflow: "hidden" }}><div style={{ width: barW + "%", height: "100%", background: barColor, borderRadius: 4, opacity: 0.5 }} /></div>
<div style={{ display: "flex", gap: 4 }}>
<div onClick={function () { if (!canUp) return; setStore(function (s) { var r = (s.dayRanking || rnk).slice(); var t = (s.dayTies || []).slice(); var tmp = r[i]; r[i] = r[i - 1]; r[i - 1] = tmp; t = t.filter(function (x) { return x !== i - 1 && x !== i; }); return { ...s, dayRanking: r, dayTies: t }; }); }} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: canUp ? Co.bg : "transparent", border: canUp ? "1px solid " + Co.bdr : "1px solid transparent", cursor: canUp ? "pointer" : "default", fontSize: 16, color: canUp ? Co.tx : Co.txD + "30" }}>{"\u25B2"}</div>
<div onClick={function () { if (!canDown) return; setStore(function (s) { var r = (s.dayRanking || rnk).slice(); var t = (s.dayTies || []).slice(); var tmp = r[i]; r[i] = r[i + 1]; r[i + 1] = tmp; t = t.filter(function (x) { return x !== i && x !== i - 1; }); return { ...s, dayRanking: r, dayTies: t }; }); }} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, background: canDown ? Co.bg : "transparent", border: canDown ? "1px solid " + Co.bdr : "1px solid transparent", cursor: canDown ? "pointer" : "default", fontSize: 16, color: canDown ? Co.tx : Co.txD + "30" }}>{"\u25BC"}</div>
</div>
</div>);
if (canDown) { var tieIdx = i; var isTied = ties.includes(tieIdx); result.push(<div key={d + "-tie"} onClick={function () { setStore(function (s) { var t = (s.dayTies || []).slice(); if (t.includes(tieIdx)) { t = t.filter(function (x) { return x !== tieIdx; }); } else { t.push(tieIdx); } return { ...s, dayTies: t }; }); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1px 0", cursor: "pointer" }}><div style={{ fontSize: 11, fontWeight: 700, color: isTied ? Co.ac : Co.txD, padding: "2px 12px", borderRadius: 10, background: isTied ? Co.acS : "transparent", border: isTied ? "1px solid " + Co.ac + "40" : "none" }}>=</div></div>); }
});
return result;
})()}
</Card>
{hasOverlap ? <Card>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Peak hours</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 8 }}>When is the store busiest?</div>
{[{ key: "weekday", label: "Weekdays" }, { key: "saturday", label: "Saturday" }, { key: "sunday", label: "Sunday" }].map(function (grp) {
var pks = (store.peak && store.peak[grp.key]) || [{ start: "12:00", end: "17:00" }]; if (!Array.isArray(pks)) pks = [pks];
return <div key={grp.key} style={{ padding: "4px 0", borderBottom: "1px solid " + Co.bdrL }}>
<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{grp.label}</div><div style={{ flex: 1 }} />{pks.length < 3 ? <span onClick={function () { setStore(function (s) { var p = { ...s.peak }; var arr = Array.isArray(p[grp.key]) ? p[grp.key].slice() : [p[grp.key] || { start: "12:00", end: "17:00" }]; arr.push({ start: "09:00", end: "12:00" }); p[grp.key] = arr; return { ...s, peak: p }; }); }} style={{ fontSize: 11, color: Co.ac, cursor: "pointer", fontWeight: 600 }}>+ Add window</span> : null}</div>
{pks.map(function (pk, pi) { return <div key={pi} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, paddingLeft: 8 }}><TSel value={pk.start} onChange={function (v) { setStore(function (s) { var p = { ...s.peak }; var arr = Array.isArray(p[grp.key]) ? p[grp.key].slice() : [p[grp.key]]; arr[pi] = { ...arr[pi], start: v }; p[grp.key] = arr; return { ...s, peak: p }; }); }} /><span style={{ fontSize: 11, color: Co.txD }}>to</span><TSel value={pk.end} onChange={function (v) { setStore(function (s) { var p = { ...s.peak }; var arr = Array.isArray(p[grp.key]) ? p[grp.key].slice() : [p[grp.key]]; arr[pi] = { ...arr[pi], end: v }; p[grp.key] = arr; return { ...s, peak: p }; }); }} />{pks.length > 1 ? <span onClick={function () { setStore(function (s) { var p = { ...s.peak }; var arr = Array.isArray(p[grp.key]) ? p[grp.key].slice() : [p[grp.key]]; arr.splice(pi, 1); p[grp.key] = arr; return { ...s, peak: p }; }); }} style={{ fontSize: 11, color: Co.txD, cursor: "pointer", padding: "0 4px" }}>{"\u2715"}</span> : null}</div>; })}
</div>;
})}
</Card> : null}
</div>
)}
{/* STEP 3: Team list */}
{step === 3 && !editP && (
<div>
<div className="section-heading">Add your pharmacist team</div>
{(function () {
var pmCt = pharms.filter(function (p) { return p.role === "pm"; }).length;
var staffCt = pharms.filter(function (p) { return p.role === "staff"; }).length;
var ovntCt = pharms.filter(function (p) { return p.role === "ovnt"; }).length;
var rot = store.rotationWeeks || 2;
var expectedStaff = Math.max(1, rot - 1);
var expectedLabel = "1 PM + " + expectedStaff + " Staff";
if (pharms.length === 0) return <div style={{ fontSize: 13, color: Co.txMu, marginBottom: 10 }}>A {rot}-week rotation typically runs {expectedLabel}.{store.is24hr ? " Plus 2 Overnight RPh." : ""}</div>;
var needs = [];
if (pmCt === 0) needs.push("1 PM");
if (staffCt < expectedStaff) needs.push((expectedStaff - staffCt) + " more Staff");
if (store.is24hr && ovntCt < 2) needs.push((2 - ovntCt) + " more OVNT");
if (needs.length > 0) return <div style={{ fontSize: 13, color: Co.txMu, marginBottom: 10 }}>Expected for {rot}-wk: {expectedLabel}. Still need: <span style={{ color: Co.am }}>{needs.join(", ")}</span></div>;
if (staffCt > expectedStaff) return <div style={{ fontSize: 13, color: Co.txMu, marginBottom: 10 }}>This could make for an interesting {rot}-week rotation.</div>;
return <div style={{ fontSize: 13, color: Co.txMu, marginBottom: 10 }}>Team looks good for a {rot}-week rotation.</div>;
})()}
{mode === "improve" ? <div style={{ padding: "10px 14px", marginBottom: 10, opacity: 0.7, borderRadius: 12, border: "1px solid " + Co.bdr }}><div onClick={function () { setTipOpen(!tipOpen); }} style={{ display: "flex", alignItems: "center", cursor: "pointer" }}><div style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>Replacing a pharmacist in the rotation?</div><span style={{ fontSize: 11, color: Co.txMu, marginRight: 6 }}>{tipOpen ? "" : "Tap for guidance"}</span><span style={{ fontSize: 14, color: Co.txD, transform: tipOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"\u203A"}</span></div>{tipOpen ? <div style={{ marginTop: 8, borderTop: "1px solid " + Co.bdrL, paddingTop: 8 }}><div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.5 }}>If someone left and is being replaced, keep the same role and hours when inputting your current template. Use a default label like {"\u201C"}Staff RPh A{"\u201D"} {"\u2014"} the new person inherits the shift until an optimized new template is generated and agreed upon. Only use <span style={{ fontWeight: 600 }}>Build a new template</span> for drastic changes like new team size, new hours of operation, or new rotation cycle length.</div></div> : null}</div> : null}
{teamWarning && !teamWarning.includes("to continue") ? <div style={{ padding: "12px 14px", background: Co.amS, borderRadius: 10, marginBottom: 12, border: "1px solid " + Co.am + "40", transition: "transform 0.15s, box-shadow 0.15s", transform: flash.team ? "scale(1.03)" : "none", boxShadow: flash.team ? "0 0 0 2px " + Co.am + "60" : "none" }}><div style={{ fontSize: 12, color: Co.am, fontWeight: 600, marginBottom: 8 }}>{teamWarning}</div><div style={{ display: "flex", gap: 8 }}><Btn style={{ padding: "5px 12px", fontSize: 11, flex: 1 }} onClick={function () { setTeamWarning(null); }}>Go back</Btn><Btn variant="primary" style={{ padding: "5px 12px", fontSize: 11, flex: 1 }} onClick={function () { setTeamWarning(null); pushHistory(); if (mode === "improve") { initCurSched(); } setStore(function (s) { return { ...s, _originalBudget: s.allocatedHoursPerWeek }; }); setStep(4); }}>Continue anyway</Btn></div></div> : null}
{pharms.length >= 2 && combinedTarget > (+store.allocatedHoursPerWeek || 0) ? <div style={{ padding: "8px 12px", background: Co.amS, borderRadius: 8, marginBottom: 10, fontSize: 11, color: Co.am, fontWeight: 600 }}>Team hours ({combinedTarget}h) exceed demand hours ({store.allocatedHoursPerWeek}h).</div> : null}
{pharms.map(function (p) {
var tags = [];
if (p.role === "dsp") { var avDays = DAYS.filter(function (dd) { return !p.prefs.fixedDaysOff.includes(dd); }); if (avDays.length === 7) tags.push("all days"); else if (avDays.length === 0) tags.push("no days set"); else { var wkdays = ["Mon","Tue","Wed","Thu","Fri"]; var isWeekdaysOnly = avDays.length === 5 && wkdays.every(function (wd) { return avDays.includes(wd); }); var isWeekendsOnly = avDays.length === 2 && avDays.includes("Sat") && avDays.includes("Sun"); if (isWeekdaysOnly) tags.push("weekdays"); else if (isWeekendsOnly) tags.push("weekends"); else tags.push(avDays.length + " days: " + avDays.join(", ")); } }
else { if (p.prefs.preferredWeekendDay === "Sat") tags.push("prefers Sat off"); else if (p.prefs.preferredWeekendDay === "Sun") tags.push("prefers Sun off"); if (p.prefs.preferEarly) tags.push("opens"); if (p.prefs.preferLate) tags.push("closes"); if (p.prefs.noClopening) tags.push("11h+ between shifts"); var dc = [p.prefs.preferredDaysOff && p.prefs.preferredDaysOff.length > 0, p.prefs.maxConsecutiveWorkDays !== 6, p.prefs.maxDaysPerWeek, p.earliestStart, p.latestEnd, Object.keys(p.prefs.dayOverrides || {}).length > 0, p.prefs.consecutiveDaysOff > 1, p.prefs.noBackToBackLong, p.prefs.threeDayWeekend].filter(Boolean).length; if (dc > 0) tags.push("+" + dc + " more"); }
return <div key={p.id} style={{ marginBottom: 8 }}>
<div style={{ background: Co.card, borderRadius: 10, boxShadow: shadow.md, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, borderLeft: "3px solid " + (p.role === "ovnt" ? Co.pu : p.role === "dsp" ? Co.tl : p.color) }}>
<div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{p.name} <span style={{ fontSize: 11, color: Co.txMu, fontWeight: 500 }}>{p.role === "pm" ? "PM" : p.role === "ovnt" ? "OVNT" : p.role === "dsp" ? "DSP" : "Staff"} {"\u00B7"} {p.targetHours}h/wk</span></div>{tags.length > 0 ? <div style={{ fontSize: 11, color: Co.txMu, marginTop: 2 }}>{tags.join(" \u00B7 ")}</div> : <div style={{ fontSize: 11, color: Co.txD, marginTop: 2 }}>Fully flexible</div>}</div>
<Btn style={{ padding: "3px 8px", fontSize: 11 }} onClick={function () { setEditP({ ...p, prefs: { ...defPrefs(), ...p.prefs } }); }}>Edit</Btn>
<span role="button" tabIndex={0} aria-label={"Remove " + firstName(p)} onKeyDown={function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRemoving(removing === p.id ? null : p.id); } }} onClick={function () { setRemoving(removing === p.id ? null : p.id); }} style={{ fontSize: 12, color: Co.txD, cursor: "pointer", padding: "2px 4px" }}>{"\u2715"}</span>
</div>
{removing === p.id ? <div style={{ background: Co.bg, borderRadius: "0 0 10px 10px", padding: "10px 14px", marginTop: -4, display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontSize: 11, color: Co.txMu, flex: 1 }}>Remove {firstName(p)}?</span><Btn style={{ padding: "4px 10px", fontSize: 11 }} onClick={function () { setPharms(function (pr) { return pr.filter(function (x) { return x.id !== p.id; }); }); setRemoving(null); setTeamWarning(null); }}>Drop</Btn><Btn variant="primary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={function () { var isDsp = p.role === "dsp"; var newP = { id: Date.now() + Math.random(), name: "", role: p.role, color: p.color, targetHours: isDsp ? 15 : 40, minHours: isDsp ? 5 : 32, maxHours: isDsp ? 25 : 48, payPeriodHours: isDsp ? 30 : 80, earliestStart: "", latestEnd: "", maxShiftLength: isDsp ? 8 : 13, minShiftLength: isDsp ? 4 : 6, earlyStartMinutes: null, prefs: defPrefs() }; setPharms(function (pr) { return pr.map(function (x) { return x.id === p.id ? newP : x; }); }); setRemoving(null); setEditP(newP); }}>Replace</Btn></div> : null}
</div>;
})}
{(function () {
var pmCt2 = pharms.filter(function (p) { return p.role === "pm"; }).length;
var staffCt2 = pharms.filter(function (p) { return p.role === "staff"; }).length;
var rot2 = store.rotationWeeks || 2;
var expectedStaff2 = Math.max(1, rot2 - 1);
var teamComplete = pmCt2 >= 1 && staffCt2 >= expectedStaff2;
if (pharms.length === 0) return <div>{teamWarning && teamWarning.includes("to continue") ? <div style={{ padding: "10px 14px", background: Co.rdS, borderRadius: 10, marginBottom: 8, border: "1px solid " + Co.rd + "40", transition: "transform 0.15s, box-shadow 0.15s", transform: flash.team ? "scale(1.03)" : "none", boxShadow: flash.team ? "0 0 0 2px " + Co.rd + "60" : "none" }}><div style={{ fontSize: 12, color: Co.rd, fontWeight: 600 }}>{teamWarning}</div></div> : null}<Btn variant="primary" onClick={addPharm} style={{ width: "100%", marginTop: 6 }}>+ Add Pharmacy Manager</Btn></div>;
if (!teamComplete) return <div>{teamWarning && teamWarning.includes("to continue") ? <div style={{ padding: "10px 14px", background: Co.rdS, borderRadius: 10, marginBottom: 8, border: "1px solid " + Co.rd + "40", transition: "transform 0.15s, box-shadow 0.15s", transform: flash.team ? "scale(1.03)" : "none", boxShadow: flash.team ? "0 0 0 2px " + Co.rd + "60" : "none" }}><div style={{ fontSize: 12, color: Co.rd, fontWeight: 600 }}>{teamWarning}</div></div> : null}<Btn variant="primary" onClick={addPharm} style={{ width: "100%", marginTop: 6 }}>+ Add Next Pharmacist</Btn></div>;
return <Btn onClick={addPharm} style={{ width: "100%", marginTop: 6 }}>+ Add Another (optional)</Btn>;
})()}
</div>
)}
{/* STEP 3: Edit pharmacist */}
{step === 3 && editP && (
<div>
<div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
<div style={{ fontSize: 18, fontWeight: 700 }}>{editP.role === "pm" ? "Pharmacy Manager" : editP.role === "ovnt" ? "Overnight Pharmacist" : editP.role === "dsp" ? "DSP / Other RPh" : "Staff Pharmacist"}</div>
<Inp value={editP.name} onChange={function (e) { setEditP(function (p) { return { ...p, name: e.target.value.slice(0, 10) }; }); }} placeholder="Optional label" maxLength={10} style={{ fontSize: 13, padding: "6px 10px", background: Co.bg, border: "1px solid " + Co.bdrL, borderRadius: 6, color: Co.tx, flex: 1, maxWidth: 130, textAlign: "center" }} />
</div>
<Card style={{ padding: "14px 16px" }}>
<div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
<div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: Co.tx, textAlign: "center", marginBottom: 6 }}>Role</div>{(function () { var hasPM = pharms.some(function (p) { return p.role === "pm" && p.id !== editP.id; }); var isPMAndLocked = editP.role === "pm" && !hasPM && !pharms.some(function (p) { return p.id === editP.id; }); if (isPMAndLocked) { return <div style={{ padding: "10px 10px", borderRadius: 6, border: "1px solid " + Co.bdr, background: Co.bg, fontSize: 14, ...font, color: Co.txMu, textAlign: "center" }}>PM</div>; } return <Sel value={editP.role} onChange={function (v) { setEditP(function (p) { var np = { ...p, role: v }; if (v === "dsp" && p.role !== "dsp") { np.targetHours = 15; np.minHours = 5; np.maxHours = 25; np.minShiftLength = 4; np.maxShiftLength = 8; } if (v !== "dsp" && p.role === "dsp") { np.targetHours = 40; np.minHours = 32; np.maxHours = 48; np.minShiftLength = 6; np.maxShiftLength = 13; } return np; }); }} style={{ padding: "10px 10px", fontSize: 14 }}>{[!hasPM ? <option key="pm" value="pm">PM</option> : null, <option key="staff" value="staff">Staff RPh</option>, <option key="dsp" value="dsp">DSP / Other RPh</option>, store.is24hr ? <option key="ovnt" value="ovnt">OVNT</option> : null]}</Sel>; })()}</div>
{mode === "improve" ? <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700, color: Co.tx, textAlign: "center", marginBottom: 6 }}>Current Weekly Base Hrs</div><Inp type="number" step="0.5" value={editP.targetHours === "" ? "" : editP.targetHours} onChange={function (e) { setEditP(function (p) { return { ...p, targetHours: e.target.value === "" ? "" : +e.target.value }; }); }} placeholder="40" style={{ textAlign: "center", fontSize: 15, padding: "10px 10px", ...mono, fontWeight: 700 }} /></div> : null}
</div>
{mode === "improve" ? (function () {
var base = +editP.targetHours || 40;
var defaultMin = base - 8; var defaultMax = base + 8;
var hasCustomRange = editP._showRange || (editP.minHours && editP.maxHours && (editP.minHours !== defaultMin || editP.maxHours !== defaultMax));
return <div>
<div style={{ display: "flex", gap: 6, borderRadius: 8 }}>
<div onClick={function () { setEditP(function (p) { var b = +p.targetHours || 40; return { ...p, _showRange: false, minHours: b - 8, maxHours: b + 8 }; }); }} style={{ flex: 1, padding: "10px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "center", lineHeight: 1.4, borderRadius: 8, background: !hasCustomRange ? Co.ac : Co.card, color: !hasCustomRange ? "#fff" : Co.txMu, border: "1px solid " + (!hasCustomRange ? Co.ac : Co.bdr) }}>Maintain current<br />weekly base hours</div>
<div onClick={function () { setEditP(function (p) { return { ...p, _showRange: true }; }); }} style={{ flex: 1, padding: "10px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "center", lineHeight: 1.4, borderRadius: 8, background: hasCustomRange ? Co.am : Co.card, color: hasCustomRange ? "#fff" : Co.txMu, border: "1px solid " + (hasCustomRange ? Co.am : Co.bdr) }}>Flexible within<br />acceptable range</div>
</div>
{hasCustomRange ? <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + Co.bdrL }}>
<div style={{ fontSize: 13, fontWeight: 700, color: Co.am, marginBottom: 8 }}>Acceptable Weekly Base Hours</div>
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
<Inp type="number" step="0.5" value={editP.minHours === "" ? "" : editP.minHours} onChange={function (e) { setEditP(function (p) { return { ...p, minHours: e.target.value === "" ? "" : +e.target.value }; }); }} placeholder="Min" style={{ textAlign: "center", flex: 1, fontSize: 15, padding: "10px 10px", ...mono, fontWeight: 700 }} />
<span style={{ fontSize: 13, color: Co.txD, flexShrink: 0 }}>{"\u2013"}</span>
<Inp type="number" step="0.5" value={editP.maxHours === "" ? "" : editP.maxHours} onChange={function (e) { setEditP(function (p) { return { ...p, maxHours: e.target.value === "" ? "" : +e.target.value }; }); }} placeholder="Max" style={{ textAlign: "center", flex: 1, fontSize: 15, padding: "10px 10px", ...mono, fontWeight: 700 }} />
</div>
</div> : null}
</div>;
})() : (function () {
var base = +editP.targetHours || 40;
var defaultMin = base - 8; var defaultMax = base + 8;
var hasRange = editP._showRange || (editP.minHours && editP.maxHours && (editP.minHours !== defaultMin || editP.maxHours !== defaultMax));
return <div>
<div style={{ fontSize: 13, fontWeight: 700, color: Co.tx, marginBottom: 8 }}>Weekly Base Hours</div>
<div className="seg-control" style={{ border: "1px solid " + Co.bdr, marginBottom: 10 }}>
<div onClick={function () { setEditP(function (p) { var b = +p.targetHours || 40; return { ...p, _showRange: false, minHours: b - 8, maxHours: b + 8 }; }); }} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: !hasRange ? Co.ac : "transparent", color: !hasRange ? "#fff" : Co.txMu }}>Exact hours</div>
<div onClick={function () { setEditP(function (p) { return { ...p, _showRange: true }; }); }} style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", background: hasRange ? Co.am : "transparent", color: hasRange ? "#fff" : Co.txMu, borderLeft: "1px solid " + Co.bdr }}>Acceptable range</div>
</div>
{!hasRange ? <div><Inp type="number" step="0.5" value={editP.targetHours === "" ? "" : editP.targetHours} onChange={function (e) { setEditP(function (p) { return { ...p, targetHours: e.target.value === "" ? "" : +e.target.value }; }); }} placeholder="40" style={{ textAlign: "center", fontSize: 17, padding: "12px 10px", ...mono, fontWeight: 700 }} /></div> : null}
{hasRange ? <div>
<div style={{ display: "flex", alignItems: "center", gap: 6 }}>
<Inp type="number" step="0.5" value={editP.minHours === "" ? "" : editP.minHours} onChange={function (e) { setEditP(function (p) { return { ...p, minHours: e.target.value === "" ? "" : +e.target.value }; }); }} placeholder="Min" style={{ textAlign: "center", flex: 1, fontSize: 15, padding: "10px 10px", ...mono, fontWeight: 700 }} />
<span style={{ fontSize: 13, color: Co.txD, flexShrink: 0 }}>{"\u2013"}</span>
<Inp type="number" step="0.5" value={editP.maxHours === "" ? "" : editP.maxHours} onChange={function (e) { setEditP(function (p) { return { ...p, maxHours: e.target.value === "" ? "" : +e.target.value }; }); }} placeholder="Max" style={{ textAlign: "center", flex: 1, fontSize: 15, padding: "10px 10px", ...mono, fontWeight: 700 }} />
</div>
</div> : null}
</div>;
})()}
</Card>
{editP.role === "dsp" ? <Card style={{ padding: 14 }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Days available</div><div style={{ display: "flex", gap: 4 }}>{DAYS.map(function (d) { var isOn = !(editP.prefs.fixedDaysOff || []).includes(d); return <div key={d} onClick={function () { setEditP(function (p) { var fix = [].concat(p.prefs.fixedDaysOff); if (isOn) { fix.push(d); } else { fix = fix.filter(function (x) { return x !== d; }); } return { ...p, prefs: { ...p.prefs, fixedDaysOff: fix } }; }); }} style={{ padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center", flex: 1, background: isOn ? Co.gnS : Co.bg, color: isOn ? Co.gn : Co.txD, border: "1px solid " + (isOn ? Co.gn + "30" : "transparent") }}>{d}</div>; })}</div></Card> : (
<div>
<div style={{ height: 1, background: Co.bdrL, margin: "10px 40px 2px" }} />
<div style={{ textAlign: "center", padding: "6px 0", fontSize: 11, color: Co.txD }}>Ready to save, or customize below</div>
{editP.role === "pm" ? <Card style={{ padding: "14px 16px", marginBottom: 8, borderLeft: "3px solid " + Co.ac }}><div style={{ display: "flex", alignItems: "center", gap: 11 }}><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 700 }}>Anchor on highest volume day</div><div style={{ fontSize: 11, color: Co.txMu, marginTop: 2 }}>PM works the highest volume day every week.</div></div><Tog value={store.pmAnchorBusiest} onChange={function (v) { setStore(function (s) { return { ...s, pmAnchorBusiest: v }; }); }} /></div></Card> : null}
<Collapsible title="Personal Preferences" style={{ padding: 16, marginBottom: 10 }} summary={(function () { var ct = [editP.prefs.preferredWeekendDay, editP.prefs.preferEarly, editP.prefs.preferLate, editP.prefs.noClopening, editP.prefs.noBackToBackLong, editP.prefs.threeDayWeekend, (editP.prefs.preferredDaysOff || []).length > 0, editP.prefs.fixedDaysOff.length > 0, editP.prefs.maxDaysPerWeek, editP.prefs.maxConsecutiveWorkDays !== 6, editP.prefs.consecutiveDaysOff > 1, editP.earliestStart, editP.latestEnd, Object.keys(editP.prefs.dayOverrides || {}).length > 0].filter(Boolean).length; return ct === 0 ? "No preferences set \u2014 fully flexible" : ct + " preference" + (ct > 1 ? "s" : "") + " set"; })()}>
{/* SCHEDULE PATTERN */}
<div style={{ padding: "10px 12px", margin: "4px 0 10px", borderRadius: 8, border: "1px solid " + Co.bdrL, background: Co.bg }}>
<div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.6, textAlign: "center" }}><span style={{ fontWeight: 700, color: Co.am }}>WANT</span> {"\u2014"} preference the scheduler will try to honor</div>
<div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.6, textAlign: "center" }}><span style={{ fontWeight: 700, color: Co.rd }}>NEED</span> {"\u2014"} critical requirement that must be accommodated</div>
<div style={{ fontSize: 10, color: Co.txD, lineHeight: 1.6, textAlign: "center", marginTop: 2 }}>Tap the label to toggle between Want and Need</div>
</div>
<div style={{ fontSize: 10, fontWeight: 700, color: Co.txD, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Schedule Pattern</div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><span style={{ fontSize: 13, flex: 1 }}>Weekend preference</span><Sel value={editP.prefs.preferredWeekendDay || ""} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, preferredWeekendDay: v || null, weekendPref: v ? "every_other_off" : "flexible" } }; }); }} style={{ width: 170 }}><option value="">Both or neither</option><option value="Sat">Prefers Sat off</option><option value="Sun">Prefers Sun off</option></Sel></div>
{editP.prefs.preferredWeekendDay ? <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0 8px", borderBottom: "1px solid " + Co.bdrL, paddingLeft: 8 }}><span style={{ fontSize: 11, color: Co.txMu, flex: 1 }}>How important?</span><NW value={(editP.prefs.needs || {}).weekendPref} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, needs: { ...p.prefs.needs, weekendPref: v } } }; }); }} /></div> : null}
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><Tog value={editP.prefs.noClopening} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, noClopening: v } }; }); }} /><span style={{ fontSize: 13, flex: 1 }}>11+ hours between shifts</span>{editP.prefs.noClopening ? <NW value={(editP.prefs.needs || {}).noClopening} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, needs: { ...p.prefs.needs, noClopening: v } } }; }); }} /> : null}</div>
{[{ k: "preferEarly", l: store.is24hr ? "Prefers early shift" : "Prefers opening" }, { k: "preferLate", l: store.is24hr ? "Prefers late shift" : "Prefers closing" }].map(function (pr) { var isOn = editP.prefs[pr.k]; return <div key={pr.k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><Tog value={isOn} onChange={function (v) { setEditP(function (p) { var newPrefs = { ...p.prefs, [pr.k]: v }; if (v && pr.k === "preferEarly") { newPrefs.preferLate = false; } if (v && pr.k === "preferLate") { newPrefs.preferEarly = false; } return { ...p, prefs: newPrefs }; }); }} /><span style={{ fontSize: 13, flex: 1 }}>{pr.l}</span></div>; })}
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><Tog value={editP.prefs.noBackToBackLong} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, noBackToBackLong: v } }; }); }} /><span style={{ fontSize: 12, flex: 1 }}>No back-to-back long shifts</span></div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><Tog value={editP.prefs.threeDayWeekend} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, threeDayWeekend: v } }; }); }} /><span style={{ fontSize: 12, flex: 1 }}>Prefers 3-day weekend block</span></div>
{/* DAYS OFF */}
<div style={{ fontSize: 10, fontWeight: 700, color: Co.txD, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 6 }}>Days Off</div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 4 }}>Tap a day to cycle through:</div>
<div style={{ fontSize: 10, color: Co.txD, marginBottom: 6, lineHeight: 1.4 }}><span style={{ color: Co.am, fontWeight: 600 }}>prefers off</span> = would like this day off when possible. <span style={{ color: Co.rd, fontWeight: 600 }}>needs off</span> = must have this day off. Tap again to clear.</div>
<div style={{ display: "flex", gap: 4, marginBottom: 10 }}>{DAYS.map(function (d) { var isFixed = editP.prefs.fixedDaysOff.includes(d); var isPref = (editP.prefs.preferredDaysOff || []).includes(d); var chipColor = isFixed ? Co.rd : isPref ? Co.am : null; return <div key={d} onClick={function () { setEditP(function (p) { var fix = [].concat(p.prefs.fixedDaysOff); var pref = [].concat(p.prefs.preferredDaysOff || []); if (!isPref && !isFixed) { pref.push(d); } else if (isPref && !isFixed) { pref = pref.filter(function (x) { return x !== d; }); fix.push(d); } else { fix = fix.filter(function (x) { return x !== d; }); } return { ...p, prefs: { ...p.prefs, fixedDaysOff: fix, preferredDaysOff: pref } }; }); }} style={{ padding: "5px 0", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "center", flex: 1, background: chipColor ? chipColor + "15" : Co.bg, color: chipColor || Co.txMu, border: "1px solid " + (chipColor ? chipColor + "30" : "transparent") }}>{d}</div>; })}</div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><span style={{ fontSize: 12, flex: 1 }}>Max days/week</span><Sel value={editP.prefs.maxDaysPerWeek || ""} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, maxDaysPerWeek: v === "" ? null : +v } }; }); }} style={{ flex: 1 }}><option value="">No cap</option>{[3,4,5,6].map(function (n) { return <option key={n} value={n}>{n}</option>; })}</Sel></div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><span style={{ fontSize: 12, flex: 1 }}>Max consecutive days</span><Sel value={editP.prefs.maxConsecutiveWorkDays} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, maxConsecutiveWorkDays: +v } }; }); }} style={{ width: 60 }}>{[3,4,5,6,7].map(function (n) { return <option key={n} value={n}>{n}</option>; })}</Sel></div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><span style={{ fontSize: 12, flex: 1 }}>Min consecutive days off</span><Sel value={editP.prefs.consecutiveDaysOff} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, consecutiveDaysOff: +v } }; }); }} style={{ width: 60 }}>{[1,2,3].map(function (n) { return <option key={n} value={n}>{n}</option>; })}</Sel></div>
{/* TIME CONSTRAINTS */}
<div style={{ fontSize: 10, fontWeight: 700, color: Co.txD, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 6 }}>Time Constraints</div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><span style={{ fontSize: 12, flex: 1 }}>Earliest start</span><Sel value={editP.earliestStart || ""} onChange={function (v) { setEditP(function (p) { return { ...p, earliestStart: v }; }); }} style={{ width: 100 }}><option value="">No pref</option>{(function () { var o = []; for (var m = 300; m <= 720; m += 30) o.push(m2t(m)); return o.map(function (t) { return <option key={t} value={t}>{tL(t)}</option>; }); })()}</Sel></div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><span style={{ fontSize: 12, flex: 1 }}>Latest end</span><Sel value={editP.latestEnd || ""} onChange={function (v) { setEditP(function (p) { return { ...p, latestEnd: v }; }); }} style={{ width: 100 }}><option value="">No pref</option>{(function () { var o = []; for (var m = 840; m <= 1440; m += 30) o.push(m2t(m)); return o.map(function (t) { return <option key={t} value={t}>{tL(t)}</option>; }); })()}</Sel></div>
<div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}><span style={{ fontSize: 12, flex: 1 }}>Shift length</span><Sel value={editP.minShiftLength} onChange={function (v) { setEditP(function (p) { var mn = +v; return { ...p, minShiftLength: mn, maxShiftLength: Math.max(p.maxShiftLength, mn) }; }); }} style={{ width: 62 }}>{[4,5,6,7,8,9,10,11,12].map(function (n) { return <option key={n} value={n}>{n}h</option>; })}</Sel><span style={{ fontSize: 11, color: Co.txD }}>{"\u2013"}</span><Sel value={editP.maxShiftLength} onChange={function (v) { setEditP(function (p) { var mx = +v; return { ...p, maxShiftLength: mx, minShiftLength: Math.min(p.minShiftLength, mx) }; }); }} style={{ width: 62 }}>{[8,9,10,11,12,13,14,15].map(function (n) { return <option key={n} value={n}>{n}h</option>; })}</Sel></div>
<div style={{ paddingTop: 10 }}><div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Needs to Leave By</div><div style={{ fontSize: 11, color: Co.txMu, marginBottom: 6 }}>Day-specific end times.</div>
{Object.keys(editP.prefs.dayOverrides).map(function (d) { var ovr = editP.prefs.dayOverrides[d]; return <div key={d} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: "1px solid " + Co.bdrL }}><div style={{ width: 32, fontSize: 12, fontWeight: 600 }}>{d}</div><span style={{ fontSize: 11, color: Co.tl, fontWeight: 600 }}>By</span><TSel value={ovr.latestEnd} onChange={function (v) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, dayOverrides: { ...p.prefs.dayOverrides, [d]: { ...p.prefs.dayOverrides[d], latestEnd: v } } } }; }); }} /><Inp value={ovr.note} onChange={function (e) { setEditP(function (p) { return { ...p, prefs: { ...p.prefs, dayOverrides: { ...p.prefs.dayOverrides, [d]: { ...p.prefs.dayOverrides[d], note: e.target.value } } } }; }); }} placeholder="Reason" style={{ fontSize: 11, flex: 1, minWidth: 50, padding: "3px 6px" }} maxLength={30} /><span onClick={function () { setEditP(function (p) { var o = { ...p.prefs.dayOverrides }; delete o[d]; return { ...p, prefs: { ...p.prefs, dayOverrides: o } }; }); }} style={{ fontSize: 12, color: Co.txD, cursor: "pointer" }}>{"\u2715"}</span></div>; })}
{(function () { var avail = DAYS.filter(function (d) { return !Object.keys(editP.prefs.dayOverrides).includes(d); }); if (avail.length === 0) return null; return <div style={{ marginTop: 6 }}><span onClick={function () { setEditP(function (p) { var d = DAYS.filter(function (x) { return !Object.keys(p.prefs.dayOverrides).includes(x); })[0]; if (!d) return p; return { ...p, prefs: { ...p.prefs, dayOverrides: { ...p.prefs.dayOverrides, [d]: { latestEnd: "17:00", note: "" } } } }; }); }} style={{ fontSize: 11, color: Co.ac, cursor: "pointer", fontWeight: 600 }}>+ Add day</span></div>; })()}
</div>
</Collapsible>
</div>
)}
<div style={{ display: "flex", gap: 8 }}><Btn onClick={function () { setEditP(null); }} style={{ flex: 1 }}>Cancel</Btn><Btn variant="primary" onClick={savePharm} style={{ flex: 1 }}>Save</Btn></div>
</div>
)}
{/* STEP 4: Current template (improve) or Review (scratch) */}
{step === 4 && mode === "improve" && (
<div>
<div className="section-heading" style={{ marginBottom: 11 }}>Your current template</div>
<div style={{ display: "flex", gap: 6, marginBottom: 11, flexWrap: "wrap" }}>
<div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 11px", background: Co.gnS, borderRadius: 6 }}><span style={{ color: Co.gn, fontWeight: 700, fontSize: 14 }}>F</span><span style={{ fontSize: 11, color: Co.txMu }}>Full day</span></div>
<div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 11px", background: "rgba(91,141,239,0.12)", borderRadius: 6 }}><span style={{ color: "#5B8DEF", fontWeight: 700, fontSize: 14 }}>{store.is24hr ? "E" : "O"}</span><span style={{ fontSize: 11, color: Co.txMu }}>/</span><span style={{ color: Co.pu, fontWeight: 700, fontSize: 14 }}>{store.is24hr ? "L" : "C"}</span><span style={{ fontSize: 11, color: Co.txMu }}>Split</span></div>
</div>
<div style={{ fontSize: 12, color: Co.txMu, marginBottom: 14 }}>Tap cells to assign.</div>
{(function () {
if (!curSched) return null;
var wks = []; for (var w = 0; w < (store.rotationWeeks || 2); w++) wks.push(w);
return wks.map(function (wi) {
return <Card key={wi} style={{ padding: store.rotationWeeks >= 4 ? 8 : 12 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: store.rotationWeeks >= 4 ? 5 : 8 }}>Week {wi + 1}</div>
<div style={{ display: "grid", gridTemplateColumns: "auto repeat(7, 1fr)", gap: store.rotationWeeks >= 4 ? 2 : 3 }}>
<div />
{DAYS.map(function (d) { return <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: Co.txMu, padding: "2px 0" }}>{d}</div>; })}
{pharms.map(function (p) {
return [<div key={p.id + "-n"} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 2px" }}><span style={{ fontSize: 11, fontWeight: 700, color: p.color, padding: "3px 6px", background: p.color + "18", border: "1px solid " + p.color + "30", borderRadius: 4, whiteSpace: "nowrap" }}>{p.role === "pm" ? "PM" : firstName(p)}</span></div>].concat(DAYS.map(function (d) {
var dh = store.hours[d];
if (!dh || !dh.isOpen) return <div key={p.id + d} style={{ textAlign: "center", fontSize: 11, color: Co.txD, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44 }}>{"\u2013"}</div>;
var k = wi + "-" + p.id + "-" + d; var val = curSched[k] || "";
var bg = val === "O" ? "rgba(91,141,239,0.12)" : val === "C" ? Co.puS : val === "F" ? Co.tlS : val === "W" ? Co.amS : Co.bg;
var clr = val === "O" ? "#5B8DEF" : val === "C" ? Co.pu : val === "F" ? Co.tl : val === "W" ? Co.am : Co.txD;
var label = val === "O" ? (store.is24hr ? "E" : "O") : val === "C" ? (store.is24hr ? "L" : "C") : val === "F" ? "F" : val === "W" ? "W" : "";
return <div key={p.id + d} onClick={function () { cycleCurAssign(wi, p.id, d); }} style={{ textAlign: "center", padding: "10px 0", minHeight: 44, fontSize: 16, fontWeight: 700, color: clr, background: bg, borderRadius: 6, cursor: "pointer", border: val ? "1.5px solid " + clr + "40" : "1.5px dashed " + Co.bdr, userSelect: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>{label}</div>;
}));
})}
</div>
{(function () {
var anyMulti = DAYS.some(function (d) { return pharms.filter(function (p) { return curSched[wi + "-" + p.id + "-" + d]; }).length >= 2; });
if (!anyMulti) return null;
var isOpen = curOverrides["*show*" + wi];
return <div style={{ marginTop: 8 }}>
<div onClick={function () { setCurOverrides(function (o) { var no = { ...o }; no["*show*" + wi] = !o["*show*" + wi]; return no; }); }} style={{ fontSize: 11, color: Co.ac, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><span style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", fontSize: 12 }}>{"\u203A"}</span> Adjust shift times</div>
{isOpen ? <div style={{ marginTop: 8, padding: "10px 12px", background: Co.bg, borderRadius: 8 }}>
{DAYS.map(function (d) {
var dh = store.hours[d]; if (!dh || !dh.isOpen) return null;
var assignedP = pharms.filter(function (p) { return curSched[wi + "-" + p.id + "-" + d]; });
if (assignedP.length < 2) return null;
var isSplit = assignedP.length === 2 && assignedP.some(function (p) { return curSched[wi + "-" + p.id + "-" + d] === "O"; });
var ovlKey = "ovl-" + wi + "-" + d; var isOverlap = curOverrides[ovlKey] || assignedP.length >= 3;
var segS = t2m(dh.open), segE = t2m(dh.close);
return <div key={d} style={{ padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}>
<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
<span style={{ fontSize: 12, fontWeight: 700, width: 32 }}>{d}</span>
<span style={{ fontSize: 11, color: Co.txMu, flex: 1 }}>{assignedP.length} pharmacists</span>
{assignedP.length < 3 ? <div onClick={function () { setCurOverrides(function (o) { var no = { ...o }; if (no[ovlKey]) delete no[ovlKey]; else no[ovlKey] = true; return no; }); }} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "4px 10px", borderRadius: 6, background: isOverlap ? Co.acS : Co.card, border: "1px solid " + (isOverlap ? Co.ac + "40" : Co.bdr) }}><div style={{ width: 14, height: 14, borderRadius: 3, border: "1.5px solid " + (isOverlap ? Co.ac : Co.txD), display: "flex", alignItems: "center", justifyContent: "center", background: isOverlap ? Co.ac : "transparent" }}>{isOverlap ? <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>{"\u2713"}</span> : null}</div><span style={{ fontSize: 11, fontWeight: 600, color: isOverlap ? Co.ac : Co.txMu }}>Overlap</span></div> : null}
</div>
{isOverlap ? <div style={{ paddingLeft: 12 }}>{assignedP.map(function (p) { var sK = "os-" + wi + "-" + d + "-" + p.id, eK = "oe-" + wi + "-" + d + "-" + p.id; return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}><span style={{ fontSize: 11, fontWeight: 600, color: p.color, padding: "2px 6px", background: p.color + "15", borderRadius: 4 }}>{p.role === "pm" ? "PM" : firstName(p)}</span><TSel value={curOverrides[sK] || dh.open} onChange={function (v) { setCurOverrides(function (o) { return { ...o, [sK]: v }; }); }} /><span style={{ fontSize: 11, color: Co.txD }}>{"\u2013"}</span><TSel value={curOverrides[eK] || dh.close} onChange={function (v) { setCurOverrides(function (o) { return { ...o, [eK]: v }; }); }} /></div>; })}</div>
: isSplit ? <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 12 }}><span style={{ fontSize: 11, color: Co.txMu, fontWeight: 600 }}>Handoff at</span><TSel value={curOverrides[wi + "-" + d] || m2t(snap30(segS + Math.round((segE - segS) * 0.55)))} onChange={function (v) { setCurOverrides(function (o) { return { ...o, [wi + "-" + d]: v }; }); }} /></div> : null}
</div>;
})}
</div> : null}
</div>;
})()}
</Card>;
});
})()}
</div>
)}
{step === 4 && mode !== "improve" && (
<div>
<div className="section-heading" style={{ marginBottom: 16 }}>Ready</div>
<Card>
<div style={{ ...mono, fontSize: 20, fontWeight: 700, marginBottom: 2 }}>{store.storeLabel || "Store"}{store.is24hr ? " (24hr)" : ""}</div>
<div style={{ fontSize: 12, color: Co.txMu, marginBottom: 10 }}>{store.allocatedHoursPerWeek}h/wk {"\u00B7"} {store.rotationWeeks}-wk {"\u00B7"} {pharms.length} RPh</div>
{pharms.map(function (p) { return <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderTop: "1px solid " + Co.bdrL }}><div style={{ width: 8, height: 8, borderRadius: 4, background: p.role === "ovnt" ? Co.pu : p.role === "dsp" ? Co.tl : p.color }} /><span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name}</span><span style={{ fontSize: 11, color: Co.txMu }}>{p.role === "pm" ? "PM" : p.role === "dsp" ? "DSP" : p.role === "ovnt" ? "OVNT" : "Staff"} {"\u00B7"} {p.targetHours}h/wk</span></div>; })}
</Card>
</div>
)}
{/* STEP 5: Results */}
{step === 5 && results && results.length === 0 && (
<div>
<Card style={{ padding: 20, borderLeft: "3px solid " + Co.rd }}>
<div style={{ fontSize: 16, fontWeight: 700, color: Co.rd, marginBottom: 8 }}>{"\u26A0"} No Valid Schedule Found</div>
<div style={{ fontSize: 13, color: Co.txM, lineHeight: 1.6, marginBottom: 12 }}>The engine tested 40 different seed configurations and couldn{"'"}t produce a schedule that meets minimum coverage requirements within the allocated demand hours.</div>
<div style={{ fontSize: 13, fontWeight: 600, color: Co.tx, marginBottom: 8 }}>Common causes:</div>
<div style={{ fontSize: 12, color: Co.txMu, lineHeight: 1.7 }}>
{"\u2022"} Too many fixed days off — if everyone has the same day locked, that day can{"'"}t be covered{"\n"}
{"\u2022"} Demand hours too low for the number of open days — try increasing them{"\n"}
{"\u2022"} Shift length constraints too tight — min shift length or max shift length may prevent viable assignments{"\n"}
{"\u2022"} Too few pharmacists for the rotation length — a 5-week rotation with only 1 PM and 1 Staff is very constrained
</div>
<div style={{ display: "flex", gap: 8, marginTop: 16 }}>
<Btn onClick={function () { setStep(3); setResults(null); }} style={{ flex: 1 }}>Edit Team</Btn>
<Btn onClick={function () { setStep(0); setResults(null); }} style={{ flex: 1 }}>Edit Store</Btn>
</div>
</Card>
</div>
)}
{step === 5 && results && results.length > 0 && (function () {
var hero = results[0]; var sc = hero.score; var gClr = gc(sc.grade);
var allHonored = results.length > 1 ? results[1] : null;
var R = hero.schedule ? hero.schedule.weeks.length : 2;
var narrative = mode === "improve" && curScore ? genNarrative(curScore, sc, pharms, R) : [];
if (store._originalBudget && store._originalBudget !== store.allocatedHoursPerWeek) {
var bdiff = (+store.allocatedHoursPerWeek || 0) - (+store._originalBudget || 0);
narrative = ["Demand hours " + (bdiff > 0 ? "increased" : "decreased") + " by " + fmtH(Math.abs(bdiff)) + "h (" + fmtH(store._originalBudget) + "h \u2192 " + fmtH(store.allocatedHoursPerWeek) + "h)"].concat(narrative);
}
if (store._originalRot && store._originalRot !== store.rotationWeeks) {
narrative = ["Rotation changed from " + store._originalRot + "-week to " + store.rotationWeeks + "-week cycle"].concat(narrative);
}
var activeWk = hero.schedule && hero.schedule.weeks ? hero.schedule.weeks[showWk] || hero.schedule.weeks[0] : null;
var prefCosts = whatIf || [];
function togPanel(p) { setResultPanel(resultPanel === p ? null : p); }
var freeCosts = prefCosts.filter(function (c) { return c.costLevel === "free"; });
var lowCosts = prefCosts.filter(function (c) { return c.costLevel === "low"; });
var manageCosts = prefCosts.filter(function (c) { return c.costLevel === "manageable"; });
var expensiveCosts = prefCosts.filter(function (c) { return c.costLevel === "expensive" || c.costLevel === "not_advisable"; });
return <div>
<div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
<div style={{ flex: 1 }}>
<div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{store.storeLabel ? store.storeLabel : "Schedule"}</div>
<div style={{ fontSize: 12, color: Co.txMu, marginTop: 2 }}>Recommended Schedule</div>
<div style={{ marginTop: 8 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ ...mono, fontSize: 14, fontWeight: 700, color: gClr }}>{sc.total} / 100</div><div style={{ flex: 1, height: 4, background: Co.bdr, borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: sc.total + "%", background: gClr, borderRadius: 2, opacity: 0.6 }} /></div></div>
<div style={{ display: "flex", gap: 6, marginTop: 4 }}><span style={{ fontSize: 11, color: Co.txMu }}>{fmtH(store.allocatedHoursPerWeek)}h demand</span><span style={{ fontSize: 11, color: Co.txD }}>{"\u00B7"}</span><span style={{ fontSize: 11, color: Co.txMu }}>{store.rotationWeeks}-wk</span><span style={{ fontSize: 11, color: Co.txD }}>{"\u00B7"}</span><span style={{ fontSize: 11, color: Co.txMu }}>{pharms.filter(function(p) { return p.role !== "ovnt" && p.role !== "dsp"; }).length} RPh{pharms.some(function(p) { return p.role === "dsp"; }) ? " + DSP" : ""}</span></div>
</div>
</div>
<div style={{ padding: "11px 18px", borderRadius: 12, background: gClr, textAlign: "center", border: "2px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 20px " + gClr + "60, 0 2px 8px rgba(0,0,0,0.2)" }}><div style={{ ...mono, fontSize: 32, fontWeight: 700, color: "#fff", lineHeight: 1, textShadow: "0 1px 4px rgba(0,0,0,0.35), 0 0px 1px rgba(0,0,0,0.2)" }}>{sc.grade}</div><div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginTop: 3, letterSpacing: 0.5, textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>GRADE</div></div>
</div>
{/* DEMAND GAP CALLOUT */}
{sc.gapAction === "dsp" ? (function () {
var hasDspInTeam = pharms.some(function (px) { return px.role === "dsp"; });
return <div style={{ padding: "10px 14px", background: Co.amS, borderRadius: 10, marginBottom: 10, borderLeft: "3px solid " + Co.am, display: "flex", alignItems: "center", gap: 10 }}>
<div style={{ fontSize: 16, flexShrink: 0 }}>{"\u23F1"}</div>
<div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: Co.am }}>{fmtH(sc.weeklyGap)}h/wk unallocated</div><div style={{ fontSize: 11, color: Co.txM, marginTop: 2 }}>{hasDspInTeam ? "Current DSP coverage doesn\u2019t fully close the gap. Additional DSP hours or shift extensions needed." : "A DSP shift is needed to cover the remaining hours. Minimum shift length is 4h."}</div></div>
</div>;
})() : null}
{sc.gapAction === "extend" ? <div style={{ padding: "10px 14px", background: Co.tlS, borderRadius: 10, marginBottom: 10, borderLeft: "3px solid " + Co.tl, display: "flex", alignItems: "center", gap: 10 }}>
<div style={{ fontSize: 16, flexShrink: 0 }}>{"\u23F1"}</div>
<div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: Co.tl }}>{fmtH(sc.weeklyGap)}h/wk remaining after shift extensions</div><div style={{ fontSize: 11, color: Co.txM, marginTop: 2 }}>Shifts were extended where possible. The remaining gap is too small for a DSP shift {"\u2014"} manual adjustment may be needed.</div></div>
</div> : null}
{/* WEEKLY GRID */}
<div style={{ background: Co.card, borderRadius: 11, boxShadow: shadow.md, padding: 11, marginBottom: 8 }}>
<div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
{R > 1 ? <div style={{ display: "flex", gap: 2 }}>{(function () { var tabs = []; for (var wi = 0; wi < R; wi++) tabs.push(wi); return tabs; })().map(function (wi) { return <div key={wi} onClick={function () { setShowWk(wi); }} style={{ padding: "3px 11px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", background: showWk === wi ? Co.ac + "18" : "transparent", color: showWk === wi ? Co.ac : Co.txD, border: showWk === wi ? "1px solid " + Co.ac + "30" : "1px solid transparent" }}>Wk {wi + 1}</div>; })}</div> : null}
<div style={{ flex: 1 }} />
<div style={{ display: "flex", gap: 0, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>{sc.perPerson.map(function (f, fi) { return <div key={f.pharmacistId} style={{ display: "flex", alignItems: "center" }}>{fi > 0 ? <div style={{ width: 1, height: 28, background: Co.bdr, margin: "0 8px", flexShrink: 0 }} /> : null}<div style={{ textAlign: "center" }}><div style={{ fontSize: 11, fontWeight: 700, color: f.color, padding: "2px 6px", background: f.color + "15", borderRadius: 4, display: "inline-block" }}>{firstName(f)}</div><div style={{ fontSize: 10, color: Co.txMu, marginTop: 1 }}>{fmtH(f.avgHours)}h/wk</div></div></div>; })}</div>
</div>
{activeWk ? <table style={{ width: "100%", borderCollapse: "collapse", background: Co.bg, borderRadius: 6, tableLayout: "fixed" }}><thead><tr>{DAYS.map(function (d) { return <th key={d} style={{ padding: "4px 1px", textAlign: "center", fontWeight: 700, fontSize: 11, borderBottom: "1px solid " + Co.bdr }}>{d}</th>; })}</tr></thead><tbody><tr>{DAYS.map(function (d) {
var allA = activeWk[d] || []; var dayA = allA.filter(function (a) { return a.pharmacistId !== "dsp-auto" && a.pharmacistId !== "ovnt-auto"; }); var dayOvnt = allA.filter(function (a) { return a.pharmacistId === "ovnt-auto"; });
return <td key={d} style={{ padding: 2, verticalAlign: "top", borderLeft: "1px solid " + Co.bdrL }}>
{dayA.map(function (a, i) { var p = pharms.find(function (x) { return x.id === a.pharmacistId; }); var nm = p ? (p.role === "pm" ? "PM" : firstName(p)) : "?"; var clr = p ? p.color : Co.ac; return <div key={i} style={{ padding: "3px 3px", marginBottom: 1, borderRadius: 2, borderLeft: "2px solid " + clr, fontSize: 11 }}><div style={{ fontWeight: 700, color: clr, fontSize: 11 }}>{nm}</div><div style={{ ...mono, fontSize: 11, color: Co.txMu }}>{tL(a.start).replace(":00", "")}-{tL(a.end).replace(":00", "")}</div></div>; })}
{dayOvnt.map(function (a, i) { return <div key={"ov" + i} style={{ padding: "1px 2px", marginTop: 1, borderRadius: 2, borderLeft: "2px solid " + Co.pu, fontSize: 11, background: Co.puS }}><div style={{ fontWeight: 700, color: Co.pu, fontSize: 11 }}>OV</div></div>; })}
{dayA.length === 0 && dayOvnt.length === 0 ? <div style={{ fontSize: 11, color: Co.txD, textAlign: "center" }}>{"\u2013"}</div> : null}
</td>;
})}</tr></tbody></table> : null}
<div style={{ display: "flex", gap: 0, marginTop: 8, paddingTop: 8, borderTop: "1px solid " + Co.bdrL }}>{sc.perPerson.map(function (f, fi) {
var wD = 0, wH = 0, wO = 0, wC = 0, wF = 0;
if (activeWk) { DAYS.forEach(function (d) { (activeWk[d] || []).forEach(function (a) { if (a.pharmacistId === f.pharmacistId) { wD++; wH += (t2m(a.end) - t2m(a.start)) / 60; var dh = store.hours[d]; var isOp = dh && t2m(a.start) <= t2m(dh.open) + 30; var isCl = dh && t2m(a.end) >= t2m(dh.close) - 30; if (isOp && isCl) wF++; else { if (isOp) wO++; if (isCl) wC++; } } }); }); }
var parts = [wD + " days", fmtH(wH) + "h"]; if (wF > 0) parts.push(wF + " full"); if (wO > 0) parts.push(wO + "O"); if (wC > 0) parts.push(wC + "C");
return <div key={f.pharmacistId} style={{ display: "flex", alignItems: "stretch" }}>{fi > 0 ? <div style={{ width: 1, background: Co.bdr, margin: "0 10px", flexShrink: 0 }} /> : null}<div style={{ flex: 1, fontSize: 11, textAlign: "center" }}><div style={{ fontWeight: 700, color: f.color, marginBottom: 4, padding: "2px 8px", background: f.color + "12", borderRadius: 4, display: "inline-block" }}>{firstName(f)} {"\u2014"} Wk {showWk + 1}</div><div style={{ color: Co.txMu, lineHeight: 1.5 }}>{parts.join(" \u00B7 ")}</div></div></div>;
})}</div>
</div>
{/* VS. CURRENT COMPARISON */}
{mode === "improve" && curScore ? <div onClick={function () { togPanel(resultPanel === "compare" ? null : "compare"); }} style={{ background: Co.card, borderRadius: 11, boxShadow: shadow.sm, padding: "12px 16px", marginBottom: 8, border: "1px solid " + Co.bdrL, cursor: "pointer" }}>
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
<div style={{ textAlign: "center" }}><div style={{ ...mono, fontSize: 22, fontWeight: 700, color: gc(curScore.grade), lineHeight: 1 }}>{curScore.grade}</div><div style={{ fontSize: 11, color: Co.txMu, marginTop: 2 }}>Current</div></div>
<div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "0 8px" }}>
<div style={{ flex: 1, height: 3, background: Co.bdr, borderRadius: 2, position: "relative" }}><div style={{ position: "absolute", top: -3, left: Math.min(curScore.total, 100) + "%", width: 8, height: 8, borderRadius: 4, background: gc(curScore.grade), border: "1.5px solid " + Co.card }} /></div>
<div style={{ fontSize: 16, color: Co.txMu }}>{"\u2192"}</div>
<div style={{ flex: 1, height: 3, background: Co.bdr, borderRadius: 2, position: "relative" }}><div style={{ position: "absolute", top: -3, left: Math.min(sc.total, 100) + "%", width: 8, height: 8, borderRadius: 4, background: gClr, border: "1.5px solid " + Co.card }} /></div>
</div>
<div style={{ textAlign: "center" }}><div style={{ ...mono, fontSize: 22, fontWeight: 700, color: gClr, lineHeight: 1 }}>{sc.grade}</div><div style={{ fontSize: 11, color: Co.txMu, marginTop: 2 }}>New</div></div>
<div style={{ ...mono, fontSize: 13, fontWeight: 700, color: sc.total >= curScore.total ? Co.gn : Co.rd, padding: "4px 10px", background: sc.total >= curScore.total ? Co.gnS : Co.rdS, borderRadius: 6 }}>{sc.total >= curScore.total ? "+" : ""}{sc.total - curScore.total}</div>
<span style={{ fontSize: 12, color: Co.txD, transform: resultPanel === "compare" ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"\u203A"}</span>
</div>
{resultPanel === "compare" ? <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + Co.bdrL }}>
{narrative.length > 0 ? narrative.map(function (b, bi) { return <div key={bi} style={{ fontSize: 11, color: Co.ac, marginBottom: 3 }}>{"\u2713"} {b}</div>; }) : <div style={{ fontSize: 11, color: Co.gn }}>Your current schedule matches the best option.</div>}
<div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>{[{ l: "Coverage", o: curScore.components.coverage, n: sc.components.coverage }, { l: "Demand", o: curScore.components.budget, n: sc.components.budget }, { l: "Peak", o: curScore.components.peak, n: sc.components.peak }, { l: "Fairness", o: curScore.components.fairness, n: sc.components.fairness }, { l: "Sustain", o: curScore.components.sustainability, n: sc.components.sustainability }, { l: "Prefs", o: curScore.components.preferences, n: sc.components.preferences }].map(function (cmp) {
var delta = cmp.n - cmp.o; var clr = delta > 0 ? Co.gn : delta < 0 ? Co.rd : Co.txMu;
return <div key={cmp.l} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: Co.bg, borderRadius: 6, minWidth: 50 }}><div style={{ fontSize: 10, color: Co.txMu, marginBottom: 3 }}>{cmp.l}</div><div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3 }}><span style={{ ...mono, fontSize: 10, color: Co.txD }}>{Math.round(cmp.o)}</span><span style={{ fontSize: 9, color: Co.txD }}>{"\u2192"}</span><span style={{ ...mono, fontSize: 10, fontWeight: 700, color: clr }}>{Math.round(cmp.n)}</span></div><div style={{ ...mono, fontSize: 10, fontWeight: 700, color: clr, marginTop: 2 }}>{delta > 0 ? "+" : ""}{delta}</div></div>;
})}</div>
</div> : null}
</div> : null}
{prefCosts.length > 0 ? (function () {
var unmetCosts = prefCosts.filter(function (c) { return c.costLevel !== "free" && c.delta > -99; });
var cheapest = unmetCosts.length > 0 ? unmetCosts.reduce(function (best, c) { return c.delta > best.delta ? c : best; }, unmetCosts[0]) : null;
return <div style={{ marginBottom: 8 }}>
{cheapest && unmetCosts.length > 1 ? <div style={{ background: Co.card, borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid " + Co.bdrL, boxShadow: shadow.sm }}>
<div style={{ fontSize: 11, fontWeight: 700, color: Co.pu, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Sensitivity Insight</div>
<div style={{ fontSize: 12, color: Co.tx, lineHeight: 1.5 }}>Easiest preference to accommodate: <span style={{ fontWeight: 700, color: cheapest.color }}>{cheapest.pharmacistName}</span> {cheapest.label.replace(cheapest.pharmacistName + " ", "")} <span style={{ ...mono, fontWeight: 700, color: cheapest.delta >= -1 ? Co.gn : Co.am }}>({cheapest.delta >= 0 ? "free" : cheapest.delta + " pts"})</span></div>
{expensiveCosts.length > 0 ? <div style={{ fontSize: 11, color: Co.txMu, marginTop: 4 }}>Most expensive: {expensiveCosts[0].label} ({expensiveCosts[0].delta} pts)</div> : null}
</div> : null}
<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, paddingLeft: 4 }}><div style={{ fontSize: 13, fontWeight: 700, color: Co.tx }}>Preference Impact</div><span onClick={function () { togPanel("conflict"); }} style={{ fontSize: 11, color: Co.ac, cursor: "pointer", fontWeight: 600, marginLeft: "auto" }}>Full checklist {"\u203A"}</span></div>
<div style={{ fontSize: 11, color: Co.txMu, marginBottom: 8, paddingLeft: 4 }}>Point cost of forcing each unmet preference.</div>
{freeCosts.length > 0 ? <div style={{ marginBottom: 6 }}><div style={{ fontSize: 11, fontWeight: 600, color: Co.gn, marginBottom: 4, paddingLeft: 4 }}>Already honored</div>{freeCosts.map(function (c, ci) { return <div key={ci} style={{ padding: "6px 11px", background: Co.card, borderRadius: 8, marginBottom: 3, display: "flex", alignItems: "center", gap: 8, border: "1px solid " + Co.bdrL }}><div style={{ fontSize: 11, color: c.color, fontWeight: 600, padding: "1px 6px", background: c.color + "15", borderRadius: 3 }}>{c.pharmacistName}</div><div style={{ fontSize: 11, color: Co.txMu, flex: 1 }}>{c.label.replace(c.pharmacistName + " ", "")}</div><div style={{ fontSize: 11, color: Co.gn, fontWeight: 700 }}>{"\u2713"}</div></div>; })}</div> : null}
{lowCosts.length > 0 ? <div style={{ marginBottom: 6 }}><div style={{ fontSize: 11, fontWeight: 600, color: Co.gn, marginBottom: 4, paddingLeft: 4 }}>Low cost</div>{lowCosts.map(function (c, ci) { return <div key={ci} style={{ padding: "6px 11px", background: Co.card, borderRadius: 8, marginBottom: 3, display: "flex", alignItems: "center", gap: 8, border: "1px solid " + Co.bdrL }}><div style={{ fontSize: 11, color: c.color, fontWeight: 600, padding: "1px 6px", background: c.color + "15", borderRadius: 3 }}>{c.pharmacistName}</div><div style={{ fontSize: 11, color: Co.txMu, flex: 1 }}>{c.label.replace(c.pharmacistName + " ", "")}</div><div style={{ ...mono, fontSize: 11, color: Co.gn, fontWeight: 700 }}>{c.delta} pts</div></div>; })}</div> : null}
{manageCosts.length > 0 ? <div style={{ marginBottom: 6 }}><div style={{ fontSize: 11, fontWeight: 600, color: Co.am, marginBottom: 4, paddingLeft: 4 }}>Manageable</div>{manageCosts.map(function (c, ci) { return <div key={ci} style={{ padding: "6px 11px", background: Co.card, borderRadius: 8, marginBottom: 3, display: "flex", alignItems: "center", gap: 8, border: "1px solid " + Co.am + "30", borderLeft: "3px solid " + Co.am }}><div style={{ fontSize: 11, color: c.color, fontWeight: 600, padding: "1px 6px", background: c.color + "15", borderRadius: 3 }}>{c.pharmacistName}</div><div style={{ fontSize: 11, color: Co.txMu, flex: 1 }}>{c.label.replace(c.pharmacistName + " ", "")}</div><div style={{ ...mono, fontSize: 11, color: Co.am, fontWeight: 700 }}>{c.delta} pts</div></div>; })}</div> : null}
{expensiveCosts.length > 0 ? <div style={{ marginBottom: 6 }}><div style={{ fontSize: 11, fontWeight: 600, color: Co.rd, marginBottom: 4, paddingLeft: 4 }}>Expensive</div>{expensiveCosts.map(function (c, ci) { return <div key={ci} style={{ padding: "6px 11px", background: Co.card, borderRadius: 8, marginBottom: 3, display: "flex", alignItems: "center", gap: 8, border: "1px solid " + Co.rd + "30", borderLeft: "3px solid " + Co.rd }}><div style={{ fontSize: 11, color: c.color, fontWeight: 600, padding: "1px 6px", background: c.color + "15", borderRadius: 3 }}>{c.pharmacistName}</div><div style={{ fontSize: 11, color: Co.txMu, flex: 1 }}>{c.label.replace(c.pharmacistName + " ", "")}</div><div style={{ ...mono, fontSize: 11, color: Co.rd, fontWeight: 700 }}>{c.delta} pts</div></div>; })}</div> : null}
{freeCosts.length === prefCosts.length ? <div style={{ padding: "8px 11px", fontSize: 12, color: Co.gn, fontWeight: 600 }}>{"\u2713"} All preferences honored at no cost.</div> : null}
</div>;
})() : null}
{/* ALL HONORED COMPARISON */}
{allHonored ? <div onClick={function () { togPanel(resultPanel === "allHonored" ? null : "allHonored"); }} style={{ background: Co.card, borderRadius: 11, boxShadow: shadow.sm, padding: "12px 16px", marginBottom: 8, border: "1px solid " + Co.bdrL, cursor: "pointer" }}>
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
<div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700, color: Co.tx }}>What if we honored everything?</div><div style={{ fontSize: 11, color: Co.txMu, marginTop: 2 }}>Every preference treated as a need.</div></div>
<div style={{ textAlign: "center" }}><div style={{ ...mono, fontSize: 18, fontWeight: 700, color: gc(allHonored.score.grade), lineHeight: 1 }}>{allHonored.score.grade}</div><div style={{ fontSize: 10, color: Co.txMu, marginTop: 1 }}>{allHonored.score.total} pts</div></div>
<div style={{ ...mono, fontSize: 12, fontWeight: 700, color: sc.total - allHonored.score.total > 0 ? Co.rd : Co.gn, padding: "3px 8px", background: sc.total - allHonored.score.total > 0 ? Co.rdS : Co.gnS, borderRadius: 4 }}>{sc.total - allHonored.score.total > 0 ? "\u2212" + (sc.total - allHonored.score.total) : sc.total === allHonored.score.total ? "Same" : "+" + (allHonored.score.total - sc.total)}</div>
<span style={{ fontSize: 12, color: Co.txD, transform: resultPanel === "allHonored" ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"\u203A"}</span>
</div>
{resultPanel === "allHonored" ? <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid " + Co.bdrL }}>
<div style={{ display: "flex", gap: 6, marginBottom: 10 }}>{[{ l: "Coverage", r: sc.components.coverage, a: allHonored.score.components.coverage }, { l: "Demand", r: sc.components.budget, a: allHonored.score.components.budget }, { l: "Peak", r: sc.components.peak, a: allHonored.score.components.peak }, { l: "Fairness", r: sc.components.fairness, a: allHonored.score.components.fairness }, { l: "Sustain", r: sc.components.sustainability, a: allHonored.score.components.sustainability }, { l: "Prefs", r: sc.components.preferences, a: allHonored.score.components.preferences }].map(function (cmp) {
var delta = cmp.a - cmp.r; var clr = delta > 0 ? Co.gn : delta < 0 ? Co.rd : Co.txMu;
return <div key={cmp.l} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: Co.bg, borderRadius: 6 }}><div style={{ fontSize: 10, color: Co.txMu, marginBottom: 2 }}>{cmp.l}</div><div style={{ ...mono, fontSize: 11, fontWeight: 700, color: clr }}>{delta > 0 ? "+" : ""}{delta}</div></div>;
})}</div>
<div style={{ fontSize: 11, color: sc.total > allHonored.score.total ? Co.txMu : allHonored.score.total > sc.total ? Co.gn : Co.txMu, lineHeight: 1.5, fontWeight: allHonored.score.total > sc.total ? 600 : 400 }}>{sc.total > allHonored.score.total ? "Honoring all preferences costs " + (sc.total - allHonored.score.total) + " points. The recommended schedule is stronger overall." : sc.total === allHonored.score.total ? "Honoring everything has no cost \u2014 the recommended schedule already honors all preferences." : "\u2713 Honoring everything actually scores higher (+" + (allHonored.score.total - sc.total) + " pts). This may be the better option."}</div>
</div> : null}
</div> : null}
{/* DETAIL PANELS */}
<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 8 }}>
{[{ k: "conflict", l: "Conflict Report", sub: (function () { var tf = 0; var dsIds = pharms.filter(function (px) { return px.role !== "ovnt" && px.role !== "dsp"; }).map(function (px) { return px.id; }); sc.perPerson.forEach(function (pp) { if (dsIds.includes(pp.pharmacistId)) tf += pp.tradeoffs.length; }); return tf === 0 ? "No conflicts" : tf + " tradeoff" + (tf > 1 ? "s" : ""); })(), c: Co.am, ico: "\u26A0" }, { k: "rotation", l: "Rotation View", sub: R + "-wk at a glance", c: Co.pu, ico: "\u29C9" }, { k: "strengths", l: "Strengths", sub: sc.strengths.length + " identified", c: Co.gn, ico: "\u2605" }, { k: "scores", l: "Score Breakdown", sub: sc.total + " pts", c: Co.txMu, ico: "\u2261" }, { k: "perPerson", l: "Per Person", sub: "Rotation stats", c: Co.ac, ico: "\u25CF" }, { k: "weekCompare", l: "Week vs Week", sub: R + "-wk comparison", c: Co.tl, ico: "\u229A" }].map(function (tab) {
var isActive = resultPanel === tab.k || (tab.k === "scores" && resultPanel === "scoresCur");
return <div key={tab.k} onClick={function () { if (tab.k === "scores" && (resultPanel === "scores" || resultPanel === "scoresCur")) { setResultPanel(null); } else { togPanel(tab.k); } }} style={{ padding: "11px 12px", borderRadius: 8, background: isActive ? tab.c + "10" : Co.card, border: "1px solid " + (isActive ? tab.c + "40" : Co.bdrL), cursor: "pointer", boxShadow: shadow.sm, display: "flex", alignItems: "center", gap: 8 }}><div style={{ fontSize: 14, flexShrink: 0 }}>{tab.ico}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: isActive ? tab.c : Co.tx }}>{tab.l}</div><div style={{ fontSize: 11, color: Co.txMu }}>{tab.sub}</div></div><span style={{ fontSize: 12, color: Co.txD, transform: isActive ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>{"\u203A"}</span></div>;
})}
</div>
{/* CONFLICT REPORT PANEL */}
{resultPanel === "conflict" ? (function () {
var totalTradeoffs = 0; var dayStaffOnly = pharms.filter(function (px) { return px.role !== "ovnt" && px.role !== "dsp"; });
sc.perPerson.forEach(function (pp) { if (dayStaffOnly.some(function (px) { return px.id === pp.pharmacistId; })) totalTradeoffs += pp.tradeoffs.length; });
var allClear = totalTradeoffs === 0;
return <Card style={{ padding: 0, marginBottom: 8, overflow: "hidden" }}>
<div style={{ padding: "14px 16px 10px", borderBottom: "1px solid " + Co.bdrL, background: allClear ? Co.gnS : "transparent" }}>
<div style={{ fontSize: 14, fontWeight: 700, color: allClear ? Co.gn : Co.am, marginBottom: 2 }}>{allClear ? "\u2713 All Preferences Satisfied" : "\u26A0 Preference Tradeoffs"}</div>
<div style={{ fontSize: 11, color: Co.txMu, lineHeight: 1.5 }}>{allClear ? "Every preference was honored. No compromises needed." : "Every preference was considered. " + totalTradeoffs + " could not be fully honored."}</div>
</div>
{dayStaffOnly.map(function (p) {
var f = sc.perPerson.find(function (pp) { return pp.pharmacistId === p.id; });
if (!f) return null;
var prefs = [];
p.prefs.fixedDaysOff.forEach(function (dd) { prefs.push({ k: "_fixed_" + dd, l: dd + " off (fixed)", need: true, alwaysMet: true }); });
if (p.prefs.preferredWeekendDay) prefs.push({ k: "weekendPref", l: "Prefers " + p.prefs.preferredWeekendDay + " off", need: (p.prefs.needs || {}).weekendPref });
if (p.prefs.preferEarly) prefs.push({ k: "preferEarly", l: "Prefers opening", need: (p.prefs.needs || {}).preferEarly });
if (p.prefs.preferLate) prefs.push({ k: "preferLate", l: "Prefers closing", need: (p.prefs.needs || {}).preferLate });
if (p.prefs.noClopening) prefs.push({ k: "noClopening", l: "No close-to-open", need: (p.prefs.needs || {}).noClopening });
if ((p.prefs.preferredDaysOff || []).length > 0) prefs.push({ k: "preferredDaysOff", l: "Prefers " + p.prefs.preferredDaysOff.join(", ") + " off", need: false });
if (p.prefs.threeDayWeekend) prefs.push({ k: "threeDayWeekend", l: "3-day weekend block", need: false });
if (p.prefs.noBackToBackLong) prefs.push({ k: "noBackToBackLong", l: "No back-to-back long shifts", need: false });
if (p.prefs.maxDaysPerWeek) prefs.push({ k: "maxDaysPerWeek", l: "Max " + p.prefs.maxDaysPerWeek + " days/wk", need: false });
if (p.prefs.maxConsecutiveWorkDays && p.prefs.maxConsecutiveWorkDays < 6) prefs.push({ k: "maxConsecutiveWorkDays", l: "Max " + p.prefs.maxConsecutiveWorkDays + " consecutive days", need: false });
if (p.prefs.consecutiveDaysOff > 1) prefs.push({ k: "consecutiveDaysOff", l: "Min " + p.prefs.consecutiveDaysOff + " consecutive days off", need: false });
if (p.prefs.maxOpeningPerWeek !== null && p.prefs.maxOpeningPerWeek !== undefined) prefs.push({ k: "maxOpeningPerWeek", l: "Max " + p.prefs.maxOpeningPerWeek + " opens/wk", need: false });
if (p.prefs.maxClosingPerWeek !== null && p.prefs.maxClosingPerWeek !== undefined) prefs.push({ k: "maxClosingPerWeek", l: "Max " + p.prefs.maxClosingPerWeek + " closes/wk", need: false });
if (p.minHours || p.maxHours) prefs.push({ k: "hourRange", l: (p.minHours ? p.minHours + "h min" : "") + (p.minHours && p.maxHours ? " / " : "") + (p.maxHours ? p.maxHours + "h max" : "") + " per week", need: false });
if (p.earliestStart) prefs.push({ k: "earliestStart", l: "Not before " + tL(p.earliestStart), need: true });
if (p.latestEnd) prefs.push({ k: "latestEnd", l: "Done by " + tL(p.latestEnd), need: true });
Object.keys(p.prefs.dayOverrides || {}).forEach(function (dd) { var ov = p.prefs.dayOverrides[dd]; if (ov && ov.latestEnd) prefs.push({ k: "dayOverride_" + dd, l: dd + " leave by " + tL(ov.latestEnd) + (ov.note ? " (" + ov.note + ")" : ""), need: true }); });
if (prefs.length === 0) prefs.push({ k: "_none", l: "Fully flexible", need: false });
// Map preferredWeekendDay tradeoff to weekendPref display line
var unmetKeys = {}; f.tradeoffs.forEach(function (t) { var mk = t.prefKey === "preferredWeekendDay" ? "weekendPref" : t.prefKey; unmetKeys[mk] = t; });
var metCount = prefs.filter(function (pr) { return pr.k !== "_none" && !unmetKeys[pr.k]; }).length;
var unmetCount = prefs.filter(function (pr) { return !!unmetKeys[pr.k]; }).length;
return <div key={f.pharmacistId} style={{ padding: "12px 16px", borderBottom: "1px solid " + Co.bdrL }}>
<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
<div style={{ width: 10, height: 10, borderRadius: 5, background: f.color, flexShrink: 0 }} />
<div style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>{f.name}</div>
<div style={{ display: "flex", gap: 4 }}>
{metCount > 0 ? <span style={{ fontSize: 10, fontWeight: 700, color: Co.gn, padding: "2px 6px", background: Co.gnS, borderRadius: 3 }}>{metCount} met</span> : null}
{unmetCount > 0 ? <span style={{ fontSize: 10, fontWeight: 700, color: Co.rd, padding: "2px 6px", background: Co.rdS, borderRadius: 3 }}>{unmetCount} unmet</span> : null}
</div>
</div>
<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingLeft: 18 }}>
<div style={{ fontSize: 11, color: Co.txMu }}>{p.role === "pm" ? "PM" : "Staff"} {"\u00B7"} {fmtH(f.avgHours)}h/wk of {p.targetHours}h target {"\u00B7"} {f.openCt}O {f.closeCt}C {"\u00B7"} {f.weekendDays} wknd</div>
</div>
{prefs.map(function (pr) {
var isMet = pr.alwaysMet || (!unmetKeys[pr.k] && pr.k !== "_none");
var isUnmet = !!unmetKeys[pr.k];
var tradeoff = unmetKeys[pr.k];
if (pr.k === "_none") return <div key={pr.k} style={{ fontSize: 11, color: Co.txMu, padding: "3px 0", paddingLeft: 18 }}>No constraints set</div>;
return <div key={pr.k} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 0", paddingLeft: 18 }}>
<div style={{ width: 14, height: 14, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1, background: isMet ? Co.gnS : Co.rdS, border: "1px solid " + (isMet ? Co.gn + "30" : Co.rd + "30") }}>
<span style={{ fontSize: 9, fontWeight: 700, color: isMet ? Co.gn : Co.rd }}>{isMet ? "\u2713" : "\u2717"}</span>
</div>
<div style={{ flex: 1, minWidth: 0 }}>
<div style={{ fontSize: 12, color: isUnmet ? Co.rd : Co.tx, fontWeight: isUnmet ? 600 : 400 }}>{pr.l}{pr.need && !pr.alwaysMet ? <span style={{ fontSize: 9, fontWeight: 700, color: Co.rd, marginLeft: 4, padding: "1px 4px", background: Co.rdS, borderRadius: 2 }}>NEED</span> : null}{pr.alwaysMet ? <span style={{ fontSize: 9, fontWeight: 600, color: Co.txD, marginLeft: 4 }}>locked</span> : null}</div>
{isUnmet && tradeoff ? <div style={{ fontSize: 11, color: Co.txMu, marginTop: 1, lineHeight: 1.4 }}>{tradeoff.msg}</div> : null}
</div>
</div>;
})}
</div>;
})}
</Card>;
})() : null}
{/* ROTATION AT A GLANCE PANEL */}
{resultPanel === "rotation" ? (function () {
// Build short codes: PM, SA, SB, etc. — disambiguated
var shortCodes = {};
var dayStaffRot = pharms.filter(function (px) { return px.role !== "ovnt"; });
dayStaffRot.forEach(function (px) {
if (px.role === "pm") { shortCodes[px.id] = "PM"; return; }
if (px.role === "dsp") { shortCodes[px.id] = "D"; return; }
var base = firstName(px).charAt(0).toUpperCase();
var existing = Object.values(shortCodes);
if (!existing.includes(base)) { shortCodes[px.id] = base; }
else {
// Try first two chars
var two = firstName(px).substring(0, 2).toUpperCase();
if (!existing.includes(two)) { shortCodes[px.id] = two; }
else {
// Fallback: letter + index
var idx = dayStaffRot.filter(function (q) { return q.role === px.role; }).indexOf(px);
shortCodes[px.id] = base + String.fromCharCode(65 + idx);
}
}
});
return <Card style={{ padding: 14, marginBottom: 8 }}>
<div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Full Rotation</div>
<div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
<table style={{ width: "100%", borderCollapse: "collapse", minWidth: R > 3 ? 420 : "auto" }}>
<thead><tr>
<td style={{ padding: "2px 4px", fontSize: 10, color: Co.txD, fontWeight: 600, width: 28 }}></td>
{DAYS.map(function (d) { return <td key={d} style={{ padding: "2px 1px", textAlign: "center", fontSize: 10, fontWeight: 700, color: ["Sat", "Sun"].includes(d) ? Co.pu : Co.txMu }}>{d.charAt(0)}</td>; })}
</tr></thead>
<tbody>
{(function () {
var trs = [];
for (var rwi = 0; rwi < R; rwi++) {
trs.push(<tr key={"wk" + rwi}>
<td style={{ padding: "1px 4px", fontSize: 10, fontWeight: 700, color: Co.txMu, verticalAlign: "middle", borderTop: rwi > 0 ? "1px solid " + Co.bdrL : "none" }}>W{rwi + 1}</td>
{DAYS.map(function (d) {
var assigns = (hero.schedule.weeks[rwi][d] || []).filter(function (a) { return a.segment !== "night"; });
var isWeekend = d === "Sat" || d === "Sun";
var cellBorder = rwi > 0 ? "1px solid " + Co.bdrL : "none";
if (assigns.length === 0) return <td key={d} style={{ padding: 1, borderTop: cellBorder }}><div style={{ height: 24, borderRadius: 3, background: isWeekend ? Co.bg : Co.bdrL + "60" }} /></td>;
if (assigns.length === 1) {
var px1 = pharms.find(function (x) { return x.id === assigns[0].pharmacistId; });
var c1 = px1 ? px1.color : Co.txD;
var sc1 = shortCodes[assigns[0].pharmacistId] || "?";
return <td key={d} style={{ padding: 1, borderTop: cellBorder }}><div style={{ height: 24, borderRadius: 3, background: c1 + "30", border: "1px solid " + c1 + "40", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: sc1.length > 1 ? 8 : 9, fontWeight: 700, color: c1, letterSpacing: -0.5 }}>{sc1}</span></div></td>;
}
return <td key={d} style={{ padding: 1, borderTop: cellBorder }}><div style={{ height: 24, borderRadius: 3, display: "flex", overflow: "hidden", border: "1px solid " + Co.bdr }}>{assigns.map(function (a, ci) { var pxN = pharms.find(function (x) { return x.id === a.pharmacistId; }); var cN = pxN ? pxN.color : Co.txD; var scN = shortCodes[a.pharmacistId] || "?"; return <div key={ci} style={{ flex: 1, background: cN + "30", borderRight: ci < assigns.length - 1 ? "1px solid " + Co.card : "none", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: scN.length > 1 ? 7 : 8, fontWeight: 700, color: cN, letterSpacing: -0.5 }}>{scN}</span></div>; })}</div></td>;
})}
</tr>);
}
return trs;
})()}
</tbody>
</table>
</div>
<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, paddingTop: 8, borderTop: "1px solid " + Co.bdrL }}>
{dayStaffRot.map(function (px) {
var sc2 = shortCodes[px.id] || "?";
var f2 = sc.perPerson.find(function (pp) { return pp.pharmacistId === px.id; });
return <div key={px.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
<div style={{ width: 16, height: 16, borderRadius: 3, background: (f2 ? f2.color : px.color) + "30", border: "1px solid " + (f2 ? f2.color : px.color) + "40", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: sc2.length > 1 ? 7 : 8, fontWeight: 700, color: f2 ? f2.color : px.color, letterSpacing: -0.5 }}>{sc2}</span></div>
<span style={{ fontSize: 11, color: Co.txMu }}>{firstName(px)}</span>
</div>;
})}
</div>
</Card>;
})() : null}
{resultPanel === "strengths" ? <Card style={{ padding: 14, marginBottom: 8 }}>{sc.strengths.length > 0 ? sc.strengths.map(function (s, si) { return <div key={si} style={{ fontSize: 12, color: Co.gn, fontWeight: 600, marginBottom: 3 }}>{"\u2713"} {s}</div>; }) : <div style={{ fontSize: 12, color: Co.txMu }}>No specific strengths.</div>}{sc.tags.length > 0 ? <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>{sc.tags.map(function (t, ti) { var tc = t.includes("fragile") ? Co.am : t.includes("drama") ? Co.gn : t.includes("costly") ? Co.rd : t.includes("clean") ? Co.gn : Co.txMu; return <span key={ti} style={{ fontSize: 11, fontWeight: 600, color: tc, padding: "2px 8px", background: tc + "0c", borderRadius: 4 }}>{t}</span>; })}</div> : null}</Card> : null}
{resultPanel === "scores" || resultPanel === "scoresCur" ? <Card style={{ padding: 14, marginBottom: 8 }}>
{curScore ? <div style={{ display: "flex", gap: 0, marginBottom: 12, background: Co.bg, borderRadius: 8, padding: 3 }}><div onClick={function () { setResultPanel("scores"); }} style={{ flex: 1, textAlign: "center", padding: "6px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", background: resultPanel === "scores" ? Co.card : "transparent", color: resultPanel === "scores" ? Co.ac : Co.txMu, boxShadow: resultPanel === "scores" ? shadow.sm : "none" }}>New ({sc.grade})</div><div onClick={function () { setResultPanel("scoresCur"); }} style={{ flex: 1, textAlign: "center", padding: "6px 0", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", background: resultPanel === "scoresCur" ? Co.card : "transparent", color: resultPanel === "scoresCur" ? gc(curScore.grade) : Co.txMu, boxShadow: resultPanel === "scoresCur" ? shadow.sm : "none" }}>Current ({curScore.grade})</div></div> : null}
{(function () { var isOld = resultPanel === "scoresCur" && curScore; var displayScore = isOld ? curScore : sc; var displayGrade = isOld ? curScore.grade : sc.grade; var displayTotal = isOld ? curScore.total : sc.total; var displayClr = gc(displayGrade); return <div>{[{ l: "Coverage", v: displayScore.components.coverage }, { l: "Demand", v: displayScore.components.budget }, { l: "Peak", v: displayScore.components.peak }, { l: "Fairness", v: displayScore.components.fairness }, { l: "Sustain", v: displayScore.components.sustainability }, { l: "Prefs", v: displayScore.components.preferences }].map(function (row) { var c = row.v >= 80 ? Co.gn : row.v >= 60 ? Co.am : Co.rd; return <div key={row.l} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}><span style={{ fontSize: 11, width: 60, color: Co.txMu }}>{row.l}</span><div style={{ flex: 1, height: 6, background: Co.bg, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: row.v + "%", background: c, borderRadius: 3 }} /></div><span style={{ ...mono, fontSize: 11, fontWeight: 600, color: c, width: 32, textAlign: "right" }}>{row.v}%</span></div>; })}<div style={{ ...mono, fontSize: 12, fontWeight: 700, color: displayClr, marginTop: 8 }}>Total: {displayTotal} {"\u2192"} {displayGrade}</div></div>; })()}
</Card> : null}
{resultPanel === "perPerson" ? <Card style={{ padding: 14, marginBottom: 8 }}>{sc.perPerson.map(function (f) { var p = pharms.find(function (x) { return x.id === f.pharmacistId; }); var role = p ? (p.role === "pm" ? "PM" : p.role === "dsp" ? "DSP" : p.role === "ovnt" ? "OVNT" : "Staff") : ""; return <div key={f.pharmacistId} style={{ padding: "8px 0", borderBottom: "1px solid " + Co.bdrL }}>
<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
<div style={{ width: 8, height: 8, borderRadius: 4, background: f.color, flexShrink: 0 }} />
<div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{f.name} <span style={{ fontSize: 11, fontWeight: 500, color: Co.txMu }}>{role}</span></div></div>
{f.tradeoffs.length > 0 ? <span style={{ fontSize: 10, fontWeight: 700, color: Co.am, padding: "2px 6px", background: Co.amS, borderRadius: 3 }}>{f.tradeoffs.length}</span> : <span style={{ fontSize: 10, fontWeight: 700, color: Co.gn }}>{"\u2713"}</span>}
</div>
<div style={{ fontSize: 11, color: Co.txMu, marginTop: 4, paddingLeft: 16 }}>{fmtH(f.avgHours)}h/wk {"\u00B7"} {f.openCt}O {"\u00B7"} {f.closeCt}C {"\u00B7"} {f.weekendDays} wknd {"\u00B7"} {f.totalShifts} shifts</div>
</div>; })}</Card> : null}
{resultPanel === "weekCompare" ? <Card style={{ padding: 14, marginBottom: 8 }}>{(function () { if (R < 2) return <div style={{ fontSize: 12, color: Co.txMu }}>Single-week rotation.</div>; return sc.perPerson.map(function (f) { var rows = []; for (var wi = 0; wi < R; wi++) { var wd = 0, wh = 0, wo = 0, wc = 0; var wk2 = hero.schedule.weeks[wi]; DAYS.forEach(function (d) { (wk2[d] || []).forEach(function (a) { if (a.pharmacistId === f.pharmacistId) { wd++; wh += (t2m(a.end) - t2m(a.start)) / 60; var dh = store.hours[d]; if (dh && t2m(a.start) <= t2m(dh.open) + 30) wo++; if (dh && t2m(a.end) >= t2m(dh.close) - 30) wc++; } }); }); rows.push({ week: wi + 1, days: wd, hrs: wh, opens: wo, closes: wc }); } return <div key={f.pharmacistId} style={{ marginBottom: 11, paddingBottom: 11, borderBottom: "1px solid " + Co.bdrL }}><div style={{ fontSize: 11, fontWeight: 700, color: f.color, padding: "2px 8px", background: f.color + "15", borderRadius: 4, display: "inline-block", marginBottom: 6 }}>{firstName(f)}</div><div style={{ display: "flex", gap: 4, overflowX: R > 4 ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>{rows.map(function (r) { return <div key={r.week} style={{ flex: R > 4 ? "0 0 auto" : 1, minWidth: R > 4 ? 72 : "auto", padding: "6px 8px", background: Co.bg, borderRadius: 6, fontSize: 11 }}><div style={{ fontWeight: 700, color: Co.txMu, marginBottom: 2 }}>Wk {r.week}</div><div style={{ color: Co.tx, fontWeight: 600 }}>{r.days}d {fmtH(r.hrs)}h</div><div style={{ color: Co.txMu }}>{r.opens}O/{r.closes}C</div></div>; })}</div></div>; }); })()}</Card> : null}
</div>;
})()}
{/* STEP 6: Full Report */}
{step === 6 && results && results.length > 0 && (function () {
var hero = results[0]; var sc = hero.score; var gClr = gc(sc.grade);
var reportText = genSummaryText(store, sc, pharms, hero, true);
return <div>
<div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}><div style={{ flex: 1 }} className="section-heading">Full Report</div><div style={{ padding: "6px 14px", borderRadius: 8, background: gClr, ...mono, fontSize: 18, fontWeight: 700, color: "#fff" }}>{sc.grade}</div></div>
<Card style={{ padding: 16 }}><pre style={{ ...mono, fontSize: 12, color: Co.tx, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{reportText}</pre></Card>
<div style={{ textAlign: "center", padding: "20px 0 8px" }}>
<div style={{ fontSize: 12, color: Co.txMu }}>Generated by <span style={{ fontWeight: 600 }}>RxRotation Lite</span></div>
<div style={{ height: 1, background: Co.bdrL, margin: "12px 60px" }} />
<div style={{ fontSize: 11, fontWeight: 700, color: Co.txMu, letterSpacing: 1.5, textTransform: "uppercase" }}>Madden Frameworks</div>
<div style={{ fontSize: 10, color: Co.txD, marginTop: 4, fontStyle: "italic" }}>Smart systems. Better judgment.</div>
</div>
<div style={{ fontSize: 11, color: Co.txD, textAlign: "center", padding: "8px 0 0" }}>This report exists only in this browser session.</div>
<div style={{ fontSize: 11, color: Co.txD, textAlign: "center", padding: "2px 0 40px" }}>Nothing is stored or transmitted.</div>
</div>;
})()}
</div>
{/* FOOTER NAV */}
{mode !== null && !editP && (
<div className="footer-nav">
<div className="footer-nav-inner">
{step < 5 ? <Btn onClick={prevStep} style={{ flex: 1 }}>{"\u2190"} Back</Btn> : null}
{step === 5 ? <Btn onClick={function () { setStep(4); setResults(null); setCurScore(null); setWhatIf(null); setShowWk(0); setResultPanel(null); }} style={{ flex: 1 }}>{"\u2190"} Back</Btn> : null}
{step === 5 ? <Btn onClick={doReset} style={{ flex: 1 }}>{"\u21A9"} Reset</Btn> : null}
{step === 6 ? <Btn variant="primary" onClick={function () { setStep(5); }} style={{ flex: 1 }}>{"\u2190"} Back to Results</Btn> : null}
{step === 0 ? <Btn variant="primary" onClick={function () { var missing = store.allocatedHoursPerWeek === ""; if (missing) { setShowMissing(true); return; } if (store._rotChanged) { flashFor("rot"); return; } if (store._24hrChanging) { flashFor("hr24"); return; } setShowMissing(false); nextStep(); }} style={{ flex: 1, opacity: store.allocatedHoursPerWeek === "" || store._rotChanged || store._24hrChanging ? 0.5 : 1 }}><span style={{opacity:0.7}}>Next:</span> Hours <span style={{opacity:0.7}}>{"\u2192"}</span></Btn> : null}
{step === 1 ? <Btn variant="primary" onClick={function () { if (hasShortage || hasNewShortage) { if (hasShortage) { flashFor("shortage"); } if (hasNewShortage) { flashFor("newShortage"); } return; } if (hasNoHoursChange) { flashSet("newShortage", 2); flashFor("newShortage", 300); return; } nextStep(); }} style={{ flex: 1, opacity: hasShortage || hasNewShortage || hasNoHoursChange ? 0.4 : 1 }}><span style={{opacity:0.7}}>Next:</span> Store Traffic <span style={{opacity:0.7}}>{"\u2192"}</span></Btn> : null}
{step === 2 ? <Btn variant="primary" onClick={function () { nextStep(); }} style={{ flex: 1 }}><span style={{opacity:0.7}}>Next:</span> Add Team <span style={{opacity:0.7}}>{"\u2192"}</span></Btn> : null}
{step === 3 && !editP ? (function () {
var pmCt = pharms.filter(function (p) { return p.role === "pm"; }).length;
var staffCt = pharms.filter(function (p) { return p.role === "staff"; }).length;
var ovntCt = pharms.filter(function (p) { return p.role === "ovnt"; }).length;
var canProgress = pmCt >= 1 && staffCt >= 1 && (!store.is24hr || ovntCt >= 2);
if (teamWarning && !teamWarning.includes("to continue")) return null;
return <Btn variant="primary" onClick={function () {
if (!canProgress) { var parts = []; if (pmCt < 1) parts.push("a PM"); if (staffCt < 1) parts.push("a Staff RPh"); if (store.is24hr && ovntCt < 2) parts.push("2 OVNT RPh"); setTeamWarning("Add " + parts.join(" and ") + " to continue."); flashFor("team", 400); return; }
var rot = store.rotationWeeks;
if (!teamWarning) { if (rot === 2 && staffCt > 1) { setTeamWarning("2-week rotations typically have 1 PM and 1 Staff RPh. You currently have " + staffCt + " Staff RPh. Continue anyway?"); return; } if (rot === 3 && staffCt !== 2) { setTeamWarning("3-week rotations typically have 1 PM and 2 Staff RPh. You currently have " + staffCt + " Staff RPh. Continue anyway?"); return; } if (rot === 4 && staffCt < 2) { setTeamWarning("4-week rotations typically have 1 PM and 2\u20133 Staff RPh. You currently have " + staffCt + " Staff RPh. Continue anyway?"); return; } if (rot === 5 && staffCt < 2) { setTeamWarning("5-week rotations typically have 1 PM and 2\u20134 Staff RPh. You currently have " + staffCt + " Staff RPh. Continue anyway?"); return; } }
setTeamWarning(null); pushHistory(); if (mode === "improve") { initCurSched(); } setStore(function (s) { return { ...s, _originalBudget: s.allocatedHoursPerWeek }; }); setStep(4);
}} style={{ flex: 1, opacity: canProgress ? 1 : 0.5 }}><span style={{opacity:0.7}}>Next:</span> {mode === "improve" ? "Enter Current" : "Review"} <span style={{opacity:0.7}}>{"\u2192"}</span></Btn>;
})() : null}
{step === 4 ? <Btn variant="generate" onClick={doGenerate} disabled={generating} style={{ flex: 1 }}>{generating ? "Generating\u2026" : "Generate"}</Btn> : null}
{step === 5 ? <Btn variant="primary" onClick={function () { setStep(6); }} style={{ flex: 2 }}>{"\uD83D\uDCCB"} Full Report</Btn> : null}
{step === 6 ? <Btn onClick={doReset} style={{ flex: 1 }}>{"\u21A9"} Start Over</Btn> : null}
</div>
</div>
)}
</div>
);
}
