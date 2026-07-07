"use strict";

const state = {
  view: "dashboard",
  submode: null,
  strict: false,
  dark: localStorage.getItem("mosc_dark_mode") === "true",
  highAccuracy: localStorage.getItem("mosc_high_accuracy") === "true",
  apiKey: localStorage.getItem("mosc_gemini_api_key") || "",
  recorder: null,
  stream: null,
  chunks: [],
  seconds: 0,
  timerId: null,
  animationId: null,
  audioContext: null,
  analyser: null,
  report: null,
  modelUsed: null,
};

const MODELS = {
  default: "gemini-2.5-flash",
  highAccuracy: "gemini-3-pro-preview",
  fallback1: "gemini-3-flash-preview",
  fallback2: "gemini-3.1-flash-lite-preview",
};

const Type = { OBJECT: "OBJECT", STRING: "STRING" };

const prompts = {
  opdNormal: `You are an expert AI Medical Scribe for an Outpatient Department (OPD).
Input: Audio recording of a doctor dictating a case (often mixed English and Malayalam, with potential background noise).

YOUR RESPONSIBILITIES:
1. NOISE FILTERING: Ignore background noises, interruptions, or casual conversations not related to the medical case.
2. TRANSLATION: Translate Malayalam or colloquial phrases into Standard Professional Medical English.
3. FORMATTING: Structure the output strictly into the JSON schema provided.
4. NIL VALUES: If a specific section is not mentioned, you MUST set it to "NIL".
5. ACCURACY: Do not hallucinate findings.

Output must be strictly valid JSON.`,
  opdStrict: `You are a Strict Medical Dictation Scribe.
Input: Audio recording of a doctor dictating a case.

YOUR RESPONSIBILITIES:
1. STRICT WORD-FOR-WORD TRANSCRIPTION: Transcribe the doctor's dictation exactly as spoken. Do NOT summarize, rephrase, or condense.
2. GRAMMAR CORRECTION: You may perform minor proofreading for grammar and punctuation, but do not change medical terminology or intended phrasing.
3. CATEGORIZATION: Organize the transcribed text into the correct JSON schema sections.
4. TRANSLATION: Translate Malayalam or colloquial phrases into English directly and literally where appropriate.
5. NOISE FILTERING: Ignore non-medical background noise.
6. NIL VALUES: If a section is not mentioned, set it to "NIL".

Output must be strictly valid JSON.`,
  opdText: `Analyze the audio and generate a medical case sheet.
Focus ONLY on clinical data. Discard all non-clinical conversation.

Required Fields:
1. Chief Complaint and duration
2. History of Present Illness
3. Past Medical History
4. Family History
5. Personal history
6. Developmental History (Pediatric only, else "NIL")
7. Vaccination History (Pediatric only, else "NIL")
8. General Examination Findings
9. Mental Status Examination (Psychiatry only, else "NIL")
10. Systemic Examination Findings
11. Provisional Diagnosis
12. Treatment Plan`,
  followupNormal: `You are an expert AI Medical Scribe for an Outpatient Department (OPD) specializing in Follow-up patient visits.
Input: Audio recording of a doctor dictating clinical progress, exam findings, current complaints, and treatments.

YOUR RESPONSIBILITIES:
1. Ignore background noise and non-clinical conversation.
2. Translate Malayalam or colloquial phrases into Standard Professional Medical English.
3. Capture progress updates, symptom changes, patient statements, exam findings, and checks under "clinicalNotes".
4. Extract prescribed medicines, dose changes, tests, or instructions under "treatmentPlan". If none are dictated, set "treatmentPlan" to "NIL".`,
  followupStrict: `You are a Strict Medical Dictation Scribe specializing in Follow-up patient visits.
Input: Audio recording of a doctor dictating follow-up details.

YOUR RESPONSIBILITIES:
1. Transcribe the doctor's dictation exactly as spoken. Do NOT summarize or condense.
2. Place the transcribed dictation under "clinicalNotes".
3. If medication/treatment is spoken, extract that exact transcription under "treatmentPlan". Otherwise, set "treatmentPlan" to "NIL".`,
  followupText: `Analyze the audio and generate a follow-up medical report.
Focus ONLY on clinical data. Discard all non-clinical conversation.

Required Fields:
1. Clinical Notes
2. Treatment Plan: Optional. Set to "NIL" if no treatments are spoken.`,
};

