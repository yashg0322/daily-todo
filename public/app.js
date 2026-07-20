const GUEST_THEME_KEY = "daily-todo-guest-theme";

const CATEGORIES = {
  personal: "Personal",
  work: "Work",
  health: "Health",
  shopping: "Shopping",
  other: "Other",
};

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const SECTIONS = {
  top3: {
    title: "Top 3 Priorities",
    desc: "Focus on what matters most",
    example: "e.g. Fix SQL query issue",
    icon: "◆",
    spanFull: true,
    maxActive: 3,
  },
  scheduled: {
    title: "Scheduled",
    desc: "Time-blocked items",
    example: "e.g. Team meeting 3–4 PM",
    icon: "◷",
    hasTime: true,
  },
  quickwin: {
    title: "Quick Wins",
    desc: "Small tasks for momentum",
    example: "e.g. Reply to client email",
    icon: "⚡",
  },
  learning: {
    title: "Learning Goals",
    desc: "Personal growth",
    example: "e.g. Read microservices article",
    icon: "📖",
    hasResource: true,
  },
  inbox: {
    title: "Inbox",
    desc: "Catch-all for everything else",
    example: "Tasks you haven't categorized yet",
    icon: "○",
  },
};

const MOODS = [
  { value: 1, emoji: "😫", label: "Rough" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "🌟", label: "Great" },
];

const $ = (id) => document.getElementById(id);

const els = {
  addForm: $("addForm"),
  taskInput: $("taskInput"),
  sectionInput: $("sectionInput"),
  dueDateInput: $("dueDateInput"),
  startTimeInput: $("startTimeInput"),
  endTimeInput: $("endTimeInput"),
  priorityInput: $("priorityInput"),
  categoryInput: $("categoryInput"),
  taskList: $("taskList"),
  emptyState: $("emptyState"),
  footer: $("footer"),
  clearCompletedBtn: $("clearCompleted"),
  dateDisplay: $("dateDisplay"),
  greeting: $("greeting"),
  activeCount: $("activeCount"),
  doneCount: $("doneCount"),
  focusCount: $("focusCount"),
  progressRing: $("progressRing"),
  progressPercent: $("progressPercent"),
  searchInput: $("searchInput"),
  sortSelect: $("sortSelect"),
  categoryBar: $("categoryBar"),
  filterButtons: document.querySelectorAll(".filter-btn"),
  viewTabs: document.querySelectorAll(".view-tab"),
  dashboardView: $("dashboardView"),
  allTasksView: $("allTasksView"),
  sectionsGrid: $("sectionsGrid"),
  dailyIntention: $("dailyIntention"),
  moodPicker: $("moodPicker"),
  reflectWentWell: $("reflectWentWell"),
  reflectImprove: $("reflectImprove"),
  reflectNotes: $("reflectNotes"),
  reflectSaveHint: $("reflectSaveHint"),
  reflectionStreak: $("reflectionStreak"),
  pastReflections: $("pastReflections"),
  themeToggle: $("themeToggle"),
  menuBtn: $("menuBtn"),
  dropdown: $("dropdown"),
  exportBtn: $("exportBtn"),
  importBtn: $("importBtn"),
  importFile: $("importFile"),
  editModal: $("editModal"),
  editForm: $("editForm"),
  editClose: $("editClose"),
  editText: $("editText"),
  editSection: $("editSection"),
  editDueDate: $("editDueDate"),
  editStartTime: $("editStartTime"),
  editEndTime: $("editEndTime"),
  editTimeRow: $("editTimeRow"),
  editPriority: $("editPriority"),
  editCategory: $("editCategory"),
  editResource: $("editResource"),
  editResourceField: $("editResourceField"),
  editNotes: $("editNotes"),
  editDelete: $("editDelete"),
  toast: $("toast"),
  toastMessage: $("toastMessage"),
  toastAction: $("toastAction"),
  authScreen: $("authScreen"),
  appRoot: $("appRoot"),
  loginForm: $("loginForm"),
  registerForm: $("registerForm"),
  loginEmail: $("loginEmail"),
  loginPassword: $("loginPassword"),
  registerName: $("registerName"),
  registerEmail: $("registerEmail"),
  registerPassword: $("registerPassword"),
  authError: $("authError"),
  authTabs: document.querySelectorAll(".auth-tab"),
  authFormTitle: $("authFormTitle"),
  authFormSubtitle: $("authFormSubtitle"),
  authThemeToggle: $("authThemeToggle"),
  loginSubmit: $("loginSubmit"),
  registerSubmit: $("registerSubmit"),
  userChip: $("userChip"),
  logoutBtn: $("logoutBtn"),
};

