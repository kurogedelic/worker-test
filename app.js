import {TarotCore} from './tarot-core.js';
const TAU=Math.PI*2;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const mod=(x,m)=>((x%m)+m)%m;
const rand=(a=1,b)=>b===undefined?Math.random()*a:a+Math.random()*(b-a);
const midiHz=n=>440*Math.pow(2,(n-69)/12);

class PinkDrift{
  constructor(n=7){this.cells=Array.from({length:n},()=>Math.random()*2-1);this.counter=0;}
  next(){this.counter++;let c=this.counter;for(let i=0;i<this.cells.length;i++){if((c&(1<<i))===0)this.cells[i]=Math.random()*2-1;}return this.cells.reduce((a,b)=>a+b,0)/this.cells.length;}
}

class AudioBus{
  constructor(){this.ctx=null;this.master=null;this.dest=null;this.recorder=null;this.chunks=[];this.activeView='star';}
  async start(){if(this.ctx){await this.ctx.resume();return;}this.ctx=new AudioContext({sampleRate:48000,latencyHint:'interactive'});this.master=this.ctx.createGain();this.master.gain.value=.42;this.dest=this.ctx.createMediaStreamDestination();this.master.connect(this.ctx.destination);this.master.connect(this.dest);}
  bell(freq,index=2.2,decay=.9,brightness=.5,pan=0){if(!this.ctx)return;const t=this.ctx.currentTime;const c=this.ctx.createOscillator(),m=this.ctx.createOscillator(),mg=this.ctx.createGain(),amp=this.ctx.createGain(),p=this.ctx.createStereoPanner();const ratio=1.35+brightness*2.7;c.frequency.setValueAtTime(freq,t);m.frequency.setValueAtTime(freq*ratio,t);mg.gain.setValueAtTime(freq*index,t);mg.gain.exponentialRampToValueAtTime(0.001,t+Math.max(.05,decay*.68));amp.gain.setValueAtTime(.0001,t);amp.gain.exponentialRampToValueAtTime(.17,t+.004);amp.gain.exponentialRampToValueAtTime(.0001,t+decay);p.pan.value=clamp(pan,-1,1);m.connect(mg);mg.connect(c.frequency);c.connect(amp);amp.connect(p);p.connect(this.master);c.start(t);m.start(t);c.stop(t+decay+.08);m.stop(t+decay+.08);}
  beginRecord(){if(!this.dest||this.recorder)return false;this.chunks=[];this.recorder=new MediaRecorder(this.dest.stream);this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data)};this.recorder.onstop=()=>{const blob=new Blob(this.chunks,{type:this.recorder.mimeType||'audio/webm'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`tarots-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);this.recorder=null;};this.recorder.start();return true;}
  stopRecord(){if(this.recorder)this.recorder.stop();}
}
const audio=new AudioBus();

class StarLab{
  constructor(canvas){this.c=canvas;this.x=canvas.getContext('2d');this.nodes=[];this.edges=[];this.engine='sandpile';this.density=.52;this.motion=.44;this.tone=.64;this.freeze=false;this.last=performance.now();this.acc=0;this.topologyAcc=0;this.pink=new PinkDrift();this.phases=[0,1.7,4.1];this.walkers=[0,6];this.ca=[];this.avalanche=0;this.fireFlash=[];this.seed();requestAnimationFrame(t=>this.frame(t));}
  seed(){this.nodes=[];for(let i=0;i<12;i++){const a=-Math.PI/2+i*TAU/12+rand(-.16,.16);const r=.27+rand(-.04,.1);this.nodes.push({a,r,e:rand(.1,.6),thr:rand(.82,1.18),ref:0,phase:rand(TAU),omega:rand(.35,.8),state:i%3,driftA:rand(.7,1.5),driftR:rand(.6,1.4),driftP:rand(TAU)});}this.rebuildEdges();this.ca=this.nodes.map((_,i)=>i%3);this.walkers=[Math.floor(rand(12)),Math.floor(rand(12))];this.fireFlash=Array(12).fill(0);this.topologyAcc=0;}
  rebuildEdges(){this.edges=[];for(let i=0;i<12;i++)for(let j=i+1;j<12;j++){const d=Math.min(Math.abs(i-j),12-Math.abs(i-j));let p=.05+this.density*.38+(d<=2?.18:0);if(Math.random()<p)this.edges.push({a:i,b:j,w:rand(.22,.82),mem:rand(0,.2),flash:0});}for(let i=0;i<12;i++){if(!this.edges.some(e=>e.a===i||e.b===i))this.edges.push({a:i,b:(i+1)%12,w:.4,mem:0,flash:0});}}
  neighbours(i){return this.edges.filter(e=>e.a===i||e.b===i).map(e=>({j:e.a===i?e.b:e.a,e}));}
  fire(i,source=-1,energy=1){const n=this.nodes[i];if(n.ref>0)return;n.ref=.08+.26*(1-this.motion);n.e=.04;this.fireFlash[i]=1;this.avalanche++;let incoming=this.edges.find(e=>(e.a===i&&e.b===source)||(e.b===i&&e.a===source));if(incoming){incoming.mem=clamp(incoming.mem+.08);incoming.flash=1;}const midi=52+[0,2,4,7,9,11,14,16,19,21,23,26][i];let ratioBias=incoming?incoming.w:.45;let index=.7+ratioBias*4.8+(this.tone*.8);let decay=.18+this.tone*.95+Math.min(1,this.avalanche/6)*.35;if(audio.activeView==='star')audio.bell(midiHz(midi),index,decay,clamp(.18+ratioBias*.7),Math.sin((i/12)*TAU)*.75);if(this.engine==='sandpile'){for(const {j,e} of this.neighbours(i)){e.mem=clamp(e.mem+.025);this.nodes[j].e+=energy*(.08+.18*e.w)*(1+e.mem*.6);}}}
  tick(dt){if(this.freeze)return;this.avalanche=0;const slow=this.pink.next();this.phases[0]+=dt*(.28+.55*this.motion);this.phases[1]+=dt*(.17+.31*this.motion);this.phases[2]+=dt*(.10+.21*this.motion);
    // The constellation itself is alive: geometry slowly changes and that geometry
    // feeds back into edge weights, so visual motion changes FM colour and propagation.
    for(const e of this.edges){
      e.mem*=Math.exp(-dt*(.06+.12*(1-this.motion)));e.flash*=Math.exp(-dt*8);
      const a=this.modelPos(e.a),b=this.modelPos(e.b),dist=Math.hypot(a[0]-b[0],a[1]-b[1]);
      const geometric=clamp(1.15-dist*1.55,.12,.95);
      e.w=lerp(e.w,geometric,clamp(dt*(.18+this.motion*.9),0,1));
    }
    // At higher MOTION the topology occasionally mutates instead of merely wobbling.
    // One edge is replaced at a time so phrases drift rather than hard-reset.
    this.topologyAcc+=dt*(.035+this.motion*.22);
    if(this.topologyAcc>1){this.topologyAcc-=1;this.mutateEdge();}
    if(this.engine==='sandpile')this.tickSand(dt,slow);else if(this.engine==='kuramoto')this.tickKuramoto(dt);else if(this.engine==='walker')this.tickWalker(dt);else this.tickCA(dt);
    for(let i=0;i<12;i++){this.nodes[i].ref=Math.max(0,this.nodes[i].ref-dt);this.fireFlash[i]*=Math.exp(-dt*6);}
  }
  tickSand(dt,slow){for(let i=0;i<12;i++){const n=this.nodes[i];const phase=.16*Math.sin(this.phases[0]+i*.43)+.11*Math.sin(this.phases[1]-i*.29)+.07*Math.sin(this.phases[2]+i*.71);n.e+=dt*(.11+.44*this.motion)*(1+slow*.15);const thr=n.thr-phase;if(n.e>thr&&n.ref<=0)this.fire(i,-1,n.e);}}
  tickKuramoto(dt){const K=.2+this.density*1.8;const phases=this.nodes.map(n=>n.phase);for(let i=0;i<12;i++){let s=0,c=0;for(const {j,e} of this.neighbours(i)){s+=e.w*Math.sin(phases[j]-phases[i]);c+=e.w;}const n=this.nodes[i],old=n.phase;n.phase+=dt*(n.omega*(.8+this.motion*2.8)+K*s/Math.max(1,c));if(Math.floor(old/TAU)!==Math.floor(n.phase/TAU))this.fire(i,-1,.7);}}
  tickWalker(dt){this.acc+=dt*(.7+this.motion*4);if(this.acc<1)return;this.acc-=1;for(let k=0;k<this.walkers.length;k++){const i=this.walkers[k],ns=this.neighbours(i);let total=ns.reduce((s,q)=>s+.1+q.e.w*(1+q.e.mem*2),0),r=rand(total),pick=ns[0];for(const q of ns){r-=.1+q.e.w*(1+q.e.mem*2);if(r<=0){pick=q;break;}}this.walkers[k]=pick.j;this.fire(pick.j,i,.8);}}
  tickCA(dt){this.acc+=dt*(.5+this.motion*3);if(this.acc<1)return;this.acc-=1;const next=this.ca.slice();for(let i=0;i<12;i++){const target=(this.ca[i]+1)%3;const hits=this.neighbours(i).filter(q=>this.ca[q.j]===target).length;if(hits>0&&Math.random()<.25+this.density*.65){next[i]=target;this.fire(i,-1,.6);}}this.ca=next;}
  resize(){const dpr=devicePixelRatio||1,r=this.c.getBoundingClientRect();if(this.c.width!==Math.floor(r.width*dpr)||this.c.height!==Math.floor(r.height*dpr)){this.c.width=Math.floor(r.width*dpr);this.c.height=Math.floor(r.height*dpr);this.x.setTransform(dpr,0,0,dpr,0,0);}}
  modelPos(i){const n=this.nodes[i],m=this.motion;
    const a=n.a+m*(.095*Math.sin(this.phases[0]*n.driftA+n.driftP)+.045*Math.sin(this.phases[2]*(1.7-n.driftA)+i*.7));
    const r=n.r+m*(.035*Math.sin(this.phases[1]*n.driftR+n.driftP*.63)+.016*Math.sin(this.phases[0]*.7+i));
    return[Math.cos(a)*r,Math.sin(a)*r];
  }
  mutateEdge(){if(this.edges.length<1)return;
    const idx=Math.floor(rand(this.edges.length)),old=this.edges[idx];
    let a=Math.random()<.5?old.a:old.b,b=Math.floor(rand(12)),guard=0;
    while((b===a||this.edges.some((e,k)=>k!==idx&&((e.a===a&&e.b===b)||(e.a===b&&e.b===a))))&&guard++<24)b=Math.floor(rand(12));
    if(b!==a){this.edges[idx]={a:Math.min(a,b),b:Math.max(a,b),w:.45,mem:old.mem*.5,flash:.35};}
  }
  pos(i,w,h){const s=Math.min(w,h),cx=w/2,cy=h/2,p=this.modelPos(i);return[cx+p[0]*s,cy+p[1]*s];}
  draw(){this.resize();const r=this.c.getBoundingClientRect(),w=r.width,h=r.height,ctx=this.x;ctx.fillStyle='rgba(11,11,11,'+(0.26+0.50*(1-this.motion))+')';ctx.fillRect(0,0,w,h);const s=Math.min(w,h),cx=w/2,cy=h/2;ctx.strokeStyle='#26251f';ctx.lineWidth=1;for(const q of [.18,.31,.43]){ctx.beginPath();ctx.arc(cx,cy,s*q,0,TAU);ctx.stroke();}
    for(const e of this.edges){const a=this.pos(e.a,w,h),b=this.pos(e.b,w,h);ctx.strokeStyle=e.flash>.06?`rgba(231,211,134,${.25+.65*e.flash})`:`rgba(122,113,80,${.08+.22*e.mem})`;ctx.lineWidth=1+e.mem*1.4;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}
    for(let i=0;i<12;i++){const [x,y]=this.pos(i,w,h),f=this.fireFlash[i],hue=(i*31+320)%360;ctx.fillStyle=`hsla(${hue},70%,70%,${.35+.65*f})`;ctx.shadowBlur=4+f*28;ctx.shadowColor=`hsl(${hue} 80% 65%)`;ctx.beginPath();ctx.arc(x,y,3.6+f*3.8,0,TAU);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#777067';ctx.font='9px monospace';ctx.fillText(String(i+1).padStart(2,'0'),x+8,y+3);}
    ctx.fillStyle='#81785f';ctx.font='11px monospace';ctx.fillText('XII VISIBLE NODES',16,24);ctx.fillStyle='#49473f';ctx.fillText(this.engine.toUpperCase(),16,41);
  }
  frame(t){const dt=Math.min(.05,(t-this.last)/1000);this.last=t;this.tick(dt);this.draw();requestAnimationFrame(x=>this.frame(x));}
}

class WheelLab{
  constructor(canvas){this.c=canvas;this.x=canvas.getContext('2d');this.angle=0;this.omega=0;this.friction=.72;this.spread=.48;this.drive=.56;this.engine='rigid';this.drag=false;this.lastPointer=null;this.last=performance.now();this.teeth=[16,23,31,47,64,89,127,191];this.phase=Array(this.teeth.length).fill(0);this.speed=Array(this.teeth.length).fill(0);this.osc=[];this.gains=[];this.initInput();requestAnimationFrame(t=>this.frame(t));}
  initInput(){const point=e=>{const r=this.c.getBoundingClientRect();return{x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2,t:performance.now()}};this.c.addEventListener('pointerdown',e=>{this.c.setPointerCapture(e.pointerId);this.drag=true;this.lastPointer=point(e)});this.c.addEventListener('pointermove',e=>{if(!this.drag)return;const p=point(e),a=Math.atan2(p.y,p.x),b=Math.atan2(this.lastPointer.y,this.lastPointer.x),da=Math.atan2(Math.sin(a-b),Math.cos(a-b)),dt=Math.max(.004,(p.t-this.lastPointer.t)/1000);this.angle+=da;this.omega=lerp(this.omega,da/dt,.7);this.lastPointer=p;});this.c.addEventListener('pointerup',()=>{this.drag=false;this.lastPointer=null});this.c.addEventListener('pointercancel',()=>{this.drag=false;this.lastPointer=null});}
  async ensureAudio(){if(!audio.ctx)return;if(this.osc.length)return;for(let i=0;i<this.teeth.length;i++){const o=audio.ctx.createOscillator(),g=audio.ctx.createGain(),p=audio.ctx.createStereoPanner();o.type=i%3===0?'triangle':'sine';g.gain.value=0;p.pan.value=lerp(-.8,.8,i/(this.teeth.length-1));o.connect(g);g.connect(p);p.connect(audio.master);o.start();this.osc.push(o);this.gains.push(g);}}
  tick(dt){if(!this.drag){this.omega*=Math.exp(-dt*this.friction);if(Math.abs(this.omega)<.002)this.omega=0;this.angle+=this.omega*dt;}const rps=this.omega/TAU;for(let i=0;i<this.teeth.length;i++){let target=rps*this.teeth[i];if(this.engine==='spring'){const follow=.7+i*.22;this.speed[i]+=((target-this.speed[i])*follow)*dt;this.speed[i]*=Math.exp(-dt*.08);}else if(this.engine==='slip'){const slip=1+(i%2?1:-1)*this.spread*.018*Math.sin(this.angle*(i+1)*.13);this.speed[i]=target*slip;}else if(this.engine==='circle'){const K=.1+this.spread*1.2,th=mod(this.phase[i]/TAU,1);const mapped=th+(target*dt)-K/TAU*Math.sin(TAU*th);this.speed[i]=(mapped-th)/dt;this.phase[i]=TAU*mod(mapped,1);}else this.speed[i]=target;
      if(this.engine!=='circle')this.phase[i]+=this.speed[i]*TAU*dt;
      if(this.osc[i]){const hz=clamp(Math.abs(this.speed[i]),8,9000);const amp=(audio.activeView==='wheel'&&Math.abs(this.omega)>=.02)?(.012+.035*this.drive)/(1+i*.08):0;this.osc[i].frequency.setTargetAtTime(hz,audio.ctx.currentTime,.025);this.gains[i].gain.setTargetAtTime(amp,audio.ctx.currentTime,.04);}}
  }
  resize(){const dpr=devicePixelRatio||1,r=this.c.getBoundingClientRect();if(this.c.width!==Math.floor(r.width*dpr)||this.c.height!==Math.floor(r.height*dpr)){this.c.width=Math.floor(r.width*dpr);this.c.height=Math.floor(r.height*dpr);this.x.setTransform(dpr,0,0,dpr,0,0);}}
  draw(){this.resize();const r=this.c.getBoundingClientRect(),w=r.width,h=r.height,s=Math.min(w,h),ctx=this.x,cx=w/2,cy=h/2,R=s*.33;ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(cx,cy);ctx.rotate(this.angle);ctx.strokeStyle='#b6a76e';ctx.lineWidth=1;for(let k=0;k<5;k++){ctx.beginPath();ctx.arc(0,0,R*(.34+k*.15),0,TAU);ctx.stroke();}for(let i=0;i<48;i++){const a=i*TAU/48,r1=R*.82,r2=R*(i%4===0?.98:.92);ctx.beginPath();ctx.moveTo(Math.cos(a)*r1,Math.sin(a)*r1);ctx.lineTo(Math.cos(a)*r2,Math.sin(a)*r2);ctx.stroke();}ctx.fillStyle='#d9cfaa';ctx.beginPath();ctx.arc(0,0,R*.1,0,TAU);ctx.fill();ctx.restore();ctx.fillStyle='#81785f';ctx.font='11px monospace';ctx.fillText('VIRTUAL TONEWHEEL',16,24);ctx.fillStyle='#49473f';ctx.fillText(this.engine.toUpperCase(),16,41);ctx.fillText(`ω ${this.omega.toFixed(2)} rad/s`,16,58);}
  frame(t){const dt=Math.min(.05,(t-this.last)/1000);this.last=t;this.tick(dt);this.draw();requestAnimationFrame(x=>this.frame(x));}
}

function hexRgb(hex){const n=parseInt(hex.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255].map(v=>v/255)}
function lin(c){return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)}
function rgbLab(rgb){let [r,g,b]=rgb.map(lin);const X=(r*.4124+g*.3576+b*.1805)/.95047,Y=(r*.2126+g*.7152+b*.0722),Z=(r*.0193+g*.1192+b*.9505)/1.08883;const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;const fx=f(X),fy=f(Y),fz=f(Z);return[116*fy-16,500*(fx-fy),200*(fy-fz)]}
class LightInterpreter{
  constructor(){this.hex='#99514c';this.mode='adapt';this.memory=.82;this.rgb=hexRgb(this.hex);this.adapt=this.rgb.slice();this.hist=[0,0,0];this.out=this.rgb.slice();this.last=performance.now();requestAnimationFrame(t=>this.frame(t));}
  reset(){this.rgb=hexRgb(this.hex);this.adapt=this.rgb.slice();this.hist=[0,0,0];}
  tick(dt){
    this.rgb=hexRgb(this.hex);
    const speed=lerp(1.8,.018,this.memory);
    for(let i=0;i<3;i++)this.adapt[i]+=(this.rgb[i]-this.adapt[i])*(1-Math.exp(-dt*speed));
    const diff=this.rgb.map((v,i)=>v-this.adapt[i]);
    if(this.mode==='hysteresis'){
      for(let i=0;i<3;i++){this.hist[i]+=diff[i]*dt*.45;this.hist[i]*=Math.exp(-dt*.035);}
    }
    if(this.mode==='direct')this.out=this.rgb.slice();
    else if(this.mode==='after')this.out=this.rgb.map((_,i)=>clamp(.5-diff[i]*2.4));
    else if(this.mode==='hysteresis')this.out=this.rgb.map((v,i)=>clamp(v+this.hist[i]*.8));
    else this.out=this.rgb.map((_,i)=>clamp(.5+diff[i]*2.2));
    if(tarotAttached&&tarotIdx['light/red']!==undefined){
      tarot.setParam(tarotIdx['light/red'],this.out[0]);
      tarot.setParam(tarotIdx['light/green'],this.out[1]);
      tarot.setParam(tarotIdx['light/blue'],this.out[2]);
    }
    const glow=document.querySelector('#judgementGlow');
    if(glow){
      const c=this.out.map(v=>Math.round(v*255));
      glow.style.background=`radial-gradient(circle,rgba(${c[0]},${c[1]},${c[2]},.95),transparent 68%)`;
    }
  }
  frame(t){const dt=Math.min(.05,(t-this.last)/1000);this.last=t;this.tick(dt);requestAnimationFrame(x=>this.frame(x));}
}

class TarotPad{
  constructor(canvas,onGesture){this.c=canvas;this.x=canvas.getContext('2d');this.pressed=false;this.lastPointer=null;this.pressure=0;this.slideRate=0;this.magX=0;this.magY=0;this.onGesture=onGesture;this.last=performance.now();
    const point=e=>{const r=this.c.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*2-1,y:(e.clientY-r.top)/r.height*2-1,t:performance.now()}};
    canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);this.pressed=true;this.lastPointer=point(e);});
    canvas.addEventListener('pointermove',e=>{if(!this.pressed)return;const p=point(e),dt=Math.max(.004,(p.t-this.lastPointer.t)/1000);this.slideRate=clamp((p.x-this.lastPointer.x)/dt*2,-1,1);this.magX=clamp(p.x,-1,1);this.magY=clamp(-p.y,-1,1);this.lastPointer=p;});
    canvas.addEventListener('pointerup',()=>{this.pressed=false;this.lastPointer=null;});
    canvas.addEventListener('pointercancel',()=>{this.pressed=false;this.lastPointer=null;});
    requestAnimationFrame(t=>this.frame(t));
  }
  resize(){const dpr=devicePixelRatio||1,r=this.c.getBoundingClientRect();if(this.c.width!==Math.floor(r.width*dpr)||this.c.height!==Math.floor(r.height*dpr)){this.c.width=Math.floor(r.width*dpr);this.c.height=Math.floor(r.height*dpr);this.x.setTransform(dpr,0,0,dpr,0,0);}}
  frame(t){const dt=Math.min(.05,(t-this.last)/1000);this.last=t;
    if(this.pressed)this.pressure+=(1-this.pressure)*Math.min(1,dt*8);
    else{this.pressure+=(0-this.pressure)*Math.min(1,dt*6);this.slideRate*=Math.exp(-dt*6);}
    this.onGesture(this.pressure,this.slideRate,this.magX,this.magY);
    this.draw();requestAnimationFrame(x=>this.frame(x));
  }
  draw(){this.resize();const r=this.c.getBoundingClientRect(),w=r.width,h=r.height,ctx=this.x;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#26251f';ctx.lineWidth=1;ctx.strokeRect(w*.08,h*.08,w*.84,h*.84);
    const cx=w/2+this.magX*w*.38,cy=h/2-this.magY*h*.38,rad=6+this.pressure*24;
    ctx.fillStyle=`rgba(216,199,127,${.25+.65*this.pressure})`;ctx.shadowBlur=6+this.pressure*30;ctx.shadowColor='#d8c77f';ctx.beginPath();ctx.arc(cx,cy,rad,0,TAU);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#81785f';ctx.font='11px monospace';ctx.fillText('DRAG: PRESSURE / SLIDE / POSITION',16,24);
  }
}

const tarot=new TarotCore();
let tarotAttached=false,tarotIdx={},tarotEngine=0;
function curveMap(t,spec){return spec.curve===1?spec.min*Math.pow(spec.max/spec.min,t):spec.min+t*(spec.max-spec.min);}
function inverseCurve(v,spec){return spec.curve===1?Math.log(v/spec.min)/Math.log(spec.max/spec.min):(v-spec.min)/(spec.max-spec.min);}
function buildTarotParams(prefix,groups,exclude){
  const root=document.querySelector(`#${prefix}Params`);root.innerHTML='';
  for(const g of groups){
    const specs=tarot.paramSpecs.filter(s=>s.group===g&&!exclude.has(s.path));
    if(!specs.length)continue;
    const det=document.createElement('details');if(g==='knob')det.open=true;
    const sum=document.createElement('summary');sum.textContent=g.toUpperCase();det.appendChild(sum);
    for(const spec of specs){
      const row=document.createElement('label');row.className='prow';
      const t0=inverseCurve(spec.def,spec);
      row.innerHTML=`${spec.name}<span class="pval">${spec.def.toFixed(2)}</span><input type="range" min="0" max="1" step="0.001" value="${t0}">`;
      const input=row.querySelector('input'),val=row.querySelector('.pval');
      input.oninput=e=>{const v=curveMap(+e.target.value,spec);val.textContent=v.toFixed(2);tarot.setParam(spec.index,v);};
      det.appendChild(row);
    }
    root.appendChild(det);
  }
}
function setPath(path,value){const i=tarotIdx[path];if(i!==undefined)tarot.setParam(i,value);}
function bindSurface(id,path){const el=document.querySelector(id);el.oninput=e=>setPath(path,+e.target.value);}
function setJudgementMacro(kind,t){
  if(kind==='form'){
    setPath('judgement/stretch',.78+t*.57);
    setPath('judgement/basis_width',.40-t*.31);
    setPath('judgement/chroma_gamma',.25+t*2.6);
    setPath('judgement/harm_count',3+Math.round(t*9));
    setPath('judgement/f_high',2200*Math.pow(4.1,t));
  }else if(kind==='glow'){
    setPath('judgement/decay',.18*Math.pow(48,t));
    setPath('judgement/shimmer',.02+.80*Math.pow(t,1.35));
    setPath('judgement/twinkle',.02+.76*t*t);
    setPath('judgement/decay_tilt',-.45+1.25*t);
  }else if(kind==='motion'){
    setPath('judgement/update_hz',.35*Math.pow(170,t));
    setPath('judgement/chaos',.03+.92*t);
    setPath('judgement/mode_migrate',.03+.84*t);
    setPath('judgement/tension',.01+.25*t);
    setPath('judgement/cross_fb',.03+.70*t);
    setPath('judgement/motor',.02+.55*t);
  }else if(kind==='space'){
    setPath('judgement/space',t);
    setPath('judgement/reverb',.02+.88*t);
  }
}
function drawLeds(id,led){
  const el=document.getElementById(id);
  if(el.children.length!==8){el.innerHTML='';for(let i=0;i<8;i++)el.appendChild(document.createElement('i'));}
  for(let i=0;i<8;i++){
    const r=Math.round(clamp(led[i*3])*255),g=Math.round(clamp(led[i*3+1])*255),b=Math.round(clamp(led[i*3+2])*255);
    const c=el.children[i],bright=(led[i*3]+led[i*3+1]+led[i*3+2])/3;
    c.style.background=`rgb(${r},${g},${b})`;
    c.style.boxShadow=bright>0.05?`0 0 ${4+bright*10}px rgba(${r},${g},${b},.9)`:'none';
  }
}
async function ensureTarot(){
  if(tarotAttached||!audio.ctx)return;
  tarotAttached=true;
  await tarot.attach(audio.ctx);
  if(audio.activeView==='strength'||audio.activeView==='judgement')tarot.node.connect(audio.master);
  for(const s of tarot.paramSpecs)tarotIdx[s.path]=s.index;
  buildTarotParams('strength',['knob','fader','force','strength'],new Set(['force/pressure','force/slide_rate','force/mag_x','force/mag_y']));
  buildTarotParams('judgement',['light','judgement'],new Set(['light/red','light/green','light/blue','light/shadow_pos']));
  tarot.setEngine(tarotEngine);
  tarot.onLed=(led,sensor,engine)=>drawLeds(engine===0?'strengthLeds':'judgementLeds',led);
  strengthPad=new TarotPad(document.querySelector('#strengthPad'),(p,s,mx,my)=>{tarot.setParam(tarotIdx['force/pressure'],p);tarot.setParam(tarotIdx['force/slide_rate'],s);tarot.setParam(tarotIdx['force/mag_x'],mx);tarot.setParam(tarotIdx['force/mag_y'],my);});
  judgementPad=new TarotPad(document.querySelector('#judgementPad'),(p,s,mx,my)=>{tarot.setParam(tarotIdx['force/pressure'],p);tarot.setParam(tarotIdx['force/slide_rate'],s);tarot.setParam(tarotIdx['light/shadow_pos'],(my+1)/2);});
  bindSurface('#strengthDensity','knob/density');
  bindSurface('#strengthMatter','knob/matter');
  bindSurface('#strengthDecay','knob/decay');
  bindSurface('#strengthChaos','knob/chaos');
  const applyJ=()=>{setJudgementMacro('form',+$('#judgementForm').value);setJudgementMacro('glow',+$('#judgementGlowMacro').value);setJudgementMacro('motion',+$('#judgementMotion').value);setJudgementMacro('space',+$('#judgementSpace').value);};
  $('#judgementColor').oninput=e=>light.hex=e.target.value;
  $('#judgementForm').oninput=e=>setJudgementMacro('form',+e.target.value);
  $('#judgementGlowMacro').oninput=e=>setJudgementMacro('glow',+e.target.value);
  $('#judgementMotion').oninput=e=>setJudgementMacro('motion',+e.target.value);
  $('#judgementSpace').oninput=e=>setJudgementMacro('space',+e.target.value);
  $('#judgementLightMode').onchange=e=>light.mode=e.target.value;
  $('#judgementMemory').oninput=e=>light.memory=+e.target.value;
  $('#judgementResetLight').onclick=()=>light.reset();
  $('#judgementFreeze').onclick=()=>{const on=$('#judgementFreeze').dataset.on!=='1';$('#judgementFreeze').dataset.on=on?'1':'0';$('#judgementFreeze').textContent=on?'UNFREEZE':'FREEZE';setPath('judgement/freeze',on?1:0);};
  applyJ();
}
let strengthPad=null,judgementPad=null;

const star=new StarLab(document.querySelector('#starCanvas'));
const wheel=new WheelLab(document.querySelector('#wheelCanvas'));
const light=new LightInterpreter();

for(const b of document.querySelectorAll('.tab'))b.onclick=async()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===b.dataset.view));
  const view=b.dataset.view;
  audio.activeView=view;
  const tarotActive=view==='strength'||view==='judgement';
  if(tarotActive){
    tarotEngine=view==='strength'?TarotCore.ENGINE_STRENGTH:TarotCore.ENGINE_JUDGEMENT;
    if(audio.ctx){await ensureTarot();tarot.setEngine(tarotEngine);}
  }
  if(tarotAttached&&tarot.node){tarot.node.disconnect();if(tarotActive)tarot.node.connect(audio.master);}
};
const $=s=>document.querySelector(s);
$('#audioButton').onclick=async()=>{await audio.start();wheel.ensureAudio();await ensureTarot();$('#audioButton').textContent='AUDIO ON';$('#recordButton').disabled=false;};
$('#recordButton').onclick=()=>{if(audio.recorder){audio.stopRecord();$('#recordButton').textContent='REC';}else if(audio.beginRecord())$('#recordButton').textContent='STOP';};
$('#starEngine').onchange=e=>star.engine=e.target.value;$('#starDensity').oninput=e=>{star.density=+e.target.value;star.rebuildEdges()};$('#starMotion').oninput=e=>star.motion=+e.target.value;$('#starTone').oninput=e=>star.tone=+e.target.value;$('#starFreeze').onclick=()=>{star.freeze=!star.freeze;$('#starFreeze').textContent=star.freeze?'UNFREEZE':'FREEZE'};$('#starSeed').onclick=()=>star.seed();
$('#wheelEngine').onchange=e=>wheel.engine=e.target.value;$('#wheelFriction').oninput=e=>wheel.friction=+e.target.value;$('#wheelSpread').oninput=e=>wheel.spread=+e.target.value;$('#wheelDrive').oninput=e=>wheel.drive=+e.target.value;$('#wheelImpulse').onclick=()=>{wheel.omega+=rand(-1,1)>0?rand(10,24):rand(-24,-10)};
setInterval(()=>{
  $('#starInfo').textContent=`edges ${star.edges.length}\nengine ${star.engine}\nvisible nodes 12\ninternal phases 3`;
  $('#wheelInfo').textContent=`angle ${mod(wheel.angle,TAU).toFixed(2)}\nvelocity ${wheel.omega.toFixed(2)} rad/s\nvirtual wheels ${wheel.teeth.length}\nteeth ${wheel.teeth.join(' ')}`;
},160);
