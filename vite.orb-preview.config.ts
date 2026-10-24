import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {existsSync,renameSync} from 'node:fs';

/** Only the standalone orb preview, no Firebase Auth or SIGMA data. */
export default defineConfig({
 plugins:[{name:'orb-preview-index',closeBundle(){
  const from=resolve(process.cwd(),'dist-orb-preview/orb-preview.html');
  const to=resolve(process.cwd(),'dist-orb-preview/index.html');
  if(!existsSync(from))throw Error('Prévia do orbe não compilada.');
  renameSync(from,to);
 }}],
 publicDir:false,
 build:{outDir:'dist-orb-preview',emptyOutDir:true,rollupOptions:{input:resolve(process.cwd(),'orb-preview.html')}}
});
