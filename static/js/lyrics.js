// lyrics.js — 歌词（加载/解析/渲染 + 全屏歌词 v2）
import { $, esc, toast } from "./utils.js";
import { api } from "./api.js";
import { S, audio } from "./state.js";
import { analyser, freqData } from "./visualizer.js";
import { togglePlay } from "./player.js";

export var transLines=[],showTrans=true;

export function loadLyric(song){S.lyricOff=0;transLines=[];S.qrc=null;api("/api/song/lyric?id="+song.id+"&source="+song.source,function(e,d){var lrc=(d&&(d.lrc||d.qrc))||"";var tlrc=(d&&d.tlrc)||"";var qrc=(d&&d.qrc)||"";if(!lrc.trim()&&song.source==="bl"){api("/api/song/lyric/search?title="+encodeURIComponent(song.title)+"&artist="+encodeURIComponent(song.artist),function(e2,d2){var l2=(d2&&(d2.lrc||d2.qrc))||"",t2=(d2&&d2.tlrc)||"";if(l2.trim()){S.lines=parseLrc(l2);transLines=parseLrc(t2);S.lyricIdx=-1;renderLrc();toast("已匹配歌词")}else showLrcEmpty()})}else if(lrc.trim()){S.lines=parseLrc(lrc);transLines=parseLrc(tlrc);S.qrc=parseQrc(qrc);S.lyricIdx=-1;renderLrc()}else showLrcEmpty()})}
export function parseLrc(t){var ls=[],re=/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g,m;while((m=re.exec(t))!==null){var ms=parseInt(m[3]);if(m[3].length===2)ms*=10;var tm=parseInt(m[1])*60+parseInt(m[2])+ms/1000;var c=m[4].trim();if(c)ls.push({time:tm,text:c})}ls.sort(function(a,b){return a.time-b.time});return ls}
// 逐字歌词（QRC）："[mm:ss.xx]字" 序列；解析失败返回 null（回退行内均分）
export function parseQrc(t){if(!t)return null;var ls=[],re=/\[(\d{2}):(\d{2})\.(\d{2,3})\](.)/g,m;while((m=re.exec(t))!==null){var ms=parseInt(m[3]);if(m[3].length===2)ms*=10;var tm=parseInt(m[1])*60+parseInt(m[2])+ms/1000;if(m[4]&&m[4].trim())ls.push({time:tm,ch:m[4]})}if(ls.length<8)return null;return ls}
export function renderLrc(){var b=$("lyricBody");if(!S.lines.length){showLrcEmpty();return}var h="";S.lines.forEach(function(l,i){h+='<div class="lyric-line" data-index="'+i+'"><span class="text">'+esc(l.text)+'</span>';if(showTrans&&transLines.length){var tr=findTr(l.time);if(tr)h+='<div class="translation">'+esc(tr)+'</div>'}h+='</div>'});b.innerHTML=h;b.querySelectorAll(".lyric-line").forEach(function(el){el.addEventListener("click",function(){var idx=+el.dataset.index;if(audio.duration){audio.currentTime=S.lines[idx].time+S.lyricOff;updateLrc(audio.currentTime)}})})}
export function findTr(time){var best=null,bd=Infinity;for(var i=0;i<transLines.length;i++){var d=Math.abs(transLines[i].time-time);if(d<bd&&d<1){bd=d;best=transLines[i].text}}return best}
export function showLrcEmpty(){$("lyricBody").innerHTML='<div class="lyric-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h12M4 18h8"/></svg><span>暂无歌词</span></div>'}
export function updateLrc(time){var adj=time-S.lyricOff,idx=-1;for(var i=0;i<S.lines.length;i++){if(S.lines[i].time<=adj)idx=i;else break}if(idx===S.lyricIdx)return;S.lyricIdx=idx;document.querySelectorAll("#lyricBody .lyric-line").forEach(function(el,i){el.classList.toggle("active",i===idx)});if(idx>=0){var el=document.querySelector("#lyricBody .lyric-line[data-index='"+idx+"']");if(el)el.scrollIntoView({behavior:"smooth",block:"center"})}setActiveLine(idx)}
export function renderIL(){var tl=$("ilTitle"),al=$("ilArtist");if(S.song){tl.textContent=S.song.title;al.textContent=S.song.artist}}
export function toggleTrans(){showTrans=!showTrans;renderLrc();var b=$("btnTranslation"),bf=$("ilTransBtn");if(b)b.style.color=showTrans?"var(--accent)":"";if(bf)bf.classList.toggle("active",showTrans);if(S.lyricsOpen){renderILLyrics();setActiveLine(S.lyricIdx)}toast(showTrans?"显示翻译":"隐藏翻译")}
export function adjustOff(d){S.lyricOff+=d;var ds=$("lyricOffsetDisplay");if(ds)ds.textContent=S.lyricOff.toFixed(1)+"s";toast("歌词偏移: "+S.lyricOff.toFixed(1)+"s")}
export function updateLyricProgress(){if(S.lyricIdx<0||!S.lines.length)return;var cur=S.lines[S.lyricIdx],nx=S.lines[S.lyricIdx+1];var dur=nx?(nx.time-cur.time):((audio.duration||0)-cur.time);if(dur<=0)dur=1;var el=(audio.currentTime-S.lyricOff-cur.time)/dur*100;el=Math.max(0,Math.min(100,el));var side=document.querySelector("#lyricBody .lyric-line.active .text");if(side)side.style.setProperty("--progress",el+"%")}

