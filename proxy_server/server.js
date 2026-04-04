require("dotenv").config();

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");
const jwt = require("jsonwebtoken");

if (typeof fetch !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
  throw new Error("Node.js >= 18 is required (fetch/FormData/Blob missing)");
}

const app = express();

const PORT = Number(process.env.PORT || 8787);
const DIFY_BASE_URL = normalizeBaseUrl(process.env.DIFY_BASE_URL || "https://api.dify.ai/v1");
const DIFY_API_KEY = String(process.env.DIFY_API_KEY || "").trim();
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 12);
const JWT_SECRET = String(process.env.JWT_SECRET || "").trim() || "change-this-jwt-secret";
const TOKEN_EXPIRES_IN = String(process.env.TOKEN_EXPIRES_IN || "30d").trim();
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, "data", "store.json"));

const DEFAULT_FRONTEND_ORIGIN = String(
  process.env.FRONTEND_ORIGIN || "https://ahe973993-blip.github.io/light-calorie-pwa/"
).trim();
const WECHAT_APP_ID = String(process.env.WECHAT_APP_ID || "").trim();
const WECHAT_APP_SECRET = String(process.env.WECHAT_APP_SECRET || "").trim();
const WECHAT_CALLBACK_URL = String(process.env.WECHAT_CALLBACK_URL || "").trim();
const SMS_PROVIDER = String(process.env.SMS_PROVIDER || "mock").trim().toLowerCase();

if (!DIFY_API_KEY) {
  console.warn("[WARN] DIFY_API_KEY is empty. Proxy calls will fail until you set it in .env");
}
if (JWT_SECRET === "change-this-jwt-secret") {
  console.warn("[WARN] JWT_SECRET uses default value. Please set JWT_SECRET in production.");
}

const EMPTY_DB = {
  users: [],
  meal_records: [],
};

let db = structuredClone(EMPTY_DB);
let saveQueue = Promise.resolve();

const smsCodeStore = new Map();
const smsSendAtStore = new Map();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("dev"));
app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN,
    credentials: false,
  })
);
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_MB * 1024 * 1024,
    files: 3,
  },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "dify-nutrition-proxy",
    dify_base_url: DIFY_BASE_URL,
    has_api_key: Boolean(DIFY_API_KEY),
    max_file_mb: MAX_FILE_MB,
    has_jwt_secret: Boolean(JWT_SECRET),
    users: db.users.length,
    records: db.meal_records.length,
    sms_provider: SMS_PROVIDER,
    wechat_enabled: Boolean(WECHAT_APP_ID && WECHAT_APP_SECRET && WECHAT_CALLBACK_URL),
  });
});

app.post("/api/auth/sms/send", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!isValidPhone(phone)) {
    return res.status(400).json({ message: "请输入正确的手机号" });
  }

  const now = Date.now();
  const lastSentAt = smsSendAtStore.get(phone) || 0;
  const cooldownMs = 60 * 1000;
  if (now - lastSentAt < cooldownMs) {
    const retrySec = Math.ceil((cooldownMs - (now - lastSentAt)) / 1000);
    return res.status(429).json({ message: `请求过于频繁，请 ${retrySec}s 后重试` });
  }

  const code = generateSmsCode();
  smsCodeStore.set(phone, {
    code,
    expires_at: now + 5 * 60 * 1000,
  });
  smsSendAtStore.set(phone, now);

  if (SMS_PROVIDER !== "mock") {
    console.warn(`[WARN] SMS_PROVIDER=${SMS_PROVIDER} not implemented, fallback to mock mode`);
  }

  return res.json({
    ok: true,
    message: "验证码已发送",
    expires_in_sec: 300,
    dev_code: code,
  });
});

app.post("/api/auth/phone/login", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const code = String(req.body?.code || "").trim();

  if (!isValidPhone(phone)) {
    return res.status(400).json({ message: "请输入正确的手机号" });
  }
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ message: "验证码格式不正确" });
  }

  const entry = smsCodeStore.get(phone);
  if (!entry) {
    return res.status(401).json({ message: "验证码无效或已过期" });
  }
  if (Date.now() > entry.expires_at) {
    smsCodeStore.delete(phone);
    return res.status(401).json({ message: "验证码已过期，请重新发送" });
  }
  if (entry.code !== code) {
    return res.status(401).json({ message: "验证码错误" });
  }

  smsCodeStore.delete(phone);

  let user = findUserByPhone(phone);
  if (!user) {
    const nowIso = new Date().toISOString();
    user = {
      id: crypto.randomUUID(),
      phone,
      nickname: `用户${phone.slice(-4)}`,
      wechat_openid: "",
      created_at: nowIso,
      updated_at: nowIso,
    };
    db.users.push(user);
    await saveDB();
  }

  const token = signToken(user);
  return res.json({ ok: true, token, user: publicUser(user) });
});

