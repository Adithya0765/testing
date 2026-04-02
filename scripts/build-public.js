const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public');

const filesToCopy = [
  'index.html',
  'careers.html',
  'careers-apply.html',
  'hardware.html',
  'registration.html',
  'password-reset.html',
  'forms.html',
  'styles.css',
  'main.js',
  'googledbca2cc68d832391.html'
];

function ensureOutDir() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

function copyRequiredFiles() {
  const missing = [];

  for (const relPath of filesToCopy) {
    const src = path.join(root, relPath);
    const dest = path.join(outDir, relPath);

    if (!fs.existsSync(src)) {
      missing.push(relPath);
      continue;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  if (missing.length > 0) {
    throw new Error(
      `Build failed. Missing required files: ${missing.join(', ')}`
    );
  }
}

function copyOptionalAssetsDir() {
  const srcAssetsDir = path.join(root, 'assets');
  const destAssetsDir = path.join(outDir, 'assets');

  if (fs.existsSync(srcAssetsDir)) {
    fs.cpSync(srcAssetsDir, destAssetsDir, { recursive: true });
  }
}

function main() {
  ensureOutDir();
  copyRequiredFiles();
  copyOptionalAssetsDir();
  console.log(`Built static site into ${path.relative(root, outDir)}`);
}

main();
