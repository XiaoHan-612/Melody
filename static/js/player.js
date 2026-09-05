// player.js — 播放服务（队列/播放/切歌/淡入淡出/失败处理/控制）
// 服务层：只改状态（setState）与音频元素，不 import 任何视图模块；
// UI 同步由 app.js 中的 store 订阅驱动。
import { $, toast, fmt, esc } from "./utils.js";
import { api } from "./api.js";
import { S, audio, listFor, MODE_LABELS, MODE_ORDER, MODE_ICONS, ICON_PLAY, ICON_PAUSE } from "./state.js";
import { setState } from "./store.js";
import { initWave } from "./visualizer.js";
import { loadLyric, updateLrc } from "./lyrics.js";
import { addRecent } from "./playlist.js";

// 播放（type="queue" 表示直接使用当前队列；否则从对应列表重建队列）
// autoPlay=false 用于续播恢复：载入歌曲但不自动出声
export function playSong(song,idx,type,keepQueue,autoPlay){
  autoPlay=autoPlay!==false;
  if(type==="queue"&&S.queue.length){
    var qi=idx>=0?idx:S.qi;
    if(qi<0)qi=0;
    setState({qi:qi});
  }else if(!keepQueue){
    var list=listFor(type);
    var q=(list||[]).slice();
    qi=Math.max(0,idx);
    if(q.length&&qi>=q.length)qi=q.length-1;
    setState({queue:q,qi:qi});
  }else{
    setState({qi:Math.max(0,idx)});
  }
  if(!S.queue.length)setState({queue:[song],qi:0});
  setState({song:song});
  var sn=$("songName");sn.innerHTML=esc(song.title);sn.classList.remove("marquee");void sn.offsetWidth;
  if(sn.scrollWidth>sn.clientWidth){sn.innerHTML=esc(song.title)+'<span style="display:inline-block;width:48px"></span>'+esc(song.title);sn.classList.add("marquee")}
  $("songArtist").textContent=song.artist;
  markPlayingRow(idx,type);
  toast("正在加载...");
  fallback(song,function(e,u){
    if(e||!u){toast("获取播放链接失败");autoNextOnFail();return}
    var go=function(){
      audio.src="/audio-proxy/?url="+encodeURIComponent(u);
      audio.playbackRate=S.speed;
      initWave();
      if(!autoPlay){setState({play:false});return}
      audio.play().then(function(){
        setState({play:true});fadeIn();toast("正在播放: "+song.title);addRecent(song);loadLyric(song);
      }).catch(function(){toast("播放失败")});
    };
    if(S.play&&!audio.paused)fadeOut(go);else go()
  });
  $("btnPrev").disabled=!S.song;$("btnNext").disabled=!S.song
}
// 正在播放行高亮（就地 class 切换，不重建列表）
export function markPlayingRow(idx,type){
  document.querySelectorAll(".track-row").forEach(function(el){el.classList.toggle("playing",el.dataset.index==idx&&el.dataset.type==type)});
}
export function togglePlay(){if(!S.song)return;if(audio.paused){audio.play().catch(function(){});setState({play:true})}else{audio.pause();setState({play:false})}}
export function playPrev(){var l=S.queue;if(!l.length)return;var i=S.qi-1;if(i<0)i=l.length-1;playSong(l[i],i,"queue",true)}
export function playNext(){var l=S.queue;if(!l.length)return;var i;if(S.mode==="single")i=S.qi;else if(S.mode==="shuffle")i=Math.floor(Math.random()*l.length);else if(S.mode==="loop"){i=S.qi+1;if(i>=l.length)i=0}else{i=S.qi+1;if(i>=l.length)return}playSong(l[i],i,"queue",true)}
export function skip(s){if(audio.src)audio.currentTime+=s}
// 三个源全部失败时自动切下一首（单曲循环或队列末尾不切）
export function autoNextOnFail(){if(S.mode==="single"||S.qi<0)return;var l=S.queue;if(!l.length||l.length<=1)return;playNext()}

