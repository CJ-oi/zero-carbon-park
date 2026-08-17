(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const fmt = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const state = {
    data: null,
    archive: [],
    reportIndex: { reports: [] },
    mapFilter: "全国",
    selectedPark: null,
    updateTopic: "全部",
    updateLimit: 9,
    selectedFields: new Set(loadStored("zcp_checked_fields", [])),
    tasks: [],
    lens: "管委会",
    gapRows: [],
    selectedMeasures: new Set(),
    dbLimit: 25,
    dbRows: [],
    projects: [],
    lastFeasibility: null,
  };

  const stakeholderLenses = {
    "管委会": ["确认法定建设边界和企业清单", "建立跨部门数据责任表", "以项目台账跟踪年度目标、投资和验收"],
    "园区企业": ["优先推进计量、设备效率和工艺优化", "提供同年度能源与排放活动数据", "明确项目投资、节省和生产影响"],
    "能源运营": ["形成电、热、冷、气和可再生能源平衡", "核对负荷曲线、网架和可靠性", "明确计量结算、交易和运行责任"],
    "公共设施": ["核查污水、再生水、蒸汽和固废协同", "识别可共享的余热余压和资源流", "建立节能量测量与验证边界"],
    "监管评估": ["核对指标适用性、统计边界和因子版本", "区分建设名单、过程监测和验收结论", "保留原始材料、复核记录和版本差异"],
    "研究评估": ["公开数据只用于结构比较和假设提出", "不以采集频次代替绩效", "对不确定参数开展敏感性分析"],
  };

  const noRegretTerms = ["计量", "能碳管理", "电机", "泵", "风机", "空压", "蒸汽", "凝结水", "余热", "水回用", "维护", "工业共生"];
  const conditionalTerms = ["光伏", "绿电", "储能", "微电网", "热泵", "电锅炉", "电窑炉", "氢"];

  function loadStored(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }
  function saveStored(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage is optional */ }
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }
  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
  }
  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
    const blob = new Blob(["\ufeff", text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(`已生成 ${filename}`);
  }
  function downloadCsv(filename, headers, rows) {
    const text = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
    downloadText(filename, text, "text/csv;charset=utf-8");
  }
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i], next = text[i + 1];
      if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i++;
        row.push(cell); cell = "";
        if (row.some(v => v.trim())) rows.push(row);
        row = [];
      } else cell += char;
    }
    row.push(cell);
    if (row.some(v => v.trim())) rows.push(row);
    return rows;
  }
  function n(value, fallback = null) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }
  function fieldValue(id) {
    const el = $("#" + id);
    return el ? n(el.value, null) : null;
  }
  function priorityClass(value) {
    const text = String(value || "P2");
    if (text.startsWith("P0")) return "P0";
    if (text.startsWith("P1")) return "P1";
    return "P2";
  }
  function measureType(row) {
    const text = [row["一级方向"], row["二级措施"], row["对象/工艺"], row["主要约束"], row["备注"]].join(" ");
    if (conditionalTerms.some(term => text.includes(term))) return "条件型";
    if (noRegretTerms.some(term => text.includes(term))) return "无悔型";
    return "战略型";
  }

  async function loadData() {
    const [dashboardResponse, archiveResponse, reportsResponse] = await Promise.all([
      fetch("data/dashboard.json", { cache: "no-store" }),
      fetch("data/archive.json", { cache: "no-store" }),
      fetch("data/report_index.json", { cache: "no-store" }),
    ]);
    if (!dashboardResponse.ok) throw new Error(`dashboard.json ${dashboardResponse.status}`);
    state.data = await dashboardResponse.json();
    state.archive = archiveResponse.ok ? await archiveResponse.json() : state.data.updates || [];
    state.reportIndex = reportsResponse.ok ? await reportsResponse.json() : { reports: [] };
    state.data.updates = state.archive;
  }

  function initMeta() {
    const meta = state.data.meta;
    $("#dataVersion").textContent = meta.latest_record_date || meta.data_version || "—";
    $("#footerVersion").textContent = meta.latest_record_date || meta.data_version || "—";
    $("#updateSchedule").textContent = `网站数据生成于 ${String(meta.generated_at || "—").replace("T", " ").slice(0, 19)}；公开来源由定时任务周期检查。`;
    const c = meta.counts;
    const kpis = [
      ["国内园区", c.domestic_parks], ["国际案例", c.international_cases],
      ["滚动公开记录", c.archive_records], ["数据字段", c.required_fields],
      ["减排设施", c.technology_measures], ["正式核算园区", c.formal_accounting_ready],
    ];
    $("#kpiGrid").innerHTML = kpis.map(([label, value]) => `<div class="kpi"><strong>${fmt.format(value || 0)}</strong><span>${escapeHtml(label)}</span></div>`).join("");
    configureIssueLink();
  }

  function configureIssueLink() {
    const link = $("#issueLink");
    const host = location.hostname;
    const parts = location.pathname.split("/").filter(Boolean);
    if (host.endsWith("github.io") && parts.length) {
      const owner = host.split(".")[0];
      link.href = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(parts[0])}/issues/new/choose`;
    } else {
      link.href = "docs/user-manual.html#data-correction";
      link.target = "_self";
    }
  }

  // Map
  function mapCoordinates(park, globalMode) {
    if (globalMode) {
      const x = ((Number(park.lon) + 180) / 360) * 100;
      const y = ((85 - Number(park.lat)) / 145) * 100;
      return { x: Math.max(1, Math.min(99, x)), y: Math.max(1, Math.min(99, y)) };
    }
    const x = ((Number(park.lon) - 65) / (150 - 65)) * 100;
    const y = ((56 - Number(park.lat)) / (56 - 15)) * 100;
    return { x: Math.max(1, Math.min(99, x)), y: Math.max(1, Math.min(99, y)) };
  }
  function mapParks() {
    const q = $("#mapSearch").value.trim().toLowerCase();
    return state.data.parks.filter(park => {
      const domestic = park.scope === "国内园区";
      let matches = false;
      if (state.mapFilter === "全国") matches = domestic;
      else if (state.mapFilter === "国家级") matches = domestic && park.level === "国家级";
      else if (state.mapFilter === "广东") matches = domestic && String(park.province).includes("广东");
      else matches = !domestic;
      const text = [park.name, park.province, park.city, park.country, park.industry].join(" ").toLowerCase();
      return matches && (!q || text.includes(q));
    });
  }
  function parkEvidence(id) { return state.data.evidence[id] || []; }
  function renderMap() {
    const globalMode = state.mapFilter === "全球";
    $("#mapImage").src = globalMode ? "assets/world_map_light.svg" : "assets/china_map_light.png";
    $("#mapImage").alt = globalMode ? "世界园区案例地图背景" : "中国园区地图背景";
    const rows = mapParks();
    $("#mapCount").textContent = `${rows.length} 个点位`;
    $("#mapMarkers").innerHTML = rows.map(park => {
      const { x, y } = mapCoordinates(park, globalMode);
      const cls = globalMode ? "international" : (park.level === "国家级" ? "national" : "provincial");
      return `<button type="button" class="map-marker ${cls} ${state.selectedPark === park.park_id ? "active" : ""}" style="left:${x}%;top:${y}%" data-park-id="${escapeHtml(park.park_id)}" title="${escapeHtml(park.name)}" aria-label="查看${escapeHtml(park.name)}"></button>`;
    }).join("");
    $$(".map-marker").forEach(button => button.addEventListener("click", () => selectPark(button.dataset.parkId, true)));
  }
  function selectPark(id, scroll = false) {
    const park = state.data.parks.find(item => item.park_id === id);
    if (!park) return;
    state.selectedPark = id;
    renderMap();
    const evidence = parkEvidence(id);
    const source = park.source_url ? `<a class="source-link" href="${escapeHtml(park.source_url)}" target="_blank" rel="noopener">查看名录或原始来源 ↗</a>` : "<span>暂无公开来源链接</span>";
    $("#parkDetail").innerHTML = `
      <span class="eyebrow">${escapeHtml(park.list_level || park.scope)}</span>
      <h2>${escapeHtml(park.name)}</h2>
      <p>${escapeHtml([park.country, park.province, park.city, park.industry].filter(Boolean).join(" · "))}</p>
      <div class="detail-meta">
        <div class="meta-cell"><span>建设范围</span><strong>${escapeHtml(park.boundary_type || "待核实")}</strong></div>
        <div class="meta-cell"><span>建设周期</span><strong>${escapeHtml(park.period || "待核实")}</strong></div>
        <div class="meta-cell"><span>资料状态</span><strong>${escapeHtml(park.status || "公开信息")}</strong></div>
        <div class="meta-cell"><span>资料日期</span><strong>${escapeHtml(park.source_date || "—")}</strong></div>
      </div>
      <div class="detail-block"><h4>当前可用信息</h4><p>${escapeHtml(park.note || "已有名录和位置资料，定量数据仍需核验。")}</p></div>
      <div class="detail-block"><h4>建议先做</h4><p>${escapeHtml(park.focus || "优先确认边界、企业清单和基准年数据。")}</p></div>
      <div class="detail-block"><h4>园区公开事实</h4>${evidence.length ? `<ul>${evidence.slice(0, 5).map(item => `<li>${escapeHtml(item.statement)}<br><span class="caveat">限制：${escapeHtml(item.caveat)}</span>${item.url ? `<br><a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">来源 ↗</a>` : ""}</li>`).join("")}</ul>` : "<p>当前没有可直接关联到该园区的定量公开事实。</p>"}</div>
      <div class="detail-block">${source}</div>`;
    if (scroll && window.innerWidth < 1050) $("#parkDetail").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function initMap() {
    $$(".map-filter").forEach(button => button.addEventListener("click", () => {
      state.mapFilter = button.dataset.mapFilter;
      state.selectedPark = null;
      $$(".map-filter").forEach(item => item.classList.toggle("active", item === button));
      renderMap();
    }));
    $("#mapSearch").addEventListener("input", renderMap);
    $("#mapReset").addEventListener("click", () => {
      state.mapFilter = "全国"; state.selectedPark = null; $("#mapSearch").value = "";
      $$(".map-filter").forEach(item => item.classList.toggle("active", item.dataset.mapFilter === "全国"));
      $("#parkDetail").innerHTML = '<div class="detail-placeholder"><span class="eyebrow">园区档案</span><h2>选择地图点位</h2><p>这里显示园区建设范围、产业结构、公开事实、数据边界和原始来源。</p></div>';
      renderMap();
    });
    renderMap();
  }

  // Updates
  function renderUpdateFilters() {
    const topics = ["全部", ...new Set(state.archive.map(row => row.topic || "未分类"))];
    $("#updateFilters").innerHTML = topics.map(topic => `<button type="button" class="topic-filter ${topic === state.updateTopic ? "active" : ""}" data-topic="${escapeHtml(topic)}">${escapeHtml(topic)}</button>`).join("");
    $$(".topic-filter").forEach(button => button.addEventListener("click", () => {
      state.updateTopic = button.dataset.topic;
      state.updateLimit = 9;
      renderUpdateFilters();
      renderUpdates();
    }));
  }
  function filteredUpdates() {
    return state.archive.filter(row => state.updateTopic === "全部" || (row.topic || "未分类") === state.updateTopic);
  }
  function renderUpdates() {
    const all = filteredUpdates();
    const rows = all.slice(0, state.updateLimit);
    $("#updatesGrid").innerHTML = rows.length ? rows.map(row => `<article class="update-card">
      <div class="update-top"><span class="update-topic">${escapeHtml(row.topic || "综合动态")}</span><time>${escapeHtml(row.published_date || "—")}</time></div>
      <h3>${escapeHtml(row.title)}</h3><p>${escapeHtml(row.summary)}</p>
      <div class="update-why">用途边界：${escapeHtml(row.why || "正式判断前核对原文和园区台账。")}</div>
      <a class="source-link" href="${escapeHtml(row.url)}" target="_blank" rel="noopener">${escapeHtml(row.publisher || row.source_name || "公开来源")} · 原文 ↗</a>
    </article>`).join("") : '<div class="empty-state">当前分类没有记录。</div>';
    $("#showMoreUpdates").style.display = state.updateLimit < all.length ? "flex" : "none";
  }
  function initUpdates() {
    renderUpdateFilters(); renderUpdates();
    $("#showMoreUpdates").addEventListener("click", () => { state.updateLimit += 9; renderUpdates(); });
  }

  // Analytics
  function renderBars(target, rows, limit = 12) {
    const slice = (rows || []).slice(0, limit);
    const max = Math.max(1, ...slice.map(row => Number(row.value) || 0));
    $(target).innerHTML = slice.map(row => `<div class="bar-row"><span class="label" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</span><span class="bar-track"><i class="bar-fill" style="width:${(Number(row.value) || 0) / max * 100}%"></i></span><span class="bar-value">${fmt.format(row.value || 0)}</span></div>`).join("");
  }
  function initAnalytics() {
    const a = state.data.analytics;
    renderBars("#provinceChart", a.province, 12);
    renderBars("#industryChart", a.industry, 10);
    renderBars("#topicChart", a.corpus.topics, 10);
    const health = state.data.source_health.counts || {};
    const labels = { healthy: "正常", failed: "失败", watch: "观察", quarantined: "隔离", unknown: "未检查" };
    $("#sourceHealth").innerHTML = Object.keys(labels).filter(key => health[key] || key === "healthy").map(key => `<div class="health-item"><strong>${fmt.format(health[key] || 0)}</strong><span>${labels[key]}</span></div>`).join("");
    const funnel = a.funnel || [];
    const max = Math.max(1, ...funnel.map(row => Number(row.value) || 0));
    $("#funnelChart").innerHTML = funnel.map(row => `<div class="funnel-step" title="${escapeHtml(row.meaning || "")}"><div class="funnel-bar" style="height:${Math.max(5, (Number(row.value) || 0) / max * 155)}px"></div><strong>${fmt.format(row.value || 0)}</strong><span>${escapeHtml(row.name)}</span></div>`).join("");
  }

  // Tabs
  function activatePanel(id) {
    $$(".five-tab").forEach(button => button.classList.toggle("active", button.dataset.panel === id));
    $$(".diagnosis-panel").forEach(panel => panel.classList.toggle("active", panel.id === id));
  }
  function initTabs() {
    $$(".five-tab").forEach(button => button.addEventListener("click", () => activatePanel(button.dataset.panel)));
  }

  // Data readiness
  function fieldId(row) { return row.field_id || row["字段ID"] || ""; }
  function fieldPriority(row) { return priorityClass(row["优先级"] || row.priority || "P2"); }
  function fieldName(row) { return row["字段"] || row.name || fieldId(row); }
  function fieldOwner(row) { return row["建议提供部门"] || row.owner || "待明确"; }
  function fieldMinimum(row) { return row["最低口径"] || row.minimum_material || "需提供可追溯材料"; }
  function fieldPurpose(row) { return row["用途"] || row.purpose || "数据核验"; }
  function fieldWeight(row) { return fieldPriority(row) === "P0" ? 3 : fieldPriority(row) === "P1" ? 2 : 1; }
  function updateReadiness() {
    const fields = state.data.fields;
    const total = fields.reduce((sum, row) => sum + fieldWeight(row), 0);
    const have = fields.reduce((sum, row) => sum + (state.selectedFields.has(fieldId(row)) ? fieldWeight(row) : 0), 0);
    const score = total ? Math.round(have / total * 100) : 0;
    const missingP0 = fields.filter(row => fieldPriority(row) === "P0" && !state.selectedFields.has(fieldId(row))).length;
    $("#readinessScore").textContent = `${score}%`;
    $("#readinessNote").textContent = missingP0 ? `仍缺 ${missingP0} 项P0字段` : "P0字段已勾选，仍需核验年份、边界、单位和原始凭证";
    saveStored("zcp_checked_fields", [...state.selectedFields]);
  }
  function renderFieldChecklist() {
    $("#fieldChecklist").innerHTML = state.data.fields.map(row => {
      const id = fieldId(row), priority = fieldPriority(row);
      return `<label class="field-row"><input type="checkbox" data-field-id="${escapeHtml(id)}" ${state.selectedFields.has(id) ? "checked" : ""}><span class="priority ${priority}">${priority}</span><span class="field-main"><strong>${escapeHtml(fieldName(row))}</strong><small>${escapeHtml(fieldMinimum(row))} · 用途：${escapeHtml(fieldPurpose(row))}</small></span><span class="field-owner">${escapeHtml(fieldOwner(row))}</span></label>`;
    }).join("");
    $$("#fieldChecklist input").forEach(check => check.addEventListener("change", () => {
      if (check.checked) state.selectedFields.add(check.dataset.fieldId); else state.selectedFields.delete(check.dataset.fieldId);
      updateReadiness();
    }));
    updateReadiness();
  }
  function generateTasks() {
    state.tasks = state.data.fields.filter(row => !state.selectedFields.has(fieldId(row))).map((row, index) => ({
      no: index + 1, id: fieldId(row), priority: fieldPriority(row), task: `补充${fieldName(row)}`,
      owner: fieldOwner(row), material: fieldMinimum(row), purpose: fieldPurpose(row),
      deadline: fieldPriority(row) === "P0" ? "3个工作日" : "5个工作日", status: "待提供",
    }));
    $("#taskList").innerHTML = state.tasks.length ? state.tasks.map(task => `<div class="task-item"><strong>${task.no}. [${task.priority}] ${escapeHtml(task.task)}</strong><span>责任：${escapeHtml(task.owner)} · 最低材料：${escapeHtml(task.material)}</span><span>建议时限：${task.deadline} · 用途：${escapeHtml(task.purpose)}</span></div>`).join("") : '<div class="empty-state">当前清单无缺失项。仍需核验统计年份、空间边界、单位和原始凭证。</div>';
    toast(`已生成 ${state.tasks.length} 项补数任务`);
  }
  function initDataReady() {
    renderFieldChecklist();
    $("#checkAllP0").addEventListener("click", () => { state.data.fields.filter(row => fieldPriority(row) === "P0").forEach(row => state.selectedFields.add(fieldId(row))); renderFieldChecklist(); toast("已标记全部P0字段"); });
    $("#clearChecklist").addEventListener("click", () => { state.selectedFields.clear(); state.tasks = []; renderFieldChecklist(); $("#taskList").innerHTML = "点击“生成补数任务”后显示。"; toast("已清空勾选"); });
    $("#generateTasks").addEventListener("click", generateTasks);
    $("#exportTasks").addEventListener("click", () => { if (!state.tasks.length) generateTasks(); downloadCsv("园区数据补齐任务.csv", ["序号", "字段ID", "优先级", "任务", "责任部门", "最低材料", "用途", "建议时限", "状态"], state.tasks.map(t => [t.no, t.id, t.priority, t.task, t.owner, t.material, t.purpose, t.deadline, t.status])); });
  }

  // Current status and peers
  function similarity(a, b) {
    let score = 0; const reasons = [];
    if (a.industry && a.industry === b.industry) { score += 5; reasons.push("产业类型相同"); }
    if (a.boundary_type && a.boundary_type === b.boundary_type) { score += 2; reasons.push("建设边界相同"); }
    if (a.level && a.level === b.level) { score += 2; reasons.push("名单层级相同"); }
    if (a.province && a.province === b.province) { score += 1; reasons.push("同省"); }
    if (a.period && b.period && String(a.period).slice(0, 4) === String(b.period).slice(0, 4)) { score += 1; reasons.push("启动年份接近"); }
    return { score, reasons };
  }
  function renderStateProfile() {
    const domestic = state.data.parks.filter(p => p.scope === "国内园区");
    const park = state.data.parks.find(p => p.park_id === state.selectedPark) || domestic[0];
    if (!park) return;
    state.selectedPark = park.park_id;
    const evidence = parkEvidence(park.park_id);
    const lens = stakeholderLenses[state.lens] || [];
    $("#currentProfile").innerHTML = `<h3 class="profile-title">${escapeHtml(park.name)}</h3><div class="profile-sub">${escapeHtml([park.province, park.city, park.list_level].filter(Boolean).join(" · "))}</div>
      <div class="profile-facts"><div><span>建设范围</span><strong>${escapeHtml(park.boundary_type || "待核实")}</strong></div><div><span>建设周期</span><strong>${escapeHtml(park.period || "待核实")}</strong></div><div><span>产业类型</span><strong>${escapeHtml(park.industry || "待确认")}</strong></div></div>
      <p>${escapeHtml(park.note || "已登记名录和结构信息，定量绩效仍需园区台账。")}</p>
      <h4>公开事实</h4>${evidence.length ? evidence.map(item => `<div class="evidence-item"><p>${escapeHtml(item.statement)}</p><span class="caveat">${escapeHtml(item.caveat)}</span>${item.url ? `<br><a class="source-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">原始来源 ↗</a>` : ""}</div>`).join("") : '<div class="empty-state">暂无完成园区对象关联的定量公开事实。</div>'}
      <div class="lens-content"><strong>${escapeHtml(state.lens)}视角下的下一步</strong><ul>${lens.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`;
    const peers = domestic.filter(p => p.park_id !== park.park_id).map(p => ({ park: p, ...similarity(park, p) })).sort((a, b) => b.score - a.score || a.park.name.localeCompare(b.park.name, "zh-CN")).slice(0, 5);
    $("#similarParks").innerHTML = `<h4>结构相似园区</h4><p class="profile-sub">仅用于安排调研和案例检索，不是绩效排名。</p>${peers.map(item => `<div class="similar-item"><strong>${escapeHtml(item.park.name)}</strong><span>${item.score}分 · ${escapeHtml(item.reasons.join("、") || "基础属性接近")}</span><br><button type="button" class="source-link similar-open" data-id="${escapeHtml(item.park.park_id)}">查看资料卡</button></div>`).join("")}`;
    $$(".similar-open").forEach(button => button.addEventListener("click", () => { state.selectedPark = button.dataset.id; $("#stateParkSelect").value = state.selectedPark; renderStateProfile(); }));
  }
  function initCurrent() {
    const domestic = state.data.parks.filter(p => p.scope === "国内园区");
    $("#stateParkSelect").innerHTML = domestic.map(p => `<option value="${escapeHtml(p.park_id)}">${escapeHtml(p.name)}</option>`).join("");
    state.selectedPark = domestic[0]?.park_id || null;
    $("#lensButtons").innerHTML = Object.keys(stakeholderLenses).map(name => `<button type="button" class="lens-button ${name === state.lens ? "active" : ""}" data-lens="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("");
    $("#stateParkSelect").addEventListener("change", event => { state.selectedPark = event.target.value; renderStateProfile(); });
    $$(".lens-button").forEach(button => button.addEventListener("click", () => { state.lens = button.dataset.lens; $$(".lens-button").forEach(item => item.classList.toggle("active", item === button)); renderStateProfile(); }));
    $("#exportParkProfile").addEventListener("click", () => {
      const park = state.data.parks.find(p => p.park_id === state.selectedPark); if (!park) return;
      const evidence = parkEvidence(park.park_id);
      let md = `# ${park.name} 公开资料卡\n\n- 地区：${park.province || ""}${park.city || ""}\n- 名单层级：${park.list_level || "—"}\n- 建设范围：${park.boundary_type || "待核实"}\n- 建设周期：${park.period || "待核实"}\n- 产业类型：${park.industry || "待确认"}\n- 数据状态：${park.status || "公开信息"}\n- 限制说明：${park.note || "—"}\n- 建议先做：${park.focus || "—"}\n- 名录来源：${park.source_url || "—"}\n\n## 公开事实\n`;
      md += evidence.length ? evidence.map(item => `- ${item.statement}\n  - 限制：${item.caveat}\n  - 来源：${item.url || "—"}`).join("\n") : "- 暂无完成对象关联的定量事实。";
      downloadText(`${park.name}_公开资料卡.md`, md, "text/markdown;charset=utf-8");
    });
    renderStateProfile();
  }

  // Gap analysis
  function runGap(showToast = true) {
    const missing = [];
    if (!$("#boundaryConfirmed").checked) missing.push("同一园区边界和同一自然年");
    const required = [["energyTotal", "综合能源消费量"], ["scope1Total", "范围一排放"], ["scope2Total", "范围二排放"], ["processTotal", "工业过程排放"]];
    required.forEach(([id, label]) => { if (fieldValue(id) === null) missing.push(label); });
    if (missing.length) {
      state.gapRows = [];
      $("#gapResult").innerHTML = `<div class="empty-state"><strong>暂不形成达标结论</strong><br>还需补充：${escapeHtml(missing.join("、"))}。<br>请先回到“数据够不够”形成补数任务。</div>`;
      if (showToast) toast("输入不足，已停止正式核算");
      return null;
    }
    const energy = fieldValue("energyTotal");
    if (!(energy > 0)) { toast("综合能源消费量必须大于0"); return null; }
    const scope1 = fieldValue("scope1Total") || 0, scope2 = fieldValue("scope2Total") || 0, process = fieldValue("processTotal") || 0;
    const emissions = scope1 + scope2 + process;
    const intensity = emissions / energy;
    let coreTarget = null, note = "";
    if (energy >= 200000 && energy < 1000000) { coreTarget = 0.2; note = "综合能源消费量20万—100万吨标准煤"; }
    else if (energy >= 1000000) { coreTarget = 0.3; note = "综合能源消费量100万吨标准煤及以上"; }
    else note = "综合能源消费量低于20万吨标准煤，试行指标中的核心阈值需结合申报要求确认";
    const rows = [{ metric: "单位能耗碳排放", current: intensity, unit: "tCO₂/tce", target: coreTarget, gap: coreTarget === null ? null : Math.max(0, intensity - coreTarget), status: coreTarget === null ? "待确认" : intensity <= coreTarget ? "达到" : "未达到", note }];
    const rate = (id, metric, target) => { const current = fieldValue(id); rows.push({ metric, current, unit: "%", target, gap: current === null ? null : Math.max(0, target - current), status: current === null ? "缺数据" : current >= target ? "达到" : "未达到", note: "" }); };
    rate("cleanEnergy", "清洁能源消费占比", 90);
    const product = $("#productEnergy").value || "未提供";
    rows.push({ metric: "园区企业产出产品单位能耗", current: product, unit: "状态", target: "达到或优于二级能耗限额", gap: null, status: ["达标", "不适用"].includes(product) ? "达到/说明" : "未完成判断", note: "" });
    rate("solidWaste", "工业固废综合利用率", 80); rate("wasteEnergy", "余热/余冷/余压综合利用率", 50); rate("waterReuse", "工业用水重复利用率", 80);
    state.gapRows = rows;
    const reduction = coreTarget === null ? null : Math.max(0, emissions - coreTarget * energy);
    $("#gapResult").innerHTML = `<div class="portfolio-kpis"><div><span>园区排放</span><strong>${fmt.format(emissions)}</strong><small>tCO₂</small></div><div><span>单位能耗碳排放</span><strong>${fmt.format(intensity)}</strong><small>tCO₂/tce</small></div><div><span>年度减排缺口</span><strong>${reduction === null ? "—" : fmt.format(reduction)}</strong><small>tCO₂</small></div></div><div class="metric-row header"><span>指标</span><span>现状</span><span>目标</span><span>判断</span></div>${rows.map(row => `<div class="metric-row"><span><strong>${escapeHtml(row.metric)}</strong>${row.note ? `<br><small>${escapeHtml(row.note)}</small>` : ""}</span><span>${typeof row.current === "number" ? fmt.format(row.current) : escapeHtml(row.current)} ${escapeHtml(row.unit)}</span><span>${typeof row.target === "number" ? fmt.format(row.target) : escapeHtml(row.target ?? "需确认")}</span><span class="metric-status ${row.status.includes("未") || row.status === "缺数据" ? "bad" : row.status.includes("达到") ? "ok" : ""}">${escapeHtml(row.status)}</span></div>`).join("")}<p class="profile-sub">核心指标未达到时，原则上不得申请验收；引导指标适用性应结合客观条件和申报材料说明。</p>`;
    if (showToast) toast("已完成指标差距计算");
    return { emissions, energy, intensity, coreTarget, reduction, rows };
  }
  function initGap() {
    $("#loadGapDemo").addEventListener("click", () => {
      $("#boundaryConfirmed").checked = true; $("#energyTotal").value = 800000; $("#scope1Total").value = 68000; $("#scope2Total").value = 92000; $("#processTotal").value = 24000;
      $("#cleanEnergy").value = 76; $("#productEnergy").value = "未达标"; $("#solidWaste").value = 72; $("#wasteEnergy").value = 38; $("#waterReuse").value = 70;
      toast("已载入演示值，不能作为真实园区结论");
    });
    $("#clearGap").addEventListener("click", () => { $("#gapForm").reset(); state.gapRows = []; $("#gapResult").innerHTML = "填入数据并确认边界后开始核算。"; toast("已清空核算输入"); });
    $("#runGap").addEventListener("click", () => runGap(true));
    $("#exportGap").addEventListener("click", () => { if (!state.gapRows.length) { toast("请先完成差距核算"); return; } downloadCsv("国家级零碳园区指标差距.csv", ["指标", "现状", "单位", "目标", "差距", "状态", "说明"], state.gapRows.map(r => [r.metric, r.current, r.unit, r.target, r.gap, r.status, r.note])); });
  }

  // Measures
  function normalizedMeasures() {
    return state.data.measures.map(row => ({
      id: row.tech_id || row["措施ID"] || "", type: measureType(row), direction: row["一级方向"] || "其他", name: row["二级措施"] || "未命名措施",
      park: row["适用园区"] || "全部", object: row["对象/工艺"] || "—", inputs: row["关键输入参数"] || "—", abatement: row["减排计算逻辑"] || "—",
      economics: row["经济性指标"] || "—", constraints: row["主要约束"] || "—", maturity: row["成熟度"] || "待核实", status: row["参数状态"] || "指南级",
    }));
  }
  function renderMeasures() {
    const measures = normalizedMeasures();
    const directions = ["全部", ...new Set(measures.map(m => m.direction))];
    if ($("#measureDirection").options.length <= 1) $("#measureDirection").innerHTML = directions.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d === "全部" ? "全部方向" : d)}</option>`).join("");
    const type = $("#measureType").value, direction = $("#measureDirection").value, q = $("#measureSearch").value.trim().toLowerCase();
    const rows = measures.filter(m => (type === "全部" || m.type === type) && (direction === "全部" || m.direction === direction) && (!q || [m.name, m.object, m.park, m.constraints].join(" ").toLowerCase().includes(q)));
    $("#measuresGrid").innerHTML = rows.map(m => `<label class="measure-card"><input type="checkbox" data-measure-id="${escapeHtml(m.id)}" ${state.selectedMeasures.has(m.id) ? "checked" : ""}><span class="measure-type ${m.type === "无悔型" ? "no-regret" : m.type === "条件型" ? "conditional" : "strategic"}">${escapeHtml(m.type)}</span><h4>${escapeHtml(m.name)}</h4><p>${escapeHtml(m.direction)} · ${escapeHtml(m.object)}</p><dl><dt>关键输入</dt><dd>${escapeHtml(m.inputs)}</dd><dt>经济性</dt><dd>${escapeHtml(m.economics)}</dd><dt>主要约束</dt><dd>${escapeHtml(m.constraints)}</dd></dl><small>${escapeHtml(m.maturity)} · ${escapeHtml(m.status)}</small></label>`).join("");
    $$("#measuresGrid input").forEach(check => check.addEventListener("change", () => { if (check.checked) state.selectedMeasures.add(check.dataset.measureId); else state.selectedMeasures.delete(check.dataset.measureId); updateMeasureSummary(); }));
  }
  function updateMeasureSummary() {
    const measures = normalizedMeasures().filter(m => state.selectedMeasures.has(m.id));
    const counts = measures.reduce((acc, m) => { acc[m.type] = (acc[m.type] || 0) + 1; return acc; }, {});
    $("#measureSummary").textContent = measures.length ? `已选择 ${measures.length} 项：无悔型 ${counts["无悔型"] || 0}，条件型 ${counts["条件型"] || 0}，战略型 ${counts["战略型"] || 0}。` : "尚未选择措施。";
  }
  function initMeasures() {
    ["measureType", "measureDirection"].forEach(id => $("#" + id).addEventListener("change", renderMeasures));
    $("#measureSearch").addEventListener("input", renderMeasures);
    $("#selectNoRegret").addEventListener("click", () => { normalizedMeasures().filter(m => m.type === "无悔型").forEach(m => state.selectedMeasures.add(m.id)); renderMeasures(); updateMeasureSummary(); toast("已勾选全部无悔型措施"); });
    $("#clearMeasures").addEventListener("click", () => { state.selectedMeasures.clear(); renderMeasures(); updateMeasureSummary(); toast("已清空措施选择"); });
    $("#exportMeasures").addEventListener("click", () => { const rows = normalizedMeasures().filter(m => state.selectedMeasures.has(m.id)); if (!rows.length) { toast("请先选择措施"); return; } downloadCsv("园区减排设施筛选清单.csv", ["ID", "类型", "方向", "措施", "适用园区", "对象工艺", "关键输入", "减排逻辑", "经济性", "约束", "成熟度", "参数状态"], rows.map(m => [m.id, m.type, m.direction, m.name, m.park, m.object, m.inputs, m.abatement, m.economics, m.constraints, m.maturity, m.status])); });
    renderMeasures(); updateMeasureSummary();
  }

  // Feasibility and project portfolio
  function defaultProjects() {
    return [
      { project_id: "P01", name: "分级计量与能碳管理基础", category: "管理基础", capex: 1200, abatement: 2500, saving: 420, opex: 80, life: 8, start: 2026, evidence: "演示参数" },
      { project_id: "P02", name: "高效电机与变频改造", category: "节能降碳", capex: 2800, abatement: 8600, saving: 1180, opex: 90, life: 10, start: 2026, evidence: "演示参数" },
      { project_id: "P03", name: "空压系统优化", category: "节能降碳", capex: 1600, abatement: 5200, saving: 760, opex: 65, life: 8, start: 2026, evidence: "演示参数" },
      { project_id: "P04", name: "蒸汽管网与凝结水回收", category: "节能降碳", capex: 3600, abatement: 12500, saving: 1320, opex: 120, life: 12, start: 2027, evidence: "演示参数" },
      { project_id: "P05", name: "工业余热梯级利用", category: "供热供冷", capex: 9800, abatement: 24000, saving: 1650, opex: 260, life: 15, start: 2027, evidence: "演示参数" },
      { project_id: "P06", name: "再生水回用提升", category: "资源循环", capex: 4200, abatement: 3300, saving: 510, opex: 130, life: 12, start: 2027, evidence: "演示参数" },
      { project_id: "P07", name: "分布式光伏一期", category: "绿色供能", capex: 10500, abatement: 16500, saving: 920, opex: 120, life: 20, start: 2028, evidence: "演示参数" },
      { project_id: "P08", name: "用户侧储能", category: "绿色供能", capex: 8500, abatement: 2200, saving: 1050, opex: 190, life: 10, start: 2028, evidence: "演示参数" },
    ];
  }
  function blankProject() { return { project_id: `U${Date.now()}`, name: "新增项目", category: "节能降碳", capex: 0, abatement: 0, saving: 0, opex: 0, life: 10, start: 2027, evidence: "待核实" }; }
  function renderProjects() {
    $("#projectTableBody").innerHTML = state.projects.map((p, index) => `<tr data-index="${index}">
      <td><input data-key="name" value="${escapeHtml(p.name)}"></td><td><select data-key="category">${["管理基础", "节能降碳", "供热供冷", "绿色供能", "资源循环", "战略转型"].map(v => `<option ${p.category === v ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td><input data-key="capex" type="number" min="0" value="${p.capex}"></td><td><input data-key="abatement" type="number" min="0" value="${p.abatement}"></td><td><input data-key="saving" type="number" value="${p.saving}"></td><td><input data-key="opex" type="number" min="0" value="${p.opex}"></td><td><input data-key="life" type="number" min="1" value="${p.life}"></td><td><input data-key="start" type="number" min="2025" value="${p.start}"></td><td><select data-key="evidence"><option ${p.evidence === "待核实" ? "selected" : ""}>待核实</option><option ${p.evidence === "演示参数" ? "selected" : ""}>演示参数</option><option ${p.evidence === "供应商报价" ? "selected" : ""}>供应商报价</option><option ${p.evidence === "可研参数" ? "selected" : ""}>可研参数</option><option ${p.evidence === "实测数据" ? "selected" : ""}>实测数据</option></select></td><td><button type="button" class="delete-project" data-index="${index}">删除</button></td></tr>`).join("");
    $$("#projectTableBody input,#projectTableBody select").forEach(el => el.addEventListener("change", () => { const index = Number(el.closest("tr").dataset.index); const key = el.dataset.key; state.projects[index][key] = ["capex", "abatement", "saving", "opex", "life", "start"].includes(key) ? Number(el.value) || 0 : el.value; state.lastFeasibility = null; }));
    $$(".delete-project").forEach(button => button.addEventListener("click", () => { state.projects.splice(Number(button.dataset.index), 1); renderProjects(); toast("已删除项目"); }));
  }
  function annuityFactor(rate, years) { return rate === 0 ? years : (1 - Math.pow(1 + rate, -years)) / rate; }
  function projectMetrics(p, rate) {
    const net = p.saving - p.opex, factor = annuityFactor(rate, p.life), npvCost = p.capex - net * factor, lifeAbate = p.abatement * p.life;
    return { ...p, net, npvCost, lifeAbate, macc: lifeAbate > 0 ? npvCost * 10000 / lifeAbate : null, payback: net > 0 ? p.capex / net : null };
  }
  function optimizeProjects(projects, budget, target, rate) {
    if (projects.length > 20) throw new Error("网页精确组合最多支持20个项目");
    let bestMeeting = null, bestFallback = null;
    const limit = 1 << projects.length;
    for (let mask = 0; mask < limit; mask++) {
      let capex = 0, abatement = 0, net = 0, npvCost = 0, lifeAbate = 0; const selected = [];
      for (let i = 0; i < projects.length; i++) if (mask & (1 << i)) {
        const m = projectMetrics(projects[i], rate); capex += m.capex; abatement += m.abatement; net += m.net; npvCost += m.npvCost; lifeAbate += m.lifeAbate; selected.push(m);
      }
      if (capex > budget + 1e-9) continue;
      const row = { selected, capex, abatement, net, npvCost, lifeAbate, macc: lifeAbate > 0 ? npvCost * 10000 / lifeAbate : null, meets: abatement >= target };
      if (row.meets) {
        const key = [row.npvCost, row.capex, -row.abatement, row.selected.length];
        if (!bestMeeting || compareKeys(key, bestMeeting.key) < 0) { row.key = key; bestMeeting = row; }
      } else {
        const key = [-row.abatement, row.npvCost, row.capex, row.selected.length];
        if (!bestFallback || compareKeys(key, bestFallback.key) < 0) { row.key = key; bestFallback = row; }
      }
    }
    const result = bestMeeting || bestFallback || { selected: [], capex: 0, abatement: 0, net: 0, npvCost: 0, lifeAbate: 0, macc: null, meets: target <= 0 };
    result.budget = budget; result.target = target; result.rate = rate; result.gap = Math.max(0, target - result.abatement); delete result.key;
    return result;
  }
  function compareKeys(a, b) { for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; } return 0; }
  function gateTasks() {
    const tasks = [];
    if (!$("#feasParkName").value.trim()) tasks.push(["园区标准名称", "园区管委会", "正式名称和唯一标识"]);
    if (!$("#feasBoundary").checked) tasks.push(["核算边界", "园区管委会/自然资源", "批复四至、红线图或GIS文件"]);
    if (!$("#feasEnterprise").checked) tasks.push(["纳入企业清单", "园区管委会/市场监管", "企业名称、统一社会信用代码、行业和纳入状态"]);
    if (!n($("#feasYear").value, 0)) tasks.push(["基准年", "园区统计/发改", "与全部活动数据一致的自然年"]);
    [["energyTotal", "综合能源消费量", "发改/统计/园区", "分品种台账与折标底稿"], ["scope1Total", "范围一排放", "重点企业/园区", "燃料活动数据与因子"], ["scope2Total", "范围二排放", "供电/供热/园区", "购售电热、绿电凭证和因子版本"], ["processTotal", "工业过程排放", "重点企业", "过程活动数据；无过程排放时填0并说明"]].forEach(([id, name, owner, material]) => { if (fieldValue(id) === null) tasks.push([name, owner, material]); });
    return tasks.map((task, i) => ({ no: i + 1, name: task[0], owner: task[1], material: task[2], due: "3个工作日" }));
  }
  function stakeholderSummary(selected) {
    const result = {};
    selected.forEach(p => {
      const stakeholder = p.category === "绿色供能" ? "能源运营方/用能企业" : p.category === "资源循环" ? "公共设施运营方/园区企业" : p.category === "管理基础" ? "园区管委会/园区企业" : "园区企业";
      (stakeholder.split("/") || []).forEach(name => { const row = result[name] ||= { count: 0, capex: 0, net: 0, abatement: 0 }; row.count++; row.capex += p.capex / stakeholder.split("/").length; row.net += p.net / stakeholder.split("/").length; row.abatement += p.abatement / stakeholder.split("/").length; });
    });
    return result;
  }
  function annualPath(selected, baseline, endYear = 2030) {
    if (!selected.length) return [];
    const first = Math.min(...selected.map(p => p.start)); const rows = [];
    for (let year = first; year <= endYear; year++) {
      const abatement = selected.filter(p => p.start <= year).reduce((sum, p) => sum + p.abatement, 0);
      const remaining = Math.max(0, baseline - abatement); let stage = "减碳";
      if (baseline > 0 && remaining / baseline <= 0.1) stage = "近零碳";
      if (remaining <= 0) stage = "零碳（需核验剩余排放与抵消）";
      rows.push({ year, abatement, remaining, stage });
    }
    return rows;
  }
  function runFeasibility() {
    const tasks = gateTasks();
    const parkName = $("#feasParkName").value.trim() || "未命名园区";
    if (tasks.length) {
      state.lastFeasibility = { parkName, mode: "data_completion", conclusion: "暂不具备正式可行性测算条件", tasks, gap: null, portfolio: null, risks: [{ dimension: "数据与边界", level: "高", finding: `缺少${tasks.length}项正式测算前置数据`, action: "先完成补数任务" }] };
      $("#feasibilityResult").innerHTML = `<div class="empty-state"><strong>暂不具备正式可行性测算条件</strong><br>系统没有生成排名或投资结论，而是形成 ${tasks.length} 项补数任务。</div>${tasks.map(t => `<div class="task-item"><strong>${t.no}. ${escapeHtml(t.name)}</strong><span>责任：${escapeHtml(t.owner)} · 最低材料：${escapeHtml(t.material)}</span><span>建议时限：${t.due}</span></div>`).join("")}`;
      $("#pathResult").innerHTML = '<div class="empty-state">数据门槛通过后再生成项目组合、利益相关方分配和年度路径。</div>';
      toast("数据门槛未通过，已生成补数任务"); return;
    }
    const gap = runGap(false); if (!gap) { activatePanel("gap"); toast("请先补齐差距核算输入"); return; }
    const valid = state.projects.filter(p => p.name && p.capex >= 0 && p.abatement >= 0 && p.life > 0);
    if (!valid.length) { toast("请至少提供一个项目参数"); return; }
    const budget = n($("#budgetLimit").value, 0), target = n($("#abatementTarget").value, 0), rate = n($("#discountRate").value, 5) / 100;
    let portfolio; try { portfolio = optimizeProjects(valid, budget, target, rate); } catch (error) { toast(error.message); return; }
    const lowEvidence = portfolio.selected.filter(p => ["待核实", "演示参数"].includes(p.evidence)).length;
    const risks = [];
    if (lowEvidence) risks.push({ dimension: "项目参数", level: "中", finding: `${lowEvidence}个入选项目仍使用待核实或演示参数`, action: "取得报价、能量平衡和节能量测量边界" });
    if (!portfolio.meets) risks.push({ dimension: "目标缺口", level: "高", finding: `当前预算内仍有 ${fmt.format(portfolio.gap)} tCO₂/年缺口`, action: "增加候选项目、调整预算或分期目标" });
    if (!$("#boundaryConfirmed").checked) risks.push({ dimension: "指标口径", level: "高", finding: "差距核算的同边界、同年度确认未勾选", action: "确认后再形成正式申报差距" });
    const unresolved = gap.rows.filter(r => ["未达到", "缺数据", "未完成判断"].includes(r.status)).length;
    if (unresolved) risks.push({ dimension: "指标差距", level: "中", finding: `${unresolved}项指标仍有差距或缺数据`, action: "核心指标优先，引导指标逐项推进" });
    if (!risks.length) risks.push({ dimension: "初步筛查", level: "低", finding: "当前输入未触发高、中风险规则", action: "继续开展工程可研和法定审查" });
    const conclusion = risks.some(r => r.level === "高") ? "具备初步测算基础，但关键风险尚未关闭" : risks.some(r => r.level === "中") ? "具备初步可行性，需专项可研和参数核验" : "具备较完整的初步可行性条件";
    const stakeholders = stakeholderSummary(portfolio.selected), path = annualPath(portfolio.selected, gap.emissions, 2030);
    state.lastFeasibility = { parkName, year: $("#feasYear").value, mode: "formal", conclusion, tasks: [], gap, portfolio, risks, stakeholders, path };
    $("#feasibilityResult").innerHTML = `<div class="portfolio-kpis"><div><span>组合投资</span><strong>${fmt.format(portfolio.capex)}</strong><small>万元</small></div><div><span>年度减排</span><strong>${fmt.format(portfolio.abatement)}</strong><small>tCO₂</small></div><div><span>年度净收益</span><strong>${fmt.format(portfolio.net)}</strong><small>万元</small></div><div><span>目标缺口</span><strong>${fmt.format(portfolio.gap)}</strong><small>tCO₂/年</small></div></div><p><strong>初筛结论：</strong>${escapeHtml(conclusion)}</p>${portfolio.selected.length ? portfolio.selected.map(p => `<div class="portfolio-item"><span>${escapeHtml(p.name)}<br><small>${escapeHtml(p.category)} · ${escapeHtml(p.evidence)}</small></span><strong>${fmt.format(p.capex)}万元 / ${fmt.format(p.abatement)}t</strong></div>`).join("") : '<div class="empty-state">预算内没有入选项目。</div>'}<div class="risk-list">${risks.map(r => `<div class="risk-item ${r.level === "高" ? "high" : r.level === "中" ? "medium" : "low"}"><strong>${escapeHtml(r.dimension)} · ${escapeHtml(r.level)}</strong><br>${escapeHtml(r.finding)}<br><span>${escapeHtml(r.action)}</span></div>`).join("")}</div><p class="profile-sub">本结果属于前期筛查和项目排序，不替代节能审查、环评、接入系统审查、工程可研或投资决策。</p>`;
    $("#pathResult").innerHTML = `<h5>利益相关方</h5>${Object.entries(stakeholders).map(([name, row]) => `<div class="stakeholder-line"><strong>${escapeHtml(name)}</strong><br><span>${row.count}个项目；分摊投资口径 ${fmt.format(row.capex)} 万元；年净收益口径 ${fmt.format(row.net)} 万元；年减排 ${fmt.format(row.abatement)} tCO₂。</span></div>`).join("")}<h5>年度路径</h5><table class="path-table"><thead><tr><th>年度</th><th>年减排</th><th>剩余排放</th><th>阶段</th></tr></thead><tbody>${path.map(r => `<tr><td>${r.year}</td><td>${fmt.format(r.abatement)}</td><td>${fmt.format(r.remaining)}</td><td>${escapeHtml(r.stage)}</td></tr>`).join("")}</tbody></table>`;
    toast(portfolio.meets ? "已形成满足目标的项目组合" : "已形成预算内最大减排组合");
  }
  function feasibilityMarkdown() {
    const r = state.lastFeasibility; if (!r) return "";
    let md = `# ${r.parkName}零碳建设可行性初筛报告\n\n- 基准年：${r.year || "待确认"}\n- 初筛结论：${r.conclusion}\n\n> 本报告用于前期筛查和项目排序，不替代法定节能审查、环评、接入系统审查、工程可研或投资决策。\n\n## 1. 数据够不够\n\n`;
    if (r.tasks.length) return md + `数据尚不完整，当前只生成补数任务。\n\n|序号|字段|责任部门|最低材料|时限|\n|---|---|---|---|---|\n${r.tasks.map(t => `|${t.no}|${t.name}|${t.owner}|${t.material}|${t.due}|`).join("\n")}\n`;
    md += "数据门槛字段已提供；正式提交前仍应复核原始凭证、因子版本和复核记录。\n\n## 2. 现状是什么\n\n";
    md += `- 园区排放：${fmt.format(r.gap.emissions)} tCO₂\n- 综合能源消费：${fmt.format(r.gap.energy)} tce\n- 单位能耗碳排放：${fmt.format(r.gap.intensity)} tCO₂/tce\n\n## 3. 差距在哪里\n\n|指标|现状|目标|状态|\n|---|---:|---:|---|\n${r.gap.rows.map(row => `|${row.metric}|${row.current ?? "—"}|${row.target ?? "待确认"}|${row.status}|`).join("\n")}\n\n## 4. 怎么减\n\n优先推进计量、设备效率、蒸汽与余热、水循环和工业协同等无悔工作；绿电与储能需要核对源荷、网架、计量、结算和责任边界。\n\n## 5. 花多少钱\n\n`;
    md += `- 预算：${fmt.format(r.portfolio.budget)} 万元\n- 入选投资：${fmt.format(r.portfolio.capex)} 万元\n- 年减排：${fmt.format(r.portfolio.abatement)} tCO₂\n- 年净收益：${fmt.format(r.portfolio.net)} 万元\n- 目标缺口：${fmt.format(r.portfolio.gap)} tCO₂/年\n\n|项目|投资/万元|年减排/tCO₂|年净收益/万元|参数证据|\n|---|---:|---:|---:|---|\n${r.portfolio.selected.map(p => `|${p.name}|${p.capex}|${p.abatement}|${p.net}|${p.evidence}|`).join("\n")}\n\n## 关键风险\n\n${r.risks.map(x => `- **${x.dimension}（${x.level}）**：${x.finding}；建议：${x.action}`).join("\n")}\n`;
    return md;
  }
  function initFeasibility() {
    state.projects = [];
    renderProjects();
    $("#loadProjectDemo").addEventListener("click", () => { state.projects = defaultProjects(); renderProjects(); toast("已载入演示项目，正式使用前必须替换参数"); });
    $("#addProject").addEventListener("click", () => { state.projects.push(blankProject()); renderProjects(); });
    $("#projectFile").addEventListener("change", async event => {
      const file = event.target.files[0]; if (!file) return;
      try {
        const value = JSON.parse(await file.text()); const rows = Array.isArray(value) ? value : value.projects;
        if (!Array.isArray(rows)) throw new Error("JSON需为项目数组或包含projects数组");
        state.projects = rows.map((p, i) => ({ project_id: p.project_id || `I${i + 1}`, name: p.name || p.project_name || `项目${i + 1}`, category: p.category || "节能降碳", capex: n(p.capex_10k_cny ?? p.capex, 0), abatement: n(p.annual_abatement_tco2 ?? p.abatement, 0), saving: n(p.annual_saving_10k_cny ?? p.saving, 0), opex: n(p.annual_opex_10k_cny ?? p.opex, 0), life: n(p.lifetime_years ?? p.life, 10), start: n(p.start_year ?? p.start, 2027), evidence: p.evidence_level || p.evidence || "待核实" }));
        renderProjects(); toast(`已导入 ${state.projects.length} 个项目`);
      } catch (error) { toast(`导入失败：${error.message}`); }
      event.target.value = "";
    });
    $("#downloadProjectTemplate").addEventListener("click", () => downloadText("项目可行性参数模板.json", JSON.stringify({ projects: [{ project_id: "P001", name: "示例：空压系统优化", category: "节能降碳", capex_10k_cny: 0, annual_abatement_tco2: 0, annual_saving_10k_cny: 0, annual_opex_10k_cny: 0, lifetime_years: 10, start_year: 2027, evidence_level: "待核实" }] }, null, 2), "application/json;charset=utf-8"));
    $("#runFeasibility").addEventListener("click", runFeasibility);
    $("#downloadFeasibilityReport").addEventListener("click", () => { if (!state.lastFeasibility) { toast("请先运行可行性分析"); return; } downloadText(`${state.lastFeasibility.parkName}_可行性初筛报告.md`, feasibilityMarkdown(), "text/markdown;charset=utf-8"); });
  }

  // Database
  function buildDatabaseRows() {
    const rows = [];
    state.data.parks.forEach(p => rows.push({ type: "园区", date: [p.province, p.city].filter(Boolean).join("/"), title: p.name, description: `${p.list_level || ""}；${p.industry || ""}；${p.boundary_type || ""}；${p.period || ""}`, limit: p.note || "公开名录资料", url: p.source_url, source: p.source_title || "园区名录" }));
    state.archive.forEach(u => rows.push({ type: "动态", date: u.published_date || "—", title: u.title, description: u.summary, limit: u.why || "正式判断前核对原文", url: u.url, source: u.publisher || u.source_name }));
    state.data.rules.forEach(r => rows.push({ type: "标准", date: r.category || "政策标准", title: r.item || r.rule_id, description: r.rule, limit: r.nature || "按适用范围使用", url: r.source_url, source: r.source }));
    normalizedMeasures().forEach(m => rows.push({ type: "措施", date: m.type, title: m.name, description: `${m.direction}；适用：${m.park}；对象：${m.object}`, limit: `${m.constraints}；${m.status}`, url: "data/technology_guidance.csv", source: "减排设施指南" }));
    return rows;
  }
  function runDatabase(reset = true) {
    if (reset) state.dbLimit = 25;
    const q = $("#dbSearch").value.trim().toLowerCase(), type = $("#dbType").value;
    state.dbRows = buildDatabaseRows().filter(row => (type === "全部" || row.type === type) && (!q || [row.title, row.description, row.limit, row.date, row.source].join(" ").toLowerCase().includes(q)));
    renderDatabase();
  }
  function renderDatabase() {
    const rows = state.dbRows.slice(0, state.dbLimit);
    $("#dbStatus").textContent = `找到 ${state.dbRows.length} 条，当前显示 ${rows.length} 条。`;
    $("#archiveTable").innerHTML = rows.map(row => `<tr><td>${escapeHtml(row.type)}</td><td>${escapeHtml(row.date)}</td><td><strong>${escapeHtml(row.title)}</strong><br><span>${escapeHtml(row.description)}</span></td><td>${escapeHtml(row.limit)}</td><td>${row.url ? `<a href="${escapeHtml(row.url)}" ${/^https?:/.test(row.url) ? 'target="_blank" rel="noopener"' : "download"}>${escapeHtml(row.source || "来源")} ↗</a>` : escapeHtml(row.source || "—")}</td></tr>`).join("");
    $("#dbMore").style.display = state.dbLimit < state.dbRows.length ? "flex" : "none";
  }
  function initDatabase() {
    $("#dbRun").addEventListener("click", () => runDatabase(true));
    $("#dbClear").addEventListener("click", () => { $("#dbSearch").value = ""; $("#dbType").value = "全部"; runDatabase(true); });
    $("#dbSearch").addEventListener("keydown", event => { if (event.key === "Enter") runDatabase(true); });
    $("#dbMore").addEventListener("click", () => { state.dbLimit += 25; renderDatabase(); });
    $("#downloadArchive").addEventListener("click", () => downloadText("零碳园区公开动态档案.json", JSON.stringify(state.archive, null, 2), "application/json;charset=utf-8"));
    runDatabase(true);
  }

  // Reports
  function initReports() {
    const labels = { daily: ["日报", "最新公开政策、园区实践与技术线索"], weekly: ["周报", "最近7天主题、来源和重点记录"], feasibility: ["可行性报告", "示范场景的数据门槛、指标差距和项目组合"] };
    const rows = state.reportIndex.reports || [];
    $("#reportLinks").innerHTML = rows.length ? rows.map(row => {
      const [title, description] = labels[row.type] || [row.type, "自动生成报告"];
      return `<article class="report-card"><span class="report-type">${escapeHtml(String(row.type).toUpperCase())}</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}。报告日期：${escapeHtml(row.date || "—")}；包含 ${escapeHtml(row.record_count ?? "—")} 条记录。</p><div class="report-actions"><a class="btn btn-dark" href="${escapeHtml(row.html)}">网页报告</a><a class="btn btn-line" href="${escapeHtml(row.markdown)}" download>Markdown</a><a class="btn btn-line" href="${escapeHtml(row.json)}" download>JSON</a></div></article>`;
    }).join("") : '<div class="empty-state">报告索引尚未生成。运行构建命令后自动出现。</div>';
  }

  function installServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  function runSelfTest() {
    if (!new URLSearchParams(location.search).has("selftest")) return;
    const checks = [];
    const add = (name, pass) => checks.push({ name, pass: Boolean(pass) });
    add("dashboard loaded", Boolean(state.data)); add("parks loaded", state.data.parks.length >= 1); add("archive loaded", state.archive.length >= 1);
    add("all five panels", $$(".five-tab").length === 5 && $$(".diagnosis-panel").length === 5);
    add("all static buttons have id/data", $$('button').every(b => b.id || [...b.attributes].some(a => a.name.startsWith("data-"))));
    add("report links", $$("#reportLinks a").length >= 2);
    document.documentElement.dataset.selftest = checks.every(c => c.pass) ? "pass" : "fail";
    console.table(checks);
  }

  async function start() {
    try {
      await loadData();
      initMeta(); initMap(); initUpdates(); initAnalytics(); initTabs(); initDataReady(); initCurrent(); initGap(); initMeasures(); initFeasibility(); initDatabase(); initReports(); installServiceWorker(); runSelfTest();
    } catch (error) {
      console.error(error);
      document.querySelector("main").innerHTML = `<div class="error-banner"><h1>网站数据未能加载</h1><p>${escapeHtml(error.message)}</p><p>请通过本地HTTP服务、GitHub Pages或其他静态站点访问，不要直接以 file:// 打开源文件。Windows可运行 <code>run.bat</code>。</p></div>`;
    }
  }

  start();
})();
