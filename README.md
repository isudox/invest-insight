# Invest Insight

面向自托管（NAS / VPS / 家用服务器）的个人资产配置、调整与追踪工具。股票、基金、债券、保险、加密货币、现金等资产统一管理，数据只保存在你自己的服务器上。

- 单个 Docker 容器，SQLite 单文件存储，不依赖外部数据库
- 镜像支持 `linux/amd64` 与 `linux/arm64`（群晖、威联通、Unraid、树莓派、ARM VPS）
- 自动定时备份、升级前自动备份，数据库结构随版本自动迁移
- 内置登录（不开放注册）、登录限流、CSRF 防护与安全响应头，适配反向代理
- 可作为 PWA 添加到手机主屏幕
- 界面支持简体中文 / English，可在设置页或登录页切换

## 功能

页面布局与部分功能参考了开源项目 [Ghostfolio](https://github.com/ghostfolio/ghostfolio) 与 [Wealthfolio](https://github.com/afadil/wealthfolio)。

**概览**

- **总览**：大字号总资产 + 区间涨跌（近1月 / 3月 / 6月 / 今年 / 近1年 / 全部）+ 资产走势；累计收益、年化 XIRR、已实现与分红、体检得分；按类别 / 账户 / 币种切换的配置环形图；主要持仓、账户分布与目标进度。
- **收益表现**：各区间的收益额、时间加权收益（TWR）、资金加权收益（XIRR）、年化与最大回撤；累计收益率 / 市值走势、资产构成走势；分红利息按月统计与来源。

**持仓**

- **资产**：持有中 / 已清仓切换、搜索、按账户和类别筛选；两种估值方式（数量 × 价格，或手动估值，适合保险现金价值、存款等）。已清仓视图展示累计投入、已实现收益与分红。
- **账户**：按券商、银行、保险公司、交易所等平台归集资产，查看各平台规模、占比与收益。
- **交易记录**：买入、卖出、存入/缴费、取出/赎回、分红/利息、更新估值。持仓、成本、收益与历史走势都由流水回放得出。外币交易记录成交汇率，浮动盈亏拆分为价格收益与汇率收益。支持 CSV 导出，以及先预览后确认的 CSV 导入（中英文表头、自动识别重复与超卖、可自动创建资产与账户）。

**分析**

- **配置与再平衡**：为每个类别设定目标比例与偏离容忍带（超配 / 低配 / 区间内），计算回到目标的买卖金额，支持「只用新资金买入」，并可一键复制方案。
- **穿透分析**：为基金 / ETF 录入成分股（可从 Excel 或基金季报粘贴），拆到底层个股与行业，与直接持仓合并，识别被重复持有、被放大的个股与行业，以及基金之间的重合度。
- **组合体检**：参考 Ghostfolio X-ray 与 Wealthfolio Health Center，按规则检查单一资产 / 个股 / 行业 / 账户 / 外币集中度、配置偏离、应急资金、交易费用率，以及估值过期、缺汇率、基金缺成分、缺行业等数据质量问题；所有阈值可调整。

**规划**

- **目标**：购房、教育、养老等目标，可指定用全部资产、某个类别或某个账户实现；按预期收益与每月投入推算到期金额（含悲观 / 乐观情景）、按时达成所需的每月投入，并标记按计划 / 有风险 / 落后。
- **FIRE 测算**：按月均支出与安全提取率计算财务自由目标、当前进度、预计达成时间与现在可持续的被动收入。

**其他**

- 登录（管理员通过命令行配置账号，不提供注册）、隐私模式（一键隐藏所有金额）、红涨绿跌 / 绿涨红跌、浅色 / 深色主题、JSON 备份导出与导入、示例数据。

## 快速部署（Docker Compose）

```bash
mkdir invest-insight && cd invest-insight
curl -O https://raw.githubusercontent.com/isudox/invest-insight/master/compose.yaml
curl -o .env https://raw.githubusercontent.com/isudox/invest-insight/master/.env.example
# 编辑 .env：至少修改 ADMIN_PASSWORD，按需调整 PUID / PGID / TZ
docker compose up -d
```

打开 `http://<服务器 IP>:8787`，用 `.env` 中的管理员账号登录。首次登录后可以删除 `.env` 里的 `ADMIN_PASSWORD`（只在还没有任何账号时生效）。

> 也可以在源码目录中把 `compose.yaml` 的 `image:` 改为 `build: .` 自行构建。

不用 Compose 时：

```bash
docker run -d --name invest-insight --restart unless-stopped \
  -p 8787:8787 -v "$PWD/data:/data" \
  -e TZ=Asia/Shanghai -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD='至少8位的密码' \
  ghcr.io/isudox/invest-insight:latest
```

### 平台提示

| 平台                   | 说明                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 群晖 DSM               | Container Manager → 项目 → 用 `compose.yaml` 创建。数据目录建议放在 `/volume1/docker/invest-insight/data`。`PUID` / `PGID` 可在 SSH 中执行 `id <用户名>` 查看（常见为 `1026` / `100`） |
| Unraid                 | 添加容器：镜像 `ghcr.io/isudox/invest-insight`，端口 8787，路径 `/data` → `/mnt/user/appdata/invest-insight`，`PUID=99`、`PGID=100`                                                    |
| 威联通 / 极空间 / 绿联 | 使用各自的 Docker 或 Compose 界面，挂载一个持久目录到 `/data` 即可                                                                                                                     |
| VPS                    | 建议只监听本机（`ports: ["127.0.0.1:8787:8787"]`），由 Caddy / Nginx 提供 HTTPS，见下文                                                                                                |

## 账号管理

系统不提供注册，账号由管理员在服务器上维护：

```bash
docker exec -it invest-insight ii user add <用户名>      # 新增账号，按提示输入两次密码（至少 8 位）
docker exec -it invest-insight ii user passwd <用户名>   # 重置密码，该账号已登录的会话立即失效
docker exec -it invest-insight ii user remove <用户名>   # 删除账号
docker exec -it invest-insight ii user list              # 查看账号与最近登录时间
```

- 所有账号看到的是同一份资产数据（适合个人或家庭共用）。
- 密码以 scrypt 加盐哈希保存；会话存放在 HttpOnly + SameSite=Lax Cookie 中，默认 7 天并自动续期。
- 同一 IP + 用户名 5 分钟内连续 5 次密码错误会锁定 5 分钟（重启后依然有效）。

## 配置项

全部通过环境变量设置（见 [.env.example](.env.example)）：

| 变量                                | 默认值          | 说明                                                                         |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| `TZ`                                | `Asia/Shanghai` | 时区，影响自动备份时间与日期计算                                             |
| `PUID` / `PGID`                     | `1000` / `1000` | 以该用户身份运行，`/data` 中文件归属与宿主机一致                             |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | –               | 首次启动且没有任何账号时创建管理员                                           |
| `BASE_URL`                          | –               | 对外访问地址，如 `https://invest.example.com`，用于来源校验与 Cookie Secure  |
| `TRUST_PROXY`                       | 关闭            | 位于反向代理之后时设为 `1`，信任 `X-Forwarded-*`                             |
| `BACKUP_CRON`                       | `0 3 * * *`     | 自动备份的 cron 表达式，`off` 关闭                                           |
| `BACKUP_KEEP`                       | `14`            | 自动备份保留份数                                                             |
| `SESSION_DAYS`                      | `7`             | 登录有效天数                                                                 |
| `LOG_LEVEL`                         | `info`          | 日志级别，日志以 JSON 输出到 stdout                                          |
| `PORT`                              | `8787`          | 容器内监听端口                                                               |
| `DEFAULT_LOCALE`                    | `zh-CN`         | 首次启动时默认资产类别的语言（`zh-CN` / `en`）；界面语言由用户在浏览器中选择 |

## 反向代理与 HTTPS

在公网访问时务必通过 HTTPS，并设置 `BASE_URL` 与 `TRUST_PROXY=1`。

**Caddy**

```
invest.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

**Nginx**

```nginx
server {
    listen 443 ssl http2;
    server_name invest.example.com;
    # ssl_certificate ...;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        client_max_body_size 20m;
    }
}
```

目前需要以独立域名（或子域名）访问，暂不支持挂在子路径下（如 `https://nas/invest/`）。