let tasks = [];
let prefs = { filter: "all", sort: "smart", category: "all", theme: "dark", view: "dashboard" };
let reflections = {};
let intentions = {};
let editingId = null;
let undoState = null;
let toastTimer = null;
let reflectSaveTimer = null;
let prefsSaveTimer = null;
let intentionSaveTimer = null;

const CIRCUMFERENCE = 2 * Math.PI * 15.5;

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    text: task.text || "",
    section: task.section || "inbox",
    dueDate: task.dueDate || null,
    startTime: task.startTime || null,
    endTime: task.endTime || null,
    completed: Boolean(task.completed),
    createdAt: task.createdAt || Date.now(),
    priority: task.priority || "medium",
    category: task.category || "personal",
    notes: task.notes || "",
    resourceUrl: task.resourceUrl || "",
  };
}

async function loadUserData() {
  const data = await API.bootstrap();
  tasks = (data.tasks || []).map(normalizeTask);
  reflections = data.reflections || {};
  intentions = data.intentions || {};
  prefs = { ...prefs, ...(data.prefs || {}) };
}

function scheduleSavePrefs() {
  clearTimeout(prefsSaveTimer);
  prefsSaveTimer = setTimeout(() => {
    API.savePrefs(prefs).catch(() => showToast("Could not save preferences"));
  }, 500);
}

function savePrefs() {
  scheduleSavePrefs();
}

async function persistReflection(date) {
  const r = reflections[date] || { mood: 0, wentWell: "", improve: "", notes: "" };
  try {
    await API.saveReflection(date, r);
  } catch {
    showToast("Could not save reflection");
  }
}

function saveReflections() {
  persistReflection(todayISO());
}

async function persistIntention(date, text) {
  try {
    await API.saveIntention(date, text);
  } catch {
    showToast("Could not save intention");
  }
}

function saveIntentions() {
  /* debounced via input handler */
}

function showAuth() {
  els.authScreen.hidden = false;
  els.appRoot.hidden = true;
}

function showApp() {
  els.authScreen.hidden = true;
  els.appRoot.hidden = false;
  const user = API.getUser();
  if (user) {
    els.userChip.textContent = user.name.split(" ")[0];
    els.userChip.title = `${user.name} (${user.email})`;
  }
}

function showAuthError(message) {
  els.authError.textContent = message;
  els.authError.hidden = !message;
}

function setAuthTab(tab) {
  const isLogin = tab === "login";
  els.loginForm.hidden = !isLogin;
  els.registerForm.hidden = isLogin;
  els.authTabs.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.authTab === tab);
  });
  if (els.authFormTitle) {
    els.authFormTitle.textContent = isLogin ? "Welcome back" : "Get started";
    els.authFormSubtitle.textContent = isLogin
      ? "Sign in to continue to your planner"
      : "Create your free account in seconds";
  }
  showAuthError("");
}

function setAuthLoading(form, loading) {
  const btn = form === "login" ? els.loginSubmit : els.registerSubmit;
  if (!btn) return;
  btn.disabled = loading;
  const text = btn.querySelector(".btn-text");
  const spinner = btn.querySelector(".btn-spinner");
  if (text) text.hidden = loading;
  if (spinner) spinner.hidden = !loading;
}

function togglePasswordVisibility(btn) {
  const input = document.getElementById(btn.dataset.target);
  if (!input) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.textContent = show ? "🙈" : "👁";
  btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
}

async function handleAuthSuccess(result) {
  API.setSession(result.token, result.user);
  showAuthError("");
  await loadUserData();
  showApp();
  applyTheme(prefs.theme);
  updateHeader();
  setView(prefs.view || "dashboard");
  showToast(`Welcome, ${result.user.name.split(" ")[0]}!`);
}

