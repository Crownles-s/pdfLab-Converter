/* pdfLab conversion pipeline. All processing stays in the current tab. */
(function () {
  "use strict";

  var state = { files: [], busy: false };
  var els = {};

  document.addEventListener("DOMContentLoaded", function () {
    els.input = document.getElementById("file-input");
    els.drop = document.getElementById("drop-zone");
    els.browse = document.getElementById("browse-button");
    els.queue = document.getElementById("queue");
    els.count = document.getElementById("file-count");
    els.notice = document.getElementById("notice");
    els.convert = document.getElementById("convert-button");
    els.stage = document.getElementById("render-stage");
    els.theme = document.getElementById("theme-toggle");
    setupTheme();
    setupDropzone();
    els.convert.addEventListener("click", convertAll);
    showDependencyWarning();
  });

  function setupTheme() {
    var saved = localStorage.getItem("pdfLab-theme");
    if (saved === "dark") document.documentElement.dataset.theme = "dark";
    updateThemeLabel();
    els.theme.addEventListener("click", function () {
      var dark = document.documentElement.dataset.theme !== "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      localStorage.setItem("pdfLab-theme", dark ? "dark" : "light");
      updateThemeLabel();
    });
  }

  function updateThemeLabel() {
    var dark = document.documentElement.dataset.theme === "dark";
    els.theme.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    els.theme.innerHTML = dark ? "<span aria-hidden=\"true\">☾</span>" : "<span aria-hidden=\"true\">☼</span>";
  }

  function setupDropzone() {
    els.browse.addEventListener("click", function (event) { event.stopPropagation(); els.input.click(); });
    els.drop.addEventListener("click", function () { els.input.click(); });
    els.drop.addEventListener("keydown", function (event) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); els.input.click(); } });
    els.input.addEventListener("change", function () { addFiles(Array.from(els.input.files || [])); els.input.value = ""; });
    ["dragenter", "dragover"].forEach(function (type) { els.drop.addEventListener(type, function (event) { event.preventDefault(); els.drop.classList.add("is-over"); }); });
    ["dragleave", "drop"].forEach(function (type) { els.drop.addEventListener(type, function (event) { event.preventDefault(); els.drop.classList.remove("is-over"); }); });
    els.drop.addEventListener("drop", function (event) { addFiles(Array.from(event.dataTransfer.files || [])); });
  }

  function showDependencyWarning() {
    var missing = [];
    if (!window.mammoth) missing.push("DOCX reader");
    if (!window.html2canvas) missing.push("canvas renderer");
    if (!window.jspdf || !window.jspdf.jsPDF) missing.push("PDF writer");
    if (!window.JSZip) missing.push("ZIP reader");
    if (missing.length) showNotice("Some local browser dependencies are missing: " + missing.join(", ") + ".", "error");
  }

  function addFiles(files) {
    var accepted = 0;
    files.slice(0, 20 - state.files.length).forEach(function (file) {
      var ext = extension(file.name);
      if (ext !== "docx" && ext !== "pptx") return;
      if (state.files.some(function (item) { return item.file.name === file.name && item.file.size === file.size; })) return;
      state.files.push({ file: file, ext: ext, status: "ready", progress: 0, blob: null, error: "" });
      accepted++;
    });
    if (files.length > accepted) showNotice("Only DOCX and PPTX files are supported (20 files maximum).", "error");
    if (accepted) hideNotice();
    renderQueue();
  }

  function renderQueue() {
    els.count.textContent = state.files.length + (state.files.length === 1 ? " file" : " files");
    els.convert.disabled = state.busy || !state.files.some(function (item) { return item.status === "ready" || item.status === "error"; });
    els.convert.innerHTML = state.busy ? "Converting…" : "Convert files <span>→</span>";
    els.queue.innerHTML = state.files.map(function (item, index) {
      var label = item.status === "done" ? "Ready" : item.status === "processing" ? "Working" : item.status === "error" ? "Error" : "Queued";
      var action = item.status === "done" ? "<button class=\"download-button\" data-download=\"" + index + "\" title=\"Download PDF\" aria-label=\"Download " + escapeHtml(item.file.name) + "\">↓</button>" : "<button class=\"remove-button\" data-remove=\"" + index + "\" title=\"Remove file\" aria-label=\"Remove " + escapeHtml(item.file.name) + "\">×</button>";
      return "<div class=\"queue-item\"><div class=\"file-info\"><span class=\"file-badge\">" + item.ext.toUpperCase() + "</span><span class=\"file-name\" title=\"" + escapeHtml(item.file.name) + "\">" + escapeHtml(item.file.name) + "<span class=\"file-size\">" + formatBytes(item.file.size) + "</span></span></div><div class=\"progress-wrap\"><div class=\"progress-bar\" style=\"width:" + item.progress + "%\"></div></div><span class=\"status " + (item.status === "done" ? "success" : item.status === "error" ? "error" : "") + "\">" + label + (item.status === "error" ? " — " + escapeHtml(item.error) : "") + "</span>" + action + "</div>";
    }).join("");
    Array.from(els.queue.querySelectorAll("[data-remove]")).forEach(function (button) { button.addEventListener("click", function () { if (!state.busy) { state.files.splice(Number(button.dataset.remove), 1); renderQueue(); } }); });
    Array.from(els.queue.querySelectorAll("[data-download]")).forEach(function (button) { button.addEventListener("click", function () { var item = state.files[Number(button.dataset.download)]; downloadBlob(item.blob, pdfName(item.file.name)); }); });
  }

  async function convertAll() {
    if (state.busy) return;
    state.busy = true; hideNotice(); renderQueue();
    for (var i = 0; i < state.files.length; i++) {
      var item = state.files[i];
      if (item.status !== "ready" && item.status !== "error") continue;
      item.status = "processing"; item.progress = 2; item.error = ""; renderQueue();
      try {
        item.blob = item.ext === "docx" ? await convertDocx(item) : await convertPptx(item);
        item.status = "done"; item.progress = 100;
      } catch (error) {
        console.error(error);
        item.status = "error"; item.progress = 0; item.error = friendlyError(error);
      }
      renderQueue();
    }
    state.busy = false; renderQueue();
    var failed = state.files.filter(function (item) { return item.status === "error"; }).length;
    var done = state.files.filter(function (item) { return item.status === "done"; }).length;
    if (done) showNotice(done + " PDF" + (done === 1 ? "" : "s") + " ready. " + (done > 1 ? "Download them individually or as a ZIP." : "Your PDF is ready to download."), "success", done > 1);
  }

  async function convertDocx(item) {
    if (!window.mammoth || !window.html2canvas || !window.jspdf) throw new Error("The document tools did not load.");
    var buffer = await item.file.arrayBuffer();
    setProgress(item, 18);
    var result = await mammoth.convertToHtml({ arrayBuffer: buffer }, { includeDefaultStyleMap: true });
    if (!result || !result.value) throw new Error("No readable content was found.");
    els.stage.innerHTML = "<article class=\"docx-render\">" + result.value + "</article>";
    var article = els.stage.firstElementChild;
    await waitForImages(article);
    setProgress(item, 42);
    var canvas = await html2canvas(article, { scale: 1.7, backgroundColor: "#ffffff", useCORS: false, logging: false });
    setProgress(item, 78);
    var pdf = new window.jspdf.jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
    var pageWidth = pdf.internal.pageSize.getWidth(), pageHeight = pdf.internal.pageSize.getHeight();
    var ratio = pageWidth / canvas.width, pagePixels = Math.floor(pageHeight / ratio), offset = 0, first = true;
    while (offset < canvas.height) {
      var sliceHeight = Math.min(pagePixels, canvas.height - offset);
      var slice = document.createElement("canvas"); slice.width = canvas.width; slice.height = sliceHeight;
      slice.getContext("2d").drawImage(canvas, 0, offset, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (!first) pdf.addPage(); first = false;
      pdf.addImage(slice.toDataURL("image/jpeg", .92), "JPEG", 0, 0, pageWidth, sliceHeight * ratio);
      offset += sliceHeight; setProgress(item, 78 + Math.round(offset / canvas.height * 20));
    }
    els.stage.innerHTML = "";
    return pdf.output("blob");
  }

  async function convertPptx(item) {
    if (!window.JSZip || !window.html2canvas || !window.jspdf) throw new Error("The presentation tools did not load.");
    var zip = await JSZip.loadAsync(await item.file.arrayBuffer());
    var slidePaths = Object.keys(zip.files).filter(function (path) { return /^ppt\/slides\/slide\d+\.xml$/.test(path); }).sort(function (a, b) { return numberIn(a) - numberIn(b); });
    if (!slidePaths.length) throw new Error("No slides were found.");
    var dimensions = await getSlideDimensions(zip);
    var pdf = new window.jspdf.jsPDF({ unit: "pt", format: [dimensions.width, dimensions.height], orientation: "landscape", compress: true });
    for (var i = 0; i < slidePaths.length; i++) {
      var slide = await renderSlide(zip, slidePaths[i], dimensions);
      els.stage.innerHTML = ""; els.stage.appendChild(slide);
      var canvas = await html2canvas(slide, { scale: 1.5, backgroundColor: "#ffffff", logging: false });
      if (i) pdf.addPage([dimensions.width, dimensions.height], "landscape");
      pdf.addImage(canvas.toDataURL("image/jpeg", .92), "JPEG", 0, 0, dimensions.width, dimensions.height);
      setProgress(item, 15 + Math.round((i + 1) / slidePaths.length * 83));
    }
    els.stage.innerHTML = "";
    return pdf.output("blob");
  }

  async function renderSlide(zip, path, dimensions) {
    var xml = await zip.file(path).async("text"), doc = parseXml(xml), rels = await slideRelationships(zip, path);
    var slide = document.createElement("div"); slide.className = "ppt-slide"; slide.style.width = dimensions.width + "px"; slide.style.height = dimensions.height + "px";
    var root = doc.documentElement, shapes = root ? root.getElementsByTagNameNS("*", "spTree")[0] : null;
    if (!shapes) return slide;
    var nodes = Array.from(shapes.children);
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], kind = node.localName;
      var box = pptBox(node, dimensions);
      if (!box) continue;
      if (kind === "sp") {
        var text = Array.from(node.getElementsByTagNameNS("*", "t")).map(function (n) { return n.textContent; }).join("");
        var shape = document.createElement("div"); shape.className = text ? "ppt-text" : "ppt-shape"; applyBox(shape, box);
        var fill = node.getElementsByTagNameNS("*", "solidFill")[0], color = fill && fill.getElementsByTagNameNS("*", "srgbClr")[0];
        if (color) shape.style.backgroundColor = "#" + color.getAttribute("val");
        if (text) { shape.textContent = text; shape.style.padding = Math.max(4, box.height * .05) + "px"; shape.style.fontSize = Math.max(10, Math.min(34, box.height * .23)) + "px"; shape.style.color = "#18211e"; }
        slide.appendChild(shape);
      } else if (kind === "pic") {
        var blip = node.getElementsByTagNameNS("*", "blip")[0], rid = blip && (blip.getAttribute("r:embed") || blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed"));
        var target = rid && rels[rid];
        if (target && zip.file(target)) { var image = document.createElement("img"); image.src = await blobDataUrl(await zip.file(target).async("blob")); image.className = "ppt-text"; applyBox(image, box); image.style.objectFit = "contain"; slide.appendChild(image); }
      }
    }
    return slide;
  }

  function pptBox(node, dimensions) {
    var xfrm = node.getElementsByTagNameNS("*", "xfrm")[0], off = xfrm && xfrm.getElementsByTagNameNS("*", "off")[0], ext = xfrm && xfrm.getElementsByTagNameNS("*", "ext")[0];
    if (!off || !ext) return null;
    var emu = 914400, sourceWidth = dimensions.emuWidth || 9144000, sourceHeight = dimensions.emuHeight || 6858000;
    return { left: Number(off.getAttribute("x") || 0) / sourceWidth * dimensions.width, top: Number(off.getAttribute("y") || 0) / sourceHeight * dimensions.height, width: Number(ext.getAttribute("cx") || 0) / sourceWidth * dimensions.width, height: Number(ext.getAttribute("cy") || 0) / sourceHeight * dimensions.height, rotate: 0 };
  }

  function applyBox(element, box) { element.style.left = box.left + "px"; element.style.top = box.top + "px"; element.style.width = box.width + "px"; element.style.height = box.height + "px"; }

  async function getSlideDimensions(zip) {
    var defaultWidth = 960, defaultHeight = 540, file = zip.file("ppt/presentation.xml");
    if (!file) return { width: defaultWidth, height: defaultHeight, emuWidth: 9144000, emuHeight: 5143500 };
    var doc = parseXml(await file.async("text")), size = doc.getElementsByTagNameNS("*", "sldSz")[0], emuWidth = size && Number(size.getAttribute("cx")), emuHeight = size && Number(size.getAttribute("cy"));
    if (!emuWidth || !emuHeight) return { width: defaultWidth, height: defaultHeight, emuWidth: 9144000, emuHeight: 5143500 };
    return { width: defaultWidth, height: Math.round(defaultWidth * emuHeight / emuWidth), emuWidth: emuWidth, emuHeight: emuHeight };
  }

  async function slideRelationships(zip, slidePath) {
    var name = slidePath.split("/").pop(), relPath = "ppt/slides/_rels/" + name + ".rels", file = zip.file(relPath), map = {};
    if (!file) return map;
    var doc = parseXml(await file.async("text"));
    Array.from(doc.getElementsByTagNameNS("*", "Relationship")).forEach(function (node) {
      var target = node.getAttribute("Target"), base = "ppt/slides/";
      if (target) { while (target.indexOf("../") === 0) { target = target.slice(3); base = base.replace(/[^/]+\/$/, ""); } map[node.getAttribute("Id")] = target.indexOf("/") === 0 ? target.slice(1) : base + target; }
    });
    return map;
  }

  function parseXml(xml) {
    /* Keep the local fast-xml-parser-compatible dependency exercised for validation,
       then use the native document for namespace-aware layout traversal. */
    var Parser = window.XMLParser || (window.fxp && window.fxp.XMLParser);
    if (Parser) new Parser({ ignoreAttributes: false }).parse(xml);
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("The Office XML is malformed.");
    return doc;
  }

  function setProgress(item, value) { item.progress = Math.max(0, Math.min(100, value)); renderQueue(); }
  function waitForImages(root) { var images = Array.from(root.querySelectorAll("img")); return Promise.all(images.map(function (image) { return image.complete ? Promise.resolve() : new Promise(function (resolve) { image.onload = image.onerror = resolve; }); })); }
  function blobDataUrl(blob) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(blob); }); }
  function extension(name) { return name.toLowerCase().split(".").pop(); }
  function numberIn(name) { var match = name.match(/(\d+)\.xml$/); return match ? Number(match[1]) : 0; }
  function pdfName(name) { return name.replace(/\.(docx|pptx)$/i, "") + ".pdf"; }
  function formatBytes(bytes) { if (!bytes) return "0 B"; var units = ["B", "KB", "MB", "GB"], index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1); return (bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0) + " " + units[index]; }
  function friendlyError(error) { return error && error.message ? error.message.slice(0, 72) : "Could not convert"; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, function (character) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]; }); }
  function showNotice(message, kind, includeZip) { els.notice.hidden = false; els.notice.className = "notice " + kind; els.notice.innerHTML = escapeHtml(message) + (includeZip ? ' <button id="zip-button" class="text-button" type="button">Download ZIP →</button>' : ""); if (includeZip) document.getElementById("zip-button").addEventListener("click", downloadZip); }
  function hideNotice() { els.notice.hidden = true; els.notice.textContent = ""; }
  function downloadBlob(blob, name) { if (!blob) return; var url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); }
  async function downloadZip() { var zip = new JSZip(), items = state.files.filter(function (item) { return item.status === "done" && item.blob; }); items.forEach(function (item) { zip.file(pdfName(item.file.name), item.blob); }); downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE" }), "pdfLab-pdfs.zip"); }
}());
