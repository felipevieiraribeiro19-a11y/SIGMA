import './sigma-orb.css';

/** Cinematic, restrained holographic energy sphere inspired by the approved mockup.
 * No lettering, mechanical crossbars or target-like center. */
const stars=[
 [190,162,2.5],[239,129,2],[293,164,2.5],[331,204,2.8],[305,267,2.5],
 [253,299,2],[191,285,2.5],[153,239,2],[155,187,2],[221,220,2.3],
 [279,218,2.8],[248,255,1.8],[201,254,1.7],[267,180,1.7],[177,208,1.6]
] as const;
const links=[
 [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,0],
 [0,9],[1,13],[2,13],[3,10],[4,11],[5,11],[6,12],[7,12],[8,9],
 [9,10],[9,12],[9,13],[10,11],[11,12],[12,13]
] as const;
const ticks=Array.from({length:72},(_,i)=>i);
// Small light impulses travel across the same curves used by the neural mesh.
const signalLinks=[0,3,7,12,18,22] as const;
function neuralPath(a:number,b:number){
 const start=stars[a],end=stars[b];
 return `M ${start[0]} ${start[1]} Q ${240+(start[0]+end[0]-480)*.48} ${222+(start[1]+end[1]-444)*.48} ${end[0]} ${end[1]}`;
}
const dust=Array.from({length:85},(_,i)=>{
 const a=i*2.39996323, radius=127+(i*41%84);
 return {x:240+Math.cos(a)*radius,y:224+Math.sin(a)*radius,r:i%7===0?1.3:.45};
});
function Star({x,y,r}:{x:number;y:number;r:number}){
 return <g><circle cx={x} cy={y} r={r*3.2} fill="#17a9ff" opacity=".13"/>
  <circle cx={x} cy={y} r={r} fill="#9af1ff" filter="url(#orb-v3-glow)"/>
  {r>2.2&&<path d={`M ${x-8} ${y} H ${x+8} M ${x} ${y-8} V ${y+8}`} stroke="#9cefff" strokeOpacity=".8" strokeWidth=".6"/>}
 </g>;
}
export function SigmaOrb(){
 return <div className="sigma-orb-v3" role="img" aria-label="Núcleo de energia azul holográfico animado, com conexões luminosas em movimento">
 <svg viewBox="0 0 480 480" className="sigma-orb-v3-svg" aria-hidden="true" focusable="false">
  <defs>
   <radialGradient id="orb-v3-atmosphere">
    <stop stopColor="#167de5" stopOpacity=".21"/>
    <stop offset=".52" stopColor="#0359c5" stopOpacity=".13"/>
    <stop offset=".83" stopColor="#0085ff" stopOpacity=".03"/>
    <stop offset="1" stopColor="#000c1b" stopOpacity="0"/>
   </radialGradient>
   <radialGradient id="orb-v3-sphere" cx="35%" cy="25%" r="85%">
    <stop stopColor="#0a3e83"/><stop offset=".15" stopColor="#031c48"/>
    <stop offset=".48" stopColor="#010b21"/><stop offset=".78" stopColor="#03112b"/>
    <stop offset=".92" stopColor="#064ba4"/><stop offset="1" stopColor="#20a7ff"/>
   </radialGradient>
   <radialGradient id="orb-v3-illumination" cx="32%" cy="17%" r="75%">
    <stop stopColor="#d8fcff" stopOpacity=".64"/>
    <stop offset=".12" stopColor="#20b9ff" stopOpacity=".35"/>
    <stop offset=".36" stopColor="#003a95" stopOpacity=".08"/>
    <stop offset=".8" stopColor="#00152c" stopOpacity="0"/>
   </radialGradient>
   <linearGradient id="orb-v3-corona" x1="0" y1="0" x2="1" y2="1">
    <stop stopColor="#006eff"/><stop offset=".18" stopColor="#f0ffff"/>
    <stop offset=".33" stopColor="#2bbfff"/><stop offset=".57" stopColor="#0267f7"/>
    <stop offset=".78" stopColor="#bafaff"/><stop offset="1" stopColor="#0096ff"/>
   </linearGradient>
   <linearGradient id="orb-v3-flares" x1="0" y1="0" x2="0" y2="1">
    <stop stopColor="#eaffff"/><stop offset=".22" stopColor="#28d4ff"/><stop offset="1" stopColor="#006bff" stopOpacity="0"/>
   </linearGradient>
   <radialGradient id="orb-v3-glint">
    <stop stopColor="#f5ffff"/><stop offset=".13" stopColor="#c5faff"/>
    <stop offset=".35" stopColor="#4ecfff" stopOpacity=".9"/>
    <stop offset="1" stopColor="#0090ff" stopOpacity="0"/>
   </radialGradient>
   <filter id="orb-v3-glow" x="-150%" y="-150%" width="400%" height="400%">
    <feGaussianBlur stdDeviation="2.3" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
   </filter>
   <filter id="orb-v3-soft" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur stdDeviation="7"/></filter>
   <clipPath id="orb-v3-clip"><circle cx="240" cy="222" r="117"/></clipPath>
  </defs>

  {/* Sparse ambient star field and large translucent technological arcs */}
  <circle cx="240" cy="224" r="228" fill="url(#orb-v3-atmosphere)"/>
  <g opacity=".85">{dust.map((d,i)=><circle key={i} cx={d.x} cy={d.y} r={d.r} fill={i%5===0?'#9ff3ff':'#167ac9'} opacity={i%4===0?.75:.33}/>)}</g>
  <g className="sigma-orb-v3-turn" fill="none" strokeLinecap="round">
   <circle cx="240" cy="222" r="181" stroke="#1461a9" strokeOpacity=".37" strokeWidth=".8" strokeDasharray="1 8"/>
   <circle cx="240" cy="222" r="171" stroke="#269be6" strokeOpacity=".25" strokeWidth="1" strokeDasharray="37 9 3 15"/>
   <path d="M 94 123 A 175 175 0 0 1 322 66" stroke="#58cbff" strokeWidth="1.3" strokeOpacity=".76"/>
   <path d="M 387 132 A 175 175 0 0 1 390 306" stroke="#32baff" strokeWidth="2.1" strokeOpacity=".7"/>
   <path d="M 326 379 A 175 175 0 0 1 109 345" stroke="#8beaff" strokeWidth="1.6" strokeOpacity=".7"/>
   {ticks.map(i=><path key={i} d={i%6===0?'M 240 38 V 48':'M 240 40 V 44'} stroke={i%6===0?'#69cfff':'#2481ce'} strokeOpacity={i%6===0?.75:.28} strokeWidth={i%6===0?1.4:.8} transform={`rotate(${i*5} 240 222)`}/>)}
  </g>
  <g className="sigma-orb-v3-counter" fill="none" strokeLinecap="round">
   <circle cx="240" cy="222" r="152" stroke="#2e91e0" strokeOpacity=".24" strokeWidth="1.1" strokeDasharray="3 12"/>
   <path d="M 105 151 A 153 153 0 0 1 226 69" stroke="#4ac7ff" strokeOpacity=".68" strokeWidth="3"/>
   <path d="M 349 115 A 153 153 0 0 1 389 256" stroke="#51d4ff" strokeOpacity=".66" strokeWidth="2.2"/>
   <path d="M 340 337 A 153 153 0 0 1 222 374" stroke="#47b7ff" strokeOpacity=".72" strokeWidth="2.5"/>
  </g>

  {/* Shadowed spherical volume; no flat concentric mechanical bullseye */}
  <circle cx="240" cy="222" r="129" fill="#007bff" opacity=".2" filter="url(#orb-v3-soft)"/>
  <circle cx="240" cy="222" r="119" fill="#0a76db" opacity=".25"/>
  <circle cx="240" cy="222" r="117" fill="url(#orb-v3-sphere)"/>
  <circle cx="240" cy="222" r="117" fill="url(#orb-v3-illumination)"/>
  <g clipPath="url(#orb-v3-clip)">
   {/* Glass reflections and restrained curved longitude/latitude contours */}
   <g fill="none" stroke="#249cf7" strokeOpacity=".25" strokeWidth="1">
    <ellipse cx="240" cy="222" rx="112" ry="41" transform="rotate(-19 240 222)"/>
    <ellipse cx="240" cy="222" rx="54" ry="116" transform="rotate(29 240 222)"/>
    <ellipse cx="240" cy="222" rx="83" ry="116" transform="rotate(-23 240 222)"/>
    <path d="M 126 203 Q 233 253 352 202 M 132 274 Q 233 228 343 271"/>
   </g>
   {/* The entire neural layer drifts, while impulses travel along its connections. */}
   <g className="sigma-orb-v3-network">
    <g className="sigma-orb-v3-filaments" fill="none" stroke="#168ff0" strokeOpacity=".62" strokeWidth="1.1" strokeDasharray="3 7">
     {links.map(([a,b],i)=><path key={i} d={neuralPath(a,b)} className={i%2===0?'sigma-orb-v3-filament-a':'sigma-orb-v3-filament-b'}/>)}
    </g>
    {stars.map(([x,y,r],i)=><Star key={i} x={x} y={y} r={r}/>)}
    <g className="sigma-orb-v3-signals" filter="url(#orb-v3-glow)">
     {signalLinks.map((linkIndex,i)=>{
      const [a,b]=links[linkIndex];
      return <circle key={linkIndex} r={i%3===0?2.8:2.1} fill="#d7ffff">
       <animateMotion path={neuralPath(a,b)} dur={`${2.2+i*.47}s`} begin={`-${i*.71}s`} repeatCount="indefinite"/>
      </circle>;
     })}
    </g>
   </g>
   <path d="M 134 165 C 165 122 185 117 230 113 C 178 148 157 192 152 247" fill="#64e3ff" fillOpacity=".13"/>
   <path d="M 314 127 C 358 166 354 242 318 288 C 329 229 322 169 314 127" fill="#006aff" fillOpacity=".11"/>
   <path d="M 166 286 C 207 324 264 329 314 289" stroke="#2d9fff" strokeWidth="2" strokeOpacity=".32" fill="none"/>
   <circle cx="184" cy="152" r="39" fill="url(#orb-v3-glint)" opacity=".82"/>
   <circle cx="313" cy="282" r="24" fill="url(#orb-v3-glint)" opacity=".65"/>
   <path d="M 170 147 Q 211 111 272 112" fill="none" stroke="#c0f8ff" strokeOpacity=".7" strokeWidth="2" filter="url(#orb-v3-glow)"/>
  </g>

  {/* Intense glass rim: dominant element from approved design */}
  <circle cx="240" cy="222" r="119" fill="none" stroke="#0078ff" strokeWidth="18" strokeOpacity=".4" filter="url(#orb-v3-soft)"/>
  <circle cx="240" cy="222" r="120" fill="none" stroke="#006ee8" strokeWidth="8" strokeOpacity=".85"/>
  <circle cx="240" cy="222" r="121" fill="none" stroke="url(#orb-v3-corona)" strokeWidth="4.5" filter="url(#orb-v3-glow)"/>
  <circle cx="240" cy="222" r="115" fill="none" stroke="#84ecff" strokeWidth="1.1" strokeOpacity=".65"/>
  <path d="M 143 153 A 119 119 0 0 1 254 104" fill="none" stroke="#d5ffff" strokeWidth="6" strokeLinecap="round" opacity=".95" filter="url(#orb-v3-glow)"/>
  <path d="M 341 163 A 119 119 0 0 1 337 290" fill="none" stroke="#35c5ff" strokeWidth="5" strokeLinecap="round" opacity=".8" filter="url(#orb-v3-glow)"/>
  <path d="M 152 305 A 119 119 0 0 0 290 330" fill="none" stroke="#70e3ff" strokeWidth="4" strokeLinecap="round" opacity=".9" filter="url(#orb-v3-glow)"/>

  {/* Starbursts on the refractive edge */}
  <g filter="url(#orb-v3-glow)">
   <circle cx="240" cy="102" r="3" fill="#f2ffff"/>
   <path d="M 240 85 V 120 M 222 102 H 258" stroke="#b8f8ff" strokeWidth=".9" opacity=".8"/>
   <circle cx="239" cy="342" r="3.5" fill="#e8ffff"/>
   <path d="M 239 324 V 364 M 220 342 H 259" stroke="#8beeff" strokeWidth="1.1" opacity=".8"/>
  </g>

  {/* Thin energy tether and minimal holographic emitter */}
  <g className="sigma-orb-v3-pedestal">
   <path d="M 239 346 V 405" stroke="#007fff" strokeWidth="10" strokeOpacity=".24" filter="url(#orb-v3-soft)"/>
   <path d="M 239 346 V 406" stroke="url(#orb-v3-flares)" strokeWidth="1.7" opacity=".85"/>
   <ellipse cx="240" cy="414" rx="122" ry="20" fill="none" stroke="#198fe8" strokeOpacity=".34" strokeWidth="1.2"/>
   <ellipse cx="240" cy="414" rx="93" ry="12" fill="none" stroke="#2ebaff" strokeOpacity=".55" strokeWidth="1.2"/>
   <ellipse cx="240" cy="414" rx="60" ry="7" fill="none" stroke="#a4f4ff" strokeOpacity=".9" strokeWidth="1.4" filter="url(#orb-v3-glow)"/>
   <circle cx="240" cy="414" r="7" fill="url(#orb-v3-glint)"/>
  </g>
 </svg>
 </div>;
}
