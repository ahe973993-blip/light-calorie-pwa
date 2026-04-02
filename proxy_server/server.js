require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const multer = require("multer");

if (typeof fetch !== "function" || typeof FormData !== "function" || typeof Blob !== "function") {
  throw new Error("Node.js >= 18 is required (fetch/FormData/Blob missing)");
}

const app = express();

const PORT = Number(process.env.PORT || 8787);
const DIFY_BASE_URL = normalizeBaseUrl(process.env.DIFY_BASE_URL || "http://localhost/v1");
const DIFY_API_KEY = String(process.env.DIFY_API_KEY || "").trim();
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 12);

if (!DIFY_API_KEY) {
  console.warn("[WARN] DIFY_API_KEY is empty. Proxy calls will fail until you set it in .env");
}

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(morgan("dev"));
app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN,
    credentials: false,
  })
);

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
  });
});

app.post(
  "/api/nutrition/run",
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

      const user = String(req.body.user || "proxy-user");

      const breakfastUploadID = await uploadToDify({ file: breakfastImage, user });
      const lunchUploadID = await uploadToDify({ file: lunchImage, user });
      const dinnerUploadID = await uploadToDify({ file: dinnerImage, user });

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
        user,
      };

      const runData = await runWorkflow(payload);
      const report = extractReport(runData);
      const totalKcal = extractKcal(report);

      return res.json({
        ok: true,
        report,
        total_kcal: totalKcal,
        run: runData,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message });
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

app.listen(PORT, () => {
  console.log(`[proxy] running on http://localhost:${PORT}`);
  console.log(`[proxy] dify base: ${DIFY_BASE_URL}`);
});

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

  const firstText = Object.values(outputs).find((v) => typeof v === "string" && v.trim());
  if (typeof firstText === "string") return firstText;

  return JSON.stringify(outputs || {}, null, 2);
}

function extractKcal(report) {
  const text = String(report || "");
  const match = text.match(/今日总摄入：\s*(\d+)\s*kcal/i);
  return match ? Number(match[1]) : null;
}

function extractError(data) {
  if (!data) return "Unknown error";
  return data.message || data.error || data.detail || JSON.stringify(data);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/$/, "");
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}
