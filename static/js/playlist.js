// playlist.js — 歌单与最近播放
import { api, postApi } from "./api.js";
import { $, toast } from "./utils.js";
import { S } from "./state.js";
import { renderList } from "./render.js";

export function loadPl(){api("/api/playlist",function(e,d){if(e)return;S.pl=d||[];$("playlistCount").textContent=S.pl.length;if(S.tab==="playlist")renderList(S.pl,"playlist")})}
export function savePl(){postApi("/api/playlist",S.pl,function(e){if(e)toast("保存失败")})}
export function addToPl(song){if(S.pl.some(function(s){return s.id===song.id&&s.source===song.source})){toast("已在歌单中");return}S.pl.push(song);savePl();$("playlistCount").textContent=S.pl.length;toast("已添加到歌单")}
export function rmFromPl(i){S.pl.splice(i,1);savePl();$("playlistCount").textContent=S.pl.length;if(S.tab==="playlist")renderList(S.pl,"playlist");toast("已移除")}
export function movePlUp(i){if(i<=0)return;var t=S.pl[i];S.pl[i]=S.pl[i-1];S.pl[i-1]=t;savePl();renderList(S.pl,"playlist")}
export function movePlDown(i){if(i>=S.pl.length-1)return;var t=S.pl[i];S.pl[i]=S.pl[i+1];S.pl[i+1]=t;savePl();renderList(S.pl,"playlist")}
export function addRecent(song){S.recent=S.recent.filter(function(s){return!(s.id===song.id&&s.source===song.source)});S.recent.unshift(song);if(S.recent.length>50)S.recent=S.recent.slice(0,50);try{localStorage.setItem("melody_recent",JSON.stringify(S.recent))}catch(e){}if(S.tab==="recent")renderList(S.recent,"recent")}
export function loadRecent(){try{return JSON.parse(localStorage.getItem("melody_recent")||"[]")}catch(e){return[]}}

// ── 收藏 ♥（本地存储，M5 迁移到服务端歌单库）──
export function loadFav(){try{return JSON.parse(localStorage.getItem("melody_fav")||"[]")}catch(e){return[]}}
export function isFav(song){return S.fav.some(function(s){return s.id===song.id&&s.source===song.source})}
export function toggleFav(song){
  var i=S.fav.findIndex(function(s){return s.id===song.id&&s.source===song.source});
  if(i>=0){S.fav.splice(i,1);toast("已取消收藏")}
  else{S.fav.push(song);toast("已收藏 ♥")}
  try{localStorage.setItem("melody_fav",JSON.stringify(S.fav))}catch(e){}
  updateFavBtn();
  // 同步列表行按钮状态
  document.querySelectorAll(".track-row").forEach(function(el){
    var btn=el.querySelector('[data-act="fav"]');
    if(btn&&el.dataset.type!=="playlist"){
      var idx=+el.dataset.index,list=el.dataset.type==="search"?S.results:S.recent;
      if(list[idx]&&list[idx].id===song.id&&list[idx].source===song.source)btn.classList.toggle("faved",i<0);
    }
  });
}
export function updateFavBtn(){var b=$("btnFav"),ib=$("ilFavBtn");var on=S.song&&isFav(S.song);if(b){b.classList.toggle("faved",on);b.title=on?"取消收藏":"收藏"}if(ib){ib.classList.toggle("faved",on);ib.textContent=on?"♥":"♡"}}
