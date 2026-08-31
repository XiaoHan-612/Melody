// menu.js — 通用弹出菜单（行操作菜单，M4 右键菜单复用）
import { $, esc } from "./utils.js";

export function hideMenu(){var m=$("contextMenu");m.classList.remove("show");m.innerHTML=""}
export function showMenu(x,y,items){
  var m=$("contextMenu");
  var h="";
  items.forEach(function(it,idx){
    if(it.sep){h+='<div class="menu-sep"></div>';return}
    h+='<button class="menu-item'+(it.danger?" danger":"")+'" data-i="'+idx+'">'+esc(it.label)+"</button>";
  });
  m.innerHTML=h;
  m.querySelectorAll(".menu-item").forEach(function(btn){
    btn.addEventListener("click",function(){
      var it=items[+btn.dataset.i];
      hideMenu();
      if(it.fn)it.fn();
    });
  });
  m.style.left=x+"px";m.style.top=y+"px";
  m.classList.add("show");
  // 防止菜单超出屏幕
  var r=m.getBoundingClientRect();
  if(r.right>window.innerWidth-8)m.style.left=Math.max(8,x-r.width)+"px";
  if(r.bottom>window.innerHeight-8)m.style.top=Math.max(8,y-r.height)+"px";
}