app.get("/api/auth/wechat/url", (req, res) => {
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET || !WECHAT_CALLBACK_URL) {
    return res.status(501).json({ message: "微信登录未配置，请先使用手机号登录" });
  }

  const redirectUri = safeRedirectUri(req.query?.redirect_uri);
  const state = jwt.sign({ redirect_uri: redirectUri }, JWT_SECRET, { expiresIn: "10m" });

  const authUrl =
    "https://open.weixin.qq.com/connect/oauth2/authorize" +
    `?appid=${encodeURIComponent(WECHAT_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(WECHAT_CALLBACK_URL)}` +
    "&response_type=code" +
    "&scope=snsapi_userinfo" +
    `&state=${encodeURIComponent(state)}` +
    "#wechat_redirect";

  return res.json({ ok: true, auth_url: authUrl });
});

app.get("/api/auth/wechat/callback", async (req, res) => {
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET || !WECHAT_CALLBACK_URL) {
    return res.status(501).send("微信登录未配置");
  }

  try {
    const code = String(req.query?.code || "").trim();
    const stateRaw = String(req.query?.state || "").trim();

    if (!code || !stateRaw) {
      return res.status(400).send("微信回调参数缺失");
    }

    let redirectUri = DEFAULT_FRONTEND_ORIGIN;
    try {
      const state = jwt.verify(stateRaw, JWT_SECRET);
      redirectUri = safeRedirectUri(state.redirect_uri);
    } catch {
      redirectUri = DEFAULT_FRONTEND_ORIGIN;
    }

    const tokenUrl =
      "https://api.weixin.qq.com/sns/oauth2/access_token" +
      `?appid=${encodeURIComponent(WECHAT_APP_ID)}` +
      `&secret=${encodeURIComponent(WECHAT_APP_SECRET)}` +
      `&code=${encodeURIComponent(code)}` +
      "&grant_type=authorization_code";

    const tokenResp = await fetch(tokenUrl);
    const tokenData = await safeJson(tokenResp);
    if (!tokenResp.ok || tokenData?.errcode) {
      throw new Error(`微信授权失败: ${tokenData?.errmsg || tokenResp.status}`);
    }

    const accessToken = String(tokenData.access_token || "");
    const openid = String(tokenData.openid || "");
    if (!accessToken || !openid) {
      throw new Error("微信授权返回数据不完整");
    }

    const profileUrl =
      "https://api.weixin.qq.com/sns/userinfo" +
      `?access_token=${encodeURIComponent(accessToken)}` +
      `&openid=${encodeURIComponent(openid)}` +
      "&lang=zh_CN";

    const profileResp = await fetch(profileUrl);
    const profileData = await safeJson(profileResp);
    if (!profileResp.ok || profileData?.errcode) {
      throw new Error(`微信用户信息获取失败: ${profileData?.errmsg || profileResp.status}`);
    }

    let user = findUserByWechatOpenid(openid);
    const nowIso = new Date().toISOString();
    const nickname = String(profileData.nickname || "微信用户").trim() || "微信用户";

    if (!user) {
      user = {
        id: crypto.randomUUID(),
        phone: "",
        nickname,
        wechat_openid: openid,
        created_at: nowIso,
        updated_at: nowIso,
      };
      db.users.push(user);
    } else {
      user.nickname = nickname;
      user.updated_at = nowIso;
    }

    await saveDB();

    const authToken = signToken(user);
    const target = appendQuery(redirectUri, {
      auth_token: authToken,
      uid: user.id,
      nickname: user.nickname,
    });

    return res.redirect(target);
  } catch (error) {
    return res.status(500).send(errorMessage(error));
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: publicUser(req.user) });
});

app.get("/api/records", requireAuth, (req, res) => {
  const limit = clampInt(req.query?.limit, 1, 365, 120);
  const records = db.meal_records
    .filter((record) => record.user_id === req.user.id)
    .sort((a, b) => String(b.date_key).localeCompare(String(a.date_key)))
    .slice(0, limit)
    .map(publicRecord);

  res.json({ ok: true, records });
});

