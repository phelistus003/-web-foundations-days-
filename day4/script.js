// 1. Select all the elements we need, once, at the top
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

// 2. Update both counters and the warning classes
function updateCounts() {
  const text = noteText.value;
  const chars = text.length;

  // Count words: trim the spaces at the ends, then split on any run of spaces.
  // Empty text must give 0, because "".split(...) would give 1.
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = chars + " / 200 characters";
  wordCount.textContent = words + " words";

  // Remove both classes first so only the right one is applied
  charCount.classList.remove("warning", "over");
  if (chars > 200) {
    charCount.classList.add("over");
  } else if (chars > 180) {
    charCount.classList.add("warning");
  }
}

// 3. Draft saving
function saveDraft() {
  localStorage.setItem("draft", noteText.value);
}

// 4. Clear everything (used by the button and the Escape key)
function clearAll() {
  noteText.value = "";
  localStorage.removeItem("draft");
  updateCounts();
}

// 5. Theme: one function sets the look, so click and page load share it
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

// 6. Events
noteText.addEventListener("input", function () {
  updateCounts();
  saveDraft();
});

noteText.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    clearAll();
  }
});

clearBtn.addEventListener("click", clearAll);

themeToggle.addEventListener("click", function () {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem("theme", isDark ? "dark" : "light");
});

// 7. On page load: restore the draft and theme, then update the counters
const savedDraft = localStorage.getItem("draft");
if (savedDraft !== null) {
  noteText.value = savedDraft;
}
applyTheme(localStorage.getItem("theme") === "dark");
updateCounts();