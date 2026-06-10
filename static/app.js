var allAssignments = [];
var allAssignmentsRaw = [];
var customEvents = [];
var activeFilter = "upcoming";
var activeCourse = null;
var canvasUrl = "";
var canvasToken = "";
var moodleUsername = "";
var moodlePassword = "";
var lmsType = "canvas";
var hiddenCourses = [];
var customCourseNames = [];
var termStart = "";
var termEnd = "";

// LOGIN
function updateLmsAuthUI(lms) {
  var isMoodle = lms === "moodle";
  document.getElementById("canvas-auth").style.display = isMoodle ? "none" : "block";
  document.getElementById("moodle-auth").style.display = isMoodle ? "block" : "none";
}

document.getElementById("school-select").addEventListener("change", function(e) {
  var isCustom = e.target.value === "custom";
  document.getElementById("custom-url-row").style.display = isCustom ? "block" : "none";

  var lms = isCustom
    ? document.getElementById("custom-lms-type").value
    : e.target.options[e.target.selectedIndex].dataset.lms;
  updateLmsAuthUI(lms);
});

document.getElementById("custom-lms-type").addEventListener("change", function(e) {
  updateLmsAuthUI(e.target.value);
});

document.getElementById("login-btn").addEventListener("click", function() {
  var select = document.getElementById("school-select");
  var url;
  var lms;

  if (select.value === "custom") {
    url = document.getElementById("custom-url").value.trim().replace(/\/$/, "");
    lms = document.getElementById("custom-lms-type").value;
  } else {
    url = select.value;
    lms = select.options[select.selectedIndex].dataset.lms;
  }

  if (!url) {
    document.getElementById("login-error").textContent = "please pick a school or enter a URL.";
    return;
  }

  if (lms === "moodle") {
    var username = document.getElementById("moodle-username").value.trim();
    var password = document.getElementById("moodle-password").value;

    if (!username || !password) {
      document.getElementById("login-error").textContent = "please fill in both fields.";
      return;
    }

    lmsType = "moodle";
    canvasUrl = url;
    moodleUsername = username;
    moodlePassword = password;

    document.getElementById("login-error").textContent = "";
    document.getElementById("login-btn").disabled = true;
    document.getElementById("login-btn").textContent = "loading...";

    loadCustomEvents();
    loadCustomCourses();
    fetchMoodleAssignments();
  } else {
    var token = document.getElementById("token-input").value.trim();

    if (!token) {
      document.getElementById("login-error").textContent = "please fill in both fields.";
      return;
    }

    lmsType = "canvas";
    canvasUrl = url;
    canvasToken = token;

    document.getElementById("login-error").textContent = "";
    document.getElementById("login-btn").disabled = true;
    document.getElementById("login-btn").textContent = "loading...";

    loadCustomEvents();
    loadCustomCourses();
    fetchAssignments();
  }
});

// CUSTOM COURSES
function loadCustomCourses() {
  try {
    var stored = localStorage.getItem("gyst_custom_courses");
    if (stored) customCourseNames = JSON.parse(stored);
  } catch(e) { customCourseNames = []; }
}

function saveCustomCourses() {
  localStorage.setItem("gyst_custom_courses", JSON.stringify(customCourseNames));
}