function logout() {
  API.clearSession();
  tasks = [];
  reflections = {};
  intentions = {};
  closeDropdown();
  showAuth();
  showToast("Signed out");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function updateHeader() {
  els.greeting.textContent = getGreeting();
  els.dateDisplay.textContent = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  prefs.theme = theme;
  if (API.getToken()) {
    scheduleSavePrefs();
  } else {
    localStorage.setItem(GUEST_THEME_KEY, theme);
  }
}

function getInitialTheme() {
  if (API.getToken()) return prefs.theme || "dark";
  return localStorage.getItem(GUEST_THEME_KEY) || "dark";
}

function countActiveInSection(section) {
  return tasks.filter((t) => t.section === section && !t.completed).length;
}

function isTaskNow(task) {
  if (task.section !== "scheduled" || !task.startTime || task.completed) return false;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = task.startTime.split(":").map(Number);
  const startMins = sh * 60 + sm;
  let endMins = startMins + 60;
  if (task.endTime) {
    const [eh, em] = task.endTime.split(":").map(Number);
    endMins = eh * 60 + em;
  }
  return nowMins >= startMins && nowMins <= endMins;
}

function getReflectionStreak() {
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const iso = d.toISOString().slice(0, 10);
    const r = reflections[iso];
    if (r && (r.notes || r.wentWell || r.improve)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (i === 0) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function getTodayReflection() {
  const today = todayISO();
  if (!reflections[today]) {
    reflections[today] = { mood: 0, wentWell: "", improve: "", notes: "" };
  }
  return reflections[today];
}

function matchesSearch(task, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    task.text.toLowerCase().includes(q) ||
    (task.notes && task.notes.toLowerCase().includes(q)) ||
    CATEGORIES[task.category].toLowerCase().includes(q) ||
    SECTIONS[task.section]?.title.toLowerCase().includes(q)
  );
}

function matchesFilter(task) {
  const today = todayISO();
  switch (prefs.filter) {
    case "today":
      return !task.completed && task.dueDate === today;
    case "overdue":
      return !task.completed && task.dueDate && task.dueDate < today;
    case "active":
      return !task.completed;
    case "completed":
      return task.completed;
    default:
      return true;
  }
}

function sortTasks(list) {
  const copy = [...list];
  switch (prefs.sort) {
    case "priority":
      return copy.sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          b.createdAt - a.createdAt
      );
    case "due":
      return copy.sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return b.createdAt - a.createdAt;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
    case "created":
      return copy.sort((a, b) => b.createdAt - a.createdAt);
    case "alpha":
      return copy.sort((a, b) => a.text.localeCompare(b.text));
    default:
      return copy.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.section === "scheduled" && b.section === "scheduled") {
          if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
        }
        const pa = PRIORITY_ORDER[a.priority];
        const pb = PRIORITY_ORDER[b.priority];
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        return b.createdAt - a.createdAt;
      });
  }
}

function sortSectionTasks(list, section) {
  const sorted = sortTasks(list);
  if (section === "scheduled") {
    return sorted.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
      if (a.startTime) return -1;
      if (b.startTime) return 1;
      return 0;
    });
  }
  return sorted;
}

function getVisibleTasks() {
  const query = els.searchInput.value.trim();
  return sortTasks(
    tasks.filter(
      (t) =>
        matchesFilter(t) &&
        matchesSearch(t, query) &&
        (prefs.category === "all" || t.category === prefs.category)
    )
  );
}

function getDueLabel(task) {
  if (!task.dueDate) return null;
  const today = todayISO();
  if (task.dueDate < today && !task.completed) {
    return { text: `Overdue · ${formatDate(task.dueDate)}`, class: "overdue" };
  }
  if (task.dueDate === today) return { text: "Due today", class: "today" };
  return { text: `Due ${formatDate(task.dueDate)}`, class: "" };
}

function updateProgress() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const active = total - done;
  const top3 = tasks.filter((t) => t.section === "top3");
  const top3Done = top3.filter((t) => t.completed).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  els.activeCount.textContent = `${active} active`;
  els.doneCount.textContent = `${done} done`;
  els.focusCount.textContent = `Top 3: ${top3Done}/${top3.length || 3}`;
  els.progressPercent.textContent = `${percent}%`;

  const offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
  els.progressRing.style.strokeDashoffset = String(offset);
  els.progressRing.style.stroke = percent === 100 ? "var(--success)" : "var(--accent)";
}

function toggleTimeFields(section, startEl, endEl, rowEl) {
  const show = section === "scheduled";
  startEl.hidden = !show;
  endEl.hidden = !show;
  if (rowEl) rowEl.hidden = !show;
}