// ═══════════════════════════════════════════
// 全屏歌词 v2（DOM 渲染 + Canvas 背景动效）
// ═══════════════════════════════════════════

var IL_MODES=["spec","pure","star"];
var IL_MODE_LABELS={spec:"频谱",pure:"纯净",star:"星空"};
var ilFollow=true,ilFollowTimer=null,ilMoveTimer=null;

// 渲染全部歌词行（3 行结构：前后行小字淡出）
export function renderILLyrics(){
  var c=$("ilLyrics");if(!c)return;
  var h="";
  S.lines.forEach(function(l,i){
    var tr=showTrans?findTr(l.time):null;
    h+='<div class="il-line" data-i="'+i+'"><div class="il-line-text"><span class="il-chars">'+esc(l.text)+"</span></div>"+(tr?'<div class="il-line-tr">'+esc(tr)+"</div>":"")+"</div>";
  });
  c.innerHTML=h;
  c.querySelectorAll(".il-line").forEach(function(el){
    el.addEventListener("click",function(ev){
      ev.stopPropagation();
      var i=+el.dataset.i;
      if(audio.duration){audio.currentTime=S.lines[i].time+S.lyricOff;updateLrc(audio.currentTime)}
    });
  });
}

// 激活行：高亮 + 拆字（逐字卡拉OK 数据源）
export function setActiveLine(idx){
  var c=$("ilLyrics");if(!c)return;
  c.querySelectorAll(".il-line").forEach(function(el,i){
    el.classList.toggle("active",i===idx);
    var ch=el.querySelector(".il-chars");
    if(ch&&!el.classList.contains("active")&&ch.dataset.chars){ch.textContent=S.lines[i].text;delete ch.dataset.chars}
  });
  if(idx>=0&&idx<S.lines.length){
    var act=c.querySelector('.il-line.active .il-chars');
    if(act&&!act.dataset.chars){
      var t=S.lines[idx].text,html="";
      for(var i=0;i<t.length;i++)html+="<span>"+esc(t[i])+"</span>";
      act.innerHTML=html;act.dataset.chars="1";
    }
  }
  if(ilFollow)followLyrics();
}

// 跟随模式：当前行滚动到视口中央
function followLyrics(){
  var c=$("ilLyrics");if(!c||S.lyricIdx<0)return;
  var el=c.querySelector('.il-line[data-i="'+S.lyricIdx+'"]');
  if(!el)return;
  var target=el.offsetTop-c.clientHeight/2+el.clientHeight/2;
  c.scrollTo({top:Math.max(0,target),behavior:"smooth"});
}

