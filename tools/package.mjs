import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const version = manifest.version;
const pluginId = manifest.id;

const mainJsPath = path.join(rootDir, 'main.js');
if (!fs.existsSync(mainJsPath)) {
	console.error('未找到 main.js，请先执行 npm run build');
	process.exit(1);
}

const assetsDir = path.join(rootDir, 'assets');
const assetsZip = path.join(rootDir, 'assets.zip');
if (!fs.existsSync(assetsDir)) {
	if (!fs.existsSync(assetsZip)) {
		console.error('未找到 assets 或 assets.zip，请先执行 npm run download');
		process.exit(1);
	}
	fs.mkdirSync(assetsDir, { recursive: true });
	execFileSync('unzip', ['-o', assetsZip, '-d', assetsDir], { stdio: 'inherit' });
}

const releaseDir = path.join(rootDir, 'release');
const packageDir = path.join(releaseDir, pluginId);
const zipName = `O2Any-${version}.zip`;
const zipPath = path.join(releaseDir, zipName);

fs.rmSync(packageDir, { recursive: true, force: true });
fs.mkdirSync(packageDir, { recursive: true });

const filesToCopy = ['main.js', 'manifest.json', 'styles.css'];
for (const file of filesToCopy) {
	const src = path.join(rootDir, file);
	if (fs.existsSync(src)) {
		fs.copyFileSync(src, path.join(packageDir, file));
	}
}

fs.cpSync(assetsDir, path.join(packageDir, 'assets'), { recursive: true });
fs.rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', zipName, pluginId], { cwd: releaseDir, stdio: 'inherit' });

console.log(`打包完成：${zipPath}`);
