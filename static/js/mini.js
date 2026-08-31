// mini.js — 迷你模式 / 桌面歌词窗口（通过 BroadcastChannel 与主窗口同步）
var mode=new URLSearchParams(location.search).get("mode")||"mini";
document.body.dataset.mode=mode;

function $(id){return document.getElementById(id)}
var ICON_PLAY='<path d="M8 5v14l11-7z"/>';
var ICON_PAUSE='<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';

var ch=null;
try{ch=new BroadcastChannel("melody-sync")}catch(e){}
if(ch){
  ch.onmessage=function(ev){
    var d=ev.data;
    if(!d||d.type!=="state")return;
    var t=$("mTitle"),a=$("mArtist"),ly=$("mLyric"),nx=$("mNext"),fill=$("mFill"),pl=$("mPlay"),pi=$("mPlayIcon"),cv=$("mCover");
    if(!t)return;
    t.textContent=d.song?d.song.title:"未在播放";
    a.textContent=d.song?(d.song.artist||""):"--";
    ly.textContent=d.cur?(d.cur.text||"--"):"--";
    nx.textContent=d.next?("下一句: "+d.next.text):"";
    if(fill)fill.style.width=(d.dur?(d.time/d.dur*100):0)+"%";
    if(pl){pl.textContent="";pi.innerHTML=d.play?ICON_PAUSE:ICON_PLAY}
    if(cv){
      if(d.song&&d.song.cover){cv.style.backgroundImage="url("+d.song.cover+")";cv.classList.toggle("spin",!!d.play)}
      else{cv.style.backgroundImage="none";cv.classList.remove("spin")}
    }
  };
  function send(cmd){ch.postMessage({type:"cmd",cmd:cmd})}
  var bp=$("mPrev"),bt=$("mPlay"),bn=$("mNextBtn");
  if(bp)bp.onclick=function(){send("prev")};
  if(bt)bt.onclick=function(){send("toggle")};
  if(bn)bn.onclick=function(){send("next")};
}else{
  $("mTitle").textContent="同步不可用";
}
