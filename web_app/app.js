const DEFAULT_PUBLIC_PROXY_BASES = [
  "https://light-calorie-proxy.onrender.com",
];
const API_BASE_STORAGE_KEY = "xhs_api_base_v4";
const API_BASE_CANDIDATES = buildApiBaseCandidates();
let activeApiBase = API_BASE_CANDIDATES[0];

const AUTH_TOKEN_KEY = "xhs_auth_token_v2";
const AUTH_USER_KEY = "xhs_auth_user_v2";
const TIMELINE_CACHE_PREFIX = "xhs_timeline_cache_v2";
const PROFILE_DRAFT_STORAGE_KEY = "xhs_profile_draft_v1";
const BASIC_PROFILE_FIELDS = ["height_cm", "weight_kg", "age", "gender", "activity_level"];

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

const authStatusChipEl = document.getElementById("auth-status-chip");
const authTipEl = document.getElementById("auth-tip");
const authLoggedOutEl = document.getElementById("auth-logged-out");
const loginPageEl = document.getElementById("login-page");
const appPageEl = document.getElementById("app-page");
const appUserNameEl = document.getElementById("app-user-name");

const emailLoginForm = document.getElementById("email-login-form");
const sendCodeBtn = document.getElementById("send-code-btn");
const appLogoutBtn = document.getElementById("app-logout-btn");

const fileInputs = ["breakfast_image", "lunch_image", "dinner_image"];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let authToken = "";
let currentUser = null;
let timelineRecords = [];
let sendCodeCooldown = 0;
let sendCodeTimer = null;
let healthProbeRetryTimer = null;

removeLegacySettingsPanel();
registerServiceWorker();
initImagePreview();
restoreProfileDraft();
bindProfileDraftEvents();
bindAuthEvents();
restoreAuthFromStorage();
applyAuthState();
hydrateTimelineFromCache();
renderTimeline();
probeBackendHealth();

if (authToken) {
  restoreSessionAndSync();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!authToken) {
    setStatus("请先登录后再提交。", true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const values = collectValues();
  setLoading(true);
  setStatus("调用后端代理生成报告...");

  try {
    const selectedFiles = {};

    for (const field of fileInputs) {
      const file = form.elements[field].files?.[0];
      if (!file) {
        throw new Error(`${field} 未选择图片`);
      }
      selectedFiles[field] = file;
    }

    const runData = await runWorkflowViaProxy({
      values,
      files: selectedFiles,
      token: authToken,
    });

    const report = extractReportFromProxy(runData);

    rawEl.textContent = JSON.stringify(runData, null, 2);
    reportEl.textContent = report;

    if (runData?.record) {
      mergeRecord(runData.record);
      persistTimelineCache();
      renderTimeline();
    } else {
      await fetchCloudRecords(false);
    }

    resultTag.textContent = "生成成功";
    resultTag.classList.add("hot");
    setStatus("完成：报告已生成并同步到云端。", false);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    resultTag.textContent = "生成失败";
    resultTag.classList.remove("hot");
    reportEl.textContent = `请求失败：${message}`;
    setStatus("失败，请稍后重试。若持续失败，联系管理员检查后端服务。", true);
  } finally {
    setLoading(false);
  }
});