function toggleResourceField(section) {
  els.editResourceField.hidden = section !== "learning";
}

function canAddToTop3() {
  return countActiveInSection("top3") < SECTIONS.top3.maxActive;
}

async function addTask(data) {
  if (data.section === "top3" && !canAddToTop3()) {
    showToast("Top 3 is full — complete or remove one first");
    return false;
  }

  try {
    const created = await API.createTask({
      text: data.text.trim(),
      section: data.section || "inbox",
      dueDate: data.dueDate || null,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      completed: false,
      priority: data.priority || "medium",
      category: data.category || "personal",
      notes: data.notes || "",
      resourceUrl: data.resourceUrl || "",
    });
    tasks.unshift(normalizeTask(created));
    render();
    showToast("Task added");
    return true;
  } catch (err) {
    showToast(err.message || "Could not add task");
    return false;
  }
}

async function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const next = !task.completed;
  task.completed = next;
  render();

  try {
    await API.updateTask(id, { completed: next });
    showToast(next ? "Task completed ✓" : "Task reopened");
  } catch {
    task.completed = !next;
    render();
    showToast("Could not update task");
  }
}

async function deleteTask(id, silent = false) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return;

  const removed = tasks[index];
  tasks.splice(index, 1);
  render();

  try {
    await API.deleteTask(id);
    if (!silent) {
      undoState = { task: removed, index };
      showToast("Task deleted", "Undo", async () => {
        if (!undoState) return;
        try {
          const restored = await API.createTask(undoState.task);
          tasks.splice(undoState.index, 0, normalizeTask(restored));
          undoState = null;
          render();
          hideToast();
        } catch {
          showToast("Could not restore task");
        }
      });
    }
  } catch {
    tasks.splice(index, 0, removed);
    render();
    showToast("Could not delete task");
  }
}

async function clearCompleted() {
  const removed = tasks.filter((t) => t.completed);
  if (removed.length === 0) return;

  tasks = tasks.filter((t) => !t.completed);
  render();

  try {
    await API.clearCompleted();
    showToast(`Cleared ${removed.length} completed`);
  } catch {
    tasks = [...tasks, ...removed];
    render();
    showToast("Could not clear completed tasks");
  }
}

function openEditModal(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  editingId = id;
  els.editText.value = task.text;
  els.editSection.value = task.section;
  els.editDueDate.value = task.dueDate || "";
  els.editStartTime.value = task.startTime || "";
  els.editEndTime.value = task.endTime || "";
  els.editPriority.value = task.priority;
  els.editCategory.value = task.category;
  els.editResource.value = task.resourceUrl || "";
  els.editNotes.value = task.notes || "";
  toggleTimeFields(task.section, els.editStartTime, els.editEndTime, els.editTimeRow);
  toggleResourceField(task.section);
  els.editModal.showModal();
  els.editText.focus();
}

function closeEditModal() {
  editingId = null;
  els.editModal.close();
}

async function saveEdit() {
  const task = tasks.find((t) => t.id === editingId);
  if (!task) return;

  const newSection = els.editSection.value;
  if (newSection === "top3" && task.section !== "top3" && !canAddToTop3()) {
    showToast("Top 3 is full — move or complete one first");
    return;
  }

  const updated = {
    text: els.editText.value.trim(),
    section: newSection,
    dueDate: els.editDueDate.value || null,
    startTime: newSection === "scheduled" ? els.editStartTime.value || null : null,
    endTime: newSection === "scheduled" ? els.editEndTime.value || null : null,
    priority: els.editPriority.value,
    category: els.editCategory.value,
    resourceUrl: newSection === "learning" ? els.editResource.value.trim() : "",
    notes: els.editNotes.value.trim(),
  };

  try {
    const saved = await API.updateTask(editingId, updated);
    Object.assign(task, normalizeTask(saved));
    closeEditModal();
    render();
    showToast("Task updated");
  } catch (err) {
    showToast(err.message || "Could not update task");
  }
}

function showToast(message, actionLabel = null, actionFn = null) {
  clearTimeout(toastTimer);
  els.toastMessage.textContent = message;

  if (actionLabel && actionFn) {
    els.toastAction.textContent = actionLabel;
    els.toastAction.hidden = false;
    els.toastAction.onclick = actionFn;
  } else {
    els.toastAction.hidden = true;
    els.toastAction.onclick = null;
  }

  els.toast.hidden = false;
  requestAnimationFrame(() => els.toast.classList.add("visible"));
  toastTimer = setTimeout(hideToast, actionLabel ? 5000 : 2500);
}