// 逐字卡拉OK：每帧更新当前行字符亮度（优先用 QRC 真实时间戳，回退行内均分）
export function updateILKaraoke(){
  if(!S.lyricsOpen||S.lyricIdx<0||!S.lines.length)return;
  var line=S.lines[S.lyricIdx],next=S.lines[S.lyricIdx+1];
  var dur=next?next.time-line.time:((audio.duration||0)-line.time);
  if(dur<=0)return;
  var el=document.querySelector("#ilLyrics .il-line.active .il-chars");
  if(!el||!el.children.length)return;
  var now=audio.currentTime-S.lyricOff;
  var n=el.children.length;

  // 方案一：QRC 逐字时间戳（字数与行文本接近才用）
  var qrc=S.qrc,useQrc=false;
  if(qrc&&qrc.length){
    var start=line.time,end=next?next.time:(audio.duration||line.time+5);
    var chs=[];
    for(var q=0;q<qrc.length;q++){if(qrc[q].time>=start&&qrc[q].time<end)chs.push(qrc[q])}
    if(chs.length>=Math.floor(n*0.6))useQrc=true;
  }

  for(var i=0;i<n;i++){
    var p;
    if(useQrc){
      var qt=chs[Math.min(i,chs.length-1)].time;
      p=(now-qt)/dur;
    }else{
      p=(now-line.time)/dur-i/n;
    }
    p=Math.max(0,Math.min(1,p));
    var d=useQrc?p:(p*1.6);
    var b=d>=1?1:(d<=0?0.22:0.22+d*0.78);
    var sp=el.children[i];
    sp.style.color=b>=0.98?"#fff":"rgba(255,255,255,"+(0.22+b*0.6).toFixed(2)+")";
    sp.style.textShadow=b>=0.92?"0 0 14px rgba(var(--accent-rgb),.55)":"none";
  }
}

// 背景模式循环切换
export function cycleILMode(){
  var i=IL_MODES.indexOf(S.ilMode||"spec");
  S.ilMode=IL_MODES[(i+1)%IL_MODES.length];
  try{localStorage.setItem("melody_ilmode",S.ilMode)}catch(e){}
  var btn=$("ilModeBtn");if(btn)btn.textContent="背景·"+IL_MODE_LABELS[S.ilMode];
  toast("背景模式: "+IL_MODE_LABELS[S.ilMode]);
}

// 字号调节（Ctrl+滚轮）
export function adjustILFont(delta){
  var cur=parseInt(document.documentElement.style.getPropertyValue("--il-fs-active"))||52;
  var a=Math.max(30,Math.min(110,cur+delta));
  document.documentElement.style.setProperty("--il-fs-active",a+"px");
  document.documentElement.style.setProperty("--il-fs",Math.round(a*0.62)+"px");
  try{localStorage.setItem("melody_ilfont",a)}catch(e){}
}

export function openLyrics(){
  S.lyricsOpen=true;ilFollow=true;
  var il=$("immersiveLyrics");
  if(S.song){
    $("ilTitle").textContent=S.song.title;$("ilArtist").textContent=S.song.artist;
    var bg=$("ilBg");if(S.song.cover)bg.style.backgroundImage="url("+S.song.cover+")";else bg.style.backgroundImage="none";
  }
  renderIL();
  renderILLyrics();
  setActiveLine(S.lyricIdx);
  var mb=$("ilModeBtn");if(mb)mb.textContent="背景·"+IL_MODE_LABELS[S.ilMode||"spec"];
  il.classList.add("show");
  if(!ilCv)initIL();
  setTimeout(function(){if(ilCv){ilCv.width=ilCv.parentElement.clientWidth;ilCv.height=ilCv.parentElement.clientHeight}},100);
}
export function closeLyrics(){S.lyricsOpen=false;$("immersiveLyrics").classList.remove("show")}
export function toggleLyricPanel(){S.lyricVis=!S.lyricVis;$("lyricPanel").style.display=S.lyricVis?"flex":"none";var b=$("btnLyric");if(b)b.classList.toggle("active",S.lyricVis)}