const schemas = {
  opd: {
    type: Type.OBJECT,
    properties: {
      chiefComplaint: { type: Type.STRING, description: "Chief Complaint and duration" },
      historyOfPresentIllness: { type: Type.STRING, description: "History of Present Illness" },
      pastMedicalHistory: { type: Type.STRING, description: "Past Medical History" },
      familyHistory: { type: Type.STRING, description: "Family History" },
      personalHistory: { type: Type.STRING, description: "Personal history" },
      developmentalHistory: { type: Type.STRING, description: "Developmental History (pediatric cases only, else NIL)" },
      vaccinationHistory: { type: Type.STRING, description: "Vaccination History (pediatric cases only, else NIL)" },
      generalExamination: { type: Type.STRING, description: "General Examination Findings" },
      mentalStatusExamination: { type: Type.STRING, description: "Mental Status Examination (if applicable, else NIL)" },
      systemicExamination: { type: Type.STRING, description: "Systemic Examination Findings" },
      provisionalDiagnosis: { type: Type.STRING, description: "Provisional Diagnosis" },
      treatmentPlan: { type: Type.STRING, description: "Treatment Plan and Advice (bullet points or NIL)" },
    },
    required: [
      "chiefComplaint",
      "historyOfPresentIllness",
      "pastMedicalHistory",
      "familyHistory",
      "personalHistory",
      "developmentalHistory",
      "vaccinationHistory",
      "generalExamination",
      "mentalStatusExamination",
      "systemicExamination",
      "provisionalDiagnosis",
      "treatmentPlan",
    ],
  },
  followup: {
    type: Type.OBJECT,
    properties: {
      clinicalNotes: { type: Type.STRING, description: "Detailed follow-up progress, symptoms, exam findings, and observations." },
      treatmentPlan: { type: Type.STRING, description: "Optional medications, dosage updates, instructions, or tests. Set to NIL if absent." },
    },
    required: ["clinicalNotes", "treatmentPlan"],
  },
};

