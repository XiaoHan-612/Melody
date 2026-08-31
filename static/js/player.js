// player.js — 播放核心（播放/队列/切歌/淡入淡出/失败处理/控制）
import { $, toast, fmt } from "./utils.js";
import { api } from "./api.js";
import { S, audio, MODE_ORDER, MODE_ICONS, ICON_PLAY, ICON_PAUSE } from "./state.js";
import { renderList } from "./render.js";
import { extractCover, resetAccent } from "./theme.js";
import { initWave } from "./visualizer.js";
import { loadLyric, updateLrc } from "./lyrics.js";
import { addRecent } from "./playlist.js";

export function playSong(song,idx,type){
  S.song=song;S.idx=idx;
  $("songName").textContent=song.title;$("songArtist").textContent=song.artist;
  var cv=$("coverImg"),ph=$("coverPlaceholder");
  if(song.cover){cv.src=song.cover;cv.style.display="block";ph.style.display="none";cv.classList.remove("animate-in");void cv.offsetWidth;cv.classList.add("animate-in");extractCover(song.cover)}
  else{cv.style.display="none";ph.style.display="flex";resetAccent()}
  document.querySelectorAll(".track-row").forEach(function(el){el.classList.toggle("playing",el.dataset.index==idx&&el.dataset.type==type)});
  toast("正在加载...");
  if(S.tab==="playlist")renderList(S.pl,"playlist");
  else if(S.tab==="recent")renderList(S.recent,"recent");
  fallback(song,function(e,u){
    if(e||!u){toast("获取播放链接失败");autoNextOnFail();return}
    var go=function(){audio.src="/audio-proxy/?url="+encodeURIComponent(u);audio.playbackRate=S.speed;initWave();audio.play().then(function(){S.play=true;updatePlayBtn();fadeIn();toast("正在播放: "+song.title);addRecent(song);loadLyric(song)}).catch(function(er){toast("播放失败")})};
    if(S.play&&!audio.paused)fadeOut(go);else go()
  });
  $("btnPrev").disabled=!S.song;$("btnNext").disabled=!S.song
}
export function togglePlay(){if(!S.song)return;if(audio.paused){audio.play();S.play=true}else{audio.pause();S.play=false}updatePlayBtn()}
export function playPrev(){var l=curList();if(!l.length)return;var i=S.idx-1;if(i<0)i=l.length-1;playSong(l[i],i,S.tab)}
export function playNext(){var l=curList();if(!l.length)return;var i;if(S.mode==="single")i=S.idx;else if(S.mode==="shuffle")i=Math.floor(Math.random()*l.length);else if(S.mode==="loop"){i=S.idx+1;if(i>=l.length)i=0}else{i=S.idx+1;if(i>=l.length)return}playSong(l[i],i,S.tab)}
export function skip(s){if(audio.src)audio.currentTime+=s}
export function curList(){switch(S.tab){case "search":return S.results;case "playlist":return S.pl;case "recent":return S.recent;default:return[]}}
// 三个源全部失败时自动切下一首（单曲循环或队列末尾不切）
export function autoNextOnFail(){if(S.mode==="single"||S.idx<0)return;var l=curList();if(!l.length||l.length<=1)return;playNext()}

// 三源自动切换
export function fallback(song,cb){var src=[song.source];["kg","ne","bl"].forEach(function(s){if(s!==song.source)src.push(s)});var i=0;(function next(){if(i>=src.length){cb(new Error("fail"));return}api("/api/song/url?id="+song.id+"&source="+src[i],function(e,d){if(!e&&d&&d.url)cb(null,d.url);else{i++;next()}})})()}

// 切歌渐入渐出
var fTimer=null;
export function fadeOut(cb){if(!S.play||audio.paused){if(cb)cb();return}var sv=audio.volume,st=15,tt=200/st,s=0;clearInterval(fTimer);fTimer=setInterval(function(){s++;audio.volume=sv*(1-s/st);if(s>=st){clearInterval(fTimer);audio.volume=0;if(cb)cb()}},tt)}
export function fadeIn(v){v=v||S.prevVol||0.8;audio.volume=0;var st=15,tt=200/st,s=0;clearInterval(fTimer);fTimer=setInterval(function(){s++;audio.volume=v*(s/st);if(s>=st){clearInterval(fTimer);audio.volume=v}},tt)}

