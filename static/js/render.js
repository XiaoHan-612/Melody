// render.js — 列表渲染（封面缩略图 / hover 操作 / 骨架屏 / 队列面板 / 右键菜单）
import { $, esc, fmt, toast } from "./utils.js";
import { S, SOURCE_LABELS, ICONS } from "./state.js";
import { playSong, playNextInsert } from "./player.js";
import { movePlUp, movePlDown, rmFromPl, savePl, isFav, toggleFav, addToPl } from "./playlist.js";
import { showMenu } from "./menu.js";

function svg(inner,fill){return '<svg viewBox="0 0 24 24" fill="'+(fill||"none")+'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+inner+"</svg>"}

function listFor(type){return type==="search"?S.results:type==="playlist"?S.pl:type==="recent"?S.recent:null}

// 行内"更多"菜单
function rowMenu(song,type,idx,btn){
  var items;
  if(type==="playlist"){
    items=[
      {label:"播放",fn:function(){playSong(song,idx,type)}},
      {label:"下一首播放",fn:function(){playNextInsert(song)}},
      {label:"上移",fn:function(){movePlUp(idx)}},
      {label:"下移",fn:function(){movePlDown(idx)}},
      {sep:true},
      {label:"从歌单移除",danger:true,fn:function(){rmFromPl(idx)}},
    ];
  }else{
    items=[
      {label:"播放",fn:function(){playSong(song,idx,type)}},
      {label:"下一首播放",fn:function(){playNextInsert(song)}},
      {label:"添加到歌单",fn:function(){addToPl(song)}},
      {label:"复制歌名",fn:function(){copySongName(song)}},
      {label:"复制播放链接",fn:function(){copySongURL(song)}},
    ];
  }
  var r=btn.getBoundingClientRect();
  showMenu(r.left-150,r.bottom+4,items);
}

function copySongName(song){try{navigator.clipboard.writeText(song.title+" - "+song.artist).then(function(){toast("已复制歌名")})}catch(e){}}
function copySongURL(song){
  toast("正在获取播放链接...");
  fetch("/api/song/url?id="+encodeURIComponent(song.id)+"&source="+song.source)
    .then(function(r){return r.json()})
    .then(function(d){if(d&&d.url){return navigator.clipboard.writeText(d.url).then(function(){toast("已复制播放链接")})}toast("获取链接失败")})
    .catch(function(){toast("获取链接失败")});
}

// ── 播放队列面板 ──
export function renderQueue(){
  var c=$("queueList");if(!c)return;
  if(!S.queue.length){c.innerHTML='<div class="queue-empty"><div class="text">队列为空</div><div style="font-size:12px;color:var(--text3);margin-top:6px">点击歌曲即可加入队列</div></div>';return}
  var h="";
  S.queue.forEach(function(s,i){
    var active=i===S.qi&&S.song&&S.song.id===s.id&&S.song.source===s.source;
    h+='<div class="q-row'+(active?" active":"")+'" draggable="true" data-i="'+i+'">';
    h+='<span class="q-pos">'+(active?'<svg viewBox="0 0 24 24" fill="var(--accent)" width="12" height="12"><path d="M8 5v14l11-7z"/></svg>':i+1)+"</span>";
    h+='<div class="q-info"><div class="q-title">'+esc(s.title)+'</div><div class="q-artist">'+esc(s.artist)+'</div></div>';
    h+='<span class="source-tag '+s.source+'">'+SOURCE_LABELS[s.source]+"</span>";
    h+='<button class="tr-action-btn danger" data-rm="'+i+'" title="移除">'+svg(ICONS.close)+"</button>";
    h+="</div>";
  });
  c.innerHTML=h;
  c.querySelectorAll(".q-row").forEach(function(el){
    el.addEventListener("click",function(e){
      if(e.target.closest("[data-rm]"))return;
      var i=+el.dataset.i;
      if(S.queue[i])playSong(S.queue[i],i,"queue",true);
    });
    el.addEventListener("dragstart",function(e){e.dataTransfer.setData("text/plain",String(el.dataset.i));el.classList.add("dragging")});
    el.addEventListener("dragend",function(){el.classList.remove("dragging")});
    el.addEventListener("dragover",function(e){e.preventDefault();el.classList.add("drag-over")});
    el.addEventListener("dragleave",function(){el.classList.remove("drag-over")});
    el.addEventListener("drop",function(e){
      e.preventDefault();el.classList.remove("drag-over");
      var from=+e.dataTransfer.getData("text/plain"),to=+el.dataset.i;
      if(from===to)return;
      var item=S.queue.splice(from,1)[0];
      S.queue.splice(to,0,item);
      if(from===S.qi)S.qi=to;
      else if(from<S.qi&&to>=S.qi)S.qi--;
      else if(from>S.qi&&to<=S.qi)S.qi++;
      renderQueue();
    });
  });
  c.querySelectorAll("[data-rm]").forEach(function(btn){
    btn.addEventListener("click",function(e){
      e.stopPropagation();
      var i=+btn.dataset.rm;
      S.queue.splice(i,1);
      if(i<S.qi)S.qi--;
      if(S.qi>=S.queue.length)S.qi=S.queue.length-1;
      if(S.qi<0)S.qi=-1;
      renderQueue();
      toast("已从队列移除");
    });
  });
}

export function renderList(songs,type){
  var c=$("trackList");
  if(!songs||!songs.length){showEmpty();return}
  var h="";
  songs.forEach(function(s,i){
    var playing=S.song&&S.song.id===s.id&&S.song.source===s.source;
    var faved=isFav(s);
    h+='<div class="track-row'+(playing?" playing":"")+'" data-index="'+i+'" data-type="'+type+'"'+(i<6?' style="animation-delay:'+(i*0.03).toFixed(2)+'s"':'')+'>';
    h+='<div class="tr-num">'+(playing?'<svg viewBox="0 0 24 24" fill="var(--accent)" width="14" height="14"><path d="M8 5v14l11-7z"/></svg>':i+1)+"</div>";
    h+='<div class="tr-cover-wrap">'+(s.cover?'<img class="tr-cover" src="'+esc(s.cover)+'" loading="lazy" onerror="this.style.visibility=\'hidden\'">':'<div class="tr-cover tr-cover-ph"></div>')+"</div>";
    h+='<div class="tr-info"><div class="tr-title">'+esc(s.title)+'</div><div class="tr-artist">'+esc(s.artist)+"</div></div>";
    h+='<span class="source-tag '+s.source+'">'+SOURCE_LABELS[s.source]+"</span>";
    h+='<div class="tr-dur">'+(s.duration?fmt(s.duration):"")+"</div>";
    h+='<div class="tr-actions">';
    h+='<button class="tr-action-btn'+(faved?" faved":"")+'" data-act="fav" data-idx="'+i+'" title="喜欢">'+svg(ICONS.heart,faved?"currentColor":"none")+"</button>";
    h+='<button class="tr-action-btn" data-act="menu" data-idx="'+i+'" title="更多">'+svg(ICONS.dots)+"</button>";
    h+="</div></div>";
  });
  c.innerHTML=h;
  c.querySelectorAll(".track-row").forEach(function(el){
    el.addEventListener("click",function(e){
      if(e.target.closest(".tr-actions"))return;
      var list=listFor(el.dataset.type);
      if(list&&list[+el.dataset.index])playSong(list[+el.dataset.index],+el.dataset.index,el.dataset.type);
    });
    // 歌单拖拽排序
    if(el.dataset.type==="playlist"){
      el.draggable=true;
      el.addEventListener("dragstart",function(e){e.dataTransfer.setData("text/plain",String(el.dataset.index));el.classList.add("dragging")});
      el.addEventListener("dragend",function(){el.classList.remove("dragging")});
      el.addEventListener("dragover",function(e){e.preventDefault();el.classList.add("drag-over")});
      el.addEventListener("dragleave",function(){el.classList.remove("drag-over")});
      el.addEventListener("drop",function(e){
        e.preventDefault();el.classList.remove("drag-over");
        var from=+e.dataTransfer.getData("text/plain"),to=+el.dataset.index;
        if(from===to)return;
        var item=S.pl.splice(from,1)[0];
        S.pl.splice(to,0,item);
        savePl();renderList(S.pl,"playlist");
        toast("已调整顺序");
      });
    }
  });
  c.querySelectorAll(".tr-action-btn").forEach(function(btn){
    btn.addEventListener("click",function(e){
      e.stopPropagation();
      var row=btn.closest(".track-row"),list=listFor(row.dataset.type);
      var idx=+btn.dataset.idx;
      if(!list||!list[idx])return;
      if(btn.dataset.act==="fav")toggleFav(list[idx]);
      else if(btn.dataset.act==="menu")rowMenu(list[idx],row.dataset.type,idx,btn);
    });
  });
  // 右键菜单（歌曲行）
  c.addEventListener("contextmenu",function(e){
    var row=e.target.closest(".track-row");if(!row)return;
    e.preventDefault();
    var list=listFor(row.dataset.type),idx=+row.dataset.index;
    if(!list||!list[idx])return;
    var song=list[idx],items=[];
    if(row.dataset.type==="playlist"){
      items=[
        {label:"播放",fn:function(){playSong(song,idx,row.dataset.type)}},
        {label:"下一首播放",fn:function(){playNextInsert(song)}},
        {label:"上移",fn:function(){movePlUp(idx)}},
        {label:"下移",fn:function(){movePlDown(idx)}},
        {sep:true},
        {label:"从歌单移除",danger:true,fn:function(){rmFromPl(idx)}},
      ];
    }else{
      items=[
        {label:"播放",fn:function(){playSong(song,idx,row.dataset.type)}},
        {label:"下一首播放",fn:function(){playNextInsert(song)}},
        {label:"添加到歌单",fn:function(){addToPl(song)}},
        {label:"复制歌名",fn:function(){copySongName(song)}},
        {label:"复制播放链接",fn:function(){copySongURL(song)}},
      ];
    }
    showMenu(e.clientX,e.clientY,items);
  });
}

export function showEmpty(){$("trackList").innerHTML='<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><div class="text">搜索你喜欢的音乐</div><div style="font-size:13px;opacity:.7">支持酷狗、网易云、B站三个平台</div></div>'}

// 骨架屏加载态
export function showLoading(){
  var rows="";
  for(var i=0;i<8;i++){
    rows+='<div class="skeleton-row"><div class="skeleton" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1"><div class="skeleton" style="height:12px;width:60%"></div><div class="skeleton" style="height:10px;width:35%;margin-top:8px"></div></div></div>';
  }
  $("trackList").innerHTML='<div class="skeleton-list">'+rows+"</div>";
}
