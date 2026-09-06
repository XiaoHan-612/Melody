// lyrics.js — 歌词（加载/解析/渲染 + 全屏歌词 v2）
// 歌词域内部字段（lines/qrc/lyricIdx/lyricOff/autoOffsetDone）为本模块私有时序数据，
// 直接读写 S；UI 开关（lyricsOpen/lyricVis/ilMode）走 setState。
import { $, esc, toast } from "./utils.js";
import { api } from "./api.js";
import { S, audio, smoothTime } from "./state.js";
import { setState } from "./store.js";
import { analyser, freqData } from "./visualizer.js";

export var transLines=[],showTrans=true;

export function loadLyric(song){S.lyricOff=0;S.autoOffsetDone=false;transLines=[];S.qrc=null;api("/api/song/lyric?id="+song.id+"&source="+song.source,function(e,d){var lrc=(d&&(d.lrc||d.qrc))||"";var tlrc=(d&&d.tlrc)||"";var qrc=(d&&d.qrc)||"";if(!lrc.trim()&&song.source==="bl"){api("/api/song/lyric/search?title="+encodeURIComponent(song.title)+"&artist="+encodeURIComponent(song.artist),function(e2,d2){var l2=(d2&&(d2.lrc||d2.qrc))||"",t2=(d2&&d2.tlrc)||"";if(l2.trim()){S.lines=parseLrc(l2);transLines=parseLrc(t2);alignMatchedLyrics();S.lyricIdx=-1;renderLrc();buildWordCloud();toast("已匹配歌词")}else{showLrcEmpty();toast("未找到这首歌的歌词")}})}else if(lrc.trim()){S.lines=parseLrc(lrc);transLines=parseLrc(tlrc);S.qrc=parseQrc(qrc);S.lyricIdx=-1;renderLrc();buildWordCloud()}else showLrcEmpty()})}

// 跨平台匹配的歌词（B站）时间轴可能与实际音频不一致：
// 若歌词总时长与实际音频时长偏差明显（>25%），按比例缩放对齐（同时对齐逐字时间轴）
function alignMatchedLyrics(){
  var dur=audio.duration;
  if(!isFinite(dur)||dur<=0||!S.lines.length)return;
  var last=S.lines[S.lines.length-1].time;
  if(last<=0)return;
  var ratio=dur/last;
  if(ratio<0.75||ratio>1.25){
    for(var i=0;i<S.lines.length;i++)S.lines[i].time*=ratio;
    if(transLines.length){for(var j=0;j<transLines.length;j++)transLines[j].time*=ratio}
    if(S.qrc&&S.qrc.length){for(var q=0;q<S.qrc.length;q++)S.qrc[q].time*=ratio}
    toast("已按音频时长对齐歌词");
  }
}