function hideToast() {
  els.toast.classList.remove("visible");
  setTimeout(() => { els.toast.hidden = true; }, 250);
}

function setView(view) {
  prefs.view = view;
  scheduleSavePrefs();
  els.viewTabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  els.dashboardView.hidden = view !== "dashboard";
  els.allTasksView.hidden = view !== "all";
  render();
}

function renderSectionTask(task, index, section) {
  const li = document.createElement("li");
  li.className = "section-task";
  if (task.completed) li.classList.add("completed");
  if (section === "top3") li.classList.add("top3-item");
  if (isTaskNow(task)) li.classList.add("now");

  if (section === "top3") {
    const rank = document.createElement("span");
    rank.className = "section-task-rank";
    rank.textContent = String(index + 1);
    li.appendChild(rank);
  }

  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "section-task-check";
  check.checked = task.completed;
  check.addEventListener("change", () => toggleTask(task.id));
  li.appendChild(check);

  const body = document.createElement("div");
  body.className = "section-task-body";
  body.addEventListener("click", () => openEditModal(task.id));

  const text = document.createElement("p");
  text.className = "section-task-text";
  text.textContent = task.text;
  body.appendChild(text);

  const meta = document.createElement("div");
  meta.className = "section-task-meta";

  if (task.startTime) {
    const timeTag = document.createElement("span");
    timeTag.className = `mini-tag${isTaskNow(task) ? " time-now" : ""}`;
    const end = task.endTime ? ` – ${formatTime(task.endTime)}` : "";
    timeTag.textContent = isTaskNow(task)
      ? `Now · ${formatTime(task.startTime)}${end}`
      : `${formatTime(task.startTime)}${end}`;
    meta.appendChild(timeTag);
  }

  if (task.resourceUrl) {
    const link = document.createElement("a");
    link.className = "mini-tag link-tag";
    link.href = task.resourceUrl;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Resource ↗";
    link.addEventListener("click", (e) => e.stopPropagation());
    meta.appendChild(link);
  }

  const due = getDueLabel(task);
  if (due) {
    const dueTag = document.createElement("span");
    dueTag.className = "mini-tag";
    dueTag.textContent = due.text;
    meta.appendChild(dueTag);
  }

  if (meta.children.length) body.appendChild(meta);
  li.appendChild(body);
  return li;
}

function renderSectionCard(key, config) {
  const card = document.createElement("article");
  card.className = `section-card card${config.spanFull ? " span-full" : ""}`;
  card.dataset.section = key;

  const sectionTasks = sortSectionTasks(
    tasks.filter((t) => t.section === key),
    key
  );
  const activeCount = sectionTasks.filter((t) => !t.completed).length;

  card.innerHTML = `
    <header class="section-head">
      <div class="section-head-left">
        <span class="section-icon" aria-hidden="true">${config.icon}</span>
        <div>
          <h3 class="section-title">${config.title}</h3>
          <p class="section-desc">${config.desc}</p>
        </div>
      </div>
      <span class="section-count">${activeCount} active</span>
    </header>
    <p class="section-example">${config.example}</p>
  `;

  const quickAdd = document.createElement("div");
  quickAdd.className = "section-quick-add";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = `Add to ${config.title.toLowerCase()}…`;
  input.maxLength = 200;

  let startInput = null;
  let endInput = null;

  if (config.hasTime) {
    const timeWrap = document.createElement("div");
    timeWrap.className = "time-inputs";
    startInput = document.createElement("input");
    startInput.type = "time";
    startInput.title = "Start";
    endInput = document.createElement("input");
    endInput.type = "time";
    endInput.title = "End";
    timeWrap.appendChild(startInput);
    timeWrap.appendChild(endInput);
    quickAdd.appendChild(input);
    quickAdd.appendChild(timeWrap);
  } else {
    quickAdd.appendChild(input);
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "+";
  addBtn.title = "Add task";

  const submitQuick = () => {
    const text = input.value.trim();
    if (!text) return;
    addTask({
      text,
      section: key,
      startTime: startInput?.value || null,
      endTime: endInput?.value || null,
      priority: key === "top3" ? "high" : key === "quickwin" ? "low" : "medium",
      category: key === "learning" ? "personal" : key === "scheduled" ? "work" : "personal",
    });
    input.value = "";
    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
  };

  addBtn.addEventListener("click", submitQuick);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitQuick();
  });

  quickAdd.appendChild(addBtn);
  card.appendChild(quickAdd);

  const list = document.createElement("ul");
  list.className = "section-tasks";

  if (sectionTasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "section-empty";
    empty.textContent = key === "top3"
      ? "Pick up to 3 things that would make today successful."
      : "Nothing here yet — add one above.";
    card.appendChild(empty);
  } else {
    sectionTasks.forEach((task, i) => {
      list.appendChild(renderSectionTask(task, i, key));
    });
    card.appendChild(list);
  }

  return card;
}

