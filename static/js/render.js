// render.js — 视图层（列表/队列/歌单网格/侧边栏/菜单/收藏同步）
// 只读状态 + 调用服务层，自己不改业务数据；事件经一次性委托绑定。
import { $, esc, fmt, toast } from "./utils.js";
import { S, SOURCE_LABELS, ICONS, listFor } from "./state.js";
import { setState } from "./store.js";
import { playSong, playNextInsert, resolveSongURL, reorderQueue, removeFromQueue } from "./player.js";
import { movePlUp, movePlDown, rmFromPl, reorderPl, isFav, toggleFav, addToPl, currentPl, addPlNamed, addPl, backToGrid } from "./playlist.js";
import { showMenu, hideMenu } from "./menu.js";

function svg(inner,fill){return '<svg viewBox="0 0 24 24" fill="'+(fill||"none")+'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+inner+"</svg>"}

// 添加到歌单：选择目标歌单
export function addToPlMenu(song){
  var items=S.pls.map(function(p){
    return{label:p.name+" ("+p.songs.length+")",fn:function(){addToPl(song,p.id)}};
  });
  items.push({sep:true});
  items.push({label:"新建歌单并添加",fn:function(){
    var name=prompt("新歌单名称","新歌单");
    if(name&&name.trim())addPlNamed(name.trim(),song);
  }});
  showMenu(Math.round(window.innerWidth/2-130),Math.round(window.innerHeight/2-120),items);
}

function copySongName(song){try{navigator.clipboard.writeText(song.title+" - "+song.artist).then(function(){toast("已复制歌名")})}catch(e){}}
function copySongURL(song){
  toast("正在获取播放链接...");
  resolveSongURL(song,function(err,url){
    if(err||!url){toast("获取链接失败");return}
    try{navigator.clipboard.writeText(url).then(function(){toast("已复制播放链接")})}catch(e){}
  });
}

// 歌曲操作菜单（行内 ⋮ 与右键共用，一处定义）
function songMenuItems(song,type,idx){
  if(type==="playlist"){
    return[
      {label:"播放",fn:function(){playSong(song,idx,type)}},
      {label:"下一首播放",fn:function(){playNextInsert(song)}},
      {label:"上移",fn:function(){movePlUp(idx)}},
      {label:"下移",fn:function(){movePlDown(idx)}},
      {sep:true},
      {label:"从歌单移除",danger:true,fn:function(){rmFromPl(idx)}},
    ];
  }
  if(type==="favlist"){
    return[
      {label:"播放",fn:function(){playSong(song,idx,type)}},
      {label:"下一首播放",fn:function(){playNextInsert(song)}},
      {label:"添加到歌单",fn:function(){addToPlMenu(song)}},
      {label:"复制歌名",fn:function(){copySongName(song)}},
      {sep:true},
      {label:"取消收藏",danger:true,fn:function(){toggleFav(song)}},
    ];
  }
  return[
    {label:"播放",fn:function(){playSong(song,idx,type)}},
    {label:"下一首播放",fn:function(){playNextInsert(song)}},
    {label:"添加到歌单",fn:function(){addToPlMenu(song)}},
    {label:"复制歌名",fn:function(){copySongName(song)}},
    {label:"复制播放链接",fn:function(){copySongURL(song)}},
  ];
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
    h+='<div class="tr-info"><div class="tr-title">'+esc(s.title)+'</div><div class="tr-artist">'+esc(s.artist)+"</div></div>";
    h+='<span class="source-tag '+s.source+'">'+SOURCE_LABELS[s.source]+"</span>";
    h+='<div class="tr-dur">'+(s.duration?fmt(s.duration):"")+"</div>";
    h+='<div class="tr-actions">';
    h+='<button class="tr-action-btn'+(faved?" faved":"")+'" data-act="fav" data-idx="'+i+'" title="喜欢">'+svg(ICONS.heart,faved?"currentColor":"none")+"</button>";
    h+='<button class="tr-action-btn" data-act="menu" data-idx="'+i+'" title="更多">'+svg(ICONS.dots)+"</button>";
    h+="</div></div>";
  });
  c.innerHTML=h;
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
}