// COURSE DROPDOWN (add modal)
function buildCourseDropdown() {
  var courses = [];
  var merged = getMerged();

  for (var i = 0; i < merged.length; i++) {
    if (courses.indexOf(merged[i].course) === -1) {
      courses.push(merged[i].course);
    }
  }

  for (var i = 0; i < customCourseNames.length; i++) {
    if (courses.indexOf(customCourseNames[i]) === -1) {
      courses.push(customCourseNames[i]);
    }
  }

  courses.sort();

  var container = document.getElementById("course-options");
  var html = '';
  for (var i = 0; i < courses.length; i++) {
    html += '<div class="custom-select-option" data-value="' + courses[i] + '">' + courses[i] + '</div>';
  }
  html += '<div class="custom-select-option add-new" data-value="__custom__">+ add new course</div>';
  container.innerHTML = html;

  document.getElementById("course-trigger").textContent = "-- select course --";
  document.getElementById("course-trigger").classList.remove("has-value");
  document.getElementById("add-course-value").value = "";
  document.getElementById("custom-course-row").style.display = "none";

  var opts = container.querySelectorAll(".custom-select-option");
  for (var i = 0; i < opts.length; i++) {
    opts[i].addEventListener("click", function() {
      var val = this.dataset.value;
      if (val === "__custom__") {
        document.getElementById("course-trigger").textContent = "new course";
        document.getElementById("custom-course-row").style.display = "block";
        document.getElementById("add-course-value").value = "__custom__";
      } else {
        document.getElementById("course-trigger").textContent = val;
        document.getElementById("custom-course-row").style.display = "none";
        document.getElementById("add-course-value").value = val;
      }
      document.getElementById("course-trigger").classList.add("has-value");
      container.classList.remove("open");
    });
  }
}

document.getElementById("course-trigger").addEventListener("click", function(e) {
  e.stopPropagation();
  document.getElementById("course-options").classList.toggle("open");
});

document.addEventListener("click", function(e) {
  var opts = document.getElementById("course-options");
  if (opts) opts.classList.remove("open");
});

// FETCH
function fetchAssignments() {
  fetch("/api/assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: canvasToken, canvas_url: canvasUrl })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.error) {
      document.getElementById("login-error").textContent = data.error;
      document.getElementById("login-btn").disabled = false;
      document.getElementById("login-btn").textContent = "load my assignments";
      return;
    }

    allAssignmentsRaw = data.assignments;
    localStorage.setItem("gyst_lms", "canvas");
    localStorage.setItem("gyst_token", canvasToken);
    localStorage.setItem("gyst_url", canvasUrl);
    applyFilters();
    showApp();
  })
  .catch(function(err) {
    document.getElementById("login-error").textContent = "error connecting. try again.";
    document.getElementById("login-btn").disabled = false;
    document.getElementById("login-btn").textContent = "load my assignments";
  });
}

function fetchMoodleAssignments() {
  fetch("/api/moodle-assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: moodleUsername, password: moodlePassword, moodle_url: canvasUrl })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.error) {
      document.getElementById("login-error").textContent = data.error;
      document.getElementById("login-btn").disabled = false;
      document.getElementById("login-btn").textContent = "load my assignments";
      return;
    }

    allAssignmentsRaw = data.assignments;
    localStorage.setItem("gyst_lms", "moodle");
    localStorage.setItem("gyst_url", canvasUrl);
    localStorage.setItem("gyst_moodle_username", moodleUsername);
    localStorage.setItem("gyst_moodle_password", moodlePassword);
    applyFilters();
    showApp();
  })
  .catch(function(err) {
    document.getElementById("login-error").textContent = "error connecting. try again.";
    document.getElementById("login-btn").disabled = false;
    document.getElementById("login-btn").textContent = "load my assignments";
  });
}

function showApp() {
  document.getElementById("login-view").style.display = "none";
  document.getElementById("app-view").style.display = "block";
}

// SIDEBAR FILTERS
var filterBtns = document.querySelectorAll(".sidebar-btn");
for (var i = 0; i < filterBtns.length; i++) {
  filterBtns[i].addEventListener("click", function() {
    for (var j = 0; j < filterBtns.length; j++) {
      filterBtns[j].classList.remove("active");
    }
    this.classList.add("active");
    activeFilter = this.dataset.filter;
    renderAssignments();
  });
}

function buildCourseFilters() {
  var courses = [];
  var merged = getMerged();
  for (var i = 0; i < merged.length; i++) {
    if (courses.indexOf(merged[i].course) === -1) {
      courses.push(merged[i].course);
    }
  }
  courses.sort();

  var container = document.getElementById("course-filters");
  var html = '<button class="course-btn active" data-course="all">all courses</button>';
  for (var i = 0; i < courses.length; i++) {
    html += '<button class="course-btn" data-course="' + courses[i] + '">' + courses[i] + '</button>';
  }
  container.innerHTML = html;

  var btns = container.querySelectorAll(".course-btn");
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", function() {
      var allBtns = container.querySelectorAll(".course-btn");
      for (var j = 0; j < allBtns.length; j++) {
        allBtns[j].classList.remove("active");
      }
      this.classList.add("active");
      activeCourse = this.dataset.course === "all" ? null : this.dataset.course;
      renderAssignments();
    });
  }
}

