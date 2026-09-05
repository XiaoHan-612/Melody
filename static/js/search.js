// search.js — 搜索 / 历史 / 分页
import { $, esc, toast } from "./utils.js";
import { api } from "./api.js";
import { S } from "./state.js";
import { setState } from "./store.js";
import { renderList, showEmpty, showLoading } from "./render.js";

export function getHist(){try{return JSON.parse(localStorage.getItem("melody_sh")||"[]")}catch(e){return[]}}
export function addHist(k){if(!k.trim())return;var h=getHist().filter(function(x){return x!==k});h.unshift(k);if(h.length>10)h=h.slice(0,10);localStorage.setItem("melody_sh",JSON.stringify(h))}
export function renderHist(){var c=$("trackList"),h=getHist();if(!h.length){showEmpty();return}var html='<div style="padding:8px 0"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:14px;font-weight:600">搜索历史</span><button data-action="clearHist" style="border:none;background:none;color:var(--text3);font-size:12px;cursor:pointer">清空</button></div><div style="display:flex;flex-wrap:wrap;gap:8px">';h.forEach(function(k){html+='<span class="hist-chip" data-kw="'+esc(k)+'" style="padding:6px 14px;border-radius:16px;background:var(--hover);color:var(--text2);font-size:12px;cursor:pointer;transition:all .2s">'+esc(k)+'</span>'});html+='</div></div>';c.innerHTML=html}

var sTimer,searchSeq=0;
export function search(kw,page,append){
  if(!kw.trim()){showEmpty();return}
  page=page||1;
  setState({kw:kw});
  showLoading();
  var seq=++searchSeq; // 竞态守卫：丢弃过期响应
  var u="/api/search?keyword="+encodeURIComponent(kw)+"&page="+page;
  if(S.src!=="all")u+="&source="+S.src;
  api(u,function(e,songs){
    if(seq!==searchSeq)return;
    if(e){toast("搜索失败");showEmpty();return}
    songs=songs||[];
    var patch={page:page,results:append?S.results.concat(songs):songs};
    setState(patch);
    $("pageTitle").textContent="搜索结果";
    $("pageSub").textContent='搜索 "'+kw+'" 共 '+S.results.length+" 首";
    renderList(S.results,"search");
    renderLoadMore(songs.length===20);
  });
}
export function renderLoadMore(hasMore){var old=document.getElementById("loadMoreBtn");if(old)old.remove();if(!hasMore||S.tab!=="search"||!S.results.length)return;var b=document.createElement("div");b.id="loadMoreBtn";b.className="load-more";b.textContent="加载更多";b.addEventListener("click",function(){search(S.kw,S.page+1,true)});$("trackList").appendChild(b)}
export function searchHist(k){$("searchInput").value=k;search(k)}

// 搜索相关事件绑定
export function initSearchEvents(){
  $("searchInput").addEventListener("input",function(e){clearTimeout(sTimer);sTimer=setTimeout(function(){if(S.tab==="search"){if(e.target.value.trim())search(e.target.value);else renderHist()}},200)});
  $("searchInput").addEventListener("keydown",function(e){if(e.key==="Enter"&&e.target.value.trim()){addHist(e.target.value.trim());search(e.target.value)}});
  $("searchInput").addEventListener("focus",function(){if(!this.value.trim()&&S.tab==="search")renderHist()});
  $("trackList").addEventListener("click",function(e){var chip=e.target.closest(".hist-chip");if(chip){var k=chip.dataset.kw;$("searchInput").value=k;searchHist(k)}});
}
