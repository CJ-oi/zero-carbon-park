# 公开发布操作说明

本仓库已经包含网站源码、公开数据、自动报告、可行性分析、离线测试和 GitHub Pages 工作流。公开发布只需要完成一次仓库创建和推送，之后由定时任务自动检查来源、合并档案、重建报告并发布。

## 一、最简发布方法

1. 在 GitHub 新建一个**公开仓库**，仓库名可用 `zero-carbon-park-observatory`。
2. 不要勾选自动创建 README、许可证或 `.gitignore`，避免与本目录已有文件冲突。
3. 在本目录打开终端，执行下列命令。把示例地址替换为新仓库地址。

```bash
git init
git add .
git commit -m "Initial public release"
git branch -M main
git remote add origin https://github.com/你的账号/zero-carbon-park-observatory.git
git push -u origin main
```

4. 打开仓库 `Settings → Pages`，将 `Source` 设为 **GitHub Actions**。
5. 打开 `Actions`，手动运行一次“更新并发布园区碳观察”。首次部署完成后，Pages 页面会给出公开网址。

## 二、脚本发布

Windows PowerShell：

```powershell
.\publish_to_github.ps1 -RepositoryUrl "https://github.com/你的账号/zero-carbon-park-observatory.git"
```

macOS / Linux：

```bash
./publish_to_github.sh "https://github.com/你的账号/zero-carbon-park-observatory.git"
```

脚本只执行本地 Git 初始化、提交和推送，不保存账号密码或令牌。身份验证由本机 Git 或浏览器完成。

## 三、自动更新机制

`.github/workflows/pages.yml` 默认：

- 推送到 `main` 时构建并发布；
- 每 6 小时检查一次公开来源；
- 执行规范 URL 去重、内容版本记录和来源健康更新；
- 自动生成日报、周报和示范可行性分析报告；
- 运行 Python 测试、页面文件检查和 JavaScript 语法检查；
- 质量门禁失败时停止部署，上一版成功网站继续保留；
- 将滚动档案、来源健康和同步日志提交回仓库，供下一次增量更新使用。

GitHub Actions 定时任务属于周期性更新，不是秒级数据流。对政策、园区公告和项目招标等公开信息，每 6 小时检查一次通常已足够。公开仓库若连续 60 天没有任何活动，GitHub 可能暂停定时工作流；恢复时在 Actions 页面重新启用并手动运行一次即可。

## 四、发布前可修改项

- 网站名称和说明：`config/site.json`
- 公开来源：`config/sources.json`
- 园区数据库：`data/park_catalog.csv`
- 数据字段：`data/required_data_fields.csv`
- 减排设施：`data/technology_guidance.csv`
- 国家指标与规则：`data/standard_rules.csv`
- 自定义域名：在 `static/CNAME` 写入域名

## 五、验证命令

```bash
python -m pip install -e .
zcpark init
python -m unittest discover -s tests -v
zcpark build --output site --feasibility-input data/assessments/example.json
zcpark validate --site site
node --check static/app.js
```

全部通过后，将 `site/` 作为 Pages 产物发布。
