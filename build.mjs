import { build, context } from 'esbuild';
import { mkdirSync, copyFileSync, cpSync } from 'node:fs';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: {
    'page-bypass': 'src/page-bypass.ts',
    consent: 'src/consent.ts',
    background: 'src/background.ts',
  },
  bundle: true,
  outdir: 'dist',
  format: 'iife',
  target: 'chrome111',
  legalComments: 'none',
  logLevel: 'info',
};

function copyStatic() {
  mkdirSync('dist/rules', { recursive: true });
  copyFileSync('src/manifest.json', 'dist/manifest.json');
  cpSync('src/rules', 'dist/rules', { recursive: true });
}

if (watch) {
  const ctx = await context(options);
  copyStatic();
  await ctx.watch();
  console.log('[build] watch actif — dist/ se met à jour automatiquement.');
} else {
  await build(options);
  copyStatic();
  console.log('[build] OK -> dist/  (charge ce dossier dans chrome://extensions)');
}