app.post(
  "/api/nutrition/run",
  requireAuth,
  upload.fields([
    { name: "breakfast_image", maxCount: 1 },
    { name: "lunch_image", maxCount: 1 },
    { name: "dinner_image", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!DIFY_API_KEY) {
        return res.status(500).json({ message: "DIFY_API_KEY is not configured" });
      }

      const files = req.files || {};
      const breakfastImage = files.breakfast_image?.[0];
      const lunchImage = files.lunch_image?.[0];
      const dinnerImage = files.dinner_image?.[0];

      if (!breakfastImage || !lunchImage || !dinnerImage) {
        return res.status(400).json({ message: "Missing breakfast/lunch/dinner images" });
      }

      const workflowUser = `user:${req.user.id}`;

      const breakfastUploadID = await uploadToDify({ file: breakfastImage, user: workflowUser });
      const lunchUploadID = await uploadToDify({ file: lunchImage, user: workflowUser });
      const dinnerUploadID = await uploadToDify({ file: dinnerImage, user: workflowUser });

      const payload = {
        inputs: {
          height_cm: toNumber(req.body.height_cm),
          weight_kg: toNumber(req.body.weight_kg),
          age: toNumber(req.body.age),
          gender: String(req.body.gender || ""),
          activity_level: String(req.body.activity_level || ""),
          breakfast_items: String(req.body.breakfast_items || ""),
          lunch_items: String(req.body.lunch_items || ""),
          dinner_items: String(req.body.dinner_items || ""),
          breakfast_image: [
            {
              type: "image",
              transfer_method: "local_file",
              upload_file_id: breakfastUploadID,
            },
          ],
          lunch_image: [
            {
              type: "image",
              transfer_method: "local_file",
              upload_file_id: lunchUploadID,
            },
          ],
          dinner_image: [
            {
              type: "image",
              transfer_method: "local_file",
              upload_file_id: dinnerUploadID,
            },
          ],
        },
        response_mode: "blocking",
        user: workflowUser,
      };

      const runData = await runWorkflow(payload);
      const report = extractReport(runData);
      const totalKcal = extractKcal(report, runData);
      const tdee = extractTdee(report, runData);

      const now = new Date();
      const dateKey = normalizeDateKey(req.body.date_key) || localDateKey(now);
      const nowIso = now.toISOString();

      const recordDraft = {
        id: crypto.randomUUID(),
        user_id: req.user.id,
        date_key: dateKey,
        created_at: nowIso,
        updated_at: nowIso,
        kcal: totalKcal,
        tdee,
        weight_kg: toNullableNumber(req.body.weight_kg),
        breakfast_items: String(req.body.breakfast_items || ""),
        lunch_items: String(req.body.lunch_items || ""),
        dinner_items: String(req.body.dinner_items || ""),
        breakfast_image: toDataUrl(breakfastImage),
        lunch_image: toDataUrl(lunchImage),
        dinner_image: toDataUrl(dinnerImage),
        report,
      };

      const record = upsertRecord(recordDraft);
      await saveDB();

      return res.json({
        ok: true,
        report,
        total_kcal: totalKcal,
        run: runData,
        record: publicRecord(record),
      });
    } catch (error) {
      return res.status(500).json({ message: errorMessage(error) });
    }
  }
);

app.use("/", express.static(path.join(__dirname, "..", "web_app")));

app.use((err, req, res, next) => {
  const message = err?.message || "Unknown server error";
  if (message.includes("File too large")) {
    return res.status(400).json({ message: `Image too large. Max ${MAX_FILE_MB}MB each.` });
  }
  return res.status(400).json({ message });
});

bootstrap().catch((error) => {
  console.error("[bootstrap] failed:", error);
  process.exit(1);
});

async function bootstrap() {
  await loadDB();
  app.listen(PORT, () => {
    console.log(`[proxy] running on http://localhost:${PORT}`);
    console.log(`[proxy] dify base: ${DIFY_BASE_URL}`);
    console.log(`[proxy] db path: ${DB_PATH}`);
  });
}

async function loadDB() {
  await fsp.mkdir(path.dirname(DB_PATH), { recursive: true });

  if (!fs.existsSync(DB_PATH)) {
    db = structuredClone(EMPTY_DB);
    await fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
    return;
  }

  const raw = await fsp.readFile(DB_PATH, "utf8");
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    db = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      meal_records: Array.isArray(parsed.meal_records) ? parsed.meal_records : [],
    };
  } catch {
    db = structuredClone(EMPTY_DB);
    await fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  }
}

function saveDB() {
  saveQueue = saveQueue.then(() => fsp.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8"));
  return saveQueue;
}

function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ message: "未登录或登录已过期" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users.find((item) => item.id === payload.uid);
    if (!user) {
      return res.status(401).json({ message: "用户不存在，请重新登录" });
    }

    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ message: "登录凭证无效，请重新登录" });
  }
}

function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

