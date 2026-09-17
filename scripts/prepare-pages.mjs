import { createHash } from 'node:crypto';
import { mkdir, copyFile, cp, readFile, writeFile } from 'node:fs/promises';
await mkdir('_site', { recursive: true });
const files = ['index.html','style.css','app.js','db.js','dates.js','validation.js','backup.js','presets.js','manifest.webmanifest','pwa.js'];
for (const file of files) {
  await copyFile(file, `_site/${file}`);
}
await cp('icons', '_site/icons', { recursive: true });

const hash = createHash('sha256');
for (const file of [...files, ...['favicon.svg','icon-192.png','icon-512.png','maskable-512.png','apple-touch-icon.png'].map(name => `icons/${name}`)]) {
  hash.update(file); hash.update(await readFile(file));
}
const worker = await readFile('service-worker.js','utf8');
hash.update(worker);
await writeFile('_site/service-worker.js', worker.replace("'development-v1'", JSON.stringify(hash.digest('hex').slice(0,20))));
