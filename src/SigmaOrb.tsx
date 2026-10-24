import './sigma-orb.css';

/**
 * Orbital core — vector hologram rendered locally, no external image,
 * no third-party animation library and no text in the nucleus.
 * SVG geometry is intentionally static for smooth iPhone rendering.
 */
const ticks=Array.from({length:72},(_,i)=>i);
const nodes=[
 [196,140],[244,126],[291,149],[325,192],[333,241],[307,288],
 [260,321],[210,311],[165,273],[151,226],[168,176],
 [224,185],[271,194],[287,240],[257,278],[209,269],[196,226],[240,236]
];
const meshEdges=[
 [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,9],[9,10],[10,0],
 [0,10],[0,11],[0,1],[1,12],[2,12],[2,3],[3,13],[4,13],[4,5],[5,14],
 [6,14],[6,7],[7,15],[8,15],[9,16],[10,16],[10,11],
 [11,12],[12,13],[13,14],[14,15],[15,16],[16,11],
 [11,17],[12,17],[13,17],[14,17],[15,17],[16,17]
];
const radialLines=Array.from({length:24},(_,i)=>i*15);

export function SigmaOrb(){
 return <div className="sigma-orb-v2" role="img" aria-label="Orbe holográfico azul do SIGMA com camadas tecnológicas e núcleo luminoso">
  <div className="sigma-orb-v2-halo"/>
  <svg className="sigma-orb-v2-svg" viewBox="0 0 480 480" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
   <defs>
    <radialGradient id="sigma-v2-halo"><stop offset="0" stopColor="#1daaff" stopOpacity=".35"/><stop offset=".44" stopColor="#006bfc" stopOpacity=".18"/><stop offset="1" stopColor="#00132c" stopOpacity="0"/></radialGradient>
    <radialGradient id="sigma-v2-shell" cx="33%" cy="24%" r="82%">
     <stop offset="0" stopColor="#9ff5ff"/><stop offset=".08" stopColor="#1cbbff"/><stop offset=".25" stopColor="#063c87"/><stop offset=".52" stopColor="#010d30"/>
     <stop offset=".74" stopColor="#053f9b"/><stop offset=".9" stopColor="#007ed6"/><stop offset="1" stopColor="#b8faff"/>
    </radialGradient>
    <radialGradient id="sigma-v2-depth" cx="48%" cy="45%" r="58%">
     <stop offset="0" stopColor="#02172f" stopOpacity=".2"/><stop offset=".58" stopColor="#001027" stopOpacity=".25"/>
     <stop offset=".92" stopColor="#00142f" stopOpacity=".85"/><stop offset="1" stopColor="#51dcff" stopOpacity=".25"/>
    </radialGradient>
    <linearGradient id="sigma-v2-metal" x1="0" y1="0" x2="1" y2="1">
     <stop stopColor="#c9fbff"/><stop offset=".16" stopColor="#0076e8"/><stop offset=".43" stopColor="#021e53"/><stop offset=".66" stopColor="#34b8ff"/><stop offset="1" stopColor="#00152f"/>
    </linearGradient>
    <linearGradient id="sigma-v2-arc" x1="0" y1="0" x2="1" y2="1">
     <stop stopColor="#13aaff" stopOpacity=".1"/><stop offset=".35" stopColor="#aaf9ff"/><stop offset=".6" stopColor="#0583ff"/><stop offset="1" stopColor="#1cafff" stopOpacity=".2"/>
    </linearGradient>
    <radialGradient id="sigma-v2-glint"><stop stopColor="#efffff" stopOpacity=".95"/><stop offset=".35" stopColor="#48caff" stopOpacity=".65"/><stop offset="1" stopColor="#008bff" stopOpacity="0"/></radialGradient>
    <filter id="sigma-v2-glow" x="-80%" y="-80%" width="260%" height="260%">
     <feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="sigma-v2-sphere-clip"><circle cx="240" cy="226" r="111"/></clipPath>
   </defs>

   {/* Distant light field and angular technical marks */}
   <circle cx="240" cy="226" r="207" fill="url(#sigma-v2-halo)"/>
   <g className="sigma-orb-v2-slow">
    <circle cx="240" cy="226" r="201" stroke="#177bcd" strokeOpacity=".38" strokeWidth="1" strokeDasharray="1 12" fill="none"/>
    <circle cx="240" cy="226" r="184" stroke="#2cbdff" strokeOpacity=".4" strokeWidth=".8" strokeDasharray="48 16 3 19" fill="none"/>
    {ticks.map(i=><line key={i} x1="240" y1="30" x2="240" y2={i%6===0?42:i%3===0?37:34} stroke={i%6===0?'#8beeff':'#2f9be3'} strokeWidth={i%6===0?2:1} strokeOpacity={i%3===0?.85:.35} transform={`rotate(${i*5} 240 226)`}/>)}
    <path d="M 240 34 A 192 192 0 0 1 420 160 M 414 313 A 192 192 0 0 1 282 414 M 132 384 A 192 192 0 0 1 54 210" stroke="#67d7ff" strokeWidth="2" fill="none" filter="url(#sigma-v2-glow)"/>
   </g>
   <g className="sigma-orb-v2-reverse">
    <circle cx="240" cy="226" r="168" fill="none" stroke="#0c8fff" strokeOpacity=".58" strokeWidth="1.2" strokeDasharray="4 9"/>
    <path d="M 92 143 A 170 170 0 0 1 376 121 M 387 315 A 170 170 0 0 1 110 339" stroke="#3fc7ff" strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#sigma-v2-glow)"/>
    <path d="M 240 65 L 240 84 M 400 226 L 382 226 M 240 387 L 240 369 M 80 226 L 98 226" stroke="#b5faff" strokeWidth="2.5" filter="url(#sigma-v2-glow)"/>
   </g>
   {/* Three-dimensional inclined orbit bands behind the nucleus */}
   <g transform="rotate(-27 240 226)">
    <ellipse cx="240" cy="226" rx="161" ry="64" stroke="#0e86e9" strokeOpacity=".4" strokeWidth="11" fill="none"/>
    <ellipse cx="240" cy="226" rx="163" ry="66" stroke="#8cecff" strokeOpacity=".5" strokeWidth="1.4" fill="none" strokeDasharray="115 26 14 25"/>
   </g>
   <g transform="rotate(37 240 226)">
    <ellipse cx="240" cy="226" rx="151" ry="89" stroke="#1586e4" strokeOpacity=".35" strokeWidth="5" fill="none"/>
    <ellipse cx="240" cy="226" rx="151" ry="89" stroke="#5cd5ff" strokeOpacity=".55" strokeWidth="1" fill="none" strokeDasharray="3 12"/>
   </g>

   {/* Faceted spherical reactor shell */}
   <circle cx="240" cy="226" r="119" fill="none" stroke="#33aaff" strokeOpacity=".25" strokeWidth="16"/>
   <circle cx="240" cy="226" r="113" fill="url(#sigma-v2-metal)" stroke="#7eeaff" strokeOpacity=".72" strokeWidth="2" filter="url(#sigma-v2-glow)"/>
   <circle cx="240" cy="226" r="109" fill="url(#sigma-v2-shell)"/>
   <circle cx="240" cy="226" r="109" fill="url(#sigma-v2-depth)"/>
   <g clipPath="url(#sigma-v2-sphere-clip)">
    <g opacity=".38" stroke="#57caff" strokeWidth=".7" fill="none">
     <ellipse cx="240" cy="226" rx="112" ry="31"/>
     <ellipse cx="240" cy="226" rx="112" ry="74"/>
     <ellipse cx="240" cy="226" rx="31" ry="112"/>
     <ellipse cx="240" cy="226" rx="75" ry="112"/>
     <path d="M 128 226 H 352 M 240 114 V 338"/>
    </g>
    <g stroke="#38c8ff" strokeOpacity=".52" strokeWidth="1.2" fill="none">
     {meshEdges.map(([a,b],i)=><line key={i} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]}/>)}
    </g>
    <g fill="#91ecff" opacity=".65">
     {nodes.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===17?3.8:1.8}/>)}
    </g>
    <path d="M 170 154 L 224 185 L 196 226 L 151 226 Z M 271 194 L 325 192 L 333 241 L 287 240 Z M 209 269 L 257 278 L 260 321 L 210 311 Z" fill="#13aaff" fillOpacity=".12" stroke="#58cfff" strokeOpacity=".25"/>
    <ellipse cx="196" cy="150" rx="51" ry="32" fill="url(#sigma-v2-glint)" opacity=".9"/>
    <circle cx="240" cy="226" r="69" fill="none" stroke="#2ac7ff" strokeOpacity=".28" strokeWidth="1.5" strokeDasharray="11 8"/>
    <circle cx="240" cy="226" r="50" fill="#001328" fillOpacity=".62" stroke="#29aaff" strokeOpacity=".5" strokeWidth="1.8"/>
    <circle cx="240" cy="226" r="35" fill="url(#sigma-v2-shell)" stroke="#91f2ff" strokeOpacity=".75" strokeWidth="2" filter="url(#sigma-v2-glow)"/>
    <circle cx="240" cy="226" r="19" fill="#031c44" stroke="#3acaff" strokeWidth="2"/>
    <circle cx="240" cy="226" r="8" fill="#c5fbff" filter="url(#sigma-v2-glow)"/>
    <g opacity=".5" stroke="#a5f5ff" strokeWidth=".8">
     {radialLines.map(deg=><path key={deg} d="M 240 174 V 186" transform={`rotate(${deg} 240 226)`}/>)}
    </g>
   </g>
   {/* Foreground armor segments and orbit crossing in front */}
   <circle cx="240" cy="226" r="113" stroke="url(#sigma-v2-arc)" strokeWidth="7" strokeDasharray="55 22 12 30 68 17" fill="none" className="sigma-orb-v2-slow"/>
   <circle cx="240" cy="226" r="125" stroke="#68dbff" strokeOpacity=".55" strokeWidth="1.1" strokeDasharray="82 11 6 19" fill="none"/>
   <g transform="rotate(-27 240 226)">
    <path d="M 77 226 A 163 66 0 0 0 403 226" fill="none" stroke="#0057b5" strokeOpacity=".75" strokeWidth="10"/>
    <path d="M 77 226 A 163 66 0 0 0 403 226" fill="none" stroke="#55d5ff" strokeOpacity=".9" strokeWidth="1.6" strokeDasharray="68 19 110 30" filter="url(#sigma-v2-glow)"/>
   </g>
   {/* Floating reactor pedestal and upward energy column */}
   <path d="M 240 336 L 240 401" stroke="#0d88ff" strokeOpacity=".45" strokeWidth="16" filter="url(#sigma-v2-glow)"/>
   <path d="M 240 337 L 240 400" stroke="#a2f5ff" strokeOpacity=".7" strokeWidth="1.5"/>
   <ellipse cx="240" cy="411" rx="122" ry="21" fill="#007bff" fillOpacity=".05" stroke="#2bbaff" strokeOpacity=".38" strokeWidth="2"/>
   <ellipse cx="240" cy="411" rx="91" ry="12" fill="none" stroke="#5cdaff" strokeOpacity=".78" strokeWidth="1.6" filter="url(#sigma-v2-glow)"/>
   <ellipse cx="240" cy="411" rx="64" ry="6" fill="#2d9eff" fillOpacity=".14" stroke="#6aeaff" strokeOpacity=".5" strokeWidth="1"/>
   <path d="M 104 405 L 120 405 M 360 405 L 376 405 M 240 430 V 441" stroke="#65d9ff" strokeOpacity=".8" strokeWidth="1.5"/>
  </svg>
 </div>;
}
