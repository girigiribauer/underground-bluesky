const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'src/bookmarklet.js'), 'utf8');

const min = src
  .replace(/(?:^|[ \t])\/\/[^\n]*/gm, '') // line comments (not http://)
  .replace(/\/\*[\s\S]*?\*\//g, '')        // block comments
  .replace(/\s+/g, ' ')
  .replace(/\s*([{}();,=+\-*\/<>!&|?:])\s*/g, '$1')
  .trim();

const encoded = 'javascript:' + encodeURIComponent(min);

if (!fs.existsSync(path.join(__dirname, 'dist'))) {
  fs.mkdirSync(path.join(__dirname, 'dist'));
}
fs.writeFileSync(path.join(__dirname, 'dist/bookmarklet.min.js'), min);

let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
html = html.replace(/(id="bm-link"[^>]*href=")[^"]*(")/,  '$1' + encoded + '$2');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const majorVer = pkg.version.split('.')[0];
html = html.replace(/(id="bm-link"[^>]*>)(.*?)(<\/a>)/, '$1<span>地下ブルースカイ</span><span>v' + majorVer + '</span>$3');
fs.writeFileSync(path.join(__dirname, 'index.html'), html);

console.log('Built. Bookmarklet:', encoded.length, 'chars');
