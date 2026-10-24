const VERTEX="attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.,1.);}";
const FRAGMENT="\nprecision highp float;\nuniform vec2 u_size;\nuniform float u_time;\n#define PI 3.14159265359\nfloat sat(float v){return clamp(v,0.,1.);}\nfloat bell(float x,float p,float w){return exp(-pow((x-p)/w,2.));}\nfloat hash(float x){return fract(sin(x*127.1+32.7)*43758.5453);}\nmat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}\nfloat ellipse(vec2 p,float a,float b,float angle,float thick){\n vec2 q=rot(angle)*p;\n return exp(-pow((abs(length(q/vec2(a,b))-1.)*min(a,b))/thick,2.));\n}\nfloat star(vec2 p,vec2 center,float size){\n vec2 q=(p-center)/size;\n float halo=exp(-dot(q,q)*2.5);\n float rays=exp(-abs(q.x)*11.)*exp(-abs(q.y)*.95)+exp(-abs(q.y)*11.)*exp(-abs(q.x)*.95);\n float diamond=exp(-pow(abs(q.x)*3.5+abs(q.y)*3.5,1.4));\n return halo*.16+rays*.65+diamond*.58;\n}\nvoid main(){\n vec2 p=(gl_FragCoord.xy-.5*u_size)/min(u_size.x,u_size.y)*2.;\n float t=u_time,r=length(p),theta=atan(p.y,p.x);\n float body=1.-smoothstep(.535,.549,r);\n float depth=sqrt(max(0.,1.-pow(r/.547,2.)));\n float rim=bell(r,.548,.0085),innerRim=bell(r,.532,.015),bloom=bell(r,.553,.038);\n float mist=exp(-pow(r/.79,4.));\n vec3 col=vec3(.008,.12,.4)*mist*.22;\n float alpha=mist*.11;\n vec3 glass=mix(vec3(.002,.008,.033),vec3(.006,.06,.17),sat(1.-depth));\n glass+=vec3(.012,.09,.25)*pow(sat(.75+p.y*.7),2.)*.27;\n glass+=vec3(.005,.025,.10)*exp(-dot(p-vec2(-.22,.28),p-vec2(-.22,.28))*13.);\n col+=glass*body;alpha=max(alpha,body*.94);\n float threads=0.,flashes=0.;\n for(int i=0;i<10;i++){\n  float f=float(i),angle=f*1.271+t*(.045+mod(f,3.)*.012);\n  float a=.31+.11*sin(f*1.67+t*.031),b=.21+.09*cos(f*1.41+t*.021);\n  float line=ellipse(p,a,b,angle,.0035+.001*mod(f,3.));\n  float phase=theta+f*1.8;\n  threads+=line*max(.07,.42+.35*sin(phase*1.7+t*.18+f*2.1))*(.55+.35*sin(f*2.5));\n  flashes+=line*pow(max(0.,sin(phase*2.3-t*.4+f*2.4)),7.)*.65;\n }\n float nodes=0.,nodeHalo=0.;\n for(int j=0;j<13;j++){\n  float f=float(j),a=f*2.39996+t*(.08+.008*mod(f,4.));\n  float rx=.16+.24*hash(f+2.),ry=.13+.19*hash(f+18.);\n  float phase=f*1.73+t*(.15+.03*hash(f));\n  vec2 pos=rot(-a)*vec2(rx*cos(phase),ry*sin(phase));\n  nodes+=exp(-pow(length(p-pos)/(.006+.002*hash(f)),2.))*(.7+.3*sin(t+f));\n  nodeHalo+=exp(-pow(length(p-pos)/.027,2.))*.13;\n }\n col+=(vec3(.025,.26,.78)*threads*.45+vec3(.16,.72,1.)*flashes*.45)*body*(.48+.52*depth);\n col+=vec3(.17,.75,1.)*nodes*.55*body+vec3(.01,.21,.62)*nodeHalo*body;\n float fold=ellipse(p+vec2(.012*sin(t*.2),0.),.46,.27,-.7+t*.025,.012);\n float fold2=ellipse(p,.37,.33,.6-t*.02,.007);\n col+=vec3(.018,.23,.78)*(fold*.17+fold2*.12)*body;\n float lens=exp(-pow(length((p-vec2(-.12,.32))/vec2(.42,.15))-1.,2.)*220.);\n col+=vec3(.10,.47,.84)*lens*sat(p.y+.12)*body*.12;\n float lit=.68+.32*sin(theta*2.3+.6);\n col+=vec3(.03,.33,.95)*bloom*.45+vec3(.25,.83,1.)*innerRim*.65;\n col+=mix(vec3(.03,.38,1.),vec3(.65,.98,1.),lit)*rim*1.28;\n col+=vec3(.035,.15,.48)*pow(1.-depth,3.4)*body*.18;\n alpha=max(alpha,sat(bloom*.8+rim*1.2));\n for(int k=0;k<3;k++){\n  float f=float(k),a=t*(.25+.08*f)+f*2.094;\n  float diff=atan(sin(theta-a),cos(theta-a));\n  col+=vec3(.32,.87,1.)*exp(-pow(diff/.10,2.))*bell(r,.548,.016)*.9;\n }\n float diamond=star(p,vec2(-.245,.125),.075)*(.91+.09*sin(t*1.2));\n float diamond2=star(p,vec2(.27,-.18),.035)*(.84+.16*sin(t*1.8));\n col+=vec3(.20,.74,1.)*diamond*1.15+vec3(.12,.60,1.)*diamond2*.85;\n alpha=max(alpha,sat(diamond*.45+diamond2*.25));\n // Concentric circular HUD only; no Saturn-like equatorial belt.\n float hud=0.;\n for(int m=0;m<5;m++){\n  float f=float(m),radius=.675+f*.055;\n  float angle=theta+t*(mod(f,2.)<.5?.025:-.017);\n  float dash=step(.34,fract(angle*(13.+f*4.)/6.283185+f*.17));\n  float detail=step(.8,fract(angle*(36.+f*9.)/6.283185+f*.32));\n  hud+=bell(r,radius,.0022)*(dash*.42+detail*.19);\n  hud+=bell(r,radius+.014,.002)*detail*.24;\n }\n hud+=bell(r,.835,.011)*step(.88,fract(theta*64./6.283185))*.14;\n hud+=bell(r,.945,.006)*step(.93,fract(theta*12./6.283185+t*.012))*.2;\n col+=vec3(.025,.35,.85)*hud*.72;alpha=max(alpha,sat(hud*.65));\n float spokes=0.,sparkles=0.;\n for(int n=0;n<16;n++){\n  float f=float(n),a=f*6.283185/16.+t*.004;\n  vec2 dir=vec2(cos(a),sin(a));\n  float perp=abs(dot(p,vec2(-dir.y,dir.x))),along=dot(p,dir);\n  float cardinal=mod(f,4.)<.5?1.:0.;\n  spokes+=exp(-pow(perp/.0018,2.))*smoothstep(.69,.77,along)*(1.-smoothstep(.90,.97,along))*(cardinal*.29+.11);\n  vec2 pos=dir*(.80+.03*sin(f*3.7));\n  sparkles+=exp(-pow(length(p-pos)/.007,2.))*(cardinal*.57+.28);\n }\n col+=vec3(.10,.47,1.)*spokes+vec3(.27,.78,1.)*sparkles;\n alpha=max(alpha,sat(spokes*.65+sparkles));\n float compass=0.;\n for(int q=0;q<4;q++){\n  float a=float(q)*PI*.5;\n  compass+=star(p,vec2(cos(a),sin(a))*.84,.027)*(.6+.18*sin(t*.7+float(q)));\n }\n col+=vec3(.11,.53,1.)*compass*.7;alpha=max(alpha,sat(compass*.5));\n col=1.-exp(-col*1.22);\n gl_FragColor=vec4(col,sat(alpha));\n}";

