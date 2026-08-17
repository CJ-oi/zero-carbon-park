from __future__ import annotations

import html
import json
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from .utils import html_page, iso_now, markdown_table, parse_date, write_json


def _select_window(records: list[dict[str, Any]], days: int, limit: int) -> list[dict[str, Any]]:
    valid_dates = [parse_date(r.get("published_date"), fallback="") for r in records]
    latest = max((d for d in valid_dates if d), default=date.today().isoformat())
    cutoff = (date.fromisoformat(latest) - timedelta(days=days - 1)).isoformat()
    selected = [r for r in records if parse_date(r.get("published_date"), fallback="") >= cutoff]
    return sorted(selected, key=lambda r: (r.get("published_date", ""), r.get("title", "")), reverse=True)[:limit]


def daily_payload(records: list[dict[str, Any]]) -> dict[str, Any]:
    rows = _select_window(records, 1, 12)
    if len(rows) < 5:
        rows = _select_window(records, 7, 12)
    return {
        "report_type": "daily",
        "generated_at": iso_now(),
        "report_date": max((r.get("published_date", "") for r in rows), default=date.today().isoformat()),
        "record_count": len(rows),
        "records": rows,
        "note": "按公开来源和政策相关性整理。涉及投资、排放和绩效的判断应回到原文与园区台账。",
    }


def weekly_payload(records: list[dict[str, Any]]) -> dict[str, Any]:
    rows = _select_window(records, 7, 40)
    topics = Counter(r.get("topic") or "未分类" for r in rows)
    sources = Counter(r.get("publisher") or r.get("source_name") or "未知来源" for r in rows)
    latest = max((r.get("published_date", "") for r in rows), default=date.today().isoformat())
    return {
        "report_type": "weekly",
        "generated_at": iso_now(),
        "report_date": latest,
        "record_count": len(rows),
        "records": rows,
        "topic_counts": dict(topics.most_common()),
        "source_counts": dict(sources.most_common()),
        "note": "周报反映公开信息样本，不等同于园区绩效统计。",
    }


def intelligence_markdown(payload: dict[str, Any], title: str) -> str:
    lines = [f"# {title}", "", f"- 报告日期：{payload.get('report_date')}", f"- 生成时间：{payload.get('generated_at')}", f"- 记录数：{payload.get('record_count')}", "", f"> {payload.get('note', '')}", ""]
    if payload.get("topic_counts"):
        lines.extend(["## 本周主题结构", "", markdown_table(["主题", "记录数"], [[k, v] for k, v in payload["topic_counts"].items()]), ""])
    lines.append("## 重点记录")
    for index, row in enumerate(payload.get("records", []), 1):
        lines.extend([
            "", f"### {index}. {row.get('title', '未命名记录')}", "",
            f"- 日期：{row.get('published_date', '—')}",
            f"- 主题：{row.get('topic', '—')}",
            f"- 来源：{row.get('publisher') or row.get('source_name') or '—'}",
            f"- 摘要：{row.get('summary', '')}",
            f"- 用途边界：{row.get('why', '')}",
            f"- 原文：{row.get('url', '')}",
        ])
    lines.extend(["", "## 使用说明", "", "公开记录用于发现政策、园区实践和技术线索。正式核算、排名和投资决策必须使用同边界、同年度、可追溯的园区数据。", ""])
    return "\n".join(lines)


def intelligence_html(payload: dict[str, Any], title: str) -> str:
    cards = []
    for row in payload.get("records", []):
        cards.append(f"""<article class=\"card\"><div class=\"meta\">{html.escape(str(row.get('published_date','—')))} · {html.escape(str(row.get('topic','—')))} · {html.escape(str(row.get('publisher') or row.get('source_name') or '—'))}</div><h3>{html.escape(str(row.get('title','未命名记录')))}</h3><p>{html.escape(str(row.get('summary','')))}</p><p><strong>用途边界：</strong>{html.escape(str(row.get('why','')))}</p><p><a href=\"{html.escape(str(row.get('url','')))}\" target=\"_blank\" rel=\"noopener\">查看原文 ↗</a></p></article>""")
    topics = ""
    if payload.get("topic_counts"):
        topics = "<h2>主题结构</h2><table><tr><th>主题</th><th>记录数</th></tr>" + "".join(f"<tr><td>{html.escape(k)}</td><td>{v}</td></tr>" for k, v in payload["topic_counts"].items()) + "</table>"
    body = f"""<p><a href=\"../index.html#reports\">← 返回平台</a></p><h1>{html.escape(title)}</h1><p class=\"meta\">报告日期：{html.escape(str(payload.get('report_date')))}　生成时间：{html.escape(str(payload.get('generated_at')))}　记录数：{payload.get('record_count')}</p><div class=\"card\">{html.escape(str(payload.get('note','')))}</div>{topics}<h2>重点记录</h2>{''.join(cards)}<h2>使用边界</h2><p>公开记录用于发现政策、园区实践和技术线索。正式核算、排名和投资决策必须使用同边界、同年度、可追溯的园区数据。</p>"""
    return html_page(title, body, description="零碳园区公开信息自动报告")


