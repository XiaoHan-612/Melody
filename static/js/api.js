// api.js — HTTP 封装
export function api(p,cb){fetch(p).then(function(r){return r.json()}).then(function(d){cb(null,d)}).catch(function(e){cb(e)})}
export function postApi(p,d,cb){fetch(p,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}).then(function(r){return r.json()}).then(function(d2){cb(null,d2)}).catch(function(e){cb(e)})}
