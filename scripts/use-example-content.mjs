// If src/data is missing (fresh fork), populate it from content.example so the site runs immediately.
import fs from 'node:fs';
import path from 'node:path';
const data = 'src/data', ex = 'content.example';
if (fs.existsSync(path.join(data, 'profile.json'))) process.exit(0);
fs.mkdirSync(path.join(data, 'sections'), { recursive: true });
fs.mkdirSync(path.join(data, 'assets'), { recursive: true });
for (const f of fs.readdirSync(ex)) {
  const src = path.join(ex, f);
  if (fs.statSync(src).isDirectory()) {
    for (const g of fs.readdirSync(src)) fs.copyFileSync(path.join(src, g), path.join(data, f, g));
  } else if (f.endsWith('.json')) fs.copyFileSync(src, path.join(data, f));
}
console.log('\n[mission-file] src/data was empty — loaded the EXAMPLE persona.');
console.log('[mission-file] Replace everything in src/data with your own story.\n');
