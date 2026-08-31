// theme.js — 主题
import { $ } from "./utils.js";

export function initTheme(){applyTheme(localStorage.getItem("melody_theme")||"light")}
export function applyTheme(t){var actual=t==="system"?(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"):t;document.documentElement.setAttribute("data-theme",actual);try{localStorage.setItem("melody_theme",t)}catch(e){}var l=$("themeLabel");if(l)l.textContent=actual==="dark"?"浅色模式":"深色模式"}
export function toggleTheme(){applyTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark")}
export function resetAccent(){document.documentElement.style.setProperty("--accent","#007AFF");document.documentElement.style.setProperty("--accent-rgb","0,122,255")}
