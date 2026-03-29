// src/lib/pdfExport.ts
// ════════════════════════════════════════════════════════════════
// AtMoS Medical Report PDF Export — Offline / Client-Side
// يولّد تقرير طبي كامل بصيغة PDF بدون إنترنت باستخدام Canvas
// ════════════════════════════════════════════════════════════════

export interface MedicalReportData {
  bpm: number | null;
  hrv: number | null;
  sdnn: number | null;
  pnn50: number | null;
  heartCoherence: number | null;
  breathRate: number | null;
  breathDepth: number | null;
  stressIdx: number | null;
  vitalityIdx: number | null;
  focusIdx: number | null;
  coherenceIdx: number | null;
  sqiQuality: string;
  sessionDuration: number; // seconds
  protocolName: string;
}

// ── رسم نص عربي (بدون مكتبة خارجية) ──────────────────────────
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options?: { size?: number; color?: string; bold?: boolean; align?: CanvasTextAlign }
) {
  const size  = options?.size  ?? 14;
  const color = options?.color ?? "#1a2535";
  const bold  = options?.bold  ?? false;
  const align = options?.align ?? "left";
  ctx.font      = `${bold ? "bold " : ""}${size}px Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
  color = "#c8d8e8", width = 1
) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, stroke?: string
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1;
    ctx.strokeRect(x, y, w, h);
  }
}

function getStatusColor(value: number | null, low: number, high: number): string {
  if (value == null) return "#6a8099";
  if (value < low || value > high) return "#e04040";
  if (value < low * 1.1 || value > high * 0.9) return "#e8a000";
  return "#00e070";
}

function formatVal(v: number | null, unit = ""): string {
  return v != null ? `${v}${unit}` : "--";
}

function sqiArabic(q: string): string {
  if (q === "excellent") return "ممتاز";
  if (q === "good")      return "جيد";
  if (q === "poor")      return "ضعيف";
  return "غير محدد";
}

// ══════════════════════════════════════════════════════════════════
export async function generateMedicalPDF(data: MedicalReportData): Promise<Blob | null> {
  const W = 794;   // A4 width  @ 96 dpi
  const H = 1123;  // A4 height @ 96 dpi

  const canvas  = document.createElement("canvas");
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // ── خلفية بيضاء ───────────────────────────────────────────────
  drawRect(ctx, 0, 0, W, H, "#ffffff");

  // ── شريط رأس السيادي ──────────────────────────────────────────
  drawRect(ctx, 0, 0, W, 90, "#080c10");
  drawRect(ctx, 0, 90, W, 4, "#00c8e8");

  // ── عنوان التقرير ─────────────────────────────────────────────
  drawText(ctx, "AtMoS — OmniVerse Sovereign Health Report", W / 2, 38, {
    size: 18, color: "#00c8e8", bold: true, align: "center"
  });
  drawText(ctx, "تقرير صحي سيادي — معالجة محلية كاملة بدون إنترنت", W / 2, 62, {
    size: 11, color: "#8ea2b7", align: "center"
  });
  drawText(ctx, `تاريخ التقرير: ${new Date().toLocaleString("ar-EG")}`, W / 2, 80, {
    size: 10, color: "#6a8099", align: "center"
  });

  let y = 110;

  // ── قسم: القياسات الحيوية الأساسية ────────────────────────────
  drawText(ctx, "القياسات الحيوية الأساسية", 40, y, { size: 14, bold: true, color: "#080c10" });
  drawLine(ctx, 40, y + 6, W - 40, y + 6, "#c8d8e8");
  y += 24;

  const vitals: Array<[string, string, string]> = [
    ["معدل ضربات القلب (BPM)",     formatVal(data.bpm, " BPM"),   data.bpm && (data.bpm < 60 || data.bpm > 100) ? "#e04040" : "#00e070"],
    ["تقلب معدل ضربات القلب RMSSD", formatVal(data.hrv, " ms"),    data.hrv && data.hrv > 20 ? "#00e070" : "#e8a000"],
    ["معدل التنفس",                 formatVal(data.breathRate, " br/min"), "#00c8e8"],
    ["عمق التنفس",                  formatVal(data.breathDepth, "%"), "#00c8e8"],
  ];

  const colW = (W - 80) / 2;
  vitals.forEach(([label, val, color], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx  = 40 + col * colW;
    const by  = y + row * 52;
    drawRect(ctx, bx + 4, by, colW - 8, 46, "#f4f8fc", "#e0eaf4");
    drawText(ctx, label, bx + 14, by + 18, { size: 11, color: "#3d5570" });
    drawText(ctx, val,   bx + 14, by + 36, { size: 16, bold: true, color });
  });
  y += 2 * 52 + 20;

  // ── قسم: مؤشرات HRV المتقدمة ───────────────────────────────────
  drawText(ctx, "مؤشرات HRV المتقدمة (Task Force 1996)", 40, y, { size: 14, bold: true, color: "#080c10" });
  drawLine(ctx, 40, y + 6, W - 40, y + 6, "#c8d8e8");
  y += 24;

  const hrv: Array<[string, string, string]> = [
    ["SDNN (ms)",         formatVal(data.sdnn, " ms"),          data.sdnn && data.sdnn > 30 ? "#00e070" : "#e8a000"],
    ["pNN50 (%)",         formatVal(data.pnn50, "%"),           data.pnn50 && data.pnn50 > 10 ? "#00e070" : "#e8a000"],
    ["تماسك القلب (%)",   formatVal(data.heartCoherence, "%"),  "#00c8e8"],
    ["جودة الإشارة SQI",  sqiArabic(data.sqiQuality),           data.sqiQuality === "excellent" ? "#00e070" : data.sqiQuality === "good" ? "#00c8e8" : "#e8a000"],
  ];

  hrv.forEach(([label, val, color], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const bx  = 40 + col * colW;
    const by  = y + row * 52;
    drawRect(ctx, bx + 4, by, colW - 8, 46, "#f0f4ff", "#d8e4f8");
    drawText(ctx, label, bx + 14, by + 18, { size: 11, color: "#3d5570" });
    drawText(ctx, val,   bx + 14, by + 36, { size: 16, bold: true, color });
  });
  y += 2 * 52 + 20;

  // ── قسم: المؤشرات النفسية ──────────────────────────────────────
  drawText(ctx, "المؤشرات النفسية والإدراكية", 40, y, { size: 14, bold: true, color: "#080c10" });
  drawLine(ctx, 40, y + 6, W - 40, y + 6, "#c8d8e8");
  y += 24;

  const mental: Array<[string, number | null]> = [
    ["مؤشر التوتر",   data.stressIdx],
    ["مؤشر الحيوية",  data.vitalityIdx],
    ["مؤشر التركيز",  data.focusIdx],
    ["مؤشر التوافق",  data.coherenceIdx],
  ];

  const barW = (W - 80) / mental.length - 12;
  mental.forEach(([label, val], i) => {
    const bx = 40 + i * ((W - 80) / mental.length);
    drawRect(ctx, bx + 4, y, barW, 70, "#f8faff", "#e0eaf4");
    drawText(ctx, label, bx + barW / 2, y + 18, { size: 10, color: "#3d5570", align: "center" });
    const pct = val ?? 0;
    const barColor = pct > 70 ? "#00e070" : pct > 40 ? "#e8a000" : "#e04040";
    drawRect(ctx, bx + 8, y + 28, (barW - 8) * (pct / 100), 16, barColor);
    drawRect(ctx, bx + 8, y + 28, barW - 8, 16, "transparent", "#c8d8e8");
    drawText(ctx, val != null ? `${val}%` : "--", bx + barW / 2, y + 60, {
      size: 12, bold: true, color: barColor, align: "center"
    });
  });
  y += 90;

  // ── قسم: بيانات الجلسة ─────────────────────────────────────────
  drawText(ctx, "بيانات الجلسة", 40, y, { size: 14, bold: true, color: "#080c10" });
  drawLine(ctx, 40, y + 6, W - 40, y + 6, "#c8d8e8");
  y += 24;

  const mins = Math.floor(data.sessionDuration / 60);
  const secs = data.sessionDuration % 60;
  const sessionItems = [
    ["مدة الجلسة", `${mins}:${String(secs).padStart(2, "0")} دقيقة`],
    ["البروتوكول الصوتي", data.protocolName || "غير محدد"],
  ];
  sessionItems.forEach(([k, v]) => {
    drawText(ctx, `${k}:`, 50,  y + 16, { size: 12, color: "#3d5570" });
    drawText(ctx, v,       220, y + 16, { size: 12, bold: true, color: "#080c10" });
    y += 24;
  });
  y += 16;

  // ── إخلاء مسؤولية طبية ────────────────────────────────────────
  drawRect(ctx, 40, y, W - 80, 68, "#fff8e1", "#e8a000");
  drawText(ctx, "⚠️  إخلاء مسؤولية طبية", 56, y + 20, { size: 11, bold: true, color: "#b37400" });
  drawText(ctx, "هذا التقرير مُنتج بواسطة تطبيق AtMoS للمراقبة الصحية الشخصية فقط،", 56, y + 38, { size: 10, color: "#8a6000" });
  drawText(ctx, "ولا يُعدّ تشخيصًا طبيًا. استشر طبيبك دائمًا قبل اتخاذ أي قرار صحي.", 56, y + 54, { size: 10, color: "#8a6000" });
  y += 80;

  // ── ختم السيادة الرقمية ───────────────────────────────────────
  drawRect(ctx, 0, H - 48, W, 48, "#080c10");
  drawRect(ctx, 0, H - 48, W, 2, "#00c8e8");
  drawText(ctx, "AtMoS | OmniVerse Sovereignty Layer | Processed Locally — No Cloud — No Surveillance",
    W / 2, H - 22, { size: 9, color: "#8ea2b7", align: "center" }
  );
  drawText(ctx, "بيانات خاصة — معالجة محلية كاملة — بدون خوادم خارجية",
    W / 2, H - 8, { size: 9, color: "#6a8099", align: "center" }
  );

  // ── تحويل Canvas → Blob → تنزيل ──────────────────────────────
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `AtMoS_Report_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
