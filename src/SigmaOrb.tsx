import './sigma-orb.css';

/**
 * SIGMA's holographic orb is rendered entirely from native SVG primitives.
 * No bitmap, image overlay, canvas screenshot or Saturn-like equatorial belt.
 * Every energy filament, reflection, HUD ring and moving impulse is vector.
 */
const C=240;
const outerArcs=[
 {r:207, dash:'108 18 4 36 62 27 3 84',opacity:.28,width:1.1},
 {r:198, dash:'2 20 84 26 3 60 44 33',opacity:.31,width:1},
 {r:188, dash:'34 8 3 25 74 38 3 62',opacity:.23,width:1.5},
 {r:178, dash:'3 12 58 24 3 50 15 44',opacity:.33,width:.9},
 {r:167, dash:'70 19 3 51 42 20 4 60',opacity:.17,width:.9},
] as const;
const spokes=Array.from({length:44},(_,i)=>({
 angle:i*360/44,
 inner:i%5===0?167:i%3===0?179:190,
 outer:i%5===0?215:i%3===0?206:198,
 opacity:i%5===0?.5:i%3===0?.32:.15,
}));
const nodes=[
 [158,210],[184,167],[229,155],[277,176],[313,216],[305,267],
 [262,313],[212,302],[170,268],[207,220],[261,222],[235,268],
 [280,277],[197,250],[250,189],[222,189],[286,239]
] as const;
const connections=[
 [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,0],
 [0,9],[1,15],[2,14],[3,14],[4,16],[5,12],[6,12],[7,11],[8,13],
 [9,10],[9,13],[9,15],[10,14],[10,16],[10,11],[11,12],[11,13],
 [14,15],[12,16],[13,15]
] as const;
function neuralPath(a:number,b:number){
 const p=nodes[a],q=nodes[b];
 const midX=(p[0]+q[0])/2,midY=(p[1]+q[1])/2;
 return `M${p[0]} ${p[1]} Q${(midX+(midX-C)*.09).toFixed(1)} ${(midY+(midY-C)*.09).toFixed(1)} ${q[0]} ${q[1]}`;
}
const filaments=[
 'M126 242 C135 179 173 135 232 121 S336 164 356 215',
 'M131 273 C165 323 218 355 277 340 S355 292 362 247',
 'M151 167 C197 195 211 233 231 281 S300 336 341 304',
 'M156 315 C178 265 220 221 264 184 S319 163 337 190',
 'M191 130 C159 174 178 231 215 267 S286 301 315 348',
 'M317 148 C280 174 249 209 230 240 S187 290 154 293',
 'M129 223 C172 206 205 188 240 205 S311 264 359 261',
 'M188 347 C215 302 257 292 288 256 S304 198 324 179',
 'M149 197 C175 229 212 250 251 248 S321 219 343 244',
 'M171 150 C210 176 254 163 289 199 S326 263 313 307'
] as const;
const energyTrails=[
 'M161 274 C180 215 215 178 271 174 S335 202 337 249',
 'M163 203 C184 172 234 148 281 184 S321 264 299 296',
 'M192 310 C215 274 240 260 279 253 S320 228 330 201',
 'M154 237 C197 245 219 281 263 284 S309 268 328 243'
] as const;
const brightPoints=[
 [169,209,2.3],[186,165,1.7],[227,157,1.8],[279,180,1.8],
 [309,217,2.2],[303,267,2],[262,312,1.8],[210,303,1.6],
 [170,268,1.8],[260,224,2.8],[233,268,1.9],[278,276,1.7]
] as const;

