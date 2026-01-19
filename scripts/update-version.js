/**
 * 版本更新脚本
 * 在构建前自动从 package.json 读取版本号并更新到相关文件
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '../package.json');
const rendererHtmlPath = path.join(__dirname, '../renderer/index.html');

// 读取 package.json 获取版本号
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

console.log(`📦 更新版本号到: ${version}`);

// 更新 renderer/index.html 中的版本号
if (fs.existsSync(rendererHtmlPath)) {
  let htmlContent = fs.readFileSync(rendererHtmlPath, 'utf8');
  
  // 替换硬编码的版本号
  // 匹配: <span class="product-version" id="product-version">V0.1.0</span>
  const versionRegex = /(<span\s+class="product-version"\s+id="product-version">)V?[\d.]+(<\/span>)/;
  if (versionRegex.test(htmlContent)) {
    htmlContent = htmlContent.replace(versionRegex, `$1V${version}$2`);
    fs.writeFileSync(rendererHtmlPath, htmlContent, 'utf8');
    console.log(`✅ 已更新 renderer/index.html 版本号为 V${version}`);
  } else {
    console.warn('⚠️  未找到版本号占位符，跳过更新');
  }
} else {
  console.warn(`⚠️  文件不存在: ${rendererHtmlPath}`);
}

console.log('✨ 版本更新完成');