function bearerToken(req) {
  const raw = String(req.headers.authorization || "");
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function findUserByPhone(phone) {
  return db.users.find((item) => item.phone === phone);
}

function findUserByWechatOpenid(openid) {
  return db.users.find((item) => item.wechat_openid === openid);
}

function publicUser(user) {
  return {
    id: user.id,
    phone: user.phone,
    nickname: user.nickname,
    has_wechat: Boolean(user.wechat_openid),
    created_at: user.created_at,
  };
}

function upsertRecord(record) {
  const index = db.meal_records.findIndex(
    (item) => item.user_id === record.user_id && item.date_key === record.date_key
  );

  if (index >= 0) {
    const existing = db.meal_records[index];
    const merged = {
      ...existing,
      ...record,
      id: existing.id,
      created_at: existing.created_at,
      updated_at: new Date().toISOString(),
    };
    db.meal_records[index] = merged;
    return merged;
  }

  db.meal_records.push(record);
  return record;
}

function publicRecord(record) {
  return {
    id: record.id,
    dateKey: record.date_key,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    kcal: record.kcal,
    tdee: record.tdee,
    weightKg: record.weight_kg,
    breakfastItems: record.breakfast_items,
    lunchItems: record.lunch_items,
    dinnerItems: record.dinner_items,
    breakfastImage: record.breakfast_image,
    lunchImage: record.lunch_image,
    dinnerImage: record.dinner_image,
    report: record.report,
  };
}

async function uploadToDify({ file, user }) {
  const form = new FormData();
  form.append("user", user);
  form.append(
    "file",
    new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" }),
    file.originalname || `${Date.now()}.jpg`
  );

  const response = await fetch(`${DIFY_BASE_URL}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
    },
    body: form,
  });

  const data = await safeJson(response);

  if (!response.ok) {
    throw new Error(`Dify upload failed(${response.status}): ${extractError(data)}`);
  }

  const id = data?.id || data?.upload_file_id || data?.data?.id || data?.data?.upload_file_id;
  if (!id) {
    throw new Error(`Dify upload response missing file id: ${JSON.stringify(data)}`);
  }
  return id;
}

async function runWorkflow(payload) {
  const response = await fetch(`${DIFY_BASE_URL}/workflows/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DIFY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await safeJson(response);

  if (!response.ok) {
    throw new Error(`Dify workflow failed(${response.status}): ${extractError(data)}`);
  }

  return data;
}

function extractReport(runData) {
  const outputs = runData?.data?.outputs || runData?.outputs || {};
  if (typeof outputs.report === "string" && outputs.report.trim()) return outputs.report;
  if (typeof outputs.outputString === "string" && outputs.outputString.trim()) return outputs.outputString;

  const firstText = Object.values(outputs).find((value) => typeof value === "string" && value.trim());
  if (typeof firstText === "string") return firstText;

  return JSON.stringify(outputs || {}, null, 2);
}

function extractKcal(report, runData) {
  const outputs = runData?.data?.outputs || runData?.outputs || {};
  const outputKcal = toNullableNumber(outputs.intake_total);
  if (Number.isFinite(outputKcal)) return Math.round(outputKcal);

  const text = String(report || "");
  const match = text.match(/今日总摄入：\s*(\d+(?:\.\d+)?)\s*kcal/i);
  return match ? Math.round(Number(match[1])) : null;
}

function extractTdee(report, runData) {
  const outputs = runData?.data?.outputs || runData?.outputs || {};
  const outputTdee = toNullableNumber(outputs.tdee || outputs.TDEE);
  if (Number.isFinite(outputTdee)) return Math.round(outputTdee);

  const text = String(report || "");
  const match = text.match(/每日所需热量（TDEE）：\s*(\d+(?:\.\d+)?)\s*kcal/i);
  return match ? Math.round(Number(match[1])) : null;
}

function toDataUrl(file) {
  const mime = file?.mimetype || "image/jpeg";
  const body = Buffer.from(file?.buffer || Buffer.alloc(0)).toString("base64");
  return `data:${mime};base64,${body}`;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-11);
}

function isValidPhone(phone) {
  return /^1[3-9]\d{9}$/.test(phone);
}

function generateSmsCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizeDateKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const d = new Date(text);
  if (!Number.isFinite(d.getTime())) return "";
  return localDateKey(d);
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function safeRedirectUri(input) {
  const fallback = normalizeBaseUrl(DEFAULT_FRONTEND_ORIGIN) || "https://ahe973993-blip.github.io/light-calorie-pwa/";
  try {
    const url = new URL(String(input || fallback));
    if (!["http:", "https:"].includes(url.protocol)) {
      return fallback;
    }

    const allow = normalizeBaseUrl(process.env.FRONTEND_ORIGIN || "");
    if (allow) {
      const allowUrl = new URL(allow);
      if (url.origin !== allowUrl.origin) {
        return allow;
      }
    }

    return url.toString();
  } catch {
    return fallback;
  }
}

function appendQuery(url, params) {
  const parsed = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      parsed.searchParams.set(key, String(value));
    }
  });
  return parsed.toString();
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

function extractError(data) {
  if (!data) return "Unknown error";
  return data.message || data.error || data.detail || JSON.stringify(data);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}
