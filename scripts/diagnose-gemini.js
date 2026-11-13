const { performance } = require("node:perf_hooks");
const { createHash } = require("node:crypto");
const { createDiagnostics, safeErrorDetails } = require("../src/modules/trainings/chat-diagnostics");

function tinyPdf() {
  const stream = "BT /F1 12 Tf 50 740 Td (Diagnostic code: WIND42.) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let data = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(data));
    data += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  data += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(data);
}

async function runProbes({ textProbe, pdfProbe, courseProbe, report }) {
  const probes = [
    ["A", async () => (await textProbe()).trim() === "OK"],
    ["B", async () => (await pdfProbe(tinyPdf())).includes("WIND42")],
    ["C", async () => Boolean((await courseProbe()).answer?.trim())],
  ];
  const outcomes = [];
  let previousFailed = false;
  for (const [probe, run] of probes) {
    if (previousFailed) {
      outcomes.push({ probe, outcome: "skipped" });
    } else {
      const started = performance.now();
      try {
        const verified = await run();
        outcomes.push({ probe, outcome: verified ? "success" : "unexpected_answer", elapsedMs: Math.round(performance.now() - started) });
        previousFailed = !verified;
      } catch (error) {
        outcomes.push({ probe, outcome: "error", elapsedMs: Math.round(performance.now() - started), ...safeErrorDetails(error) });
        previousFailed = true;
      }
    }
    report(outcomes.at(-1));
  }
  return outcomes;
}

async function connectivityChecks(report) {
  const dns = require("node:dns/promises");
  const tls = require("node:tls");
  const gemini = require("../src/config/gemini");
  const checks = [
    ["dns", async () => {
      let timer;
      try {
        const addresses = await Promise.race([
          dns.lookup("generativelanguage.googleapis.com", { all: true }),
          new Promise((resolve, reject) => { timer = setTimeout(() => reject(new DOMException("", "TimeoutError")), 8000); }),
        ]);
        return { resolved: addresses.length > 0, families: [...new Set(addresses.map((address) => address.family))] };
      } finally { clearTimeout(timer); }
    }],
    ["tls", () => new Promise((resolve, reject) => {
      const socket = tls.connect({ host: "generativelanguage.googleapis.com", port: 443, servername: "generativelanguage.googleapis.com", timeout: 8000 });
      socket.once("secureConnect", () => { const authorized = socket.authorized; socket.destroy(); resolve({ authorized }); });
      socket.once("timeout", () => { socket.destroy(); reject(new DOMException("", "TimeoutError")); });
      socket.once("error", reject);
    })],
    ["public_api_discovery", async () => {
      const result = await fetch("https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta", { signal: AbortSignal.timeout(8000) });
      await result.body?.cancel();
      return { status: result.status };
    }],
    ["model_metadata", async () => {
      const settings = gemini.getConfig();
      const result = await gemini.createClient(settings).models.get({
        model: settings.model,
        config: { abortSignal: AbortSignal.timeout(8000), httpOptions: { timeout: 8000, retryOptions: { attempts: 1 } } },
      });
      return { success: true, modelMatches: [settings.model, `models/${settings.model}`].includes(result.name) };
    }],
  ];
  report({ check: "environment", proxyVariablesPresent: ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NODE_USE_ENV_PROXY"].some((name) => Boolean(process.env[name])), customCaConfigured: Boolean(process.env.NODE_EXTRA_CA_CERTS) });
  for (const [check, action] of checks) {
    const started = performance.now();
    try {
      const result = await action();
      report({ check, elapsedMs: Math.round(performance.now() - started), ...result });
    } catch (error) {
      report({ check, elapsedMs: Math.round(performance.now() - started), ...safeErrorDetails(error) });
    }
  }
}

async function main(args = process.argv.slice(2)) {
  const report = (result) => console.info(JSON.stringify(result));
  if (args.length !== 2 || args[0] !== "--formation-id" || !/^[a-fA-F0-9]{24}$/.test(args[1])) {
    report({ error: "Use --formation-id followed by a valid formation ID" });
    process.exitCode = 1;
    return;
  }
  // Use the application's quiet dotenv loading; never copy or display its values.
  require("../src/app");
  const gemini = require("../src/config/gemini");
  const provider = require("../src/modules/trainings/chat-provider");
  const service = require("../src/modules/trainings/service");
  const storage = require("../src/modules/trainings/pdf-storage");
  const Formation = require("../src/modules/trainings/model");
  const mongoose = require("mongoose");
  const settings = gemini.getConfig();
  report({ sdkVersion: "3.2.0", model: settings.model, endpoint: "https://generativelanguage.googleapis.com/v1beta", timeoutMs: settings.timeoutMs, attempts: 1 });

  async function fingerprint(key) {
    const file = await storage.open(key);
    const hash = createHash("sha256");
    for await (const chunk of file.handle.createReadStream()) hash.update(chunk);
    return hash.digest("hex");
  }

  const outcomes = await runProbes({
    report,
    textProbe: () => provider.answerTextQuestion("Réponds uniquement : OK", undefined, createDiagnostics({ enabled: true, probe: "A" })),
    pdfProbe: (pdf) => provider.answerPdfQuestion(pdf, "Quel est le code de diagnostic dans ce document ?", undefined, createDiagnostics({ enabled: true, probe: "B" })),
    courseProbe: async () => {
      let before;
      let beforeHash;
      let connected = false;
      try {
        if (!process.env.MONGO_URI) throw Object.assign(new Error(), { statusCode: 503 });
        await mongoose.connect(process.env.MONGO_URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
        connected = true;
        before = await Formation.findById(args[1]).lean();
        if (before?.coursePdf) beforeHash = await fingerprint(before.coursePdf.storageKey);
        return await service.chatWithFormation(args[1], {
          question: "Selon ce cours, comment une éolienne transforme-t-elle l’énergie du vent en électricité ?",
        }, undefined, createDiagnostics({ enabled: true, probe: "C" }));
      } finally {
        if (connected && before) {
          try {
            const after = await Formation.findById(args[1]).lean();
            const unchanged = JSON.stringify(before) === JSON.stringify(after) && (!beforeHash || beforeHash === await fingerprint(before.coursePdf.storageKey));
            report({ check: "record_and_pdf_preservation", unchanged });
          } catch { report({ check: "record_and_pdf_preservation", outcome: "unverified" }); }
        }
        await mongoose.disconnect();
      }
    },
  });
  if (outcomes[0].outcome !== "success") await connectivityChecks(report);
  if (outcomes.some((outcome) => outcome.outcome !== "success")) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.info(JSON.stringify({ outcome: "diagnostic_failed", ...safeErrorDetails(error) }));
    process.exitCode = 1;
  });
}

module.exports = { tinyPdf, runProbes, connectivityChecks, main };
