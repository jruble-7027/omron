(() => {
  // Configure pdf.js worker if available
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  // Default Standards Catalog (OSHA / ANSI / ISO)
  const STANDARDS = {
    ansi: [
      { id: "ANSI B11.0", label: "ANSI B11.0 (Risk Assessment)", defaultOn: true },
      { id: "ANSI B11.18", label: "ANSI B11.18 (Coil / Slitter / Mill)", defaultOn: true },
      { id: "ANSI B11.19", label: "ANSI B11.19 (Safeguarding)", defaultOn: true },
      { id: "ANSI B11.20", label: "ANSI B11.20 (Integrated Systems)", defaultOn: true },
      { id: "ANSI B11.26", label: "ANSI B11.26 (Functional Safety)", defaultOn: false },
      { id: "ANSI Z244.1", label: "ANSI Z244.1 (LOTO / Energy)", defaultOn: false },
      { id: "ANSI Z535", label: "ANSI Z535 (Safety Signs)", defaultOn: false }
    ],
    iso: [
      { id: "ISO 12100", label: "ISO 12100 (Risk Reduction)", defaultOn: true },
      { id: "ISO 14119", label: "ISO 14119 (Interlocks / Locking)", defaultOn: true },
      { id: "ISO 13850", label: "ISO 13850 (Emergency Stop)", defaultOn: true },
      { id: "ISO 14120", label: "ISO 14120 (Fixed/Movable Guards)", defaultOn: false },
      { id: "ISO 13855", label: "ISO 13855 (Light Curtain / Scanner Dist.)", defaultOn: false },
      { id: "ISO 13857", label: "ISO 13857 (Safety Reach Distances)", defaultOn: false },
      { id: "ISO 13849-1", label: "ISO 13849-1 (Safety Control PL)", defaultOn: false }
    ],
    osha: [
      { id: "OSHA 29 CFR 1910.212", label: "1910.212 (Machine Guarding)", defaultOn: true },
      { id: "OSHA 29 CFR 1910.147", label: "1910.147 (LOTO / Energy Isolation)", defaultOn: true },
      { id: "OSHA 29 CFR 1910.217", label: "1910.217 (Mechanical Presses)", defaultOn: false },
      { id: "OSHA 29 CFR 1910.219", label: "1910.219 (Power Transmission)", defaultOn: false },
      { id: "OSHA 29 CFR 1910.303", label: "1910.303 (Electrical Clearance)", defaultOn: false },
      { id: "OSHA 29 CFR 1910.22", label: "1910.22 (Walkways / Surfaces)", defaultOn: false },
      { id: "OSHA 29 CFR 1910.144", label: "1910.144 (Safety Color Coding)", defaultOn: false }
    ]
  };

  const RECENT_KEY = "omron_recent_layouts_v1";

  const state = {
    file: null,
    traceImages: [],      // Array of data URLs (1 per image or 1 per PDF page)
    tracePageIdx: 0,
    traceOpacity: 0,      // 0..65 (%)
    selectedStds: new Set(),
    customStds: [],
    currentSpec: null,
    activePageIdx: 0,
    selectedItem: null    // { arrayKey, index, item }
  };

  // DOM refs
  const $ = id => document.getElementById(id);
  const dropZone = $("dropZone");
  const fileInput = $("fileInput");
  const dropPrompt = $("dropPrompt");
  const filePreview = $("filePreview");
  const imgThumb = $("imgThumb");
  const pdfBadge = $("pdfBadge");
  const fileName = $("fileName");
  const fileSize = $("fileSize");
  const btnClearFile = $("btnClearFile");

  const customStdInput = $("customStdInput");
  const btnAddStd = $("btnAddStd");
  const customPills = $("customPills");
  const chkShowStdBox = $("chkShowStdBox");

  const tabDirect = $("tabDirect");
  const tabManual = $("tabManual");
  const panelDirect = $("panelDirect");
  const panelManual = $("panelManual");
  const apiKeyInput = $("apiKeyInput");
  const modelSelect = $("modelSelect");
  const btnAnalyze = $("btnAnalyze");
  const aiStatus = $("aiStatus");

  const btnCopyPrompt = $("btnCopyPrompt");
  const copyConfirm = $("copyConfirm");
  const jsonInput = $("jsonInput");
  const btnParseJson = $("btnParseJson");
  const manualStatus = $("manualStatus");

  const recentSelect = $("recentSelect");
  const btnLoadSample = $("btnLoadSample");
  const btnDownloadBom = $("btnDownloadBom");
  const btnDownloadVsdx = $("btnDownloadVsdx");
  const btnDownloadJson = $("btnDownloadJson");
  const traceBar = $("traceBar");
  const traceOpacity = $("traceOpacity");
  const traceVal = $("traceVal");
  const tracePdfPage = $("tracePdfPage");
  const pageTabs = $("pageTabs");
  const emptyPreview = $("emptyPreview");
  const visioSvg = $("visioSvg");
  const previewSubtitle = $("previewSubtitle");
  const worksheetBar = $("worksheetBar");
  const statsBar = $("statsBar");

  const shapeInspector = $("shapeInspector");
  const inspTitle = $("inspTitle");
  const inspText = $("inspText");
  const inspSize = $("inspSize");
  const btnFlipOrient = $("btnFlipOrient");
  const btnDeleteShape = $("btnDeleteShape");
  const btnCloseInsp = $("btnCloseInsp");

  // Init API key from localStorage
  apiKeyInput.value = localStorage.getItem("omron_gemini_api_key") || "";
  apiKeyInput.addEventListener("input", () => {
    localStorage.setItem("omron_gemini_api_key", apiKeyInput.value.trim());
  });

  // =========================================================================
  // RECENT DRAWINGS HISTORY (localStorage)
  // =========================================================================
  function getRecentLayouts() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
    catch { return []; }
  }

  function saveToRecent(spec) {
    if (!spec || !spec.pages?.length) return;
    const list = getRecentLayouts();
    const label = `${spec.output_name || spec.machine || "Layout"} (${new Date().toLocaleDateString()})`;
    const filtered = list.filter(x => x.spec?.output_name !== spec.output_name);
    filtered.unshift({ label, savedAt: Date.now(), spec });
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, 8)));
    } catch { /* ignore quota */ }
    renderRecentDropdown();
  }

  function renderRecentDropdown() {
    const list = getRecentLayouts();
    if (!list.length) {
      recentSelect.classList.add("hidden");
      return;
    }
    recentSelect.classList.remove("hidden");
    recentSelect.innerHTML = '<option value="">Recent Drawings...</option>';
    list.forEach((entry, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = entry.label;
      recentSelect.appendChild(opt);
    });
  }

  recentSelect.addEventListener("change", () => {
    const idx = recentSelect.value;
    if (idx === "") return;
    const entry = getRecentLayouts()[Number(idx)];
    if (entry?.spec) {
      jsonInput.value = JSON.stringify(entry.spec, null, 2);
      loadSpec(entry.spec, false);
    }
    recentSelect.value = "";
  });

  // =========================================================================
  // STANDARDS PILLS (OSHA / ANSI / ISO + Custom)
  // =========================================================================
  function renderStdGroup(containerId, items) {
    const el = $(containerId);
    el.innerHTML = "";
    for (const item of items) {
      if (item.defaultOn) state.selectedStds.add(item.label);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill" + (state.selectedStds.has(item.label) ? " selected" : "");
      btn.textContent = item.label;
      btn.addEventListener("click", () => {
        if (state.selectedStds.has(item.label)) {
          state.selectedStds.delete(item.label);
          btn.classList.remove("selected");
        } else {
          state.selectedStds.add(item.label);
          btn.classList.add("selected");
        }
        if (state.currentSpec) renderPreview();
      });
      el.appendChild(btn);
    }
  }

  function renderCustomPills() {
    customPills.innerHTML = "";
    for (const std of state.customStds) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pill custom-pill";
      btn.textContent = `${std} ×`;
      btn.title = "Tap to remove";
      btn.addEventListener("click", () => {
        state.customStds = state.customStds.filter(x => x !== std);
        renderCustomPills();
        if (state.currentSpec) renderPreview();
      });
      customPills.appendChild(btn);
    }
  }

  function addCustomStandard() {
    const val = customStdInput.value.trim();
    if (!val) return;
    if (!state.customStds.includes(val)) {
      state.customStds.push(val);
      renderCustomPills();
      if (state.currentSpec) renderPreview();
    }
    customStdInput.value = "";
  }

  btnAddStd.addEventListener("click", addCustomStandard);
  customStdInput.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addCustomStandard(); }
  });
  chkShowStdBox.addEventListener("change", () => {
    if (state.currentSpec) renderPreview();
  });

  function getSelectedStandards() {
    return [...state.selectedStds, ...state.customStds];
  }

  // Tabs
  tabDirect.addEventListener("click", () => {
    tabDirect.classList.add("active"); tabManual.classList.remove("active");
    panelDirect.classList.remove("hidden"); panelManual.classList.add("hidden");
  });
  tabManual.addEventListener("click", () => {
    tabManual.classList.add("active"); tabDirect.classList.remove("active");
    panelManual.classList.remove("hidden"); panelDirect.classList.add("hidden");
  });

  // =========================================================================
  // FILE UPLOAD + TRACE-OVER PDF/IMAGE PREPARATION
  // =========================================================================
  async function prepareTraceImages(file) {
    state.traceImages = [];
    state.tracePageIdx = 0;
    tracePdfPage.classList.add("hidden");

    if (file.type.startsWith("image/")) {
      const url = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      state.traceImages = [url];
    } else if (window.pdfjsLib && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"))) {
      try {
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const maxPages = Math.min(pdf.numPages, 8);
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
          state.traceImages.push(canvas.toDataURL("image/jpeg", 0.85));
        }
        // Default trace page to the last page (usually the sketch page in Notability PDFs!)
        state.tracePageIdx = Math.max(0, state.traceImages.length - 1);
      } catch (err) {
        console.warn("PDF trace render skipped:", err);
      }
    }

    if (state.traceImages.length > 0) {
      traceBar.classList.remove("hidden");
      if (state.traceImages.length > 1) {
        tracePdfPage.classList.remove("hidden");
        tracePdfPage.innerHTML = "";
        state.traceImages.forEach((_, idx) => {
          const opt = document.createElement("option");
          opt.value = String(idx);
          opt.textContent = `PDF Pg ${idx + 1}`;
          if (idx === state.tracePageIdx) opt.selected = true;
          tracePdfPage.appendChild(opt);
        });
      }
    } else {
      traceBar.classList.add("hidden");
    }
    if (state.currentSpec) renderPreview();
  }

  traceOpacity.addEventListener("input", () => {
    state.traceOpacity = Number(traceOpacity.value);
    traceVal.textContent = state.traceOpacity === 0 ? "Off" : `${state.traceOpacity}%`;
    if (state.currentSpec) renderPreview();
  });

  tracePdfPage.addEventListener("change", () => {
    state.tracePageIdx = Number(tracePdfPage.value);
    if (state.currentSpec) renderPreview();
  });

  function handleFile(file) {
    if (!file) return;
    state.file = file;
    dropPrompt.classList.add("hidden");
    filePreview.classList.remove("hidden");
    fileName.textContent = file.name;
    fileSize.textContent = `${(file.size / 1024).toFixed(1)} KB · ${file.type || "Document"}`;
    if (file.type.startsWith("image/")) {
      imgThumb.src = URL.createObjectURL(file);
      imgThumb.classList.remove("hidden");
      pdfBadge.classList.add("hidden");
    } else {
      imgThumb.classList.add("hidden");
      pdfBadge.classList.remove("hidden");
    }
    prepareTraceImages(file);
  }

  fileInput.addEventListener("change", e => handleFile(e.target.files[0]));
  dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  btnClearFile.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    state.file = null;
    state.traceImages = [];
    state.traceOpacity = 0;
    traceOpacity.value = "0";
    traceVal.textContent = "Off";
    traceBar.classList.add("hidden");
    fileInput.value = "";
    filePreview.classList.add("hidden");
    dropPrompt.classList.remove("hidden");
    if (state.currentSpec) renderPreview();
  });

  // =========================================================================
  // DYNAMIC AI PROMPT (Includes Selected Standards + Worksheet Extraction)
  // =========================================================================
  function buildPrompt() {
    const stds = getSelectedStandards();
    const stdBlock = stds.length
      ? stds.map(s => `- ${s}`).join("\n")
      : "- ANSI B11.0 / ISO 12100\n- ANSI B11.18\n- ANSI B11.19\n- ANSI B11.20\n- OSHA 29 CFR 1910.212";

    return `You are an Omron Advanced Services machine safety engineer converting a Notability safeguarding design worksheet PDF/image into a HIGH-DETAIL, ACCURATE JSON layout specification for an automated Microsoft Visio (.vsdx) builder using Omron's native Visio masters.

Analyze EVERY page of the attached Notability drawing (Page 1 worksheet header/risk scores/photo numbers, mesh guarding / BOM dimensions, and every red/black top-down machine layout sketch).

STRICT FIDELITY RULES:
1. TRACE EVERY DETAIL — do NOT oversimplify!
   - Include ALL black machine boxes, conveyors, roll stands, scrap chutes, tables, consoles, and cabinets.
   - Include ALL existing black perimeter/divider fence segments ("kind": "existing").
   - Do NOT merge multiple individual red guard panels into one bar. Emit each panel segment individually with its own letter tag.
2. USE OMRON'S EXACT SHORTHAND & LEGEND MAPPING:
   - Guard materials ("fences[].kind"): "mesh" (wire mesh), "polycarbonate" (cyan/lexan), "sheet_metal" (hatched), "existing" (existing black fence)
   - "LSB" / slide bolt w/ locking       -> device type: "locking_slide_bolt"
   - Slide bolt w/ non-locking           -> device type: "slide_bolt_non_locking"
   - "RS" / Reset button                 -> device type: "reset"
   - "AR" / Access Request               -> device type: "access_request"
   - "AR / RS" combo                     -> emit BOTH "access_request" and "reset" (or "reset_estop")
   - "[X] L" / locking interlock         -> device type: "locking"
   - "[X] N" / non-locking interlock     -> device type: "non_locking"
   - "[X] R" / rolling limit switch      -> device type: "rolling_limit"
   - "[X] M" / magnetic interlock        -> device type: "magnetic"
   - Existing interlock                  -> device type: "existing_interlock"
   - E-Stop button                       -> device type: "e_stop" (or "e_stop_existing")
   - Red dot / E-Stop w/ ring guard      -> device type: "ring_guard"
   - Start / Stop E-Stop station         -> device type: "start_stop_estop"
   - Disconnect / Start Stop / E-Stop    -> device type: "disconnect_start_stop_estop"
   - New / Existing Disconnect           -> device type: "disconnect_new" or "disconnect"
   - Enabling device / switch            -> device type: "enabling"
   - Yellow safety controller / SIC      -> device type: "safety_ctrl"
   - Air lockout valve (e.g. 1/2" valve) -> device type: "air_lockout" (and "frl" if FRL shown)
   - Light Curtain Transmitter ("T")     -> device type: "lc_trans"
   - Light Curtain Receiver ("R")        -> device type: "lc_rec"
   - Light Curtain Mirror ("M")          -> device type: "lc_mirror"
   - Light Curtain optical beam          -> add entry in "lc_beams": [{ "x1": ..., "y1": ..., "x2": ..., "y2": ... }]
   - New / Existing Area Laser Scanner   -> "scanner_red" or "scanner_existing"
   - Wavy cut-off break lines            -> "cutoffs": [{ "kind": "start" or "end", "x": ..., "y": ..., "h": ... }]
3. JSON FORMATTING RULE:
   - Return ONLY valid JSON (no prose before or after).
   - NEVER use unescaped double quotes (") for inches inside strings. Write "in" (e.g. 55 in x 48 in).
4. COORDINATE RULES (8.5" x 11" Portrait Visio Sheet):
   - Machine layout canvas: X = 0.65 to 7.85, Y = 4.65 to 9.15
   - Leave Y = 2.60 to 4.50 empty (auto-filled with MESH GUARDING block)
   - Leave Y = 0.00 to 2.45 empty (auto-filled with Omron's bottom legend)
   - Leave Y = 9.50 to 11.0 empty (auto-filled with Omron's top header)
   - All (x, y) coordinates are the CENTER of each shape in inches.
5. APPLICABLE REGULATIONS SELECTED BY INSPECTOR (apply these to each fence/device "standard" field and page "standards" list):
${stdBlock}

JSON SCHEMA:
{
  "output_name": "Plant_Machine_Name",
  "show_standards_box": ${chkShowStdBox.checked},
  "plant": "Plant Name, City, ST",
  "machine": "Machine Type (Photos XX-YY)",
  "asset_line": "Model #          Serial #          Asset # XXXX",
  "worksheet": {
    "department": "Plant 4",
    "date": "10/29",
    "inspector": "RW / JC",
    "photo_range": "61 thru 104",
    "risk_before": "S3 / E2 / A3",
    "risk_after": "S2 / E1 / A1"
  },
  "pages": [
    {
      "name": "Page Tab Name",
      "header_machine": "Optional page subtitle",
      "cutoffs": [{ "kind": "start", "x": 0.65, "y": 7.0, "h": 2.5 }],
      "rectangles": [{ "x": 2.0, "y": 7.5, "w": 1.6, "h": 0.8, "label": "MACHINE", "fill": "#ffffff", "font_pt": 8.5 }],
      "arrows": [{ "x1": 3.0, "y1": 7.5, "x2": 3.8, "y2": 7.5 }],
      "lc_beams": [],
      "fences": [
        { "kind": "existing", "x": 5.5, "y": 8.7, "len": 1.8, "orient": "H" },
        { "kind": "mesh", "x": 4.0, "y": 6.0, "len": 0.9, "orient": "H", "standard": "ANSI B11.18 / B11.19", "note": "A = 55 in x 48 in FMG" }
      ],
      "letters": [{ "char": "A", "x": 4.0, "y": 5.72 }],
      "devices": [{ "type": "locking_slide_bolt", "x": 4.4, "y": 6.0, "standard": "ISO 14119 / ANSI B11.19", "note": "LSB" }],
      "labels": [{ "text": "LSB", "x": 4.4, "y": 5.7, "w": 0.6, "h": 0.22, "color": "#c00000", "font_pt": 7.5 }],
      "mesh_title": "MESH GUARDING",
      "mesh_guarding": ["A = 55 in X 48 in FMG"],
      "standards": ["ANSI B11.0 / ISO 12100: Risk Assessment & Reduction"]
    }
  ]
}`;
  }

  function showStatus(el, type, msg) {
    el.className = `status-box ${type}`;
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  // Copy Custom Prompt
  btnCopyPrompt.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildPrompt());
      copyConfirm.classList.remove("hidden");
      setTimeout(() => copyConfirm.classList.add("hidden"), 2200);
    } catch {
      showStatus(manualStatus, "error", "Could not access clipboard—copy directly from HTTPS or localhost.");
    }
  });

  // Manual JSON Build
  btnParseJson.addEventListener("click", () => {
    try {
      const spec = VisioBuilder.parseAiJson(jsonInput.value);
      loadSpec(spec, true);
      showStatus(manualStatus, "success", `Loaded ${spec.pages.length} page(s)! Review/nudge in the preview and tap Download .vsdx.`);
    } catch (err) {
      showStatus(manualStatus, "error", err.message);
    }
  });

  // Direct Gemini API Convert
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Failed to read uploaded file."));
      reader.readAsDataURL(file);
    });
  }

  btnAnalyze.addEventListener("click", async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!state.file) return showStatus(aiStatus, "error", "Please upload a Notability PDF or image first (Step 1).");
    if (!apiKey) return showStatus(aiStatus, "error", "Enter your Gemini API key above, or switch to Corporate Copy-Paste mode.");

    btnAnalyze.disabled = true;
    showStatus(aiStatus, "info", "Analyzing drawing with Gemini Vision & applying selected OSHA / ANSI / ISO regulations...");

    try {
      const b64 = await fileToBase64(state.file);
      const mimeType = state.file.type || (state.file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
      const model = modelSelect.value;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: buildPrompt() },
              { inline_data: { mime_type: mimeType, data: b64 } }
            ]
          }],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json"
          }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || `Gemini API error (${res.status})`);
      }

      const rawText = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n") || "";
      const spec = VisioBuilder.parseAiJson(rawText);
      jsonInput.value = JSON.stringify(spec, null, 2);
      loadSpec(spec, true);
      showStatus(aiStatus, "success", `Done! Generated ${spec.pages.length} page(s). Use the Trace Sketch slider or drag shapes to fine-tune.`);
    } catch (err) {
      showStatus(aiStatus, "error", err.message);
    } finally {
      btnAnalyze.disabled = false;
    }
  });

  // =========================================================================
  // SHAPE INSPECTOR (Tap-to-Edit / Flip / Resize / Delete)
  // =========================================================================
  function selectItem(arrayKey, index, item) {
    state.selectedItem = { arrayKey, index, item };
    shapeInspector.classList.remove("hidden");

    const titles = {
      rectangles: "Machine / Box",
      fences: `Guard Fence (${item.kind || "mesh"})`,
      letters: "Letter Tag",
      devices: `Safety Device (${item.type || "device"})`,
      labels: "Text Label"
    };
    inspTitle.textContent = `Selected: ${titles[arrayKey] || arrayKey}`;

    if (arrayKey === "rectangles") {
      inspText.value = item.label || "";
      inspText.placeholder = "Box label";
      inspSize.value = item.w ?? "";
      inspSize.placeholder = "Width (in)";
      inspSize.classList.remove("hidden");
      btnFlipOrient.classList.add("hidden");
    } else if (arrayKey === "fences") {
      inspText.value = item.note || "";
      inspText.placeholder = "Guard note / dimensions";
      inspSize.value = item.len ?? "";
      inspSize.placeholder = "Length (in)";
      inspSize.classList.remove("hidden");
      btnFlipOrient.classList.remove("hidden");
    } else if (arrayKey === "letters") {
      inspText.value = item.char || "";
      inspText.placeholder = "Letter (A-N)";
      inspSize.classList.add("hidden");
      btnFlipOrient.classList.add("hidden");
    } else if (arrayKey === "devices") {
      inspText.value = item.note || "";
      inspText.placeholder = "Device note";
      inspSize.classList.add("hidden");
      btnFlipOrient.classList.add("hidden");
    } else if (arrayKey === "labels") {
      inspText.value = item.text || "";
      inspText.placeholder = "Label text";
      inspSize.classList.add("hidden");
      btnFlipOrient.classList.add("hidden");
    }
    renderPreview();
  }

  function clearSelection() {
    state.selectedItem = null;
    shapeInspector.classList.add("hidden");
    if (state.currentSpec) renderPreview();
  }

  inspText.addEventListener("input", () => {
    const sel = state.selectedItem;
    if (!sel) return;
    if (sel.arrayKey === "rectangles") sel.item.label = inspText.value;
    else if (sel.arrayKey === "fences" || sel.arrayKey === "devices") sel.item.note = inspText.value;
    else if (sel.arrayKey === "letters") sel.item.char = inspText.value.slice(0, 2).toUpperCase();
    else if (sel.arrayKey === "labels") sel.item.text = inspText.value;
    jsonInput.value = JSON.stringify(state.currentSpec, null, 2);
    renderPreview();
  });

  inspSize.addEventListener("input", () => {
    const sel = state.selectedItem;
    const v = Number(inspSize.value);
    if (!sel || !v || v <= 0) return;
    if (sel.arrayKey === "rectangles") sel.item.w = v;
    else if (sel.arrayKey === "fences") sel.item.len = v;
    jsonInput.value = JSON.stringify(state.currentSpec, null, 2);
    renderPreview();
  });

  btnFlipOrient.addEventListener("click", () => {
    const sel = state.selectedItem;
    if (!sel || sel.arrayKey !== "fences") return;
    delete sel.item.angle_deg;
    sel.item.orient = (sel.item.orient === "V" || sel.item.orient === "vertical") ? "H" : "V";
    jsonInput.value = JSON.stringify(state.currentSpec, null, 2);
    renderPreview();
  });

  btnDeleteShape.addEventListener("click", () => {
    const sel = state.selectedItem;
    if (!sel || !state.currentSpec) return;
    const pg = state.currentSpec.pages[state.activePageIdx];
    if (pg && Array.isArray(pg[sel.arrayKey])) {
      pg[sel.arrayKey].splice(sel.index, 1);
      jsonInput.value = JSON.stringify(state.currentSpec, null, 2);
    }
    clearSelection();
  });

  btnCloseInsp.addEventListener("click", clearSelection);

  // =========================================================================
  // LOAD SPEC & RENDER LIVE SVG PREVIEW
  // =========================================================================
  function loadSpec(spec, saveRecent = false) {
    state.currentSpec = spec;
    state.activePageIdx = 0;
    state.selectedItem = null;
    shapeInspector.classList.add("hidden");
    btnDownloadBom.disabled = false;
    btnDownloadVsdx.disabled = false;
    btnDownloadJson.disabled = false;
    previewSubtitle.textContent = `${spec.plant || "Omron Layout"} — ${spec.machine || ""}`;
    if (saveRecent) saveToRecent(spec);
    renderPageTabs();
    renderWorksheetSummary();
    renderPreview();
  }

  function renderWorksheetSummary() {
    const ws = state.currentSpec?.worksheet;
    if (!ws || !Object.values(ws).some(Boolean)) {
      worksheetBar.classList.add("hidden");
      return;
    }
    const parts = [];
    if (ws.department) parts.push(`<strong>Dept:</strong> ${ws.department}`);
    if (ws.inspector) parts.push(`<strong>By:</strong> ${ws.inspector}`);
    if (ws.date) parts.push(`<strong>Date:</strong> ${ws.date}`);
    if (ws.photo_range) parts.push(`<strong>Photos:</strong> ${ws.photo_range}`);
    if (ws.risk_before) parts.push(`<strong>Risk Before:</strong> ${ws.risk_before}`);
    if (ws.risk_after) parts.push(`<strong>Risk After:</strong> ${ws.risk_after}`);
    worksheetBar.innerHTML = parts.join(" &nbsp;|&nbsp; ");
    worksheetBar.classList.remove("hidden");
  }

  function renderPageTabs() {
    const pages = state.currentSpec?.pages || [];
    if (pages.length <= 1) {
      pageTabs.classList.add("hidden");
      return;
    }
    pageTabs.classList.remove("hidden");
    pageTabs.innerHTML = "";
    pages.forEach((p, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "page-tab" + (idx === state.activePageIdx ? " active" : "");
      btn.textContent = `${idx + 1}. ${p.name || "Page " + (idx + 1)}`;
      btn.addEventListener("click", () => {
        state.activePageIdx = idx;
        clearSelection();
        renderPageTabs();
        renderPreview();
      });
      pageTabs.appendChild(btn);
    });
  }

  function svgEl(tag, attrs = {}, text = "") {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text) el.textContent = text;
    return el;
  }

  const vx = x => Number(x) * 100;
  const vy = y => (11 - Number(y)) * 100;

  function renderPreview() {
    const spec = state.currentSpec;
    if (!spec || !spec.pages?.length) return;
    const pg = spec.pages[state.activePageIdx] || spec.pages[0];

    emptyPreview.classList.add("hidden");
    visioSvg.classList.remove("hidden");
    visioSvg.innerHTML = "";

    const defs = svgEl("defs");
    const marker = svgEl("marker", { id: "arr", viewBox: "0 0 10 10", refX: "8", refY: "5", markerWidth: "6", markerHeight: "6", orient: "auto-start-reverse" });
    marker.appendChild(svgEl("path", { d: "M 0 1 L 10 5 L 0 9 z", fill: "#1e293b" }));
    defs.appendChild(marker);
    visioSvg.appendChild(defs);

    // Outer Omron Sheet Border
    const bgRect = svgEl("rect", { x: 18, y: 18, width: 814, height: 1064, fill: "#ffffff", stroke: "#0f172a", "stroke-width": 2 });
    bgRect.addEventListener("click", () => { if (state.selectedItem) clearSelection(); });
    visioSvg.appendChild(bgRect);

    // Optional Trace-Over Sketch Image (ONLY in web preview, never exported to .vsdx)
    if (state.traceOpacity > 0 && state.traceImages[state.tracePageIdx]) {
      visioSvg.appendChild(svgEl("image", {
        href: state.traceImages[state.tracePageIdx],
        x: 30, y: 126, width: 790, height: 530,
        opacity: (state.traceOpacity / 100).toFixed(2),
        preserveAspectRatio: "xMidYMid meet",
        "pointer-events": "none"
      }));
    }

    // Top Header
    const h1 = pg.header_plant || spec.plant || "Plant Name";
    const h2 = pg.header_machine || spec.machine || "Machine Layout";
    const h3 = pg.header_asset || spec.asset_line || "";
    visioSvg.appendChild(svgEl("text", { x: 425, y: 58, "text-anchor": "middle", "font-size": 16, "font-weight": 700, fill: "#0f172a" }, h1));
    visioSvg.appendChild(svgEl("text", { x: 425, y: 82, "text-anchor": "middle", "font-size": 14, "font-weight": 600, fill: "#334155" }, h2));
    visioSvg.appendChild(svgEl("text", { x: 425, y: 104, "text-anchor": "middle", "font-size": 11, fill: "#64748b" }, h3));
    visioSvg.appendChild(svgEl("line", { x1: 18, y1: 122, x2: 832, y2: 122, stroke: "#cbd5e1", "stroke-width": 1 }));

    // Cutoffs
    for (const c of pg.cutoffs || []) {
      const cx = vx(c.x), cy = vy(c.y), ch = Number(c.h || 2.2) * 100;
      const yTop = cy - ch / 2, yBot = cy + ch / 2;
      const d = `M ${cx} ${yTop} Q ${cx - 16} ${yTop + ch * 0.25}, ${cx} ${cy} T ${cx} ${yBot}`;
      visioSvg.appendChild(svgEl("path", { d, fill: "none", stroke: "#475569", "stroke-width": 2, "stroke-dasharray": "5 3" }));
    }

    // Helper: attach touch + mouse Drag-to-Nudge + Tap-to-Select
    function makeInteractive(groupEl, arrayKey, index, itemObj) {
      const isSelected = state.selectedItem && state.selectedItem.arrayKey === arrayKey && state.selectedItem.index === index;
      if (isSelected) groupEl.setAttribute("filter", "drop-shadow(0 0 3px #2563eb)");

      groupEl.style.cursor = "grab";
      groupEl.style.touchAction = "none";
      groupEl.addEventListener("pointerdown", e => {
        e.preventDefault();
        e.stopPropagation();
        groupEl.setPointerCapture(e.pointerId);
        groupEl.style.cursor = "grabbing";
        const ptStart = visioSvg.createSVGPoint();
        const ctm = visioSvg.getScreenCTM().inverse();
        ptStart.x = e.clientX; ptStart.y = e.clientY;
        const svgStart = ptStart.matrixTransform(ctm);
        const origX = Number(itemObj.x), origY = Number(itemObj.y);
        let moved = false;

        function onMove(ev) {
          const p = visioSvg.createSVGPoint();
          p.x = ev.clientX; p.y = ev.clientY;
          const svgNow = p.matrixTransform(visioSvg.getScreenCTM().inverse());
          if (Math.hypot(svgNow.x - svgStart.x, svgNow.y - svgStart.y) > 4) moved = true;
          const dxIn = (svgNow.x - svgStart.x) / 100;
          const dyIn = -(svgNow.y - svgStart.y) / 100;
          itemObj.x = Number(Math.max(0.4, Math.min(8.1, origX + dxIn)).toFixed(2));
          itemObj.y = Number(Math.max(2.6, Math.min(9.4, origY + dyIn)).toFixed(2));
          groupEl.setAttribute("transform", `translate(${(itemObj.x - origX) * 100},${-(itemObj.y - origY) * 100})`);
        }
        function onUp(ev) {
          groupEl.releasePointerCapture(ev.pointerId);
          groupEl.removeEventListener("pointermove", onMove);
          groupEl.removeEventListener("pointerup", onUp);
          jsonInput.value = JSON.stringify(state.currentSpec, null, 2);
          if (!moved) {
            selectItem(arrayKey, index, itemObj);
          } else {
            renderPreview();
          }
        }
        groupEl.addEventListener("pointermove", onMove);
        groupEl.addEventListener("pointerup", onUp);
      });
    }

    // Machine Rectangles
    (pg.rectangles || []).forEach((r, idx) => {
      const grp = svgEl("g");
      const w = Number(r.w) * 100, h = Number(r.h) * 100;
      const x = vx(r.x) - w / 2, y = vy(r.y) - h / 2;
      grp.appendChild(svgEl("rect", { x, y, width: w, height: h, fill: r.fill || "#ffffff", "fill-opacity": state.traceOpacity > 0 ? "0.75" : "1", stroke: "#0f172a", "stroke-width": 1.8 }));
      if (r.label) {
        const lines = String(r.label).split("\n");
        lines.forEach((ln, i) => {
          const ly = vy(r.y) - ((lines.length - 1) * 7) + i * 14 + 4;
          grp.appendChild(svgEl("text", { x: vx(r.x), y: ly, "text-anchor": "middle", "font-size": Number(r.font_pt || 8.5) * 1.35, "font-weight": 700, fill: "#0f172a", "pointer-events": "none" }, ln));
        });
      }
      makeInteractive(grp, "rectangles", idx, r);
      visioSvg.appendChild(grp);
    });

    // Flow Arrows
    for (const a of pg.arrows || []) {
      visioSvg.appendChild(svgEl("line", {
        x1: vx(a.x1), y1: vy(a.y1), x2: vx(a.x2), y2: vy(a.y2),
        stroke: "#1e293b", "stroke-width": 2.2, "marker-end": "url(#arr)"
      }));
    }

    // Light Curtain Beams
    for (const b of pg.lc_beams || []) {
      visioSvg.appendChild(svgEl("line", {
        x1: vx(b.x1), y1: vy(b.y1), x2: vx(b.x2), y2: vy(b.y2),
        stroke: "#ea580c", "stroke-width": 3, "stroke-dasharray": "8 5"
      }));
    }

    // Fences
    (pg.fences || []).forEach((f, idx) => {
      const kind = String(f.kind || "mesh").toLowerCase().trim();
      const len = Number(f.len) * 100;
      const cx = vx(f.x), cy = vy(f.y);
      let deg = 90;
      if (f.angle_deg !== undefined && f.angle_deg !== null && f.angle_deg !== "") {
        deg = -Number(f.angle_deg);
      } else if (f.orient === "V" || f.orient === "vertical") {
        deg = 0;
      }
      const outer = svgEl("g");
      const g = svgEl("g", { transform: `translate(${cx},${cy}) rotate(${deg})` });
      const fill = kind === "existing" ? "#cbd5e1" : (kind === "polycarbonate" || kind === "lexan" ? "#22d3ee" : (kind === "sheet_metal" ? "#94a3b8" : "#fecaca"));
      const stroke = kind === "existing" || kind === "sheet_metal" ? "#0f172a" : (kind === "polycarbonate" || kind === "lexan" ? "#0e7490" : "#dc2626");
      g.appendChild(svgEl("rect", { x: -5, y: -len / 2, width: 10, height: len, fill, stroke, "stroke-width": 1.6 }));
      outer.appendChild(g);
      makeInteractive(outer, "fences", idx, f);
      visioSvg.appendChild(outer);
    });

    // Letters
    (pg.letters || []).forEach((l, idx) => {
      const grp = svgEl("g");
      grp.appendChild(svgEl("text", {
        x: vx(l.x), y: vy(l.y) + 6, "text-anchor": "middle",
        "font-size": 17, "font-weight": 800, fill: "#dc2626"
      }, String(l.char || "").toUpperCase()));
      makeInteractive(grp, "letters", idx, l);
      visioSvg.appendChild(grp);
    });

    // Safety Devices
    const deviceBadge = {
      locking_slide_bolt:        { txt: "LSB",  bg: "#dc2626", fg: "#fff" },
      lsb:                       { txt: "LSB",  bg: "#dc2626", fg: "#fff" },
      slide_bolt_non_locking:    { txt: "SB-N", bg: "#facc15", fg: "#0f172a" },
      locking:                   { txt: "L",    bg: "#dc2626", fg: "#fff" },
      non_locking:               { txt: "N",    bg: "#ffffff", fg: "#dc2626" },
      rolling_limit:             { txt: "R",    bg: "#ffffff", fg: "#dc2626" },
      magnetic:                  { txt: "M",    bg: "#dc2626", fg: "#fff" },
      existing_interlock:        { txt: "INT",  bg: "#475569", fg: "#fff" },
      reset:                     { txt: "RS",   bg: "#2563eb", fg: "#fff" },
      rs:                        { txt: "RS",   bg: "#2563eb", fg: "#fff" },
      access_request:            { txt: "AR",   bg: "#0284c7", fg: "#fff" },
      ar:                        { txt: "AR",   bg: "#0284c7", fg: "#fff" },
      reset_estop:               { txt: "AR/E", bg: "#dc2626", fg: "#fff" },
      e_stop:                    { txt: "ES",   bg: "#dc2626", fg: "#fef08a" },
      e_stop_existing:           { txt: "ES",   bg: "#64748b", fg: "#fff" },
      ring_guard:                { txt: "ES",   bg: "#dc2626", fg: "#fff" },
      start_stop_estop:          { txt: "S/S-E",bg: "#e2e8f0", fg: "#b91c1c" },
      disconnect_start_stop_estop:{ txt: "D/S/E",bg: "#fef08a", fg: "#b91c1c" },
      disconnect_new:            { txt: "DISC", bg: "#facc15", fg: "#b91c1c" },
      enabling:                  { txt: "EN",   bg: "#f59e0b", fg: "#0f172a" },
      safety_ctrl:               { txt: "SIC",  bg: "#facc15", fg: "#0f172a" },
      disconnect:                { txt: "DISC", bg: "#334155", fg: "#fff" },
      air_lockout:               { txt: "AIR",  bg: "#dc2626", fg: "#fff" },
      frl:                       { txt: "FRL",  bg: "#64748b", fg: "#fff" },
      lc_trans:                  { txt: "T",    bg: "#ea580c", fg: "#fff" },
      lc_rec:                    { txt: "R",    bg: "#ea580c", fg: "#fff" },
      lc_mirror:                 { txt: "M",    bg: "#06b6d4", fg: "#0f172a" },
      scanner_red:               { txt: "SCN",  bg: "#dc2626", fg: "#fff" },
      scanner_existing:          { txt: "SCN",  bg: "#64748b", fg: "#fff" }
    };

    (pg.devices || []).forEach((d, idx) => {
      const k = String(d.type || "").toLowerCase().trim();
      const b = deviceBadge[k] || { txt: k.slice(0, 4).toUpperCase(), bg: "#dc2626", fg: "#fff" };
      const x = vx(d.x), y = vy(d.y);
      const grp = svgEl("g");
      grp.appendChild(svgEl("rect", { x: x - 16, y: y - 10, width: 32, height: 20, rx: 4, fill: b.bg, stroke: "#0f172a", "stroke-width": 1.2 }));
      grp.appendChild(svgEl("text", { x, y: y + 4, "text-anchor": "middle", "font-size": 8.5, "font-weight": 800, fill: b.fg, "pointer-events": "none" }, b.txt));
      makeInteractive(grp, "devices", idx, d);
      visioSvg.appendChild(grp);
    });

    // Labels
    (pg.labels || []).forEach((lb, idx) => {
      const grp = svgEl("g");
      const lines = String(lb.text || "").split("\n");
      lines.forEach((ln, i) => {
        grp.appendChild(svgEl("text", {
          x: vx(lb.x), y: vy(lb.y) + i * 11, "text-anchor": "middle",
          "font-size": Number(lb.font_pt || 7.5) * 1.3, "font-weight": 700, fill: lb.color || "#c00000"
        }, ln));
      });
      makeInteractive(grp, "labels", idx, lb);
      visioSvg.appendChild(grp);
    });

    // Mesh Guarding & Optional Standards Box
    const showStd = chkShowStdBox.checked;
    const stdList = (pg.standards && pg.standards.length) ? pg.standards : getSelectedStandards();
    if (pg.mesh_guarding && pg.mesh_guarding.length) {
      const bx = showStd ? 72 : 245, bw = showStd ? 345 : 360;
      const bh = Math.min(185, Math.max(95, 32 + pg.mesh_guarding.length * 18));
      const by = vy(3.60) - bh / 2;
      visioSvg.appendChild(svgEl("rect", { x: bx, y: by, width: bw, height: bh, fill: "#ffffff", stroke: "#0f172a", "stroke-width": 1.6 }));
      visioSvg.appendChild(svgEl("text", { x: bx + 10, y: by + 20, "font-size": 11, "font-weight": 800, fill: "#0f172a" }, pg.mesh_title || "MESH GUARDING"));
      pg.mesh_guarding.forEach((line, idx) => {
        visioSvg.appendChild(svgEl("text", { x: bx + 10, y: by + 38 + idx * 17, "font-size": 10.5, fill: "#1e293b" }, line));
      });
    }
    if (showStd && stdList.length) {
      const bx = 430, bw = 350, bh = 180, by = vy(3.60) - bh / 2;
      visioSvg.appendChild(svgEl("rect", { x: bx, y: by, width: bw, height: bh, fill: "#eff6ff", stroke: "#1e3a8a", "stroke-width": 1.6 }));
      visioSvg.appendChild(svgEl("text", { x: bx + 10, y: by + 20, "font-size": 10.5, "font-weight": 800, fill: "#1e3a8a" }, "STANDARDS APPLIED (OSHA / ANSI / ISO)"));
      stdList.slice(0, 8).forEach((s, idx) => {
        visioSvg.appendChild(svgEl("text", { x: bx + 10, y: by + 38 + idx * 16, "font-size": 9.5, fill: "#1e3a8a" }, `• ${s}`));
      });
    }

    // Official Omron Bottom Legend Footer
    visioSvg.appendChild(svgEl("image", {
      href: "assets/omron_legend_footer.png",
      x: 18, y: 856, width: 814, height: 226,
      preserveAspectRatio: "xMidYMid meet"
    }));
    visioSvg.appendChild(svgEl("rect", { x: 18, y: 856, width: 814, height: 226, fill: "none", stroke: "#0f172a", "stroke-width": 1.5 }));

    // Stats chips
    statsBar.classList.remove("hidden");
    statsBar.innerHTML = [
      `Pages: ${spec.pages.length}`,
      `Machines: ${(pg.rectangles || []).length}`,
      `Guards: ${(pg.fences || []).length}`,
      `Safety Devices: ${(pg.devices || []).length}`,
      `Regulations: ${getSelectedStandards().length}`
    ].map(s => `<span class="stat-chip">${s}</span>`).join("");
  }

  // =========================================================================
  // EXPORTS: BOM (.csv), VISIO (.vsdx), JSON
  // =========================================================================
  function csvEsc(v) {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  btnDownloadBom.addEventListener("click", () => {
    const spec = state.currentSpec;
    if (!spec) return;
    const rows = [];
    rows.push(["OMRON SAFEGUARDING BILL OF MATERIALS (BOM)"]);
    rows.push(["Plant", spec.plant || "", "Machine", spec.machine || "", "Asset", spec.asset_line || ""]);
    if (spec.worksheet) {
      const ws = spec.worksheet;
      rows.push(["Department", ws.department || "", "Inspector", ws.inspector || "", "Date", ws.date || ""]);
      rows.push(["Photos", ws.photo_range || "", "Risk Before", ws.risk_before || "", "Risk After", ws.risk_after || ""]);
    }
    rows.push([]);
    rows.push(["Page", "Category", "Tag / Type", "Qty", "Specification / Notes", "Applicable Standards (OSHA / ANSI / ISO)"]);

    for (const pg of spec.pages || []) {
      const pName = pg.name || "Page";
      // Count letter tags per page for accurate guard quantities
      const letterCounts = {};
      for (const l of pg.letters || []) {
        const ch = String(l.char || "").toUpperCase().trim();
        if (ch) letterCounts[ch] = (letterCounts[ch] || 0) + 1;
      }
      for (const line of pg.mesh_guarding || []) {
        const m = String(line).match(/^\s*([A-N])\s*[:=]\s*(.+)$/i);
        const tag = m ? m[1].toUpperCase() : "GUARD";
        const desc = m ? m[2].trim() : line;
        const qty = letterCounts[tag] || 1;
        rows.push([pName, "Guarding Panel", `Panel ${tag}`, qty, desc, getSelectedStandards().slice(0, 3).join("; ")]);
      }

      // Group safety devices by type on this page
      const devGroups = {};
      for (const d of pg.devices || []) {
        const key = String(d.type || "device").toLowerCase().trim();
        if (!devGroups[key]) devGroups[key] = { qty: 0, notes: new Set(), stds: new Set() };
        devGroups[key].qty++;
        if (d.note) devGroups[key].notes.add(d.note);
        if (d.standard) devGroups[key].stds.add(d.standard);
      }
      for (const [k, info] of Object.entries(devGroups)) {
        rows.push([pName, "Safety Device", k.replace(/_/g, " ").toUpperCase(), info.qty, [...info.notes].join(" | "), [...info.stds].join("; ")]);
      }
    }

    const csv = "\uFEFF" + rows.map(r => r.map(csvEsc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const base = (spec.output_name || "Omron_Safety_BOM").replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${base}_BOM.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  btnDownloadVsdx.addEventListener("click", async () => {
    if (!state.currentSpec) return;
    btnDownloadVsdx.disabled = true;
    const oldTxt = btnDownloadVsdx.textContent;
    btnDownloadVsdx.textContent = "Building...";
    try {
      const blob = await VisioBuilder.buildVsdxBlob(state.currentSpec, {
        showStandardsBox: chkShowStdBox.checked,
        selectedStandards: getSelectedStandards()
      });
      const base = (state.currentSpec.output_name || "Omron_Safety_Layout").replace(/[\\/:*?"<>|]/g, "_");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = base.endsWith(".vsdx") ? base : `${base}.vsdx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      btnDownloadVsdx.textContent = oldTxt;
      btnDownloadVsdx.disabled = false;
    }
  });

  btnDownloadJson.addEventListener("click", () => {
    if (!state.currentSpec) return;
    const blob = new Blob([JSON.stringify(state.currentSpec, null, 2)], { type: "application/json" });
    const base = (state.currentSpec.output_name || "layout").replace(/[\\/:*?"<>|]/g, "_");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${base}.json`;
    a.click();
  });

  // Load Generic Sample
  btnLoadSample.addEventListener("click", () => {
    const sample = {
      output_name: "Sample_Tube_Mill_Flying_Saw",
      show_standards_box: chkShowStdBox.checked,
      plant: "Sample Manufacturing Plant, OH",
      machine: "Tube Mill Flying Saw (Sample Layout)",
      asset_line: "Model # FS-400          Serial # 10042          Asset # LINE-A",
      worksheet: {
        department: "Plant 4",
        date: "11/25",
        inspector: "Safety Inspector",
        photo_range: "61 thru 104",
        risk_before: "S3 / E2 / A3",
        risk_after: "S2 / E1 / A1"
      },
      pages: [{
        name: "Flying Saw Layout",
        header_machine: "Line A — Flying Saw Safeguarding Layout",
        cutoffs: [
          { kind: "start", x: 0.90, y: 6.80, h: 2.80 },
          { kind: "end", x: 7.25, y: 7.45, h: 0.95 }
        ],
        rectangles: [
          { x: 2.15, y: 7.20, w: 1.65, h: 0.62, label: "RUNOUT CONVEYOR", font_pt: 7.5 },
          { x: 3.45, y: 7.20, w: 0.95, h: 1.48, label: "SAW", font_pt: 9.5 },
          { x: 4.95, y: 7.20, w: 2.05, h: 0.62, label: "INFEED CONVEYOR", font_pt: 7.5 },
          { x: 3.55, y: 8.32, w: 2.15, h: 0.42, label: "CONTROL CABINET", fill: "#f8fafc", font_pt: 7.5 },
          { x: 5.32, y: 8.20, w: 0.50, h: 0.95, label: "SCRAP", fill: "#f8fafc", font_pt: 6.5 },
          { x: 5.15, y: 5.52, w: 0.68, h: 0.44, label: "CONSOLE", font_pt: 7.0 }
        ],
        arrows: [
          { x1: 6.60, y1: 7.42, x2: 6.08, y2: 7.42 },
          { x1: 3.25, y1: 7.02, x2: 3.65, y2: 7.02 },
          { x1: 1.85, y1: 7.20, x2: 1.32, y2: 7.20 }
        ],
        lc_beams: [],
        fences: [
          { kind: "existing", x: 1.15, y: 7.88, len: 0.62, orient: "V" },
          { kind: "existing", x: 1.82, y: 8.19, len: 1.32, orient: "H" },
          { kind: "existing", x: 5.95, y: 6.45, len: 1.25, orient: "V" },
          { kind: "existing", x: 3.95, y: 5.42, len: 1.72, orient: "H" },
          { kind: "existing", x: 1.98, y: 5.42, len: 2.22, orient: "H" },
          { kind: "mesh", x: 6.55, y: 7.12, len: 1.12, orient: "H", standard: "ANSI B11.18 / B11.19", note: "A = 72 in x 48 in FMG" },
          { kind: "mesh", x: 5.62, y: 8.42, len: 0.42, orient: "V", standard: "ANSI B11.19 / ISO 14120", note: "B = 72 in x 24 in FMG" },
          { kind: "mesh", x: 4.85, y: 8.20, len: 0.46, orient: "H", standard: "ANSI B11.19 / ISO 14120", note: "C = 72 in x 20 in FMG" }
        ],
        letters: [
          { char: "A", x: 6.55, y: 6.86 },
          { char: "B", x: 5.78, y: 8.52 },
          { char: "C", x: 4.85, y: 8.42 }
        ],
        devices: [
          { type: "locking_slide_bolt", x: 6.12, y: 5.88, standard: "ISO 14119 / ANSI B11.19", note: "East Access LSB" },
          { type: "locking_slide_bolt", x: 3.09, y: 5.24, standard: "ISO 14119 / ANSI B11.19", note: "South Access LSB" },
          { type: "ring_guard", x: 5.32, y: 5.62, standard: "ISO 13850 / NFPA 79", note: "Console E-Stop" },
          { type: "air_lockout", x: 4.55, y: 8.80, standard: "OSHA 29 CFR 1910.147", note: "1/2 in Air Lockout Valve" },
          { type: "disconnect", x: 4.45, y: 8.38, standard: "OSHA 29 CFR 1910.147", note: "Existing Disconnect" },
          { type: "safety_ctrl", x: 2.65, y: 8.32, standard: "ANSI B11.26 / ISO 13849-1", note: "Safety Interface Ctrl" }
        ],
        labels: [
          { text: "1/2 in", x: 4.92, y: 8.82, w: 0.50, h: 0.22, color: "#c00000", font_pt: 7.5 }
        ],
        mesh_title: "MESH GUARDING",
        mesh_guarding: [
          "A = 72 in X 48 in FMG",
          "B = 72 in X 24 in FMG",
          "C = 72 in X 20 in FMG"
        ],
        standards: getSelectedStandards()
      }]
    };
    jsonInput.value = JSON.stringify(sample, null, 2);
    loadSpec(sample, false);
  });

  // Initialize standards pills & recent drawings dropdown
  renderStdGroup("ansiPills", STANDARDS.ansi);
  renderStdGroup("isoPills", STANDARDS.iso);
  renderStdGroup("oshaPills", STANDARDS.osha);
  renderRecentDropdown();
})();