const main = document.getElementById("main");
const backButton = document.getElementById("backButton");
const brandButton = document.getElementById("brandButton");
const modelLabel = document.getElementById("modelLabel");
const settingsButton = document.getElementById("settingsButton");
const settingsPanel = document.getElementById("settingsPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const darkToggle = document.getElementById("darkToggle");
const accuracyToggle = document.getElementById("accuracyToggle");
const saveSettingsButton = document.getElementById("saveSettingsButton");

function setView(view, options = {}) {
  state.view = view;
  Object.assign(state, options);
  render();
}

function render() {
  document.body.classList.toggle("dark", state.dark);
  darkToggle.classList.toggle("active", state.dark);
  accuracyToggle.classList.toggle("active", state.highAccuracy);
  apiKeyInput.value = state.apiKey;
  backButton.classList.toggle("hidden", state.view === "dashboard");
  if (modelLabel) modelLabel.textContent = `Model: ${state.highAccuracy ? "Gemini-3-Pro-Preview" : "Gemini-2.5-Flash"}`;

  if (state.view === "dashboard") renderDashboard();
  if (state.view === "workspace") renderWorkspace();
  if (state.view === "processing") renderProcessing();
  if (state.view === "error") renderError();
  if (state.view === "result") renderResult();
}

function renderDashboard() {
  main.innerHTML = `
    <section class="dashboard">
      <div class="intro">
        <span class="pill">Outpatient Department Scribing</span>
        <h1>Select OPD Session Type</h1>
        <p>Choose between creating a comprehensive new patient case sheet or a rapid, streamlined follow-up visit.</p>
      </div>
      <div class="cards">
        <button class="mode-card" type="button" data-submode="new">
          <span class="number">01</span>
          <h2>New Patient</h2>
          <p>Generates a complete medical case sheet from dictation containing History, Physical Examination, Provisional Diagnosis, and Treatment Plan.</p>
          <span class="card-link">Access New Case Sheet →</span>
        </button>
        <button class="mode-card indigo" type="button" data-submode="followup">
          <span class="number">02</span>
          <h2>Follow-up Visit</h2>
          <p>Quick progress charting focused on Clinical Notes and optional Treatment Plans. Streamlined for hospital follow-ups.</p>
          <span class="card-link">Access Follow-up Sheet →</span>
        </button>
      </div>
    </section>
  `;
  main.querySelectorAll("[data-submode]").forEach((button) => {
    button.addEventListener("click", () => setView("workspace", { submode: button.dataset.submode }));
  });
}

function renderWorkspace() {
  const followup = state.submode === "followup";
  main.innerHTML = `
    <section class="workspace ${followup ? "followup" : ""}">
      <div class="workspace-head">
        <span class="pill">${followup ? "OPD Follow-up" : "OPD New Patient"}</span>
        <p class="subcopy">${followup ? "Dictate clinical progress, checks, exams, and any treatment plan." : "Just dictate the case details in one go; this AI scribe will prepare your final OPD Case Sheet."}</p>
      </div>
      <div class="recorder-card">
        <canvas id="visualizer" class="visualizer" width="760" height="180"></canvas>
        <div id="recordActions" class="record-actions"></div>
        <div id="timer" class="timer">00:00</div>
        <p id="statusText" class="status">${state.strict ? "Strict Dictation Mode Activated" : state.highAccuracy ? "Ready to record with 10X accuracy" : "Ready to record"}</p>
      </div>
      <button id="strictToggle" class="strict-toggle ${state.strict ? "active" : ""}" type="button">
        <span class="checkbox">${state.strict ? "✓" : ""}</span>
        <span>Strict Dictation Mode</span>
      </button>
      <div class="trust-row"><span>Secure</span><span>Accurate</span><span>HIPAA Compliant Design</span></div>
    </section>
  `;
  document.getElementById("strictToggle").addEventListener("click", () => {
    state.strict = !state.strict;
    renderWorkspace();
  });
  renderRecorderActions(false);
  drawIdleVisualizer();
}

function renderRecorderActions(recording, paused = false) {
  const actions = document.getElementById("recordActions");
  if (!actions) return;
  if (!recording) {
    actions.innerHTML = `<button id="startButton" class="round-button record" type="button" title="Start Recording">●</button>`;
    document.getElementById("startButton").addEventListener("click", startRecording);
    return;
  }
  actions.innerHTML = `
    <button id="pauseButton" class="round-button pause" type="button" title="${paused ? "Resume Recording" : "Pause Recording"}">${paused ? "▶" : "Ⅱ"}</button>
    <button id="stopButton" class="round-button stop" type="button" title="Finish & Process">■</button>
    <button id="discardButton" class="round-button discard" type="button" title="Discard & Restart">×</button>
  `;
  document.getElementById("pauseButton").addEventListener("click", togglePause);
  document.getElementById("stopButton").addEventListener("click", stopRecording);
  document.getElementById("discardButton").addEventListener("click", discardRecording);
}

async function startRecording() {
  if (!state.apiKey) {
    settingsPanel.classList.remove("hidden");
    document.getElementById("statusText").textContent = "Add your Gemini API key in Settings first.";
    return;
  }

  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.recorder = new MediaRecorder(state.stream);
    state.chunks = [];
    state.seconds = 0;
    state.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    };
    state.recorder.onstop = handleRecordingStop;
    state.recorder.start();
    startTimer();
    startVisualizer(state.stream);
    renderRecorderActions(true);
    document.getElementById("statusText").textContent = "Recording in progress...";
  } catch (error) {
    document.getElementById("statusText").textContent = "Microphone access denied. Please enable microphone permissions.";
  }
}

