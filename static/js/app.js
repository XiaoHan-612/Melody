// ═══════════════════════════════════════════
// app.js — 入口（导航/初始化/动画循环/App 桥接）
// ═══════════════════════════════════════════
import { $ } from "./utils.js";
import { toast } from "./utils.js";
import { S, audio, MODE_ORDER, MODE_ICONS } from "./state.js";
import { initTheme, toggleTheme } from "./theme.js";
import { initMW, drawMW } from "./visualizer.js";
import { updateLyricProgress, drawIL, openLyrics, closeLyrics, toggleLyricPanel, toggleTrans, adjustOff, updateILKaraoke, initILEvents, cycleILMode, adjustILFont } from "./lyrics.js";
import { search, searchHist, renderHist, initSearchEvents } from "./search.js";
import { renderList, renderQueue } from "./render.js";
import { loadPls, loadRecent, loadFav, addToPl, toggleFav, rmFromPl, setSwitchTabFn, showPlaylistTab, backToGrid, exportPls, importPls } from "./playlist.js";
import { togglePlay, playPrev, playNext, skip, cycleMode, setSpeed, toggleSpeed, toggleMute, setVol, updatePlayBtn, updateProgress, curList, initPlayerEvents, setSleepTimer, clearQueue, tryResume } from "./player.js";
import { hideMenu, showMenu } from "./menu.js";
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

// ── 播放队列抽屉 ──
function toggleQueue(){
  var d=$("queueDrawer");
  var show=!d.classList.contains("show");
  d.classList.toggle("show",show);
  if(show)renderQueue();
}
// ── 睡眠定时器菜单 ──
function sleepTimerMenu(){
  var b=$("btnSleep"),r=b.getBoundingClientRect();
  var active=S.sleepT?" (进行中)":"";
  showMenu(r.left-120,r.bottom+6,[
    {label:"当前曲目结束后",fn:function(){setSleepTimer("song")}},
    {label:"15 分钟后",fn:function(){setSleepTimer("15")}},
    {label:"30 分钟后",fn:function(){setSleepTimer("30")}},
    {label:"60 分钟后",fn:function(){setSleepTimer("60")}},
    {sep:true},
    {label:"取消定时"+active,danger:!!S.sleepT,fn:function(){setSleepTimer("off")}},
  ]);
}

// ── 动画循环 ──
var syncCh=null,syncFrame=0;
function initSync(){try{syncCh=new BroadcastChannel("melody-sync")}catch(e){return}syncCh.onmessage=function(ev){var d=ev.data;if(!d||d.type!=="cmd")return;if(d.cmd==="toggle")togglePlay();else if(d.cmd==="prev")playPrev();else if(d.cmd==="next")playNext()}}
function broadcastState(){
  if(!syncCh)return;
  var cur=null,nx=null;
  if(S.lines&&S.lyricIdx>=0){cur=S.lines[S.lyricIdx];if(S.lyricIdx+1<S.lines.length)nx=S.lines[S.lyricIdx+1]}
  syncCh.postMessage({type:"state",song:S.song,play:S.play,time:audio.currentTime,dur:audio.duration||0,cur:cur,next:nx});
}
function animLoop(){
  if(S.play&&audio.duration)updateLyricProgress();
  drawMW();
  if(S.lyricsOpen){drawIL();updateILKaraoke()}
  if(++syncFrame%30===0)broadcastState(); // 约每 0.5 秒同步一次辅助窗口
  requestAnimationFrame(animLoop);
}

// ── 辅助窗口（迷你模式）──
function openMini(){fetch("/api/window?mode=mini")}

