// settings.js — 设置面板（外观/歌词/播放/关于）
import { $, toast } from "./utils.js";
import { S, audio } from "./state.js";
import { setState } from "./store.js";
import { applyTheme } from "./theme.js";
import { setVol } from "./player.js";
import { adjustILFont, normalizeILMode } from "./lyrics.js";

var appVersion = ""; // 由 /api/version 提供（CI 构建注入 Go 侧，单一来源）

export function openSettings(){var d=$("settingsDrawer");d.classList.add("show");renderSettingsState()}
export function closeSettings(){$("settingsDrawer").classList.remove("show")}

export function initSettings(){
  $("settingsClose").addEventListener("click",closeSettings);

  // 外观：主题
  document.querySelectorAll("#setTheme [data-theme-opt]").forEach(function(b){
    b.addEventListener("click",function(){applyTheme(b.dataset.themeOpt);renderSettingsState()});
  });

  // 歌词：全屏背景模式
  document.querySelectorAll("#setILMode [data-ilmode]").forEach(function(b){
    b.addEventListener("click",function(){
      setState({ilMode:b.dataset.ilmode});
      try{localStorage.setItem("melody_ilmode",S.ilMode)}catch(e){}
      renderSettingsState();
      toast("全屏背景: "+({pure:"纯净",spec:"频谱",galaxy:"星海"})[S.ilMode]);
    });
  });
  // 歌词：全屏字号
  $("setFontMinus").addEventListener("click",function(){adjustILFont(-4);renderSettingsState()});
  $("setFontPlus").addEventListener("click",function(){adjustILFont(4);renderSettingsState()});
  // 歌词：点击播放
  var cp=$("setClickPlay");
  cp.checked=localStorage.getItem("melody_clickplay")!=="0";
  cp.addEventListener("change",function(){try{localStorage.setItem("melody_clickplay",cp.checked?"1":"0")}catch(e){}});

  // 播放：默认音量
  $("setVol").addEventListener("input",function(e){setVol(e.target.value/100);renderSettingsState()});

  // 关于
  fetch("/api/version").then(function(r){return r.json()}).then(function(d){
    appVersion=(d&&d.version)||"";
    if(appVersion&&appVersion!=="dev")appVersion=appVersion.charAt(0)==="v"?appVersion:"v"+appVersion;
    $("setVersion").textContent=appVersion||"dev";
    var sv=$("sbVersion");if(sv&&appVersion)sv.textContent=appVersion;
  }).catch(function(){ $("setVersion").textContent="dev" });
  $("setOpenLogs").addEventListener("click",function(){
    fetch("/api/open-logs").then(function(){toast("已打开日志目录")}).catch(function(){toast("打开失败")});
  });
  $("setExportAll").addEventListener("click",exportAllData);
}

function renderSettingsState(){
  var cur=localStorage.getItem("melody_theme")||"light";
  document.querySelectorAll("#setTheme [data-theme-opt]").forEach(function(b){b.classList.toggle("active",b.dataset.themeOpt===cur)});
  var im=normalizeILMode(S.ilMode);
  document.querySelectorAll("#setILMode [data-ilmode]").forEach(function(b){b.classList.toggle("active",b.dataset.ilmode===im)});
  var fs=parseInt(document.documentElement.style.getPropertyValue("--il-fs-active"))||52;
  var v=$("setFontVal");if(v)v.textContent=fs+"px";
  var vol=$("setVol");if(vol)vol.value=Math.round(audio.volume*100);
}



// 导出全部用户数据（歌单 + 收藏 + 最近播放）为单个 JSON 备份文件
function exportAllData(){
  var payload={
    app:"Melody",
    version:1,
    exported_at:new Date().toISOString(),
    playlists:S.pls,
    favorites:S.fav,
    recent:S.recent,
  };
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="Melody-全部数据-"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(a.href);
  toast("已导出全部数据（歌单/收藏/最近播放）");
}