// 播放模式 / 倍速 / 音量
export function cycleMode(){var i=MODE_ORDER.indexOf(S.mode);S.mode=MODE_ORDER[(i+1)%MODE_ORDER.length];try{localStorage.setItem("melody_mode",S.mode)}catch(e){}toast(MODE_LABELS[S.mode]);$("btnMode").innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'+MODE_ICONS[S.mode]+'</svg>'}
export function setSpeed(s){S.speed=s;audio.playbackRate=s;$("speedBadge").textContent=s+"x";$("speedBadge").classList.toggle("active",s!==1);$("speedMenu").classList.remove("show")}
export function toggleSpeed(){var m=$("speedMenu"),b=$("speedBadge"),r=b.getBoundingClientRect();m.style.left=r.left+"px";m.style.bottom=(window.innerHeight-r.top+8)+"px";m.style.top="auto";m.classList.toggle("show")}
export function setVol(v){audio.volume=v;$("volumeSlider").value=v*100;S.muted=v===0;try{localStorage.setItem("melody_vol",v)}catch(e){}updateVolIcon()}
export function toggleMute(){if(S.muted){setVol(S.prevVol||0.8)}else{S.prevVol=audio.volume;setVol(0)}}
export function updateVolIcon(){var i=$("volumeIcon");if(S.muted||audio.volume===0){i.classList.add("muted");i.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'}else{i.classList.remove("muted");i.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'}}

// 进度条拖拽
export var isDrag=false,wasP=false;
export function onPD(e){isDrag=true;wasP=!audio.paused;audio.pause();seekTo(e);$("progressBar").classList.add("dragging")}
export function onPM(e){if(!isDrag)return;seekTo(e);var p=getPct(e);$("timeDisplay").textContent=fmt(p*(audio.duration||0))+" / "+fmt(audio.duration);var pf=$("progressFill");if(pf)pf.setAttribute("data-time",fmt(p*(audio.duration||0)))}
export function onPU(){if(!isDrag)return;isDrag=false;if(wasP)audio.play();$("progressBar").classList.remove("dragging")}
export function getPct(e){var b=$("progressBar"),r=b.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))}
export function seekTo(e){var p=getPct(e);if(audio.duration)audio.currentTime=p*audio.duration}

// 播放按钮/进度更新
export function updatePlayBtn(){var ic=$("playIcon"),b=$("btnPlay"),fi=$("ilPlayIcon"),fb=$("ilPlayBtn");if(S.play){ic.innerHTML=ICON_PAUSE;b.classList.add("playing");if(fi)fi.innerHTML=ICON_PAUSE;if(fb)fb.classList.add("playing")}else{ic.innerHTML=ICON_PLAY;b.classList.remove("playing");if(fi)fi.innerHTML=ICON_PLAY;if(fb)fb.classList.remove("playing")}}
export function updateProgress(){if(!audio.duration)return;if(isDrag)return;var p=(audio.currentTime/audio.duration)*100;$("progressFill").style.width=p+"%";$("timeDisplay").textContent=fmt(audio.currentTime)+" / "+fmt(audio.duration);var ilf=$("ilProgressFill");if(ilf)ilf.style.width=p+"%";updateLrc(audio.currentTime)}

// 播放相关事件绑定
export function initPlayerEvents(){
  $("progressBar").addEventListener("mousedown",onPD);
  document.addEventListener("mousemove",onPM);
  document.addEventListener("mouseup",onPU);
  $("ilProgress").addEventListener("mousedown",function(e){isDrag=true;wasP=!audio.paused;audio.pause();seekTo(e)});
  $("volumeSlider").addEventListener("input",function(e){setVol(e.target.value/100)});
}
