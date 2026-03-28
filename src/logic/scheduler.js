import { DAYS } from "../theme.js";
import { t2m, m2t, snap30, hSpan, opHrs, firstName, scriptVolume, fmtH, tL } from "../utils.js";

export function defPrefs() {
return { fixedDaysOff: [], preferredDaysOff: [], consecutiveDaysOff: 1, weekendPref: "flexible", threeDayWeekend: false, threeDayMustIncludeFriday: false, preferredWeekendDay: null, preferEarly: false, preferLate: false, noClopening: false, noBackToBackLong: false, maxClosingPerWeek: null, maxOpeningPerWeek: null, maxDaysPerWeek: null, dayOverrides: {}, maxConsecutiveWorkDays: 6, needs: {} };
}
export function defHours() {
return { Mon: { isOpen: true, open: "08:00", close: "21:00" }, Tue: { isOpen: true, open: "08:00", close: "21:00" }, Wed: { isOpen: true, open: "08:00", close: "21:00" }, Thu: { isOpen: true, open: "08:00", close: "21:00" }, Fri: { isOpen: true, open: "08:00", close: "21:00" }, Sat: { isOpen: true, open: "09:00", close: "18:00" }, Sun: { isOpen: true, open: "10:00", close: "17:00" } };
}
export function generateSchedule(store, pharmacists, strategy, seed) {
var R = store.rotationWeeks || 2;
var dayStaff = pharmacists.filter(function (p) { return p.role !== "ovnt" && p.role !== "dsp"; });
if (dayStaff.length === 0) return { weeks: [] };
var N = dayStaff.length;
var rng = seed || 1;
function rand() { rng = (rng * 16807 + 0) % 2147483647; return (rng & 0x7fffffff) / 2147483647; }
var strat = strategy || "business";
var budgetPerWk = store.allocatedHoursPerWeek || 999;
var storeOpHrsWk = opHrs(store.hours);
var overlapBudget = Math.max(0, budgetPerWk - storeOpHrsWk);
var dayHrsMap = {};
DAYS.forEach(function (d) { var dh = store.hours[d]; dayHrsMap[d] = (dh && dh.isOpen) ? (t2m(dh.close) - t2m(dh.open)) / 60 : 0; });
var openDays = DAYS.filter(function (d) { return dayHrsMap[d] > 0; });
var ranking = store.dayRanking || openDays;
var pm = dayStaff.find(function (p) { return p.role === "pm"; });
var avgDayHrs = 0, openDayCount = 0;
openDays.forEach(function (d) { avgDayHrs += dayHrsMap[d]; openDayCount++; });
avgDayHrs = openDayCount > 0 ? avgDayHrs / openDayCount : 12;
var weeks = [];
for (var w = 0; w < R; w++) {
var wk = {};
var assignMap = {};
DAYS.forEach(function (d) { assignMap[d] = []; });
var weekTargets = {};
dayStaff.forEach(function (p) {
var pIdx = dayStaff.indexOf(p);
var isHeavyWeek = (N <= 1) || ((w + pIdx) % Math.max(N, 2) < Math.ceil(R / 2));
var wkTarget;
if (N === 1) { wkTarget = openDayCount; }
else {
var myShare = (p.targetHours || 40) / Math.max(1, dayStaff.reduce(function (a, q) { return a + (q.targetHours || 40); }, 0));
var baseDays = Math.round(myShare * openDayCount);
if (isHeavyWeek) wkTarget = Math.min(baseDays + 1, openDayCount - (N - 1));
else wkTarget = Math.max(baseDays - 1, 1);
}
weekTargets[p.id] = wkTarget;
});
if (overlapBudget <= 0) {
var totalTargetDays = 0;
dayStaff.forEach(function (p) { totalTargetDays += weekTargets[p.id]; });
while (totalTargetDays > openDayCount) { var maxP = dayStaff.reduce(function (a, b) { return weekTargets[a.id] >= weekTargets[b.id] ? a : b; }); weekTargets[maxP.id]--; totalTargetDays--; }
while (totalTargetDays < openDayCount) { var minP = dayStaff.reduce(function (a, b) { return weekTargets[a.id] <= weekTargets[b.id] ? a : b; }); weekTargets[minP.id]++; totalTargetDays++; }
}
var busiestWeekday = null;
if (store.pmAnchorBusiest && pm) {
for (var ri = 0; ri < ranking.length; ri++) {
if (!["Sat", "Sun"].includes(ranking[ri]) && dayHrsMap[ranking[ri]] > 0 && !pm.prefs.fixedDaysOff.includes(ranking[ri])) { busiestWeekday = ranking[ri]; break; }
}
if (busiestWeekday) { assignMap[busiestWeekday].push(pm.id); }
}
var unavailable = {};
dayStaff.forEach(function (p) { unavailable[p.id] = {}; p.prefs.fixedDaysOff.forEach(function (d) { unavailable[p.id][d] = true; }); });
var wkndDays = ["Sat", "Sun"].filter(function (d) { return dayHrsMap[d] > 0 && assignMap[d].length === 0; });
wkndDays.forEach(function (d) {
var candidates = dayStaff.filter(function (p) { return !unavailable[p.id][d]; });
if (candidates.length === 0) return;
var pick;
if (d === "Sat") pick = candidates[(w) % candidates.length];
else pick = candidates[(w + 1) % candidates.length];
if (strat === "favor_a" && candidates.length >= 2 && d === "Sat") pick = candidates[(w + 1) % candidates.length];
if (strat === "favor_b" && candidates.length >= 2 && d === "Sat") pick = candidates[(w) % candidates.length];
assignMap[d].push(pick.id);
});
var unassignedDays = openDays.filter(function (d) { return assignMap[d].length === 0; });
unassignedDays.sort(function (a, b) { return ranking.indexOf(a) - ranking.indexOf(b); });
var currentCount = {};
dayStaff.forEach(function (p) { currentCount[p.id] = 0; openDays.forEach(function (d) { if (assignMap[d].includes(p.id)) currentCount[p.id]++; }); });
var remaining = {};
dayStaff.forEach(function (p) { remaining[p.id] = Math.max(0, weekTargets[p.id] - currentCount[p.id]); });
unassignedDays.forEach(function (d) {
var di = DAYS.indexOf(d);
var bestPerson = null, bestScore = -9999;
dayStaff.forEach(function (p) {
if (unavailable[p.id][d]) return;
if (remaining[p.id] <= 0) return;
var score = 0;
score += remaining[p.id] * 10;
var consec = 0;
for (var ci = di - 1; ci >= 0; ci--) { if (assignMap[DAYS[ci]].includes(p.id)) consec++; else break; }
if (consec >= 2) score -= 50; else if (consec === 1) score -= 2;
if ((p.prefs.preferredDaysOff || []).includes(d)) score -= (strat === "min_conflict" ? 25 : 5);
if (strat === "min_conflict") {
if (p.prefs.noClopening && consec >= 1) score -= 15;
if (p.prefs.maxDaysPerWeek && currentCount[p.id] >= p.prefs.maxDaysPerWeek - 1) score -= 20;
}
if (strat === "favor_a" && p.id === dayStaff[0].id) score += 3;
if (strat === "favor_b" && N >= 2 && p.id === dayStaff[1].id) score += 3;
score += rand() * 0.5;
if (score > bestScore) { bestScore = score; bestPerson = p; }
});
if (bestPerson) { assignMap[d].push(bestPerson.id); currentCount[bestPerson.id]++; remaining[bestPerson.id]--; }
else {
var fallback = dayStaff.filter(function (p) { return !unavailable[p.id][d]; });
if (fallback.length > 0) { fallback.sort(function (a, b) { return currentCount[a.id] - currentCount[b.id]; }); assignMap[d].push(fallback[0].id); currentCount[fallback[0].id]++; }
else {
// Last resort: override fixedDaysOff to maintain coverage
var lastResort = dayStaff.slice().sort(function (a, b) { return currentCount[a.id] - currentCount[b.id]; });
if (lastResort.length > 0) { assignMap[d].push(lastResort[0].id); currentCount[lastResort[0].id]++; }
}
}
});
dayStaff.forEach(function (p) {
var con = 0;
for (var di2 = 0; di2 < DAYS.length; di2++) {
if (assignMap[DAYS[di2]].includes(p.id)) {
con++;
if (con > p.prefs.maxConsecutiveWorkDays) {
var dd = DAYS[di2];
assignMap[dd] = assignMap[dd].filter(function (id) { return id !== p.id; });
var alt = dayStaff.filter(function (q) { return q.id !== p.id && !unavailable[q.id][dd]; });
if (alt.length > 0) { alt.sort(function (a, b) { return currentCount[a.id] - currentCount[b.id]; }); assignMap[dd].push(alt[0].id); currentCount[alt[0].id]++; }
currentCount[p.id]--; con = 0;
}
} else { con = 0; }
}
});
dayStaff.forEach(function (p) {
if (!p.prefs.maxDaysPerWeek) return;
var myDays = openDays.filter(function (d) { return assignMap[d].includes(p.id); });
while (myDays.length > p.prefs.maxDaysPerWeek) {
var removable = myDays.filter(function (d) { return !["Sat", "Sun"].includes(d) || assignMap[d].length > 1; });
if (removable.length === 0) break;
removable.sort(function (a, b) { return ranking.indexOf(b) - ranking.indexOf(a); });
var removeDay = removable[0];
assignMap[removeDay] = assignMap[removeDay].filter(function (id) { return id !== p.id; });
var alt2 = dayStaff.filter(function (q) { return q.id !== p.id && !unavailable[q.id][removeDay]; });
if (alt2.length > 0) { alt2.sort(function (a, b) { return currentCount[a.id] - currentCount[b.id]; }); assignMap[removeDay].push(alt2[0].id); }
myDays = openDays.filter(function (d) { return assignMap[d].includes(p.id); });
}
});
dayStaff.forEach(function (p) {
if (!p.prefs.noClopening) return;
for (var di3 = 1; di3 < DAYS.length; di3++) {
var prevDay = DAYS[di3 - 1], thisDay = DAYS[di3];
if (!assignMap[prevDay].includes(p.id) || !assignMap[thisDay].includes(p.id)) continue;
var prevSolo = assignMap[prevDay].length === 1 && assignMap[prevDay][0] === p.id;
var thisSolo = assignMap[thisDay].length === 1 && assignMap[thisDay][0] === p.id;
var isClose = prevSolo || (assignMap[prevDay].length > 1 && assignMap[prevDay].indexOf(p.id) > 0);
var isOpen = thisSolo || (assignMap[thisDay].length > 1 && assignMap[thisDay].indexOf(p.id) === 0);
if (isClose && isOpen) {
var alt3 = dayStaff.filter(function (q) { return q.id !== p.id && !unavailable[q.id][thisDay]; });
if (alt3.length > 0) { alt3.sort(function (a, b) { return currentCount[a.id] - currentCount[b.id]; }); assignMap[thisDay] = assignMap[thisDay].filter(function (id) { return id !== p.id; }); assignMap[thisDay].push(alt3[0].id); }
}
}
});
dayStaff.forEach(function (p) {
for (var di4 = 2; di4 < DAYS.length; di4++) {
if (assignMap[DAYS[di4]].includes(p.id) && assignMap[DAYS[di4-1]].includes(p.id) && assignMap[DAYS[di4-2]].includes(p.id)) {
var allLong = [DAYS[di4], DAYS[di4-1], DAYS[di4-2]].every(function (dd) { return dayHrsMap[dd] >= 11; });
if (!allLong) continue;
var midDay = DAYS[di4-1];
var alt4 = dayStaff.filter(function (q) {
if (q.id === p.id) return false; if (unavailable[q.id][midDay]) return false;
var wouldCreate3 = false;
if (di4 >= 3 && assignMap[DAYS[di4-3]].includes(q.id) && assignMap[DAYS[di4-2]].includes(q.id)) wouldCreate3 = true;
return !wouldCreate3;
});
if (alt4.length > 0) { assignMap[midDay] = assignMap[midDay].filter(function (id) { return id !== p.id; }); assignMap[midDay].push(alt4[0].id); }
}
}
});
if (overlapBudget > 0 && N >= 2) {
var overlapLeft = overlapBudget;
var candidates2 = openDays.filter(function (d) { return assignMap[d].length === 1; });
// Rotate which days get priority for overlap based on week number
var overlapOffset = w % candidates2.length;
candidates2.sort(function (a, b) { return ranking.indexOf(a) - ranking.indexOf(b); });
if (overlapOffset > 0 && candidates2.length > 2) {
var rotated = candidates2.splice(0, Math.min(overlapOffset, Math.floor(candidates2.length / 2)));
candidates2 = candidates2.concat(rotated);
}
candidates2.forEach(function (d) {
if (overlapLeft < 4) return;
var primaryId = assignMap[d][0];
var others = dayStaff.filter(function (p) { return p.id !== primaryId && !unavailable[p.id][d]; });
others.sort(function (a, b) { var aHrs = 0, bHrs = 0; openDays.forEach(function (dd) { if (assignMap[dd].includes(a.id)) aHrs += dayHrsMap[dd]; if (assignMap[dd].includes(b.id)) bHrs += dayHrsMap[dd]; }); return aHrs - bHrs; });
if (others.length === 0) return;
var dh = store.hours[d];
var halfDay = Math.min((t2m(dh.close) - t2m(dh.open)) / 60 / 2, overlapLeft, others[0].maxShiftLength);
halfDay = Math.floor(halfDay * 2) / 2;
if (halfDay < others[0].minShiftLength) return;
assignMap[d].push(others[0].id); overlapLeft -= halfDay;
});
}
DAYS.forEach(function (day) {
var dh = store.hours[day];
if (!dh || !dh.isOpen) { wk[day] = []; return; }
var segS = t2m(dh.open), segE = t2m(dh.close);
var assigned = assignMap[day];
if (assigned.length === 0) { wk[day] = []; return; }
if (assigned.length === 1) {
var p = dayStaff.find(function (x) { return x.id === assigned[0]; });
if (!p) { wk[day] = []; return; }
var pStart = segS, pEnd = segE;
if (p.earliestStart) pStart = Math.max(pStart, t2m(p.earliestStart));
if (p.latestEnd) pEnd = Math.min(pEnd, t2m(p.latestEnd));
var ovr = p.prefs.dayOverrides[day];
if (ovr && ovr.latestEnd) pEnd = Math.min(pEnd, t2m(ovr.latestEnd));
pEnd = Math.min(pEnd, pStart + p.maxShiftLength * 60);
pStart = snap30(pStart); pEnd = snap30(pEnd);
if ((pEnd - pStart) / 60 < p.minShiftLength) { wk[day] = []; return; }
wk[day] = [{ pharmacistId: p.id, start: m2t(pStart), end: m2t(pEnd) }];
} else {
var isBusiestDay8 = ranking.indexOf(day) === 0;
var owC = snap30(segS + Math.round((segE - segS) * (store.pmAnchorBusiest && isBusiestDay8 ? 0.60 : 0.55)));
var p1 = dayStaff.find(function (x) { return x.id === assigned[0]; });
var p2 = dayStaff.find(function (x) { return x.id === assigned[1]; });
if (!p1 || !p2) { wk[day] = []; return; }
var opener = p1, closer = p2;
if (p2.prefs.preferEarly && !p1.prefs.preferEarly) { opener = p2; closer = p1; }
else if (p1.prefs.preferLate && !p2.prefs.preferLate) { opener = p2; closer = p1; }
else {
var isBusyDay = ranking.indexOf(day) < Math.ceil(ranking.length / 2);
if (store.pmAnchorBusiest && isBusiestDay8) { if (p1.role === "pm") { opener = p1; closer = p2; } else if (p2.role === "pm") { opener = p2; closer = p1; } }
else if (isBusyDay && p1.role === "pm") { opener = p1; closer = p2; }
else if (isBusyDay && p2.role === "pm") { opener = p2; closer = p1; }
}
var oStart = segS;
if (opener.earliestStart) oStart = Math.max(oStart, t2m(opener.earliestStart));
oStart = snap30(oStart);
var ovrO = opener.prefs.dayOverrides[day];
var oMaxEnd = ovrO && ovrO.latestEnd ? Math.min(t2m(ovrO.latestEnd), segE) : (opener.latestEnd ? Math.min(t2m(opener.latestEnd), segE) : segE);
var oEnd = snap30(Math.min(owC + 60, oStart + opener.maxShiftLength * 60, oMaxEnd));
if (oEnd > snap30(oMaxEnd)) oEnd = snap30(oMaxEnd);
var cEnd = segE;
if (closer.latestEnd) cEnd = Math.min(cEnd, t2m(closer.latestEnd));
var ovrC = closer.prefs.dayOverrides[day];
if (ovrC && ovrC.latestEnd) cEnd = Math.min(cEnd, t2m(ovrC.latestEnd));
cEnd = snap30(cEnd);
var cStart = Math.max(owC - 60, cEnd - closer.maxShiftLength * 60);
if (closer.earliestStart) cStart = Math.max(cStart, t2m(closer.earliestStart));
cStart = snap30(cStart);
var shifts = [];
if ((oEnd - oStart) / 60 >= opener.minShiftLength) shifts.push({ pharmacistId: opener.id, start: m2t(oStart), end: m2t(oEnd) });
if ((cEnd - cStart) / 60 >= closer.minShiftLength) shifts.push({ pharmacistId: closer.id, start: m2t(cStart), end: m2t(cEnd) });
// Handle 3rd+ pharmacists as mid-day overlap shifts
for (var ai = 2; ai < assigned.length; ai++) {
var pExtra = dayStaff.find(function (x) { return x.id === assigned[ai]; });
if (!pExtra) continue;
var exStart = snap30(Math.max(segS, owC - 120));
if (pExtra.earliestStart) exStart = Math.max(exStart, t2m(pExtra.earliestStart));
exStart = snap30(exStart);
var exEnd = snap30(Math.min(segE, exStart + pExtra.maxShiftLength * 60));
if (pExtra.latestEnd) exEnd = Math.min(exEnd, t2m(pExtra.latestEnd));
var exOvr = pExtra.prefs.dayOverrides[day];
if (exOvr && exOvr.latestEnd) exEnd = Math.min(exEnd, t2m(exOvr.latestEnd));
exEnd = snap30(exEnd);
if ((exEnd - exStart) / 60 >= pExtra.minShiftLength) shifts.push({ pharmacistId: pExtra.id, start: m2t(exStart), end: m2t(exEnd) });
}
wk[day] = shifts;
}
});
weeks.push(wk);
}
// Cross-week clopening fix: check Sat close in week W -> Sun open in week W+1
if (R >= 2) {
dayStaff.forEach(function (p) {
if (!p.prefs.noClopening) return;
for (var cw = 0; cw < R - 1; cw++) {
var satShifts = (weeks[cw]["Sat"] || []).filter(function (a) { return a.pharmacistId === p.id; });
var sunShifts = (weeks[cw + 1]["Sun"] || []).filter(function (a) { return a.pharmacistId === p.id; });
if (satShifts.length === 0 || sunShifts.length === 0) continue;
var satEnd = Math.max.apply(null, satShifts.map(function (a) { return t2m(a.end); }));
var sunStart = Math.min.apply(null, sunShifts.map(function (a) { return t2m(a.start); }));
var satDh = store.hours["Sat"], sunDh = store.hours["Sun"];
if (satDh && sunDh && satEnd >= t2m(satDh.close) - 60 && sunStart <= t2m(sunDh.open) + 60) {
// Try to swap Sunday assignment with someone else
var sunAssigns = weeks[cw + 1]["Sun"];
var alt5 = dayStaff.filter(function (q) { return q.id !== p.id && !unavailable[q.id]["Sun"]; });
if (alt5.length > 0) {
var pShift = sunAssigns.find(function (a) { return a.pharmacistId === p.id; });
if (pShift && sunAssigns.length === 1) {
// Swap: find someone not already working Sun in that week
var swapTo = alt5.find(function (q) { return !sunAssigns.some(function (a) { return a.pharmacistId === q.id; }); });
if (swapTo) { pShift.pharmacistId = swapTo.id; }
}
}
}
}
});
}
// Cross-week consecutive work days enforcement
if (R >= 2) {
dayStaff.forEach(function (p) {
var maxCon = p.prefs.maxConsecutiveWorkDays || 6;
for (var cw2 = 0; cw2 < R - 1; cw2++) {
// Count trailing work days at end of week cw2
var trailCt = 0;
for (var td = DAYS.length - 1; td >= 0; td--) {
if ((weeks[cw2][DAYS[td]] || []).some(function (a) { return a.pharmacistId === p.id; })) trailCt++;
else break;
}
if (trailCt === 0) continue;
// Count leading work days at start of week cw2+1
var leadCt = 0;
for (var ld = 0; ld < DAYS.length; ld++) {
if ((weeks[cw2 + 1][DAYS[ld]] || []).some(function (a) { return a.pharmacistId === p.id; })) leadCt++;
else break;
}
if (trailCt + leadCt > maxCon) {
// Remove person from the first leading day of the next week
var fixDay = DAYS[0]; // Sunday
var fixShifts = weeks[cw2 + 1][fixDay] || [];
var pIdx2 = fixShifts.findIndex(function (a) { return a.pharmacistId === p.id; });
if (pIdx2 >= 0) {
var altFix = dayStaff.filter(function (q) { return q.id !== p.id && !(unavailable[q.id] || {})[fixDay]; });
if (altFix.length > 0) {
fixShifts[pIdx2].pharmacistId = altFix[0].id;
}
}
}
}
});
}
var dspList = pharmacists.filter(function (p) { return p.role === "dsp"; });
if (dspList.length > 0) {
dspList.forEach(function (dsp) {
var dspHrsPerWk = dsp.targetHours || 15;
for (var w2 = 0; w2 < R; w2++) {
var dspLeft = dspHrsPerWk;
var dspCandidates = openDays.filter(function (d) { return !dsp.prefs.fixedDaysOff.includes(d); });
dspCandidates.sort(function (a, b) { return ranking.indexOf(a) - ranking.indexOf(b); });
dspCandidates.forEach(function (d) {
if (dspLeft < dsp.minShiftLength) return;
var dh = store.hours[d]; var segS = t2m(dh.open), segE = t2m(dh.close);
var shiftLen = Math.min(dspLeft, dsp.maxShiftLength, (segE - segS) / 60);
if (shiftLen < dsp.minShiftLength) return;
// Position DSP during peak hours when available
var peakKey = d === "Sat" ? "saturday" : d === "Sun" ? "sunday" : "weekday";
var peaks = store.peak && store.peak[peakKey]; if (peaks && !Array.isArray(peaks)) peaks = [peaks];
var anchorMid = snap30(segS + (segE - segS) / 2);
if (peaks && peaks.length > 0 && peaks[0].start) { anchorMid = snap30(t2m(peaks[0].start) + (t2m(peaks[0].end) - t2m(peaks[0].start)) / 2); }
var halfShift = Math.round(shiftLen * 60 / 2);
var dStart = snap30(Math.max(segS, anchorMid - halfShift));
if (dsp.earliestStart) dStart = Math.max(dStart, t2m(dsp.earliestStart));
dStart = snap30(dStart);
var dEnd = snap30(Math.min(segE, dStart + shiftLen * 60));
if (dsp.latestEnd) dEnd = Math.min(dEnd, t2m(dsp.latestEnd));
var dspOvr = dsp.prefs.dayOverrides[d];
if (dspOvr && dspOvr.latestEnd) dEnd = Math.min(dEnd, t2m(dspOvr.latestEnd));
dEnd = snap30(dEnd);
if ((dEnd - dStart) / 60 < dsp.minShiftLength) return;
weeks[w2][d] = (weeks[w2][d] || []).concat([{ pharmacistId: dsp.id, start: m2t(dStart), end: m2t(dEnd), segment: "dsp" }]);
dspLeft -= (dEnd - dStart) / 60;
});
}
});
}
// PROACTIVE GAP-FILLING: extend shifts to hit 100% demand hours
var demandPerWk = +store.allocatedHoursPerWeek || 0;
if (demandPerWk > 0) {
for (var gw = 0; gw < R; gw++) {
var wkActual = 0;
DAYS.forEach(function (d) { (weeks[gw][d] || []).forEach(function (a) { if (a.segment !== "ovnt") wkActual += (t2m(a.end) - t2m(a.start)) / 60; }); });
var wkGap = demandPerWk - wkActual;
if (wkGap < 0.5) continue;
// Sort days by traffic ranking (busiest first) for extension priority
var extDays = openDays.slice().sort(function (a, b) { return ranking.indexOf(a) - ranking.indexOf(b); });
var gapLeft = wkGap;
// Pass 1: Extend existing day-staff shifts by up to 30min each, busiest days first
for (var extPass = 0; extPass < 8 && gapLeft >= 0.5; extPass++) {
extDays.forEach(function (d) {
if (gapLeft < 0.5) return;
var dh = store.hours[d]; if (!dh || !dh.isOpen) return;
var segS2 = t2m(dh.open), segE2 = t2m(dh.close);
var dIdx = DAYS.indexOf(d);
var dayShifts = (weeks[gw][d] || []).filter(function (a) { return a.segment !== "ovnt" && a.segment !== "dsp"; });
dayShifts.forEach(function (a) {
if (gapLeft < 0.5) return;
var px = dayStaff.find(function (q) { return q.id === a.pharmacistId; });
if (!px) return;
var curLen = (t2m(a.end) - t2m(a.start)) / 60;
var maxLen = px.maxShiftLength || 13;
if (curLen >= maxLen) return;
// Check constraints for extending end
var canExtendEnd = t2m(a.end) + 30 <= segE2;
if (px.latestEnd && t2m(a.end) + 30 > t2m(px.latestEnd)) canExtendEnd = false;
var dayOvr = px.prefs.dayOverrides[d];
if (dayOvr && dayOvr.latestEnd && t2m(a.end) + 30 > t2m(dayOvr.latestEnd)) canExtendEnd = false;
if (curLen + 0.5 > maxLen) canExtendEnd = false;
// Clopening guard: if extending end on this day, check if person opens tomorrow
if (canExtendEnd && px.prefs.noClopening) {
var nextDayIdx = dIdx + 1; var nextWk = gw;
if (nextDayIdx >= 7) { nextDayIdx = 0; nextWk = (gw + 1) % R; }
var nextDay = DAYS[nextDayIdx]; var nextDh = store.hours[nextDay];
if (nextDh && nextDh.isOpen) {
var nextShifts = (weeks[nextWk][nextDay] || []).filter(function (na) { return na.pharmacistId === px.id; });
if (nextShifts.length > 0) {
var nextStart = Math.min.apply(null, nextShifts.map(function (na) { return t2m(na.start); }));
var newEnd = t2m(a.end) + 30;
if (newEnd >= segE2 - 60 && nextStart <= t2m(nextDh.open) + 60) canExtendEnd = false;
}}
}
// Check constraints for extending start
var canExtendStart = t2m(a.start) - 30 >= segS2;
if (px.earliestStart && t2m(a.start) - 30 < t2m(px.earliestStart)) canExtendStart = false;
if (curLen + 0.5 > maxLen) canExtendStart = false;
// Clopening guard: if extending start earlier, check if person closed yesterday
if (canExtendStart && px.prefs.noClopening) {
var prevDayIdx = dIdx - 1; var prevWk = gw;
if (prevDayIdx < 0) { prevDayIdx = 6; prevWk = (gw - 1 + R) % R; }
var prevDay = DAYS[prevDayIdx]; var prevDh = store.hours[prevDay];
if (prevDh && prevDh.isOpen) {
var prevShifts = (weeks[prevWk][prevDay] || []).filter(function (pa) { return pa.pharmacistId === px.id; });
if (prevShifts.length > 0) {
var prevEnd = Math.max.apply(null, prevShifts.map(function (pa) { return t2m(pa.end); }));
var newStart = t2m(a.start) - 30;
if (prevEnd >= t2m(prevDh.close) - 60 && newStart <= segS2 + 60) canExtendStart = false;
}}
}
if (canExtendEnd) { a.end = m2t(t2m(a.end) + 30); gapLeft -= 0.5; }
else if (canExtendStart) { a.start = m2t(t2m(a.start) - 30); gapLeft -= 0.5; }
});
});
}
}
}
if (store.is24hr && store.ovnt) {
var ov = store.ovnt;
weeks.forEach(function (wk2, wi2) { if (wi2 % 2 !== 0) return; DAYS.forEach(function (d) { var isW = d === "Sat" || d === "Sun"; if (!wk2[d]) wk2[d] = []; wk2[d].push({ pharmacistId: "ovnt-auto", start: isW ? (ov.wkndIn || "21:00") : (ov.wkdayIn || "21:00"), end: isW ? (ov.wkndOut || "09:00") : (ov.wkdayOut || "08:00"), segment: "night" }); }); });
}
return { weeks: weeks };
}
export function validateCandidate(sched, pharms, store) {
if (!sched || !sched.weeks) return { valid: false, reason: "No schedule data" };
var dayStaff = pharms.filter(function (p) { return p.role !== "ovnt" && p.role !== "dsp"; });
var R = sched.weeks.length;
for (var di = 0; di < DAYS.length; di++) {
var d = DAYS[di]; var dh = store.hours[d]; if (!dh || !dh.isOpen) continue;
for (var w = 0; w < R; w++) { var assigns = (sched.weeks[w][d] || []).filter(function (a) { return a.segment !== "ovnt" && a.segment !== "dsp"; }); if (assigns.length === 0) return { valid: false, reason: "Coverage gap: " + d + " week " + (w + 1) }; }
}
var totalHrs = 0; var totalHrsAll = 0;
sched.weeks.forEach(function (wk) { DAYS.forEach(function (d2) { (wk[d2] || []).forEach(function (a) { if (a.segment !== "ovnt" && a.segment !== "dsp") totalHrs += (t2m(a.end) - t2m(a.start)) / 60; if (a.segment !== "ovnt") totalHrsAll += (t2m(a.end) - t2m(a.start)) / 60; }); }); });
var avgPerWk = R > 0 ? totalHrs / R : 0; var avgPerWkAll = R > 0 ? totalHrsAll / R : 0; var budget = +store.allocatedHoursPerWeek || 999;
if (avgPerWkAll > budget * 1.02) return { valid: false, reason: "Total scheduled hours (" + fmtH(avgPerWkAll) + "h) exceed demand hours (" + fmtH(budget) + "h)" };
return { valid: true };
}
export function scoreTemplate(sched, pharms, store) {
if (!sched || !sched.weeks) return { grade: "?", total: 0, components: {}, perPerson: [], strengths: [], tags: [] };
var dayStaff = pharms.filter(function (p) { return p.role !== "ovnt" && p.role !== "dsp"; });
var R = sched.weeks.length; var totalSlots = 0, coveredSlots = 0;
DAYS.forEach(function (d) { var dh = store.hours[d]; if (dh && dh.isOpen) { for (var w = 0; w < R; w++) { totalSlots++; var rphAssigns = (sched.weeks[w][d] || []).filter(function (a) { return a.segment !== "ovnt" && a.segment !== "dsp"; }); if (rphAssigns.length > 0) coveredSlots++; } } });
var coveragePct = totalSlots > 0 ? Math.round(coveredSlots / totalSlots * 100) : 100;
var totalTarget = dayStaff.reduce(function (a, p) { return a + p.targetHours; }, 0);
var actualHrs = 0;
sched.weeks.forEach(function (wk) { DAYS.forEach(function (d2) { (wk[d2] || []).forEach(function (a) { if (a.segment !== "ovnt") actualHrs += (t2m(a.end) - t2m(a.start)) / 60; }); }); });
var actualPerWk = R > 0 ? actualHrs / R : 0;
var demandHrs = +store.allocatedHoursPerWeek || 0;
var budgetPct = demandHrs > 0 ? Math.round(actualPerWk / demandHrs * 100) : 100;
var weeklyGap = Math.max(0, demandHrs - actualPerWk);
var gapAction = weeklyGap < 0.5 ? "none" : weeklyGap < 4 ? "extend" : "dsp";
var budgetScore = budgetPct >= 100 ? 100 : budgetPct >= 99 ? 97 : budgetPct >= 97 ? 92 : budgetPct >= 95 ? 85 : Math.max(50, 100 - (100 - budgetPct) * 3);
var peakHits = 0, peakTotal = 0;
var hasOverlapBudget = (+store.allocatedHoursPerWeek || 0) > opHrs(store.hours);
var dayRankingForPeak = store.dayRanking || DAYS.filter(function (d) { var dh = store.hours[d]; return dh && dh.isOpen; });
DAYS.forEach(function (d) { var dh = store.hours[d]; if (!dh || !dh.isOpen) return; var dv = scriptVolume(store, d); var wt = dv / 5; var pks = store.peak && store.peak[d === "Sat" ? "saturday" : d === "Sun" ? "sunday" : "weekday"]; if (!pks) return; if (!Array.isArray(pks)) pks = [pks]; for (var w = 0; w < R; w++) { pks.forEach(function (pk) { peakTotal += wt; var da = (sched.weeks[w][d] || []).filter(function (a) { return a.segment !== "dsp" && a.segment !== "ovnt"; }); var pS = t2m(pk.start), pE = t2m(pk.end); var inPk = da.filter(function (a) { return t2m(a.start) < pE && t2m(a.end) > pS; });
if (inPk.length >= 2) { peakHits += wt; }
else if (dayStaff.length < 2 && inPk.length >= 1) { peakHits += wt; }
else if (!hasOverlapBudget && inPk.length === 1) {
var isBusiestDay = dayRankingForPeak.indexOf(d) === 0;
var assignedP = dayStaff.find(function (p) { return p.id === inPk[0].pharmacistId; });
var coversFullPeak = t2m(inPk[0].start) <= pS + 30 && t2m(inPk[0].end) >= pE - 30;
var baseCredit = isBusiestDay ? (coversFullPeak ? 0.85 : 0.65) : (coversFullPeak ? 0.75 : 0.55);
var pmBonus = (assignedP && assignedP.role === "pm" && isBusiestDay) ? 0.10 : 0;
peakHits += wt * Math.min(baseCredit + pmBonus, 0.95);
}
}); } });
var peakPct = peakTotal > 0 ? Math.round(peakHits / peakTotal * 100) : 100;
var burdenScores = []; dayStaff.forEach(function (p) { var h = 0; for (var w = 0; w < R; w++) { DAYS.forEach(function (d) { (sched.weeks[w][d] || []).forEach(function (a) { if (a.pharmacistId === p.id) h += (t2m(a.end) - t2m(a.start)) / 60; }); }); } burdenScores.push(h); });
var sustainScore = 100; if (burdenScores.length >= 2) { var mx = Math.max.apply(null, burdenScores), mn = Math.min.apply(null, burdenScores); if (mx > 0) sustainScore = Math.max(0, Math.round(100 - (mx - mn) / mx * 100)); }
var fairnessScore = 100;
if (dayStaff.length >= 2) {
var fairPenalty = 0;
var staffOnly = dayStaff.filter(function (p) { return p.role !== "pm"; });
if (staffOnly.length >= 2) {
// Weekend fairness: only compare staff without weekend day preferences
var wkndNeutral = staffOnly.filter(function (p) { return !p.prefs.preferredWeekendDay; });
if (wkndNeutral.length >= 2) {
var staffWknd = wkndNeutral.map(function (p) { var wd = 0; sched.weeks.forEach(function (wk) { ["Sat", "Sun"].forEach(function (d) { if ((wk[d] || []).some(function (a) { return a.pharmacistId === p.id; })) wd++; }); }); return wd; });
var wkndMax = Math.max.apply(null, staffWknd), wkndMin = Math.min.apply(null, staffWknd);
if (wkndMax - wkndMin > R) fairPenalty += 15; else if (wkndMax - wkndMin > 1) fairPenalty += 5;
}
// Opens fairness: only compare staff without early preference
var openNeutral = staffOnly.filter(function (p) { return !p.prefs.preferEarly; });
if (openNeutral.length >= 2) {
var staffOpens = openNeutral.map(function (p) { var ct = 0; sched.weeks.forEach(function (wk) { DAYS.forEach(function (d) { (wk[d] || []).forEach(function (a) { if (a.pharmacistId === p.id) { var dh = store.hours[d]; if (dh && t2m(a.start) <= t2m(dh.open) + 30) ct++; } }); }); }); return ct; });
var openMax = Math.max.apply(null, staffOpens), openMin = Math.min.apply(null, staffOpens);
if (openMax - openMin > R * 2) fairPenalty += 10;
}
// Closes fairness: only compare staff without late preference
var closeNeutral = staffOnly.filter(function (p) { return !p.prefs.preferLate; });
if (closeNeutral.length >= 2) {
var staffCloses = closeNeutral.map(function (p) { var ct = 0; sched.weeks.forEach(function (wk) { DAYS.forEach(function (d) { (wk[d] || []).forEach(function (a) { if (a.pharmacistId === p.id) { var dh = store.hours[d]; if (dh && t2m(a.end) >= t2m(dh.close) - 30) ct++; } }); }); }); return ct; });
var closeMax = Math.max.apply(null, staffCloses), closeMin = Math.min.apply(null, staffCloses);
if (closeMax - closeMin > R * 2) fairPenalty += 10;
}
}
var pmF = dayStaff.find(function (p) { return p.role === "pm"; });
if (pmF && staffOnly.length >= 1) {
var pmWknd = 0, pmCloses = 0, staffAvgWknd = 0, staffAvgCloses = 0;
sched.weeks.forEach(function (wk) {
["Sat", "Sun"].forEach(function (d) { if ((wk[d] || []).some(function (a) { return a.pharmacistId === pmF.id; })) pmWknd++; });
DAYS.forEach(function (d) { (wk[d] || []).forEach(function (a) { if (a.pharmacistId === pmF.id) { var dh = store.hours[d]; if (dh && t2m(a.end) >= t2m(dh.close) - 30) pmCloses++; } }); });
});
staffOnly.forEach(function (p) { var sw = 0, sc2 = 0; sched.weeks.forEach(function (wk) { ["Sat", "Sun"].forEach(function (d) { if ((wk[d] || []).some(function (a) { return a.pharmacistId === p.id; })) sw++; }); DAYS.forEach(function (d) { (wk[d] || []).forEach(function (a) { if (a.pharmacistId === p.id) { var dh = store.hours[d]; if (dh && t2m(a.end) >= t2m(dh.close) - 30) sc2++; } }); }); }); staffAvgWknd += sw; staffAvgCloses += sc2; });
staffAvgWknd = staffAvgWknd / Math.max(staffOnly.length, 1);
staffAvgCloses = staffAvgCloses / Math.max(staffOnly.length, 1);
if (pmWknd === 0 && staffAvgWknd >= R * 1.5) fairPenalty += 12;
if (pmCloses === 0 && staffAvgCloses >= R * 2) fairPenalty += 8;
}
fairnessScore = Math.max(0, 100 - fairPenalty);
}
var perPerson = dayStaff.map(function (p) {
var tradeoffs = [], openCt = 0, closeCt = 0, totalShifts = 0, totalH = 0, weekendDays = 0;
var prefDayViolations = [], clopen = 0, wkndDayViolations = [];
sched.weeks.forEach(function (wk, wi) { DAYS.forEach(function (d, di) {
var mine = (wk[d] || []).filter(function (a) { return a.pharmacistId === p.id; });
mine.forEach(function (a) {
totalShifts++; totalH += (t2m(a.end) - t2m(a.start)) / 60;
var dh = store.hours[d];
if (dh && t2m(a.start) <= t2m(dh.open) + 30) openCt++;
if (dh && t2m(a.end) >= t2m(dh.close) - 30) closeCt++;
var ovr = p.prefs.dayOverrides[d];
if (ovr && ovr.latestEnd && t2m(a.end) > t2m(ovr.latestEnd) + 30) { tradeoffs.push({ msg: firstName(p) + " scheduled past leave-by time on " + d + " (week " + (wi + 1) + ")", level: "need", prefKey: "dayOverride_" + d }); }
});
if (["Sat", "Sun"].includes(d) && mine.length > 0) { weekendDays++; if (p.prefs.preferredWeekendDay === d.substring(0, 3)) wkndDayViolations.push(d); }
if ((p.prefs.preferredDaysOff || []).includes(d) && mine.length > 0) prefDayViolations.push(d);
if (p.prefs.noClopening && di > 0 && mine.length > 0) {
var prevMine = (wk[DAYS[di - 1]] || []).filter(function (a) { return a.pharmacistId === p.id; });
if (prevMine.length > 0) { var prevEnd = Math.max.apply(null, prevMine.map(function (a) { return t2m(a.end); })); var thisStart = Math.min.apply(null, mine.map(function (a) { return t2m(a.start); })); var dh2 = store.hours[DAYS[di - 1]]; if (dh2 && prevEnd >= t2m(dh2.close) - 60 && thisStart <= t2m(store.hours[d].open) + 60) clopen++; }
}
}); });
// Cross-week clopening: Sat close in week W -> Sun open in week W+1
if (p.prefs.noClopening && R >= 2) {
for (var cwi = 0; cwi < R - 1; cwi++) {
var satMine = (sched.weeks[cwi]["Sat"] || []).filter(function (a) { return a.pharmacistId === p.id; });
var sunMine = (sched.weeks[cwi + 1]["Sun"] || []).filter(function (a) { return a.pharmacistId === p.id; });
if (satMine.length > 0 && sunMine.length > 0) {
var satEnd2 = Math.max.apply(null, satMine.map(function (a) { return t2m(a.end); }));
var sunStart2 = Math.min.apply(null, sunMine.map(function (a) { return t2m(a.start); }));
var satDh2 = store.hours["Sat"], sunDh2 = store.hours["Sun"];
if (satDh2 && sunDh2 && satEnd2 >= t2m(satDh2.close) - 60 && sunStart2 <= t2m(sunDh2.open) + 60) clopen++;
}
}
}
var avgH = R > 0 ? totalH / R : 0;
if (p.minHours || p.maxHours) { sched.weeks.forEach(function (wk2, wi2) { var weekH = 0; DAYS.forEach(function (d2) { (wk2[d2] || []).forEach(function (a2) { if (a2.pharmacistId === p.id) weekH += (t2m(a2.end) - t2m(a2.start)) / 60; }); }); if (p.minHours && weekH < p.minHours && weekH > 0) tradeoffs.push({ msg: firstName(p) + " scheduled " + fmtH(weekH) + "h in week " + (wi2 + 1) + ", below " + p.minHours + "h minimum", level: "want", prefKey: "hourRange" }); if (p.maxHours && weekH > p.maxHours) tradeoffs.push({ msg: firstName(p) + " scheduled " + fmtH(weekH) + "h in week " + (wi2 + 1) + ", above " + p.maxHours + "h maximum", level: "want", prefKey: "hourRange" }); }); }
if (R >= 2) { var wkHrs = []; sched.weeks.forEach(function (wk2) { var wh = 0; DAYS.forEach(function (d2) { (wk2[d2] || []).forEach(function (a2) { if (a2.pharmacistId === p.id) wh += (t2m(a2.end) - t2m(a2.start)) / 60; }); }); wkHrs.push(wh); }); var heaviest = Math.max.apply(null, wkHrs); var lightest = Math.min.apply(null, wkHrs.filter(function (h) { return h > 0; }).concat([heaviest])); var spread = heaviest - lightest; if (spread > 16) tradeoffs.push({ msg: firstName(p) + " has " + fmtH(spread) + "h spread (" + fmtH(lightest) + "h \u2013 " + fmtH(heaviest) + "h)", level: "want", prefKey: "weeklySpread" }); }
if (p.prefs.preferEarly && closeCt > openCt) tradeoffs.push({ msg: firstName(p) + " prefers opening but closes " + closeCt + "x this rotation", level: (p.prefs.needs || {}).preferEarly ? "need" : "want", prefKey: "preferEarly" });
if (p.prefs.preferLate && openCt > closeCt) tradeoffs.push({ msg: firstName(p) + " prefers closing but opens " + openCt + "x this rotation", level: (p.prefs.needs || {}).preferLate ? "need" : "want", prefKey: "preferLate" });
if (p.prefs.weekendPref === "every_other_off" && !p.prefs.preferredWeekendDay && weekendDays > R) tradeoffs.push({ msg: firstName(p) + " requested every other weekend off but works " + weekendDays + " weekend days across " + R + " weeks", level: (p.prefs.needs || {}).weekendPref ? "need" : "want", prefKey: "weekendPref" });
if (prefDayViolations.length > 0) tradeoffs.push({ msg: firstName(p) + " prefers " + prefDayViolations.join(", ") + " off but is scheduled to work", level: "want", prefKey: "preferredDaysOff" });
if (clopen > 0) tradeoffs.push({ msg: firstName(p) + " has " + clopen + " close-to-open" + (clopen > 1 ? "s" : ""), level: (p.prefs.needs || {}).noClopening ? "need" : "want", prefKey: "noClopening" });
if (p.prefs.preferredWeekendDay && wkndDayViolations.length > 0) tradeoffs.push({ msg: firstName(p) + " prefers " + p.prefs.preferredWeekendDay + " off but works it", level: (p.prefs.needs || {}).weekendPref ? "need" : "want", prefKey: "preferredWeekendDay" });
if (p.prefs.maxOpeningPerWeek !== null && p.prefs.maxOpeningPerWeek !== undefined && openCt > p.prefs.maxOpeningPerWeek * R) tradeoffs.push({ msg: firstName(p) + " capped at " + p.prefs.maxOpeningPerWeek + " opens/wk but opens " + openCt + "x", level: "want", prefKey: "maxOpeningPerWeek" });
if (p.prefs.maxClosingPerWeek !== null && p.prefs.maxClosingPerWeek !== undefined && closeCt > p.prefs.maxClosingPerWeek * R) tradeoffs.push({ msg: firstName(p) + " capped at " + p.prefs.maxClosingPerWeek + " closes/wk but closes " + closeCt + "x", level: "want", prefKey: "maxClosingPerWeek" });
{ var longRunCt = 0; sched.weeks.forEach(function (wkS) { for (var diX = 1; diX < DAYS.length; diX++) { var prevMine = (wkS[DAYS[diX - 1]] || []).filter(function (a) { return a.pharmacistId === p.id; }); var thisMine = (wkS[DAYS[diX]] || []).filter(function (a) { return a.pharmacistId === p.id; }); if (prevMine.length > 0 && thisMine.length > 0) { var prevH = prevMine.reduce(function (s, a) { return s + (t2m(a.end) - t2m(a.start)) / 60; }, 0); var thisH = thisMine.reduce(function (s, a) { return s + (t2m(a.end) - t2m(a.start)) / 60; }, 0); if (prevH >= 11 && thisH >= 11) longRunCt++; } } });
// Cross-week: Sat long in week W -> Sun long in week W+1
for (var lw = 0; lw < R - 1; lw++) { var satL = (sched.weeks[lw]["Sat"] || []).filter(function (a) { return a.pharmacistId === p.id; }); var sunL = (sched.weeks[lw + 1]["Sun"] || []).filter(function (a) { return a.pharmacistId === p.id; }); if (satL.length > 0 && sunL.length > 0) { var satLH = satL.reduce(function (s, a) { return s + (t2m(a.end) - t2m(a.start)) / 60; }, 0); var sunLH = sunL.reduce(function (s, a) { return s + (t2m(a.end) - t2m(a.start)) / 60; }, 0); if (satLH >= 11 && sunLH >= 11) longRunCt++; } }
if (longRunCt > 0 && (p.prefs.noBackToBackLong || longRunCt >= 2)) tradeoffs.push({ msg: firstName(p) + " has " + longRunCt + " back-to-back long shift" + (longRunCt > 1 ? "s" : ""), level: "want", prefKey: "noBackToBackLong" }); }
// Cross-week max consecutive work days check
{ var maxCon2 = p.prefs.maxConsecutiveWorkDays || 6; var allWorkFlat = []; for (var cwk2 = 0; cwk2 < R; cwk2++) { DAYS.forEach(function (d) { allWorkFlat.push((sched.weeks[cwk2][d] || []).some(function (a) { return a.pharmacistId === p.id; })); }); } var conRun = 0, maxConRun = 0; for (var awi = 0; awi < allWorkFlat.length; awi++) { if (allWorkFlat[awi]) { conRun++; if (conRun > maxConRun) maxConRun = conRun; } else { conRun = 0; } } if (maxConRun > maxCon2) tradeoffs.push({ msg: firstName(p) + " works " + maxConRun + " consecutive days (max " + maxCon2 + ")", level: "want", prefKey: "maxConsecutiveWorkDays" }); }
if (p.prefs.threeDayWeekend) { var got3day = false; sched.weeks.forEach(function (wkS, wki) { var satOff = !(wkS["Sat"] || []).some(function (a) { return a.pharmacistId === p.id; }); var sunOff = !(wkS["Sun"] || []).some(function (a) { return a.pharmacistId === p.id; }); var friOff = !(wkS["Fri"] || []).some(function (a) { return a.pharmacistId === p.id; }); var monOff = !(wkS["Mon"] || []).some(function (a) { return a.pharmacistId === p.id; }); if (satOff && sunOff && (friOff || monOff)) got3day = true; if (p.prefs.threeDayMustIncludeFriday && satOff && sunOff && friOff) got3day = true;
// Cross-week: Sat off end of this week + Sun off start of next week
if (!got3day && wki < R - 1 && satOff) { var nextSunOff = !(sched.weeks[wki + 1]["Sun"] || []).some(function (a) { return a.pharmacistId === p.id; }); var nextMonOff = !(sched.weeks[wki + 1]["Mon"] || []).some(function (a) { return a.pharmacistId === p.id; }); if (nextSunOff && (friOff || nextMonOff)) got3day = true; }
}); if (!got3day) tradeoffs.push({ msg: firstName(p) + " prefers a 3-day weekend block but didn't get one", level: "want", prefKey: "threeDayWeekend" }); }
if (p.prefs.consecutiveDaysOff > 1) { var minOffMet = false; var allDaysFlat = []; for (var cwk = 0; cwk < R; cwk++) { DAYS.forEach(function (d) { var working = (sched.weeks[cwk][d] || []).some(function (a) { return a.pharmacistId === p.id; }); allDaysFlat.push(working); }); } var offRun = 0; for (var adi = 0; adi < allDaysFlat.length; adi++) { if (!allDaysFlat[adi]) { offRun++; if (offRun >= p.prefs.consecutiveDaysOff) { minOffMet = true; break; } } else { offRun = 0; } } if (!minOffMet) tradeoffs.push({ msg: firstName(p) + " needs " + p.prefs.consecutiveDaysOff + " consecutive days off but schedule doesn't provide it", level: "want", prefKey: "consecutiveDaysOff" }); }
var needCount = tradeoffs.filter(function (t) { return t.level === "need"; }).length;
var wantCount = tradeoffs.length - needCount;
var penaltyPerNeed = 20;
var penaltyPerWant = Math.max(8, Math.round(15 * 2 / Math.max(R, 2)));
var totalPenalty = needCount * penaltyPerNeed + wantCount * penaltyPerWant;
return { pharmacistId: p.id, name: p.name, color: p.color, overall: tradeoffs.length === 0 ? 100 : Math.max(15, 100 - totalPenalty), tradeoffs: tradeoffs, openCt: openCt, closeCt: closeCt, totalShifts: totalShifts, avgHours: avgH, weekendDays: weekendDays };
});
var prefAvg = perPerson.length > 0 ? Math.round(perPerson.reduce(function (a, f) { return a + f.overall; }, 0) / perPerson.length) : 100;
var total = Math.round(coveragePct * 0.30 + budgetScore * 0.20 + peakPct * 0.15 + sustainScore * 0.10 + prefAvg * 0.10 + fairnessScore * 0.15);
var letter = total >= 97 ? "A+" : total >= 94 ? "A" : total >= 90 ? "A-" : total >= 87 ? "B+" : total >= 84 ? "B" : total >= 80 ? "B-" : total >= 77 ? "C+" : total >= 74 ? "C" : total >= 70 ? "C-" : total >= 67 ? "D+" : total >= 64 ? "D" : total >= 60 ? "D-" : "F";
var strengths = []; if (coveragePct === 100) strengths.push("Full coverage every open hour"); if (weeklyGap < 0.5) strengths.push("100% demand hours utilized"); if (peakPct >= 80) { if (dayStaff.length >= 2 && (+store.allocatedHoursPerWeek || 0) > opHrs(store.hours)) strengths.push("Strong peak hour overlap"); else strengths.push(store.pmAnchorBusiest ? (hasOverlapBudget ? "PM opens and sets tone on highest volume day" : "PM anchored on highest volume day") : "Busiest days well-staffed"); } if (sustainScore >= 90) strengths.push("Burden evenly distributed"); if (prefAvg >= 85) strengths.push("Most preferences satisfied"); if (fairnessScore >= 90) strengths.push("Weekends, opens, and closes distributed fairly");
var tags = [], needCt = 0, wantCt = 0; perPerson.forEach(function (pp) { (pp.tradeoffs || []).forEach(function (t) { if (t.level === "need") needCt++; else wantCt++; }); });
if (sustainScore < 60) tags.push("Burden concentrated"); if (needCt > 0 && total >= 70) tags.push("Strong but fragile"); if (needCt === 0 && wantCt === 0 && total >= 80) tags.push("Low-drama option"); if (wantCt >= Math.max(4, R + 1)) tags.push("Socially costly"); if (sustainScore >= 80 && total >= 75) tags.push("Operationally clean"); if (gapAction === "dsp") tags.push("DSP needed (" + fmtH(weeklyGap) + "h)"); if (tags.length === 0 && total >= 80) tags.push("Balanced");
return { grade: letter, total: total, tags: tags, weeklyGap: weeklyGap, gapAction: gapAction, components: { coverage: coveragePct, budget: budgetScore, peak: peakPct, sustainability: sustainScore, preferences: prefAvg, fairness: fairnessScore }, perPerson: perPerson, strengths: strengths };
}
export function genSummaryText(store, sc, pharms, r, detailed) {
var lines = [(store.storeLabel || "Store") + " \u2014 Schedule Strength: " + sc.grade, "Generated by RxRotation Lite \u00B7 Madden Frameworks", "Smart systems. Better judgment.", "", "Strategy: " + r.name];
if (sc.tags.length > 0) lines.push("Tags: " + sc.tags.join(", "));
lines.push("");
if (sc.strengths.length > 0) { lines.push("What it gets right:"); sc.strengths.forEach(function (s) { lines.push("\u2713 " + s); }); lines.push(""); }
lines.push("Store Details:"); lines.push("  Demand Hours: " + fmtH(store.allocatedHoursPerWeek) + "h/wk" + (store._originalBudget && store._originalBudget !== store.allocatedHoursPerWeek ? " (was " + fmtH(store._originalBudget) + "h)" : "")); lines.push("  Rotation: " + store.rotationWeeks + " weeks" + (store._originalRot && store._originalRot !== store.rotationWeeks ? " (was " + store._originalRot + "-wk)" : "")); lines.push("  24hr: " + (store.is24hr ? "Yes" : "No") + "\n  PM Anchor: " + (store.pmAnchorBusiest ? "Yes" : "No"));
if (sc.gapAction === "dsp") lines.push("  Gap: " + fmtH(sc.weeklyGap) + "h/wk \u2014 DSP shift needed");
else if (sc.gapAction === "extend") lines.push("  Gap: " + fmtH(sc.weeklyGap) + "h/wk remaining after shift extensions");
lines.push("");
lines.push("Per Person:");
sc.perPerson.forEach(function (f) { var p = pharms.find(function (x) { return x.id === f.pharmacistId; }); var roleLabel = p ? (p.role === "pm" ? "PM" : p.role === "dsp" ? "DSP" : p.role === "ovnt" ? "OVNT" : "Staff") : "Staff"; lines.push("  " + f.name + " (" + roleLabel + "): " + (f.avgHours ? fmtH(f.avgHours) + "h/wk" : "") + " \u00B7 Opens " + f.openCt + "x \u00B7 Closes " + f.closeCt + "x \u00B7 " + f.weekendDays + " weekend days"); });
var tfs = sc.perPerson.filter(function (f) { return f.tradeoffs.length > 0; });
if (tfs.length > 0) { lines.push(""); lines.push("Tradeoffs:"); tfs.forEach(function (f) { f.tradeoffs.forEach(function (t) { lines.push("  \u2022 " + t.msg + " (" + (t.level === "need" ? "OVERRIDE" : "WANT") + ")"); }); }); }
if (detailed && r.schedule && r.schedule.weeks) {
lines.push(""); lines.push("Score Breakdown:"); lines.push("  Coverage: " + sc.components.coverage + "%"); lines.push("  Demand Fit: " + sc.components.budget + "%"); lines.push("  Peak: " + sc.components.peak + "%"); lines.push("  Sustainability: " + sc.components.sustainability + "%"); lines.push("  Preferences: " + sc.components.preferences + "%"); lines.push("  Fairness: " + sc.components.fairness + "%"); lines.push("  Total: " + sc.total + " (" + sc.grade + ")");
r.schedule.weeks.forEach(function (wk, wi) { lines.push(""); lines.push("Week " + (wi + 1) + ":"); DAYS.forEach(function (d) { var assigns = (wk[d] || []).filter(function (a) { return a.segment !== "night"; }); if (assigns.length === 0) { lines.push("  " + d + ": Off"); return; } var parts = assigns.map(function (a) { var p = pharms.find(function (x) { return x.id === a.pharmacistId; }); var nm = p ? (p.role === "pm" ? "PM" : p.role === "dsp" ? "DSP" : firstName(p)) : "?"; return nm + " " + tL(a.start) + "-" + tL(a.end); }); lines.push("  " + d + ": " + parts.join(" | ")); }); });
lines.push(""); lines.push("Operating Hours:"); DAYS.forEach(function (d) { var dh = store.hours[d]; if (dh && dh.isOpen) lines.push("  " + d + ": " + tL(dh.open) + " - " + tL(dh.close)); else lines.push("  " + d + ": Closed"); });
}
return lines.join("\n");
}
export function genNarrative(curScore, newScore, pharms, R) {
if (!curScore || !newScore) return [];
var bullets = [];
var cCov = curScore.components.coverage, nCov = newScore.components.coverage;
if (nCov > cCov && nCov === 100) bullets.push("Closes a coverage gap \u2014 every open hour is now staffed");
else if (nCov > cCov) bullets.push("Better coverage (" + cCov + "% \u2192 " + nCov + "%)");
var cPk = curScore.components.peak, nPk = newScore.components.peak;
if (nPk - cPk >= 10) bullets.push("Stronger overlap during peak hours");
newScore.perPerson.forEach(function (nP) {
var cP = curScore.perPerson.find(function (x) { return x.pharmacistId === nP.pharmacistId; }); if (!cP) return;
if (nP.weekendDays < cP.weekendDays && cP.weekendDays > Math.ceil(R * 0.4)) bullets.push(firstName(nP) + " gets " + (cP.weekendDays - nP.weekendDays) + " more weekend days off per rotation");
if (nP.weekendDays > cP.weekendDays + 1) bullets.push(firstName(nP) + " picks up " + (nP.weekendDays - cP.weekendDays) + " additional weekend days");
if (nP.closeCt > cP.closeCt + 1) bullets.push(firstName(nP) + " takes on " + (nP.closeCt - cP.closeCt) + " additional closing shifts");
if (nP.closeCt < cP.closeCt - 1) bullets.push(firstName(nP) + " closes " + (cP.closeCt - nP.closeCt) + " fewer times");
if (nP.openCt > cP.openCt + 1) bullets.push(firstName(nP) + " takes on " + (nP.openCt - cP.openCt) + " additional opening shifts");
if (Math.abs(nP.avgHours - cP.avgHours) >= 2) { var p = pharms.find(function (x) { return x.id === nP.pharmacistId; }); if (p && Math.abs(nP.avgHours - p.targetHours) < Math.abs(cP.avgHours - p.targetHours)) bullets.push(firstName(nP) + " moves closer to target (" + fmtH(cP.avgHours) + "h \u2192 " + fmtH(nP.avgHours) + "h/wk)"); }
// Fewer tradeoffs
if (nP.tradeoffs && cP.tradeoffs && nP.tradeoffs.length < cP.tradeoffs.length && cP.tradeoffs.length >= 2) bullets.push(firstName(nP) + " has fewer preference conflicts (" + cP.tradeoffs.length + " \u2192 " + nP.tradeoffs.length + ")");
});
var cSust = curScore.components.sustainability, nSust = newScore.components.sustainability;
if (nSust > cSust + 15) bullets.push("Workload distributed more evenly across team");
var cFair = curScore.components.fairness, nFair = newScore.components.fairness;
if (nFair > cFair + 10) bullets.push("Fairer distribution of weekends, opens, and closes");
var cBudget = curScore.components.budget, nBudget = newScore.components.budget;
if (nBudget > cBudget + 10) bullets.push("Better demand hours alignment");
return bullets.slice(0, 5);
}
