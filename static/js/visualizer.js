// visualizer.js — 频谱可视化（底部波形）
import { $ } from "./utils.js";
import { audio } from "./state.js";

export var analyser,freqData,wInited=false;
export function initWave(){if(wInited)return;try{var ac=new(window.AudioContext||window.webkitAudioContext)();ac.resume();analyser=ac.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=0.7;var src=ac.createMediaElementSource(audio);src.connect(analyser);analyser.connect(ac.destination);freqData=new Uint8Array(analyser.frequencyBinCount);wInited=true}catch(e){}}
export var mwc,mwCtx;
export function initMW(){mwc=$("mainWaveform");if(mwc)mwCtx=mwc.getContext("2d")}
var mwW=0;
export function drawMW(){
  if(!mwc||document.hidden)return; // 页面隐藏时停止装饰动画
  if(!mwCtx)mwCtx=mwc.getContext("2d");
  var w=window.innerWidth,h=60;
  if(w!==mwW){mwc.width=w;mwW=w} // 尺寸仅在变化时设置（每帧重设会重分配后备缓冲）
  if(w<10)return;var ctx=mwCtx,t=Date.now()*.001;ctx.clearRect(0,0,w,h);var has=analyser&&freqData;if(has)analyser.getByteFrequencyData(freqData);var bc=100,bw=w/bc,bg=2;for(var i=0;i<bc;i++){var fv=0;if(has){var fi=Math.floor((i/bc)*freqData.length*.7);fv=freqData[fi]/255}else{fv=.03+Math.sin(i*.12+t*1.5)*.02+Math.sin(i*.08+t*.8)*.015}var bh=Math.max(2,fv*h*.85),x=i*bw+bg/2,y=h-bh;var gr=ctx.createLinearGradient(x,h,x,y);gr.addColorStop(0,"rgba(0,122,255,.06)");gr.addColorStop(.4,"rgba(0,122,255,.5)");gr.addColorStop(.7,"rgba(64,156,255,.75)");gr.addColorStop(1,"rgba(100,180,255,.9)");ctx.fillStyle=gr;ctx.fillRect(x,y,bw-bg,bh);if(fv>.1){ctx.beginPath();ctx.arc(x+(bw-bg)/2,y,1.5,0,6.28);ctx.fillStyle="rgba(128,200,255,"+fv*.6+")";ctx.fill()}}}
