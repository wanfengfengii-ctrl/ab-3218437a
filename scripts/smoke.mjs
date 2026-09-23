// HTTP 冒烟：/health 200、/ 返回含根节点的 HTML、其引用的 JS 产物可访问。
// 自带重试，以等待服务器启动；任何失败以非零退出码报告。
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      // 服务器尚未监听
    }
    await sleep(500);
  }
  throw new Error(`等待 ${BASE}/health 就绪超时`);
}

const failures = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✕ ${name}: ${e.message}`);
    failures.push(name);
  }
}

await waitForServer();

await check('GET /health 返回 200 且 status=ok', async () => {
  const r = await fetch(`${BASE}/health`);
  if (r.status !== 200) throw new Error(`状态码 ${r.status}`);
  const body = await r.json();
  if (body.status !== 'ok') throw new Error(`响应体 ${JSON.stringify(body)}`);
});

let indexHtml = '';
await check('GET / 返回 200 HTML 且含 #root', async () => {
  const r = await fetch(`${BASE}/`);
  if (r.status !== 200) throw new Error(`状态码 ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('text/html')) throw new Error(`Content-Type: ${ct}`);
  indexHtml = await r.text();
  if (!indexHtml.includes('<div id="root">')) throw new Error('缺少 #root 挂载点');
});

await check('HTML 引用的 JS 产物可访问（ES Module）', async () => {
  const m = indexHtml.match(/src="(\/assets\/[^"]+\.js)"/);
  if (!m) throw new Error('未找到 /assets/*.js 引用');
  const r = await fetch(`${BASE}${m[1]}`);
  if (r.status !== 200) throw new Error(`状态码 ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('javascript')) throw new Error(`Content-Type: ${ct}`);
});

if (failures.length > 0) {
  console.error(`\n冒烟失败：${failures.join('、')}`);
  process.exit(1);
}
console.log('\nHTTP 冒烟全部通过。');
