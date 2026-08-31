// settings.js — 设置面板（外观/歌词/播放/关于）
import { $, toast } from "./utils.js";
import { S, audio } from "./state.js";
import { applyTheme } from "./theme.js";
import { setVol } from "./player.js";
import { adjustILFont } from "./lyrics.js";

export var APP_VERSION = "v4.0.0";

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
      S.ilMode=b.dataset.ilmode;
      try{localStorage.setItem("melody_ilmode",S.ilMode)}catch(e){}
      renderSettingsState();
      toast("全屏背景: "+(S.ilMode==="pure"?"纯净":S.ilMode==="spec"?"频谱":"星空"));
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
  $("setVersion").textContent=APP_VERSION;
  $("setCheckUpdate").addEventListener("click",checkUpdate);
  $("setCopyLink").addEventListener("click",function(){
    try{navigator.clipboard.writeText("https://github.com/XiaoHan-612/MelodyV3").then(function(){toast("已复制 GitHub 链接")})}catch(e){}
  });
}

function renderSettingsState(){
  var cur=localStorage.getItem("melody_theme")||"light";
  document.querySelectorAll("#setTheme [data-theme-opt]").forEach(function(b){b.classList.toggle("active",b.dataset.themeOpt===cur)});
  var im=S.ilMode||"spec";
  document.querySelectorAll("#setILMode [data-ilmode]").forEach(function(b){b.classList.toggle("active",b.dataset.ilmode===im)});
  var fs=parseInt(document.documentElement.style.getPropertyValue("--il-fs-active"))||52;
  var v=$("setFontVal");if(v)v.textContent=fs+"px";
  var vol=$("setVol");if(vol)vol.value=Math.round(audio.volume*100);
}

function checkUpdate(){
  toast("正在检查更新...");
  fetch("https://api.github.com/repos/XiaoHan-612/MelodyV3/releases/latest")
    .then(function(r){return r.json()})
    .then(function(d){
      var tag=d&&d.tag_name||"";
      if(tag&&tag!==APP_VERSION)toast("发现新版本 "+tag+"（当前 "+APP_VERSION+"）");
      else toast("已是最新版本 "+APP_VERSION);
    })
    .catch(function(){toast("检查更新失败，请检查网络")});
}
