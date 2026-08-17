import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {formatDevVersionTimestamp as formatTimestamp} from './lib/version.mjs';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const headerPath = path.join(rootDir, 'userscript-header.txt');
const devScriptPath = path.join(distDir, 'mst.script.dev.user.js');
const localDebugPath = path.join(distDir, 'MST-local-debug.user.js');
const httpDebugPath = path.join(distDir, 'MST-http-debug.user.js');
const host = process.env.MST_DEV_SERVER_HOST || '127.0.0.1';
const startPort = Number.parseInt(process.env.MST_DEV_SERVER_PORT || '5173', 10);

function getDevScriptVersion() {
  try {
    const stat = fs.statSync(devScriptPath);
    return formatTimestamp(stat.mtime);
  } catch {
    return formatTimestamp();
  }
}

function createDebugHeader({name, requireUrl}) {
  const version = getDevScriptVersion();
  let header = fs.readFileSync(headerPath, 'utf8');
  header = header
    .replaceAll('MWI Sunrishe Toolkit', name)
    .replaceAll('MWI Sunrishe 工具箱', name)
    .replace('__MST_VERSION__', `0.0.0-local.${version}`);

  const requireLine = `// @require            ${requireUrl}`;
  const lastRequireMatch = [
    ...header.matchAll(/^\/\/ @require\s+.+$/gm)
  ].pop();

  if (lastRequireMatch) {
    const insertAt = lastRequireMatch.index + lastRequireMatch[0].length;
    header = header.slice(0, insertAt) + `\n${requireLine}` + header.slice(insertAt);
  } else {
    header = header.replace('// ==/UserScript==', `${requireLine}\n// ==/UserScript==`);
  }

  return `${header.trimEnd()}\n`;
}

function writeLocalDebugFile(origin) {
  if (!fs.existsSync(devScriptPath)) return;
  const version = getDevScriptVersion();
  fs.writeFileSync(
    localDebugPath,
    createDebugHeader({
      name: 'MST 本地调试（文件）',
      requireUrl: pathToFileURL(devScriptPath).href
    }),
    'utf8'
  );
  fs.writeFileSync(
    httpDebugPath,
    createDebugHeader({
      name: 'MST 本地调试（HTTP）',
      requireUrl: `${origin}/mst.script.dev.user.js?v=${version}`
    }),
    'utf8'
  );
}

function sendText(response, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    pragma: 'no-cache',
    expires: '0',
    'access-control-allow-origin': '*'
  });
  response.end(body);
}

function serveFile(response, filePath, contentType) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, 404, 'Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': contentType,
      'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      pragma: 'no-cache',
      expires: '0',
      'access-control-allow-origin': '*'
    });
    response.end(content);
  });
}

function createServer(port) {
  const origin = `http://${host}:${port}`;
  return http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', origin);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (pathname === '/') {
      sendText(response, 200, 'MST dev server is running. Use dist/MST-http-debug.user.js in Tampermonkey.');
      return;
    }

    if (pathname === '/mst.script.dev.user.js') {
      serveFile(response, devScriptPath, 'application/javascript; charset=utf-8');
      return;
    }

    sendText(response, 404, 'Not found');
  });
}

function listen(port, maxPort = port + 100) {
  return new Promise((resolve, reject) => {
    const server = createServer(port);
    server.once('error', (error) => {
      if ((error.code === 'EADDRINUSE' || error.code === 'EACCES') && port < maxPort) {
        resolve(listen(port + 1, maxPort));
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => resolve({server, port}));
  });
}

function startRollupWatch() {
  const rollupCli = path.join(rootDir, 'node_modules', 'rollup', 'dist', 'bin', 'rollup');
  const child = spawn(
    process.execPath,
    [
      rollupCli, '-c', 'rollup.config.mjs', '-w'
    ],
    {
      cwd: rootDir,
      env: {...process.env, MST_BUILD_ENV: 'development'},
      stdio: 'inherit',
      shell: false
    }
  );

  child.on('exit', (code, signal) => {
    if (signal) process.exit(0);
    process.exit(code ?? 1);
  });

  return child;
}

function watchDevScript(origin) {
  let lastVersion = '';
  const report = () => {
    if (!fs.existsSync(devScriptPath)) return;
    const version = getDevScriptVersion();
    if (version === lastVersion) return;
    lastVersion = version;
    writeLocalDebugFile(origin);
    console.log(`[MST] 已刷新文件入口: ${path.relative(rootDir, localDebugPath)}`);
    console.log(`[MST] 已刷新 HTTP 入口: ${path.relative(rootDir, httpDebugPath)}`);
    console.log(`[MST] 文件版 @require: ${pathToFileURL(devScriptPath).href}`);
    console.log(`[MST] HTTP 版 @require: ${origin}/mst.script.dev.user.js?v=${version}`);
  };

  fs.mkdirSync(distDir, {recursive: true});
  fs.watch(distDir, {persistent: true}, (eventType, filename) => {
    if (filename === 'mst.script.dev.user.js') {
      setTimeout(report, 50);
    }
  });
  setInterval(report, 2000).unref();
  report();
}

const {server, port} = await listen(Number.isFinite(startPort) ? startPort : 5173);
const origin = `http://${host}:${port}`;

console.log(`[MST] HTTP 服务已启动: ${origin}/`);
console.log(`[MST] 文件版油猴入口: ${path.relative(rootDir, localDebugPath)}`);
console.log(`[MST] HTTP 版油猴入口: ${path.relative(rootDir, httpDebugPath)}`);
console.log(
  '[MST] 两个入口都会自动刷新 @version 和 @require；油猴未自动更新时，请重新导入对应文件或在脚本详情页检查更新。'
);

const rollupWatch = startRollupWatch();
watchDevScript(origin);

const shutdown = () => {
  server.close();
  rollupWatch.kill();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
