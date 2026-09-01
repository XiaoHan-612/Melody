// ═══════════════════════════════════════════
// app.js — 入口（导航/初始化/动画循环/App 桥接）
// ═══════════════════════════════════════════
import { $ } from "./utils.js";
import { toast } from "./utils.js";
import { S, audio, MODE_ORDER, MODE_ICONS } from "./state.js";
import { initTheme, toggleTheme } from "./theme.js";
import { initMW, drawMW } from "./visualizer.js";
import { updateLyricProgress, drawIL, openLyrics, closeLyrics, toggleLyricPanel, toggleTrans, adjustOff, updateILKaraoke, initILEvents, cycleILMode, adjustILFont, normalizeILMode } from "./lyrics.js";
import { search, searchHist, renderHist, initSearchEvents } from "./search.js";
import { renderList, renderQueue } from "./render.js";
import { loadPls, loadRecent, loadFav, addToPl, toggleFav, rmFromPl, setSwitchTabFn, showPlaylistTab, backToGrid, exportPls, importPls, renderPlSidebar, updateFavCount } from "./playlist.js";
import { togglePlay, playPrev, playNext, skip, cycleMode, setSpeed, toggleSpeed, toggleMute, setVol, updatePlayBtn, updateProgress, curList, initPlayerEvents, clearQueue, tryResume } from "./player.js";
import { hideMenu } from "./menu.js";
import { openSettings, initSettings } from "./settings.js";

// JS 错误上报到服务端日志（WebView 无控制台，便于排查）
window.addEventListener("error",function(e){
  try{fetch("/api/log?m="+encodeURIComponent((e.message||"")+" @ "+(e.filename||"")+":"+(e.lineno||0)))}catch(err){}
});
window.addEventListener("unhandledrejection",function(e){
  try{fetch("/api/log?m=unhandled:"+encodeURIComponent(String(e.reason&&e.reason.message||e.reason)))}catch(err){}
});

// ── 侧边栏折叠 ──
function toggleSidebar(){var sb=$("sidebar");sb.classList.toggle("collapsed");try{localStorage.setItem("melody_sb",sb.classList.contains("collapsed")?"1":"0")}catch(e){}}

// ── 标签页（方向感过渡：前进左入 / 后退右出）──
var TAB_ORDER=["search","playlist","favlist","recent"];
function switchTab(t){
  if(t===S.tab)return;
  var dir=TAB_ORDER.indexOf(t)>TAB_ORDER.indexOf(S.tab)?1:-1;
  S.tab=t;
  document.querySelectorAll(".nav-item[data-tab]").forEach(function(el){el.classList.toggle("active",el.dataset.tab===t)});
  // 重新评估侧边栏歌单列表的 active 状态，避免切换 tab 后残留高亮
  renderPlSidebar();
  var content=$("trackList");
  content.style.transition="transform .16s ease-in,opacity .16s ease-in";
  content.style.transform="translateX("+(-dir*28)+"px)";content.style.opacity="0";
  setTimeout(function(){
    switch(t){
      case "search":$("pageTitle").textContent="搜索音乐";$("pageSub").textContent="搜索你喜欢的音乐";var kw=$("searchInput").value;if(kw)search(kw);else renderHist();break;
      case "playlist":S.plView="grid";showPlaylistTab();break;
      case "favlist":$("pageTitle").textContent="我喜欢的音乐";$("pageSub").textContent=S.fav.length+" 首歌曲";renderList(S.fav,"favlist");break;
      case "recent":$("pageTitle").textContent="最近播放";$("pageSub").textContent=S.recent.length+" 首歌曲";renderList(S.recent,"recent");break;
    }
    content.style.transition="transform .28s var(--spring),opacity .28s var(--spring)";
    content.style.transform="translateX("+(dir*28)+"px)";
    requestAnimationFrame(function(){requestAnimationFrame(function(){content.style.transform="translateX(0)";content.style.opacity="1"})});
  },170);
}
function filterSrc(s){S.src=s;document.querySelectorAll(".source-pill").forEach(function(el){el.classList.toggle("active",el.dataset.source===s)});var kw=$("searchInput").value;if(kw&&S.tab==="search")search(kw)}

// ── 队列抽屉 ──
function toggleQueue(){
  var d=$("queueDrawer");
  var show=!d.classList.contains("show");
  d.classList.toggle("show",show);
  if(show)renderQueue();
}

// 曲目结束：单曲循环重播 / 否则自动切下一首（fromTimeupdate 防止重复触发）
var trackEndFired=false;
function handleTrackEnd(fromTimeupdate){
  if(trackEndFired)return;
  trackEndFired=true;
  setTimeout(function(){trackEndFired=false},1500);
  if(S.play===false&&fromTimeupdate)return; // 暂停状态不触发
  if(S.mode==="single"){audio.currentTime=0;if(!fromTimeupdate)audio.play();else audio.play().catch(function(){})}
  else playNext()
}
// ── 动画循环 ──
function animLoop(){
  if(S.play&&audio.duration)updateLyricProgress();
  drawMW();
  if(S.lyricsOpen){drawIL();updateILKaraoke()}
  requestAnimationFrame(animLoop);
}

