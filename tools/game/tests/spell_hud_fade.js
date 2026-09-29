// The spell panel appears on selection, cast, recharge, stream or low mana,
// then fades so the lower-right corner stays clear. Exercises the production
// HUD in the shipping game host on a controlled game clock.
(function () {
  var G=(0,eval)('this'),output=(__engine==='node'||__engine==='deno')?console.log.bind(console):__out,checked=0;
  var host=slurp('tools/game/tests/cave_occlusion_integration.js');
  var end=host.indexOf('  function check(name, okay) {');
  if(end<0)throw Error('shipping game host boundary missing');
  (0,eval)(host.slice(0,end)+'G.__hudErrors=errors; }());');
  function check(name,okay){if(!okay)throw Error(name);checked++;output('PASS '+name);}
  if(__argv.indexOf('--always-show-spell')>=0)G.spellHudAlpha=function(){return 1;};
  G.ENDLESS_MODE=G.running=true;G.gameOverState=false;G.terrain='plains';G.resetEndlessMode();
  G.MODE3D=true;G.menuOpen=G.settingsOpen=G.shopOpen=false;
  var spell=G.getCurrentSpell(),texts=[];
  var recorder={globalAlpha:1};
  G.ctx=new Proxy(recorder,{get:function(target,key){
    if(key in target)return target[key];
    if(key==='measureText')return function(s){return {width:String(s).length*6};};
    if(key==='fillText')return function(text){texts.push({text:String(text),alpha:target.globalAlpha});};
    if(key==='createLinearGradient'||key==='createRadialGradient')return function(){return {addColorStop:function(){}};};
    return function(){};
  },set:function(target,key,value){target[key]=value;return true;}});
  // Game time is set directly; wall time is pushed far ahead to prove it is unused.
  G._gameClockOriginMs=0;
  var realNow=Date.now;Date.now=function(){return realNow()+9e9;};
  function hud(time){G._gameClockElapsedMs=time;texts=[];recorder.globalAlpha=1;G.drawHudOverlay();
    var entry=texts.filter(function(t){return t.text===spell.name;})[0];return entry?entry.alpha:0;}
  try {
    check('game host draws the real HUD with the equipped spell',!!spell&&typeof G.drawHudOverlay==='function');
    G.mana=G.MANA_MAX;G.flameStreamActive=false;G.lastShotMs=0;G.lastSpellChangeMs=10000;
    check('panel shows fully when a spell is selected',hud(10000)===1&&hud(12400)===1);
    var fading=hud(12800);
    check('idle panel fades after its hold instead of staying on screen',fading>0&&fading<1&&hud(13200)===0);
    check('other HUD text still draws while the spell panel is hidden',texts.some(function(t){return /HEALTH/i.test(t.text);}));
    G.lastShotMs=20000;
    check('casting brings the panel back and keeps it while recharging',hud(20010)===1&&hud(20300)===1);
    check('after recharging the panel fades on the same hold',hud(22400)===1&&hud(23200)===0);
    G.lastSpellChangeMs=30000;
    check('changing spell shows the panel again',hud(30000)===1&&hud(33500)===0);
    G.mana=0;
    check('low mana keeps the warning visible however long it has been idle',hud(60000)===1&&
      texts.some(function(t){return t.text==='Low mana'&&t.alpha===1;}));
    G.mana=G.MANA_MAX;G.flameStreamActive=true;
    check('an active stream keeps the panel visible',hud(70000)===1);
    G.flameStreamActive=false;
    check('fade follows game time, not wall-clock time, so pausing holds it',hud(31000)===1&&hud(31000)===1&&G.__hudErrors.length===0);
    output('SPELL_HUD_RESULT PASS '+checked);
  } finally {Date.now=realNow;}
}());
undefined;