// "下一首播放"：插入到当前曲目之后
export function playNextInsert(song){
  var q=S.queue.slice();
  q.splice(S.qi+1,0,song);
  setState({queue:q});
  toast("已加入下一首播放");
}
export function clearQueue(){setState({queue:[],qi:-1});toast("已清空队列")}
// 队列拖拽重排（供视图层拖拽处理器调用）
export function reorderQueue(from,to){
  if(from===to||from<0||to<0||from>=S.queue.length||to>=S.queue.length)return;
  var q=S.queue.slice();
  var item=q.splice(from,1)[0];
  q.splice(to,0,item);
  var qi=S.qi;
  if(from===S.qi)qi=to;
  else if(from<S.qi&&to>=S.qi)qi=S.qi-1;
  else if(from>S.qi&&to<=S.qi)qi=S.qi+1;
  setState({queue:q,qi:qi});
}
// 从队列移除
export function removeFromQueue(i){
  var q=S.queue.slice();
  q.splice(i,1);
  var qi=S.qi;
  if(i<qi)qi--;
  if(qi>=q.length)qi=q.length-1;
  if(qi<0)qi=-1;
  setState({queue:q,qi:qi});
  toast("已从队列移除");
}

// 三源自动切换（同时供"复制播放链接"使用，保证拿到的是可播链接）
export function resolveSongURL(song,cb){return fallback(song,cb)}
export function fallback(song,cb){var src=[song.source];["kg","ne","bl"].forEach(function(s){if(s!==song.source)src.push(s)});var i=0;(function next(){if(i>=src.length){cb(new Error("fail"));return}api("/api/song/url?id="+song.id+"&source="+src[i],function(e,d){if(!e&&d&&d.url)cb(null,d.url);else{i++;next()}})})()}

// 切歌渐入渐出（淡出前记住起始音量，淡入时恢复它，避免切歌后音量掉到 0）
var fTimer=null, fadeFromVol=null;
export function fadeOut(cb){if(!S.play||audio.paused){if(cb)cb();return}var sv=audio.volume;fadeFromVol=sv;var st=15,tt=200/st,s=0;clearInterval(fTimer);fTimer=setInterval(function(){s++;audio.volume=sv*(1-s/st);if(s>=st){clearInterval(fTimer);audio.volume=0;if(cb)cb()}},tt)}
export function fadeIn(v){
  if(v==null)v=(fadeFromVol!=null)?fadeFromVol:audio.volume;
  fadeFromVol=null;
  if(v<0.05)v=0.05; // 防止无声音；正常音量保持用户值
  audio.volume=0;
  var st=15,tt=200/st,s=0;clearInterval(fTimer);fTimer=setInterval(function(){s++;audio.volume=v*(s/st);if(s>=st){clearInterval(fTimer);audio.volume=v}},tt)
}

// 播放模式 / 倍速 / 音量
export function cycleMode(){var i=MODE_ORDER.indexOf(S.mode);var mode=MODE_ORDER[(i+1)%MODE_ORDER.length];setState({mode:mode});try{localStorage.setItem("melody_mode",mode)}catch(e){}toast(MODE_LABELS[mode]);$("btnMode").innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'+MODE_ICONS[mode]+'</svg>'}
export function setSpeed(s){setState({speed:s});audio.playbackRate=s;$("speedBadge").textContent=s+"x";$("speedBadge").classList.toggle("active",s!==1);$("speedMenu").classList.remove("show")}
export function toggleSpeed(){var m=$("speedMenu"),b=$("speedBadge"),r=b.getBoundingClientRect();m.style.left=r.left+"px";m.style.bottom=(window.innerHeight-r.top+8)+"px";m.style.top="auto";m.classList.toggle("show")}
export function setVol(v){audio.volume=v;$("volumeSlider").value=v*100;setState({muted:v===0,prevVol:v||S.prevVol});try{localStorage.setItem("melody_vol",v)}catch(e){}updateVolIcon()}
export function toggleMute(){if(S.muted){setVol(S.prevVol||0.8)}else{setState({prevVol:audio.volume});setVol(0)}}
export function updateVolIcon(){var i=$("volumeIcon");if(S.muted||audio.volume===0){i.classList.add("muted");i.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>'}else{i.classList.remove("muted");i.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>'}}

// 进度条拖拽
export var isDrag=false,wasP=false;
export function onPD(e){isDrag=true;wasP=!audio.paused;audio.pause();seekTo(e);$("progressBar").classList.add("dragging")}
export function onPM(e){if(!isDrag)return;var p=getPct(e);seekTo(e);$("timeDisplay").textContent=fmt(p*(audio.duration||0))+" / "+fmt(audio.duration);var pf=$("progressFill");if(pf)pf.style.width=(p*100)+"%";if(pf)pf.setAttribute("data-time",fmt(p*(audio.duration||0)))}
export function onPU(){if(!isDrag)return;isDrag=false;if(wasP)audio.play();$("progressBar").classList.remove("dragging")}
export function getPct(e){var b=$("progressBar"),r=b.getBoundingClientRect();return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))}
export function seekTo(e){var p=getPct(e);if(isFinite(audio.duration)&&audio.duration>0)audio.currentTime=p*audio.duration}