// ── 歌单封面网格视图（无封面：渐变占位 + 音乐图标）──
export function renderPlaylistGrid(){
  var c=$("trackList");
  var h='<div class="pl-grid">';
  S.pls.forEach(function(p){
    h+='<div class="pl-card" data-id="'+esc(p.id)+'">'
      +'<div class="pl-cover pl-cover-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>'
      +'<div class="pl-name">'+esc(p.name)+"</div>"
      +'<div class="pl-count">'+p.songs.length+" 首</div>"
      +"</div>";
  });
  h+='<div class="pl-card pl-add" id="plAddCard"><div class="pl-cover pl-add-icon">+</div><div class="pl-name">新建歌单</div></div>';
  h+="</div>";
  c.innerHTML=h;
  var addCard=$("plAddCard");
  if(addCard)addCard.addEventListener("click",addPl);
}

// ── 歌单页视图（网格 / 歌单详情）──
export function showPlaylistTab(){
  var pl=currentPl();
  renderPlSidebar();
  if(S.plView==="grid"){
    $("pageTitle").textContent="我的歌单";
    $("pageSub").textContent=S.pls.length+" 个歌单";
    renderPlaylistGrid();
  }else if(pl){
    $("pageTitle").innerHTML='<span class="back-link" id="plBackLink">← 全部歌单</span><span id="plTitleSpan">'+esc(pl.name)+"</span>";
    var bl=$("plBackLink");if(bl)bl.addEventListener("click",backToGrid);
    $("pageSub").textContent=pl.songs.length+" 首歌曲";
    setStateViewPl(pl.songs);
    renderList(S.pl,"playlist");
  }
}
// 同步"当前歌单 songs"引用到 S.pl（视图选择结果，经 setState 以便订阅者感知）
function setStateViewPl(songs){ if(S.pl!==songs) setState({pl:songs}) }

// ── 侧边栏歌单列表 + 徽标 ──
export function updateFavCount(){var fc=$("favCount");if(fc)fc.textContent=S.fav.length}
export function renderPlSidebar(){
  var c=$("plList");var pc=$("playlistCount");if(pc)pc.textContent=S.pls.length;
  if(!c)return;
  var h="";
  S.pls.forEach(function(p){
    h+='<div class="nav-item pl-item'+(p.id===S.plId&&S.tab==="playlist"?' active':'')+'" data-pl="'+esc(p.id)+'">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'+ICONS.music+'</svg>'
      +'<span class="nav-label pl-name">'+esc(p.name)+'</span>'
      +'<span class="badge">'+p.songs.length+"</span>"
      +"</div>";
  });
  c.innerHTML=h;
}

// ── 收藏状态跨视图同步（store 订阅 ["fav"] 驱动）──
export function syncFavHearts(){
  document.querySelectorAll(".track-row").forEach(function(el){
    var btn=el.querySelector('[data-act="fav"]');
    if(!btn)return;
    var list=listFor(el.dataset.type);
    var idx=+el.dataset.index;
    var faved=list&&list[idx]&&isFav(list[idx]);
    btn.classList.toggle("faved",!!faved);
    var inner=btn.querySelector("svg");
    if(inner)inner.setAttribute("fill",faved?"currentColor":"none");
  });
}
export function updateFavBtn(){
  var b=$("btnFav"),ib=$("ilFavBtn");
  var on=S.song&&isFav(S.song);
  if(b){b.classList.toggle("faved",on);b.title=on?"取消收藏":"收藏"}
  if(ib){ib.classList.toggle("faved",on);ib.textContent=on?"♥":"♡"}
}

// ── 空态 / 骨架屏 ──
export function showEmpty(){$("trackList").innerHTML='<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg><div class="text">搜索你喜欢的音乐</div><div style="font-size:13px;opacity:.7">支持酷狗、网易云、B站三个平台</div></div>'}

// 骨架屏加载态
export function showLoading(){
  var rows="";
  for(var i=0;i<8;i++){
    rows+='<div class="skeleton-row"><div class="skeleton" style="width:40px;height:40px;border-radius:8px"></div><div style="flex:1"><div class="skeleton" style="height:12px;width:60%"></div><div class="skeleton" style="height:10px;width:35%;margin-top:8px"></div></div></div>';
  }
  $("trackList").innerHTML='<div class="skeleton-list">'+rows+"</div>";
}

// ═══════════════════════════════════════════════
// 事件委托（一次性绑定，替代每次渲染重复绑定）
// ═══════════════════════════════════════════════