// DATA
function getMerged() {
  var merged = allAssignments.concat(customEvents.map(function(e) {
    return {
      title: e.title,
      due: e.due,
      course: e.course,
      url: e.url || null,
      source: "custom",
      id: e.id
    };
  }));
  merged.sort(function(a, b) { return new Date(a.due) - new Date(b.due); });
  return merged;
}

function getFiltered() {
  var now = new Date();
  var merged = getMerged();
  var filtered;

  if (activeFilter === "upcoming") {
    filtered = merged.filter(function(a) { return new Date(a.due) >= now; });
  } else if (activeFilter === "overdue") {
    filtered = merged.filter(function(a) { return new Date(a.due) < now; });
  } else {
    filtered = merged;
  }

  if (activeCourse) {
    filtered = filtered.filter(function(a) { return a.course === activeCourse; });
  }

  return filtered;
}

function updateStats() {
  var now = new Date();
  var merged = getMerged();
  document.getElementById("stat-upcoming").textContent = merged.filter(function(a) { return new Date(a.due) >= now; }).length;
  document.getElementById("stat-overdue").textContent = merged.filter(function(a) { return new Date(a.due) < now; }).length;
}

// RENDER
function renderAssignments() {
  var container = document.getElementById("assignments-list");
  var assignments = getFiltered();
  var now = new Date();

  if (assignments.length === 0) {
    container.innerHTML = '<div class="empty-state">nothing here</div>';
    return;
  }

  var html = "";
  for (var i = 0; i < assignments.length; i++) {
    var a = assignments[i];
    var due = new Date(a.due);
    var diff = (due - now) / (1000 * 60 * 60 * 24);
    var cls = "";
    var badgeCls = "badge-ok";
    var badgeText = "";

    if (diff < 0) {
      cls = "overdue";
      badgeCls = "badge-overdue";
      badgeText = Math.abs(Math.ceil(diff)) + "d overdue";
    } else if (diff < 1) {
      cls = "soon";
      badgeCls = "badge-soon";
      badgeText = "due today";
    } else if (diff < 2) {
      cls = "soon";
      badgeCls = "badge-soon";
      badgeText = "due tomorrow";
    } else {
      badgeText = Math.floor(diff) + "d left";
    }

    if (a.source === "custom") {
      cls += " custom-card";
      badgeCls = "badge-custom";
    }

    var dateStr = due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    var timeStr = due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    var deleteBtn = a.source === "custom" ? '<button class="card-delete" data-id="' + a.id + '">&times;</button>' : '';

    html += '<div class="assignment-card ' + cls + '"' + (a.url ? ' data-url="' + a.url + '"' : '') + '>';
    html += deleteBtn;
    html += '<div class="card-top">';
    html += '<div><div class="card-title">' + a.title + '</div>';
    html += '<div class="card-course">' + a.course + '</div></div>';
    html += '<span class="card-badge ' + badgeCls + '">' + badgeText + '</span>';
    html += '</div>';
    html += '<div class="card-due">' + dateStr + ', ' + timeStr + '</div>';
    html += '</div>';
  }

  container.innerHTML = html;

  var cards = container.querySelectorAll(".assignment-card[data-url]");
  for (var i = 0; i < cards.length; i++) {
    cards[i].addEventListener("click", function(e) {
      if (e.target.classList.contains("card-delete")) return;
      window.open(this.dataset.url, "_blank");
    });
  }

  var delBtns = container.querySelectorAll(".card-delete");
  for (var i = 0; i < delBtns.length; i++) {
    delBtns[i].addEventListener("click", function(e) {
      e.stopPropagation();
      var id = this.dataset.id;
      customEvents = customEvents.filter(function(ev) { return ev.id !== id; });
      saveCustomEvents();
      updateStats();
      renderAssignments();
    });
  }
}

