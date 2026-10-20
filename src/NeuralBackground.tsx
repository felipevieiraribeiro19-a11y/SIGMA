import {useEffect,useRef} from 'react';
// Decorative only: no information or connection state is encoded here.
export function NeuralBackground(){
 const ref=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const canvas=ref.current!,ctx=canvas.getContext('2d');if(!ctx)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let w=0,h=0,frame=0,last=0,time=0;
  let nodes:{x:number;y:number;r:number}[]=[],edges:{a:number;b:number;phase:number;speed:number}[]=[];
  let seed=127;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646};
  function resize(){w=innerWidth;h=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx!.setTransform(dpr,0,0,dpr,0,0);seed=127;nodes=[];edges=[];
   const cols=Math.max(4,Math.ceil(w/180)),rows=Math.max(4,Math.ceil(h/155));
   for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++)nodes.push({x:(x+(random()-.5)*.8)*w/cols,y:(y+(random()-.5)*.8)*h/rows,r:1+random()*1.5});
   for(let i=0;i<nodes.length;i++){const near=nodes.map((n,j)=>({j,d:Math.hypot(n.x-nodes[i].x,n.y-nodes[i].y)})).filter(n=>n.j>i&&n.d<230).sort((a,b)=>a.d-b.d).slice(0,3);near.forEach(n=>edges.push({a:i,b:n.j,phase:random(),speed:.025+random()*.025}))}
   draw();
  }
  function draw(){ctx!.clearRect(0,0,w,h);ctx!.lineWidth=.7;
   for(const e of edges){const a=nodes[e.a],b=nodes[e.b];const mx=(a.x+b.x)/2+Math.sin(e.a)*16,my=(a.y+b.y)/2+Math.cos(e.b)*16;
    ctx!.beginPath();ctx!.moveTo(a.x,a.y);ctx!.quadraticCurveTo(mx,my,b.x,b.y);ctx!.strokeStyle='rgba(82,179,231,.18)';ctx!.stroke();
    // Small branches make the network feel organic, rather than a geometric grid.
    ctx!.beginPath();ctx!.moveTo(a.x,a.y);ctx!.lineTo(a.x+(b.x-a.x)*.2+12,a.y+(b.y-a.y)*.2-14);ctx!.strokeStyle='rgba(99,195,242,.09)';ctx!.stroke();
    if(e.a%3===0){const t=(time*e.speed+e.phase)%1;const x=(1-t)*(1-t)*a.x+2*(1-t)*t*mx+t*t*b.x,y=(1-t)*(1-t)*a.y+2*(1-t)*t*my+t*t*b.y;const glow=ctx!.createRadialGradient(x,y,0,x,y,9);glow.addColorStop(0,'rgba(173,234,255,.7)');glow.addColorStop(.2,'rgba(102,206,255,.3)');glow.addColorStop(1,'rgba(93,196,255,0)');ctx!.fillStyle=glow;ctx!.fillRect(x-9,y-9,18,18)}
   }
   for(const n of nodes){ctx!.beginPath();ctx!.arc(n.x,n.y,n.r,0,Math.PI*2);ctx!.fillStyle='rgba(127,211,252,.42)';ctx!.fill()}
  }
  function tick(now:number){if(document.hidden||media.matches){frame=0;return}if(now-last>=33){time+=Math.min((now-last)/1000,.05);last=now;draw()}frame=requestAnimationFrame(tick)}
  function resume(){cancelAnimationFrame(frame);frame=0;last=performance.now();if(!document.hidden&&!media.matches)frame=requestAnimationFrame(tick);else draw()}
  resize();resume();window.addEventListener('resize',resize);document.addEventListener('visibilitychange',resume);media.addEventListener('change',resume);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',resume);media.removeEventListener('change',resume)};
 },[]);
 return <canvas ref={ref} className="neural-background" aria-hidden="true"/>;
}
