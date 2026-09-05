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
  $("setCheckUpdate").addEventListener("click",checkUpdate);
  $("setCopyLink").addEventListener("click",function(){
    try{navigator.clipboard.writeText("https://github.com/XiaoHan-612/MelodyV3").then(function(){toast("已复制 GitHub 链接")})}catch(e){}
  });
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

function checkUpdate(){
  toast("正在检查更新...");
  fetch("https://api.github.com/repos/XiaoHan-612/MelodyV3/releases/latest")
    .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json() })
    .then(function(d){
      var tag=d&&d.tag_name||"";
      if(!tag){toast("检查更新失败：响应异常");return}
      if(!appVersion||appVersion==="dev"){toast("开发版 "+(tag||"")+" 已发布（当前 dev 构建）");return}
      if(compareVer(tag,appVersion)>0){
        var dl="https://github.com/XiaoHan-612/MelodyV3/releases/latest/download/MelodyV3.exe";
        try{navigator.clipboard.writeText(dl).then(function(){toast("发现新版本 "+tag+"！下载链接已复制，粘贴到浏览器即可下载")})}catch(e){toast("发现新版本 "+tag+"（当前 "+APP_VERSION+"）")}
      }else toast("已是最新版本 "+APP_VERSION);
    })
    .catch(function(){toast("检查更新失败，请检查网络")});
}

// 语义化版本比较：compareVer("v4.1.0","v4.0.0") → 1
function compareVer(a,b){
  var pa=String(a).replace(/^v/,"").split(".").map(Number);
  var pb=String(b).replace(/^v/,"").split(".").map(Number);
  for(var i=0;i<3;i++){
    var x=pa[i]||0,y=pb[i]||0;
    if(x!==y)return x>y?1:-1;
  }
  return 0;
}


// 导出全部用户数据（歌单 + 收藏 + 最近播放）为单个 JSON 备份文件
function exportAllData(){
  var payload={
    app:"MelodyV3",
    version:1,
    exported_at:new Date().toISOString(),
    playlists:S.pls,
    favorites:S.fav,
    recent:S.recent,
  };
  var blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="MelodyV3-全部数据-"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(a.href);
  toast("已导出全部数据（歌单/收藏/最近播放）");
}