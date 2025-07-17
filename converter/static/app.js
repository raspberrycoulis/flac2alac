// converter/static/app.js

let cwd = "";
const selected = new Set();

const fileList        = document.getElementById("fileList");
const currentPath     = document.getElementById("currentPath");
const logEl           = document.getElementById("log");
const progressSection = document.getElementById("progressSection");
const determinateBar  = document.querySelector("#progressSection .determinate");
const etaEl           = document.getElementById("eta");
const summaryEl       = document.getElementById("summary");
const sampleRateSelect= document.getElementById("sampleRate");

async function loadDir(path) {
  cwd = path;
  currentPath.textContent = "/" + path;
  fileList.innerHTML = "";

  const res = await fetch(`/api/list?path=${encodeURIComponent(path)}`);
  if (!res.ok) return M.toast({ html: 'Error loading directory', classes: 'red' });
  const entries = await res.json();

  for (const e of entries) {
    const li = document.createElement("li");
    // add both 'collection-item' and 'avatar' for proper icon sizing
    li.className = "collection-item avatar";

    // Checkbox & indicator span
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "filled-in";
    cb.id        = `cb-${e.path}`;
    cb.checked   = selected.has(e.path);
    cb.onchange = ev => {
      ev.stopPropagation();
      if (cb.checked) selected.add(e.path);
      else selected.delete(e.path);
    };
    label.appendChild(cb);

    const indicatorSpan = document.createElement("span");
    label.appendChild(indicatorSpan);

    // Icon
    const icon = document.createElement("i");
    icon.className = `material-icons circle ${e.is_dir ? 'blue' : 'green'}`;
    icon.textContent = e.is_dir ? 'folder' : 'music_note';
    label.appendChild(icon);

    // Name (clickable if folder)
    const nameSpan = document.createElement("span");
    nameSpan.textContent = e.name;
    nameSpan.style.marginLeft = "0.5em";
    nameSpan.style.flexGrow   = "1";
    if (e.is_dir) {
      nameSpan.style.cursor = "pointer";
      nameSpan.onclick = () => loadDir(e.path);
    }
    label.appendChild(nameSpan);

    li.appendChild(label);
    fileList.appendChild(li);
  }
}

document.getElementById("upBtn").onclick = () => {
  const parent = cwd.split("/").slice(0, -1).join("/");
  loadDir(parent);
};

document.getElementById("convertBtn").onclick = async () => {
  if (selected.size === 0) {
    return M.toast({ html: 'Select files or directories', classes: 'yellow darken-2' });
  }
  const payload = { paths: [...selected] };
  const sr = sampleRateSelect.value;
  if (sr) payload.sample_rate = parseInt(sr, 10);

  // Reset UI
  logEl.textContent = "";
  determinateBar.style.width = "0%";
  etaEl.textContent = "Estimated time remaining: --:--:--";
  summaryEl.textContent = "";
  progressSection.style.display = "block";

  const res = await fetch("/api/convert", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload)
  });
  if (!res.ok) {
    return M.toast({ html: 'Conversion request failed', classes: 'red' });
  }
  const { job_id } = await res.json();
  pollStatus(job_id);
};

async function pollStatus(job_id) {
  const res = await fetch(`/api/status/${job_id}`);
  if (!res.ok) {
    return M.toast({ html: 'Failed to fetch status', classes: 'red' });
  }
  const js = await res.json();

  // Log
  logEl.textContent = js.log.join("\n");

  // Progress + ETA
  if (js.total > 0) {
    const pct = (js.processed / js.total) * 100;
    determinateBar.style.width = pct + "%";
    if (js.processed > 0 && js.status !== "finished") {
      const elapsed = (Date.now() - new Date(js.start_time).getTime()) / 1000;
      const rate    = elapsed / js.processed;
      const remaining = js.total - js.processed;
      etaEl.textContent = "Estimated time remaining: " + formatTime(rate * remaining);
    }
  }

  // Finished summary
  if (js.status === "finished") {
    determinateBar.style.width = "100%";
    etaEl.textContent = "Estimated time remaining: 00:00:00";
    const successes = js.processed - js.errors.length;
    summaryEl.innerHTML = `
      <strong>Success:</strong> ${successes}<br>
      <strong>Failed:</strong> ${js.errors.length}
    `;
    if (js.errors.length) {
      summaryEl.innerHTML += `<ul>${
        js.errors.map(e => `<li>${e}</li>`).join("")
      }</ul>`;
    }
    M.toast({ html: 'Conversion complete!', classes: 'green' });
    return;
  }

  setTimeout(() => pollStatus(job_id), 1000);
}

function formatTime(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = n => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Initialize Materialize components then load root
document.addEventListener('DOMContentLoaded', () => {
  M.FormSelect.init(document.querySelectorAll('select'));
  M.Collapsible.init(document.querySelectorAll('.collapsible'));
  loadDir("");
});