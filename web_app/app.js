const form = document.getElementById("nutrition-form");
const submitBtn = document.getElementById("submit-btn");
const statusText = document.getElementById("status-text");
const resultTag = document.getElementById("result-tag");
const reportEl = document.getElementById("result-report");
const rawEl = document.getElementById("result-raw");
const timelineListEl = document.getElementById("timeline-list");
const timelineCountEl = document.getElementById("timeline-count");
const streakDaysEl = document.getElementById("streak-days");
const streakHintEl = document.getElementById("streak-hint");
const weeklyChartEl = document.getElementById("weekly-chart");
const weeklySummaryEl = document.getElementById("weekly-summary");
const weightChartEl = document.getElementById("weight-chart");
const weightSummaryEl = document.getElementById("weight-summary");

const fileInputs = ["breakfast_image", "lunch_image", "dinner_image"];
const timelineStorageKey = "xhs_meal_timeline_v2";
const legacyTimelineStorageKey = "xhs_meal_timeline_v1";

registerServiceWorker();
initImagePreview();
renderTimeline();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const values = collectValues();
  const baseUrl = normalizeBaseUrl(values.base_url);
  const proxyUrl = normalizeBaseUrl(values.proxy_url);
  const useProxy = Boolean(form.elements.use_proxy?.checked);

  setLoading(true);
  setStatus(useProxy ? "调用后端代理生成报告..." : "开始上传图片并运行工作流...");

  try {
    const timelineImages = {};
    const selectedFiles = {};

    for (const field of fileInputs) {
      const file = form.elements[field].files?.[0];
      if (!file) {
        throw new Error(`${field} 未选择图片`);
      }

      timelineImages[field] = await fileToDataUrl(file);
      selectedFiles[field] = file;
    }

    let runData;
    let report;
    let totalKcalOverride = null;

    if (useProxy) {
      setStatus("请求代理接口 /api/nutrition/run ...");
      runData = await runWorkflowViaProxy({
        proxyUrl,
        user: values.user,
        values,
        files: selectedFiles,
      });
      report = extractReportFromProxy(runData);
      totalKcalOverride = Number.isFinite(Number(runData?.total_kcal))
        ? Number(runData.total_kcal)
        : null;
    } else {
      if (!String(values.api_key || "").trim()) {
        throw new Error("直连模式需要填写 API Key");
      }

      const imagePayload = {};
      for (const field of fileInputs) {
        setStatus(`上传 ${toMealName(field)} ...`);
        const uploadId = await uploadFile({
          baseUrl,
          apiKey: values.api_key,
          user: values.user,
          file: selectedFiles[field],
        });
        imagePayload[field] = [
          {
            type: "image",
            transfer_method: "local_file",
            upload_file_id: uploadId,
          },
        ];
      }

      const inputs = {
        height_cm: Number(values.height_cm),
        weight_kg: Number(values.weight_kg),
        age: Number(values.age),
        gender: values.gender,
        activity_level: values.activity_level,
        breakfast_items: values.breakfast_items,
        lunch_items: values.lunch_items,
        dinner_items: values.dinner_items,
        ...imagePayload,
      };

      setStatus("调用 /workflows/run 生成报告...");
      runData = await runWorkflow({
        baseUrl,
        apiKey: values.api_key,
        user: values.user,
        inputs,
      });
      report = extractReport(runData);
    }

    rawEl.textContent = JSON.stringify(runData, null, 2);
    reportEl.textContent = report;
    appendTimelineRecord({
      report,
      values,
      images: timelineImages,
      runData: runData?.run || runData,
      totalKcalOverride,
    });
    renderTimeline();

    resultTag.textContent = "生成成功";
    resultTag.classList.add("hot");
    setStatus("完成：报告已生成。", false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    resultTag.textContent = "生成失败";
    resultTag.classList.remove("hot");
    reportEl.textContent = `请求失败：${message}`;
    setStatus("失败，请检查 Base URL / API Key / 工作流发布状态。", true);
  } finally {
    setLoading(false);
  }
});