// CUSTOM EVENTS
function loadCustomEvents() {
  try {
    var stored = localStorage.getItem("gyst_custom_events");
    if (stored) customEvents = JSON.parse(stored);
  } catch(e) { customEvents = []; }
}

function saveCustomEvents() {
  localStorage.setItem("gyst_custom_events", JSON.stringify(customEvents));
}

// ADD MODAL
document.getElementById("add-btn").addEventListener("click", function() {
  buildCourseDropdown();
  document.getElementById("add-modal").style.display = "flex";
});

document.getElementById("add-close").addEventListener("click", function() {
  document.getElementById("add-modal").style.display = "none";
});

document.getElementById("add-modal").addEventListener("click", function(e) {
  if (e.target === this) this.style.display = "none";
});

document.getElementById("add-save").addEventListener("click", function() {
  var title = document.getElementById("add-title").value.trim();
  var courseSelect = document.getElementById("add-course-value").value;
  var course = "";
  var due = document.getElementById("add-due").value;
  var notes = document.getElementById("add-notes").value.trim();

  if (courseSelect === "__custom__") {
    course = document.getElementById("add-course-custom").value.trim();
    var savePermanent = document.getElementById("add-course-save").checked;
    if (course && savePermanent && customCourseNames.indexOf(course) === -1) {
      customCourseNames.push(course);
      saveCustomCourses();
    }
  } else {
    course = courseSelect;
  }

  if (!title || !due) return;

  customEvents.push({
    id: "custom_" + Date.now(),
    title: title,
    course: course || "uncategorized",
    due: new Date(due).toISOString(),
    notes: notes,
    source: "custom"
  });

  saveCustomEvents();
  buildCourseFilters();
  updateStats();
  renderAssignments();

  document.getElementById("add-title").value = "";
  document.getElementById("add-course-value").value = "";
  document.getElementById("add-course-custom").value = "";
  document.getElementById("course-trigger").textContent = "-- select course --";
  document.getElementById("course-trigger").classList.remove("has-value");
  document.getElementById("custom-course-row").style.display = "none";
  document.getElementById("add-due").value = "";
  document.getElementById("add-notes").value = "";
  document.getElementById("add-modal").style.display = "none";
});

// LOGOUT
document.getElementById("logout-btn").addEventListener("click", function() {
  localStorage.removeItem("gyst_lms");
  localStorage.removeItem("gyst_token");
  localStorage.removeItem("gyst_url");
  localStorage.removeItem("gyst_moodle_username");
  localStorage.removeItem("gyst_moodle_password");
  allAssignments = [];
  allAssignmentsRaw = [];
  customEvents = [];
  document.getElementById("app-view").style.display = "none";
  document.getElementById("login-view").style.display = "flex";
  document.getElementById("login-btn").disabled = false;
  document.getElementById("login-btn").textContent = "load my assignments";
});

// SWITCH ACCOUNT (resets Canvas/Moodle connection, keeps custom events)
document.getElementById("switch-account-btn").addEventListener("click", function() {
  if (!confirm("switch account? you'll be signed out and need to reconnect Canvas or Moodle. your custom events and added assignments will stay.")) return;

  localStorage.removeItem("gyst_lms");
  localStorage.removeItem("gyst_token");
  localStorage.removeItem("gyst_url");
  localStorage.removeItem("gyst_moodle_username");
  localStorage.removeItem("gyst_moodle_password");

  canvasToken = "";
  canvasUrl = "";
  moodleUsername = "";
  moodlePassword = "";
  lmsType = "canvas";
  allAssignments = [];
  allAssignmentsRaw = [];

  document.getElementById("settings-modal").style.display = "none";
  document.getElementById("app-view").style.display = "none";
  document.getElementById("login-view").style.display = "flex";
  document.getElementById("login-btn").disabled = false;
  document.getElementById("login-btn").textContent = "load my assignments";
  document.getElementById("token-input").value = "";
  document.getElementById("moodle-username").value = "";
  document.getElementById("moodle-password").value = "";
  document.getElementById("custom-url").value = "";
  document.getElementById("custom-lms-type").value = "canvas";
  document.getElementById("school-select").value = "";
  document.getElementById("custom-url-row").style.display = "none";
  updateLmsAuthUI("canvas");
  document.getElementById("login-error").textContent = "";
});