function renderDashboard() {
  els.sectionsGrid.innerHTML = "";
  Object.entries(SECTIONS).forEach(([key, config]) => {
    els.sectionsGrid.appendChild(renderSectionCard(key, config));
  });
}

function renderMoodPicker() {
  const today = getTodayReflection();
  els.moodPicker.innerHTML = "";
  MOODS.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `mood-btn${today.mood === m.value ? " active" : ""}`;
    btn.textContent = m.emoji;
    btn.title = m.label;
    btn.addEventListener("click", () => {
      today.mood = m.value;
      saveReflections();
      renderMoodPicker();
      flashReflectSaved();
    });
    els.moodPicker.appendChild(btn);
  });
}

function renderReflection() {
  const today = getTodayReflection();
  els.reflectWentWell.value = today.wentWell || "";
  els.reflectImprove.value = today.improve || "";
  els.reflectNotes.value = today.notes || "";

  const streak = getReflectionStreak();
  els.reflectionStreak.textContent = streak > 0 ? `🔥 ${streak}-day streak` : "";

  renderMoodPicker();
  renderPastReflections();
}

function renderPastReflections() {
  els.pastReflections.innerHTML = "";
  const dates = Object.keys(reflections)
    .filter((d) => d !== todayISO())
    .filter((d) => {
      const r = reflections[d];
      return r.notes || r.wentWell || r.improve;
    })
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 14);

  if (dates.length === 0) {
    els.pastReflections.innerHTML = '<li class="past-item"><span class="past-preview">No past reflections yet.</span></li>';
    return;
  }

  dates.forEach((date) => {
    const r = reflections[date];
    const li = document.createElement("li");
    li.className = "past-item";
    const mood = MOODS.find((m) => m.value === r.mood);
    const preview = r.wentWell || r.notes || r.improve || "—";
    li.innerHTML = `
      <p class="past-date">${formatDate(date)} ${mood ? mood.emoji : ""}</p>
      <p class="past-preview">${preview}</p>
    `;
    els.pastReflections.appendChild(li);
  });
}

function flashReflectSaved() {
  els.reflectSaveHint.textContent = "Saved ✓";
  els.reflectSaveHint.classList.add("saved");
  clearTimeout(reflectSaveTimer);
  reflectSaveTimer = setTimeout(() => {
    els.reflectSaveHint.textContent = "Auto-saves as you type";
    els.reflectSaveHint.classList.remove("saved");
  }, 1500);
}

function saveReflectionField() {
  const today = getTodayReflection();
  today.wentWell = els.reflectWentWell.value.trim();
  today.improve = els.reflectImprove.value.trim();
  today.notes = els.reflectNotes.value.trim();
  saveReflections();
  flashReflectSaved();
  renderPastReflections();
  const streak = getReflectionStreak();
  els.reflectionStreak.textContent = streak > 0 ? `🔥 ${streak}-day streak` : "";
}

