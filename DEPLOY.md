# 部署清单 — Phase 1+2+3 优化上线

> 一次性把 6 个新页面 + 多语言 + 埋点 + 重写页一起推上线

## 一、上线前 5 分钟自检

### A. 环境变量（在 Cloudflare Pages → Settings → Environment Variables 配置）

| Key | 来源 | 必需 |
|---|---|---|
| `PUBLIC_GA4_ID` | analytics.google.com → Admin → Data Streams → Web Stream 的 Measurement ID（G-XXXXXXXXXX） | 是 |
| `PUBLIC_CF_ANALYTICS_TOKEN` | dash.cloudflare.com → Analytics → Web Analytics → 选 scientificcalc.org → JS snippet 里的 token | 是 |

> 没配的话埋点不报，但站点正常工作。

### B. 本地预演

```bash
cd /Users/family/Desktop/github/scientific-calculator-online
nvm use 22 && npm run build
nvm use 20  # CF Pages CLI 用 20，避免 TLS 报错
CLOUDFLARE_ACCOUNT_ID=743b7aaed67a5d2f64b481e58e81f695 \
  npx wrangler pages deploy dist \
  --project-name scientific-calculator-online \
  --branch main --commit-dirty
```

## 二、上线后立刻做的 5 件事

1. **GSC 重新提交 sitemap**
   - https://search.google.com/search-console
   - Sitemaps → 提交 `https://scientificcalc.org/sitemap-index.xml`（已存在不变，但需再次提交触发抓取）

2. **6 个新页面 Request Indexing**（每条 ~30 秒）
   - `https://scientificcalc.org/ti-30xa/`
   - `https://scientificcalc.org/ti-30xiis/`
   - `https://scientificcalc.org/ti-nspire/`
   - `https://scientificcalc.org/ti-30x-multiview/`
   - `https://scientificcalc.org/fr/ti-85/`
   - `https://scientificcalc.org/es/ti-30xs/`

3. **GSC 检查 hreflang**
   - GSC → Settings → International Targeting（如果可用）
   - 或用 Rich Results Test 验证 `/ti-85/` 应能看到 fr 备用

4. **验证 GA4 实时报告**
   - Open scientificcalc.org → 触发几个按键
   - GA4 → Realtime → 应看到 `page_view`、`calc_keypress`、`mode_change`

5. **Rich Results Test 抽检 3 个新页面**
   - https://search.google.com/test/rich-results
   - 验证 SoftwareApplication / BreadcrumbList / FAQPage / HowTo 全部识别

## 三、监测节点（拿出来对照）

| 时间 | 检查项 | 目标 | 失败时的应对 |
|---|---|---|---|
| T+24h | 新页面在 GSC 显示 "已抓取，已索引" | ≥4/6 | 用 URL Inspection → Request Indexing 重提 |
| T+7d | `/ti-84/` 平均位次 | < 50（从 62） | 否 → 加 +1500 字深度内容 |
| T+7d | 27 个 4-10 位词 CTR | ≥1% | 否 → 二次调整 Title 加 emoji 数字 |
| T+14d | `/ti-30xa/`、`/ti-nspire/` 首词出现 | 任一词被收录 | 否 → 主动 Request Indexing |
| T+14d | `/fr/ti-85/` 在 GSC 国家 = 法国出现 | 至少 1 imp | 否 → 检查 hreflang + lang 是否生效 |
| T+30d | 整站月点击 | 40-80 | 否 → 重新评估 |
| T+30d | 整站月展示 | 4000-6000 | 否 → 加快第二批内容 |

## 四、Phase 4 后续待办（这次没做）

> 留给下一波

- [ ] 全站 `/fr/` 主页 + `/es/` 主页（让多语言不止单页）
- [ ] 多语言全部 6 个计算器型号页（先做高 ROI 的 fr/ti-30xs、es/ti-85）
- [ ] /fraction-calculator/、/percentage-calculator/、/scientific-notation-calculator/ 工具页
- [ ] 5 篇互动教程（fractions, exponents, stats, table, trig）
- [ ] 外链建设：GitHub repo README、Reddit r/HomeworkHelp、r/SAT、r/GED 友善植入
- [ ] AdSense 申请（30 天数据稳定后）

## 五、变更摘要

### 新增文件

```
src/
├── components/
│   ├── analytics/
│   │   ├── Analytics.astro       # GA4 + CF + 内联事件
│   │   └── track.ts              # 类型化事件 API
│   └── CalculatorHub.astro       # 顶部 hub 卡片
├── calculators/
│   ├── ti-30xa.ts
│   ├── ti-30xiis.ts
│   └── ti-nspire.ts
└── pages/
    ├── ti-30xa.astro
    ├── ti-30xiis.astro
    ├── ti-nspire.astro
    ├── ti-30x-multiview.astro
    ├── fr/
    │   └── ti-85.astro
    └── es/
        └── ti-30xs.astro
```

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/layouts/BaseLayout.astro` | 加 Analytics、hreflang 支持、lang 动态、footer 加多语言切换 |
| `src/pages/index.astro` | 加 CalculatorHub、Title/Description CTR 化、hreflang alternates |
| `src/pages/ti-85.astro` | 加 hub、BreadcrumbList、hreflang fr、Title 优化 |
| `src/pages/ti-84.astro` | 彻底重写（pos 62→25 目标）+ HowTo + 8 FAQ |
| `src/pages/calculators.astro` | 升级到 6 张卡片，加 BreadcrumbList |
| `src/components/calculator/Calculator.tsx` | calc_keypress / mode_change / result_copy 事件 + 复制按钮 |
| `src/calculators/index.ts` | 注册 3 个新型号 |
| `.env.example` | 文档化 PUBLIC_GA4_ID + PUBLIC_CF_ANALYTICS_TOKEN |
| `.gitignore` | 加 .env / .wrangler |

### 数据文件

| 文件 | 内容 |
|---|---|
| `SEO_OPTIMIZATION_PLAN.md` | 完整策略文档，含 GSC 诊断 + 词族分析 + 路线图 + 监测节点 |
| `DEPLOY.md` | 本文件 |
| `/tmp/gsc_analysis/` | 7 个 sheet 的 CSV |
| `/tmp/gsc_top_low_hanging.txt` | 词族聚合 + 低悬果实清单 |

## 六、回滚方案

如果任何页面出问题：

```bash
# 拉前一次部署
nvm use 20
npx wrangler pages deployment list --project-name scientific-calculator-online
# 找到上一个 deployment ID
npx wrangler pages deployment rollback <id>
```

或在 Cloudflare Pages Dashboard → Deployments → 上一次 → Rollback to this deployment。