// SETTINGS
function loadSettings() {
  try {
    var h = localStorage.getItem("gyst_hidden_courses");
    if (h) hiddenCourses = JSON.parse(h);
    termStart = localStorage.getItem("gyst_term_start") || "";
    termEnd = localStorage.getItem("gyst_term_end") || "";
  } catch(e) {}
}

function saveSettingsData() {
  localStorage.setItem("gyst_hidden_courses", JSON.stringify(hiddenCourses));
  localStorage.setItem("gyst_term_start", termStart);
  localStorage.setItem("gyst_term_end", termEnd);
}

function applyFilters() {
  var base = allAssignmentsRaw.slice();

  if (termStart && termEnd) {
    var s = new Date(termStart);
    var e = new Date(termEnd);
    base = base.filter(function(a) {
      var d = new Date(a.due);
      return d >= s && d <= e;
    });
  }

  base = base.filter(function(a) {
    return hiddenCourses.indexOf(a.course) === -1;
  });

  allAssignments = base;
  buildCourseFilters();
  updateStats();
  renderAssignments();
}

document.getElementById("app-settings-btn").addEventListener("click", function() {
  document.getElementById("settings-modal").style.display = "flex";
  buildCourseToggles();
  document.getElementById("settings-term-start").value = termStart;
  document.getElementById("settings-term-end").value = termEnd;

  var currentTheme = localStorage.getItem("gyst_theme") || "";
  var allSwatches = document.querySelectorAll(".theme-swatch");
  for (var i = 0; i < allSwatches.length; i++) {
    allSwatches[i].classList.remove("active");
    if (allSwatches[i].dataset.theme === currentTheme) {
      allSwatches[i].classList.add("active");
    }
  }
});

document.getElementById("settings-close").addEventListener("click", function() {
  document.getElementById("settings-modal").style.display = "none";
});

document.getElementById("settings-modal").addEventListener("click", function(e) {
  if (e.target === this) this.style.display = "none";
});

function buildCourseToggles() {
  var courses = [];
  var counts = {};
  var all = allAssignmentsRaw;

  for (var i = 0; i < all.length; i++) {
    var c = all[i].course;
    if (courses.indexOf(c) === -1) courses.push(c);
    counts[c] = (counts[c] || 0) + 1;
  }
  courses.sort();

  var container = document.getElementById("course-toggles");
  var html = "";
  for (var i = 0; i < courses.length; i++) {
    var checked = hiddenCourses.indexOf(courses[i]) === -1 ? "checked" : "";
    html += '<div class="course-toggle">';
    html += '<input type="checkbox" ' + checked + ' data-course="' + courses[i] + '" />';
    html += '<span class="course-toggle-name">' + courses[i] + '</span>';
    html += '<span class="course-toggle-count">' + counts[courses[i]] + '</span>';
    html += '</div>';
  }
  container.innerHTML = html;
}

document.getElementById("settings-save").addEventListener("click", function() {
  hiddenCourses = [];
  var checkboxes = document.querySelectorAll("#course-toggles input[type='checkbox']");
  for (var i = 0; i < checkboxes.length; i++) {
    if (!checkboxes[i].checked) {
      hiddenCourses.push(checkboxes[i].dataset.course);
    }
  }

  termStart = document.getElementById("settings-term-start").value;
  termEnd = document.getElementById("settings-term-end").value;

  saveSettingsData();
  document.getElementById("settings-modal").style.display = "none";
  applyFilters();
});

