// lyrics.js — 歌词（加载/解析/渲染 + 全屏歌词）
import { $, esc, toast } from "./utils.js";
import { api } from "./api.js";
import { S, audio } from "./state.js";
import { analyser, freqData } from "./visualizer.js";

export var transLines=[],showTrans=true;

export function loadLyric(song){S.lyricOff=0;transLines=[];api("/api/song/lyric?id="+song.id+"&source="+song.source,function(e,d){var lrc=(d&&(d.lrc||d.qrc))||"";var tlrc=(d&&d.tlrc)||"";if(!lrc.trim()&&song.source==="bl"){api("/api/song/lyric/search?title="+encodeURIComponent(song.title)+"&artist="+encodeURIComponent(song.artist),function(e2,d2){var l2=(d2&&(d2.lrc||d2.qrc))||"",t2=(d2&&d2.tlrc)||"";if(l2.trim()){S.lines=parseLrc(l2);transLines=parseLrc(t2);S.lyricIdx=-1;renderLrc();toast("已匹配歌词")}else showLrcEmpty()})}else if(lrc.trim()){S.lines=parseLrc(lrc);transLines=parseLrc(tlrc);S.lyricIdx=-1;renderLrc()}else showLrcEmpty()})}
export function parseLrc(t){var ls=[],re=/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g,m;while((m=re.exec(t))!==null){var ms=parseInt(m[3]);if(m[3].length===2)ms*=10;var tm=parseInt(m[1])*60+parseInt(m[2])+ms/1000;var c=m[4].trim();if(c)ls.push({time:tm,text:c})}ls.sort(function(a,b){return a.time-b.time});return ls}
export function renderLrc(){var b=$("lyricBody");if(!S.lines.length){showLrcEmpty();return}var h="";S.lines.forEach(function(l,i){h+='<div class="lyric-line" data-index="'+i+'"><span class="text">'+esc(l.text)+'</span>';if(showTrans&&transLines.length){var tr=findTr(l.time);if(tr)h+='<div class="translation">'+esc(tr)+'</div>'}h+='</div>'});b.innerHTML=h}
export function findTr(time){var best=null,bd=Infinity;for(var i=0;i<transLines.length;i++){var d=Math.abs(transLines[i].time-time);if(d<bd&&d<1){bd=d;best=transLines[i].text}}return best}
export function showLrcEmpty(){$("lyricBody").innerHTML='<div class="lyric-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h12M4 18h8"/></svg><span>暂无歌词</span></div>'}
export function updateLrc(time){var adj=time-S.lyricOff,idx=-1;for(var i=0;i<S.lines.length;i++){if(S.lines[i].time<=adj)idx=i;else break}if(idx===S.lyricIdx)return;S.lyricIdx=idx;document.querySelectorAll("#lyricBody .lyric-line").forEach(function(el,i){el.classList.toggle("active",i===idx)});if(idx>=0){var el=document.querySelector("#lyricBody .lyric-line[data-index='"+idx+"']");if(el)el.scrollIntoView({behavior:"smooth",block:"center"})}renderIL()}
export function renderIL(){var tl=$("ilTitle"),al=$("ilArtist");if(S.song){tl.textContent=S.song.title;al.textContent=S.song.artist}}
export function toggleTrans(){showTrans=!showTrans;renderLrc();var b=$("btnTranslation"),bf=$("ilTransBtn");if(b)b.style.color=showTrans?"var(--accent)":"";if(bf)bf.classList.toggle("active",showTrans);toast(showTrans?"显示翻译":"隐藏翻译")}
export function adjustOff(d){S.lyricOff+=d;var ds=$("lyricOffsetDisplay");if(ds)ds.textContent=S.lyricOff.toFixed(1)+"s";toast("歌词偏移: "+S.lyricOff.toFixed(1)+"s")}
export function updateLyricProgress(){if(S.lyricIdx<0||!S.lines.length)return;var cur=S.lines[S.lyricIdx],nx=S.lines[S.lyricIdx+1];var dur=nx?(nx.time-cur.time):((audio.duration||0)-cur.time);if(dur<=0)dur=1;var el=(audio.currentTime-S.lyricOff-cur.time)/dur*100;el=Math.max(0,Math.min(100,el));var side=document.querySelector("#lyricBody .lyric-line.active .text");if(side)side.style.setProperty("--progress",el+"%")}

