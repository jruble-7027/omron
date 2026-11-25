/**
 * Omron Safety Studio — Pure Browser Visio (.vsdx) Builder
 * Clones assets/Omron_Base_Template.vsdx using JSZip and populates
 * native Omron Visio masters + ANSI / ISO / OSHA Shape Data.
 */
window.VisioBuilder = (() => {
  const VISIO_NS = "http://schemas.microsoft.com/office/visio/2012/main";
  const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const KEEP_IDS = new Set(["2", "21", "22", "1579", "1583", "1596", "1850", "1853", "1856", "1859", "1862"]);

  const LETTER_MAP = {
    A: "1086", B: "1087", C: "1089", D: "1088", E: "1090",
    F: "1091", G: "1092", H: "1093", I: "2023", J: "2024",
    K: "2093", L: "2092", M: "2088", N: "2089"
  };

  const DEVICE_CATALOG = {
    locking_slide_bolt: { id: "1081", std: "ISO 14119 / ANSI B11.19 / B11.20", cat: "Locking Slide Bolt (LSB)", cells: "<Cell N='Width' V='0.46'/><Cell N='Height' V='0.35'/><Cell N='LocPinX' V='0.23' F='Inh'/><Cell N='LocPinY' V='0.175' F='Inh'/>" },
    lsb:                { id: "1081", std: "ISO 14119 / ANSI B11.19 / B11.20", cat: "Locking Slide Bolt (LSB)", cells: "<Cell N='Width' V='0.46'/><Cell N='Height' V='0.35'/><Cell N='LocPinX' V='0.23' F='Inh'/><Cell N='LocPinY' V='0.175' F='Inh'/>" },
    locking:            { id: "2053", std: "ISO 14119 / ANSI B11.19",          cat: "Guard Locking Interlock",  cells: "" },
    magnetic:           { id: "2069", std: "ISO 14119 / ANSI B11.19",          cat: "Magnetic Interlock",       cells: "" },
    existing_interlock: { id: "1110", std: "ISO 14119 / ANSI B11.19",          cat: "Existing Interlock",       cells: "" },
    reset:              { id: "1082", std: "ANSI B11.19 / B11.20",             cat: "Safety Reset (RS)",        cells: "" },
    rs:                 { id: "1082", std: "ANSI B11.19 / B11.20",             cat: "Safety Reset (RS)",        cells: "" },
    access_request:     { id: "1043", std: "ANSI B11.19 / B11.20",             cat: "Access Request (AR)",      cells: "<Cell N='Width' V='0.55'/><Cell N='Height' V='0.24'/><Cell N='LocPinX' V='0.275' F='Inh'/><Cell N='LocPinY' V='0.12' F='Inh'/>" },
    ar:                 { id: "1043", std: "ANSI B11.19 / B11.20",             cat: "Access Request (AR)",      cells: "<Cell N='Width' V='0.55'/><Cell N='Height' V='0.24'/><Cell N='LocPinX' V='0.275' F='Inh'/><Cell N='LocPinY' V='0.12' F='Inh'/>" },
    reset_estop:        { id: "2037", std: "ISO 13850 / ANSI B11.20",          cat: "Reset & E-Stop Station",   cells: "" },
    e_stop:             { id: "1102", std: "ISO 13850 / NFPA 79",              cat: "Emergency Stop",           cells: "" },
    e_stop_existing:    { id: "2052", std: "ISO 13850 / NFPA 79",              cat: "Existing E-Stop",          cells: "" },
    ring_guard:         { id: "1067", std: "ISO 13850 / ANSI B11.19",          cat: "E-Stop w/ Ring Guard",     cells: "" },
    enabling:           { id: "2077", std: "ANSI B11.19 / ISO 12100",          cat: "3-Pos Enabling Switch",    cells: "" },
    safety_ctrl:        { id: "1077", std: "ANSI B11.26 / ISO 13849-1",        cat: "Safety Interface Ctrl",    cells: "" },
    disconnect:         { id: "1076", std: "OSHA 1910.147 / ANSI Z244.1",      cat: "Electrical Disconnect",    cells: "" },
    air_lockout:        { id: "1084", std: "OSHA 1910.147 / ANSI Z244.1",      cat: "Air Lockout Valve",        cells: "" },
    frl:                { id: "1085", std: "OSHA 1910.147",                    cat: "Filter Regulator Lub.",    cells: "" },
    lc_trans:           { id: "2038", std: "ANSI B11.19 / ISO 13855",          cat: "Light Curtain Trans. (T)", cells: "" },
    lc_rec:             { id: "2039", std: "ANSI B11.19 / ISO 13855",          cat: "Light Curtain Rec. (R)",   cells: "" },
    lc_mirror:          { id: "2040", std: "ANSI B11.19 / ISO 13855",          cat: "Light Curtain Mirror (M)", cells: "" },
    scanner_red:        { id: "1071", std: "ANSI B11.19 / ISO 13855",          cat: "Safety Laser Scanner",     cells: "" },
    scanner_existing:   { id: "1119", std: "ANSI B11.19 / ISO 13855",          cat: "Existing Laser Scanner",   cells: "" }
  };

  function xmlEsc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  /**
   * Robust JSON parser that strips conversational prose, markdown fences,
   * smart quotes, and unescaped inch marks (e.g. 55" x 48").
   */
  function parseAiJson(rawText) {
    let text = String(rawText || "").trim();
    if (/^\s*You are an Omron Advanced Services/i.test(text)) {
      throw new Error("It looks like the AI prompt itself was pasted. Paste the AI's JSON reply (starting with { and ending with }).");
    }
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last <= first) {
      throw new Error("No complete JSON object ({ ... }) found. Make sure the AI reply wasn't cut off.");
    }
    text = text.slice(first, last + 1);
    text = text.replace(/[\u201C\u201D]/g, '\\"');
    text = text.replace(/(?<=\d)""(?=\s*[,}\]])/g, '\\""');
    text = text.replace(/(?<=\d)(?<!\\)"(?!\s*(?:[,}\]:]|$))/g, '\\"');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new Error("Invalid JSON (may be truncated or missing a comma): " + err.message);
    }
    if (!parsed || !Array.isArray(parsed.pages) || parsed.pages.length === 0) {
      throw new Error("JSON must contain a non-empty 'pages' array.");
    }
    return parsed;
  }

  let cachedTemplateBytes = null;
  async function loadTemplateBytes() {
    if (cachedTemplateBytes) return cachedTemplateBytes;
    const res = await fetch("assets/Omron_Base_Template.vsdx");
    if (!res.ok) {
      throw new Error("Could not load assets/Omron_Base_Template.vsdx (run via local server or GitHub Pages).");
    }
    cachedTemplateBytes = await res.arrayBuffer();
    return cachedTemplateBytes;
  }

  async function buildVsdxBlob(spec, options = {}) {
    const bytes = await loadTemplateBytes();
    const zip = await JSZip.loadAsync(bytes);
    const parser = new DOMParser();
    const serializer = new XMLSerializer();

    let nextId = 3000;
    const newId = () => ++nextId;

    // Build Master ID -> master XML top Shape lookup
    const mRelsDoc = parser.parseFromString(await zip.file("visio/masters/_rels/masters.xml.rels").async("string"), "application/xml");
    const ridToTarget = {};
    for (const rel of mRelsDoc.getElementsByTagName("Relationship")) {
      ridToTarget[rel.getAttribute("Id")] = rel.getAttribute("Target");
    }
    const mastersDoc = parser.parseFromString(await zip.file("visio/masters/masters.xml").async("string"), "application/xml");
    const masterIdToFile = {};
    for (const m of mastersDoc.getElementsByTagName("Master")) {
      const relEl = m.getElementsByTagName("Rel")[0];
      const rid = relEl?.getAttributeNS(REL_NS, "id") || relEl?.getAttribute("r:id");
      if (rid && ridToTarget[rid]) masterIdToFile[m.getAttribute("ID")] = "visio/masters/" + ridToTarget[rid];
    }

    const masterTopCache = {};
    async function getMasterTop(masterId) {
      if (masterTopCache[masterId]) return masterTopCache[masterId];
      const fn = masterIdToFile[masterId];
      if (!fn || !zip.file(fn)) return null;
      const doc = parser.parseFromString(await zip.file(fn).async("string"), "application/xml");
      const top = doc.getElementsByTagName("Shapes")[0]?.children[0] || null;
      masterTopCache[masterId] = top;
      return top;
    }

    function buildSubShapesXml(shapeEl) {
      const shapesChild = Array.from(shapeEl.children).find(c => c.localName === "Shapes");
      if (!shapesChild || shapesChild.children.length === 0) return "";
      let out = "<Shapes>";
      for (const ch of shapesChild.children) {
        if (ch.localName !== "Shape") continue;
        const cid = newId();
        const ctype = ch.getAttribute("Type") || "Shape";
        const inner = buildSubShapesXml(ch);
        out += inner
          ? `<Shape ID='${cid}' Type='${ctype}' MasterShape='${ch.getAttribute("ID")}'>${inner}</Shape>`
          : `<Shape ID='${cid}' Type='${ctype}' MasterShape='${ch.getAttribute("ID")}'/>`;
      }
      return out + "</Shapes>";
    }

    async function instantiateMaster(masterId, x, y, extraCells = "", propsXml = "") {
      const top = await getMasterTop(masterId);
      if (!top) return "";
      const id = newId();
      const topType = top.getAttribute("Type") || "Shape";
      const subXml = buildSubShapesXml(top);
      return `<Shape ID='${id}' Type='${topType}' Master='${masterId}' xmlns='${VISIO_NS}'><Cell N='PinX' V='${x}'/><Cell N='PinY' V='${y}'/>${extraCells}${propsXml}${subXml}</Shape>`;
    }

    function makePropsXml(std, cat, note) {
      if (!std && !note) return "";
      return `<Section N='Property'><Row N='StandardRef'><Cell N='Value' V='${xmlEsc(std)}' U='STR'/><Cell N='Label' V='ANSI/ISO/OSHA Standard'/><Cell N='Type' V='0'/></Row><Row N='SafetyCategory'><Cell N='Value' V='${xmlEsc(cat)}' U='STR'/><Cell N='Label' V='Category'/><Cell N='Type' V='0'/></Row><Row N='SafetyNote'><Cell N='Value' V='${xmlEsc(note)}' U='STR'/><Cell N='Label' V='Design Note'/><Cell N='Type' V='0'/></Row></Section>`;
    }

    function makeRect(r) {
      const id = newId(), w = Number(r.w), h = Number(r.h);
      const fill = r.fill || "#ffffff";
      const fontPt = Number(r.font_pt || 8.5);
      const txtXml = r.label
        ? `<Section N='Character'><Row IX='0'><Cell N='Size' V='${fontPt / 72}' U='PT'/><Cell N='Style' V='1'/><Cell N='Color' V='#000000'/></Row></Section><Text>${xmlEsc(r.label)}</Text>`
        : "";
      return `<Shape ID='${id}' Type='Shape' Master='1074' xmlns='${VISIO_NS}'><Cell N='PinX' V='${r.x}'/><Cell N='PinY' V='${r.y}'/><Cell N='Width' V='${w}'/><Cell N='Height' V='${h}'/><Cell N='LocPinX' V='${w / 2}' F='Width*0.5'/><Cell N='LocPinY' V='${h / 2}' F='Height*0.5'/><Cell N='Angle' V='0'/><Cell N='FillForegnd' V='${fill}'/><Cell N='LineColor' V='#000000'/><Cell N='LineWeight' V='0.01736111' U='PT'/><Section N='Geometry' IX='0'><Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row><Row T='LineTo' IX='2'><Cell N='X' V='${w}'/><Cell N='Y' V='0'/></Row><Row T='LineTo' IX='3'><Cell N='X' V='${w}'/><Cell N='Y' V='${h}'/></Row><Row T='LineTo' IX='4'><Cell N='X' V='0'/><Cell N='Y' V='${h}'/></Row><Row T='LineTo' IX='5'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row></Section>${txtXml}</Shape>`;
    }

    function makeFence(f) {
      const id = newId(), len = Number(f.len);
      const isEx = (f.kind || "mesh") === "existing";
      const mid = isEx ? "1079" : "1078";
      let ang = -Math.PI / 2;
      if (f.angle_deg !== undefined && f.angle_deg !== null && f.angle_deg !== "") {
        ang = Number(f.angle_deg) * Math.PI / 180;
      } else if (f.orient === "V" || f.orient === "vertical") {
        ang = 0;
      }
      const props = makePropsXml(f.standard || "", isEx ? "Existing Guarding" : "New Mesh Guarding", f.note || "");
      return `<Shape ID='${id}' Type='Shape' Master='${mid}' xmlns='${VISIO_NS}'><Cell N='PinX' V='${f.x}'/><Cell N='PinY' V='${f.y}'/><Cell N='Height' V='${len}'/><Cell N='LocPinY' V='${len / 2}' F='Inh'/><Cell N='Angle' V='${ang}'/><Section N='Geometry' IX='0'><Row T='LineTo' IX='3'><Cell N='Y' V='${len}' F='Inh'/></Row><Row T='LineTo' IX='4'><Cell N='Y' V='${len}' F='Inh'/></Row></Section>${props}</Shape>`;
    }

    function make1D(masterId, x1, y1, x2, y2, std = "", cat = "", note = "") {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      if (len < 0.01) return "";
      const id = newId(), ang = Math.atan2(dy, dx);
      const px = (x1 + x2) / 2, py = (y1 + y2) / 2;
      const props = makePropsXml(std, cat, note);
      return `<Shape ID='${id}' Type='Shape' Master='${masterId}' xmlns='${VISIO_NS}'><Cell N='PinX' V='${px}' F='Inh'/><Cell N='PinY' V='${py}' F='Inh'/><Cell N='Width' V='${len}' F='Inh'/><Cell N='LocPinX' V='${len / 2}' F='Inh'/><Cell N='Angle' V='${ang}' F='Inh'/><Cell N='BeginX' V='${x1}'/><Cell N='BeginY' V='${y1}'/><Cell N='EndX' V='${x2}'/><Cell N='EndY' V='${y2}'/><Section N='Geometry' IX='0'><Row T='LineTo' IX='2'><Cell N='X' V='${len}' F='Inh'/></Row></Section>${props}</Shape>`;
    }

    function makeTextBox(x, y, w, h, text, fontPt = 8.0, borderHex = "#000000", fillHex = "#ffffff", textHex = "#000000", align = 0) {
      const id = newId();
      const linePat = borderHex === "none" ? "0" : "1";
      const fillPat = fillHex === "none" ? "0" : "1";
      return `<Shape ID='${id}' Type='Shape' LineStyle='3' FillStyle='3' TextStyle='3' xmlns='${VISIO_NS}'><Cell N='PinX' V='${x}'/><Cell N='PinY' V='${y}'/><Cell N='Width' V='${w}'/><Cell N='Height' V='${h}'/><Cell N='LocPinX' V='${w / 2}' F='Width*0.5'/><Cell N='LocPinY' V='${h / 2}' F='Height*0.5'/><Cell N='FillForegnd' V='${fillHex}'/><Cell N='FillPattern' V='${fillPat}'/><Cell N='LineColor' V='${borderHex}'/><Cell N='LinePattern' V='${linePat}'/><Cell N='LineWeight' V='0.01736111' U='PT'/><Cell N='VerticalAlign' V='0'/><Cell N='LeftMargin' V='0.07' U='IN'/><Cell N='TopMargin' V='0.05' U='IN'/><Section N='Character'><Row IX='0'><Cell N='Size' V='${fontPt / 72}' U='PT'/><Cell N='Color' V='${textHex}'/><Cell N='Style' V='0'/></Row></Section><Section N='Paragraph'><Row IX='0'><Cell N='HorzAlign' V='${align}'/></Row></Section><Section N='Geometry' IX='0'><Row T='MoveTo' IX='1'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row><Row T='LineTo' IX='2'><Cell N='X' V='${w}'/><Cell N='Y' V='0'/></Row><Row T='LineTo' IX='3'><Cell N='X' V='${w}'/><Cell N='Y' V='${h}'/></Row><Row T='LineTo' IX='4'><Cell N='X' V='0'/><Cell N='Y' V='${h}'/></Row><Row T='LineTo' IX='5'><Cell N='X' V='0'/><Cell N='Y' V='0'/></Row></Section><Text>${xmlEsc(text)}</Text></Shape>`;
    }

    function makeLetter(l) {
      const ch = String(l.char || "").toUpperCase().trim();
      const mid = LETTER_MAP[ch];
      if (!mid) return makeTextBox(l.x, l.y, 0.30, 0.25, ch, 12, "none", "none", "#c00000", 1);
      return `<Shape ID='${newId()}' Type='Shape' Master='${mid}' xmlns='${VISIO_NS}'><Cell N='PinX' V='${l.x}'/><Cell N='PinY' V='${l.y}'/></Shape>`;
    }

    const basePageStr = await zip.file("visio/pages/page1.xml").async("string");
    const pagesDoc = parser.parseFromString(await zip.file("visio/pages/pages.xml").async("string"), "application/xml");
    const pRelsDoc = parser.parseFromString(await zip.file("visio/pages/_rels/pages.xml.rels").async("string"), "application/xml");
    const ctDoc = parser.parseFromString(await zip.file("[Content_Types].xml").async("string"), "application/xml");
    const basePageNode = pagesDoc.getElementsByTagName("Page")[0].cloneNode(true);

    const showStdBox = options.showStandardsBox !== undefined ? options.showStandardsBox : Boolean(spec.show_standards_box);

    let pageIndex = 0;
    for (const pg of spec.pages) {
      pageIndex++;
      const chunks = [];

      for (const c of pg.cutoffs || []) {
        const mid = c.kind === "end" ? "2017" : "1106";
        const h = Number(c.h || 2.2);
        const extra = `<Cell N='Width' V='0.34'/><Cell N='Height' V='${h}'/><Cell N='LocPinX' V='0.17' F='Inh'/><Cell N='LocPinY' V='${h / 2}' F='Inh'/>`;
        chunks.push(await instantiateMaster(mid, c.x, c.y, extra));
      }
      for (const r of pg.rectangles || []) chunks.push(makeRect(r));
      for (const a of pg.arrows || []) chunks.push(make1D("2108", Number(a.x1), Number(a.y1), Number(a.x2), Number(a.y2)));
      for (const b of pg.lc_beams || []) chunks.push(make1D("2041", Number(b.x1), Number(b.y1), Number(b.x2), Number(b.y2), "ANSI B11.19 / ISO 13855", "Light Curtain Beam", "Optical Protective Field"));
      for (const f of pg.fences || []) chunks.push(makeFence(f));
      for (const l of pg.letters || []) chunks.push(makeLetter(l));
      for (const d of pg.devices || []) {
        const key = String(d.type || "").toLowerCase().trim();
        const cat = DEVICE_CATALOG[key];
        if (cat) {
          let extra = cat.cells;
          if (d.angle_deg !== undefined && d.angle_deg !== null && d.angle_deg !== "") {
            extra += `<Cell N='Angle' V='${Number(d.angle_deg) * Math.PI / 180}'/>`;
          }
          const props = makePropsXml(d.standard || cat.std, cat.cat, d.note || "");
          chunks.push(await instantiateMaster(cat.id, d.x, d.y, extra, props));
        } else {
          chunks.push(makeTextBox(d.x, d.y, 0.55, 0.24, key.toUpperCase(), 7, "#c00000", "#fee2e2", "#c00000", 1));
        }
      }
      for (const lb of pg.labels || []) {
        chunks.push(makeTextBox(lb.x, lb.y, lb.w || 0.80, lb.h || 0.24, lb.text || "", Number(lb.font_pt || 7.5), "none", "none", lb.color || "#c00000", lb.align ?? 1));
      }

      const stdList = (pg.standards && pg.standards.length) ? pg.standards : (options.selectedStandards || []);
      if (pg.mesh_guarding && pg.mesh_guarding.length) {
        const mgText = `${pg.mesh_title || "MESH GUARDING"}\n${pg.mesh_guarding.join("\n")}`;
        const mgH = Math.min(1.90, Math.max(1.05, 0.35 + pg.mesh_guarding.length * 0.20));
        if (showStdBox && stdList.length) {
          chunks.push(makeTextBox(2.45, 3.60, 3.45, mgH, mgText, 8.0, "#000000", "#ffffff", "#000000", 0));
        } else {
          chunks.push(makeTextBox(4.25, 3.60, 3.60, mgH, mgText, 8.5, "#000000", "#ffffff", "#000000", 0));
        }
      }
      if (showStdBox && stdList.length) {
        const stdText = "STANDARDS APPLIED (OSHA / ANSI / ISO)\n" + stdList.map(s => `• ${s}`).join("\n");
        chunks.push(makeTextBox(6.05, 3.60, 3.50, 1.80, stdText, 7.5, "#1e3a8a", "#eff6ff", "#1e3a8a", 0));
      }

      // Build page XML
      const pDoc = parser.parseFromString(basePageStr, "application/xml");
      const shapesNode = pDoc.getElementsByTagName("Shapes")[0];
      for (const child of Array.from(shapesNode.children)) {
        if (!KEEP_IDS.has(child.getAttribute("ID"))) shapesNode.removeChild(child);
      }

      // Update Header (ID=21)
      const hdr = Array.from(shapesNode.children).find(el => el.getAttribute("ID") === "21");
      if (hdr) {
        const txtEl = hdr.getElementsByTagName("Text")[0];
        if (txtEl) {
          const h1 = pg.header_plant || spec.plant || "Plant Name";
          const h2 = pg.header_machine || spec.machine || "Machine Layout";
          const h3 = pg.header_asset || spec.asset_line || "Model #          Serial #          Asset #";
          const wrapped = parser.parseFromString(
            `<Text xmlns='${VISIO_NS}'><cp IX='0'/><pp IX='0'/>${xmlEsc(h1)}\n${xmlEsc(h2)}\n${xmlEsc(h3)}\n</Text>`,
            "application/xml"
          ).documentElement;
          hdr.replaceChild(pDoc.importNode(wrapped, true), txtEl);
        }
      }

      for (const xmlStr of chunks) {
        if (!xmlStr) continue;
        const fragDoc = parser.parseFromString(xmlStr, "application/xml");
        shapesNode.appendChild(pDoc.importNode(fragDoc.documentElement, true));
      }

      zip.file(`visio/pages/page${pageIndex}.xml`, serializer.serializeToString(pDoc));

      const pName = pg.name || `Page-${pageIndex}`;
      if (pageIndex === 1) {
        const p1 = pagesDoc.getElementsByTagName("Page")[0];
        p1.setAttribute("Name", pName);
        p1.setAttribute("NameU", pName);
      } else {
        const rid = `rId${pageIndex}`;
        const rel = pRelsDoc.createElementNS(pRelsDoc.documentElement.namespaceURI, "Relationship");
        rel.setAttribute("Id", rid);
        rel.setAttribute("Type", "http://schemas.microsoft.com/visio/2010/relationships/page");
        rel.setAttribute("Target", `page${pageIndex}.xml`);
        pRelsDoc.documentElement.appendChild(rel);

        const pNode = basePageNode.cloneNode(true);
        pNode.setAttribute("ID", String(3 + pageIndex));
        pNode.setAttribute("Name", pName);
        pNode.setAttribute("NameU", pName);
        const relEl = pNode.getElementsByTagName("Rel")[0];
        relEl.setAttributeNS(REL_NS, "r:id", rid);
        pagesDoc.documentElement.appendChild(pNode);

        const ov = ctDoc.createElementNS(ctDoc.documentElement.namespaceURI, "Override");
        ov.setAttribute("PartName", `/visio/pages/page${pageIndex}.xml`);
        ov.setAttribute("ContentType", "application/vnd.ms-visio.page+xml");
        ctDoc.documentElement.appendChild(ov);
      }
    }

    zip.file("visio/pages/pages.xml", serializer.serializeToString(pagesDoc));
    zip.file("visio/pages/_rels/pages.xml.rels", serializer.serializeToString(pRelsDoc));
    zip.file("[Content_Types].xml", serializer.serializeToString(ctDoc));

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.ms-visio.drawing.main+xml",
      compression: "DEFLATE"
    });
  }

  return { parseAiJson, buildVsdxBlob };
})();