/** Procedural GPU orb: no textures or image overlays. */
export function mountSigmaOrb(canvas:HTMLCanvasElement):()=>void{
 const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
 if(!gl)throw new Error('WebGL indisponível');
 const compile=(type:number,source:string)=>{
  const s=gl.createShader(type);if(!s)throw new Error('Shader indisponível');
  gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error('Shader: '+e);}
  return s;
 };
 const vs=compile(gl.VERTEX_SHADER,VERTEX),fs=compile(gl.FRAGMENT_SHADER,FRAGMENT);
 const program=gl.createProgram();if(!program)throw new Error('Programa WebGL indisponível');
 gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
 gl.deleteShader(vs);gl.deleteShader(fs);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const e=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw new Error('WebGL: '+e);}
 const buffer=gl.createBuffer();if(!buffer){gl.deleteProgram(program);throw new Error('Buffer indisponível');}
 gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 gl.useProgram(program);
 const position=gl.getAttribLocation(program,'a_pos');
 gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 const size=gl.getUniformLocation(program,'u_size'),time=gl.getUniformLocation(program,'u_time');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let frame=0,active=true,visible=true,lost=false,last=0,start=performance.now();
 const resize=()=>{
  const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
  const dpr=Math.min(window.devicePixelRatio||1,1.5);
  const w=Math.min(800,Math.max(1,Math.round(rect.width*dpr))),h=Math.min(800,Math.max(1,Math.round(rect.height*dpr)));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
 };
 const render=(now:number)=>{
  if(!active||lost)return;frame=requestAnimationFrame(render);
  if(!visible||document.hidden)return;
  if(!reduced.matches&&now-last<33)return;
  last=now;resize();gl.useProgram(program);
  gl.uniform2f(size,canvas.width,canvas.height);
  gl.uniform1f(time,reduced.matches?0:(now-start)*.001);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES,0,6);
 };
 const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??false;},{threshold:.01});
 observer?.observe(canvas);
 const onLost=(e:Event)=>{e.preventDefault();lost=true;cancelAnimationFrame(frame);};
 canvas.addEventListener('webglcontextlost',onLost);
 frame=requestAnimationFrame(render);
 return ()=>{active=false;cancelAnimationFrame(frame);observer?.disconnect();canvas.removeEventListener('webglcontextlost',onLost);gl.deleteBuffer(buffer);gl.deleteProgram(program);};
}
