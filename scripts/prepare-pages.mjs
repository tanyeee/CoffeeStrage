import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('_site', { recursive: true });
for (const file of ['index.html','style.css','app.js','db.js','dates.js','validation.js','backup.js','presets.js','manifest.webmanifest']) {
  await copyFile(file, `_site/${file}`);
}
await cp('icons', '_site/icons', { recursive: true });