// 播放按钮/进度更新（同时同步唱片旋转状态）
export function updatePlayBtn(){var ic=$("playIcon"),b=$("btnPlay"),fi=$("ilPlayIcon"),fb=$("ilPlayBtn"),cv=$("coverImg");if(S.play){ic.innerHTML=ICON_PAUSE;b.classList.add("playing");if(cv){cv.classList.add("spin");cv.classList.remove("paused")}if(fi)fi.innerHTML=ICON_PAUSE;if(fb)fb.classList.add("playing")}else{ic.innerHTML=ICON_PLAY;b.classList.remove("playing");if(cv){cv.classList.add("paused")}if(fi)fi.innerHTML=ICON_PLAY;if(fb)fb.classList.remove("playing")}}

// 进度更新：歌词高亮不受时长未就绪影响（流媒体 duration 可能为 Infinity/NaN）
export function updateProgress(){
  var t=audio.currentTime;
  updateLrc(t);
  saveResume();
  if(!isFinite(audio.duration)||!audio.duration||isDrag)return;
  var p=(t/audio.duration)*100;
  $("progressFill").style.width=p+"%";
  $("timeDisplay").textContent=fmt(t)+" / "+fmt(audio.duration);
  var ilf=$("ilProgressFill");if(ilf)ilf.style.width=p+"%";
}

// 重启续播：节流保存播放位置（5 秒一次）
var lastSaveTs=0;
function saveResume(){
  if(!S.song||audio.currentTime<5)return;
  if(Date.now()-lastSaveTs<5000)return;
  lastSaveTs=Date.now();
  try{localStorage.setItem("melody_resume",JSON.stringify({song:S.song,pos:audio.currentTime,ts:Date.now()}))}catch(e){}
}
export function tryResume(){
  try{
    var r=JSON.parse(localStorage.getItem("melody_resume"));
    if(!r||!r.song||!isFinite(r.pos))return;
    if(Date.now()-r.ts>24*3600*1000)return; // 超过 24 小时不续播
    playSong(r.song,-1,"queue",false,false); // 恢复但不自动播放
    var tries=0,iv=setInterval(function(){
      tries++;
      if(audio.duration&&isFinite(audio.duration)){
        audio.currentTime=Math.min(r.pos,Math.max(0,audio.duration-2));
        clearInterval(iv);toast("已恢复上次播放位置（已暂停）");
      }else if(tries>40){clearInterval(iv)}
    },250);
  }catch(e){}
}

// 播放相关事件绑定
export function initPlayerEvents(){
  $("progressBar").addEventListener("mousedown",onPD);
  document.addEventListener("mousemove",onPM);
  document.addEventListener("mouseup",onPU);
  $("ilProgress").addEventListener("mousedown",function(e){isDrag=true;wasP=!audio.paused;audio.pause();seekTo(e)});
  $("volumeSlider").addEventListener("input",function(e){setVol(e.target.value/100)});
  // 滚轮调音量（悬停音量区域）
  var vw=$("volumeWrap");
  if(vw)vw.addEventListener("wheel",function(e){
    e.preventDefault();
    setVol(Math.max(0,Math.min(1,audio.volume+(e.deltaY<0?0.05:-0.05))));
  },{passive:false});
}
