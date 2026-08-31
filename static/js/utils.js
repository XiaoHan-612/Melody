// utils.js — 基础工具函数（纯函数，可单测）
export function $(id){return document.getElementById(id)}
export function fmt(s){if(!s||!isFinite(s))return"00:00";var m=Math.floor(s/60);return String(m).padStart(2,"0")+":"+String(Math.floor(s%60)).padStart(2,"0")}
export function toast(m){var t=$("toast");t.textContent=m;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove("show")},2500)}
export function esc(s){return(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}
