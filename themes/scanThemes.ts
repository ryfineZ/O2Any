import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const THEMES_DIR = path.resolve(__dirname, '');
const OUTPUT_FILE = path.resolve(__dirname, 'themes.json');

// 获取时间戳
function getTimestamp(): string {
  return Date.now().toString();
}

// 获取 themes 目录下的 .md 文件
function getMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(file => file.endsWith('.md'));
}

// 解析 frontmatter 并提取 theme_name
function extractThemeData(filePath: string): { name: string, file: string } | null {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { data } = matter(content);
  if (data.theme_name) {
    return {
      name: data.theme_name,
      file: path.basename(filePath)
    };
  }
  return null;
}

// 写入 JSON 文件
function writeThemesJson(themes: { name: string, file: string }[], outputPath: string) {
  if (fs.existsSync(outputPath)) {
    const backupPath = outputPath.replace(/\.json$/, `-${getTimestamp()}.json`);
    fs.renameSync(outputPath, backupPath);
  }
  const outputData = { themes };
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
}

// 主函数
function main() {
	console.debug(`Scanning themes in ${THEMES_DIR}... `);
  const files = getMarkdownFiles(THEMES_DIR);
  const themes = files
    .map(file => extractThemeData(path.join(THEMES_DIR, file)))
    .filter((item): item is { name: string, file: string } => item !== null);
  
  writeThemesJson(themes, OUTPUT_FILE);
  console.debug(`提取完成，写入 ${OUTPUT_FILE}`);
}

main();
