const path = require('node:path');
const fs = require('node:fs/promises');
const esbuild = require('esbuild');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');

async function build() {
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['scripts/spreadsheet-entry.js'],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['chrome109'],
    outfile: 'web/vendor/univer/univer.js',
    legalComments: 'linked',
    metafile: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'info',
  });
  await fs.copyFile(path.join(root, 'node_modules/@univerjs/core/LICENSE'),
    path.join(root, 'web/vendor/univer/LICENSE'));
  const packages = new Set(Object.keys(result.metafile.inputs)
    .map(file => file.replace(/\\/g, '/').match(/^node_modules\/(@[^/]+\/[^/]+|[^/]+)/)?.[1]).filter(Boolean));
  const notices = [];
  for (const name of [...packages].sort()) {
    const directory = path.join(root, 'node_modules', name);
    const files = await fs.readdir(directory);
    const license = files.find(file => /^licen[cs]e(?:\.(?:md|txt))?$/i.test(file));
    if (license) notices.push(`===== ${name} =====\n${await fs.readFile(path.join(directory, license), 'utf8')}`);
  }
  await fs.writeFile(path.join(root, 'web/vendor/univer/THIRD_PARTY_LICENSES.txt'), notices.join('\n\n'));
  const manifest = {};
  for (const file of ['scripts/spreadsheet-entry.js', 'package-lock.json']) {
    const source = (await fs.readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
    manifest[file] = createHash('sha256').update(source).digest('hex');
  }
  await fs.writeFile(path.join(root, 'web/vendor/univer/build-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
