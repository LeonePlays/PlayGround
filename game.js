(() => {
  'use strict';
  const canvas = document.getElementById('renderCanvas');
  const $ = id => document.getElementById(id);
  if(!window.BABYLON){$('loading').classList.add('hidden');$('fatal').classList.remove('hidden');return;}
  const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:false, stencil:true, antialias:true, powerPreference:'high-performance'});
  engine.setHardwareScalingLevel(Math.min(1.35, window.devicePixelRatio || 1));
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(.18,.22,.26,1);
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2; scene.fogDensity=.0042; scene.fogColor=new BABYLON.Color3(.22,.27,.31);
  scene.collisionsEnabled=true; scene.gravity=new BABYLON.Vector3(0,-.28,0);
  const camera = new BABYLON.UniversalCamera('operator', new BABYLON.Vector3(0,1.8,-51), scene);
  camera.attachControl(canvas,true); camera.minZ=.08; camera.fov=80*Math.PI/180; camera.speed=.32; camera.angularSensibility=3100;
  camera.checkCollisions=true; camera.applyGravity=true; camera.ellipsoid=new BABYLON.Vector3(.38,.88,.38); camera.ellipsoidOffset=new BABYLON.Vector3(0,.02,0); camera.inertia=.72;
  const hemi=new BABYLON.HemisphericLight('overcast',new BABYLON.Vector3(.15,1,-.2),scene); hemi.intensity=.7; hemi.diffuse=new BABYLON.Color3(.72,.79,.9); hemi.groundColor=new BABYLON.Color3(.2,.19,.17);
  const sun=new BABYLON.DirectionalLight('late sun',new BABYLON.Vector3(-.5,-1,.38),scene); sun.position=new BABYLON.Vector3(35,55,-25); sun.diffuse=new BABYLON.Color3(1,.78,.56); sun.intensity=.95;
  const shadow=new BABYLON.ShadowGenerator(512,sun); shadow.useBlurExponentialShadowMap=true; shadow.blurKernel=12; shadow.setDarkness(.3);
  const mat=(name,color,rough=.8,emissive=null)=>{const m=new BABYLON.StandardMaterial(name,scene);m.diffuseColor=BABYLON.Color3.FromHexString(color);m.specularColor=new BABYLON.Color3(.14,.14,.12);m.specularPower=(1-rough)*60;if(emissive)m.emissiveColor=BABYLON.Color3.FromHexString(emissive);return m;};
  const M={ground:mat('worn concrete','#55595a'),wall:mat('weathered concrete','#77736b'),wallDark:mat('interior shadow','#3a4147'),steel:mat('aged steel','#4d5962'),steel2:mat('painted slate','#596166'),rust:mat('oxidized metal','#87583e'),yellow:mat('safety amber','#cf9147'),wood:mat('timber','#65594c'),crate:mat('crate paint','#555a56'),glass:mat('dirty glass','#4d5c63'),black:mat('gunmetal','#242a2e'),gun:mat('weapon steel','#30383d'),tire:mat('rubber','#202428'),target:mat('target orange','#bd5735'),targetDark:mat('target dark','#684239'),enemy:mat('hostile uniform','#70433c'),enemyVest:mat('hostile webbing','#a4583e'),ally:mat('operator uniform','#384954'),allyVest:mat('operator vest','#53616a'),skin:mat('skin','#a58b6f'),lamp:mat('warning light','#e1a34e',.4,'#6b4722')};
  const meshes=[], obstacles=[], actors=[], targets=[], botList=[], decor=[];
  let started=false,mode='training',weapon='rifle',health=100,armor=100,cash=800,score=0,blueScore=0,redScore=0,roundSeconds=240,paused=false,reloading=false,fireHeld=false,lastShot=0,shotCount=0,moveAmount=0,grounded=false,stance='standing',isRunning=false,slowWalk=false,alive=true,toastTimer=0,fireRate=105,sensitivity=1,quality='high',roundOver=false;
  const keys=Object.create(null), V=(x,y,z)=>new BABYLON.Vector3(x,y,z), rand=(a,b)=>a+Math.random()*(b-a);
  function box(name,x,y,z,w,h,d,material,collide=true){const b=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);b.position.set(x,y,z);b.material=material;b.checkCollisions=collide;b.receiveShadows=true;if(collide)obstacles.push({x,z,rx:w/2,rz:d/2});meshes.push(b);return b;}
  function cyl(name,x,y,z,diam,height,material,tess=12){const c=BABYLON.MeshBuilder.CreateCylinder(name,{diameter:diam,height,tessellation:tess},scene);c.position.set(x,y,z);c.material=material;c.receiveShadows=true;shadow.addShadowCaster(c);meshes.push(c);return c;}
  function beam(name,a,b,width,material){const delta=b.subtract(a), length=delta.length();const c=BABYLON.MeshBuilder.CreateCylinder(name,{height:length,diameter:width,tessellation:8},scene);c.position=a.add(b).scale(.5);c.rotationQuaternion=BABYLON.Quaternion.FromUnitVectorsToRef?BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Axis.Y,delta.normalize(),new BABYLON.Quaternion()):null;if(!c.rotationQuaternion){c.lookAt(b);c.rotate(BABYLON.Axis.X,Math.PI/2);}c.material=material;c.receiveShadows=true;shadow.addShadowCaster(c);meshes.push(c);return c;}
  function makeSign(text,x,y,z,rot=0){const p=BABYLON.MeshBuilder.CreatePlane('stencilled signage',{width:4.2,height:1.05},scene);p.position.set(x,y,z);p.rotation.y=rot;const tex=new BABYLON.DynamicTexture('sign paint',{width:512,height:128},scene,false);tex.hasAlpha=true;const c=tex.getContext();c.fillStyle='#252b26';c.fillRect(0,0,512,128);c.fillStyle='#c2ca9c';c.font='bold 48px monospace';c.fillText(text,20,78);c.fillStyle='#c0a556';c.fillRect(20,96,472,4);tex.update();const m=new BABYLON.StandardMaterial('stencilled panel',scene);m.diffuseTexture=tex;m.emissiveColor=new BABYLON.Color3(.15,.16,.12);p.material=m;p.isPickable=false;return p;}
  function createWorld(){
    const floor=BABYLON.MeshBuilder.CreateGround('scuffed concrete yard',{width:150,height:150,subdivisions:2},scene);floor.position.y=0;floor.material=M.ground;floor.checkCollisions=true;floor.receiveShadows=true;meshes.push(floor);
    // Perimeter wall, loading bays, roofless industrial sheds.
    box('north retaining wall',0,4,73,150,8,2,M.wall);box('south retaining wall',0,4,-73,150,8,2,M.wall);box('west retaining wall',-73,4,0,2,8,148,M.wall);box('east retaining wall',73,4,0,2,8,148,M.wall);
    // Main foundry shed, with an open central loading entrance.
    box('foundry north wall',-31,5,21,34,10,1.5,M.wall);box('foundry west wall',-48,5,7,1.5,10,29,M.wall);box('foundry east wall',-14,5,7,1.5,10,29,M.wall);
    box('foundry front left',-42,5,-8,12,10,1.5,M.wall);box('foundry front right',-20,5,-8,12,10,1.5,M.wall);box('loading lintel',-31,9,-8,10,2,1.5,M.wallDark);
    box('shed back wall',30,4,27,42,8,1.5,M.wallDark);box('shed side wall',9,4,13,1.5,8,29,M.wall);box('shed side wall',51,4,13,1.5,8,29,M.wall);box('shed loading partition',30,3,7,17,6,1,M.wallDark);
    // Corrugated steel roof panels and exposed trusses.
    for(let i=0;i<7;i++){const x=-46+i*5;const roof=box('foundry roof sheet',x,10.5,7,4.9,.35,29,M.steel,false);roof.rotation.z=.14;}
    for(let i=0;i<8;i++){const x=10+i*5.7;box('shed roof panel',x,9,13,5.5,.28,28,M.steel,false);}
    for(let i=0;i<6;i++){const z=-5+i*6;beam('roof truss',V(-47,9.8,z),V(-15,9.8,z),.18,M.steel2);beam('roof brace',V(-47,9.8,z),V(-31,11,z),.13,M.steel);beam('roof brace',V(-15,9.8,z),V(-31,11,z),.13,M.steel);}
    // Painted pillars, industrial stacks, pipes.
    for(const x of [-47,-15,10,51])for(const z of [-7,6,21]){box('structural I column',x,5,z,.55,10,.55,M.steel2);box('column base',x,.35,z,1.1,.7,1.1,M.steel);}
    for(const [x,z,r,h] of [[-60,48,3.8,11],[-52,49,3.2,8],[42,48,4.5,13],[54,47,3.5,9]]){cyl('blast furnace silo',x,h/2,z,r,h,M.steel,16);cyl('silo collar',x,h*.78,z,r*1.07,.42,M.rust,16);cyl('silo cap',x,h+.35,z,r*.72,.7,M.steel2,12);for(let n=0;n<6;n++){const a=n*Math.PI/3;beam('silo ladder rung',V(x+Math.cos(a)*r*.9,1,z+Math.sin(a)*r*.9),V(x+Math.cos(a)*r*.9,h-1,z+Math.sin(a)*r*.9),.09,M.yellow);}}
    // Chimney stacks.
    for(const [x,z,h] of [[-64,5,21],[62,21,25],[57,-53,17]]){cyl('brick exhaust stack',x,h/2,z,3.2,h,M.rust,12);cyl('chimney crown',x,h,z,4.2,.8,M.steel,12);for(let y=3;y<h;y+=4)box('chimney band',x,y,z,3.35,.2,3.35,M.steel,false);}
    // Elevated pipe rack across yard.
    for(const z of [34,37,40]){beam('main overhead pipe',V(-28,7,z),V(28,7,z),.36,M.rust);for(let x=-25;x<=25;x+=10)box('pipe rack trestle',x,3.7,z,.35,6.6,.35,M.steel2);}
    beam('low service pipe',V(-8,2,-42),V(48,2,-42),.55,M.rust);beam('low service pipe',V(-8,2,-43),V(48,2,-43),.55,M.steel);
    // Yard containers.
    const container=(x,z,color,rot=0)=>{const cm=mat('shipping container '+color,color);const body=box('freight container',x,1.6,z,13,3.2,5.4,cm);body.rotation.y=rot;for(let i=-5;i<=5;i+=1.2){const rib=box('container corrugation',x+i,1.6,z-2.74,.12,3,.12,M.steel,false);rib.rotation.y=rot;}box('container top rail',x,3.24,z,13,.15,5.5,M.steel,false);};
    container(30,-29,'#53604c',.06);container(-33,-40,'#6a5548',-.07);container(50,5,'#4e5960',.03);container(-4,48,'#5e604b',Math.PI/2);
    // Cargo crates and barricades.
    const crate=(x,z,s=2,material=M.crate)=>{box('cargo crate',x,s*.48,z,s,s*.96,s,material);for(let i=-1;i<=1;i++){box('crate slat',x+i*s*.28,s*.48,z-s*.505,.11,s*.88,.06,M.wood,false);box('crate slat',x+i*s*.28,s*.48,z+s*.505,.11,s*.88,.06,M.wood,false);}box('crate band',x,s*.48,z-s*.52,s,.12,.08,M.yellow,false);};
    [[-4,-8],[-1,-8],[3,-8],[5,-23],[1,-23],[-22,-28],[-19,-28],[21,-8],[24,-8],[14,2],[18,2],[-39,1],[-35,1],[39,-50],[44,-50],[24,-55],[-12,39],[-8,39]].forEach(([x,z],i)=>crate(x,z,i%4===0?2.5:1.8,i%5===0?M.wood:M.crate));
    for(const x of [-8,8,32]){const b=box('road barricade',x,.8,-57,8,1.6,.7,M.yellow);for(let i=-3;i<4;i+=1.4)box('barricade stripe',x+i,.8,-57.38,.65,1.55,.05,M.black,false);}
    // Stacked tires and cable spools.
    for(const [x,z] of [[-55,-15],[56,-7],[6,55]])for(let i=0;i<3;i++){const t=cyl('old tire',x, .48+i*.68,z,1.35,.58,M.tire,12);t.rotation.x=Math.PI/2;}
    for(const [x,z] of [[-53,21],[44,-17]]){cyl('cable spool',x,.9,z,2.1,1.8,M.wood,12);cyl('spool hub',x,.9,z,1.2,1.85,M.rust,12);}
    // Floodlights, warning lamps, fences.
    for(const [x,z] of [[-24,29],[25,32],[61,-27],[-61,-34]]){box('light pole footing',x,.3,z,.9,.6,.9,M.steel);beam('floodlight mast',V(x,0,z),V(x,10,z),.18,M.steel);beam('lamp arm',V(x,9.6,z),V(x+1.6,10.2,z),.13,M.steel);const lamp=box('sodium floodlight',x+1.7,10.2,z,.8,.35,.55,M.lamp,false);}
    for(let x=-13;x<=13;x+=2.6){box('chain-link fence post',x,1.7,-67,.12,3.4,.12,M.steel);}
    box('fence base',0,.12,-67,28,.24,.25,M.steel);
    // Small details and stencilled zone signs.
    makeSign('FERRO / BLOCO 04',-31,7.4,-7.15,0);makeSign('ARMAZÉM 02',30,6.3,6.4,Math.PI);makeSign('ACESSO RESTRITO',-70,5,8,Math.PI/2);
    for(let x=-65;x<65;x+=15){const stripe=box('yard lane marking',x,.025,-62,8,.025,.18,M.yellow,false);stripe.isPickable=false;}
    // Exterior rubble piles.
    for(const [x,z] of [[-58,-57],[59,60],[-57,60],[59,-58]])for(let i=0;i<7;i++){const rock=BABYLON.MeshBuilder.CreatePolyhedron('broken concrete rubble',{type:1,size:rand(.45,1.1)},scene);rock.position.set(x+rand(-2,2),rand(.2,.7),z+rand(-2,2));rock.scaling.y=rand(.4,1);rock.material=M.wallDark;rock.checkCollisions=true;obstacles.push({x:rock.position.x,z:rock.position.z,rx:.5,rz:.5});}
    // Cast shadows on the principal architecture.
    meshes.forEach(m=>{if(m.name!=='scuffed concrete yard'&&!m.name.includes('roof'))shadow.addShadowCaster(m);});
  }
  function actorPart(mesh,actor){mesh.metadata=mesh.metadata||{};mesh.metadata.actor=actor;mesh.isPickable=true;actor.parts.push(mesh);shadow.addShadowCaster(mesh);return mesh;}
  function createHumanoid(actor,player=false){
    const x=actor.x,z=actor.z, base=player?0:0;
    const uniform=actor.type==='bot'?M.enemy:M.ally, vest=actor.type==='bot'?M.enemyVest:M.allyVest;
    const torso=BABYLON.MeshBuilder.CreateBox('tactical torso',{width:.72,height:.86,depth:.42},scene);torso.position.set(x,1.28,z);torso.material=vest;actorPart(torso,actor);
    const chest=BABYLON.MeshBuilder.CreateBox('plate carrier',{width:.77,height:.42,depth:.1},scene);chest.position.set(x,1.42,z-.22);chest.material=uniform;actorPart(chest,actor);
    const head=BABYLON.MeshBuilder.CreateSphere('helmeted head',{diameter:.48,segments:8},scene);head.position.set(x,2.02,z);head.scaling.y=.88;head.material=M.skin;actorPart(head,actor);
    const helmet=BABYLON.MeshBuilder.CreateBox('combat helmet',{width:.56,height:.2,depth:.55},scene);helmet.position.set(x,2.21,z);helmet.material=uniform;actorPart(helmet,actor);
    for(const side of [-1,1]){const arm=BABYLON.MeshBuilder.CreateBox('sleeved arm',{width:.22,height:.78,depth:.25},scene);arm.position.set(x+side*.49,1.34,z-.02);arm.rotation.z=side*-.12;arm.material=uniform;actorPart(arm,actor);const glove=BABYLON.MeshBuilder.CreateBox('gloved hand',{width:.23,height:.2,depth:.25},scene);glove.position.set(x+side*.52,.91,z-.12);glove.material=M.black;actorPart(glove,actor);const leg=BABYLON.MeshBuilder.CreateBox('field trousers',{width:.29,height:.78,depth:.34},scene);leg.position.set(x+side*.2,.48,z);leg.material=uniform;actorPart(leg,actor);const boot=BABYLON.MeshBuilder.CreateBox('combat boot',{width:.33,height:.18,depth:.5},scene);boot.position.set(x+side*.2,.12,z-.08);boot.material=M.black;actorPart(boot,actor);}
    actor.root={position:new BABYLON.Vector3(x,0,z)};
    actor.parts.forEach(p=>{p.metadata.actor=actor;});actor.originX=x;actor.originZ=z;actor.basePositions=actor.parts.map(p=>p.position.clone());actor.baseRotations=actor.parts.map(p=>p.rotation.clone());
  }
  function makeTarget(x,z,index){const a={type:'target',x,z,hp:3,maxHp:3,alive:true,parts:[],index,respawn:0};createHumanoid(a);a.parts.forEach(p=>{p.material=p.name.includes('head')||p.name.includes('helmet')?M.targetDark:M.target;});targets.push(a);actors.push(a);return a;}
  function makeBot(x,z,id){const a={type:'bot',x,z,hp:100,alive:true,parts:[],id,shoot:rand(1.5,3.5),speed:rand(2.1,2.7),strafe:Math.random()<.5?-1:1,respawn:0,walkPhase:rand(0,Math.PI*2),patrol:rand(0,Math.PI*2)};createHumanoid(a);botList.push(a);actors.push(a);return a;}
  function createEntities(){const spots=[[-55,-4],[-34,-16],[-6,-35],[18,-34],[38,23],[0,56]];spots.forEach((p,i)=>makeTarget(p[0],p[1],i+1));}
  const nav={min:-68,step:2,size:69,blocked:[],field:[],refresh:0};
  function navIndex(x,z){return {x:Math.max(0,Math.min(nav.size-1,Math.round((x-nav.min)/nav.step))),z:Math.max(0,Math.min(nav.size-1,Math.round((z-nav.min)/nav.step)))};}
  function navPosition(x,z){return {x:nav.min+x*nav.step,z:nav.min+z*nav.step};}
  function navCellBlocked(x,z){if(x<0||z<0||x>=nav.size||z>=nav.size)return true;return nav.blocked[z*nav.size+x];}
  function buildNavigationGrid(){nav.blocked=new Array(nav.size*nav.size).fill(false);for(let z=0;z<nav.size;z++)for(let x=0;x<nav.size;x++){const p=navPosition(x,z);nav.blocked[z*nav.size+x]=obstacles.some(o=>Math.abs(p.x-o.x)<o.rx+.48&&Math.abs(p.z-o.z)<o.rz+.48);}nav.field=new Array(nav.size*nav.size).fill(Infinity);}
  function nearestOpenCell(x,z){const start=navIndex(x,z);if(!navCellBlocked(start.x,start.z))return start;for(let r=1;r<8;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(Math.abs(dx)+Math.abs(dz)!==r)continue;const cx=start.x+dx,cz=start.z+dz;if(!navCellBlocked(cx,cz))return {x:cx,z:cz};}return start;}
  function refreshNavigation(){if(!nav.blocked.length)return;nav.field.fill(Infinity);const goal=nearestOpenCell(camera.position.x,camera.position.z),queue=new Int16Array(nav.size*nav.size);let head=0,tail=0,start=goal.z*nav.size+goal.x;nav.field[start]=0;queue[tail++]=start;while(head<tail){const at=queue[head++],x=at%nav.size,z=Math.floor(at/nav.size),next=nav.field[at]+1;for(const [nx,nz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){if(navCellBlocked(nx,nz))continue;const ni=nz*nav.size+nx;if(next<nav.field[ni]){nav.field[ni]=next;queue[tail++]=ni;}}}nav.refresh=.55;}

  const weaponRoot=new BABYLON.TransformNode('weapon rig',scene);weaponRoot.parent=camera;weaponRoot.position.set(.35,-.32,.82);
  function weaponPart(name,x,y,z,w,h,d,material,rotZ=0,rotX=0){const m=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);m.parent=weaponRoot;m.position.set(x,y,z);m.rotation.set(rotX,0,rotZ);m.material=material;m.isPickable=false;return m;}
  // Compact, fictional service rifle and sidearm; deliberately low-poly.
  const gunParts=[];
  gunParts.push(weaponPart('T-04 receiver',0,0,0,.16,.18,.52,M.gun));gunParts.push(weaponPart('T-04 upper rail',0,.105,-.01,.12,.045,.58,M.steel));gunParts.push(weaponPart('T-04 barrel',0,.015,.42,.065,.065,.36,M.black));gunParts.push(weaponPart('T-04 muzzle',0,.015,.62,.09,.09,.08,M.steel));gunParts.push(weaponPart('T-04 handguard',0,.015,.27,.15,.13,.26,M.steel2));gunParts.push(weaponPart('T-04 magazine',0,-.2,.06,.12,.28,.18,M.black,-.12));gunParts.push(weaponPart('T-04 stock',0,-.02,-.4,.15,.16,.31,M.steel2));gunParts.push(weaponPart('T-04 optic',0,.19,-.04,.09,.1,.12,M.black));gunParts.push(weaponPart('T-04 grip',0,-.17,-.14,.11,.21,.11,M.gun,.18));
  const pistolParts=[];pistolParts.push(weaponPart('P-09 slide',0,0,0,.14,.12,.4,M.steel));pistolParts.push(weaponPart('P-09 barrel',0,.01,.23,.06,.06,.15,M.black));pistolParts.push(weaponPart('P-09 grip',0,-.15,-.07,.11,.24,.14,M.gun,.22));pistolParts.push(weaponPart('P-09 front sight',0,.075,.15,.04,.04,.04,M.black));
  function showWeapon(){const pistol=weapon==='pistol';gunParts.forEach(p=>p.setEnabled(!pistol));pistolParts.forEach(p=>p.setEnabled(pistol));weaponRoot.position.set(.36,pistol?-.31:-.34,pistol?.7:.84);}
  showWeapon();
  let velocityY=0, eyeHeight=1.72, jumpRequested=false, playerMoving=false;
  camera.ellipsoidOffset=new BABYLON.Vector3(0,-.82,0);camera.inputs.removeByType('FreeCameraKeyboardMoveInput');camera.angularSensibility=3100;
  function notify(text,tag='TRANSMISSÃO RECEBIDA'){const t=$('toast');$('toast-text').textContent=text;t.querySelector('span').textContent=tag;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3100);}
  function audioTone(freq=160,duration=.08,type='square',volume=.035){try{const AC=window.AudioContext||window.webkitAudioContext;if(!window._tacticalAudio)window._tacticalAudio=new AC();const ctx=window._tacticalAudio;if(ctx.state==='suspended')ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(35,freq*.48),ctx.currentTime+duration);gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+duration);}catch(e){}}
  function setHUD(){
    $('health-value').textContent=Math.ceil(health);$('health-bar').style.width=Math.max(0,health)+'%';$('armor-value').textContent=Math.ceil(armor);$('armor-bar').style.width=Math.max(0,armor)+'%';$('cash-value').textContent='$ '+cash.toLocaleString('en-US');
    const pistol=weapon==='pistol';$('weapon-name').textContent=pistol?'P-09':'T-04';$('weapon-class').textContent=pistol?'PISTOLA SEMIAUTOMÁTICA':'FUZIL DE ASSALTO';$('ammo-current').textContent=pistol?ammo.pistol:ammo.rifle;$('ammo-reserve').textContent=pistol?reserve.pistol:reserve.rifle;
    $('slot-rifle').classList.toggle('active',!pistol);$('slot-pistol').classList.toggle('active',pistol);$('health-bar').style.background=health<30?'#cf594a':'var(--acid)';
    $('stance-icon').textContent=stance==='prone'?'⌄':stance==='crouched'?'⌑':isRunning?'⌁':'⌖';
  }
  const ammo={rifle:30,pistol:12},reserve={rifle:90,pistol:48};
  function makeImpact(point,normal){const mark=BABYLON.MeshBuilder.CreateSphere('fresh impact mark',{diameter:.115,segments:5},scene);mark.position=point.add(normal.scale(.025));mark.material=M.black;mark.isPickable=false;setTimeout(()=>mark.dispose(),12000);}
  function fire(){if(!started||paused||!alive||reloading)return;const now=performance.now(),pistol=weapon==='pistol',rate=pistol?320:105;if(now-lastShot<rate)return;const key=pistol?'pistol':'rifle';if(ammo[key]<=0){audioTone(220,.04,'square',.012);notify('Sem munição no carregador. Pressione R.','SISTEMA DE ARMAS');return;}lastShot=now;ammo[key]--;shotCount++;audioTone(pistol?205:115,pistol?.075:.11,'sawtooth',pistol?.028:.038);const moving=moveAmount>0.1,spread=(pistol?.008:.004)+(moving?.018:.007)+(isRunning?.015:0)+(stance==='crouched'?-.002:0);const dir=camera.getForwardRay().direction.clone();dir.x+=(Math.random()-.5)*spread;dir.y+=(Math.random()-.5)*spread;dir.z+=(Math.random()-.5)*spread;dir.normalize();const ray=new BABYLON.Ray(camera.position,dir,100);
    const hit=scene.pickWithRay(ray,m=>m.isPickable&&m.metadata&&m.metadata.actor);if(hit&&hit.hit&&hit.pickedMesh){const a=hit.pickedMesh.metadata.actor;if(a.alive){a.hp-=a.type==='target'?1:(pistol?38:34);makeImpact(hit.pickedPoint,hit.getNormal(true)||V(0,1,0));$('hit-marker').classList.add('show');setTimeout(()=>$('hit-marker').classList.remove('show'),130);if(a.hp<=0)eliminate(a);}}
    weaponRoot.position.z=(pistol?.7:.84)-.055;setTimeout(()=>weaponRoot.position.z=pistol?.7:.84,65);$('crosshair').style.transform='translate(-50%,-50%) scale(1.3)';setTimeout(()=>$('crosshair').style.transform='translate(-50%,-50%)',90);setHUD();
  }
  function eliminate(a){a.alive=false;a.parts.forEach(p=>p.setEnabled(false));if(a.type==='target'){score++;cash+=50;notify('Alvo '+String(a.index).padStart(2,'0')+' neutralizado · +$50','EXERCÍCIO DE TIRO');a.respawn=3.2;}else{blueScore++;cash+=300;notify('Hostil neutralizado · +$300','AMEAÇA ELIMINADA');a.respawn=7;addFeed('VOCÊ','HOSTIL '+String(a.id).padStart(2,'0'));}setHUD();}
  function addFeed(killer,victim){const d=document.createElement('div');d.innerHTML='<b>'+killer+'</b>　▸　'+victim;$('killfeed').prepend(d);setTimeout(()=>d.remove(),4100);}
  function reload(){const key=weapon==='pistol'?'pistol':'rifle';if(reloading||ammo[key]>=(key==='pistol'?12:30)||reserve[key]<=0)return;reloading=true;$('reload-indicator').classList.remove('hidden');audioTone(420,.055,'triangle',.014);setTimeout(()=>{const needed=(key==='pistol'?12:30)-ammo[key],take=Math.min(needed,reserve[key]);ammo[key]+=take;reserve[key]-=take;reloading=false;$('reload-indicator').classList.add('hidden');audioTone(620,.045,'triangle',.014);setHUD();},key==='pistol'?1250:1650);}
  function switchWeapon(w){if(reloading)return;weapon=w;showWeapon();setHUD();audioTone(320,.035,'triangle',.012);}
  function respawnActor(a){a.hp=a.type==='target'?a.maxHp:100;a.alive=true;a.parts.forEach(p=>p.setEnabled(true));a.respawn=0;if(a.type==='bot'){a.x=rand(-45,45);a.z=rand(-50,45);}}
  function endPlayer(){if(!alive)return;alive=false;health=0;$('health-value').textContent='0';notify('Operador abatido. Recomece o setor para continuar.','SINAL PERDIDO');setTimeout(()=>{$('pause-screen').classList.remove('hidden');$('pause-screen').querySelector('.eyebrow').textContent='OPERAÇÃO ENCERRADA';$('pause-screen').querySelector('h2').textContent='OPERADOR ABATIDO.';$('pause-screen').querySelector('p').textContent='A equipe de extração foi notificada.';paused=true;},1300);}
  function damagePlayer(amount){if(!alive)return;let hit=amount;if(armor>0){const absorb=Math.min(armor,amount*.65);armor-=absorb;hit-=absorb*.55;}health=Math.max(0,health-hit);$('damage-vignette').classList.add('hit');setTimeout(()=>$('damage-vignette').classList.remove('hit'),220);audioTone(70,.12,'sawtooth',.045);setHUD();if(health<=0)endPlayer();}
  function updateBots(dt){
    if(mode!=='bots')return;
    nav.refresh-=dt;if(nav.refresh<=0)refreshNavigation();
    for(const a of botList){
      if(!a.alive){a.respawn-=dt;if(a.respawn<=0)respawnActor(a);continue;}
      let dx=camera.position.x-a.x,dz=camera.position.z-a.z,dist=Math.hypot(dx,dz),moving=false;
      if(dist>10.5&&dist<82){
        const here=nearestOpenCell(a.x,a.z);let best=here,bestCost=nav.field[here.z*nav.size+here.x];
        for(const [nx,nz] of [[here.x+1,here.z],[here.x-1,here.z],[here.x,here.z+1],[here.x,here.z-1]]){if(navCellBlocked(nx,nz))continue;const cost=nav.field[nz*nav.size+nx];if(cost<bestCost){best={x:nx,z:nz};bestCost=cost;}}
        if(Number.isFinite(bestCost)){const goal=navPosition(best.x,best.z),vx=goal.x-a.x,vz=goal.z-a.z,length=Math.hypot(vx,vz);if(length>.28){const step=Math.min(length,a.speed*dt),nx=a.x+vx/length*step,nz=a.z+vz/length*step,cell=navIndex(nx,nz);if(!navCellBlocked(cell.x,cell.z)){a.x=nx;a.z=nz;moving=true;}}}
      }else if(dist<=10.5){
        const strafeSpeed=a.speed*.42,side=a.strafe*strafeSpeed*dt,nx=a.x+(-dz/(dist||1))*side,nz=a.z+(dx/(dist||1))*side,cell=navIndex(nx,nz);
        if(!navCellBlocked(cell.x,cell.z)){a.x=nx;a.z=nz;moving=true;}else a.strafe*=-1;
      }
      a.x=Math.max(-66,Math.min(66,a.x));a.z=Math.max(-66,Math.min(66,a.z));
      dx=camera.position.x-a.x;dz=camera.position.z-a.z;dist=Math.hypot(dx,dz);
      a.walkPhase+=dt*(moving?9:2);const bob=moving?Math.abs(Math.sin(a.walkPhase))*.045:Math.sin(performance.now()*.002+a.id)*.008,yaw=Math.atan2(-dx,-dz);
      a.parts.forEach((p,i)=>{const base=a.basePositions[i],lx=base.x-a.originX,lz=base.z-a.originZ,swing=moving?Math.sin(a.walkPhase+(i%2?Math.PI:0))*.28:0;p.position.x=a.x+lx*Math.cos(yaw)+lz*Math.sin(yaw);p.position.z=a.z-lx*Math.sin(yaw)+lz*Math.cos(yaw);p.position.y=base.y+bob;p.rotation.y=yaw;p.rotation.z=a.baseRotations[i].z+(p.name.includes('field trousers')||p.name.includes('sleeved arm')?swing:0);});
      a.shoot-=dt;if(dist<38&&a.shoot<=0&&alive){a.shoot=rand(.8,1.55);const from=V(a.x,1.5,a.z),to=camera.position.clone();to.y=1.45;const rayVector=to.subtract(from),rayLength=rayVector.length(),hit=scene.pickWithRay(new BABYLON.Ray(from,rayVector.normalize(),rayLength),m=>m.checkCollisions&&!(m.metadata&&m.metadata.actor)),visible=!(hit&&hit.hit&&hit.distance<rayLength-.5);if(visible){const chance=Math.max(.18,.58-dist/85);if(Math.random()<chance){damagePlayer(rand(5,10));const tracer=BABYLON.MeshBuilder.CreateLines('hostile tracer',{points:[from,to]},scene);tracer.color=new BABYLON.Color3(.92,.43,.25);setTimeout(()=>tracer.dispose(),130);}}}
    }
  }
  function actorRenderPosition(a){return a.parts.length?a.parts[0].position:V(a.x,0,a.z);}
  function drawRadar(){const c=$('radar'),ctx=c.getContext('2d'),w=c.width,h=c.height,cx=w/2,cy=h/2;ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();ctx.arc(cx,cy,cx-3,0,Math.PI*2);ctx.clip();ctx.fillStyle='rgba(29,39,31,.94)';ctx.fillRect(0,0,w,h);ctx.strokeStyle='rgba(217,155,77,.22)';ctx.lineWidth=1;for(let r=25;r<cx;r+=25){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,h);ctx.moveTo(0,cy);ctx.lineTo(w,cy);ctx.stroke();ctx.strokeStyle='rgba(190,196,166,.14)';ctx.beginPath();ctx.moveTo(14,32);ctx.lineTo(59,32);ctx.lineTo(59,62);ctx.lineTo(82,62);ctx.moveTo(108,20);ctx.lineTo(108,80);ctx.lineTo(133,80);ctx.moveTo(20,119);ctx.lineTo(55,119);ctx.stroke();
    const px=camera.position.x,pz=camera.position.z,scale=1.5;const dot=(x,z,color,rad=3)=>{const rx=cx+(x-px)*scale,ry=cy+(z-pz)*scale;if(Math.hypot(rx-cx,ry-cy)<cx-5){ctx.fillStyle=color;ctx.beginPath();ctx.arc(rx,ry,rad,0,Math.PI*2);ctx.fill();}};targets.forEach(a=>{if(a.alive)dot(a.x,a.z,'#e1aa60',2.4);});if(mode==='bots')botList.forEach(a=>{if(a.alive){const rx=cx+(a.x-px)*scale,ry=cy+(a.z-pz)*scale;if(Math.hypot(rx-cx,ry-cy)<cx-4){ctx.fillStyle='#e07b5b';ctx.beginPath();ctx.moveTo(rx,ry-4);ctx.lineTo(rx+3.4,ry+3);ctx.lineTo(rx-3.4,ry+3);ctx.closePath();ctx.fill();}}});ctx.translate(cx,cy);ctx.rotate(-camera.rotation.y);ctx.fillStyle='#83b5c9';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(0,3);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();}
  function formatTime(s){const n=Math.max(0,Math.ceil(s));return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
  function movePlayer(delta){
    const radius=.42, collides=(x,z)=>obstacles.some(o=>Math.abs(x-o.x)<o.rx+radius&&Math.abs(z-o.z)<o.rz+radius);
    const nextX=camera.position.x+delta.x,nextZ=camera.position.z+delta.z;
    if(!collides(nextX,camera.position.z))camera.position.x=nextX;
    if(!collides(camera.position.x,nextZ))camera.position.z=nextZ;
  }
  function update(dt){if(!started||paused)return;
    // Legacy-style acceleration, air control, sprint and silent walk.
    const forward=camera.getDirection(BABYLON.Axis.Z).clone();forward.y=0;forward.normalize();const right=camera.getDirection(BABYLON.Axis.X).clone();right.y=0;right.normalize();let ix=(keys.d?1:0)-(keys.a?1:0),iz=(keys.w?1:0)-(keys.s?1:0);const mag=Math.hypot(ix,iz);if(mag>0){ix/=mag;iz/=mag;}playerMoving=mag>0;isRunning=!!keys.shift&&playerMoving;slowWalk=!!keys.alt;stance=keys.z?'prone':(keys.control?'crouched':'standing');const speed=stance==='prone'?1.65:stance==='crouched'?2.55:slowWalk?2.45:isRunning?7.2:4.15;moveAmount+=( (playerMoving?1:0)-moveAmount)*Math.min(1,dt*9);const horizontal=forward.scale(iz*speed*dt).add(right.scale(ix*speed*dt));
    if(jumpRequested&&grounded&&stance==='standing'){velocityY=5.1;grounded=false;}jumpRequested=false;velocityY-=12.5*dt;const nextY=camera.position.y+velocityY*dt;if(nextY<=eyeHeight){camera.position.y=eyeHeight;velocityY=0;grounded=true;}else{camera.position.y=nextY;grounded=false;}movePlayer(horizontal);
    // Prevent walking through the perimeter if collision precision is reduced by software rendering.
    camera.position.x=Math.max(-70,Math.min(70,camera.position.x));camera.position.z=Math.max(-70,Math.min(70,camera.position.z));
    const eyeTarget=stance==='prone'?1.0:stance==='crouched'?1.28:1.72;eyeHeight+=(eyeTarget-eyeHeight)*Math.min(1,dt*12);if(Math.abs(camera.position.y-eyeHeight)<.15&&!grounded){camera.position.y=eyeHeight;velocityY=0;grounded=true;}
    updateBots(dt);for(const a of targets){if(!a.alive){a.respawn-=dt;if(a.respawn<=0)respawnActor(a);}}
    roundSeconds-=dt;if(roundSeconds<=0){roundSeconds=240;redScore++;notify('Rodada encerrada. Reposicionando equipe.','FIM DE RODADA');health=100;armor=100;ammo.rifle=30;ammo.pistol=12;setHUD();}
    $('clock').textContent=formatTime(roundSeconds);$('blue-score').textContent=blueScore;$('red-score').textContent=redScore;$('crosshair').style.width=(30+moveAmount*(isRunning?12:5))+'px';$('crosshair').style.height=(30+moveAmount*(isRunning?12:5))+'px';drawRadar();
  }

  function setMode(next){mode=next;document.querySelectorAll('.mode-card').forEach(el=>el.classList.toggle('selected',el.dataset.mode===next));$('mode-label').textContent=next==='bots'?'COMBATE LOCAL':'TREINAMENTO';$('objective-text').textContent=next==='bots'?'NEUTRALIZAR HOSTIS':'NEUTRALIZAR ALVOS';}
  function resetRound(){health=100;armor=100;cash=800;score=0;blueScore=0;redScore=0;roundSeconds=240;alive=true;roundOver=false;ammo.rifle=30;ammo.pistol=12;reserve.rifle=90;reserve.pistol=48;camera.position.set(0,1.72,-51);camera.rotation.set(0,0,0);velocityY=0;eyeHeight=1.72;botList.forEach((a,i)=>{a.alive=true;a.hp=100;a.x=[-36,34,-10,40][i];a.z=[20,18,-2,-37][i];a.parts.forEach(p=>p.setEnabled(true));});targets.forEach(a=>{a.alive=true;a.hp=3;a.parts.forEach(p=>p.setEnabled(true));});setHUD();}
  function beginGame(){if(started)return;started=true;paused=false;resetRound();$('main-menu').classList.add('hidden');$('pause-screen').classList.add('hidden');$('hud').classList.remove('hidden');canvas.requestPointerLock?.();notify(mode==='bots'?'Quatro hostis detectados. Avance com cautela.':'Seis alvos ativos. Confirme a mira e abra fogo.','BRIEFING DE CAMPO');setTimeout(()=>{if(window.matchMedia('(pointer:coarse)').matches)$('touch-controls').style.display='flex';},250);}
  function pauseGame(){if(!started)return;paused=true;$('pause-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();}
  function resumeGame(){if(!started)return;paused=false;$('pause-screen').classList.add('hidden');canvas.requestPointerLock?.();}
  function goMenu(){paused=false;started=false;$('pause-screen').classList.add('hidden');$('hud').classList.add('hidden');$('main-menu').classList.remove('hidden');document.exitPointerLock?.();camera.position.set(0,1.72,-51);camera.rotation.set(0,0,0);}

  createWorld();createEntities();[[-36,20],[34,18],[-10,-2],[40,-37]].forEach((p,i)=>makeBot(p[0],p[1],i+1));buildNavigationGrid();
  document.querySelectorAll('.mode-card').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
  $('play-button').addEventListener('click',beginGame);$('training-button').addEventListener('click',()=>{setMode('training');beginGame();});
  $('settings-open').addEventListener('click',()=>$('settings-modal').classList.remove('hidden'));$('settings-close').addEventListener('click',()=>$('settings-modal').classList.add('hidden'));
  $('resume-button').addEventListener('click',resumeGame);$('restart-button').addEventListener('click',()=>{resetRound();paused=false;$('pause-screen').classList.add('hidden');canvas.requestPointerLock?.();notify('Setor reiniciado. Boa sorte.','REINÍCIO DE OPERAÇÃO');});$('menu-button').addEventListener('click',goMenu);
  $('fov-setting').addEventListener('input',e=>{camera.fov=Number(e.target.value)*Math.PI/180;$('fov-value').textContent=e.target.value+'°';});
  $('sens-setting').addEventListener('input',e=>{sensitivity=Number(e.target.value)/10;camera.angularSensibility=3100/sensitivity;$('sens-value').textContent=sensitivity.toFixed(1)+'×';});
  $('quality-setting').addEventListener('change',e=>{quality=e.target.value;$('quality-value').textContent={high:'ALTA',medium:'MÉDIA',low:'BAIXA'}[quality];shadow.setDarkness(quality==='high'?.3:quality==='medium'?.22:.1);engine.setHardwareScalingLevel(quality==='high'?Math.min(1.15,window.devicePixelRatio||1):quality==='medium'?1.25:1.55);});
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(document.activeElement.tagName))return;const k=e.key.toLowerCase();keys[k]=true;if(k===' '){e.preventDefault();jumpRequested=true;}if(k==='r'){e.preventDefault();reload();}if(k==='1')switchWeapon('rifle');if(k==='2')switchWeapon('pistol');if(k==='escape'&&started&&!paused&&document.pointerLockElement!==canvas)pauseGame();if(k==='escape'&&started&&paused)resumeGame();if(k==='control')e.preventDefault();});
  window.addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});window.addEventListener('blur',()=>{Object.keys(keys).forEach(k=>keys[k]=false);fireHeld=false;});
  canvas.addEventListener('pointerdown',e=>{if(e.button===0&&started&&!paused){fireHeld=true;fire();}});window.addEventListener('pointerup',()=>fireHeld=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerlockchange',()=>{if(started&&document.pointerLockElement!==canvas&&!paused)pauseGame();});
  document.querySelectorAll('[data-key]').forEach(button=>{const key=button.dataset.key;button.addEventListener('pointerdown',e=>{e.preventDefault();keys[key]=true;});['pointerup','pointerleave','pointercancel'].forEach(ev=>button.addEventListener(ev,e=>{e.preventDefault();keys[key]=false;}));});
  $('touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();fireHeld=true;fire();});['pointerup','pointerleave','pointercancel'].forEach(ev=>$('touch-fire').addEventListener(ev,()=>fireHeld=false));
  $('touch-crouch').addEventListener('pointerdown',e=>{e.preventDefault();keys.control=!keys.control;});
  window.addEventListener('resize',()=>engine.resize());
  scene.onReadyObservable.addOnce(()=>{const l=$('loading');l.style.opacity='0';setTimeout(()=>l.classList.add('hidden'),550);});
  engine.runRenderLoop(()=>{const dt=Math.min(.05,engine.getDeltaTime()/1000);if(fireHeld&&started&&!paused)fire();update(dt);scene.render();});
})();
