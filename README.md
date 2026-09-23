# 卫星热控单元 · 自适应诊断树合成工作台

纯前端（React + TypeScript + Vite）单页应用：导入或编辑「故障 × 试验」矩阵，
**全部计算在浏览器本地完成**，不发起任何网络请求。按真实排故语义合成最坏耗时
最小的自适应诊断树，并支持选定故障逐步回放判定过程。

## 优化目标（依次）

对每个候选故障集合只允许使用**能将其分裂为非空 0/1 两侧**的试验，完整求解：

1. **最坏累计耗时**最小（根到叶路径上实际执行试验耗时之和的最大值）；
2. 平局时最小化**最坏试验数**；
3. 再平局时，取「每个节点记试验编号、先 0 分支后 1 分支展开」的
   **先序序列字典序**最小者。

### 求解方法

第 3 条是对整棵树的全局先序序列比较：某个不决定全局最坏值的「余量分支」
允许使用自身更贵但编号更小的试验（只要不突破根预算），朴素的「每个子集
独立取最优」会在此处选错。求解器采用**自顶向下预算 DP**：

- `C(S)`：无约束最小最坏耗时（标量 DP）；
- `D(S, Bc)`：耗时预算 `Bc` 下的最小最坏深度；
- `L(S, Bc, Bd)`：预算内字典序最小的子树——按试验编号从小到大枚举，
  第一个使两个子问题在剩余预算内同时可行的试验即字典序最优。

候选集用 14 位位掩码表示；规格上限（14 故障 × 20 试验）下求解耗时为个位数毫秒。

## 输入约束

- 故障：3–14 种；试验：2–20 项；
- 每项试验耗时为**正整数**；
- 每个读数为 `0` 或 `1`，矩阵不允许缺项；
- 故障/试验编号非空且不可重复；
- 完整读数向量完全相同的故障构成**不可区分组**，无法生成诊断树（页面列出该组）。

任何输入变化都会立即重新校验并求解；不合法时旧树立即撤下，错误定位到
「故障行 #i、试验列 #j」，矩阵对应单元格红框标注。

## JSON 格式

```json
{
  "tests": [
    { "id": "T1", "cost": 5 },
    { "id": "T2", "cost": 2 }
  ],
  "faults": [
    { "id": "F1", "readings": [0, 0] },
    { "id": "F2", "readings": [0, 1] },
    { "id": "F3", "readings": [1, 0] }
  ]
}
```

## 本地开发

```bash
npm install        # 如遇缓存目录权限问题可加 --cache /tmp/npm-cache
npm run dev        # 开发服务器
npm run test       # 单元测试（含 300 组精确 oracle 随机对拍）
npm run typecheck  # 类型检查
npm run build      # 生产构建到 dist/
npm run preview    # 或：PORT=8080 node server.mjs
```

`server.mjs` 是零依赖静态服务器，提供站点与 `GET /healthz` 健康检查。

## Docker

```bash
# 宿主机端口通过 HOST_PORT 配置（默认 8080）
HOST_PORT=9000 docker compose up --build web

# 一次性校验：单元测试 + 类型检查 + 生产构建 + HTTP 冒烟，
# 完成后自行退出，并以退出码报告结果（0=全部通过）
docker compose build verify
docker compose up verify            # 或：docker compose run --rm verify
```

Compose 服务：

- `web`：多阶段构建出的精简运行镜像（仅 `dist/` + 静态服务器），
  带容器 `HEALTHCHECK`（轮询 `/healthz`），宿主机端口由 `HOST_PORT` 配置；
- `verify`：基于完整构建阶段镜像的一次性服务，执行 `scripts/verify.sh`，
  `restart: "no"`，脚本任一环节失败即以非零码退出。

## 目录

```
src/
  types.ts        领域模型
  solver.ts       自顶向下预算 DP 求解器
  validation.ts   数量/编号/耗时/读数/不可区分组校验与定位
  io.ts           JSON 导入导出
  tree.ts         回放路径构造
  samples.ts      内置示例（含不可区分、昂贵试验等场景）
  components/     矩阵编辑、问题反馈、诊断树、回放面板
scripts/
  verify.sh       测试 → 类型 → 构建 → 启动 → 冒烟
  smoke.mjs       HTTP 冒烟（/healthz、首页、构建产物、SPA 回退）
server.mjs        零依赖静态服务器
```
