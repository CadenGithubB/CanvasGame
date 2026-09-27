var __logs = [];
var __quiet = true;
var console = { log: function(){ if(!__quiet) print(Array.prototype.join.call(arguments,' ')); __logs.push(Array.prototype.join.call(arguments,' ')); }, warn: function(){}, error: function(){ print('[console.error] ' + Array.prototype.join.call(arguments,' ')); }, info:function(){}, debug:function(){}, table:function(){}, group:function(){}, groupEnd:function(){} };
var window = this; var self = this; var globalThis_ = this;
function __mkStub(name, props) {
  var store = props || {};
  var fn = function(){};
  return new Proxy(fn, {
    get: function(t, k) {
      if (k === Symbol.toPrimitive) return function(hint){ return hint === 'string' ? '' : 0; };
      if (k === 'toString') return function(){ return ''; };
      if (k === 'valueOf') return function(){ return 0; };
      if (k === 'length') return (k in store) ? store[k] : 0;
      if (k === 'then') return undefined;
      if (k in store) return store[k];
      var s = __mkStub(name + '.' + String(k));
      store[k] = s; return s;
    },
    set: function(t, k, v) { store[k] = v; return true; },
    has: function(t, k) { return true; },
    apply: function() { return __mkStub(name + '()'); },
    construct: function() { return __mkStub('new ' + name); }
  });
}
function __mkCanvas() {
  var c2d = __mkStub('ctx', { measureText: function(){ return {width: 10}; },
     createLinearGradient: function(){ return __mkStub('grad', {addColorStop:function(){}}); },
     createRadialGradient: function(){ return __mkStub('grad', {addColorStop:function(){}}); },
     createPattern: function(){ return __mkStub('pattern'); },
     getImageData: function(x,y,w,h){ w = w|0; h = h|0; return {data: new Uint8ClampedArray(Math.max(0,w*h*4)), width:w, height:h}; },
     createImageData: function(w,h){ w=w|0;h=h|0; return {data: new Uint8ClampedArray(Math.max(0,w*h*4)), width:w, height:h}; } });
  var cv = __mkStub('canvas', { width: 360, height: 240, getContext: function(){ return c2d; }, style: __mkStub('style'),
     addEventListener: function(){}, getBoundingClientRect: function(){ return {left:0,top:0,width:360,height:240}; } });
  return cv;
}
var __elems = {};
var document = {
  getElementById: function(id) {
    if (!__elems[id]) {
      if (id === 'maze' || /canvas/i.test(id)) __elems[id] = __mkCanvas();
      else __elems[id] = __mkStub('el#' + id, { addEventListener: function(){}, style: __mkStub('style'), checked: false, value: '', textContent: '', innerHTML: '', classList: __mkStub('cl') });
    }
    return __elems[id];
  },
  createElement: function(tag) { return (tag === 'canvas') ? __mkCanvas() : __mkStub('el<' + tag + '>', { style: __mkStub('style'), addEventListener:function(){}, appendChild:function(){} }); },
  addEventListener: function(){}, removeEventListener: function(){},
  body: __mkStub('body', { appendChild: function(){} }),
  querySelector: function(){ return null; }, querySelectorAll: function(){ return []; },
  fullscreenElement: null, pointerLockElement: null, hidden: false
};
window.addEventListener = function(){}; window.removeEventListener = function(){};
window.innerWidth = 1280; window.innerHeight = 720; window.devicePixelRatio = 1;
var screen = {width:1280, height:720};
var navigator = { getGamepads: function(){ return []; }, userAgent: 'jsc' };
var performance = { now: function(){ return Date.now(); } };
var __timers = [];
function setTimeout(fn, ms){ __timers.push(fn); return __timers.length; }
function clearTimeout(){} function setInterval(){ return 0; } function clearInterval(){}
function requestAnimationFrame(fn){ return 0; } function cancelAnimationFrame(){}
function alert(){}
var hw = { fetchJSON: function(){ return new Promise(function(){}); }, postFormText: function(){ return new Promise(function(){}); }, fetchText: function(){ return new Promise(function(){}); } };