// ── 初始化 ──
function init(){
  initTheme();initMW();
  try{if(localStorage.getItem("melody_sb")==="1")$("sidebar").classList.add("collapsed")}catch(e){}
  initSearchEvents();
  document.querySelectorAll(".nav-item[data-tab]").forEach(function(el){el.addEventListener("click",function(){switchTab(el.dataset.tab)})});
  document.querySelectorAll(".source-pill").forEach(function(el){el.addEventListener("click",function(e){e.preventDefault();filterSrc(el.dataset.source)})});
  $("songInfoArea").addEventListener("click",function(){openLyrics()});
  audio.addEventListener("timeupdate",updateProgress);
  // 曲目结束统一处理：ended 事件 + timeupdate 兜底（流媒体 ended 不可靠）
  audio.addEventListener("ended",handleTrackEnd);
  audio.addEventListener("timeupdate",function(){
    if(S.play&&isFinite(audio.duration)&&audio.duration>0&&audio.currentTime>=audio.duration-0.5)handleTrackEnd(true);
  });
  audio.addEventListener("error",function(){toast("播放出错");S.play=false;updatePlayBtn()});
  initPlayerEvents();
  initILEvents();
  $("btnQueue").addEventListener("click",toggleQueue);
  $("queueClose").addEventListener("click",toggleQueue);
  $("queueClear").addEventListener("click",clearQueue);
  initSettings();
  setSwitchTabFn(switchTab);
  $("plImportBtn").addEventListener("click",function(){var f=$("plImportFile");if(f)f.click()});
  $("plImportFile").addEventListener("change",function(e){if(e.target.files&&e.target.files[0])importPls(e.target.files[0]);e.target.value=""});
  $("plExportBtn").addEventListener("click",exportPls);
  try{var im=localStorage.getItem("melody_ilmode");if(im)S.ilMode=normalizeILMode(im)}catch(e){}
  try{var fs=parseInt(localStorage.getItem("melody_ilfont"));if(fs>=30&&fs<=110){document.documentElement.style.setProperty("--il-fs-active",fs+"px");document.documentElement.style.setProperty("--il-fs",Math.round(fs*0.62)+"px")}}catch(e){}
  document.addEventListener("click",function(e){
    if(!e.target.closest("#contextMenu"))hideMenu();
    if(!e.target.closest("#speedMenu")&&!e.target.closest("#speedBadge"))$("speedMenu").classList.remove("show");
  });
  document.addEventListener("keydown",function(e){if(e.target.tagName==="INPUT")return;switch(e.key){case " ":e.preventDefault();togglePlay();break;case "ArrowLeft":if(e.ctrlKey)playPrev();else skip(-5);break;case "ArrowRight":if(e.ctrlKey)playNext();else skip(5);break;case "ArrowUp":e.preventDefault();setVol(Math.min(1,audio.volume+.1));break;case "ArrowDown":e.preventDefault();setVol(Math.max(0,audio.volume-.1));break;case "m":case "M":toggleMute();break;case "l":case "L":toggleLyricPanel();break;case "f":case "F":if(S.lyricsOpen)closeLyrics();else openLyrics();break;case "Escape":hideMenu();closeLyrics();break}});
  loadPls();
  S.recent=loadRecent();
  S.fav=loadFav();
  updateFavCount();
  try{var m=localStorage.getItem("melody_mode");if(MODE_ORDER.indexOf(m)>=0)S.mode=m}catch(e){}
  try{var v=parseFloat(localStorage.getItem("melody_vol"));if(isFinite(v)&&v>=0&&v<=1)setVol(v)}catch(e){}
  $("btnMode").innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'+MODE_ICONS[S.mode]+"</svg>";
  updatePlayBtn();
  tryResume();
}

window.App={toggle:togglePlay,prev:playPrev,next:playNext,skip:skip,cycleMode:cycleMode,setSpeed:setSpeed,toggleSpeedMenu:toggleSpeed,toggleMute:toggleMute,toggleLyricPanel:toggleLyricPanel,openLyrics:openLyrics,closeLyrics:closeLyrics,toggleTranslation:toggleTrans,adjustLyricOffset:adjustOff,toggleTheme:toggleTheme,toggleSidebar:toggleSidebar,cycleILMode:cycleILMode,openSettings:openSettings,backToGrid:backToGrid,toggleFav:function(){if(S.song)toggleFav(S.song)},searchHist:searchHist,clearHist:function(){localStorage.removeItem("melody_sh");renderHist()},addToPlaylist:function(i){var l=curList();if(l[i])addToPl(l[i])},removeFromPlaylist:rmFromPl};
requestAnimationFrame(animLoop);
init();
