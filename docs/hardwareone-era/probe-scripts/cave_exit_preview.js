(function () {
  var panel = document.createElement('section');
  panel.style.cssText = 'padding:12px;border:1px solid #778;background:#181c24';
  panel.innerHTML = '<b>Task-local cave exit walk QA</b> <button id="exitReset">Reset exit walk</button> <button id="exitAdvance">Walk next marker</button> <button id="exitYawLeft">Look 30° left</button> <button id="exitYawRight">Look 30° right</button> <button id="exitYawStraight">Look straight out</button><pre id="exitResult" role="log" aria-label="Exit walk result"></pre><div id="exitFrames" style="display:flex;flex-wrap:wrap;gap:8px"></div>';
  document.body.insertBefore(panel, document.body.firstChild);
  var markers = [90,0,-70,-180,-300,-480,-650], index=0, entry=null, ticks=0;
  function inward() {
    return (pos.x+windowOriginX-entry.x)*Math.cos(entry.angle)+(pos.y+windowOriginY-entry.y)*Math.sin(entry.angle);
  }
  function capture(label) {
    renderFrame();
    var C=getCam3D(), state={label:label,seed:WORLD_SEED,kind:entry.kind,index:index,
      inward:inward(),feetH:getPlayerFloorH(),cameraRenderZ:C.cameraZ,
      underground:playerUnderground,noclip:NOCLIP,physicsTicks:ticks,
      width:canvas.width,height:canvas.height};
    document.getElementById('exitResult').textContent=JSON.stringify(state,null,2);
    var card=document.createElement('div'), caption=document.createElement('div'), shot=document.createElement('canvas');
    caption.textContent=label+' · floor '+state.feetH.toFixed(2)+' · u '+state.inward.toFixed(1);
    shot.width=canvas.width;shot.height=canvas.height;
    shot.getContext('2d').drawImage(canvas,0,0);
    card.appendChild(caption);card.appendChild(shot);document.getElementById('exitFrames').appendChild(card);
  }
  document.getElementById('exitReset').onclick=function () {
    if(!CAVE_TEST_MODE) { document.getElementById('terrainSelect').value='cavetest'; document.getElementById('terrainSelect').dispatchEvent(new Event('change')); }
    stopGame(); running=false;_loopGen++;
    document.getElementById('ctVisibilityFixtures').checked=false;
    previewCaveView('back'); stopGame(); running=false;_loopGen++;
    entry=endlessCaveNetworks['0,0'].entrances[0];index=0;ticks=0;
    cam.ang=entry.angle+Math.PI;cam.pitch=0;
    USE_KEYBOARD=true;USE_MOUSE=true;USE_GAMEPAD=false;calibrating=false;NOCLIP=false;
    menuOpen=false;overviewActive=false;
    document.getElementById('exitFrames').textContent='';
    capture('1 · Inside looking out');
  };
  document.getElementById('exitAdvance').onclick=function () {
    if(!entry||index>=markers.length-1)return;
    index++;cam.ang=entry.angle+Math.PI;cam.pitch=0;
    var steps=0;
    kbState.up=true;kbState.down=kbState.left=kbState.right=false;
    try { while(inward()>markers[index]&&steps<1800) {handleInput(FIXED_DT);gameUpdate(FIXED_DT);steps++;ticks++;} }
    finally {kbState.up=false;}
    capture((index+1)+' · Walked '+steps+' fixed steps');
  };
  function turn(offset,label) { if(!entry)return;cam.ang=entry.angle+Math.PI+offset;capture(label); }
  document.getElementById('exitYawLeft').onclick=function(){turn(-Math.PI/6,'Left');};
  document.getElementById('exitYawRight').onclick=function(){turn(Math.PI/6,'Right');};
  document.getElementById('exitYawStraight').onclick=function(){turn(0,'Straight');};
}());
