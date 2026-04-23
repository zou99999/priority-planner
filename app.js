const STORAGE_KEY = "priority-planner-v1";
const palette = ["#227c6f", "#3457a6", "#b24d63", "#ba7a22", "#6f5aa8", "#4f7f38"];

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const sample = {
  fixed: `09:00-10:15 数据结构课
11:00-12:00 小组会议
14:00-17:00 工作 shift
19:00-20:00 晚饭 + 通勤`,
  priorities: [
    { id: uid(), title: "健身 / 拉伸", category: "健康", minutes: 60, priority: 5, block: 30, windowStart: "07:30", windowEnd: "22:00" },
    { id: uid(), title: "复习专业课", category: "学习", minutes: 120, priority: 5, block: 60, windowStart: "08:00", windowEnd: "23:00" },
    { id: uid(), title: "整理房间", category: "家务", minutes: 40, priority: 3, block: 20, windowStart: "10:00", windowEnd: "21:00" },
    { id: uid(), title: "钢琴 / 画画", category: "爱好", minutes: 75, priority: 4, block: 45, windowStart: "12:00", windowEnd: "22:30" },
    { id: uid(), title: "联系朋友", category: "关系", minutes: 30, priority: 3, block: 15, windowStart: "16:00", windowEnd: "23:00" }
  ],
  constraints: { dayStart: "07:30", dayEnd: "23:00", bufferMinutes: 10, defaultBlock: 45 },
  schedule: []
};

let state = loadState();