function bindAuthEvents() {
  emailLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(emailLoginForm);
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const code = String(fd.get("code") || "").trim();

    if (!EMAIL_REGEX.test(email)) {
      setAuthTip("请输入正确的邮箱地址", true);
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setAuthTip("请输入 6 位验证码", true);
      return;
    }

    try {
      setAuthTip("登录中...");
      const data = await apiJson("/api/auth/email/login", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });

      setSession(data.token, data.user);
      applyAuthState();
      await fetchCloudRecords(false);
      setAuthTip("登录成功，已同步云端记录。");
      setStatus("已登录，可跨设备同步。", false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setAuthTip(errorMessage(error), true);
    }
  });

  sendCodeBtn?.addEventListener("click", async () => {
    if (sendCodeCooldown > 0) {
      return;
    }
    if (!emailLoginForm) {
      setAuthTip("登录表单加载失败，请刷新页面重试", true);
      return;
    }

    const fd = new FormData(emailLoginForm);
    const email = String(fd.get("email") || "").trim().toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      setAuthTip("请输入正确的邮箱地址", true);
      return;
    }

    try {
      if (sendCodeBtn) {
        sendCodeBtn.disabled = true;
        sendCodeBtn.textContent = "发送中...";
      }
      setAuthTip("正在发送验证码...");
      const data = await apiJson("/api/auth/email/send", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      if (data?.dev_code) {
        setAuthTip(`测试验证码：${data.dev_code}（正式环境不会展示）`);
      } else {
        setAuthTip("验证码已发送，请查收邮箱。");
      }

      startSendCodeCooldown(60);
    } catch (error) {
      setAuthTip(errorMessage(error), true);
      renderSendCodeBtn();
    } finally {
      if (sendCodeCooldown <= 0) {
        renderSendCodeBtn();
      }
    }
  });

  appLogoutBtn?.addEventListener("click", () => {
    clearSession();
    applyAuthState();
    timelineRecords = [];
    renderTimeline();
    setAuthTip("你已退出登录。");
    setStatus("已退出登录。", false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

async function probeBackendHealth() {
  try {
    await apiJson("/api/health", { method: "GET", timeoutMs: 120000 });
    clearHealthProbeRetry();
    setAuthTip(`后端连接正常（${activeApiBase}），请先发送邮箱验证码再登录。`);
  } catch {
    setAuthTip("正在连接后端（Render 免费版首次可能需要 1-2 分钟）...", false);
    scheduleHealthProbeRetry();
  }
}

function scheduleHealthProbeRetry() {
  if (healthProbeRetryTimer) return;
  healthProbeRetryTimer = setTimeout(() => {
    healthProbeRetryTimer = null;
    probeBackendHealth();
  }, 15000);
}

function clearHealthProbeRetry() {
  if (!healthProbeRetryTimer) return;
  clearTimeout(healthProbeRetryTimer);
  healthProbeRetryTimer = null;
}

async function restoreSessionAndSync() {
  try {
    const me = await apiJson("/api/auth/me", { method: "GET", auth: true });
    currentUser = me.user;
    persistAuthToStorage();
    applyAuthState();
    await fetchCloudRecords(false);
    setAuthTip("云端记录已同步。");
  } catch {
    clearSession();
    applyAuthState();
    timelineRecords = [];
    renderTimeline();
    setAuthTip("登录态已失效，请重新登录。", true);
  }
}

async function fetchCloudRecords(showStatus = true) {
  if (!authToken) {
    timelineRecords = [];
    renderTimeline();
    return;
  }

  if (showStatus) {
    setStatus("正在同步云端记录...");
  }

  const data = await apiJson("/api/records?limit=180", { method: "GET", auth: true });
  const rows = Array.isArray(data?.records) ? data.records.map(normalizeRecord).filter((x) => x.dateKey) : [];

  timelineRecords = rows.sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
  persistTimelineCache();
  renderTimeline();

  if (showStatus) {
    setStatus("云端记录同步完成。", false);
  }
}

function mergeRecord(raw) {
  const row = normalizeRecord(raw);
  if (!row.dateKey) return;

  const idx = timelineRecords.findIndex((item) => item.dateKey === row.dateKey);
  if (idx >= 0) {
    timelineRecords[idx] = row;
  } else {
    timelineRecords.unshift(row);
  }

  timelineRecords.sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)));
  timelineRecords = timelineRecords.slice(0, 180);
}

function normalizeRecord(record) {
  const dateKey = normalizeDateKey(record?.dateKey || record?.date_key || record?.createdAt || record?.created_at);
  const createdAt = String(record?.createdAt || record?.created_at || "");

  return {
    id: String(record?.id || ""),
    dateKey,
    createdAt,
    updatedAt: String(record?.updatedAt || record?.updated_at || ""),
    kcal: toNullableNumber(record?.kcal),
    tdee: toNullableNumber(record?.tdee),
    weightKg: toNullableNumber(record?.weightKg || record?.weight_kg),
    breakfastItems: String(record?.breakfastItems || record?.breakfast_items || ""),
    lunchItems: String(record?.lunchItems || record?.lunch_items || ""),
    dinnerItems: String(record?.dinnerItems || record?.dinner_items || ""),
    breakfastImage: String(record?.breakfastImage || record?.breakfast_image || ""),
    lunchImage: String(record?.lunchImage || record?.lunch_image || ""),
    dinnerImage: String(record?.dinnerImage || record?.dinner_image || ""),
    report: String(record?.report || ""),
  };
}