// 主列表：行点击 / 行内按钮 / 歌单拖拽排序 / 右键菜单
export function initTrackListEvents(){
  var c=$("trackList");
  if(!c)return;

  c.addEventListener("click",function(e){
    var btn=e.target.closest(".tr-action-btn");
    if(btn&&btn.dataset.act){
      var row=btn.closest(".track-row"),list=listFor(row.dataset.type);
      var idx=+btn.dataset.idx;
      if(!list||!list[idx])return;
      if(btn.dataset.act==="fav"){toggleFav(list[idx]);return}
      if(btn.dataset.act==="menu"){
        // 已打开则切换关闭（不拦截冒泡，document 监听器兜底关闭）
        if($("contextMenu").classList.contains("show")){hideMenu();return}
        // 阻止冒泡：否则菜单刚打开就被 document 的"点击外部关闭"关掉
        e.stopPropagation();
        var r=btn.getBoundingClientRect();
        showMenu(r.left-150,r.bottom+4,songMenuItems(list[idx],row.dataset.type,idx));
      }
      return;
    }
    if(e.target.closest(".tr-actions"))return;
    var row2=e.target.closest(".track-row");
    if(!row2)return;
    var list2=listFor(row2.dataset.type);
    if(list2&&list2[+row2.dataset.index])playSong(list2[+row2.dataset.index],+row2.dataset.index,row2.dataset.type);
  });

  // 歌单拖拽排序（drag 事件均冒泡，可委托）
  c.addEventListener("dragstart",function(e){
    var row=e.target.closest('.track-row[data-type="playlist"]');
    if(!row)return;
    e.dataTransfer.setData("text/plain",row.dataset.index);
    row.classList.add("dragging");
  });
  c.addEventListener("dragend",function(e){
    var row=e.target.closest(".track-row");
    if(row)row.classList.remove("dragging");
  });
  c.addEventListener("dragover",function(e){
    var row=e.target.closest('.track-row[data-type="playlist"]');
    if(!row)return;
    e.preventDefault();
    row.classList.add("drag-over");
  });
  c.addEventListener("dragleave",function(e){
    var row=e.target.closest(".track-row");
    if(row)row.classList.remove("drag-over");
  });
  c.addEventListener("drop",function(e){
    var row=e.target.closest('.track-row[data-type="playlist"]');
    if(!row)return;
    e.preventDefault();row.classList.remove("drag-over");
    var from=+e.dataTransfer.getData("text/plain"),to=+row.dataset.index;
    if(from!==to)reorderPl(from,to);
  });

  // 右键菜单
  c.addEventListener("contextmenu",function(e){
    var row=e.target.closest(".track-row");if(!row)return;
    e.preventDefault();
    var list=listFor(row.dataset.type),idx=+row.dataset.index;
    if(!list||!list[idx])return;
    showMenu(e.clientX,e.clientY,songMenuItems(list[idx],row.dataset.type,idx));
  });
}

// 队列面板：点击播放 / 移除 / 拖拽重排
export function initQueueEvents(){
  var c=$("queueList");if(!c)return;
  c.addEventListener("click",function(e){
    var rm=e.target.closest("[data-rm]");
    if(rm){removeFromQueue(+rm.dataset.rm);return}
    var row=e.target.closest(".q-row");
    if(!row)return;
    var i=+row.dataset.i;
    if(S.queue[i])playSong(S.queue[i],i,"queue",true);
  });
  c.addEventListener("dragstart",function(e){
    var row=e.target.closest(".q-row");
    if(!row)return;
    e.dataTransfer.setData("text/plain",row.dataset.i);
    row.classList.add("dragging");
  });
  c.addEventListener("dragend",function(e){
    var row=e.target.closest(".q-row");
    if(row)row.classList.remove("dragging");
  });
  c.addEventListener("dragover",function(e){
    var row=e.target.closest(".q-row");
    if(!row)return;
    e.preventDefault();
    row.classList.add("drag-over");
  });
  c.addEventListener("dragleave",function(e){
    var row=e.target.closest(".q-row");
    if(row)row.classList.remove("drag-over");
  });
  c.addEventListener("drop",function(e){
    var row=e.target.closest(".q-row");
    if(!row)return;
    e.preventDefault();row.classList.remove("drag-over");
    reorderQueue(+e.dataTransfer.getData("text/plain"),+row.dataset.i);
  });
}
