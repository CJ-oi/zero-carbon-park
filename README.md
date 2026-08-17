# 园区碳观察

面向经济技术开发区的零碳园区公开数据、自动报告与项目可行性分析网站。

本仓库不是单个静态 HTML 文件，而是一套可持续运行的公开网站源码，包含公开来源采集、来源健康管理、规范 URL 去重、滚动档案、园区数据库、自动日报与周报、数据门槛、国家指标差距、减排设施指南、成本效益项目组合、静态站点导出、自动测试和 GitHub Pages 发布流程。

## 网站回答五个问题

1. **数据够不够**：核对边界、企业清单、基准年、能源、排放、经济与项目参数；不足时生成补数任务。
2. **现状是什么**：形成园区资料画像、利益相关方视角和结构相似园区，不把结构相似度写成绩效排名。
3. **差距在哪里**：数据门槛通过后，按国家级零碳园区试行指标体系计算现状值、目标值和差距。
4. **怎么减**：把 66 项措施分为无悔型、条件型和战略型；绿电直连只在源荷、网架、计量、结算和责任条件完整时进入专项可研。
5. **花多少钱**：在预算、目标和项目参数约束下形成 0—1 项目组合，输出投资、减排、净收益、边际减排成本、利益相关方和年度路径。

## 数据资产

- 67 个国内园区；
- 12 个国际参考案例；
- 50 项数据准备字段；
- 66 项减排设施指南；
- 15 条政策与核算规则；
- 经规范 URL 去重的滚动公开记录，最多保留 100000 条；
- 来源健康、失败次数、隔离与复测记录；
- 可复现的示范可行性场景。

公开信息用于发现政策、园区实践和技术线索。正式核算必须使用同一园区边界、同一年度、可追溯的活动数据和原始材料。建设名单不等同于达标排名。

## 本地运行

需要 Python 3.11 或更高版本，无第三方运行依赖。

Windows：

```powershell
.\run.ps1
```

macOS / Linux：

```bash
./run.sh
```

随后打开 `http://127.0.0.1:8765`。

也可手动执行：

```bash
python -m pip install -e .
zcpark init
zcpark build --output site --feasibility-input data/assessments/example.json
zcpark validate --site site
zcpark serve --site site
```

## 自动更新

```bash
zcpark sync
zcpark build --output site --feasibility-input data/assessments/example.json
```

采集器只访问正常公开页面，不绕过登录、付费墙、验证码、robots.txt、限流或其他技术措施。单一来源失败会写入 `data/source_health.json`，不会删除已有档案，也不会阻断其他来源。连续失败 3 次进入观察，7 次进入隔离，7 天后自动复测。

## 自动报告

构建时自动生成：

- `site/reports/daily-latest.html|md|json`
- `site/reports/weekly-latest.html|md|json`
- `site/reports/feasibility-latest.html|md|json`

网页中的可行性工作台也能在浏览器内生成 Markdown 报告。正式项目可通过 JSON 场景调用：

```bash
zcpark feasibility \
  --input data/assessments/example.json \
  --output outputs/feasibility_result.json
```

## GitHub Pages 发布

仓库已包含 `.github/workflows/pages.yml`：

- 推送到 `main` 后自动测试并发布；
- 每 6 小时检查公开来源、合并档案、重建报告和网站；
- 质量门禁失败时停止部署，保留上一版成功网站；
- 档案、来源健康和同步日志由工作流提交回仓库，用于下一次增量更新；
- 支持在 Actions 页面手动触发。

具体步骤见 [PUBLISH.md](PUBLISH.md)；其他托管方式和自定义域名见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 目录

```text
.github/                 GitHub Pages、定时更新和问题模板
config/                  来源、网站和可行性字段配置
data/                    园区数据、滚动档案、来源健康和示范场景
docs/                    用户手册、技术设计、数据治理和可行性方法
src/park_observer/       采集、归档、核算、优化、报告和静态导出代码
static/                  网站界面源文件
site/                    构建后的可部署网站
tests/                   离线单元测试
```

## 许可证

- 代码：MIT License；
- 用户提供和汇编的数据：见 [DATA_LICENSE.md](DATA_LICENSE.md)；
- 第三方公开页面内容的版权和使用条件仍归原权利人所有，仓库只保存链接、必要元数据和短摘要。