def feasibility_markdown(result: dict[str, Any]) -> str:
    lines = [
        f"# {result.get('park_name','园区')}零碳建设可行性初筛报告",
        "", f"- 基准年：{result.get('baseline_year') or '待确认'}",
        f"- 生成模式：{'正式初筛' if result.get('mode') == 'formal' else '数据补齐'}",
        f"- 结论：{result.get('feasibility',{}).get('conclusion','—')}", "",
        "> 本报告用于前期筛查和项目排序，不替代节能审查、环评、接入系统审查、工程可研或投资决策。", "",
    ]
    for question, content in result.get("five_questions", {}).items():
        lines.extend([f"## {question}", "", content.get("answer", ""), ""])
        if content.get("tasks"):
            lines.append(markdown_table(["字段", "责任部门", "最低材料", "建议时限"], [[t.get("name"), t.get("owner"), t.get("minimum_material"), t.get("due")] for t in content["tasks"]]))
            lines.append("")
        if content.get("rows"):
            lines.append(markdown_table(["指标", "现状", "目标", "差距", "状态"], [[r.get("metric"), r.get("current"), r.get("target"), r.get("gap"), r.get("status")] for r in content["rows"]]))
            lines.append("")
        if content.get("measures"):
            lines.append(markdown_table(["类型", "措施", "适用对象", "关键输入", "约束"], [[m.get("category"), m.get("measure"), m.get("applicable"), m.get("inputs"), m.get("constraints")] for m in content["measures"][:12]]))
            lines.append("")
        portfolio = content.get("portfolio")
        if portfolio:
            lines.extend([
                f"- 预算：{portfolio.get('budget_10k_cny',0):,.2f} 万元",
                f"- 入选投资：{portfolio.get('capex_10k_cny',0):,.2f} 万元",
                f"- 年减排：{portfolio.get('annual_abatement_tco2',0):,.2f} tCO₂",
                f"- 年净收益：{portfolio.get('annual_net_benefit_10k_cny',0):,.2f} 万元",
                f"- 目标缺口：{portfolio.get('target_gap_tco2',0):,.2f} tCO₂/年", "",
            ])
            lines.append(markdown_table(["项目", "投资/万元", "年减排/tCO₂", "年净收益/万元", "回收期/年", "参数证据"], [[p.get("name"), p.get("capex_10k_cny"), p.get("annual_abatement_tco2"), p.get("annual_net_benefit_10k_cny"), p.get("simple_payback_years"), p.get("evidence_level")] for p in portfolio.get("selected_projects", [])]))
            lines.append("")
    lines.extend(["## 关键风险", "", markdown_table(["维度", "等级", "发现", "建议动作"], [[r.get("dimension"), r.get("level"), r.get("finding"), r.get("action")] for r in result.get("feasibility", {}).get("risks", [])]), ""])
    return "\n".join(lines)


