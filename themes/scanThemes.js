"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var matter = require("gray-matter");
var THEMES_DIR = path.resolve(__dirname, 'themes');
var OUTPUT_FILE = path.resolve(__dirname, 'themes.json');
// 获取时间戳
function getTimestamp() {
    return Date.now().toString();
}
// 获取 themes 目录下的 .md 文件
function getMarkdownFiles(dir) {
    if (!fs.existsSync(dir))
        return [];
    return fs.readdirSync(dir).filter(function (file) { return file.endsWith('.md'); });
}
// 解析 frontmatter 并提取 theme_name
function extractThemeData(filePath) {
    var content = fs.readFileSync(filePath, 'utf-8');
    var data = matter(content).data;
    if (data.theme_name) {
        return {
            name: data.theme_name,
            file: path.basename(filePath)
        };
    }
    return null;
}
// 写入 JSON 文件
function writeThemesJson(themes, outputPath) {
    if (fs.existsSync(outputPath)) {
        var backupPath = outputPath.replace(/\.json$/, "-".concat(getTimestamp(), ".json"));
        fs.renameSync(outputPath, backupPath);
    }
    var outputData = { themes: themes };
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
}
// 主函数
function main() {
    var files = getMarkdownFiles(THEMES_DIR);
    var themes = files
        .map(function (file) { return extractThemeData(path.join(THEMES_DIR, file)); })
        .filter(function (item) { return item !== null; });
    writeThemesJson(themes, OUTPUT_FILE);
    console.log("\u63D0\u53D6\u5B8C\u6210\uFF0C\u5199\u5165 ".concat(OUTPUT_FILE));
}
main();