// THEME
var allSwatchBtns = document.querySelectorAll(".theme-swatch");
for (var i = 0; i < allSwatchBtns.length; i++) {
  allSwatchBtns[i].addEventListener("click", function() {
    var theme = this.dataset.theme;
    document.body.className = theme;
    localStorage.setItem("gyst_theme", theme);

    var all = document.querySelectorAll(".theme-swatch");
    for (var j = 0; j < all.length; j++) {
      all[j].classList.remove("active");
    }
    this.classList.add("active");
  });
}

// SCAN
document.getElementById("scan-btn").addEventListener("click", function() {
  document.getElementById("scan-file").value = "";
  document.getElementById("scan-preview").style.display = "none";
  document.getElementById("scan-go").style.display = "none";
  document.getElementById("scan-status").style.display = "none";
  document.getElementById("scan-modal").style.display = "flex";
});

document.getElementById("scan-close").addEventListener("click", function() {
  document.getElementById("scan-modal").style.display = "none";
});

document.getElementById("scan-modal").addEventListener("click", function(e) {
  if (e.target === this) this.style.display = "none";
});

document.getElementById("scan-confirm-close").addEventListener("click", function() {
  document.getElementById("scan-confirm-modal").style.display = "none";
});

document.getElementById("scan-confirm-modal").addEventListener("click", function(e) {
  if (e.target === this) this.style.display = "none";
});

var scanImageFile = null;

document.getElementById("scan-file").addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file) return;
  scanImageFile = file;

  var reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById("scan-img").src = ev.target.result;
    document.getElementById("scan-preview").style.display = "block";
    document.getElementById("scan-go").style.display = "block";
  };
  reader.readAsDataURL(file);
});

// PASTE INTO SCAN
document.addEventListener("paste", function(e) {
  if (document.getElementById("scan-modal").style.display !== "flex") return;

  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      var file = items[i].getAsFile();
      if (!file) continue;

      scanImageFile = file;
      var reader = new FileReader();
      reader.onload = function(ev) {
        document.getElementById("scan-img").src = ev.target.result;
        document.getElementById("scan-preview").style.display = "block";
        document.getElementById("scan-go").style.display = "block";
      };
      reader.readAsDataURL(file);
      break;
    }
  }
});

document.getElementById("scan-go").addEventListener("click", function() {
  if (!scanImageFile) return;

  var btn = document.getElementById("scan-go");
  btn.disabled = true;
  btn.textContent = "scanning...";
  document.getElementById("scan-status").style.display = "block";
  document.getElementById("scan-status").textContent = "reading image... this may take a moment.";

  var formData = new FormData();
  formData.append("image", scanImageFile);

  // send known courses for matching
  var knownCourses = [];
  var merged = getMerged();
  for (var i = 0; i < merged.length; i++) {
    if (knownCourses.indexOf(merged[i].course) === -1) {
      knownCourses.push(merged[i].course);
    }
  }
  formData.append("courses", knownCourses.join(", "));

  fetch("/api/scan", {
    method: "POST",
    body: formData
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    btn.disabled = false;
    btn.textContent = "scan image";
    document.getElementById("scan-status").style.display = "none";

    if (data.error) {
      document.getElementById("scan-status").style.display = "block";
      document.getElementById("scan-status").textContent = data.error;
      return;
    }

    var found = data.assignments;
    if (!found || found.length === 0) {
      document.getElementById("scan-status").style.display = "block";
      document.getElementById("scan-status").textContent = "no assignments found. try a clearer screenshot.";
      return;
    }

    document.getElementById("scan-modal").style.display = "none";
    showScanConfirm(found);
  })
  .catch(function(err) {
    console.error("Scan error:", err);
    btn.disabled = false;
    btn.textContent = "scan image";
    document.getElementById("scan-status").style.display = "block";
    document.getElementById("scan-status").textContent = "error reading image. try again.";
  });
});

// REPLACE the entire showScanConfirm function in app.js with this:

