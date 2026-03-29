# AtMoS v3 Sovereign — OmniVerse Health System

نظام مراقبة حيوية سيادي — معالجة محلية كاملة بدون إنترنت

## التشغيل السريع (Termux / محلي)

```bash
npm install
npm run dev
```
ثم افتح `http://[IP]:3000` من المتصفح على نفس الشبكة.

## البناء للنشر

```bash
npm run build
```
المخرجات في مجلد `dist/`.

## الملفات الأساسية

| الملف | الوظيفة |
|---|---|
| `useOmniState.ts` | Single source of truth — كل الـ state |
| `App.tsx` | Shell — orchestration فقط |
| `visionEngine.ts` | rPPG + Face tracking + BPM/HRV |
| `filters.ts` | SNR + RR Intervals + HRV suite كامل |
| `sonarEngine.ts` | تحليل التنفس الصوتي |
| `sonarRadar.ts` | رادار Doppler 19kHz — hand/body discrimination |
| `adaptiveBaseline.ts` | Baseline شخصي متعلّم |
| `preTriggerWhisper.ts` | همسة استباقية قبل الانفعال |
| `BalanceProtocolScreen.tsx` | بروتوكول التوازن — خطوة لوراء |
| `pdfExport.ts` | تقرير طبي Canvas — offline + Web Share |
| `sensorFusion.ts` | Kalman fusion engine |
| `AIGuide.tsx` | نور — المرشد الذكي + Notification API |

## الأوامر الصوتية

- "يا أتموس التوازن" → فتح بروتوكول التوازن
- "خطوة لوراء" → يفتح فوراً بدون Wake Word
- "يا أتموس مواجهة الذات" → Mirror mode
- "يا أتموس طوارئ" → تفعيل NeXuS Emergency

## ملاحظات

- يحتاج HTTPS للـ camera/mic على الأجهزة الحقيقية
- MediaPipe يُحمّل من CDN — يحتاج اتصال في أول تشغيل فقط
- Wake Lock يمنع إطفاء الشاشة أثناء الجلسات