export function SigmaOrb(){
 return <div className="sigma-orb-native" role="img" aria-label="Orbe holográfico azul do SIGMA criado nativamente, com filamentos e conexões luminosas em movimento">
  <svg className="sigma-orb-native-svg" viewBox="0 0 480 480" aria-hidden="true" focusable="false">
   <defs>
    <radialGradient id="sigma-native-atmosphere">
     <stop offset="0" stopColor="#0751ba" stopOpacity=".23"/>
     <stop offset=".48" stopColor="#073177" stopOpacity=".18"/>
     <stop offset=".78" stopColor="#020e27" stopOpacity=".4"/>
     <stop offset="1" stopColor="#010713" stopOpacity=".02"/>
    </radialGradient>
    <radialGradient id="sigma-native-glass" cx="42%" cy="32%" r="75%">
     <stop offset="0" stopColor="#1262c7" stopOpacity=".2"/>
     <stop offset=".33" stopColor="#073d98" stopOpacity=".12"/>
     <stop offset=".7" stopColor="#030f2d" stopOpacity=".36"/>
     <stop offset="1" stopColor="#010611" stopOpacity=".83"/>
    </radialGradient>
    <radialGradient id="sigma-native-core" cx="50%" cy="50%" r="50%">
     <stop offset="0" stopColor="#0d9fff" stopOpacity=".2"/>
     <stop offset=".48" stopColor="#0755ff" stopOpacity=".09"/>
     <stop offset="1" stopColor="#0261ff" stopOpacity="0"/>
    </radialGradient>
    <linearGradient id="sigma-native-rim" x1="0" y1="0" x2="1" y2="1">
     <stop offset="0" stopColor="#1567ff"/>
     <stop offset=".19" stopColor="#93faff"/>
     <stop offset=".38" stopColor="#19aaff"/>
     <stop offset=".57" stopColor="#6deaff"/>
     <stop offset=".79" stopColor="#1175ff"/>
     <stop offset="1" stopColor="#b4faff"/>
    </linearGradient>
    <linearGradient id="sigma-native-filament" x1="0" y1="0" x2="1" y2="1">
     <stop offset="0" stopColor="#0545d0" stopOpacity=".12"/>
     <stop offset=".28" stopColor="#2c9bff" stopOpacity=".67"/>
     <stop offset=".57" stopColor="#8ef4ff" stopOpacity=".4"/>
     <stop offset="1" stopColor="#086cff" stopOpacity=".12"/>
    </linearGradient>
    <radialGradient id="sigma-native-flare">
     <stop offset="0" stopColor="#e8ffff" stopOpacity=".95"/>
     <stop offset=".14" stopColor="#82edff" stopOpacity=".7"/>
     <stop offset=".45" stopColor="#009dff" stopOpacity=".22"/>
     <stop offset="1" stopColor="#0577ff" stopOpacity="0"/>
    </radialGradient>
    <filter id="sigma-native-blur" x="-80%" y="-80%" width="260%" height="260%">
     <feGaussianBlur stdDeviation="8"/>
    </filter>
    <filter id="sigma-native-soft" x="-100%" y="-100%" width="300%" height="300%">
     <feGaussianBlur stdDeviation="2.3"/>
    </filter>
    <filter id="sigma-native-point-glow" x="-200%" y="-200%" width="500%" height="500%">
     <feGaussianBlur stdDeviation="2.1" result="halo"/>
     <feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="sigma-native-sphere-clip"><circle cx={C} cy={C} r="121"/></clipPath>
   </defs>

   {/* Native orbital HUD: only circular rings, never a tilted Saturn belt. */}
   <circle cx={C} cy={C} r="207" fill="url(#sigma-native-atmosphere)" opacity=".72"/>
   <g className="sigma-native-hud-a" fill="none" stroke="#279bff">
    {outerArcs.map((a,i)=><circle key={i} cx={C} cy={C} r={a.r} strokeWidth={a.width} strokeOpacity={a.opacity} strokeDasharray={a.dash}/>)}
   </g>
   <g className="sigma-native-hud-b" stroke="#2fafff">
    {spokes.map((s,i)=><line key={i} x1={C} y1={C-s.inner} x2={C} y2={C-s.outer} strokeWidth={i%5===0?1.4:.75} opacity={s.opacity} transform={`rotate(${s.angle} ${C} ${C})`}/>)}
   </g>
   <g className="sigma-native-hud-c" fill="none">
    <circle cx={C} cy={C} r="201" stroke="#1e8ffb" strokeOpacity=".24" strokeWidth="1" strokeDasharray="110 145 3 45"/>
    <circle cx={C} cy={C} r="184" stroke="#5bcbff" strokeOpacity=".15" strokeWidth="1.2" strokeDasharray="48 29 2 108"/>
    <circle cx={C} cy={C} r="162" stroke="#218aff" strokeOpacity=".22" strokeWidth=".75" strokeDasharray="3 14 40 83"/>
   </g>

   {/* Transparent, volumetric glass and a strong but delicate neon edge. */}
   <circle cx={C} cy={C} r="131" fill="none" stroke="#0868ff" strokeWidth="17" opacity=".28" filter="url(#sigma-native-blur)"/>
   <circle cx={C} cy={C} r="126" fill="url(#sigma-native-glass)"/>
   <circle cx={C} cy={C} r="128" fill="none" stroke="#1595ff" strokeWidth="10" opacity=".72" filter="url(#sigma-native-soft)"/>
   <circle cx={C} cy={C} r="127" fill="none" stroke="url(#sigma-native-rim)" strokeWidth="3.4" opacity=".97"/>
   <circle cx={C} cy={C} r="121.5" fill="none" stroke="#54d9ff" strokeWidth=".85" opacity=".45"/>
   <circle cx={C} cy={C} r="135" fill="none" stroke="#177dff" strokeWidth="1" opacity=".24"/>
   <circle cx={C} cy={C} r="116" fill="none" stroke="#0078ff" strokeWidth="1" opacity=".14"/>

   {/* Curved, transparent refractive glass rather than solid mechanical lines. */}
   <g clipPath="url(#sigma-native-sphere-clip)">
    <circle cx={C} cy={C} r="118" fill="url(#sigma-native-core)" className="sigma-native-breathe"/>
    <g className="sigma-native-refraction" fill="none">
     <path d="M130 230 C152 175 196 137 248 139 S336 176 348 215" stroke="#9cffff" strokeWidth="8" opacity=".17" filter="url(#sigma-native-soft)"/>
     <path d="M139 219 C165 170 198 148 239 149 S306 162 333 198" stroke="#b3faff" strokeWidth="2.2" opacity=".52"/>
     <path d="M132 263 C150 310 198 347 252 348 S333 319 350 277" stroke="#127cff" strokeWidth="5" opacity=".27" filter="url(#sigma-native-soft)"/>
     <path d="M146 279 C177 326 221 340 267 329 S320 299 336 277" stroke="#55c6ff" strokeWidth="1.5" opacity=".4"/>
     <path d="M164 175 C150 217 175 257 202 287 S268 323 300 317" stroke="#39aaff" strokeWidth="1.8" opacity=".33"/>
     <path d="M296 158 C320 195 320 225 302 254 S262 306 236 325" stroke="#63dfff" strokeWidth="1.2" opacity=".26"/>
    </g>

    <g className="sigma-native-neural">
     <g fill="none" stroke="url(#sigma-native-filament)" strokeWidth="1.2" opacity=".86">
      {filaments.map((d,i)=><path key={i} d={d} strokeWidth={i%3===0?1.6:.9}/>)}
     </g>
     <g fill="none" stroke="#2e9eff" strokeWidth=".65" strokeOpacity=".38">
      {connections.map(([a,b],i)=><path key={i} d={neuralPath(a,b)} className={i%2?'sigma-native-flow-b':'sigma-native-flow-a'} strokeDasharray="3 9"/>)}
     </g>
     {nodes.map(([x,y],i)=><g key={i}>
      <circle cx={x} cy={y} r={i%4===0?4:2.8} fill="#008aff" opacity=".15"/>
      <circle cx={x} cy={y} r={i%4===0?1.9:1.1} fill="#7deaff" opacity={i%3===0?.9:.53}/>
     </g>)}
     <g className="sigma-native-signals" filter="url(#sigma-native-point-glow)">
      {[0,2,4,7,10,15,20,23,26].map((idx,i)=>{
       const [a,b]=connections[idx];
       return <circle key={idx} r={i%3===0?2.5:1.6} fill="#c6fbff">
        <animateMotion path={neuralPath(a,b)} dur={`${2.7+i*.37}s`} begin={`-${i*.61}s`} repeatCount="indefinite"/>
       </circle>;
      })}
      {energyTrails.map((d,i)=><circle key={i} r={i%2?2.5:1.8} fill="#8cffff" opacity=".82">
       <animateMotion path={d} dur={`${5.1+i*.8}s`} begin={`-${i*1.25}s`} repeatCount="indefinite"/>
      </circle>)}
     </g>
    </g>

    {/* Transparent 3D lens reflections, moving independently of the neural web. */}
    <g className="sigma-native-filament-rotation" fill="none" strokeLinecap="round">
     {energyTrails.map((d,i)=><path key={i} d={d} stroke="#3fbaff" strokeOpacity={i%2?.24:.39} strokeWidth={i%2?1:1.4}/>)}
     <path d="M151 208 C189 142 278 127 324 194" stroke="#7deaff" strokeWidth="3.5" strokeOpacity=".16" filter="url(#sigma-native-soft)"/>
    </g>
   </g>

   {/* Animated rim highlights and cinematic starbursts. */}
   <g className="sigma-native-rim-rotation" fill="none" strokeLinecap="round">
    <circle cx={C} cy={C} r="127" stroke="#d7ffff" strokeWidth="3.4" strokeDasharray="26 772" opacity=".8" filter="url(#sigma-native-point-glow)"/>
    <circle cx={C} cy={C} r="128" stroke="#00aaff" strokeWidth="2.5" strokeDasharray="85 710" opacity=".36"/>
   </g>
   {brightPoints.map(([x,y,r],i)=><g key={i} className={i%2?'sigma-native-twinkle-alt':'sigma-native-twinkle'} style={{animationDelay:`${-i*.51}s`}}>
    <circle cx={x} cy={y} r={r*3.6} fill="url(#sigma-native-flare)" opacity=".4"/>
    <circle cx={x} cy={y} r={r} fill="#baf7ff" opacity=".77"/>
   </g>)}
   {[[C,111],[C,369],[111,C],[369,C],[172,172],[309,172],[171,309],[309,309]].map(([x,y],i)=>
    <g key={i} className={i%2?'sigma-native-twinkle-alt':'sigma-native-twinkle'} style={{animationDelay:`${-i*.68}s`}}>
     <circle cx={x} cy={y} r={i%4===0?18:12} fill="url(#sigma-native-flare)" opacity=".72"/>
     <path d={`M${x-8} ${y} H${x+8} M${x} ${y-8} V${y+8}`} stroke="#83e7ff" strokeWidth=".85" opacity=".7"/>
     <circle cx={x} cy={y} r="2" fill="#efffff" filter="url(#sigma-native-point-glow)"/>
    </g>
   )}
   <g className="sigma-native-hero-flare">
    <circle cx="184" cy="208" r="29" fill="url(#sigma-native-flare)" opacity=".9"/>
    <path d="M184 186 Q187 205 208 208 Q187 211 184 232 Q181 211 160 208 Q181 205 184 186Z" fill="#b5f7ff" opacity=".84" filter="url(#sigma-native-soft)"/>
    <circle cx="184" cy="208" r="5" fill="#e5ffff"/>
   </g>
  </svg>
 </div>;
}