function showScanConfirm(items) {
  document.getElementById("scan-confirm-modal").style.display = "flex";
  var container = document.getElementById("scan-confirm-list");
  var html = "";

  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    // format date for display
    var dateDisplay = "no date found";
    var dateVal = "";
    if (item.due) {
      var d = new Date(item.due);
      if (!isNaN(d.getTime())) {
        dateDisplay = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        dateVal = d.getFullYear() + "-" +
          String(d.getMonth() + 1).padStart(2, "0") + "-" +
          String(d.getDate()).padStart(2, "0") + "T" +
          String(d.getHours()).padStart(2, "0") + ":" +
          String(d.getMinutes()).padStart(2, "0");
      }
    }

    var courseTag = item.course
      ? '<span class="scan-item-course-tag">' + item.course + '</span>'
      : '';

    html += '<div class="scan-item">';
    html += '<input type="checkbox" checked data-index="' + i + '" />';
    html += '<div class="scan-item-info">';
    html += courseTag;
    html += '<div class="scan-item-title">' + item.title + '</div>';
    html += '<div class="scan-item-detail">' + dateDisplay + (item.points ? ' · ' + item.points + ' pts' : '') + '</div>';
    html += '<div class="scan-item-fields">';
    html += '<input type="text" class="scan-item-edit course-field" placeholder="course name" data-index="' + i + '" value="' + (item.course || '') + '" />';
    html += '<input type="datetime-local" class="scan-item-edit date-field" data-date-index="' + i + '" value="' + dateVal + '" />';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }

  container.innerHTML = html;

  document.getElementById("scan-confirm-save").onclick = function() {
    var checkboxes = container.querySelectorAll('input[type="checkbox"]');
    var courseInputs = container.querySelectorAll('input[type="text"].scan-item-edit');
    var dtInputs = container.querySelectorAll('input[type="datetime-local"].scan-item-edit');

    for (var i = 0; i < checkboxes.length; i++) {
      if (!checkboxes[i].checked) continue;

      var idx = parseInt(checkboxes[i].dataset.index);
      var item = items[idx];
      var course = courseInputs[i] ? courseInputs[i].value.trim() : "";
      var dtVal = dtInputs[i] ? dtInputs[i].value : "";

      var dueISO = "";
      if (dtVal) {
        dueISO = new Date(dtVal).toISOString();
      } else if (item.due) {
        dueISO = item.due;
      } else {
        dueISO = new Date().toISOString();
      }

      customEvents.push({
        id: "custom_" + Date.now() + "_" + i,
        title: item.title,
        course: course || "uncategorized",
        due: dueISO,
        notes: "scanned",
        source: "custom"
      });
    }

    saveCustomEvents();
    buildCourseFilters();
    updateStats();
    renderAssignments();
    document.getElementById("scan-confirm-modal").style.display = "none";
  };
}

// AUTO LOGIN
(function() {
  loadSettings();
  loadCustomCourses();

  var saved = localStorage.getItem("gyst_theme");
  if (saved) {
    document.body.className = saved;
  }

  var savedLms = localStorage.getItem("gyst_lms") || "canvas";
  var savedUrl = localStorage.getItem("gyst_url");

  if (savedLms === "moodle") {
    var savedMoodleUsername = localStorage.getItem("gyst_moodle_username");
    var savedMoodlePassword = localStorage.getItem("gyst_moodle_password");
    if (savedMoodleUsername && savedMoodlePassword && savedUrl) {
      lmsType = "moodle";
      canvasUrl = savedUrl;
      moodleUsername = savedMoodleUsername;
      moodlePassword = savedMoodlePassword;
      document.getElementById("login-view").style.display = "none";
      document.getElementById("app-view").style.display = "block";
      document.getElementById("assignments-list").innerHTML = '<div class="empty-state">loading your assignments...</div>';
      loadCustomEvents();
      loadCustomCourses();
      fetchMoodleAssignments();
    }
  } else {
    var savedToken = localStorage.getItem("gyst_token");
    if (savedToken && savedUrl) {
      lmsType = "canvas";
      canvasToken = savedToken;
      canvasUrl = savedUrl;
      document.getElementById("login-view").style.display = "none";
      document.getElementById("app-view").style.display = "block";
      document.getElementById("assignments-list").innerHTML = '<div class="empty-state">loading your assignments...</div>';
      loadCustomEvents();
      loadCustomCourses();
      fetchAssignments();
    }
  }
})();
