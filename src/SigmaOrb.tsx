import {useEffect,useRef,useState} from 'react';
import {mountSigmaOrb} from './sigma-orb-webgl';
import './sigma-orb.css';

/** Browser-rendered hologram. Canvas contains live GPU geometry, never a pasted image. */
export function SigmaOrb(){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!canvas.current)return;
  try{
   const stop=mountSigmaOrb(canvas.current);
   return ()=>stop();
  }catch(e){
   setError(e instanceof Error?e.message:'Gráficos 3D indisponíveis');
  }
 },[]);
 return <div className="sigma-orb-webgl" role="img" aria-label="Esfera holográfica azul tridimensional do SIGMA com conexões internas em movimento">
  {error?<div className="sigma-orb-fallback" aria-hidden="true"><span/></div>:<canvas ref={canvas} aria-hidden="true"/>}
 </div>;
}
