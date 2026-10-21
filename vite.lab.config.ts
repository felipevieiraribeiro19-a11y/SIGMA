import {defineConfig} from 'vite';
import {resolve} from 'node:path';

/**
 * Separate build: NEVER copy the production SIGMA entrypoint or publicDir
 * to the lab hosting channel. Contains no production backend or Firestore client.
 */
export default defineConfig({
 publicDir:false,
 build:{
  outDir:'dist-jarvis-lab',
  emptyOutDir:true,
  rollupOptions:{input:resolve(process.cwd(),'jarvis-lab.html')},
 }
});
