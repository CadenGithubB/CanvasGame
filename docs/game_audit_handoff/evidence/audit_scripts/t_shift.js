load('prelude.js'); load('game_body.js');
function run(label, test, seed){
  CAVE_TEST_MODE = test; window._caveTestSeedOverride = seed; ENDLESS_MODE = true;
  var t0=Date.now(); __logs=[]; resetEndlessMode(); var tInit=Date.now()-t0, logsInit=__logs.length;
  var times=[], logs=[];
  for (var k=1;k<=4;k++){ __logs=[]; var t1=Date.now(); assembleWindow(k, 0); times.push(Date.now()-t1); logs.push(__logs.length); }
  print(label + ': WINDOW_CHUNKS=' + WINDOW_CHUNKS + ' seed=' + WORLD_SEED + ' initial build=' + tInit + 'ms (' + logsInit + ' console.log lines); 4 successive 1-chunk shifts (7 new chunks each) = [' + times.join(', ') + '] ms, console.log lines per shift = [' + logs.join(', ') + ']; cached chunks=' + Object.keys(chunks).length + ' entityDeltas keys=' + Object.keys(entityDeltas).length);
}
run('cave-test', true, 12345);
run('normal   ', false, 0);
WINDOW_CHUNKS = 5; run('normal W=5', false, 0);
WINDOW_CHUNKS = 9; run('normal W=9', false, 0);
