const VERTEX="attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.,1.);}";
const FRAGMENT="\nprecision highp float;\nuniform vec2 u_size;\nuniform float u_time;\n#define PI 3.14159265359\nfloat sat(float v){return clamp(v,0.,1.);}\nfloat bell(float x,float p,float w){return exp(-pow((x-p)/w,2.));}\nvoid main(){\n vec2 p=(gl_FragCoord.xy-.5*u_size)/min(u_size.x,u_size.y)*2.;\n float t=u_time,r=length(p),theta=atan(p.y,p.x);\n // Deliberately hollow: remove the dark central sphere and its internal geometry.\n float rim=bell(r,.548,.0085),innerRim=bell(r,.532,.015),bloom=bell(r,.553,.038);\n float mist=exp(-pow(r/.79,4.));\n vec3 col=vec3(.008,.12,.4)*mist*.22;\n float alpha=0.;\n float shell=smoothstep(.475,.535,r)*(1.-smoothstep(.56,.595,r));\n col+=vec3(.009,.11,.30)*shell*.27;\n alpha=max(alpha,shell*.18);\n float lit=.68+.32*sin(theta*2.3+.6);\n col+=vec3(.03,.33,.95)*bloom*.45+vec3(.25,.83,1.)*innerRim*.65;\n col+=mix(vec3(.03,.38,1.),vec3(.65,.98,1.),lit)*rim*1.28;\n alpha=max(alpha,sat(bloom*.8+rim*1.2));\n for(int k=0;k<3;k++){\n  float f=float(k),a=t*(.25+.08*f)+f*2.094;\n  float diff=atan(sin(theta-a),cos(theta-a));\n  col+=vec3(.32,.87,1.)*exp(-pow(diff/.10,2.))*bell(r,.548,.016)*.9;\n }\n // Clean luminous perimeter only; external decoration removed.\n col=1.-exp(-col*1.22);\n gl_FragColor=vec4(col,sat(alpha));\n}";

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
