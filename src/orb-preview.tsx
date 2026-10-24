import {createRoot} from 'react-dom/client';
import {SigmaOrb} from './SigmaOrb';
import './orb-preview.css';

function Preview(){
 return <main className="sigma-orb-preview">
  <div className="sigma-orb-preview-top"><span className="sigma-orb-preview-logo">Σ</span><span>SIGMA <small>PRÉVIA DO ORBE 3D</small></span></div>
  <div className="sigma-orb-preview-copy"><h1>Olá, Felipe.</h1><p>Como posso te ajudar hoje?</p></div>
  <SigmaOrb/>
  <p className="sigma-orb-preview-note">Protótipo visual isolado · WebGL em tempo real · Sem login ou acesso aos seus dados</p>
  <p className="sigma-orb-preview-note">O site principal continua como está até você aprovar.</p>
 </main>;
}
const root=document.getElementById('root');
if(root)createRoot(root).render(<Preview/>);