const el = {
  fixedInput: document.querySelector("#fixedInput"),
  dayStart: document.querySelector("#dayStart"),
  dayEnd: document.querySelector("#dayEnd"),
  bufferMinutes: document.querySelector("#bufferMinutes"),
  defaultBlock: document.querySelector("#defaultBlock"),
  priorityList: document.querySelector("#priorityList"),
  timeline: document.querySelector("#timeline"),
  timeRuler: document.querySelector("#timeRuler"),
  insights: document.querySelector("#insights"),
  balanceCanvas: document.querySelector("#balanceCanvas"),
  balanceLegend: document.querySelector("#balanceLegend"),
  dayView: document.querySelector("#dayView"),
  balanceView: document.querySelector("#balanceView"),
  editDialog: document.querySelector("#editDialog")
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(sample);
  try {
    return { ...structuredClone(sample), ...JSON.parse(raw) };
  } catch {
    return structuredClone(sample);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function minutesFromTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(total) {
  const minutes = ((Math.round(total / 5) * 5) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function parseFixedSchedule(text) {
  if (/BEGIN:VEVENT/.test(text)) return parseIcs(text);
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const csv = line.split(",").map((part) => part.trim());
      if (csv.length >= 3 && /^\d{1,2}:\d{2}$/.test(csv[0]) && /^\d{1,2}:\d{2}$/.test(csv[1])) {
        return makeEvent(csv[2], csv[0], csv[1], "fixed", index);
      }
      const match = line.match(/(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s+(.+)/);
      if (!match) return null;
      return makeEvent(match[3], match[1], match[2], "fixed", index);
    })
    .filter(Boolean);
}

function parseIcs(text) {
  return text
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((chunk, index) => {
      const summary = readIcsField(chunk, "SUMMARY") || "日历事件";
      const start = readIcsField(chunk, "DTSTART");
      const end = readIcsField(chunk, "DTEND");
      if (!start || !end) return null;
      const startTime = timeFromIcs(start);
      const endTime = timeFromIcs(end);
      if (!startTime || !endTime) return null;
      return makeEvent(summary, startTime, endTime, "fixed", index);
    })
    .filter(Boolean);
}

function readIcsField(chunk, field) {
  const match = chunk.match(new RegExp(`${field}(?:;[^:]*)?:(.+)`));
  return match ? match[1].trim() : "";
}

function timeFromIcs(value) {
  const match = value.match(/T(\d{2})(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

function makeEvent(title, start, end, type, index = 0, sourceId = "") {
  return {
    id: `${type}-${sourceId || index}-${start}-${end}-${title}`.replace(/\s+/g, "-"),
    title,
    start: minutesFromTime(start),
    end: minutesFromTime(end),
    type,
    sourceId
  };
}

function applyInputsToState() {
  state.fixed = el.fixedInput.value;
  state.constraints = {
    dayStart: el.dayStart.value,
    dayEnd: el.dayEnd.value,
    bufferMinutes: Number(el.bufferMinutes.value || 0),
    defaultBlock: Number(el.defaultBlock.value || 45)
  };
}

function renderControls() {
  el.fixedInput.value = state.fixed;
  el.dayStart.value = state.constraints.dayStart;
  el.dayEnd.value = state.constraints.dayEnd;
  el.bufferMinutes.value = state.constraints.bufferMinutes;
  el.defaultBlock.value = state.constraints.defaultBlock;
  el.priorityList.innerHTML = "";

  state.priorities.forEach((item, index) => {
    const row = document.createElement("article");
    row.className = "priority-item";
    row.style.borderLeftColor = palette[index % palette.length];
    row.dataset.id = item.id;
    row.innerHTML = `
      <div class="priority-main">
        <label>
          <span>任务</span>
          <input data-field="title" type="text" value="${escapeAttr(item.title)}" />
        </label>
        <button class="icon-button remove-priority" title="删除" aria-label="删除"><span aria-hidden="true">×</span></button>
      </div>
      <div class="priority-fields">
        <label>
          <span>类别</span>
          <input data-field="category" type="text" value="${escapeAttr(item.category)}" />
        </label>
        <label>
          <span>总时长</span>
          <input data-field="minutes" type="number" min="10" max="480" step="5" value="${item.minutes}" />
        </label>
        <label>
          <span>最短块</span>
          <input data-field="block" type="number" min="10" max="180" step="5" value="${item.block || state.constraints.defaultBlock}" />
        </label>
      </div>
      <div class="priority-range">
        <span>优先级</span>
        <input data-field="priority" type="range" min="1" max="5" value="${item.priority}" />
        <strong>${item.priority}</strong>
      </div>
      <div class="priority-fields">
        <label>
          <span>可开始</span>
          <input data-field="windowStart" type="time" value="${item.windowStart || state.constraints.dayStart}" />
        </label>
        <label>
          <span>可结束</span>
          <input data-field="windowEnd" type="time" value="${item.windowEnd || state.constraints.dayEnd}" />
        </label>
        <label>
          <span>节奏</span>
          <select data-field="pace">
            <option value="deep" ${item.pace === "deep" ? "selected" : ""}>深度</option>
            <option value="light" ${item.pace === "light" ? "selected" : ""}>轻量</option>
            <option value="social" ${item.pace === "social" ? "selected" : ""}>社交</option>
          </select>
        </label>
      </div>
    `;
    el.priorityList.append(row);
  });
}

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function buildSchedule() {
  applyInputsToState();
  const fixed = parseFixedSchedule(state.fixed);
  const dayStart = minutesFromTime(state.constraints.dayStart);
  const dayEnd = minutesFromTime(state.constraints.dayEnd);
  const buffer = Number(state.constraints.bufferMinutes);
  const busy = fixed.map((event) => ({
    ...event,
    busyStart: Math.max(dayStart, event.start - buffer),
    busyEnd: Math.min(dayEnd, event.end + buffer)
  }));
  const generated = [];
  const sortedPriorities = [...state.priorities].sort((a, b) => {
    const scoreA = Number(a.priority) * 1000 - Number(a.minutes);
    const scoreB = Number(b.priority) * 1000 - Number(b.minutes);
    return scoreB - scoreA;
  });

  sortedPriorities.forEach((priority) => {
    let remaining = Number(priority.minutes);
    const minBlock = Number(priority.block || state.constraints.defaultBlock);
    const windowStart = Math.max(dayStart, minutesFromTime(priority.windowStart || state.constraints.dayStart));
    const windowEnd = Math.min(dayEnd, minutesFromTime(priority.windowEnd || state.constraints.dayEnd));

    while (remaining >= Math.min(15, minBlock)) {
      const windows = findFreeWindows(dayStart, dayEnd, [...busy, ...generated], windowStart, windowEnd);
      const bestWindow = windows
        .filter((slot) => slot.end - slot.start >= Math.min(minBlock, remaining))
        .sort((a, b) => b.end - b.start - (a.end - a.start))[0];
      if (!bestWindow) break;

      const blockLength = Math.min(remaining, bestWindow.end - bestWindow.start, Math.max(minBlock, Math.min(90, remaining)));
      const start = chooseStart(bestWindow, blockLength, priority);
      const event = {
        id: `gen-${priority.id}-${generated.length}-${start}`,
        title: priority.title,
        category: priority.category,
        start,
        end: start + blockLength,
        busyStart: Math.max(dayStart, start - buffer),
        busyEnd: Math.min(dayEnd, start + blockLength + buffer),
        type: "generated",
        priority: priority.priority,
        sourceId: priority.id
      };
      generated.push(event);
      remaining -= blockLength;
    }
  });

  state.schedule = [...fixed, ...generated].sort((a, b) => a.start - b.start);
  saveState();
  renderSchedule();
}

function findFreeWindows(dayStart, dayEnd, events, windowStart, windowEnd) {
  const occupied = events
    .map((event) => ({
      start: Math.max(dayStart, event.busyStart ?? event.start),
      end: Math.min(dayEnd, event.busyEnd ?? event.end)
    }))
    .filter((event) => event.end > event.start)
    .sort((a, b) => a.start - b.start);

  const windows = [];
  let cursor = Math.max(dayStart, windowStart);
  occupied.forEach((event) => {
    if (event.start > cursor) windows.push({ start: cursor, end: Math.min(event.start, windowEnd) });
    cursor = Math.max(cursor, event.end);
  });
  if (cursor < windowEnd) windows.push({ start: cursor, end: windowEnd });
  return windows.filter((slot) => slot.end > slot.start);
}

function chooseStart(slot, length, priority) {
  if (priority.pace === "light" || priority.pace === "social") return slot.end - length;
  return slot.start;
}

function renderSchedule() {
  const dayStart = minutesFromTime(state.constraints.dayStart);
  const dayEnd = minutesFromTime(state.constraints.dayEnd);
  const total = Math.max(60, dayEnd - dayStart);
  const pxPerMinute = 760 / total;
  const height = Math.max(660, total * pxPerMinute);

  el.timeline.style.minHeight = `${height}px`;
  el.timeRuler.style.minHeight = `${height}px`;
  el.timeline.innerHTML = "";
  el.timeRuler.innerHTML = "";

  for (let t = Math.ceil(dayStart / 60) * 60; t <= dayEnd; t += 60) {
    const label = document.createElement("span");
    label.className = "ruler-label";
    label.style.top = `${((t - dayStart) / total) * 100}%`;
    label.textContent = timeFromMinutes(t);
    el.timeRuler.append(label);
  }

  const conflicts = findConflicts(state.schedule);
  state.schedule.forEach((event, index) => {
    const block = document.createElement("button");
    block.className = `schedule-block ${event.type} ${conflicts.has(event.id) ? "conflict" : ""}`;
    block.style.top = `${((event.start - dayStart) / total) * 100}%`;
    block.style.height = `${Math.max(34, ((event.end - event.start) / total) * height)}px`;
    if (event.type === "generated") block.style.background = tintFor(event.sourceId);
    block.dataset.id = event.id;
    block.innerHTML = `
      <span class="schedule-title">
        <span>${event.title}</span>
        <span class="drag-hint" aria-hidden="true">${event.type === "fixed" ? "锁定" : "↕"}</span>
      </span>
      <span class="schedule-meta">${timeFromMinutes(event.start)}-${timeFromMinutes(event.end)} · ${event.category || "固定"} · ${formatDuration(event.end - event.start)}</span>
    `;
    block.addEventListener("click", () => openEditDialog(event.id));
    enableDrag(block, event, dayStart, dayEnd, total, height);
    el.timeline.append(block);
  });

  renderInsights(conflicts);
  drawBalance();
}

function tintFor(sourceId) {
  const index = Math.abs([...sourceId].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 4;
  return ["var(--green-soft)", "var(--gold-soft)", "var(--rose-soft)", "var(--blue-soft)"][index];
}

function findConflicts(events) {
  const conflicts = new Set();
  const sorted = [...events].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].start < sorted[i - 1].end) {
      conflicts.add(sorted[i].id);
      conflicts.add(sorted[i - 1].id);
    }
  }
  return conflicts;
}

function renderInsights(conflicts) {
  const fixedMinutes = state.schedule.filter((event) => event.type === "fixed").reduce((sum, event) => sum + event.end - event.start, 0);
  const plannedMinutes = state.schedule.filter((event) => event.type === "generated").reduce((sum, event) => sum + event.end - event.start, 0);
  const requested = state.priorities.reduce((sum, item) => sum + Number(item.minutes), 0);
  const coverage = requested ? Math.round((plannedMinutes / requested) * 100) : 0;
  const dayLength = minutesFromTime(state.constraints.dayEnd) - minutesFromTime(state.constraints.dayStart);
  const openMinutes = Math.max(0, dayLength - fixedMinutes - plannedMinutes);

  el.insights.innerHTML = [
    [`${formatDuration(plannedMinutes)}`, "安排给优先事项"],
    [`${coverage}%`, "目标覆盖率"],
    [`${formatDuration(openMinutes)}`, "留白 / 机动"],
    [`${conflicts.size}`, "需要手动处理的冲突"]
  ]
    .map(([value, label]) => `<div class="insight"><strong>${value}</strong><span>${label}</span></div>`)
    .join("");
}

function drawBalance() {
  const canvas = el.balanceCanvas;
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(600, rect.width * scale);
  canvas.height = Math.max(300, rect.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const plannedBySource = new Map();
  state.schedule
    .filter((event) => event.type === "generated")
    .forEach((event) => plannedBySource.set(event.sourceId, (plannedBySource.get(event.sourceId) || 0) + event.end - event.start));

  const max = Math.max(...state.priorities.map((item) => Number(item.minutes)), 60);
  const width = rect.width || 900;
  const barHeight = 30;
  const gap = 20;
  const left = 128;
  const top = 36;

  ctx.font = "13px Inter, sans-serif";
  ctx.textBaseline = "middle";
  state.priorities.forEach((item, index) => {
    const y = top + index * (barHeight + gap);
    const requestedWidth = ((width - left - 34) * item.minutes) / max;
    const plannedWidth = ((width - left - 34) * (plannedBySource.get(item.id) || 0)) / max;
    ctx.fillStyle = "#66707c";
    ctx.fillText(item.category || item.title, 18, y + barHeight / 2);
    ctx.fillStyle = "#ebe5da";
    ctx.fillRect(left, y, requestedWidth, barHeight);
    ctx.fillStyle = palette[index % palette.length];
    ctx.fillRect(left, y, plannedWidth, barHeight);
    ctx.fillStyle = "#20242a";
    ctx.fillText(`${plannedBySource.get(item.id) || 0}/${item.minutes} 分钟`, left + Math.max(requestedWidth, plannedWidth) + 10, y + barHeight / 2);
  });

  el.balanceLegend.innerHTML = state.priorities
    .map((item, index) => `<span class="legend-item"><span class="swatch" style="background:${palette[index % palette.length]}"></span>${item.title}</span>`)
    .join("");
}

function enableDrag(node, event, dayStart, dayEnd, total, height) {
  if (event.type !== "generated") return;
  let startY = 0;
  let startMinutes = 0;

  node.addEventListener("pointerdown", (pointerEvent) => {
    node.setPointerCapture(pointerEvent.pointerId);
    startY = pointerEvent.clientY;
    startMinutes = event.start;
  });

  node.addEventListener("pointermove", (pointerEvent) => {
    if (!node.hasPointerCapture(pointerEvent.pointerId)) return;
    const delta = ((pointerEvent.clientY - startY) / height) * total;
    const snapped = Math.round(delta / 5) * 5;
    const length = event.end - event.start;
    event.start = Math.min(dayEnd - length, Math.max(dayStart, startMinutes + snapped));
    event.end = event.start + length;
    node.style.top = `${((event.start - dayStart) / total) * 100}%`;
    node.querySelector(".schedule-meta").textContent = `${timeFromMinutes(event.start)}-${timeFromMinutes(event.end)} · ${event.category || "固定"} · ${formatDuration(length)}`;
  });

  node.addEventListener("pointerup", (pointerEvent) => {
    if (!node.hasPointerCapture(pointerEvent.pointerId)) return;
    node.releasePointerCapture(pointerEvent.pointerId);
    saveState();
    renderSchedule();
  });
}

function openEditDialog(id) {
  const event = state.schedule.find((item) => item.id === id);
  if (!event) return;
  document.querySelector("#editId").value = event.id;
  document.querySelector("#editTitle").value = event.title;
  document.querySelector("#editStart").value = timeFromMinutes(event.start);
  document.querySelector("#editEnd").value = timeFromMinutes(event.end);
  document.querySelector("#deleteBlock").style.display = event.type === "fixed" ? "none" : "inline-flex";
  el.editDialog.showModal();
}

function updatePriorityFromInput(input) {
  const item = state.priorities.find((priority) => priority.id === input.closest(".priority-item").dataset.id);
  if (!item) return;
  const field = input.dataset.field;
  item[field] = input.type === "number" || input.type === "range" ? Number(input.value) : input.value;
  const valueLabel = input.parentElement?.parentElement?.querySelector("strong");
  if (field === "priority" && valueLabel) valueLabel.textContent = input.value;
  saveState();
}

function exportSchedule() {
  const rows = [["start", "end", "title", "type", "category"]];
  state.schedule.forEach((event) => rows.push([timeFromMinutes(event.start), timeFromMinutes(event.end), event.title, event.type, event.category || ""]));
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "priority-planner-schedule.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.querySelector("#generateButton").addEventListener("click", buildSchedule);
  document.querySelector("#exportButton").addEventListener("click", exportSchedule);
  document.querySelector("#saveButton").addEventListener("click", () => {
    applyInputsToState();
    saveState();
  });
  document.querySelector("#resetButton").addEventListener("click", () => {
    state = structuredClone(sample);
    saveState();
    renderControls();
    buildSchedule();
  });
  document.querySelector("#addPriority").addEventListener("click", () => {
    applyInputsToState();
    state.priorities.push({
      id: uid(),
      title: "新的优先事项",
      category: "生活",
      minutes: 45,
      priority: 3,
      block: state.constraints.defaultBlock,
      windowStart: state.constraints.dayStart,
      windowEnd: state.constraints.dayEnd,
      pace: "deep"
    });
    renderControls();
    saveState();
  });
  el.priorityList.addEventListener("input", (event) => {
    if (event.target.matches("input, select")) updatePriorityFromInput(event.target);
  });
  el.priorityList.addEventListener("click", (event) => {
    const button = event.target.closest(".remove-priority");
    if (!button) return;
    state.priorities = state.priorities.filter((priority) => priority.id !== button.closest(".priority-item").dataset.id);
    renderControls();
    buildSchedule();
  });
  document.querySelector("#scheduleFile").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    el.fixedInput.value = await file.text();
    buildSchedule();
  });
  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segmented button").forEach((item) => item.classList.toggle("active", item === button));
      el.dayView.classList.toggle("hidden", button.dataset.view !== "day");
      el.balanceView.classList.toggle("hidden", button.dataset.view !== "balance");
      drawBalance();
    });
  });
  document.querySelector("#applyEdit").addEventListener("click", (event) => {
    event.preventDefault();
    const item = state.schedule.find((block) => block.id === document.querySelector("#editId").value);
    if (!item) return;
    item.title = document.querySelector("#editTitle").value;
    item.start = minutesFromTime(document.querySelector("#editStart").value);
    item.end = minutesFromTime(document.querySelector("#editEnd").value);
    saveState();
    el.editDialog.close();
    renderSchedule();
  });
  document.querySelector("#deleteBlock").addEventListener("click", (event) => {
    event.preventDefault();
    state.schedule = state.schedule.filter((block) => block.id !== document.querySelector("#editId").value);
    saveState();
    el.editDialog.close();
    renderSchedule();
  });
  window.addEventListener("resize", drawBalance);
}

renderControls();
bindEvents();
if (!state.schedule.length) buildSchedule();
renderSchedule();