// 自动偏移：播放 15 秒后仍无任何行激活（全部歌词都在"未来"），
// 说明匹配歌词整体偏移（如视频有片头），把首行对齐到当前播放位置（同时平移逐字时间轴）
function autoOffsetLyrics(){
  if(S.autoOffsetDone)return;
  var t=audio.currentTime;
  if(t<15||!S.lines.length)return;
  var idx=-1;
  for(var i=0;i<S.lines.length;i++){if(S.lines[i].time<=t)idx=i;else break}
  if(idx>=0){S.autoOffsetDone=true;return}
  var first=S.lines[0].time;
  if(first>t){
    var delta=first-t;
    for(var j=0;j<S.lines.length;j++)S.lines[j].time-=delta;
    if(transLines.length){for(var k=0;k<transLines.length;k++)transLines[k].time-=delta}
    if(S.qrc&&S.qrc.length){for(var q=0;q<S.qrc.length;q++)S.qrc[q].time-=delta}
  }
  S.autoOffsetDone=true;
  toast("歌词时间已自动对齐");
}
export function parseLrc(t){var ls=[],re=/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/g,m;while((m=re.exec(t))!==null){var f=m[3]||"0",ms=parseInt(f);if(f.length===1)ms*=100;else if(f.length===2)ms*=10;var tm=parseInt(m[1])*60+parseInt(m[2])+ms/1000;var c=m[4].trim();if(c)ls.push({time:tm,text:c})}ls.sort(function(a,b){return a.time-b.time});return ls}
// 逐字歌词（QRC）："[mm:ss.xx]字" 序列；解析失败返回 null（回退行内均分）
export function parseQrc(t){if(!t)return null;var ls=[],re=/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.)/g,m;while((m=re.exec(t))!==null){var f=m[3]||"0",ms=parseInt(f);if(f.length===1)ms*=100;else if(f.length===2)ms*=10;var tm=parseInt(m[1])*60+parseInt(m[2])+ms/1000;if(m[4]&&m[4].trim())ls.push({time:tm,ch:m[4]})}if(ls.length<8)return null;return ls}
export function renderLrc(){var b=$("lyricBody");if(!S.lines.length){showLrcEmpty();return}var h="";S.lines.forEach(function(l,i){h+='<div class="lyric-line" data-index="'+i+'"><span class="text">'+esc(l.text)+'</span>';if(showTrans&&transLines.length){var tr=findTr(l.time);if(tr)h+='<div class="translation">'+esc(tr)+'</div>'}h+='</div>'});b.innerHTML=h;b.querySelectorAll(".lyric-line").forEach(function(el){el.addEventListener("click",function(){var idx=+el.dataset.index;if(audio.duration){audio.currentTime=S.lines[idx].time+S.lyricOff;updateLrc(audio.currentTime)}})})}
export function findTr(time){var best=null,bd=Infinity;for(var i=0;i<transLines.length;i++){var d=Math.abs(transLines[i].time-time);if(d<bd&&d<1){bd=d;best=transLines[i].text}}return best}
export function showLrcEmpty(){$("lyricBody").innerHTML='<div class="lyric-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h16M4 12h12M4 18h8"/></svg><span>暂无歌词</span></div>'}
export function updateLrc(time){
  autoOffsetLyrics();
  var adj=time-S.lyricOff,idx=-1;for(var i=0;i<S.lines.length;i++){if(S.lines[i].time<=adj)idx=i;else break}
  if(idx===S.lyricIdx)return;
  S.lyricIdx=idx;document.querySelectorAll("#lyricBody .lyric-line").forEach(function(el,i){el.classList.toggle("active",i===idx)});if(idx>=0){var el=document.querySelector("#lyricBody .lyric-line[data-index='"+idx+"']");if(el)el.scrollIntoView({behavior:"smooth",block:"center"})}setActiveLine(idx)}
export function renderIL(){var tl=$("ilTitle"),al=$("ilArtist");if(S.song){tl.textContent=S.song.title;al.textContent=S.song.artist}}
export function toggleTrans(){showTrans=!showTrans;renderLrc();var b=$("btnTranslation"),bf=$("ilTransBtn");if(b)b.style.color=showTrans?"var(--accent)":"";if(bf)bf.classList.toggle("active",showTrans);if(S.lyricsOpen){renderILLyrics();setActiveLine(S.lyricIdx)}toast(showTrans?"显示翻译":"隐藏翻译")}
export function adjustOff(d){S.lyricOff+=d;var ds=$("lyricOffsetDisplay");if(ds)ds.textContent=S.lyricOff.toFixed(1)+"s";toast("歌词偏移: "+S.lyricOff.toFixed(1)+"s")}
export function updateLyricProgress(){if(S.lyricIdx<0||!S.lines.length)return;var cur=S.lines[S.lyricIdx],nx=S.lines[S.lyricIdx+1];var dur=nx?(nx.time-cur.time):((audio.duration||0)-cur.time);if(dur<=0)dur=1;var el=(smoothTime()-S.lyricOff-cur.time)/dur*100;el=Math.max(0,Math.min(100,el));var side=document.querySelector("#lyricBody .lyric-line.active .text");if(side)side.style.setProperty("--progress",el+"%")}

// ═══════════════════════════════════════════
// 全屏歌词 v2（DOM 渲染 + Canvas 背景动效）
// ═══════════════════════════════════════════