## 备份与恢复

所有数据都在挂载的 `/data` 目录中：

```
data/
├── invest-insight.db        # 数据库（SQLite，WAL 模式）
└── backups/                 # 数据库快照
```

- **自动备份**：按 `BACKUP_CRON` 定时生成快照，保留最近 `BACKUP_KEEP` 份。
- **升级前备份**：新版本需要迁移数据库结构时，迁移前自动生成 `*-pre-migration.db`，迁移失败则拒绝启动。
- **导入 / 清空前备份**：在网页中导入 JSON、加载示例数据、清空数据前自动生成快照。
- **手动**：「设置 → 数据库快照 → 立即备份」，或 `docker exec invest-insight ii backup create`；快照可在网页中直接下载。
- **JSON 导出**：「设置 → 导出备份」，可跨版本导入。
- **CSV**：「交易记录 → 导出 CSV」导出全部流水（UTF-8 带 BOM，Excel 可直接打开）；「导入 CSV」先预览再写入，写入前自动生成快照。

恢复某个快照：

```bash
docker compose stop
docker compose run --rm invest-insight ii backup list
docker compose run --rm invest-insight ii backup restore <文件名>   # 会先为当前数据库再做一份快照
docker compose start
```

也可以把 `data/` 整个目录纳入 restic、Hyper Backup 等备份工具（建议备份 `backups/` 中的快照文件，而不是正在写入的数据库文件）。

## 升级

```bash
docker compose pull && docker compose up -d
```

启动时会自动执行数据库迁移（迁移前自动备份）。从早期原型版本升级时，会自动识别旧数据库、整份备份为 `*-legacy.db` 后导入新结构，升级后需要重新登录。