// ── 背景动效 Canvas（纯净档不绘制，频谱/星空档绘制）──
export var ilCtx,ilCv;
export function initIL(){ilCv=$("ilCanvas");if(ilCv)ilCtx=ilCv.getContext("2d")}
export function drawIL(){
  if(!ilCtx||!S.lyricsOpen)return;
  var mode=S.ilMode||"spec";
  if(mode==="pure")return;
  var w=ilCv.width=ilCv.parentElement.clientWidth;
  var h=ilCv.height=ilCv.parentElement.clientHeight;
  if(w<10||h<10)return;
  var ctx=ilCtx,t=Date.now()*.001;
  ctx.clearRect(0,0,w,h);
  // canvas 不支持 CSS 变量，读取当前主题强调色
  var accentRgb="0,122,255";
  try{var v=getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim();if(v)accentRgb=v}catch(e){}

  // 频谱：底部均衡器
  if(analyser&&freqData){
    analyser.getByteFrequencyData(freqData);
    var bass=0;for(var i=0;i<8;i++)bass+=freqData[i];bass=bass/8/255;
    var barCount=Math.min(120,Math.round(w/12));
    var barW=w/barCount;
    ctx.save();
    for(var i=0;i<barCount;i++){
      var fval=freqData[Math.floor((i/barCount)*64)]/255;
      var barH=Math.max(1,fval*h*0.22);
      var x=i*barW;
      var y=h-barH;
      var grad=ctx.createLinearGradient(x,h,x,y);
      grad.addColorStop(0,"rgba("+accentRgb+",0.03)");
      grad.addColorStop(0.5,"rgba("+accentRgb+",0.2)");
      grad.addColorStop(1,"rgba("+accentRgb+",0.4)");
      ctx.fillStyle=grad;
      ctx.globalAlpha=0.5+fval*0.5;
      ctx.fillRect(x+1,y,barW-2,barH);
    }
    ctx.restore();
    var glow=ctx.createLinearGradient(0,h,0,h-60);
    glow.addColorStop(0,"rgba("+accentRgb+","+(0.05+bass*0.09)+")");
    glow.addColorStop(1,"rgba("+accentRgb+",0)");
    ctx.fillStyle=glow;ctx.fillRect(0,h-60,w,60);
  }

  // 星空：歌词星尘 + 闪光粒子
  if(mode==="star"){
    var lines=S.lines,ci=S.lyricIdx;
    var maxStars=Math.min(lines.length,90);
    for(var i=0;i<maxStars;i++){
      var seed=i*7919;
      var px=(Math.sin(seed)*0.46+0.5)*w;
      var py=(Math.cos(seed*1.3)*0.42+0.5)*h*0.8;
      var twinkle=0.6+Math.sin(t*2+i*3.7)*0.4;
      var sizeSeed=Math.abs(Math.sin(seed*13));
      var fs=12+sizeSeed*14;
      var alpha=0.3*twinkle;
      if(alpha<0.02)continue;
      ctx.save();
      ctx.font=(sizeSeed>0.5?"600 ":"400 ")+fs+"px -apple-system,'PingFang SC',sans-serif";
      ctx.textAlign="center";ctx.textBaseline="middle";
      ctx.globalAlpha=alpha;
      ctx.fillStyle="rgba(143,220,255,0.6)";
      ctx.fillText(lines[i].text,px,py);
      ctx.restore();
    }
    for(var s=0;s<20;s++){
      var seed2=s*3571;
      var sx=(Math.sin(seed2+t*0.5)*0.48+0.5)*w;
      var sy=(Math.cos(seed2*1.7+t*0.35)*0.45+0.5)*h*0.8;
      var sa=0.1+Math.sin(t*3+seed2)*0.08;
      var sr=1.2+Math.sin(t*2+seed2)*0.6;
      ctx.beginPath();ctx.arc(sx,sy,sr,0,6.28);
      ctx.fillStyle="rgba(180,230,255,"+sa+")";ctx.fill();
    }
  }
}

// 全屏歌词事件绑定（跟随/浏览/自动隐藏/字号/背景切换）
export function initILEvents(){
  var il=$("immersiveLyrics"),lc=$("ilLyrics");
  if(!il||!lc)return;
  lc.addEventListener("wheel",function(e){
    if(e.ctrlKey)return;
    ilFollow=false;clearTimeout(ilFollowTimer);
    ilFollowTimer=setTimeout(function(){ilFollow=true;followLyrics()},2000);
  },{passive:true});
  il.addEventListener("mousemove",function(){
    il.classList.add("moving");
    clearTimeout(ilMoveTimer);
    ilMoveTimer=setTimeout(function(){il.classList.remove("moving")},3000);
  });
  il.addEventListener("wheel",function(e){
    if(e.ctrlKey){e.preventDefault();adjustILFont(e.deltaY>0?-4:4)}
  },{passive:false});
  $("ilBody").addEventListener("click",function(e){
    if(e.target.id==="ilBody"||e.target.id==="ilLyrics")togglePlay();
  });
}
