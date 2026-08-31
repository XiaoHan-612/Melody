// playlist.js — 多歌单管理 + 收藏 + 最近播放
import { api, postApi } from "./api.js";
import { $, esc, toast } from "./utils.js";
import { S } from "./state.js";
import { renderList, renderPlaylistGrid } from "./render.js";
import { showMenu } from "./menu.js";

function savePls(){postApi("/api/playlists",{playlists:S.pls},function(e){if(e)toast("保存失败")})}
export function persistPl(){savePls()}
function newPl(name){return{id:"pl-"+Date.now().toString(36)+Math.floor(Math.random()*999),name:name,songs:[],created_at:Date.now(),updated_at:Date.now()}}
export function findPl(id){for(var i=0;i<S.pls.length;i++)if(S.pls[i].id===id)return S.pls[i];return null}
export function currentPl(){return findPl(S.plId)||S.pls[0]||null}

// 由 app.js 注入标签页切换函数（避免循环依赖）
var switchTabFn=null;
export function setSwitchTabFn(fn){switchTabFn=fn}

export function loadPls(){
  api("/api/playlists",function(e,d){
    if(e){toast("歌单加载失败");return}
    S.pls=d&&d.playlists||[];
    if(!S.pls.length){S.pls=[newPl("我的歌单")];savePls()}
    if(!S.plId||!findPl(S.plId))S.plId=S.pls[0].id;
    renderPlSidebar();
    if(S.tab==="playlist")showPlaylistTab();
  });
}

// ── 歌单操作 ──
export function addPl(){var name=prompt("新歌单名称","新歌单");if(!name||!name.trim())return;S.pls.push(newPl(name.trim()));savePls();renderPlSidebar();toast("已创建歌单")}
export function addPlNamed(name,song){S.pls.push(newPl(name));var pl=S.pls[S.pls.length-1];pl.songs.push(song);savePls();renderPlSidebar();toast("已添加到「"+name+"」")}
export function renamePl(id){var pl=findPl(id);if(!pl)return;var name=prompt("重命名歌单",pl.name);if(!name||!name.trim())return;pl.name=name.trim();pl.updated_at=Date.now();savePls();renderPlSidebar();if(S.tab==="playlist")showPlaylistTab()}
export function delPl(id){
  if(S.pls.length<=1){toast("至少保留一个歌单");return}
  var pl=findPl(id);if(!pl)return;
  if(!confirm("删除歌单「"+pl.name+"」？歌曲不会从收藏/最近播放中移除。"))return;
  S.pls=S.pls.filter(function(p){return p.id!==id});
  if(S.plId===id){S.plId=S.pls[0].id;S.plView="grid"}
  savePls();renderPlSidebar();
  if(S.tab==="playlist")showPlaylistTab();
}
export function switchPl(id){S.plId=id;S.plView="list";if(S.tab!=="playlist"){if(switchTabFn)switchTabFn("playlist")}else showPlaylistTab()}
export function backToGrid(){S.plView="grid";showPlaylistTab()}

export function showPlaylistTab(){
  var pl=currentPl();
  renderPlSidebar();
  if(S.plView==="grid"){
    $("pageTitle").textContent="我的歌单";
    $("pageSub").textContent=S.pls.length+" 个歌单";
    renderPlaylistGrid();
  }else if(pl){
    $("pageTitle").innerHTML='<span class="back-link" id="plBackLink">← 全部歌单</span><span id="plTitleSpan">'+esc(pl.name)+"</span>";
    var bl=$("plBackLink");bl.addEventListener("click",backToGrid);
    $("pageSub").textContent=pl.songs.length+" 首歌曲";
    S.pl=pl.songs;
    renderList(S.pl,"playlist");
  }
}

// 侧边栏歌单列表
export function renderPlSidebar(){
  var c=$("plList");if(!c)return;
  var h="";
  S.pls.forEach(function(p){
    h+='<div class="nav-item pl-item'+(p.id===S.plId&&S.tab==="playlist"?' active':'')+'" data-pl="'+esc(p.id)+'">'
      +'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
      +'<span class="nav-label pl-name">'+esc(p.name)+'</span>'
      +'<span class="badge">'+p.songs.length+"</span>"
      +"</div>";
  });
  c.innerHTML=h;
  c.querySelectorAll(".pl-item").forEach(function(el){
    el.addEventListener("click",function(){switchPl(el.dataset.pl)});
    el.addEventListener("contextmenu",function(e){
      e.preventDefault();
      var id=el.dataset.pl;
      showMenu(e.clientX,e.clientY,[
        {label:"打开",fn:function(){switchPl(id)}},
        {label:"重命名",fn:function(){renamePl(id)}},
        {label:"删除歌单",danger:true,fn:function(){delPl(id)}},
      ]);
    });
  });
}