function collectValues() {
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

function toMealName(field) {
  if (field === "breakfast_image") return "早餐图片";
  if (field === "lunch_image") return "午餐图片";
  return "晚餐图片";
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading ? "生成中，请稍候..." : "生成今日热量报告";
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "#cf1634" : "#6f7280";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

async function uploadFile({ baseUrl, apiKey, user, file }) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("user", user);

  const response = await fetch(`${baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: fd,
  });

  const data = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(`上传失败(${response.status})：${extractError(data)}`);
  }

  const uploadId =
    data?.id ||
    data?.upload_file_id ||
    data?.data?.id ||
    data?.data?.upload_file_id;

  if (!uploadId) {
    throw new Error(`上传响应缺少文件ID：${JSON.stringify(data)}`);
  }

  return uploadId;
}

async function runWorkflow({ baseUrl, apiKey, user, inputs }) {
  const payload = {
    inputs,
    response_mode: "blocking",
    user,
  };

  const response = await fetch(`${baseUrl}/workflows/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(`工作流运行失败(${response.status})：${extractError(data)}`);
  }

  return data;
}

async function runWorkflowViaProxy({ proxyUrl, user, values, files }) {
  if (!proxyUrl) {
    throw new Error("Proxy URL 不能为空");
  }

  const fd = new FormData();
  fd.append("user", user || "xhs-web-user");
  fd.append("height_cm", String(values.height_cm || ""));
  fd.append("weight_kg", String(values.weight_kg || ""));
  fd.append("age", String(values.age || ""));
  fd.append("gender", String(values.gender || ""));
  fd.append("activity_level", String(values.activity_level || ""));
  fd.append("breakfast_items", String(values.breakfast_items || ""));
  fd.append("lunch_items", String(values.lunch_items || ""));
  fd.append("dinner_items", String(values.dinner_items || ""));

  fd.append("breakfast_image", files.breakfast_image);
  fd.append("lunch_image", files.lunch_image);
  fd.append("dinner_image", files.dinner_image);

  const response = await fetch(`${proxyUrl}/api/nutrition/run`, {
    method: "POST",
    body: fd,
  });
  const data = await safeReadJson(response);

  if (!response.ok) {
    throw new Error(`代理调用失败(${response.status})：${extractError(data)}`);
  }

  return data;
}

function extractReport(runData) {
  const outputs = runData?.data?.outputs || runData?.outputs || {};

  if (typeof outputs.report === "string" && outputs.report.trim()) {
    return outputs.report;
  }

  if (typeof outputs.outputString === "string" && outputs.outputString.trim()) {
    return outputs.outputString;
  }

  const firstText = Object.values(outputs).find(
    (value) => typeof value === "string" && value.trim()
  );

  if (typeof firstText === "string") {
    return firstText;
  }

  if (Object.keys(outputs).length > 0) {
    return JSON.stringify(outputs, null, 2);
  }

  return "工作流已返回，但没有找到可展示的文本输出。";
}

function extractReportFromProxy(proxyData) {
  if (typeof proxyData?.report === "string" && proxyData.report.trim()) {
    return proxyData.report;
  }

  if (proxyData?.run) {
    return extractReport(proxyData.run);
  }

  return extractReport(proxyData);
}

function extractError(data) {
  if (!data) return "未知错误";
  return data?.message || data?.error || data?.detail || JSON.stringify(data);
}

function extractKcal(report, runData) {
  const outputs = runData?.data?.outputs || runData?.outputs || {};
  const directKcal = Number(outputs?.intake_total);
  if (Number.isFinite(directKcal) && directKcal > 0) {
    return Math.round(directKcal);
  }

  const text = String(report || "");
  const match = text.match(/今日总摄入：\s*(\d+(?:\.\d+)?)\s*kcal/i);
  if (match) {
    return Math.round(Number(match[1]));
  }

  return null;
}

function extractTdee(report, runData) {
  const outputs = runData?.data?.outputs || runData?.outputs || {};
  const directTdee = Number(outputs?.tdee || outputs?.TDEE);
  if (Number.isFinite(directTdee) && directTdee > 0) {
    return Math.round(directTdee);
  }

  const text = String(report || "");
  const match = text.match(/每日所需热量（TDEE）：\s*(\d+(?:\.\d+)?)\s*kcal/i);
  if (match) {
    return Math.round(Number(match[1]));
  }

  return null;
}

function appendTimelineRecord({ report, values, images, runData, totalKcalOverride }) {
  const kcal = Number.isFinite(totalKcalOverride)
    ? Math.round(Number(totalKcalOverride))
    : extractKcal(report, runData);
  const tdee = extractTdee(report, runData);
  const weightKg = Number(values.weight_kg);
  const now = new Date();
  const dateKey = toDateKeyLocal(now);

  const records = readTimeline();
  const existingIndex = records.findIndex((item) => item.dateKey === dateKey);

  const newItem = {
    dateKey,
    createdAt: now.toISOString(),
    kcal,
    tdee,
    weightKg: Number.isFinite(weightKg) ? Number(weightKg) : null,
    breakfastItems: values.breakfast_items,
    lunchItems: values.lunch_items,
    dinnerItems: values.dinner_items,
    breakfastImage: images.breakfast_image || "",
    lunchImage: images.lunch_image || "",
    dinnerImage: images.dinner_image || "",
  };

  if (existingIndex >= 0) {
    records[existingIndex] = newItem;
  } else {
    records.unshift(newItem);
  }

  writeTimeline(records.slice(0, 90));
}

function readTimeline() {
  const candidates = [timelineStorageKey, legacyTimelineStorageKey];
  for (const key of candidates) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        const normalized = parsed
          .map(normalizeRecord)
          .filter((item) => item.dateKey)
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey));

        if (key !== timelineStorageKey && normalized.length > 0) {
          writeTimeline(normalized);
          localStorage.removeItem(legacyTimelineStorageKey);
        }

        return normalized;
      }
    } catch {
      // ignore malformed localStorage
    }
  }
  return [];
}

