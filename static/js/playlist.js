// playlist.js — 歌单服务（多歌单数据操作 + 收藏 + 最近播放）
// 服务层：只做数据变更（setState + API 持久化），不 import 任何视图模块；
// 侧边栏/网格/列表的刷新由 app.js 中的 store 订阅驱动。
import { api, postApi } from "./api.js";
import { $, toast } from "./utils.js";
import { S } from "./state.js";
import { setState, touch } from "./store.js";

function savePls(){postApi("/api/playlists",{playlists:S.pls},function(e){if(e)toast("保存失败")})}
function newPl(name){return{id:"pl-"+Date.now().toString(36)+Math.floor(Math.random()*999),name:name,songs:[],created_at:Date.now(),updated_at:Date.now()}}
export function findPl(id){for(var i=0;i<S.pls.length;i++)if(S.pls[i].id===id)return S.pls[i];return null}
export function currentPl(){return findPl(S.plId)||S.pls[0]||null}

export function loadPls(){
  api("/api/playlists",function(e,d){
    if(e){toast("歌单加载失败");return}
    var pls=d&&d.playlists||[];
    if(!pls.length)pls=[newPl("我的歌单")];
    var plId=S.plId&&pls.some(function(p){return p.id===S.plId})?S.plId:pls[0].id;
    setState({pls:pls,plId:plId});
    if(!d||!d.playlists||!d.playlists.length)savePls();
  });
}

// ── 歌单操作 ──
export function addPl(){
  var name=prompt("新歌单名称","新歌单");
  if(!name||!name.trim())return;
  var pls=S.pls.concat([newPl(name.trim())]);
  setState({pls:pls});
  savePls();
  toast("已创建歌单");
}
export function addPlNamed(name,song){
  var pl=newPl(name);
  pl.songs.push(song);
  var pls=S.pls.concat([pl]);
  setState({pls:pls});
  savePls();
  toast("已添加到「"+name+"」");
}
export function renamePl(id){
  var pl=findPl(id);if(!pl)return;
  var name=prompt("重命名歌单",pl.name);
  if(!name||!name.trim())return;
  pl.name=name.trim();pl.updated_at=Date.now();
  touch("pls");
  savePls();
}
export function delPl(id){
  if(S.pls.length<=1){toast("至少保留一个歌单");return}
  var pl=findPl(id);if(!pl)return;
  if(!confirm("删除歌单「"+pl.name+"」？歌曲不会从收藏/最近播放中移除。"))return;
  var pls=S.pls.filter(function(p){return p.id!==id});
  var patch={pls:pls};
  if(S.plId===id){patch.plId=pls[0].id;patch.plView="grid"}
  setState(patch);
  savePls();
}
export function switchPl(id){setState({plId:id,plView:"list"})}
export function backToGrid(){setState({plView:"grid"})}

// ── 歌曲增删改（作用于当前歌单；S.pl 是当前歌单 songs 的引用）──
export function addToPl(song,plId){
  var pl=plId?findPl(plId):currentPl();if(!pl)return;
  if(pl.songs.some(function(s){return s.id===song.id&&s.source===song.source})){toast("已在歌单「"+pl.name+"」中");return}
  pl.songs.push(song);pl.updated_at=Date.now();savePls();
  touch("pls");
  toast("已添加到「"+pl.name+"」");
}
export function rmFromPl(i){
  var pl=currentPl();if(!pl)return;
  pl.songs.splice(i,1);pl.updated_at=Date.now();savePls();
  touch("pls");
  toast("已移除");
}
export function reorderPl(from,to){
  var pl=currentPl();if(!pl||from===to)return;
  var item=pl.songs.splice(from,1)[0];
  pl.songs.splice(to,0,item);
  pl.updated_at=Date.now();savePls();
  touch("pls");
  toast("已调整顺序");
}
export function movePlUp(i){if(i>0)reorderPl(i,i-1)}
export function movePlDown(i){if(currentPl()&&i<currentPl().songs.length-1)reorderPl(i,i+1)}

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
      var added=0;
      arr.forEach(function(p){
        if(!p||!p.name)return;
        S.pls.push({id:newPl(p.name).id,name:p.name,songs:p.songs||[],created_at:Date.now(),updated_at:Date.now()});
        added++;
      });
      if(added){touch("pls");savePls()}
      toast("已导入 "+added+" 个歌单");
    }catch(e){toast("导入失败：文件不是有效 JSON")}
  };
  reader.readAsText(file);
}

// ── 最近播放 ──
export function addRecent(song){
  var recent=S.recent.filter(function(s){return!(s.id===song.id&&s.source===song.source)});
  recent.unshift(song);
  if(recent.length>50)recent=recent.slice(0,50);
  setState({recent:recent});
  try{localStorage.setItem("melody_recent",JSON.stringify(recent))}catch(e){}
}
export function loadRecent(){try{return JSON.parse(localStorage.getItem("melody_recent")||"[]")}catch(e){return[]}}

// ── 收藏 ♥（本地存储）──
export function loadFav(){try{return JSON.parse(localStorage.getItem("melody_fav")||"[]")}catch(e){return[]}}
export function isFav(song){return S.fav.some(function(s){return s.id===song.id&&s.source===song.source})}
export function toggleFav(song){
  var fav=S.fav.slice();
  var i=fav.findIndex(function(s){return s.id===song.id&&s.source===song.source});
  if(i>=0){fav.splice(i,1);toast("已取消收藏")}
  else{fav.push(song);toast("已收藏 ♥")}
  setState({fav:fav});
  try{localStorage.setItem("melody_fav",JSON.stringify(fav))}catch(e){}
}