// ── 歌曲增删改（作用于当前歌单）──
export function addToPl(song,plId){
  var pl=plId?findPl(plId):currentPl();if(!pl)return;
  if(pl.songs.some(function(s){return s.id===song.id&&s.source===song.source})){toast("已在歌单「"+pl.name+"」中");return}
  pl.songs.push(song);pl.updated_at=Date.now();savePls();
  renderPlSidebar();
  if(S.tab==="playlist"&&S.plId===pl.id&&S.plView==="list")showPlaylistTab();
  toast("已添加到「"+pl.name+"」");
}
export function rmFromPl(i){
  var pl=currentPl();if(!pl)return;
  pl.songs.splice(i,1);pl.updated_at=Date.now();savePls();
  renderPlSidebar();
  if(S.tab==="playlist")showPlaylistTab();
  toast("已移除");
}
export function movePlUp(i){
  var pl=currentPl();if(!pl||i<=0)return;
  var t=pl.songs[i];pl.songs[i]=pl.songs[i-1];pl.songs[i-1]=t;
  pl.updated_at=Date.now();savePls();showPlaylistTab();
}
export function movePlDown(i){
  var pl=currentPl();if(!pl||i>=pl.songs.length-1)return;
  var t=pl.songs[i];pl.songs[i]=pl.songs[i+1];pl.songs[i+1]=t;
  pl.updated_at=Date.now();savePls();showPlaylistTab();
}

// 导入 / 导出歌单
export function exportPls(){
  var data=JSON.stringify({version:1,playlists:S.pls},null,2);
  var blob=new Blob([data],{type:"application/json"});
  var a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="MelodyV3-歌单-"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(a.href);
  toast("已导出歌单");
}
export function importPls(file){
  var reader=new FileReader();
  reader.onload=function(){
    try{
      var d=JSON.parse(reader.result);
      var arr=d&&d.playlists?d.playlists:(Array.isArray(d)?d:null);
      if(!arr){toast("文件格式不正确");return}
      arr.forEach(function(p){
        if(!p||!p.name)return;
        S.pls.push({id:newPl(p.name).id,name:p.name,songs:p.songs||[],created_at:Date.now(),updated_at:Date.now()});
      });
      savePls();renderPlSidebar();
      toast("已导入 "+arr.length+" 个歌单");
    }catch(e){toast("导入失败：文件不是有效 JSON")}
  };
  reader.readAsText(file);
}

// ── 最近播放 ──
export function addRecent(song){S.recent=S.recent.filter(function(s){return!(s.id===song.id&&s.source===song.source)});S.recent.unshift(song);if(S.recent.length>50)S.recent=S.recent.slice(0,50);try{localStorage.setItem("melody_recent",JSON.stringify(S.recent))}catch(e){}if(S.tab==="recent")renderList(S.recent,"recent")}
export function loadRecent(){try{return JSON.parse(localStorage.getItem("melody_recent")||"[]")}catch(e){return[]}}

// ── 收藏 ♥（本地存储）──
export function loadFav(){try{return JSON.parse(localStorage.getItem("melody_fav")||"[]")}catch(e){return[]}}
export function isFav(song){return S.fav.some(function(s){return s.id===song.id&&s.source===song.source})}
export function toggleFav(song){
  var i=S.fav.findIndex(function(s){return s.id===song.id&&s.source===song.source});
  if(i>=0){S.fav.splice(i,1);toast("已取消收藏")}
  else{S.fav.push(song);toast("已收藏 ♥")}
  try{localStorage.setItem("melody_fav",JSON.stringify(S.fav))}catch(e){}
  updateFavBtn();
  var fc=$("favCount");if(fc)fc.textContent=S.fav.length;
  document.querySelectorAll(".track-row").forEach(function(el){
    var btn=el.querySelector('[data-act="fav"]');
    if(btn){
      var idx=+el.dataset.index,list=el.dataset.type==="search"?S.results:el.dataset.type==="recent"?S.recent:el.dataset.type==="favlist"?S.fav:null;
      if(list&&list[idx]&&list[idx].id===song.id&&list[idx].source===song.source)btn.classList.toggle("faved",i<0);
    }
  });
}
export function updateFavBtn(){var b=$("btnFav"),ib=$("ilFavBtn");var on=S.song&&isFav(S.song);if(b){b.classList.toggle("faved",on);b.title=on?"取消收藏":"收藏"}if(ib){ib.classList.toggle("faved",on);ib.textContent=on?"♥":"♡"}}
