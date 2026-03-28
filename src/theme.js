export var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export var CoLight = { ac: "#2D7A54", acS: "rgba(45,122,84,0.08)", gn: "#16a34a", gnS: "#dcfce7", am: "#d97706", amS: "#fef3c7", rd: "#dc2626", rdS: "#fee2e2", pu: "#7c3aed", puS: "#ede9fe", tl: "#0d9488", tlS: "#ccfbf1", tx: "#1c1917", txM: "#44403c", txMu: "#78716c", txD: "#8a8480", bdr: "#d6d3d1", bdrL: "#e7e5e4", bg: "#EEECEA", sf: "#F4F3F1", card: "#F9F8F7" };
export var CoDark = { ac: "#3D9A6D", acS: "rgba(61,154,109,0.12)", gn: "#3FB950", gnS: "#14332a", am: "#e09f3e", amS: "#3d2e0a", rd: "#f87171", rdS: "#3d1414", pu: "#a78bfa", puS: "#2d1f5e", tl: "#2dd4bf", tlS: "#0f2d2a", tx: "#f5f5f4", txM: "#d6d3d1", txMu: "#a8a29e", txD: "#6b6560", bdr: "#3f3f46", bdrL: "#2e2e33", bg: "#18181b", sf: "#1c1c1f", card: "#27272a" };
export var shadowLight = { sm: "0 1px 2px rgba(28,25,23,0.04)", md: "0 2px 8px rgba(28,25,23,0.06)", lg: "0 4px 16px rgba(28,25,23,0.08)" };
export var shadowDark = { sm: "0 1px 2px rgba(0,0,0,0.2)", md: "0 2px 8px rgba(0,0,0,0.3)", lg: "0 4px 16px rgba(0,0,0,0.4)" };
export var Co = CoLight;
export var shadow = shadowLight;
export var font = { fontFamily: "'IBM Plex Sans', -apple-system, sans-serif" };
export var mono = { fontFamily: "'IBM Plex Mono', monospace" };
export var PC = ["#3D9A6D", "#E05252", "#5B8DEF", "#E0A030", "#A855F7", "#E06090", "#20B2AA", "#F97316"];

export function setTheme(dark) {
  if (dark) { Co = CoDark; shadow = shadowDark; }
  else { Co = CoLight; shadow = shadowLight; }
}
