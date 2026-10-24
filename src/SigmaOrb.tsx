import orbReference from './assets/sigma-orb-reference.webp';
import './sigma-orb.css';

/**
 * The approved user-supplied orb is the actual visual layer, not a CSS
 * approximation. Animated neural impulses and glints are overlaid on it.
 * No Saturn-style equatorial ring is drawn.
 */
const stars=[
 [192,184],[238,167],[284,187],[310,229],[286,281],
 [241,309],[193,284],[168,239],[219,220],[269,241],
 [225,272],[257,196],[202,248],[272,272]
] as const;
const links=[
 [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],
 [0,8],[1,11],[2,11],[3,9],[4,13],[5,10],[6,12],[7,12],
 [8,9],[8,10],[8,11],[9,11],[9,13],[10,12],[10,13],[12,13]
] as const;
const signalLinks=[0,2,5,9,12,16,19,22] as const;
function pathFor(a:number,b:number){
 const p=stars[a],q=stars[b];
 const mx=(p[0]+q[0])/2, my=(p[1]+q[1])/2;
 return `M ${p[0]} ${p[1]} Q ${mx+(mx-240)*.1} ${my+(my-249)*.1} ${q[0]} ${q[1]}`;
}

export function SigmaOrb(){
 return <div className="sigma-orb-reference" role="img" aria-label="Orbe holográfico azul do SIGMA, fiel à imagem de referência, com conexões e pontos de luz animados">
  <img className="sigma-orb-reference-image" src={orbReference} alt="" draggable={false}/>
  <svg className="sigma-orb-reference-overlay" viewBox="0 0 480 480" aria-hidden="true" focusable="false">
   <defs>
    <clipPath id="sigma-orb-reference-core"><circle cx="240" cy="249" r="126"/></clipPath>
    <radialGradient id="sigma-orb-reference-glint">
     <stop stopColor="#e9ffff" stopOpacity=".95"/>
     <stop offset=".2" stopColor="#5adfff" stopOpacity=".65"/>
     <stop offset="1" stopColor="#008cff" stopOpacity="0"/>
    </radialGradient>
    <filter id="sigma-orb-reference-glow" x="-150%" y="-150%" width="400%" height="400%">
     <feGaussianBlur stdDeviation="2.5" result="b"/>
     <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
   </defs>

   {/* Slow motion on the existing outer HUD tracks — no equatorial belt. */}
   <g className="sigma-orb-reference-arc" fill="none" strokeLinecap="round">
    <circle cx="240" cy="249" r="196" stroke="#3cc3ff" strokeOpacity=".26" strokeWidth="1.3" strokeDasharray="3 85 17 190 9 205"/>
    <circle cx="240" cy="249" r="171" stroke="#77dfff" strokeOpacity=".22" strokeWidth=".8" strokeDasharray="2 42 13 96"/>
   </g>

   {/* Live neuronal lines in the exact sphere from the reference. */}
   <g clipPath="url(#sigma-orb-reference-core)">
    <g className="sigma-orb-reference-neural">
     <g fill="none" stroke="#38baff" strokeWidth=".9" strokeOpacity=".48" strokeDasharray="3 8">
      {links.map(([a,b],i)=><path key={i} d={pathFor(a,b)} className={i%2?'sigma-orb-reference-flow-b':'sigma-orb-reference-flow-a'}/>)}
     </g>
     {stars.map(([x,y],i)=><g key={i}>
      <circle cx={x} cy={y} r={i%4===0?4:2.5} fill="#188fff" opacity=".22"/>
      <circle cx={x} cy={y} r={i%4===0?1.7:1.1} fill="#a4f4ff" opacity=".75"/>
     </g>)}
     <g className="sigma-orb-reference-signals" filter="url(#sigma-orb-reference-glow)">
      {signalLinks.map((index,i)=>{
       const [a,b]=links[index];
       return <circle key={index} r={i%3===0?3.3:2.2} fill="#c9faff">
        <animateMotion path={pathFor(a,b)} dur={`${2.6+i*.38}s`} begin={`-${i*.67}s`} repeatCount="indefinite"/>
       </circle>;
      })}
     </g>
    </g>
    <circle className="sigma-orb-reference-heartbeat" cx="240" cy="249" r="93" fill="url(#sigma-orb-reference-glint)" opacity=".05"/>
   </g>

   {/* Small travelling rim highlight, never a Saturn ring. */}
   <g className="sigma-orb-reference-rim" fill="none">
    <circle cx="240" cy="249" r="132" stroke="#7ceaff" strokeOpacity=".56" strokeWidth="2.4" strokeDasharray="4 820" strokeLinecap="round" filter="url(#sigma-orb-reference-glow)"/>
    <circle cx="240" cy="249" r="134" stroke="#35c9ff" strokeOpacity=".18" strokeWidth="1.1" strokeDasharray="30 810"/>
   </g>
  </svg>
 </div>;
}