// ── 初始化 ──
function init(){
  initTheme();initMW();
  try{if(localStorage.getItem("melody_sb")==="1")$("sidebar").classList.add("collapsed")}catch(e){}
  initSearchEvents();
  document.querySelectorAll(".nav-item[data-tab]").forEach(function(el){el.addEventListener("click",function(){switchTab(el.dataset.tab)})});
  document.querySelectorAll(".source-pill").forEach(function(el){el.addEventListener("click",function(e){e.preventDefault();filterSrc(el.dataset.source)})});
  $("songInfoArea").addEventListener("click",function(){openLyrics()});
  audio.addEventListener("timeupdate",updateProgress);
  audio.addEventListener("ended",function(){
    // 睡眠定时器：当前曲目结束后停止
    if(S.sleepT==="song"){S.sleepT=null;S.play=false;updatePlayBtn();toast("定时停止播放");return}
    if(S.mode==="single"){audio.currentTime=0;audio.play()}else playNext()
  });
  audio.addEventListener("error",function(){toast("播放出错");S.play=false;updatePlayBtn()});
  initPlayerEvents();
  initILEvents();
  $("btnQueue").addEventListener("click",toggleQueue);
  $("btnSleep").addEventListener("click",sleepTimerMenu);
  $("queueClose").addEventListener("click",toggleQueue);
  $("queueClear").addEventListener("click",clearQueue);
  initSync();
  initSettings();
  setSwitchTabFn(switchTab);
  $("plImportBtn").addEventListener("click",function(){var f=$("plImportFile");if(f)f.click()});
  $("plImportFile").addEventListener("change",function(e){if(e.target.files&&e.target.files[0])importPls(e.target.files[0]);e.target.value=""});
  $("plExportBtn").addEventListener("click",exportPls);
  try{var im=localStorage.getItem("melody_ilmode");if(im==="pure"||im==="spec"||im==="star")S.ilMode=im}catch(e){}
  try{var fs=parseInt(localStorage.getItem("melody_ilfont"));if(fs>=30&&fs<=110){document.documentElement.style.setProperty("--il-fs-active",fs+"px");document.documentElement.style.setProperty("--il-fs",Math.round(fs*0.62)+"px")}}catch(e){}
  document.addEventListener("click",function(e){
    if(!e.target.closest("#contextMenu"))hideMenu();
    if(!e.target.closest("#speedMenu")&&!e.target.closest("#speedBadge"))$("speedMenu").classList.remove("show");
  });
  document.addEventListener("keydown",function(e){if(e.target.tagName==="INPUT")return;switch(e.key){case " ":e.preventDefault();togglePlay();break;case "ArrowLeft":if(e.ctrlKey)playPrev();else skip(-5);break;case "ArrowRight":if(e.ctrlKey)playNext();else skip(5);break;case "ArrowUp":e.preventDefault();setVol(Math.min(1,audio.volume+.1));break;case "ArrowDown":e.preventDefault();setVol(Math.max(0,audio.volume-.1));break;case "m":case "M":toggleMute();break;case "l":case "L":toggleLyricPanel();break;case "f":case "F":if(S.lyricsOpen)closeLyrics();else openLyrics();break;case "Escape":hideMenu();closeLyrics();break}});
  loadPls();
  S.recent=loadRecent();
  S.fav=loadFav();
  try{var m=localStorage.getItem("melody_mode");if(MODE_ORDER.indexOf(m)>=0)S.mode=m}catch(e){}
  try{var v=parseFloat(localStorage.getItem("melody_vol"));if(isFinite(v)&&v>=0&&v<=1)setVol(v)}catch(e){}
  $("btnMode").innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'+MODE_ICONS[S.mode]+"</svg>";
  updatePlayBtn();
  tryResume();
}

window.App={toggle:togglePlay,prev:playPrev,next:playNext,skip:skip,cycleMode:cycleMode,setSpeed:setSpeed,toggleSpeedMenu:toggleSpeed,toggleMute:toggleMute,toggleLyricPanel:toggleLyricPanel,openLyrics:openLyrics,closeLyrics:closeLyrics,toggleTranslation:toggleTrans,adjustLyricOffset:adjustOff,toggleTheme:toggleTheme,toggleSidebar:toggleSidebar,cycleILMode:cycleILMode,openMini:openMini,openSettings:openSettings,backToGrid:backToGrid,toggleFav:function(){if(S.song)toggleFav(S.song)},searchHist:searchHist,clearHist:function(){localStorage.removeItem("melody_sh");renderHist()},addToPlaylist:function(i){var l=curList();if(l[i])addToPl(l[i])},removeFromPlaylist:rmFromPl};
requestAnimationFrame(animLoop);
init();
