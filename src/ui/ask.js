// The Ask tab: turn the current selection into a prompt you can hand to an
// agent.
//
// This is a prompt builder, not a chat. The page makes no network calls and
// holds no API key — it composes the text and gives it to you. The UI says so
// rather than implying a conversation that is not happening.

import { buildPrompt, PURPOSES, DEFAULT_MAX_CHARS } from "../selection/digest.js";
import { countByCategory, isUnfiltered } from "../selection/selection.js";
import { formatYear } from "../time/year.js";
import { CATEGORY_LABELS } from "../data/schema.js";

export function createAsk(root) {
  root.innerHTML = `
    <div class="ask-chip" hidden></div>
    <p class="ask-empty">Drag on the lower band to select a time range, then compose a question about it.</p>
    <form class="ask-form" hidden>
      <fieldset class="ask-purpose">
        <legend>Purpose</legend>
      </fieldset>
      <label class="ask-question-label" for="ask-question">Your question <span>(optional)</span></label>
      <textarea id="ask-question" class="ask-question" rows="3"
        placeholder="What connects these events?"></textarea>
      <p class="ask-size"></p>
      <div class="ask-actions">
        <button type="button" class="ask-copy">Copy prompt</button>
      </div>
      <p class="ask-note">Nothing is sent from this page. The prompt is copied for you to paste into Claude, ChatGPT, or a coding agent.</p>
    </form>`;

  const chipEl = root.querySelector(".ask-chip");
  const emptyEl = root.querySelector(".ask-empty");
  const formEl = root.querySelector(".ask-form");
  const purposeEl = root.querySelector(".ask-purpose");
  const questionEl = root.querySelector(".ask-question");
  const sizeEl = root.querySelector(".ask-size");
  const copyEl = root.querySelector(".ask-copy");

  let purpose = "explain";
  let selection = null;

  for (const [id, preset] of Object.entries(PURPOSES)) {
    const option = document.createElement("label");
    option.className = "ask-option";
    option.innerHTML = `<input type="radio" name="ask-purpose" value="${id}"${
      id === purpose ? " checked" : ""
    }><span>${preset.label}</span>`;
    option.querySelector("input").addEventListener("change", () => {
      purpose = id;
      refresh();
    });
    purposeEl.append(option);
  }

  questionEl.addEventListener("input", refresh);

  copyEl.addEventListener("click", async () => {
    const { text } = current();
    try {
      await navigator.clipboard.writeText(text);
      flash(copyEl, "Copied");
    } catch {
      // Clipboard access can be refused; falling back to a selection the user
      // can copy by hand beats failing silently.
      questionEl.blur();
      window.prompt("Copy the prompt below", text.slice(0, 2000));
      flash(copyEl, "Copy manually");
    }
  });

  function current() {
    return buildPrompt(selection, {
      purpose,
      question: questionEl.value,
      maxChars: DEFAULT_MAX_CHARS,
    });
  }

  function refresh() {
    if (!selection) return;

    const result = current();

    sizeEl.textContent =
      `~${result.estimatedTokens.toLocaleString()} tokens (estimate)` +
      (result.rung === 0
        ? ""
        : result.includedCount < result.eventCount
          ? ` · shortened to ${result.includedCount.toLocaleString()} of ${result.eventCount.toLocaleString()} events`
          : " · shortened, sources omitted");
    sizeEl.classList.toggle("is-shortened", result.rung > 0);
  }

  function renderChip() {
    if (!selection) {
      chipEl.hidden = true;
      formEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    chipEl.hidden = false;
    formEl.hidden = false;
    emptyEl.hidden = true;

    const byCategory = countByCategory(selection);
    const domains = isUnfiltered(selection)
      ? "all domains and regions"
      : `${selection.categories.map((c) => CATEGORY_LABELS[c].split(" ")[0]).join(", ")} · ${
          selection.regions.length
        } regions`;

    chipEl.innerHTML = "";
    const range = document.createElement("strong");
    range.textContent = `${formatYear(selection.from)} – ${formatYear(selection.to)}`;
    const meta = document.createElement("span");
    meta.textContent = `${selection.events.length.toLocaleString()} event${
      selection.events.length === 1 ? "" : "s"
    } · ${domains}`;
    chipEl.append(range, meta);

    if (byCategory.length) {
      const bar = document.createElement("div");
      bar.className = "ask-chip-bar";
      for (const entry of byCategory) {
        const segment = document.createElement("span");
        segment.style.flexGrow = String(entry.count);
        segment.dataset.category = entry.category;
        segment.title = `${entry.count} ${entry.label}`;
        bar.append(segment);
      }
      chipEl.append(bar);
    }
  }

  return {
    setSelection(next) {
      selection = next;
      renderChip();
      refresh();
    },
  };
}

function flash(button, message) {
  const original = button.textContent;
  button.textContent = message;
  button.disabled = true;
  setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, 1200);
}