function normalizeRecord(record) {
  const dateKey = normalizeDateKey(record?.dateKey || record?.createdAt || "");
  const createdAt = String(record?.createdAt || "");
  const kcal = Number(record?.kcal);
  const tdee = Number(record?.tdee);
  const weightKg = Number(record?.weightKg);

  return {
    dateKey,
    createdAt,
    kcal: Number.isFinite(kcal) ? kcal : null,
    tdee: Number.isFinite(tdee) ? tdee : null,
    weightKg: Number.isFinite(weightKg) ? weightKg : null,
    breakfastItems: String(record?.breakfastItems || ""),
    lunchItems: String(record?.lunchItems || ""),
    dinnerItems: String(record?.dinnerItems || ""),
    breakfastImage: String(record?.breakfastImage || ""),
    lunchImage: String(record?.lunchImage || ""),
    dinnerImage: String(record?.dinnerImage || ""),
  };
}

function writeTimeline(records) {
  localStorage.setItem(timelineStorageKey, JSON.stringify(records));
}

function renderTimeline() {
  if (!timelineListEl || !timelineCountEl) return;

  const records = readTimeline();
  timelineCountEl.textContent = `${records.length} 天记录`;

  if (records.length === 0) {
    timelineListEl.innerHTML =
      '<div class="timeline-empty">还没有时间线记录，先生成一次今日报告。</div>';
    renderDashboard(records);
    return;
  }

  timelineListEl.innerHTML = records
    .map((item) => {
      const date = parseDateKey(item.dateKey);
      const dayNum = Number.isFinite(date.getTime()) ? String(date.getDate()) : "--";
      const month = Number.isFinite(date.getTime()) ? `${date.getMonth() + 1}月` : "--";
      const weekday = Number.isFinite(date.getTime())
        ? `周${"日一二三四五六"[date.getDay()]}`
        : "未知";
      const dateText = Number.isFinite(date.getTime())
        ? date.toLocaleDateString("zh-CN")
        : item.dateKey;
      const kcalText = Number.isFinite(item.kcal) ? `${item.kcal} kcal` : "热量待补充";

      return `
        <article class="timeline-row">
          <div class="timeline-day">
            <div class="weekday">${weekday}</div>
            <div class="day-num">${dayNum}</div>
            <div class="month">${month}</div>
          </div>
          <div class="timeline-content">
            <div class="timeline-top">
              <div class="timeline-date">${dateText}</div>
              <div class="kcal-badge">总热量 ${kcalText}</div>
            </div>
            <div class="timeline-meals">
              ${renderMealSlot(item.breakfastImage, "早餐", "tag-breakfast")}
              ${renderMealSlot(item.lunchImage, "午餐", "tag-lunch")}
              ${renderMealSlot(item.dinnerImage, "晚餐", "tag-dinner")}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  renderDashboard(records);
}

function renderMealSlot(src, label, tagClass) {
  const content = src
    ? `<img src="${src}" alt="${label}图片" />`
    : '<div class="timeline-meal-empty">暂无图片</div>';

  return `
    <div class="timeline-meal">
      ${content}
      <span class="timeline-meal-tag ${tagClass}">${label}</span>
    </div>
  `;
}

function renderDashboard(records) {
  renderStreak(records);
  renderWeeklyChart(records);
  renderWeightTrend(records);
}

function renderStreak(records) {
  if (!streakDaysEl || !streakHintEl) return;

  const keys = [...new Set(records.map((item) => item.dateKey).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));

  if (keys.length === 0) {
    streakDaysEl.textContent = "0";
    streakHintEl.textContent = "还没有打卡记录";
    return;
  }

  const latest = keys[0];
  let streak = 1;
  let cursor = parseDateKey(latest);

  while (true) {
    const prev = addDays(cursor, -1);
    const prevKey = toDateKeyLocal(prev);
    if (!keys.includes(prevKey)) {
      break;
    }
    streak += 1;
    cursor = prev;
  }

  const latestText = parseDateKey(latest).toLocaleDateString("zh-CN");
  streakDaysEl.textContent = String(streak);
  streakHintEl.textContent = `最近打卡：${latestText}`;
}

function renderWeeklyChart(records) {
  if (!weeklyChartEl || !weeklySummaryEl) return;

  const dayList = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const date = addDays(today, -i);
    dayList.push({
      date,
      dateKey: toDateKeyLocal(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      shortWeekday: "日一二三四五六"[date.getDay()],
    });
  }

  const indexMap = new Map(records.map((item) => [item.dateKey, item]));
  const values = dayList.map((day) => {
    const row = indexMap.get(day.dateKey);
    return Number.isFinite(row?.kcal) ? Number(row.kcal) : null;
  });

  const validValues = values.filter((value) => Number.isFinite(value) && value > 0);

  if (validValues.length === 0) {
    weeklySummaryEl.textContent = "本周暂无数据";
    weeklyChartEl.innerHTML = '<div class="chart-empty">生成记录后显示近 7 天热量柱状图</div>';
    return;
  }

  const total = validValues.reduce((sum, value) => sum + value, 0);
  const average = Math.round(total / validValues.length);
  const maxValue = Math.max(...validValues, 1);

  weeklySummaryEl.textContent = `近7天 ${validValues.length} 天记录 · 日均 ${average} kcal`;

  weeklyChartEl.innerHTML = dayList
    .map((day, index) => {
      const value = values[index];
      const ratio = Number.isFinite(value) && value > 0 ? Math.max(value / maxValue, 0.06) : 0;
      const height = `${Math.round(ratio * 100)}%`;
      const valueText = Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "-";

      return `
        <div class="chart-bar-item" title="${day.label} 周${day.shortWeekday}">
          <div class="bar-value">${valueText}</div>
          <div class="bar-track">
            <div class="bar-fill" style="height: ${height}; opacity: ${ratio > 0 ? 1 : 0};"></div>
          </div>
          <div class="bar-label">${day.shortWeekday}</div>
        </div>
      `;
    })
    .join("");
}

function renderWeightTrend(records) {
  if (!weightChartEl || !weightSummaryEl) return;

  const source = records
    .filter((item) => Number.isFinite(item.weightKg))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-14);

  if (source.length < 2) {
    weightSummaryEl.textContent = "暂无数据";
    weightChartEl.innerHTML = '<div class="chart-empty">至少需要 2 天记录，才可显示趋势线</div>';
    return;
  }

  const weights = source.map((item) => Number(item.weightKg));
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = Math.max(max - min, 0.8);

  const width = 100;
  const height = 84;
  const left = 8;
  const right = 98;
  const top = 12;
  const bottom = 66;

  const points = source.map((item, index) => {
    const x = left + ((right - left) * index) / (source.length - 1);
    const y =
      bottom - ((Number(item.weightKg) - (min - range * 0.1)) / (range * 1.2)) * (bottom - top);
    return {
      ...item,
      x,
      y,
      weight: Number(item.weightKg),
      date: parseDateKey(item.dateKey),
    };
  });

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");

  const first = points[0].weight;
  const last = points[points.length - 1].weight;
  const diff = Number((last - first).toFixed(1));
  const diffText = diff === 0 ? "持平" : diff > 0 ? `+${diff} kg` : `${diff} kg`;

  weightSummaryEl.textContent = `最新 ${last.toFixed(1)} kg · 变化 ${diffText}`;

  const minTextY = bottom + 11;
  const maxTextY = top - 2;
  const startDate = points[0].date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  const endDate = points[points.length - 1].date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });

  weightChartEl.innerHTML = `
    <svg class="weight-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="体重趋势图">
      <line class="weight-axis" x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" />
      <line class="weight-axis" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" />
      <text class="weight-label" x="${left}" y="${minTextY}">${(min - 0.2).toFixed(1)}kg</text>
      <text class="weight-label" x="${left}" y="${maxTextY}">${(max + 0.2).toFixed(1)}kg</text>
      <text class="weight-label" x="${left}" y="${height - 2}">${startDate}</text>
      <text class="weight-label" x="${right - 10}" y="${height - 2}">${endDate}</text>
      <path class="weight-line" d="${path}" />
      ${points
        .map(
          (point) =>
            `<circle class="weight-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="1.8" />`
        )
        .join("")}
    </svg>
  `;
}

async function safeReadJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function initImagePreview() {
  const uploads = document.querySelectorAll(".meal-upload");

  uploads.forEach((wrapper) => {
    const input = wrapper.querySelector('input[type="file"]');
    const targetId = wrapper.getAttribute("data-preview-target");
    const preview = document.getElementById(targetId);

    if (!input || !preview) return;

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        preview.src = "";
        preview.style.display = "none";
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        preview.src = String(reader.result || "");
        preview.style.display = "block";
      };
      reader.readAsDataURL(file);
    });
  });
}

function normalizeDateKey(raw) {
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
    return String(raw);
  }

  const date = new Date(String(raw));
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return toDateKeyLocal(date);
}

function parseDateKey(dateKey) {
  if (!dateKey) return new Date("");
  const match = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return new Date(String(dateKey));
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(year, month, day);
}

function toDateKeyLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch(() => {
        // silent fail for local development quirks
      });
  });
}
