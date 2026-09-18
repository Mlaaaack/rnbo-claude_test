// ==========================================================================
// Slider Chords — logique RNBO / Web Audio
// Ne dépend d'aucun style particulier : uniquement des id/classes du DOM.
// Pour changer de patch : remplacer patch/patch_export.json (et
// patch/dependencies.json si besoin) — rien ici à modifier.
// ==========================================================================
(function () {
  "use strict";

  // ---- config : chemins des fichiers du patch ----
  const PATCH_URL = "patch/patch_export.json";
  const DEPENDENCIES_URL = "patch/dependencies.json";

  // Libellés français pour les paramètres RNBO connus. Tout paramètre
  // non listé ici s'affiche simplement avec son nom brut — donc un
  // nouvel export avec des paramètres différents fonctionne sans y
  // toucher.
  const LABELS = {
    bpm: "Tempo",
    metro: "Métronome",
    tempo_delta: "Variation de tempo",
    beat_slide: "Glissando rythmique",
    slide: "Glissando"
  };

  // ---- storage helpers (confort par visiteur uniquement) ----
  function loadSaved() {
    try {
      const raw = localStorage.getItem("slider-chords-params");
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function saveParam(name, value) {
    try {
      const all = loadSaved();
      all[name] = value;
      localStorage.setItem("slider-chords-params", JSON.stringify(all));
    } catch (e) { /* ignore */ }
  }

  const errBox = document.getElementById("errBox");
  function showError(msg) {
    errBox.style.display = "block";
    errBox.textContent = msg;
  }

  let context = null;
  let device = null;
  let analyser = null;
  let masterGain = null;
  let running = false;
  let rafId = null;
  let patcher = null;
  let dependencies = [];

  const powerBtn = document.getElementById("powerBtn");
  const powerLabel = document.getElementById("powerLabel");
  const controlsEl = document.getElementById("controls");
  const triggerPad = document.getElementById("triggerPad");
  const canvas = document.getElementById("scopeCanvas");
  const ctx2d = canvas.getContext("2d");

  function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);

  function drawIdle() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.strokeStyle = "rgba(95,217,196,0.25)";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(0, h / 2);
    ctx2d.lineTo(w, h / 2);
    ctx2d.stroke();
  }

  function drawScope() {
    if (!analyser) return;
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.lineWidth = 1.8;
    ctx2d.strokeStyle = "#5fd9c4";
    ctx2d.shadowColor = "rgba(95,217,196,0.6)";
    ctx2d.shadowBlur = 6;
    ctx2d.beginPath();
    const slice = w / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
      x += slice;
    }
    ctx2d.stroke();
    ctx2d.shadowBlur = 0;
    rafId = requestAnimationFrame(drawScope);
  }

  // ---- generic rotary knob ----
  function createKnob(el, opts) {
    const { min, max, value, step, onChange } = opts;
    const pointer = el.querySelector(".pointer");
    let val = value;

    function normalize(v) { return (v - min) / (max - min || 1); }
    function render() {
      const n = Math.min(1, Math.max(0, normalize(val)));
      const angle = -135 + n * 270;
      pointer.style.transform = "translate(-50%,0) rotate(" + angle + "deg)";
    }
    function setValue(v, notify) {
      v = Math.min(max, Math.max(min, v));
      if (step) v = Math.round(v / step) * step;
      val = v;
      render();
      if (notify !== false && onChange) onChange(val);
    }

    let dragging = false, startY = 0, startVal = 0;
    const sensitivity = (max - min) / 140;

    function pointerDown(e) {
      dragging = true;
      startY = e.clientY;
      startVal = val;
      el.setPointerCapture(e.pointerId);
    }
    function pointerMove(e) {
      if (!dragging) return;
      const dy = startY - e.clientY;
      setValue(startVal + dy * sensitivity);
    }
    function pointerUp(e) {
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    }

    el.addEventListener("pointerdown", pointerDown);
    el.addEventListener("pointermove", pointerMove);
    el.addEventListener("pointerup", pointerUp);
    el.addEventListener("pointercancel", pointerUp);
    el.addEventListener("dblclick", function () {
      setValue(opts.defaultValue !== undefined ? opts.defaultValue : min);
    });
    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      setValue(val + (e.deltaY < 0 ? 1 : -1) * (max - min) / 50);
    }, { passive: false });

    render();
    return { setValue: function (v) { setValue(v, false); }, getValue: function () { return val; } };
  }

  function fmt(n) {
    if (Math.abs(n) >= 100) return Math.round(n).toString();
    return (Math.round(n * 100) / 100).toString();
  }

  function buildControls() {
    controlsEl.innerHTML = "";
    const saved = loadSaved();

    (patcher.desc.parameters || []).forEach(function (p) {
      if (p.visible === false) return;
      const isToggle = p.isEnum && p.enumValues && p.enumValues.length === 2;
      const label = LABELS[p.name] || p.name;
      const initial = (saved[p.name] !== undefined) ? saved[p.name] : p.initialValue;

      const wrap = document.createElement("div");
      wrap.className = "ctrl";

      const labelEl = document.createElement("div");
      labelEl.className = "label";
      labelEl.textContent = label;
      wrap.appendChild(labelEl);

      if (isToggle) {
        const t = document.createElement("div");
        t.className = "toggle-wrap";
        const sw = document.createElement("div");
        sw.className = "toggle" + (initial >= 1 ? " on" : "");
        const dot = document.createElement("div");
        dot.className = "knob-dot";
        sw.appendChild(dot);
        t.appendChild(sw);
        wrap.appendChild(t);

        const valueEl = document.createElement("div");
        valueEl.className = "value";
        valueEl.textContent = initial >= 1 ? "On" : "Off";
        wrap.appendChild(valueEl);

        sw.addEventListener("click", function () {
          const on = !sw.classList.contains("on");
          sw.classList.toggle("on", on);
          valueEl.textContent = on ? "On" : "Off";
          setParam(p.name, on ? 1 : 0);
          saveParam(p.name, on ? 1 : 0);
        });
      } else {
        const knobEl = document.createElement("div");
        knobEl.className = "knob";
        knobEl.innerHTML = '<div class="knob-body"></div><div class="pointer"></div>';
        wrap.appendChild(knobEl);

        const valueEl = document.createElement("div");
        valueEl.className = "value";
        valueEl.textContent = fmt(initial);
        wrap.appendChild(valueEl);

        createKnob(knobEl, {
          min: p.minimum, max: p.maximum, value: initial,
          defaultValue: p.initialValue,
          step: p.steps > 0 ? (p.maximum - p.minimum) / p.steps : (p.maximum - p.minimum) / 1000,
          onChange: function (v) {
            valueEl.textContent = fmt(v);
            setParam(p.name, v);
            saveParam(p.name, v);
          }
        });
      }

      controlsEl.appendChild(wrap);
    });
  }

  function setParam(name, value) {
    if (!device) return;
    const param = device.parametersById.get(name);
    if (param) param.value = value;
  }

  function applyAllParamsToDevice() {
    const saved = loadSaved();
    (patcher.desc.parameters || []).forEach(function (p) {
      const v = (saved[p.name] !== undefined) ? saved[p.name] : p.initialValue;
      setParam(p.name, v);
    });
  }

  function sendBang() {
    if (!device) return;
    // Un message sans payload (undefined) = un "bang" pour @rnbo/js.
    // Un tableau vide [] enverrait une liste vide, pas un bang.
    device.scheduleEvent(new RNBO.MessageEvent(RNBO.TimeNow, "in1"));
    triggerPad.classList.add("flash");
    setTimeout(function () { triggerPad.classList.remove("flash"); }, 120);
  }

  // ---- master volume knob ----
  const masterKnobEl = document.getElementById("masterKnob");
  const savedMaster = (function () {
    try {
      const v = localStorage.getItem("slider-chords-master");
      return v !== null ? parseFloat(v) : 0.8;
    } catch (e) { return 0.8; }
  })();
  createKnob(masterKnobEl, {
    min: 0, max: 1, value: savedMaster, defaultValue: 0.8, step: 0.01,
    onChange: function (v) {
      if (masterGain) masterGain.gain.setTargetAtTime(v, context.currentTime, 0.01);
      try { localStorage.setItem("slider-chords-master", String(v)); } catch (e) {}
    }
  });

  // ---- load the RNBO runtime that matches the patch's export version ----
  function loadRNBOScript(version) {
    return new Promise(function (resolve, reject) {
      if (window.RNBO && window.RNBO.version === version) return resolve();
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@rnbo/js@" + version + "/dist/rnbo.webaudio.js";
      script.onload = resolve;
      script.onerror = function () {
        reject(new Error("Impossible de charger @rnbo/js v" + version + " depuis jsDelivr."));
      };
      document.body.appendChild(script);
    });
  }

  async function loadPatchFiles() {
    const [patchRes, depsRes] = await Promise.all([
      fetch(PATCH_URL),
      fetch(DEPENDENCIES_URL).catch(function () { return null; })
    ]);
    if (!patchRes.ok) throw new Error("Impossible de charger " + PATCH_URL);
    patcher = await patchRes.json();
    dependencies = (depsRes && depsRes.ok) ? await depsRes.json() : [];
  }

  async function ensureAudio() {
    if (context) return;
    const WAContext = window.AudioContext || window.webkitAudioContext;
    context = new WAContext();

    await loadRNBOScript(patcher.desc.meta.rnboversion);
    if (typeof RNBO === "undefined") {
      throw new Error("La librairie RNBO n'a pas pu être chargée (rnbo.js).");
    }

    device = await RNBO.createDevice({ context, patcher });

    if (dependencies && dependencies.length) {
      try { await device.loadDataBufferDependencies(dependencies); } catch (e) { /* pas de sample dans ce patch */ }
    }

    masterGain = context.createGain();
    masterGain.gain.value = savedMaster;

    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;

    device.node.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(context.destination);

    applyAllParamsToDevice();
  }

  async function start() {
    await ensureAudio();
    await context.resume();
    running = true;
    powerBtn.classList.add("running");
    powerLabel.textContent = "Actif";
    cancelAnimationFrame(rafId);
    drawScope();
  }

  async function stop() {
    await context.suspend();
    running = false;
    powerBtn.classList.remove("running");
    powerLabel.textContent = "Démarrer";
    cancelAnimationFrame(rafId);
    drawIdle();
  }

  triggerPad.addEventListener("click", async function () {
    try {
      if (!running) await start();
      sendBang();
    } catch (err) {
      console.error(err);
      showError("Impossible de déclencher : " + (err && err.message ? err.message : err));
    }
  });

  powerBtn.addEventListener("click", async function () {
    try {
      if (!running) await start(); else await stop();
    } catch (err) {
      console.error(err);
      showError("Impossible de démarrer l'audio : " + (err && err.message ? err.message : err));
    }
  });

  // ---- boot ----
  (async function init() {
    resizeCanvas();
    drawIdle();
    try {
      await loadPatchFiles();
      buildControls();
    } catch (err) {
      console.error(err);
      showError("Impossible de charger le patch : " + (err && err.message ? err.message : err));
    }
  })();

})();
