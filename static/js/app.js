// ═══════════════════════════════════════════
// app.js — 入口（导航/初始化/动画循环/App 桥接）
// ═══════════════════════════════════════════
import { $ } from "./utils.js";
import { toast } from "./utils.js";
import { S, audio, MODE_ORDER, MODE_ICONS } from "./state.js";
import { initTheme, toggleTheme } from "./theme.js";
import { initMW, drawMW } from "./visualizer.js";
import { updateLyricProgress, drawIL, openLyrics, closeLyrics, toggleLyricPanel, toggleTrans, adjustOff } from "./lyrics.js";
import { search, searchHist, renderHist, initSearchEvents } from "./search.js";
import { renderList } from "./render.js";
import { loadPl, loadRecent, addToPl, rmFromPl } from "./playlist.js";
import { togglePlay, playPrev, playNext, skip, cycleMode, setSpeed, toggleSpeed, toggleMute, setVol, updatePlayBtn, curList, initPlayerEvents } from "./player.js";

// Tabs
function switchTab(t){S.tab=t;document.querySelectorAll(".nav-item[data-tab]").forEach(function(el){el.classList.toggle("active",el.dataset.tab===t)});var content=$("trackList");content.style.opacity="0";content.style.transform="translateY(8px)";setTimeout(function(){switch(t){case "search":$("pageTitle").textContent="搜索音乐";$("pageSub").textContent="搜索你喜欢的音乐";var kw=$("searchInput").value;if(kw)search(kw);else renderHist();break;case "playlist":$("pageTitle").textContent="我的歌单";$("pageSub").textContent=S.pl.length+" 首歌曲";renderList(S.pl,"playlist");break;case "recent":$("pageTitle").textContent="最近播放";$("pageSub").textContent=S.recent.length+" 首歌曲";renderList(S.recent,"recent");break}content.style.opacity="1";content.style.transform="translateY(0)"},50)}
function filterSrc(s){S.src=s;document.querySelectorAll(".source-pill").forEach(function(el){el.classList.toggle("active",el.dataset.source===s)});var kw=$("searchInput").value;if(kw&&S.tab==="search")search(kw)}

// Animation loop
function animLoop(){if(S.play&&audio.duration)updateLyricProgress();drawMW();if(S.lyricsOpen)drawIL();requestAnimationFrame(animLoop)}

// Init
function init(){
  initTheme();initMW();
  initSearchEvents();
  document.querySelectorAll(".nav-item[data-tab]").forEach(function(el){el.addEventListener("click",function(){switchTab(el.dataset.tab)})});
  document.querySelectorAll(".source-pill").forEach(function(el){el.addEventListener("click",function(e){e.preventDefault();filterSrc(el.dataset.source)})});
  $("songInfoArea").addEventListener("click",function(){openLyrics()});
  audio.addEventListener("timeupdate",updateProgress);
  audio.addEventListener("ended",function(){if(S.mode==="single"){audio.currentTime=0;audio.play()}else playNext()});
  audio.addEventListener("error",function(){toast("播放出错");S.play=false;updatePlayBtn()});
  initPlayerEvents();
  document.addEventListener("click",function(e){if(!e.target.closest("#speedMenu")&&!e.target.closest("#speedBadge"))$("speedMenu").classList.remove("show")});
  document.addEventListener("keydown",function(e){if(e.target.tagName==="INPUT")return;switch(e.key){case " ":e.preventDefault();togglePlay();break;case "ArrowLeft":if(e.ctrlKey)playPrev();else skip(-5);break;case "ArrowRight":if(e.ctrlKey)playNext();else skip(5);break;case "ArrowUp":e.preventDefault();setVol(Math.min(1,audio.volume+.1));break;case "ArrowDown":e.preventDefault();setVol(Math.max(0,audio.volume-.1));break;case "m":case "M":toggleMute();break;case "l":case "L":toggleLyricPanel();break;case "f":case "F":if(S.lyricsOpen)closeLyrics();else openLyrics();break;case "Escape":closeLyrics();break}});
  loadPl();
  S.recent=loadRecent();
  try{var m=localStorage.getItem("melody_mode");if(MODE_ORDER.indexOf(m)>=0)S.mode=m}catch(e){}
  try{var v=parseFloat(localStorage.getItem("melody_vol"));if(isFinite(v)&&v>=0&&v<=1)setVol(v)}catch(e){}
  $("btnMode").innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'+MODE_ICONS[S.mode]+'</svg>'
}

window.App={toggle:togglePlay,prev:playPrev,next:playNext,skip:skip,cycleMode:cycleMode,setSpeed:setSpeed,toggleSpeedMenu:toggleSpeed,toggleMute:toggleMute,toggleLyricPanel:toggleLyricPanel,openLyrics:openLyrics,closeLyrics:closeLyrics,toggleTranslation:toggleTrans,adjustLyricOffset:adjustOff,toggleTheme:toggleTheme,searchHist:searchHist,clearHist:function(){localStorage.removeItem("melody_sh");renderHist()},addToPlaylist:function(i){var l=curList();if(l[i])addToPl(l[i])},removeFromPlaylist:rmFromPl};
requestAnimationFrame(animLoop);
init();