## 健康检查与日志

- `GET /healthz` 无需登录，返回 `{"status":"ok"}`，镜像已配置 Docker `HEALTHCHECK`，也可接入 Uptime Kuma。
- 日志为单行 JSON，`docker logs invest-insight` 查看，可直接被 Loki 等收集。

## 本地开发

需要 Node.js ≥ 22 与 pnpm ≥ 10。

```bash
pnpm install
pnpm user add admin        # 创建本地账号（数据位于 ./data）
pnpm dev                   # 前端 http://localhost:5173，后端 http://127.0.0.1:8787
```

常用命令：

| 命令                                           | 作用                                               |
| ---------------------------------------------- | -------------------------------------------------- |
| `pnpm test`                                    | 运行单元与接口测试（Vitest）                       |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | 类型检查 / ESLint / Prettier                       |
| `pnpm build && pnpm start`                     | 构建并以生产模式运行（后端同时托管前端）           |
| `pnpm db:generate`                             | 修改 `apps/server/src/db/schema.ts` 后生成迁移文件 |
| `docker build -t invest-insight .`             | 本地构建镜像                                       |

## 多语言

- 界面语言保存在浏览器中（设置 → 显示偏好 → 语言，登录页也可切换），默认跟随浏览器语言。
- 前端文案位于 `apps/web/src/i18n/`：`zh-CN.ts` 为基准，其他语言文件必须提供完全相同的键，缺少或多出的键都会导致类型检查失败。
- 服务端返回的错误信息、组合体检规则与目标范围名称按请求头 `X-Locale`（前端自动携带）或 `Accept-Language` 返回对应语言，文案位于 `apps/server/src/i18n.ts`。
- 新增语言：复制 `en.ts` 翻译后在 `i18n/index.ts` 的 `LANGUAGES` 中登记，并在服务端 `i18n.ts` 补充对应字典。
- 资产类别、资产名称等用户数据不会随语言切换而改变；英文界面下加载的示例数据为英文。

## 技术栈与目录

| 层     | 选型                                                                   |
| ------ | ---------------------------------------------------------------------- |
| 运行时 | Node.js 24（TypeScript），单进程提供 API、静态页面与定时任务           |
| 服务端 | Hono、Zod、Drizzle ORM + better-sqlite3、decimal.js、croner、pino      |
| 前端   | React 19、Vite、React Router、Recharts、react-i18next、vite-plugin-pwa |
| 工程   | pnpm workspaces、Vitest、ESLint、Prettier、GitHub Actions、Renovate    |

```
apps/server/            后端
  src/config.ts           环境变量解析
  src/db/                 表结构、迁移、旧版数据导入、备份
  src/domain/             账本（十进制）、持仓、收益、穿透、体检、规划、账号
  src/http/               Hono 应用、安全中间件、路由
  src/cli.ts              管理命令（ii）
  drizzle/                版本化迁移 SQL
  test/                   Vitest 测试
apps/web/               前端（React + Vite）
packages/shared/        前后端共用的 Zod 校验规则与类型
docker/                 容器入口脚本与 ii 命令
```

## 计算口径

- 成本采用移动加权平均；卖出时按均价结转成本，差额计入已实现收益。
- 累计收益 = 浮动盈亏 + 已实现收益 + 分红利息；收益率 = 累计收益 / 累计投入。
- 汇率：每笔外币交易记录成交汇率（1 单位资产币种 = ? 基准币种）。成本、已实现收益、分红与资金流按成交汇率折算；当前市值按「设置」中的当前汇率折算。
  - 浮动盈亏 = 价格收益 + 汇率收益：价格收益 = (原币市值 − 原币成本) × 当前汇率；汇率收益 = 原币成本 × 当前汇率 − 按成交汇率折算的成本。
  - 历史走势中外币资产按「截至当日最近一次记录的成交汇率」估值，当天按当前汇率。
  - 升级前已存在的外币交易没有成交汇率，暂按当前汇率估算，组合体检会列出这些交易；在交易记录中编辑补上汇率即可。更换基准币种后，旧的成交汇率不再适用，同样按当前汇率估算。
- 收益表现：外部资金流 = 买入、存入（流入）与卖出、取出、分红利息到账（流出）。TWR 按日链接收益率；XIRR 以期初市值为投入、期末市值为回收求解；不足一年的区间不做年化。
- 目标与 FIRE：按月复利、每月末投入，收益率为常数，未计通胀与税费。
- 穿透分析：基金对某只个股的敞口 = 基金市值 × 该成分权重。个股按代码匹配（600519、600519.SH、SH600519 视为同一只；0700.HK、HK00700 与 00700 视为同一只），没有代码时按名称匹配。成分权重需手动维护，建议每季度随基金定期报告更新。
- 交易流水中的数量、价格、金额与费用以十进制字符串存储，持仓回放使用 decimal.js 计算，避免多次买卖后累积浮点误差；汇总与展示阶段再转换为普通数字。