var IL_MODES=["pure","spec","cloud"];
var IL_MODE_LABELS={pure:"纯净",spec:"频谱",cloud:"词云"};
// 旧版本存储的 "star"/"galaxy" 迁移到 "cloud"
export function normalizeILMode(v){if(v==="star"||v==="galaxy")return"cloud";return IL_MODES.indexOf(v)>=0?v:"spec"}
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
var activeCharsEl=null; // 缓存激活行字符容器（每帧 querySelector 是反优化）
export function setActiveLine(idx){
  var c=$("ilLyrics");if(!c)return;
  activeCharsEl=null;
  c.querySelectorAll(".il-line").forEach(function(el,i){
    el.classList.toggle("active",i===idx);
    var ch=el.querySelector(".il-chars");
    if(ch&&!el.classList.contains("active")&&ch.dataset.chars){ch.textContent=S.lines[i].text;delete ch.dataset.chars}
  });
  if(idx>=0&&idx<S.lines.length){
    var act=c.querySelector('.il-line.active .il-chars');
    activeCharsEl=act;
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
// 均分：字符 i 在行推进到 i/n 时点亮（线性，无提前放大）
// QRC：按相邻字时间差推进，即唱到哪个字就亮哪个字
export function updateILKaraoke(){
  if(!S.lyricsOpen||S.lyricIdx<0||!S.lines.length)return;
  var line=S.lines[S.lyricIdx],next=S.lines[S.lyricIdx+1];
  var dur=next?next.time-line.time:((audio.duration||0)-line.time);
  if(dur<=0)return;
  var el=activeCharsEl||document.querySelector("#ilLyrics .il-line.active .il-chars");
  if(!el||!el.children.length)return;
  var now=smoothTime()-S.lyricOff;
  var n=el.children.length;
  if(el._karaokeN!==n){el._karaokeN=n;el._karaokeLast=[]} // 行切换/重建后重置差量记录

  // 逐字数据（QRC 已随行时间轴对齐；字数接近时才用）
  var qrc=S.qrc,useQrc=false,start=line.time,end=next?next.time:(audio.duration||line.time+5),chs=[];
  if(qrc&&qrc.length){
    for(var q=0;q<qrc.length;q++){if(qrc[q].time>=start&&qrc[q].time<end)chs.push(qrc[q])}
    if(chs.length>=Math.floor(n*0.6))useQrc=true;
  }

  var lineProg=Math.max(0,Math.min(1,(now-line.time)/dur));
  for(var i=0;i<n;i++){
    var p;
    if(useQrc){
      var qi=Math.min(i,chs.length-1);
      // 每个字在 [字时间, 下一字时间] 区间内从 0 渐亮到 1
      var t0=chs[qi].time;
      var t1=(i+1<chs.length)?chs[i+1].time:end;
      var cd=Math.max(0.05,t1-t0);
      p=Math.max(0,Math.min(1,(now-t0)/cd));
    }else{
      // 行内均分：第 i/n 个字在行进度 i/n 处开始点亮
      p=Math.max(0,Math.min(1,lineProg*n-i));
    }
    // 差量写入：亮度连续变化（ε 门控），丝滑不顿挫
    var sp=el.children[i];
    var grade=p>=0.98?"full":(p<=0?"dim":"m"+Math.round(p*50));
    if(el._karaokeLast[i]!==grade){
      el._karaokeLast[i]=grade;
      if(grade==="full"){sp.style.color="#fff";sp.style.textShadow="0 0 14px rgba(var(--accent-rgb),.55)"}
      else if(grade==="dim"){sp.style.color="rgba(255,255,255,.22)";sp.style.textShadow="none"}
      else{sp.style.color="rgba(255,255,255,"+(0.22+p*0.6).toFixed(3)+")";sp.style.textShadow="none"}
    }
  }
}

// 背景模式循环切换
export function cycleILMode(){
  var cur=normalizeILMode(S.ilMode);
  var i=IL_MODES.indexOf(cur);
  setState({ilMode:IL_MODES[(i+1)%IL_MODES.length]});
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
  setState({lyricsOpen:true});ilFollow=true;
  var il=$("immersiveLyrics");
  if(S.song){
    $("ilTitle").textContent=S.song.title;$("ilArtist").textContent=S.song.artist;
  }
  renderIL();
  renderILLyrics();
  setActiveLine(S.lyricIdx);
  var mb=$("ilModeBtn");if(mb)mb.textContent="背景·"+IL_MODE_LABELS[normalizeILMode(S.ilMode)];
  il.classList.add("show");
  if(!ilCv)initIL();
  setTimeout(function(){if(ilCv){ilCv.width=ilCv.parentElement.clientWidth;ilCv.height=ilCv.parentElement.clientHeight}},100);
}
export function closeLyrics(){setState({lyricsOpen:false});$("immersiveLyrics").classList.remove("show")}
export function toggleLyricPanel(){setState({lyricVis:!S.lyricVis});$("lyricPanel").style.display=S.lyricVis?"flex":"none";var b=$("btnLyric");if(b)b.classList.toggle("active",S.lyricVis)}

// ── 背景动效 Canvas（纯净档不绘制，频谱/星空档绘制）──
export var ilCtx,ilCv;
var ilW=0,ilH=0,accentCached=null;
export function initIL(){ilCv=$("ilCanvas");if(ilCv)ilCtx=ilCv.getContext("2d")}

// 氛围光斑（三档共用）：两个大而柔的主题色径向渐变，缓移 + 呼吸
function drawAmbient(ctx,w,h,t,accentRgb){
  var r1=Math.max(w,h)*0.5*(1+Math.sin(t*0.1)*0.05);
  var bx1=w*(0.26+Math.sin(t*0.05)*0.07);
  var by1=h*(0.30+Math.cos(t*0.04)*0.06);
  var g1=ctx.createRadialGradient(bx1,by1,0,bx1,by1,r1);
  g1.addColorStop(0,"rgba("+accentRgb+",0.10)");
  g1.addColorStop(1,"rgba("+accentRgb+",0)");
  ctx.fillStyle=g1;ctx.fillRect(0,0,w,h);
  var r2=Math.max(w,h)*0.38*(1+Math.cos(t*0.09)*0.06);
  var bx2=w*(0.74+Math.cos(t*0.06)*0.06);
  var by2=h*(0.70+Math.sin(t*0.05)*0.05);
  var g2=ctx.createRadialGradient(bx2,by2,0,bx2,by2,r2);
  g2.addColorStop(0,"rgba("+accentRgb+",0.07)");
  g2.addColorStop(1,"rgba("+accentRgb+",0)");
  ctx.fillStyle=g2;ctx.fillRect(0,0,w,h);
}

// 频谱档：克制型底部均衡器（≤80 条、最大 20% 屏高、低饱和）
function drawSpectrum(ctx,w,h,t,accentRgb,analyser,freqData){
  analyser.getByteFrequencyData(freqData);
  var barCount=Math.min(80,Math.round(w/16));
  var barW=w/barCount;
  var maxH=h*0.2;
  var bass=0;for(var i=0;i<8;i++)bass+=freqData[i];bass=bass/8/255;
  ctx.save();
  ctx.globalAlpha=0.75;
  for(var i=0;i<barCount;i++){
    var fv=freqData[Math.floor((i/barCount)*64)]/255;
    var barH=Math.max(1,fv*maxH);
    var x=i*barW,y=h-barH;
    var grad=ctx.createLinearGradient(x,h,x,y);
    grad.addColorStop(0,"rgba("+accentRgb+",0.30)");
    grad.addColorStop(1,"rgba("+accentRgb+",0.02)");
    ctx.fillStyle=grad;
    ctx.fillRect(x+1,y,barW-2,barH);
  }
  ctx.restore();
  // 底部柔光
  var glow=ctx.createLinearGradient(0,h,0,h-maxH*0.6);
  glow.addColorStop(0,"rgba("+accentRgb+","+(0.04+bass*0.07).toFixed(2)+")");
  glow.addColorStop(1,"rgba("+accentRgb+",0)");
  ctx.fillStyle=glow;ctx.fillRect(0,h-maxH*0.6,w,maxH*0.6);
}

// ═══════════════════════════════════════════════
// 词云（cloud 背景模式）：全曲词汇的提炼星图，随音乐呼吸
// ——唱到哪句，那句的词点亮上浮；唱过的沉淀；未唱的若隐若现
// ═══════════════════════════════════════════════

// 虚词字符：bigram 含这些字即视为无词云价值
var CLOUD_STOP_CHARS="的了呢吧吗啊呀哦嗯嘿哟";
var CLOUD_STOP_LATIN={the:1,a:1,an:1,and:1,or:1,is:1,are:1,was:1,were:1,to:1,of:1,in:1,it:1,its:1,you:1,your:1,youre:1,i:1,im:1,ive:1,ill:1,me:1,my:1,we:1,us:1,our:1,so:1,no:1,do:1,did:1,if:1,that:1,this:1,these:1,those:1,with:1,for:1,on:1,at:1,be:1,been:1,being:1,am:1,not:1,but:1,just:1,oh:1,yeah:1,wo:1,de:1,don:1,dont:1,cant:1,wont:1,aint:1,didn:1,doesn:1,isn:1,wasn:1,aren:1,weren:1,wouldn:1,couldn:1,shouldn:1,gonna:1,wanna:1,gotta:1,cause:1,cuz:1,cos:1,got:1,get:1,like:1,well:1,now:1,here:1,there:1,when:1,then:1,what:1,who:1,how:1,why:1,where:1,all:1,every:1,some:1,any:1,way:1,she:1,he:1,her:1,his:1,him:1,they:1,them:1,their:1,wasnt:1,isnt:1,doesnt:1,didnt:1,would:1,could:1,should:1,will:1,can:1,still:1,even:1,about:1,from:1,up:1,down:1,out:1,off:1,over:1,one:1,two:1,let:1,lets:1,away:1,back:1,give:1,take:1,come:1,came:1,gone:1,make:1,made:1,tell:1,told:1,say:1,said:1,see:1,seen:1,feel:1,felt:1,know:1,need:1,never:1,always:1,think:1,thought:1,keep:1,left:1,put:1};
var CLOUD_MAX=80;

// tokenizeLyrics 歌词分词 + 词频统计（纯函数）：
// CJK 滑动二字窗、Latin 按词切分、停用词过滤、按（词频, 跨行数, 首现行）排序取 top 80；
// 返回 [{text,freq,lines}]（lines 为出现的行号数组）
export function tokenizeLyrics(text){
  var freq={},linesBy={};
  var lines=String(text||"").split("\n");
  for(var li=0;li<lines.length;li++){
    var runs=lines[li].match(/[\u4e00-\u9fff]+|[a-zA-Z]+/g)||[];
    for(var r=0;r<runs.length;r++){
      var run=runs[r];
      if(/[\u4e00-\u9fff]/.test(run)){
        for(var i=0;i+2<=run.length;i++){
          var w=run.substr(i,2);
          if(CLOUD_STOP_CHARS.indexOf(w[0])>=0||CLOUD_STOP_CHARS.indexOf(w[1])>=0)continue;
          (linesBy[w]=linesBy[w]||[]).push(li);
          freq[w]=(freq[w]||0)+1;
        }
      }else{
        var wd=run.toLowerCase();
        if(wd.length<2||CLOUD_STOP_LATIN[wd])continue;
        (linesBy[wd]=linesBy[wd]||[]).push(li);
        freq[wd]=(freq[wd]||0)+1;
      }
    }
  }
  var words=Object.keys(freq).sort(function(a,b){
    return freq[b]-freq[a]||linesBy[a].length-linesBy[b].length||(linesBy[a][0]-linesBy[b][0])||(a<b?-1:1);
  });
  return words.slice(0,CLOUD_MAX).map(function(w){
    return{text:w,freq:freq[w],lines:linesBy[w]};
  });
}

// 词云状态：{text,w(0-1 权重),lines(出现行号数组),rx,ry(相对坐标 0-1),size,cur(当前亮度，lerp 平滑)}
var cloudTokens=[];
var cloudBuiltFor=""; // 防重复构建（按歌词首行文本+长度做指纹）

// buildWordCloud 分词 + 网格吸附布局（确定性：同歌词同布局）
function buildWordCloud(){
  var fp=S.lines.length?S.lines[0].text+"#"+S.lines.length:"";
  if(fp===cloudBuiltFor)return;
  cloudBuiltFor=fp;
  cloudTokens=[];
  if(!S.lines.length)return;
  var toks=tokenizeLyrics(S.lines.map(function(l){return l.text}).join("\n"));
  if(!toks.length)return;
  var maxFreq=toks[0].freq;
  // 扁平词频自适应：英文歌词频普遍 1-2 次，排名失去区分度时降低词数、
  // 只保留跨行出现的词或短词（避免整句拆散撒屏的"一团乱"）
  var flat=maxFreq<=2;
  var limit=flat?Math.min(42,toks.length):Math.min(54,toks.length);
  var kept=toks.slice(0,limit);
  if(flat){
    var strong=kept.filter(function(t){return t.lines.length>1||t.text.length<=4});
    if(strong.length>=20)kept=strong;
    else if(kept.length<20)kept=toks.slice(0,Math.min(42,toks.length));
  }

  // 周边框式布局：词云只占屏幕边缘（左右两列 + 上下两条带），
  // 中央主歌词区域完全让开。格子按参考视口 1440×900 计算。
  var zones=[
    {x0:0.025,x1:0.135,y0:0.18,y1:0.82},  // 左列
    {x0:0.865,x1:0.975,y0:0.18,y1:0.82},  // 右列
    {x0:0.09,x1:0.91,y0:0.045,y1:0.115},  // 顶带（标题栏下方）
    {x0:0.09,x1:0.91,y0:0.845,y1:0.905},  // 底带（控制条上方）
  ];
  var REF_W=1440,REF_H=900,CELL_W=105,CELL_H=72;
  var cells=[];
  for(var z=0;z<zones.length;z++){
    var zn=zones[z];
    var nx=Math.max(1,Math.round((zn.x1-zn.x0)*REF_W/CELL_W));
    var ny=Math.max(1,Math.round((zn.y1-zn.y0)*REF_H/CELL_H));
    for(var a=0;a<nx;a++)for(var b=0;b<ny;b++)
      cells.push({z:zn,fx:(a+0.5)/nx,fy:(b+0.5)/ny});
  }
  // 种子随机（确定性洗牌：同歌词同布局）
  var seed=20260906;
  var rnd=function(){seed=(seed*9301+49297)%233280;return seed/233280};
  for(var c=cells.length-1;c>0;c--){var j=Math.floor(rnd()*(c+1));var t=cells[c];cells[c]=cells[j];cells[j]=t}

  // 权重：按排名衰减（词频扁平时依然有清晰的字号层次）
  var measureCtx=measureCtx||document.createElement("canvas").getContext("2d");
  var n=Math.min(kept.length,cells.length);
  for(var i=0;i<n;i++){
    var t=kept[i];
    var cell=cells[i];
    var w=1-i/n; // 排名衰减权重
    var size=12+Math.pow(w,0.8)*15;
    // 按文字实际宽度收纳：过长的词（英文常见）缩小到格宽以内
    measureCtx.font=(w>0.6?"600 ":"400 ")+size+"px -apple-system,'PingFang SC',sans-serif";
    var tw=measureCtx.measureText(t.text).width;
    var maxW=CELL_W*1.05;
    if(tw>maxW)size=Math.max(11,size*maxW/tw);
    cloudTokens.push({
      text:t.text,w:w,
      lines:t.lines,
      rx:cell.z.x0+(cell.z.x1-cell.z.x0)*(cell.fx+(rnd()-0.5)*0.5),
      ry:cell.z.y0+(cell.z.y1-cell.z.y0)*(cell.fy+(rnd()-0.5)*0.5),
      size:size,
      cur:0.1 // 当前亮度（lerp 平滑）
    });
  }
}

// drawCloud 时间感知词云绘制：
// 当前句的词点亮（accent/放大/上浮/双层光晕），前 1-2 句渐沉，其余若隐若现
function drawCloud(ctx,w,h,t,accentRgb){
  if(!cloudTokens.length)return;
  var ci=S.lyricIdx;
  for(var i=0;i<cloudTokens.length;i++){
    var tk=cloudTokens[i];
    // 距当前句的最近距离
    var d=999;
    for(var k=0;k<tk.lines.length;k++){
      var dd=Math.abs(tk.lines[k]-ci);
      if(dd<d)d=dd;
    }
    var target,sizeMul=1,lift=0,useAccent=false;
    if(ci>=0&&d===0){target=0.92;sizeMul=1.32;lift=14;useAccent=true}
    else if(ci>=0&&d<=2){target=0.32}
    else{target=(0.11+tk.w*0.15)*(0.78+0.22*Math.sin(t*0.7+i*1.7))}
    tk.cur+=(target-tk.cur)*0.08; // 逐帧 lerp 平滑
    if(tk.cur<0.02)continue;
    var x=(0.07+0.86*tk.rx)*w;
    var y=(0.06+0.88*tk.ry)*h-lift*tk.cur;
    var fs=Math.round(tk.size*sizeMul);
    ctx.textAlign="center";ctx.textBaseline="middle";
    if(useAccent&&tk.cur>0.5){
      // 双层光晕（替代 shadowBlur：同词放大 1.4 倍低透明度叠一层）
      ctx.font="600 "+Math.round(fs*1.4)+"px -apple-system,'PingFang SC',sans-serif";
      ctx.fillStyle="rgba("+accentRgb+","+(tk.cur*0.12).toFixed(2)+")";
      ctx.fillText(tk.text,x,y);
    }
    ctx.font=(tk.w>0.6?"600 ":"400 ")+fs+"px -apple-system,'PingFang SC',sans-serif";
    ctx.fillStyle=useAccent
      ?"rgba("+accentRgb+","+tk.cur.toFixed(2)+")"
      :"rgba(255,255,255,"+tk.cur.toFixed(2)+")";
    ctx.fillText(tk.text,x,y);
  }
}

export function drawIL(){
  if(!ilCtx||!S.lyricsOpen||document.hidden)return;
  var mode=normalizeILMode(S.ilMode);
  var pw=ilCv.parentElement.clientWidth,ph=ilCv.parentElement.clientHeight;
  if(pw!==ilW||ph!==ilH){ilCv.width=pw;ilCv.height=ph;ilW=pw;ilH=ph} // 尺寸仅变化时设置
  var w=pw,h=ph;
  if(w<10||h<10)return;
  var ctx=ilCtx,t=Date.now()*.001;
  ctx.clearRect(0,0,w,h);
  // canvas 不支持 CSS 变量；强调色运行期不变，读一次缓存
  if(accentCached==null){
    accentCached="0,122,255";
    try{var v=getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim();if(v)accentCached=v}catch(e){}
  }
  var accentRgb=accentCached;

  // 氛围光斑（三档共用）
  drawAmbient(ctx,w,h,t,accentRgb);

  if(mode==="spec"&&analyser&&freqData){
    drawSpectrum(ctx,w,h,t,accentRgb,analyser,freqData);
  }else if(mode==="cloud"){
    drawCloud(ctx,w,h,t,accentRgb);
  }
}

// 全屏歌词事件绑定（跟随/浏览/自动隐藏/字号/背景切换）
// onTogglePlay 由 app.js 注入（避免 player↔lyrics 循环依赖）
export function initILEvents(onTogglePlay){
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
    if(e.target.id==="ilBody"||e.target.id==="ilLyrics"){
      try{if(localStorage.getItem("melody_clickplay")==="0")return}catch(err){}
      if(onTogglePlay)onTogglePlay();
    }
  });
}