def feasibility_html(result: dict[str, Any]) -> str:
    question_sections = []
    for question, content in result.get("five_questions", {}).items():
        inner = f"<p>{html.escape(str(content.get('answer','')))}</p>"
        if content.get("tasks"):
            inner += "<table><tr><th>字段</th><th>责任部门</th><th>最低材料</th><th>时限</th></tr>" + "".join(f"<tr><td>{html.escape(str(t.get('name','')))}</td><td>{html.escape(str(t.get('owner','')))}</td><td>{html.escape(str(t.get('minimum_material','')))}</td><td>{html.escape(str(t.get('due','')))}</td></tr>" for t in content["tasks"]) + "</table>"
        if content.get("rows"):
            inner += "<table><tr><th>指标</th><th>现状</th><th>目标</th><th>差距</th><th>状态</th></tr>" + "".join(f"<tr><td>{html.escape(str(r.get('metric','')))}</td><td>{html.escape(str(r.get('current','—')))}</td><td>{html.escape(str(r.get('target','—')))}</td><td>{html.escape(str(r.get('gap','—')))}</td><td>{html.escape(str(r.get('status','')))}</td></tr>" for r in content["rows"]) + "</table>"
        if content.get("measures"):
            inner += "<table><tr><th>类型</th><th>措施</th><th>适用对象</th><th>约束</th></tr>" + "".join(f"<tr><td>{html.escape(str(m.get('category','')))}</td><td>{html.escape(str(m.get('measure','')))}</td><td>{html.escape(str(m.get('applicable','')))}</td><td>{html.escape(str(m.get('constraints','')))}</td></tr>" for m in content["measures"][:12]) + "</table>"
        portfolio = content.get("portfolio")
        if portfolio:
            inner += f"<div class=\"card\"><strong>入选投资：</strong>{portfolio.get('capex_10k_cny',0):,.2f}万元　<strong>年减排：</strong>{portfolio.get('annual_abatement_tco2',0):,.2f}tCO₂　<strong>目标缺口：</strong>{portfolio.get('target_gap_tco2',0):,.2f}tCO₂/年</div>"
            inner += "<table><tr><th>项目</th><th>投资/万元</th><th>年减排/tCO₂</th><th>年净收益/万元</th><th>参数证据</th></tr>" + "".join(f"<tr><td>{html.escape(str(p.get('name','')))}</td><td>{p.get('capex_10k_cny')}</td><td>{p.get('annual_abatement_tco2')}</td><td>{p.get('annual_net_benefit_10k_cny')}</td><td>{html.escape(str(p.get('evidence_level','')))}</td></tr>" for p in portfolio.get("selected_projects", [])) + "</table>"
        question_sections.append(f"<h2>{html.escape(question)}</h2>{inner}")
    risks = "<table><tr><th>维度</th><th>等级</th><th>发现</th><th>建议动作</th></tr>" + "".join(f"<tr><td>{html.escape(str(r.get('dimension','')))}</td><td>{html.escape(str(r.get('level','')))}</td><td>{html.escape(str(r.get('finding','')))}</td><td>{html.escape(str(r.get('action','')))}</td></tr>" for r in result.get("feasibility", {}).get("risks", [])) + "</table>"
    body = f"""<p><a href=\"../index.html#feasibility\">← 返回平台</a></p><h1>{html.escape(str(result.get('park_name','园区')))}零碳建设可行性初筛报告</h1><p class=\"meta\">基准年：{html.escape(str(result.get('baseline_year') or '待确认'))}</p><div class=\"card\"><strong>结论：</strong>{html.escape(str(result.get('feasibility',{}).get('conclusion','—')))}<br>{html.escape(str(result.get('feasibility',{}).get('decision_boundary','')))}</div>{''.join(question_sections)}<h2>关键风险</h2>{risks}"""
    return html_page(f"{result.get('park_name','园区')}可行性初筛报告", body, description="零碳园区可行性初筛报告")


def write_intelligence_reports(records: list[dict[str, Any]], output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    daily = daily_payload(records)
    weekly = weekly_payload(records)
    files = []
    for kind, payload, title in (("daily", daily, "零碳园区公开信息日报"), ("weekly", weekly, "零碳园区公开信息周报")):
        stem = f"{kind}-{payload['report_date']}"
        json_path = output_dir / f"{stem}.json"
        md_path = output_dir / f"{stem}.md"
        html_path = output_dir / f"{stem}.html"
        write_json(json_path, payload)
        md_path.write_text(intelligence_markdown(payload, title), encoding="utf-8")
        html_path.write_text(intelligence_html(payload, title), encoding="utf-8")
        for alias, content in ((output_dir / f"{kind}-latest.json", json_path.read_text(encoding="utf-8")), (output_dir / f"{kind}-latest.md", md_path.read_text(encoding="utf-8")), (output_dir / f"{kind}-latest.html", html_path.read_text(encoding="utf-8"))):
            alias.write_text(content, encoding="utf-8")
        files.append({"type": kind, "date": payload["report_date"], "html": f"reports/{kind}-latest.html", "markdown": f"reports/{kind}-latest.md", "json": f"reports/{kind}-latest.json", "record_count": payload["record_count"]})
    return {"generated_at": iso_now(), "reports": files}


def write_feasibility_report(result: dict[str, Any], output_dir: Path, stem: str = "feasibility-latest") -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{stem}.json"
    md_path = output_dir / f"{stem}.md"
    html_path = output_dir / f"{stem}.html"
    write_json(json_path, result)
    md_path.write_text(feasibility_markdown(result), encoding="utf-8")
    html_path.write_text(feasibility_html(result), encoding="utf-8")
    return {"json": str(json_path), "markdown": str(md_path), "html": str(html_path)}
