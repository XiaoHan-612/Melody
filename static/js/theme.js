// theme.js — 主题与封面主题色
import { $ } from "./utils.js";

export function initTheme(){applyTheme(localStorage.getItem("melody_theme")||"light")}
export function applyTheme(t){var actual=t==="system"?(window.matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"):t;document.documentElement.setAttribute("data-theme",actual);try{localStorage.setItem("melody_theme",t)}catch(e){}var l=$("themeLabel");if(l)l.textContent=actual==="dark"?"浅色模式":"深色模式"}
export function toggleTheme(){applyTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark")}

// 从封面提取主色调作为界面强调色（可在设置中关闭）
export function extractCover(u){if(!u)return;try{if(localStorage.getItem("melody_covercolor")==="0")return}catch(e){}var img=new Image();img.crossOrigin="anonymous";img.onload=function(){try{var c=document.createElement("canvas"),x=c.getContext("2d");c.width=64;c.height=64;x.drawImage(img,0,0,64,64);var d=x.getImageData(0,0,64,64).data,r=0,g=0,b=0,n=0;for(var i=0;i<d.length;i+=16){r+=d[i];g+=d[i+1];b+=d[i+2];n++}r=Math.round(r/n);g=Math.round(g/n);b=Math.round(b/n);if(Math.max(r,g,b)===0)return;document.documentElement.style.setProperty("--accent","rgb("+r+","+g+","+b+")");document.documentElement.style.setProperty("--accent-rgb",r+","+g+","+b)}catch(e){}};img.src=u}
export function resetAccent(){document.documentElement.style.setProperty("--accent","#007AFF");document.documentElement.style.setProperty("--accent-rgb","0,122,255")}
