/**
 * HTTP 冒烟：/healthz、首页、构建产物 JS 均可达且内容合理。
 * 站点地址通过 BASE_URL 注入（默认本机 8080）。
 */
const base = process.env.BASE_URL ?? 'http://127.0.0.1:8080';

const health = await fetch(`${base}/healthz`);
if (!health.ok) throw new Error(`healthz 状态码 ${health.status}`);
const body = await health.json();
if (body.status !== 'ok') throw new Error(`healthz 内容异常: ${JSON.stringify(body)}`);

const home = await fetch(`${base}/`);
if (!home.ok) throw new Error(`首页状态码 ${home.status}`);
const html = await home.text();
if (!html.includes('id="root"')) {
  throw new Error('首页内容与预期不符（缺少 #root 挂载点）');
}

// 静态构建产物入口可达
const jsRef = html.match(/src="(\/assets\/[^"]+\.js)"/);
if (!jsRef) throw new Error('未在首页找到构建后的 JS 入口');
const js = await fetch(`${base}${jsRef[1]}`);
if (!js.ok) throw new Error(`JS 资源状态码 ${js.status}`);

// 未知路由回退到单页（可选增强）
const fallback = await fetch(`${base}/some/spa/route`);
if (!fallback.ok) throw new Error(`SPA 回退状态码 ${fallback.status}`);

console.log('SMOKE OK: /healthz、首页、构建产物与 SPA 回退均可访问');
