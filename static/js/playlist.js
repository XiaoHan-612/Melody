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
