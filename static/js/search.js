// search.js — 搜索 / 历史 / 分页
import { $, esc, toast } from "./utils.js";
import { api } from "./api.js";
import { S, SOURCE_LABELS } from "./state.js";
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
  // 恒查全部源：来源筛选在本地对 cache 过滤（瞬时且不受单源上游失败影响）
  var u="/api/search?keyword="+encodeURIComponent(kw)+"&page="+page;
  api(u,function(e,songs){
    if(seq!==searchSeq)return;
    // Array.isArray 防御：任何非数组响应（如后端 {"error":...}）都按失败处理
    if(e||!Array.isArray(songs)){toast("搜索失败");showEmpty();return}
    var cache=append?S.cache.concat(songs):songs;
    setState({page:page,cache:cache});
    applySrcFilter();
    $("pageTitle").textContent="搜索结果";
    $("pageSub").textContent='搜索 "'+kw+'" 共 '+S.results.length+" 首";
    renderList(S.results,"search");
    renderLoadMore(songs.length===20);
  });
}

// 来源筛选：对缓存做本地过滤并更新结果视图（由 app.js 的 filterSrc 调用）
export function applySrcFilter(){
  setState({results:S.src==="all"?S.cache:S.cache.filter(function(s){return s.source===S.src})});
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