// ── 全屏歌词 ──
export function openLyrics(){S.lyricsOpen=true;var il=$("immersiveLyrics");if(S.song){$("ilTitle").textContent=S.song.title;$("ilArtist").textContent=S.song.artist;var bg=$("ilBg");if(S.song.cover)bg.style.backgroundImage="url("+S.song.cover+")";else bg.style.backgroundImage="none"}renderIL();il.classList.add("show");if(!ilCv)initIL();setTimeout(function(){if(ilCv){ilCv.width=ilCv.parentElement.clientWidth;ilCv.height=ilCv.parentElement.clientHeight}},100)}
export function closeLyrics(){S.lyricsOpen=false;$("immersiveLyrics").classList.remove("show")}
export function toggleLyricPanel(){S.lyricVis=!S.lyricVis;$("lyricPanel").style.display=S.lyricVis?"flex":"none";var b=$("btnLyric");if(b)b.classList.toggle("active",S.lyricVis)}

// ── 全屏歌词 Canvas 渲染 ──
export var ilCtx,ilCv,ilFade=1,ilLastIdx=-2;
export function initIL(){ilCv=$("ilCanvas");if(ilCv)ilCtx=ilCv.getContext("2d")}
export function drawIL(){
  if(!ilCtx||!S.lyricsOpen)return;
  var w=ilCv.width=ilCv.parentElement.clientWidth;
  var h=ilCv.height=ilCv.parentElement.clientHeight;
  if(w<10||h<10)return;
  var ctx=ilCtx,t=Date.now()*.001;
  ctx.clearRect(0,0,w,h);
  if(!S.lines.length)return;
  var allLines=S.lines,ci=S.lyricIdx;

  // Fade transition on lyric change
  if(ci!==ilLastIdx){ilLastIdx=ci;ilFade=0}
  if(ilFade<1)ilFade=Math.min(1,ilFade+0.025); // ~40 frames to full
  ctx.save();ctx.globalAlpha=ilFade;

  // ═══ 1. Audio visualizer — smooth bottom equalizer ═══
  if(analyser&&freqData){
    analyser.getByteFrequencyData(freqData);
    var bass=0;for(var i=0;i<8;i++)bass+=freqData[i];bass=bass/8/255;
    var barCount=80;
    var barW=w/barCount;
    ctx.save();
    for(var i=0;i<barCount;i++){
      var fval=freqData[Math.floor((i/barCount)*64)]/255;
      var barH=Math.max(1,fval*h*0.25);
      var x=i*barW;
      var y=h-barH;
      var grad=ctx.createLinearGradient(x,h,x,y);
      grad.addColorStop(0,"rgba(0,122,255,0.03)");
      grad.addColorStop(0.5,"rgba(0,122,255,"+fval*0.2+")");
      grad.addColorStop(1,"rgba(80,180,255,"+fval*0.4+")");
      ctx.fillStyle=grad;
      ctx.globalAlpha=0.5+fval*0.5;
      ctx.fillRect(x+1,y,barW-2,barH);
    }
    ctx.restore();
    var glow=ctx.createLinearGradient(0,h,0,h-60);
    glow.addColorStop(0,"rgba(0,122,255,"+(0.04+bass*0.08)+")");
    glow.addColorStop(1,"rgba(0,122,255,0)");
    ctx.fillStyle=glow;ctx.fillRect(0,h-60,w,60);
  }

  // ═══ 2. Background lyrics as stars ═══
  for(var i=0;i<allLines.length;i++){
    if(ci>=0&&Math.abs(i-ci)<=2)continue;
    var seed=i*7919;
    var px=(Math.sin(seed)*0.44+0.5)*w;
    var py=(Math.cos(seed*1.3)*0.42+0.5)*h;
    var twinkle=0.6+Math.sin(t*2+i*3.7)*0.4;
    var sizeSeed=Math.abs(Math.sin(seed*13));
    var fs=13+sizeSeed*16;
    var alpha=0.35*twinkle;
    if(alpha<0.02)continue;
    ctx.save();
    ctx.font=(sizeSeed>0.5?"600 ":"400 ")+fs+"px -apple-system,'PingFang SC',sans-serif";
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.globalAlpha=alpha;
    ctx.fillStyle="rgba(143,220,255,0.65)";
    ctx.fillText(allLines[i].text,px,py);
    ctx.restore();
  }

  // Sparkles
  for(var i=0;i<25;i++){
    var seed=i*3571;
    var sx=(Math.sin(seed+t*0.5)*0.48+0.5)*w;
    var sy=(Math.cos(seed*1.7+t*0.35)*0.45+0.5)*h;
    var sa=0.1+Math.sin(t*3+seed)*0.08;
    var sr=1.2+Math.sin(t*2+seed)*0.6;
    ctx.beginPath();ctx.arc(sx,sy,sr,0,6.28);
    ctx.fillStyle="rgba(180,230,255,"+sa+")";ctx.fill();
  }

  // ═══ 3. Active lyric — smooth per-char ═══
  if(ci<0||ci>=allLines.length)return;
  var curLine=allLines[ci];
  var lineStart=curLine.time;
  var nextLine=allLines[ci+1];
  var lineEnd=nextLine?nextLine.time:(audio.duration||lineStart+5);
  var lineDur=lineEnd-lineStart;
  var charProg=0;
  if(lineDur>0)charProg=Math.max(0,Math.min(1,(audio.currentTime-S.lyricOff-lineStart)/lineDur));

  var text=curLine.text;
  var fontSize=Math.min(68,Math.max(32,w/(text.length*0.55)));
  ctx.save();ctx.font="700 "+fontSize+"px -apple-system,'PingFang SC',sans-serif";
  ctx.textAlign="center";ctx.textBaseline="middle";
  var chars=text.split("");var widths=[];var totalW=0;
  for(var i=0;i<chars.length;i++){var cw=ctx.measureText(chars[i]).width;widths.push(cw);totalW+=cw}
  var startX=(w-totalW)/2;var x=startX;
  for(var i=0;i<chars.length;i++){
    var diff=charProg-(i/chars.length);
    var brightness;if(diff>=0)brightness=Math.max(0.15,1-diff*3);else brightness=Math.max(0.15,1+diff*2.5);
    brightness=Math.min(1,brightness);
    brightness=brightness*brightness*(3-2*brightness);
    ctx.save();
    var rr=Math.round(100+155*brightness);
    var gg=Math.round(190+65*brightness);
    ctx.fillStyle="rgba("+rr+","+gg+",255,"+(0.15+brightness*0.85)+")";
    ctx.shadowBlur=brightness*30;
    ctx.shadowColor="rgba(0,122,255,"+brightness*0.8+")";
    ctx.fillText(chars[i],x+widths[i]/2,h*.4);
    ctx.restore();x+=widths[i];
  }
  ctx.restore();

  // ═══ 4. Translation — per-char highlight ═══
  if(showTrans&&transLines.length){
    var trText=findTr(curLine.time);
    if(trText){
      var trFs=Math.min(22,Math.max(14,w/(trText.length*0.6)));
      ctx.save();ctx.font="400 "+trFs+"px -apple-system,'PingFang SC',sans-serif";
      ctx.textAlign="center";ctx.textBaseline="middle";
      var trChars=trText.split("");var trWidths=[];var trTotal=0;
      for(var i=0;i<trChars.length;i++){var tw=ctx.measureText(trChars[i]).width;trWidths.push(tw);trTotal+=tw}
      var trX=(w-trTotal)/2;
      for(var i=0;i<trChars.length;i++){
        var diff=charProg-(i/trChars.length);
        var br;if(diff>=0)br=Math.max(0.1,1-diff*3);else br=Math.max(0.1,1+diff*2.5);
        br=Math.min(1,br);br=br*br*(3-2*br);
        ctx.save();
        var rr=Math.round(100+155*br);var gg=Math.round(180+75*br);
        ctx.fillStyle="rgba("+rr+","+gg+",255,"+(0.1+br*0.6)+")";
        ctx.shadowBlur=br*15;ctx.shadowColor="rgba(0,122,255,"+br*0.5+")";
        ctx.fillText(trChars[i],trX+trWidths[i]/2,h*.4+fontSize*.7);
        ctx.restore();trX+=trWidths[i];
      }
      ctx.restore();
    }
  }

  // ═══ 5. Next line preview ═══
  if(ci+1<allLines.length){
    var nx=allLines[ci+1];
    ctx.save();ctx.font="400 "+Math.min(18,Math.max(13,w/(nx.text.length*0.7)))+"px -apple-system,'PingFang SC',sans-serif";
    ctx.textAlign="center";ctx.textBaseline="middle";
    ctx.globalAlpha=0.12;ctx.fillStyle="rgba(168,246,255,0.5)";
    ctx.fillText(nx.text,w/2,h*.75);ctx.restore();
  }
  ctx.restore(); // close fade alpha
}
