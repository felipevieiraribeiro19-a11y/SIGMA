import {defineConfig} from 'vite';
import {resolve} from 'node:path';
import {existsSync,renameSync} from 'node:fs';

/** Dedicated Beta entrypoint; the LAB and original main builds remain untouched. */
export default defineConfig({
 plugins:[{name:'beta-index-only',closeBundle(){
  const from=resolve(process.cwd(),'dist-sigma-beta/sigma-beta.html');
  const to=resolve(process.cwd(),'dist-sigma-beta/index.html');
  if(!existsSync(from))throw Error('A interface Beta não foi compilada.');
  renameSync(from,to);
 }}],
 publicDir:false,
 build:{
  outDir:'dist-sigma-beta',
  emptyOutDir:true,
  rollupOptions:{input:resolve(process.cwd(),'sigma-beta.html')}
 }
});
