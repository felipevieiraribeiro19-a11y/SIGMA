import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {existsSync,renameSync} from 'node:fs';

/**
 * Separate build: NEVER copy the production SIGMA entrypoint or publicDir
 * to the lab hosting channel. Contains no production backend or Firestore client.
 */
export default defineConfig({
 plugins:[{name:'lab-index-only',closeBundle(){
  const from=resolve(process.cwd(),'dist-jarvis-lab/jarvis-lab.html');
  const to=resolve(process.cwd(),'dist-jarvis-lab/index.html');
  if(!existsSync(from))throw Error('O laboratório não foi compilado.');
  renameSync(from,to);
 }}],
 publicDir:false,
 build:{
  outDir:'dist-jarvis-lab',
  emptyOutDir:true,
  rollupOptions:{input:resolve(process.cwd(),'jarvis-lab.html')},
 }
});
