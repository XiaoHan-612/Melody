// state.js — 全局状态与常量
export var ICON_PLAY='<path d="M8 5v14l11-7z"/>';
export var ICON_PAUSE='<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';
export var MODE_LABELS={seq:"顺序播放",loop:"列表循环",single:"单曲循环",shuffle:"随机播放"};
export var MODE_ORDER=["seq","loop","single","shuffle"];
export var MODE_ICONS={seq:'<path d="M3 6h14M3 12h14M3 18h14"/><path d="M17 6l4 6-4 6"/>',loop:'<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',single:'<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><circle cx="12" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 14h3" stroke="currentColor" stroke-width="1.2"/>',shuffle:'<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'};
export var SOURCE_LABELS={kg:"酷狗",ne:"网易云",bl:"B站"};
// Lucide 风格图标（stroke 统一 1.8）
export var ICONS={
  heart:'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  dots:'<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
};
export var audio=document.getElementById("audio");audio.volume=0.5;
export var S={tab:"search",src:"all",kw:"",page:1,results:[],pl:[],recent:[],fav:[],song:null,idx:-1,play:false,mode:"loop",speed:1,muted:false,prevVol:0.5,lines:[],lyricIdx:-1,lyricVis:true,lyricOff:0,lyricsOpen:false};