function renderTaskItem(task) {
  const li = document.createElement("li");
  li.className = `task-item priority-${task.priority}`;
  if (task.completed) li.classList.add("completed");
  if (task.dueDate && !task.completed && task.dueDate < todayISO()) {
    li.classList.add("overdue");
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task-check";
  checkbox.checked = task.completed;
  checkbox.addEventListener("change", () => toggleTask(task.id));

  const body = document.createElement("div");
  body.className = "task-body";
  body.addEventListener("click", () => openEditModal(task.id));

  const text = document.createElement("p");
  text.className = "task-text";
  text.textContent = task.text;
  body.appendChild(text);

  if (task.notes) {
    const notes = document.createElement("p");
    notes.className = "task-notes-preview";
    notes.textContent = task.notes;
    body.appendChild(notes);
  }

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const secTag = document.createElement("span");
  secTag.className = "tag tag-section";
  secTag.textContent = SECTIONS[task.section]?.title || task.section;
  meta.appendChild(secTag);

  const priorityTag = document.createElement("span");
  priorityTag.className = `tag tag-priority-${task.priority}`;
  priorityTag.textContent = task.priority;
  meta.appendChild(priorityTag);

  if (task.startTime) {
    const timeTag = document.createElement("span");
    timeTag.className = "tag tag-time";
    const end = task.endTime ? `–${formatTime(task.endTime)}` : "";
    timeTag.textContent = `${formatTime(task.startTime)}${end}`;
    meta.appendChild(timeTag);
  }

  const due = getDueLabel(task);
  if (due) {
    const dueTag = document.createElement("span");
    dueTag.className = `tag tag-due ${due.class}`.trim();
    dueTag.textContent = due.text;
    meta.appendChild(dueTag);
  }

  body.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "task-action-btn";
  editBtn.textContent = "✎";
  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openEditModal(task.id);
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "task-action-btn delete";
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  li.appendChild(checkbox);
  li.appendChild(body);
  li.appendChild(actions);
  return li;
}

function renderCategoryBar() {
  els.categoryBar.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `cat-pill${prefs.category === "all" ? " active" : ""}`;
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    prefs.category = "all";
    scheduleSavePrefs();
    render();
  });
  els.categoryBar.appendChild(allBtn);

  Object.entries(CATEGORIES).forEach(([key, label]) => {
    const count = tasks.filter((t) => t.category === key && !t.completed).length;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cat-pill${prefs.category === key ? " active" : ""}`;
    btn.textContent = count > 0 ? `${label} (${count})` : label;
    btn.addEventListener("click", () => {
      prefs.category = prefs.category === key ? "all" : key;
      scheduleSavePrefs();
      render();
    });
    els.categoryBar.appendChild(btn);
  });
}

function renderAllTasks() {
  const visible = getVisibleTasks();
  const doneCount = tasks.filter((t) => t.completed).length;

  renderCategoryBar();
  els.taskList.innerHTML = "";
  visible.forEach((task) => els.taskList.appendChild(renderTaskItem(task)));

  const hasVisible = visible.length > 0;
  els.emptyState.classList.toggle("hidden", hasVisible);
  els.footer.hidden = doneCount === 0;

  els.filterButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === prefs.filter);
  });
  els.sortSelect.value = prefs.sort;
}

function render() {
  updateProgress();

  const today = todayISO();
  els.dailyIntention.value = intentions[today] || "";

  if (prefs.view === "dashboard") {
    renderDashboard();
    renderReflection();
  } else {
    renderAllTasks();
  }
}

function exportBackup() {
  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),
    tasks,
    prefs,
    reflections,
    intentions,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-todo-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  closeDropdown();
  showToast("Backup exported");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.tasks)) {
        showToast("Invalid backup file");
        return;
      }
      await API.importData({
        tasks: data.tasks.map(normalizeTask),
        reflections: data.reflections || {},
        intentions: data.intentions || {},
        prefs: data.prefs || null,
      });
      await loadUserData();
      applyTheme(prefs.theme);
      render();
      showToast(`Imported ${tasks.length} tasks`);
    } catch {
      showToast("Could not import backup");
    }
  };
  reader.readAsText(file);
}

function closeDropdown() {
  els.dropdown.hidden = true;
  els.menuBtn.setAttribute("aria-expanded", "false");
}

function isTypingTarget(el) {
  return el.matches("input, textarea, select, [contenteditable]");
}

els.authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthTab(tab.dataset.authTab));
});

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");
  setAuthLoading("login", true);
  try {
    const result = await API.login(els.loginEmail.value, els.loginPassword.value);
    await handleAuthSuccess(result);
  } catch (err) {
    showAuthError(err.message || "Sign in failed");
  } finally {
    setAuthLoading("login", false);
  }
});

els.registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showAuthError("");
  setAuthLoading("register", true);
  try {
    const result = await API.register(
      els.registerName.value,
      els.registerEmail.value,
      els.registerPassword.value
    );
    await handleAuthSuccess(result);
  } catch (err) {
    showAuthError(err.message || "Registration failed");
  } finally {
    setAuthLoading("register", false);
  }
});

document.querySelectorAll(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => togglePasswordVisibility(btn));
});

if (els.authThemeToggle) {
  els.authThemeToggle.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });
}

els.logoutBtn.addEventListener("click", logout);

els.viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

els.dailyIntention.addEventListener("input", () => {
  const date = todayISO();
  const text = els.dailyIntention.value.trim();
  intentions[date] = text;
  clearTimeout(intentionSaveTimer);
  intentionSaveTimer = setTimeout(() => persistIntention(date, text), 500);
});

["reflectWentWell", "reflectImprove", "reflectNotes"].forEach((id) => {
  els[id].addEventListener("input", () => {
    clearTimeout(reflectSaveTimer);
    reflectSaveTimer = setTimeout(saveReflectionField, 400);
  });
});

els.sectionInput.addEventListener("change", () => {
  toggleTimeFields(
    els.sectionInput.value,
    els.startTimeInput,
    els.endTimeInput
  );
});

els.editSection.addEventListener("change", () => {
  toggleTimeFields(
    els.editSection.value,
    els.editStartTime,
    els.editEndTime,
    els.editTimeRow
  );
  toggleResourceField(els.editSection.value);
});

els.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = els.taskInput.value.trim();
  if (!text) return;

  const ok = await addTask({
    text,
    section: els.sectionInput.value,
    dueDate: els.dueDateInput.value || null,
    startTime: els.startTimeInput.value || null,
    endTime: els.endTimeInput.value || null,
    priority: els.priorityInput.value,
    category: els.categoryInput.value,
  });

  if (ok) {
    els.taskInput.value = "";
    els.dueDateInput.value = "";
    els.startTimeInput.value = "";
    els.endTimeInput.value = "";
    els.sectionInput.value = "inbox";
    toggleTimeFields("inbox", els.startTimeInput, els.endTimeInput);
    els.taskInput.focus();
  }
});

els.clearCompletedBtn.addEventListener("click", clearCompleted);

els.filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    prefs.filter = btn.dataset.filter;
    scheduleSavePrefs();
    render();
  });
});

els.sortSelect.addEventListener("change", () => {
  prefs.sort = els.sortSelect.value;
  scheduleSavePrefs();
  render();
});

els.searchInput.addEventListener("input", render);
els.themeToggle.addEventListener("click", () => applyTheme(prefs.theme === "dark" ? "light" : "dark"));

els.menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = els.dropdown.hidden;
  els.dropdown.hidden = !open;
  els.menuBtn.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-wrap")) closeDropdown();
});

els.exportBtn.addEventListener("click", exportBackup);
els.importBtn.addEventListener("click", () => {
  els.importFile.click();
  closeDropdown();
});
els.importFile.addEventListener("change", () => {
  const file = els.importFile.files[0];
  if (file) importBackup(file);
  els.importFile.value = "";
});

els.editForm.addEventListener("submit", (e) => {
  e.preventDefault();
  saveEdit();
});
els.editClose.addEventListener("click", closeEditModal);
els.editDelete.addEventListener("click", () => {
  if (editingId) {
    deleteTask(editingId);
    closeEditModal();
  }
});
els.editModal.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && els.editModal.open) {
    closeEditModal();
    return;
  }
  if (isTypingTarget(e.target)) return;
  if (e.key === "/") {
    e.preventDefault();
    setView("all");
    els.searchInput.focus();
  }
  if (e.key === "n") {
    e.preventDefault();
    setView("all");
    els.taskInput.focus();
  }
  if (e.key === "d" || e.key === "D") setView("dashboard");
  if (e.key === "t" || e.key === "T") applyTheme(prefs.theme === "dark" ? "light" : "dark");
});

async function initApp() {
  applyTheme(localStorage.getItem(GUEST_THEME_KEY) || "dark");
  setAuthTab("login");

  if (!API.getToken()) {
    showAuth();
    return;
  }

  try {
    await loadUserData();
    showApp();
    applyTheme(prefs.theme);
    updateHeader();
    setView(prefs.view || "dashboard");
  } catch {
    API.clearSession();
    showAuth();
  }
}

initApp();

setInterval(() => {
  if (els.appRoot.hidden) return;
  updateHeader();
  if (prefs.view === "dashboard") renderDashboard();
}, 60000);