function togglePause() {
  if (!state.recorder) return;
  if (state.recorder.state === "recording") {
    state.recorder.pause();
    stopTimer();
    renderRecorderActions(true, true);
    document.getElementById("statusText").textContent = "Recording paused";
  } else if (state.recorder.state === "paused") {
    state.recorder.resume();
    startTimer();
    renderRecorderActions(true, false);
    document.getElementById("statusText").textContent = "Recording in progress...";
  }
}

function stopRecording() {
  if (!state.recorder) return;
  state.recorder.stop();
}

function discardRecording() {
  if (!state.recorder) return;
  state.chunks = [];
  state.recorder.onstop = cleanupMedia;
  state.recorder.stop();
  renderWorkspace();
}

function cleanupMedia() {
  stopTimer();
  stopVisualizer();
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.recorder = null;
}

async function handleRecordingStop() {
  const blob = new Blob(state.chunks, { type: "audio/webm" });
  cleanupMedia();
  setView("processing");
  try {
    const result = await scribeAudio(blob);
    state.report = result.report;
    state.modelUsed = result.modelUsed;
    setView("result");
  } catch (error) {
    setView("error", { lastError: error.message || "Unable to Connect to Internet. Please Contact the IT Department." });
  }
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    state.seconds += 1;
    const timer = document.getElementById("timer");
    if (timer) timer.textContent = formatTime(state.seconds);
    if (state.seconds >= 420) stopRecording();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) window.clearInterval(state.timerId);
  state.timerId = null;
}

