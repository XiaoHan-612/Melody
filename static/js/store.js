// store.js — 极简响应式状态管理
// S（state.js）是唯一状态容器，读取直接用 S.field；
// 所有写入必须走 setState：合并写入后按 key 通知订阅者（微任务批处理）。
// 服务层只改状态，视图层订阅状态——"改了状态忘刷界面"和"UI 层改数据"两类 bug 被结构性消灭。

import { S } from "./state.js";

var subs = [];            // { keys:Set|null, fn }  keys 为 null 表示全量通知
var dirty = new Set();    // 本轮待通知的 key
var flushScheduled = false;

export function getState(){ return S }

// setState(partial)：partial 为对象或 (S)=>patch 函数
export function setState(partial){
  var patch = typeof partial==="function" ? partial(S) : partial;
  var keys = Object.keys(patch);
  for(var i=0;i<keys.length;i++) S[keys[i]] = patch[keys[i]];
  for(var j=0;j<keys.length;j++) dirty.add(keys[j]);
  if(!flushScheduled){
    flushScheduled = true;
    Promise.resolve().then(flush);
  }
}

// 通知某个 key 的订阅者（用于原地变更数组后手动触发，如 push/splice 之后）
export function touch(key){ dirty.add(key); scheduleFlush(); }

function scheduleFlush(){
  if(flushScheduled) return;
  flushScheduled = true;
  Promise.resolve().then(flush);
}

function flush(){
  flushScheduled = false;
  if(!dirty.size) return;
  var ks = Array.from(dirty);
  dirty.clear();
  for(var j=0;j<subs.length;j++){
    var sub = subs[j];
    if(!sub.keys){ sub.fn(S); continue }
    for(var k=0;k<ks.length;k++){
      if(sub.keys.has(ks[k])){ sub.fn(S); break }
    }
  }
}

// subscribe(keys|null, fn)：返回取消订阅函数。
// keys 为 null 时任何变更都通知；否则只在变更 key 命中时通知。
export function subscribe(keys, fn){
  var sub = { keys: keys ? new Set(keys) : null, fn: fn };
  subs.push(sub);
  return function(){
    var i = subs.indexOf(sub);
    if(i>=0) subs.splice(i,1);
  };
}
