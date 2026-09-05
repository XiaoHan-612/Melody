// api.js — HTTP 封装（非 2xx 一律走错误回调，防止 {"error":...} 被当成功数据）
export function api(p,cb){fetch(p).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(function(d){cb(null,d)}).catch(function(e){cb(e)})}
export function postApi(p,d,cb){fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()}).then(function(d2){cb(null,d2)}).catch(function(e){cb(e)})}