function formatTime(value) {
  const minutes = Math.floor(value / 60).toString().padStart(2, "0");
  const seconds = (value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function drawIdleVisualizer() {
  const canvas = document.getElementById("visualizer");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue("--border");
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

function startVisualizer(stream) {
  const canvas = document.getElementById("visualizer");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  state.audioContext = new AudioContext();
  const source = state.audioContext.createMediaStreamSource(stream);
  state.analyser = state.audioContext.createAnalyser();
  state.analyser.fftSize = 2048;
  source.connect(state.analyser);
  const data = new Uint8Array(state.analyser.frequencyBinCount);

  const draw = () => {
    state.animationId = requestAnimationFrame(draw);
    state.analyser.getByteTimeDomainData(data);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--panel-soft");
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "#2563eb");
    gradient.addColorStop(0.5, "#06b6d4");
    gradient.addColorStop(1, "#2563eb");
    ctx.lineWidth = 3;
    ctx.strokeStyle = gradient;
    ctx.beginPath();
    const slice = canvas.width / data.length;
    let x = 0;
    for (let i = 0; i < data.length; i += 1) {
      const y = (data[i] / 128) * (canvas.height / 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.stroke();
  };
  draw();
}

function stopVisualizer() {
  if (state.animationId) cancelAnimationFrame(state.animationId);
  state.animationId = null;
  if (state.audioContext) state.audioContext.close().catch(() => {});
  state.audioContext = null;
  state.analyser = null;
}

function renderProcessing() {
  main.innerHTML = `
    <section class="processing">
      <div class="processing-card">
        <div class="spinner"></div>
        <h1>AI Scribe Working</h1>
        <p class="subcopy" id="processingText">Transcribing audio...</p>
        <div class="progress"><div id="progressBar" class="bar"></div></div>
      </div>
    </section>
  `;
  const messages = ["Transcribing audio...", "Identifying clinical entities...", "Structuring medical history...", "Formulating diagnosis...", "Finalizing treatment plan..."];
  let index = 0;
  let progress = 15;
  const interval = window.setInterval(() => {
    if (state.view !== "processing") {
      window.clearInterval(interval);
      return;
    }
    index = (index + 1) % messages.length;
    progress = Math.min(95, progress + 8);
    document.getElementById("processingText").textContent = messages[index];
    document.getElementById("progressBar").style.width = `${progress}%`;
  }, 1400);
}

function renderError() {
  main.innerHTML = `
    <section class="error-view">
      <div class="error-card">
        <h1>Connection Failed</h1>
        <p class="subcopy">${escapeHtml(state.lastError || "Unable to Connect to Internet. Please Contact the IT Department.")}</p>
        <div class="record-actions">
          <button id="retryButton" class="primary" type="button">Retry Audio Scribing</button>
          <button id="againButton" class="secondary" type="button">Record Again</button>
        </div>
      </div>
    </section>
  `;
  document.getElementById("retryButton").addEventListener("click", () => setView("workspace"));
  document.getElementById("againButton").addEventListener("click", () => setView("workspace"));
}

function renderResult() {
  const title = state.submode === "followup" ? "Generated Follow-up Sheet" : "Generated Case Sheet";
  main.innerHTML = `
    <section class="result-view">
      <div class="result-head">
        <h1>${title}</h1>
        <div class="toolbar">
          <button id="copyNoNilButton" class="secondary" type="button">Copy without NIL Sections</button>
          <button id="copyAllButton" class="primary" type="button">Copy All</button>
        </div>
      </div>
      <div id="sections" class="sections"></div>
    </section>
  `;
  renderSections();
  document.getElementById("copyAllButton").addEventListener("click", () => copyReport(false));
  document.getElementById("copyNoNilButton").addEventListener("click", () => copyReport(true));
  if (modelLabel) modelLabel.textContent = `Model: ${state.modelUsed || (state.highAccuracy ? "Gemini-3-Pro-Preview" : "Gemini-2.5-Flash")}`;
}

function sectionDefinitions() {
  if (state.submode === "followup") {
    return [
      ["clinicalNotes", "1. CLINICAL NOTES", true],
      ["treatmentPlan", "2. TREATMENT PLAN", true],
    ];
  }
  return [
    ["chiefComplaint", "1. PRESENTING COMPLAINT", true],
    ["historyOfPresentIllness", "2. HISTORY OF PRESENT ILLNESS", true],
    ["pastMedicalHistory", "3. PAST MEDICAL HISTORY", false],
    ["familyHistory", "4. FAMILY HISTORY", false],
    ["personalHistory", "5. PERSONAL HISTORY", false],
    ["developmentalHistory", "6. DEVELOPMENTAL HISTORY", false],
    ["vaccinationHistory", "7. VACCINATION HISTORY", false],
    ["generalExamination", "8. GENERAL EXAMINATION", false],
    ["mentalStatusExamination", "9. MENTAL STATUS EXAMINATION", true],
    ["systemicExamination", "10. SYSTEMIC EXAMINATION", true],
    ["provisionalDiagnosis", "11. PROVISIONAL DIAGNOSIS", true],
    ["treatmentPlan", "12. TREATMENT PLAN", true],
  ];
}

function renderSections() {
  const container = document.getElementById("sections");
  container.innerHTML = sectionDefinitions()
    .filter(([key]) => state.report[key] !== undefined)
    .map(([key, label, wide]) => {
      const value = escapeHtml(state.report[key] || "NIL");
      return `
        <article class="section-card ${wide ? "wide" : ""}" data-key="${key}">
          <h2>${label}</h2>
          <p>${value}</p>
          <div class="section-actions">
            <button class="icon-button edit" type="button" title="Edit">✎</button>
            <button class="icon-button copy" type="button" title="Copy">⧉</button>
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll(".copy").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.closest(".section-card").dataset.key;
      navigator.clipboard.writeText(state.report[key] || "");
    });
  });
  container.querySelectorAll(".edit").forEach((button) => {
    button.addEventListener("click", () => editSection(button.closest(".section-card").dataset.key));
  });
}

function editSection(key) {
  const card = document.querySelector(`[data-key="${key}"]`);
  const label = card.querySelector("h2").textContent;
  card.innerHTML = `
    <h2>${label}</h2>
    <textarea>${escapeHtml(state.report[key] || "")}</textarea>
    <div class="section-actions">
      <button class="secondary save-edit" type="button">Save Changes</button>
      <button class="icon-button cancel-edit" type="button" title="Cancel">×</button>
    </div>
  `;
  card.querySelector(".save-edit").addEventListener("click", () => {
    state.report[key] = card.querySelector("textarea").value;
    renderSections();
  });
  card.querySelector(".cancel-edit").addEventListener("click", renderSections);
}

function copyReport(skipNil) {
  const text = sectionDefinitions()
    .filter(([key]) => state.report[key] !== undefined)
    .filter(([key]) => !skipNil || String(state.report[key]).trim().toUpperCase() !== "NIL")
    .map(([key, label]) => `${label}\n${state.report[key] || "NIL"}`)
    .join("\n\n");
  navigator.clipboard.writeText(text);
}

function getGeminiConfig() {
  const followup = state.submode === "followup";
  if (followup) {
    return {
      systemInstruction: state.strict ? prompts.followupStrict : prompts.followupNormal,
      promptText: prompts.followupText,
      schema: schemas.followup,
    };
  }
  return {
    systemInstruction: state.strict ? prompts.opdStrict : prompts.opdNormal,
    promptText: prompts.opdText,
    schema: schemas.opd,
  };
}

async function scribeAudio(blob) {
  const audioBase64 = await blobToBase64(blob);
  const config = getGeminiConfig();
  const firstModel = state.highAccuracy ? MODELS.highAccuracy : MODELS.default;
  const callModel = (model) => generateContent(model, audioBase64, blob.type || "audio/webm", config);

  const result = await retry(async () => {
    try {
      return await callModel(firstModel);
    } catch (error) {
      const shouldFallback = firstModel === MODELS.default && (error.status === 503 || error.message.includes("503"));
      if (!shouldFallback) throw error;
      try {
        return await callModel(MODELS.fallback1);
      } catch (fallbackError) {
        const fallbackAgain = fallbackError.status === 503 || fallbackError.message.includes("503");
        if (!fallbackAgain) throw fallbackError;
        return callModel(MODELS.fallback2);
      }
    }
  });

  return { report: JSON.parse(result.text), modelUsed: result.modelUsed };
}

async function generateContent(model, audioBase64, mimeType, config) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": state.apiKey,
    },
    body: JSON.stringify({
      contents: {
        parts: [{ inlineData: { mimeType, data: audioBase64 } }, { text: config.promptText }],
      },
      systemInstruction: {
        parts: [{ text: config.systemInstruction }],
      },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        responseSchema: config.schema,
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || response.statusText || "Gemini request failed");
    error.status = response.status;
    throw error;
  }
  const text = body?.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) throw new Error("No response text received from Gemini.");
  return { text, modelUsed: model };
}

async function retry(fn, attempts = 3, delayMs = 2000) {
  try {
    return await fn();
  } catch (error) {
    const retryable = attempts > 0 && (error.status >= 500 || /fetch|network|failed/i.test(error.message));
    if (!retryable) throw error;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return retry(fn, attempts - 1, delayMs * 2);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

backButton.addEventListener("click", () => {
  cleanupMedia();
  setView("dashboard", { submode: null, report: null });
});
brandButton.addEventListener("click", () => setView("dashboard", { submode: null }));
settingsButton.addEventListener("click", () => settingsPanel.classList.toggle("hidden"));
darkToggle.addEventListener("click", () => {
  state.dark = !state.dark;
  localStorage.setItem("mosc_dark_mode", String(state.dark));
  render();
});
accuracyToggle.addEventListener("click", () => {
  state.highAccuracy = !state.highAccuracy;
  localStorage.setItem("mosc_high_accuracy", String(state.highAccuracy));
  render();
});
saveSettingsButton.addEventListener("click", () => {
  state.apiKey = apiKeyInput.value.trim();
  localStorage.setItem("mosc_gemini_api_key", state.apiKey);
  settingsPanel.classList.add("hidden");
});

render();
