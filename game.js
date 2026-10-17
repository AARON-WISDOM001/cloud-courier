/* Sky Courier — a start.ng game. Frontend only. */
'use strict';
(function(){
var START_NG='https://start.ng';
var canvas=document.getElementById('game');
var ctx=canvas.getContext('2d');
var W=canvas.width,H=canvas.height;
var framePromise=null;
function connectFrame(){
  if(!framePromise){
    framePromise=new Promise(function(resolve){
      try{
        var el=document.createElement('iframe');
        el.src=START_NG+'/connect'; el.hidden=true;
        el.setAttribute('aria-hidden','true');
        el.onload=function(){resolve(el);};
        document.body.append(el);
        setTimeout(function(){resolve(el);},2500);
      }catch(e){ resolve(null); }
    });
  }
  return framePromise;
}
function askStartNg(message,replyType,timeoutMs){
  timeoutMs=timeoutMs||5000;
  return connectFrame().then(function(el){
    return new Promise(function(resolve){
      if(!el||!el.contentWindow){ resolve(null); return; }
      var requestId=Math.random().toString(36).slice(2);
      var timer=setTimeout(function(){cleanup();resolve(null);},timeoutMs);
      function cleanup(){clearTimeout(timer);window.removeEventListener('message',onMessage);}
      function onMessage(e){
        if(e.origin!==START_NG||e.source!==el.contentWindow) return;
        if(e.data&&e.data.type===replyType&&e.data.requestId===requestId){cleanup();resolve(e.data);}
      }
      window.addEventListener('message',onMessage);
      try{el.contentWindow.postMessage(Object.assign({},message,{requestId:requestId}),START_NG);}
      catch(err){cleanup();resolve(null);}
    });
  }).catch(function(){return null;});
}
var GUEST_STYLE={body:'male',primaryColor:'#4b7bec',secondaryColor:'#2b2f4a',skinColor:'#c68642',hairColor:'#17120f',hair:'short',hat:'none',accessory:'none'};
var player={name:'Guest',account:null,style:GUEST_STYLE,face:null,signedIn:false,id:null};
var isGuestParam=/[?&]guest(\b|=|&|$)/.test(location.search);
function signInUrl(){return 'https://start.ng/?return_to='+encodeURIComponent(location.origin+location.pathname);}
function refreshPlayerCard(){
  document.getElementById('player-name').textContent=player.name||'Guest';
  document.getElementById('player-account').textContent=(player.signedIn&&player.account)?('@'+player.account):'Not signed in';
  document.getElementById('overlay-player').textContent=player.name||'Guest';
  document.getElementById('player-sign-in').hidden=player.signedIn||isGuestParam;
  if(player.face){document.getElementById('player-face').src=player.face;}
  else{drawFallbackFace();}
}
function drawFallbackFace(){
  var c=document.createElement('canvas');c.width=c.height=96;
  var g=c.getContext('2d');
  g.fillStyle='#d8fd71';g.fillRect(0,0,96,96);
  drawHead(g,48,52,30,player.style||GUEST_STYLE,false);
  document.getElementById('player-face').src=c.toDataURL('image/png');
}
document.getElementById('player-sign-in').addEventListener('click',function(){location.href=signInUrl();});
function loadPlayer(){
  refreshPlayerCard();
  askStartNg({type:'startng:whoami'},'startng:user',4500).then(function(reply){
    if(reply&&reply.user){
      player={name:reply.user.name||'Player',account:reply.user.account||null,style:Object.assign({},GUEST_STYLE,reply.user.style||{}),face:reply.user.face||null,signedIn:true,id:reply.user.id||null};
    }else if(reply&&reply.guest){
      player={name:(reply.guest.name||'Guest'),account:null,style:Object.assign({},GUEST_STYLE,reply.guest.style||{}),face:reply.guest.face||null,signedIn:false,id:null};
    }
    refreshPlayerCard();
  });
}
document.addEventListener('visibilitychange',function(){if(!document.hidden)loadPlayer();});
window.addEventListener('focus',loadPlayer);
var audioOn=true,actx=null;
function beep(freq,dur,type,vol){
  if(!audioOn)return;
  try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)();
    var o=actx.createOscillator(),g=actx.createGain();
    o.type=type||'square';o.frequency.value=freq;g.gain.value=vol||0.05;
    o.connect(g);g.connect(actx.destination);o.start();
    g.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+dur);
    o.stop(actx.currentTime+dur);
  }catch(e){}
}
document.getElementById('btn-mute').addEventListener('click',function(e){audioOn=!audioOn;e.target.textContent=audioOn?'🔊 sound':'🔇 muted';});
var state='menu',score=0,parcels=0,dist=0,speed=3.1,frames=0;
var best=parseInt(localStorage.getItem('sky-courier-best')||'0',10)||0;
document.getElementById('hud-best').textContent=best;
var py=H*0.45,vy=0,thrusting=false,tilt=0;
var gravity=0.22,lift=-0.42;
var MAX_FALL=5.2,MAX_RISE=-4.6;
var obstacles=[],pickups=[],particles=[],clouds=[];
for(var i=0;i<7;i++)clouds.push({x:Math.random()*W,y:20+Math.random()*220,s:0.5+Math.random(),v:0.3+Math.random()*0.5});
function reset(){score=0;parcels=0;dist=0;speed=3.1;frames=0;py=H*0.45;vy=0;obstacles=[];pickups=[];particles=[];updateHud();}
function updateHud(){document.getElementById('hud-score').textContent=Math.floor(score);document.getElementById('hud-parcels').textContent=parcels;document.getElementById('hud-best').textContent=Math.max(best,Math.floor(score));}
function spawnObstacle(){
  var gap=Math.max(190,250-dist*0.008);
  var gy=90+Math.random()*(H-220-gap);
  var kind=Math.random();
  obstacles.push({x:W+40,gapY:gy,gapH:gap,w:74,passed:false,kind:kind<0.72?'tower':(kind<0.87?'drone':'bird'),bob:Math.random()*6.28,y:H/2+(Math.random()-0.5)*220});
}
function spawnPickup(){pickups.push({x:W+30,y:110+Math.random()*(H-240),taken:false,spin:Math.random()*6});}
function collide(){
  var px=200,pr=17;
  // Ceiling is safe: slide along the top instead of dying.
  // Only the floor/rooftops (bottom) and obstacles kill.
  if(py>H-34)return true;
  for(var i=0;i<obstacles.length;i++){
    var o=obstacles[i];
    if(o.kind==='tower'){if(px+pr>o.x&&px-pr<o.x+o.w){if(py-pr<o.gapY||py+pr>o.gapY+o.gapH)return true;}}
    else{var oy=o.y+Math.sin(frames/22+o.bob)*30;var dx=px-(o.x+20),dy=py-oy;if(dx*dx+dy*dy<(pr+17)*(pr+17))return true;}
  }
  return false;
}
function burst(x,y,color,n){for(var i=0;i<n;i++)particles.push({x:x,y:y,vx:(Math.random()-0.5)*6,vy:(Math.random()-0.5)*6-1,life:30+Math.random()*20,color:color});}
function drawHead(g,x,y,r,style,withBody){
  var skin=style.skinColor||'#c68642';g.save();g.translate(x,y);
  if(withBody){g.fillStyle=style.primaryColor||'#4b7bec';g.fillRect(-r*0.75,r*0.7,r*1.5,r*1.1);}
  g.fillStyle=skin;g.beginPath();g.arc(0,0,r,0,6.283);g.fill();
  g.fillStyle=style.hairColor||'#17120f';var hair=style.hair||'short';
  if(hair==='bald'){g.beginPath();g.arc(0,-r*0.25,r*0.92,Math.PI,0);g.fill();}
  else if(hair==='afro'){g.beginPath();g.arc(0,-r*0.35,r*1.25,0,6.283);g.fill();g.fillStyle=skin;g.beginPath();g.arc(0,r*0.1,r*0.72,0,6.283);g.fill();}
  else if(hair==='braids'){g.fillRect(-r,-r*1.05,r*2,r*0.55);g.fillRect(-r*1.05,-r*0.6,r*0.3,r*1.3);g.fillRect(r*0.75,-r*0.6,r*0.3,r*1.3);}
  else if(hair==='bun'){g.beginPath();g.arc(0,-r*0.9,r*0.42,0,6.283);g.fill();g.fillRect(-r,-r*0.9,r*2,r*0.5);}
  else if(hair==='ponytail'){g.fillRect(-r,-r*1.0,r*2,r*0.5);g.fillRect(r*0.55,-r*0.7,r*0.35,r*1.2);}
  else if(hair==='dreads'){for(var i=-2;i<=2;i++)g.fillRect(i*r*0.38-r*0.12,-r*0.7,r*0.24,r*1.25);g.fillRect(-r,-r*1.0,r*2,r*0.5);}
  else{g.fillRect(-r,-r*1.02,r*2,r*0.5);}
  var hat=style.hat||'none';
  if(hat==='cap'){g.fillStyle=style.primaryColor||'#333';g.fillRect(-r,-r*1.25,r*2,r*0.45);g.fillRect(-r*0.1,-r*0.95,r*1.5,r*0.18);}
  else if(hat==='beanie'){g.fillStyle=style.secondaryColor||'#333';g.beginPath();g.arc(0,-r*0.45,r*1.02,Math.PI,0);g.fill();g.beginPath();g.arc(0,-r*1.35,r*0.28,0,6.283);g.fill();}
  else if(hat==='tophat'){g.fillStyle='#222';g.fillRect(-r*0.6,-r*2.0,r*1.2,r*1.1);g.fillRect(-r*1.0,-r*1.05,r*2.0,r*0.22);}
  else if(hat==='crown'){g.fillStyle='#ffd233';g.beginPath();g.moveTo(-r*0.8,-r*0.85);g.lineTo(-r*0.8,-r*1.5);g.lineTo(-r*0.4,-r*1.05);g.lineTo(0,-r*1.6);g.lineTo(r*0.4,-r*1.05);g.lineTo(r*0.8,-r*1.5);g.lineTo(r*0.8,-r*0.85);g.closePath();g.fill();}
  g.fillStyle='#1b1b1b';g.beginPath();g.arc(-r*0.32,r*0.05,r*0.11,0,6.283);g.fill();g.beginPath();g.arc(r*0.32,r*0.05,r*0.11,0,6.283);g.fill();
  var acc=style.accessory||'none';
  if(acc==='glasses'){g.strokeStyle='#111';g.lineWidth=2;g.strokeRect(-r*0.62,-r*0.16,r*0.55,r*0.42);g.strokeRect(r*0.07,-r*0.16,r*0.55,r*0.42);}
  else if(acc==='earrings'){g.fillStyle='#ffd233';g.beginPath();g.arc(-r*1.0,r*0.25,r*0.12,0,6.283);g.fill();g.beginPath();g.arc(r*1.0,r*0.25,r*0.12,0,6.283);g.fill();}
  else if(acc==='beard'){g.fillStyle=style.hairColor||'#222';g.beginPath();g.arc(0,r*0.45,r*0.55,0,Math.PI);g.fill();}
  else if(acc==='scarf'){g.fillStyle=style.secondaryColor||'#c33';g.fillRect(-r*0.8,r*0.72,r*1.6,r*0.4);g.fillRect(r*0.3,r*0.9,r*0.35,r*0.8);}
  g.restore();
}
function drawCourier(x,y,t){
  var style=player.style||GUEST_STYLE;
  ctx.save();ctx.translate(x,y);ctx.rotate(t);
  if(thrusting&&state==='playing'){
    var f=14+Math.random()*14;
    var grad=ctx.createLinearGradient(0,10,0,28+f);
    grad.addColorStop(0,'#ffe45e');grad.addColorStop(1,'#ff7a3c');
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.moveTo(-16,8);ctx.lineTo(-8,8);ctx.lineTo(-12,12+f+16);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(2,8);ctx.lineTo(10,8);ctx.lineTo(6,12+f+12);ctx.closePath();ctx.fill();
  }
  ctx.fillStyle='#3a3f5c';ctx.fillRect(-20,-14,10,26);ctx.fillRect(4,-14,10,26);
  ctx.fillStyle='#9aa0c3';ctx.fillRect(-20,-16,10,4);ctx.fillRect(4,-16,10,4);
  ctx.fillStyle=style.secondaryColor||'#2b2f4a';ctx.fillRect(-11,12,8,14);ctx.fillRect(3,12,8,14);
  ctx.fillStyle='#222';ctx.fillRect(-12,24,10,5);ctx.fillRect(2,24,10,5);
  ctx.fillStyle=style.primaryColor||'#4b7bec';
  ctx.beginPath();if(ctx.roundRect)ctx.roundRect(-13,-12,26,26,7);else ctx.rect(-13,-12,26,26);ctx.fill();
  if((style.accessory||'none')==='backpack'){ctx.fillStyle='#6b4dff';ctx.fillRect(-22,-8,6,16);}
  ctx.restore();
  drawHead(ctx,x,y-24,15,style,false);
}
function drawSky(){
  var g=ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#1b2150');g.addColorStop(0.55,'#3b3f8f');g.addColorStop(0.8,'#e08a5a');g.addColorStop(1,'#f7c873');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#ffdf8a';ctx.beginPath();ctx.arc(770,430,44,0,6.283);ctx.fill();
  ctx.fillStyle='rgba(255,223,138,0.33)';ctx.beginPath();ctx.arc(770,430,70,0,6.283);ctx.fill();
  ctx.fillStyle='#23264d';
  for(var i=0;i<12;i++){
    var bx=((i*173-dist*0.4)%(W+200)+W+200)%(W+200)-100;
    var bh=90+((i*67)%120);
    ctx.fillRect(bx,H-60-bh,110,bh);
    ctx.fillStyle='rgba(247,224,138,0.2)';
    for(var wy=0;wy<4;wy++)for(var wx=0;wx<3;wx++)ctx.fillRect(bx+12+wx*30,H-60-bh+14+wy*28,12,16);
    ctx.fillStyle='#23264d';
  }
  ctx.fillStyle='rgba(255,255,255,0.8)';
  clouds.forEach(function(c){ctx.beginPath();ctx.arc(c.x,c.y,18*c.s,0,6.283);ctx.arc(c.x+20*c.s,c.y-8*c.s,22*c.s,0,6.283);ctx.arc(c.x+42*c.s,c.y,16*c.s,0,6.283);ctx.fill();});
  ctx.fillStyle='#14162e';ctx.fillRect(0,H-46,W,46);
  ctx.fillStyle='#d8fd71';for(var x=-((dist*2)%46);x<W;x+=46)ctx.fillRect(x,H-46,24,4);
}
function drawWorld(){
  obstacles.forEach(function(o){
    if(o.kind==='tower'){
      ctx.fillStyle='#2c2f55';ctx.fillRect(o.x,0,o.w,o.gapY);ctx.fillRect(o.x,o.gapY+o.gapH,o.w,H-(o.gapY+o.gapH));
      ctx.fillStyle='#3d4170';ctx.fillRect(o.x,o.gapY-14,o.w,14);ctx.fillRect(o.x,o.gapY+o.gapH,o.w,14);
      ctx.fillStyle='#ffd233';ctx.fillRect(o.x+8,o.gapY-11,10,8);ctx.fillRect(o.x+o.w-18,o.gapY+o.gapH+3,10,8);
    }else if(o.kind==='drone'){
      var oy=o.y+Math.sin(frames/22+o.bob)*34;
      ctx.save();ctx.translate(o.x+20,oy);
      ctx.fillStyle='#20233d';ctx.fillRect(-14,-4,10,8);ctx.fillRect(4,-4,10,8);
      ctx.fillStyle='rgba(255,255,255,0.55)';ctx.fillRect(-20,-8,12,3);ctx.fillRect(8,-8,12,3);
      ctx.fillStyle='#ff5d5d';ctx.beginPath();ctx.arc(0,4,15,0,6.283);ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,4,6,0,6.283);ctx.fill();
      ctx.fillStyle='#c00';ctx.beginPath();ctx.arc(0,4,3,0,6.283);ctx.fill();
      ctx.restore();
    }else{
      var by=o.y+Math.sin(frames/18+o.bob)*40;
      ctx.save();ctx.translate(o.x+20,by);
      ctx.fillStyle='#2f6df6';ctx.beginPath();ctx.ellipse(0,0,16,10,0,0,6.283);ctx.fill();
      ctx.fillStyle='#ffd233';ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(24,-6+Math.sin(frames/4)*4);ctx.lineTo(24,6+Math.sin(frames/4)*4);ctx.closePath();ctx.fill();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(6,-2,3,0,6.283);ctx.fill();
      ctx.restore();
    }
  });
  pickups.forEach(function(p){
    if(p.taken)return;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.sin(frames/20+p.spin)*0.25);
    ctx.fillStyle='#c98a4b';ctx.fillRect(-13,-10,26,20);
    ctx.fillStyle='#a56a32';ctx.fillRect(-2,-10,4,20);
    ctx.fillStyle='#f5e6c8';ctx.fillRect(-13,-3,26,6);
    ctx.fillStyle='#d8fd71';ctx.beginPath();ctx.arc(0,-16,3+Math.sin(frames/8)*1.5,0,6.283);ctx.fill();
    ctx.restore();
  });
}
function drawParticles(){
  particles=particles.filter(function(p){return p.life>0;});
  particles.forEach(function(p){p.x+=p.vx;p.y+=p.vy;p.vy+=0.15;p.life--;ctx.globalAlpha=Math.max(0,p.life/45);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4);ctx.globalAlpha=1;});
}
function step(){
  frames++;
  clouds.forEach(function(c){c.x-=c.v;if(c.x<-70){c.x=W+60;c.y=20+Math.random()*220;}});
  if(state==='playing'){
    // Floaty jetpack feel: gentle gravity, soft thrust, clamped speeds.
    // Hold to rise smoothly, release to sink slowly. Ceiling is safe.
    vy+=gravity;if(thrusting)vy+=lift;
    if(vy>MAX_FALL)vy=MAX_FALL;
    if(vy<MAX_RISE)vy=MAX_RISE;
    py+=vy;
    if(py<26){py=26;vy=Math.max(0,vy);} // bonk the sky, don't die
    tilt=Math.max(-0.35,Math.min(0.4,vy*0.07));
    dist+=speed;speed=Math.min(5.2,2.6+dist*0.0006);
    score+=0.12+speed*0.02;
    if(frames%96===0)spawnObstacle();
    if(frames%160===0)spawnPickup();
    obstacles.forEach(function(o){
      o.x-=speed;
      if(!o.passed&&o.x+60<200){o.passed=true;score+=10;beep(660,0.07,'sine',0.03);}
    });
    obstacles=obstacles.filter(function(o){return o.x>-120;});
    pickups.forEach(function(p){
      p.x-=speed;p.spin+=0.05;
      var dx=200-p.x,dy=py-p.y;
      if(!p.taken&&dx*dx+dy*dy<34*34){p.taken=true;parcels++;score+=50;burst(p.x,p.y,'#d8fd71',16);beep(880,0.12,'square',0.05);updateHud();}
    });
    pickups=pickups.filter(function(p){return p.x>-40&&!p.taken;});
    if(thrusting&&frames%4===0)particles.push({x:190,y:py+22,vx:-2-Math.random()*2,vy:2+Math.random()*2,life:22,color:'#ffb14e'});
    if(frames%6===0)updateHud();
    if(collide())gameOver();
  }
  drawSky();drawWorld();drawParticles();
  if(state!=='over')drawCourier(200,py,tilt);
  else burst(200,py,'#ff5d5d',2);
  if(state==='paused'){ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.font='bold 44px sans-serif';ctx.textAlign='center';ctx.fillText('PAUSED — press P',W/2,H/2);}
  requestAnimationFrame(step);
}
function saveScore(){
  var s=Math.floor(score);
  var box=document.getElementById('over-saved');
  if(!player.signedIn){box.textContent='Sign in with start.ng to save to the shared leaderboard.';return;}
  box.textContent='Saving to start.ng...';
  askStartNg({type:'startng:score',stats:{score:Math.min(1000000000,s),parcels:Math.min(1000000000,parcels)}},'startng:scoreSaved',6000).then(function(r){
    if(r&&r.ok){var rk=(r.result&&r.result.rank)||'?';box.textContent=(r.result&&r.result.improved)?('New best! You are #'+rk+' on the shared board.'):('Saved. Shared board rank #'+rk+'.');}
    else{box.textContent='Could not save: '+((r&&r.error)||'not signed in.');}
  });
}
function showBoard(){
  var board=document.getElementById('board');
  board.innerHTML='<li>Loading...</li>';
  document.getElementById('board-note').textContent='';
  document.getElementById('overlay-start').hidden=true;
  document.getElementById('overlay-over').hidden=true;
  document.getElementById('overlay-board').hidden=false;
  askStartNg({type:'startng:leaderboard',limit:10},'startng:leaderboardData',6000).then(function(r){
    if(r&&r.ok&&r.entries){
      if(!r.entries.length){board.innerHTML='<li>No runs yet — be the first courier!</li>';return;}
      board.innerHTML='';
      r.entries.forEach(function(e){
        var li=document.createElement('li');
        var st=e.stats||{};
        var sc=(st.score!=null?st.score:e.score);
        li.textContent='#'+e.rank+' '+e.name+': '+sc+' pts, '+(st.parcels||0)+' parcels';
        if(player.id&&e.player_id===player.id)li.className='me';
        board.appendChild(li);
      });
      document.getElementById('board-note').textContent=player.signedIn?('Signed in as '+player.name+'.'):'Sign in to save your runs.';
    }else{
      board.innerHTML='<li>Board is live at your-game.start.ng — open the published game to see it.</li>';
      document.getElementById('board-note').textContent='Local preview: leaderboard needs the live address.';
    }
  });
}
function startGame(){
  reset();state='playing';
  document.getElementById('overlay-start').hidden=true;
  document.getElementById('overlay-over').hidden=true;
  document.getElementById('overlay-board').hidden=true;
  document.getElementById('overlay-how').hidden=true;
  beep(520,0.12,'square',0.05);
}
function gameOver(){
  state='over';
  burst(200,py,'#ff5d5d',40);burst(200,py,'#fff',20);
  beep(160,0.4,'sawtooth',0.07);
  var s=Math.floor(score);
  if(s>best){best=s;try{localStorage.setItem('sky-courier-best',String(best));}catch(e){}}
  updateHud();
  document.getElementById('over-title').textContent=parcels>=8?'Legendary courier!':(parcels>=4?'Great run!':'Run over!');
  document.getElementById('over-stats').textContent=s+' pts, '+parcels+' parcels, best '+best;
  document.getElementById('overlay-over').hidden=false;
  saveScore();
}
document.getElementById('btn-start').addEventListener('click',startGame);
document.getElementById('btn-again').addEventListener('click',startGame);
function openHow(){
  document.getElementById('overlay-start').hidden=true;
  document.getElementById('overlay-over').hidden=true;
  document.getElementById('overlay-board').hidden=true;
  document.getElementById('overlay-how').hidden=false;
}
function closeHow(){
  document.getElementById('overlay-how').hidden=true;
  document.getElementById(state==='over'?'overlay-over':'overlay-start').hidden=false;
}
document.getElementById('btn-how').addEventListener('click',openHow);
document.getElementById('btn-how2').addEventListener('click',openHow);
document.getElementById('btn-close-how').addEventListener('click',function(){
  closeHow();
  if(state==='menu'||state==='over')startGame();
});
document.getElementById('btn-board').addEventListener('click',showBoard);
document.getElementById('btn-board2').addEventListener('click',showBoard);
document.getElementById('btn-close-board').addEventListener('click',function(){
  document.getElementById('overlay-board').hidden=true;
  document.getElementById(state==='over'?'overlay-over':'overlay-start').hidden=false;
});
window.addEventListener('keydown',function(e){
  if(e.code==='Space'||e.code==='ArrowUp'){
    e.preventDefault();
    if(!document.getElementById('overlay-how').hidden){closeHow();if(state==='menu'||state==='over')startGame();thrusting=true;return;}
    if((state==='menu'||state==='over')&&!document.getElementById('overlay-board').hidden)return;
    if(state==='menu'||state==='over')startGame();
    thrusting=true;
  }
  if(e.code==='KeyP'){if(state==='playing')state='paused';else if(state==='paused')state='playing';}
  if(e.code==='Enter'&&(state==='menu'||state==='over'))startGame();
});
window.addEventListener('keyup',function(e){if(e.code==='Space'||e.code==='ArrowUp')thrusting=false;});
canvas.addEventListener('pointerdown',function(e){e.preventDefault();thrusting=true;if(actx&&actx.state==='suspended')actx.resume();});
window.addEventListener('pointerup',function(){thrusting=false;});
canvas.addEventListener('pointerleave',function(){thrusting=false;});
canvas.addEventListener('contextmenu',function(e){e.preventDefault();});
loadPlayer();reset();requestAnimationFrame(step);
})();