function hydrateTimelineFromCache() {
  if (!currentUser?.id) {
    timelineRecords = [];
    return;
  }

  try {
    const raw = localStorage.getItem(cacheKeyForUser(currentUser.id));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      timelineRecords = [];
      return;
    }

    timelineRecords = parsed.map(normalizeRecord).filter((item) => item.dateKey);
  } catch {
    timelineRecords = [];
  }
}

function persistTimelineCache() {
  if (!currentUser?.id) return;
  localStorage.setItem(cacheKeyForUser(currentUser.id), JSON.stringify(timelineRecords));
}

function cacheKeyForUser(userId) {
  return `${TIMELINE_CACHE_PREFIX}:${userId}`;
}

function restoreAuthFromStorage() {
  try {
    authToken = String(localStorage.getItem(AUTH_TOKEN_KEY) || "");
    const rawUser = localStorage.getItem(AUTH_USER_KEY);
    currentUser = rawUser ? JSON.parse(rawUser) : null;
  } catch {
    authToken = "";
    currentUser = null;
  }
}

function persistAuthToStorage() {
  if (authToken) {
    localStorage.setItem(AUTH_TOKEN_KEY, authToken);
  }
  if (currentUser) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
  }
}

function clearSession() {
  authToken = "";
  currentUser = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function setSession(token, user) {
  authToken = String(token || "");
  currentUser = user || null;
  persistAuthToStorage();
}

function applyAuthState() {
  const loggedIn = Boolean(authToken && currentUser);

  if (loginPageEl) loginPageEl.hidden = loggedIn;
  if (appPageEl) appPageEl.hidden = !loggedIn;
  if (authLoggedOutEl) authLoggedOutEl.hidden = false;

  if (authStatusChipEl) {
    authStatusChipEl.textContent = loggedIn ? "已登录" : "未登录";
    authStatusChipEl.classList.toggle("hot", loggedIn);
  }

  if (appUserNameEl) {
    appUserNameEl.textContent = loggedIn ? `${currentUser.nickname || currentUser.email || "用户"}` : "-";
  }

  setSubmitEnabled(loggedIn);
}

function setSubmitEnabled(enabled) {
  if (!submitBtn) return;
  submitBtn.disabled = !enabled;
  submitBtn.textContent = enabled ? "生成今日热量报告" : "请先登录后生成报告";
}

function setAuthTip(text, isError = false) {
  if (!authTipEl) return;
  authTipEl.textContent = text;
  authTipEl.style.color = isError ? "#cf1634" : "#6f7280";
}

function startSendCodeCooldown(seconds) {
  sendCodeCooldown = seconds;
  renderSendCodeBtn();

  if (sendCodeTimer) {
    clearInterval(sendCodeTimer);
    sendCodeTimer = null;
  }

  sendCodeTimer = setInterval(() => {
    sendCodeCooldown -= 1;
    if (sendCodeCooldown <= 0) {
      clearInterval(sendCodeTimer);
      sendCodeTimer = null;
      sendCodeCooldown = 0;
    }
    renderSendCodeBtn();
  }, 1000);
}

function renderSendCodeBtn() {
  if (!sendCodeBtn) return;
  if (sendCodeCooldown > 0) {
    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = `${sendCodeCooldown}s`;
  } else {
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = "发送验证码";
  }
}

function collectValues() {
  persistProfileDraft();
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

function bindProfileDraftEvents() {
  if (!form) return;
  for (const name of BASIC_PROFILE_FIELDS) {
    const field = form.elements[name];
    if (!field) continue;
    field.addEventListener("input", persistProfileDraft);
    field.addEventListener("change", persistProfileDraft);
  }
}

function restoreProfileDraft() {
  if (!form) return;
  try {
    const raw = localStorage.getItem(PROFILE_DRAFT_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return;

    for (const name of BASIC_PROFILE_FIELDS) {
      const field = form.elements[name];
      const value = data[name];
      if (!field || value === undefined || value === null) continue;
      field.value = String(value);
    }
  } catch {}
}

function persistProfileDraft() {
  if (!form) return;
  const draft = {};
  for (const name of BASIC_PROFILE_FIELDS) {
    const field = form.elements[name];
    if (!field) continue;
    const value = String(field.value ?? "").trim();
    if (value) {
      draft[name] = value;
    }
  }
  try {
    localStorage.setItem(PROFILE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {}
}

function setLoading(loading) {
  if (!submitBtn) return;
  submitBtn.disabled = loading || !Boolean(authToken && currentUser);
  submitBtn.textContent = loading ? "生成中，请稍候..." : Boolean(authToken && currentUser) ? "生成今日热量报告" : "请先登录后生成报告";
}

function setStatus(text, isError = false) {
  statusText.textContent = text;
  statusText.style.color = isError ? "#cf1634" : "#6f7280";
}

async function runWorkflowViaProxy({ values, files, token }) {
  const fd = new FormData();
  fd.append("date_key", toDateKeyLocal(new Date()));
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

  const response = await requestApi("/api/nutrition/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  }, 180000);

  const data = await safeReadJson(response);
  if (!response.ok) {
    throw new Error(`代理调用失败(${response.status})：${extractError(data)}`);
  }

  return data;
}

async function apiJson(pathname, { method = "GET", body = null, auth = false, timeoutMs = 45000 } = {}) {
  const headers = {};

  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    if (!authToken) {
      throw new Error("未登录");
    }
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await requestApi(pathname, {
    method,
    headers,
    body,
  }, timeoutMs);

  const data = await safeReadJson(response);
  if (!response.ok) {
    throw new Error(extractError(data));
  }

  return data;
}

async function requestApi(pathname, init, timeoutMs = 45000) {
  const tried = [];
  let lastNetworkError = null;
  const candidates = [activeApiBase, ...API_BASE_CANDIDATES.filter((base) => base !== activeApiBase)];

  if (!candidates.length) {
    throw new Error("后端地址未配置");
  }

  for (const base of candidates) {
    tried.push(base);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetch(`${base}${pathname}`, {
          ...init,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const isHtml405 = response.status === 405 && contentType.includes("text/html");
      if ([404, 502, 503, 504].includes(response.status) || isHtml405) {
        continue;
      }

      if (activeApiBase !== base) {
        activeApiBase = base;
        persistApiBase(base);
      }
      return response;
    } catch (error) {
      lastNetworkError = error;
      if (error?.name === "AbortError") {
        continue;
      }
    }
  }

  if (lastNetworkError) {
    throw new Error(`无法连接后端服务（已尝试：${tried.join(" , ")}）。若使用 Render 免费版，可能在冷启动，请稍后再试。`);
  }

  throw new Error(`后端服务不可用（已尝试：${tried.join(" , ")}）。若使用 Render 免费版，可能在冷启动，请稍后再试。`);
}

function extractReport(runData) {
  const outputs = runData?.data?.outputs || runData?.outputs || {};

  if (typeof outputs.report === "string" && outputs.report.trim()) {
    return outputs.report;
  }

  if (typeof outputs.outputString === "string" && outputs.outputString.trim()) {
    return outputs.outputString;
  }

  const firstText = Object.values(outputs).find((value) => typeof value === "string" && value.trim());
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
  if (typeof data?.raw === "string") {
    const raw = data.raw.toLowerCase();
    if (raw.includes("<html") || raw.includes("<!doctype")) {
      return "后端地址不可用或接口未开放，请检查 api_base 是否正确。";
    }
    return data.raw;
  }
  return data?.message || data?.error || data?.detail || JSON.stringify(data);
}

function renderTimeline() {
  if (!timelineListEl || !timelineCountEl) return;

  const records = timelineRecords;
  timelineCountEl.textContent = `${records.length} 天记录`;

  if (!records.length) {
    timelineListEl.innerHTML = '<div class="timeline-empty">还没有时间线记录，登录后生成一次报告即可同步。</div>';
    renderDashboard(records);
    return;
  }

  timelineListEl.innerHTML = records
    .map((item) => {
      const date = parseDateKey(item.dateKey);
      const dayNum = Number.isFinite(date.getTime()) ? String(date.getDate()) : "--";
      const month = Number.isFinite(date.getTime()) ? `${date.getMonth() + 1}月` : "--";
      const weekday = Number.isFinite(date.getTime()) ? `周${"日一二三四五六"[date.getDay()]}` : "未知";
      const dateText = Number.isFinite(date.getTime()) ? date.toLocaleDateString("zh-CN") : item.dateKey;
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
  const content = src ? `<img src="${src}" alt="${label}图片" />` : '<div class="timeline-meal-empty">暂无图片</div>';

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

  const keys = [...new Set(records.map((item) => item.dateKey).filter(Boolean))].sort((a, b) => b.localeCompare(a));

  if (!keys.length) {
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
    if (!keys.includes(prevKey)) break;
    streak += 1;
    cursor = prev;
  }

  streakDaysEl.textContent = String(streak);
  streakHintEl.textContent = `最近打卡：${parseDateKey(latest).toLocaleDateString("zh-CN")}`;
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

  if (!validValues.length) {
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
      const valueText = Number.isFinite(value) && value > 0 ? String(Math.round(value)) : "-";

      return `
        <div class="chart-bar-item" title="${day.label} 周${day.shortWeekday}">
          <div class="bar-value">${valueText}</div>
          <div class="bar-track">
            <div class="bar-fill" style="height: ${Math.round(ratio * 100)}%; opacity: ${ratio > 0 ? 1 : 0};"></div>
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
    const y = bottom - ((Number(item.weightKg) - (min - range * 0.1)) / (range * 1.2)) * (bottom - top);
    return {
      ...item,
      x,
      y,
      weight: Number(item.weightKg),
      date: parseDateKey(item.dateKey),
    };
  });

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");

  const first = points[0].weight;
  const last = points[points.length - 1].weight;
  const diff = Number((last - first).toFixed(1));
  const diffText = diff === 0 ? "持平" : diff > 0 ? `+${diff} kg` : `${diff} kg`;

  weightSummaryEl.textContent = `最新 ${last.toFixed(1)} kg · 变化 ${diffText}`;

  const startDate = points[0].date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  const endDate = points[points.length - 1].date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });

  weightChartEl.innerHTML = `
    <svg class="weight-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="体重趋势图">
      <line class="weight-axis" x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" />
      <line class="weight-axis" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" />
      <text class="weight-label" x="${left}" y="${bottom + 11}">${(min - 0.2).toFixed(1)}kg</text>
      <text class="weight-label" x="${left}" y="${top - 2}">${(max + 0.2).toFixed(1)}kg</text>
      <text class="weight-label" x="${left}" y="${height - 2}">${startDate}</text>
      <text class="weight-label" x="${right - 10}" y="${height - 2}">${endDate}</text>
      <path class="weight-line" d="${path}" />
      ${points
        .map((point) => `<circle class="weight-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="1.8" />`)
        .join("")}
    </svg>
  `;
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

function removeLegacySettingsPanel() {
  const panel = document.querySelector(".settings");
  if (panel) panel.remove();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let refreshed = false;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => {
        registration.update().catch(() => {});

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {});

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  });
}

function buildApiBaseCandidates() {
  const list = [];
  const fromGlobal = normalizeBaseUrl(String(window.__CALORIE_API_BASE__ || ""));
  const fromQuery = normalizeBaseUrl(new URL(window.location.href).searchParams.get("api_base") || "");

  let fromStorage = "";
  try {
    fromStorage = normalizeBaseUrl(String(localStorage.getItem(API_BASE_STORAGE_KEY) || ""));
  } catch {
    fromStorage = "";
  }

  pushBase(list, fromGlobal);
  pushBase(list, fromQuery);
  pushBase(list, fromStorage);
  for (const base of DEFAULT_PUBLIC_PROXY_BASES) {
    pushBase(list, base);
  }

  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    pushBase(list, "http://127.0.0.1:8787");
    pushBase(list, "http://localhost:8787");
  }

  if (!window.location.hostname.endsWith("github.io")) {
    pushBase(list, window.location.origin);
  }
  return list.length ? list : [];
}

function pushBase(list, value) {
  if (!value) return;
  if (!list.includes(value)) {
    list.push(value);
  }
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

function persistApiBase(base) {
  try {
    localStorage.setItem(API_BASE_STORAGE_KEY, base);
  } catch {}
}

async function safeReadJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
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
  if (!match) return new Date(String(dateKey));

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
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

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
