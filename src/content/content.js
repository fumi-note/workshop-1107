(() => {
  const STORAGE_KEY = "terms";
  const KATAKANA_PATTERN = /^[\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]+$/u;
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "closed" });
  let selectionRect;
  let pendingSelectionCheck = false;
  let lookupId = 0;

  host.hidden = true;
  shadow.innerHTML = `
    <style>
      :host {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        display: block;
        width: min(360px, calc(100vw - 24px));
        color: #202124;
        font: 14px/1.5 system-ui, sans-serif;
        pointer-events: none;
      }
      :host([hidden]) { display: none; }
      .card {
        box-sizing: border-box;
        position: relative;
        max-height: min(60vh, 480px);
        overflow: auto;
        padding: 18px;
        border: 1px solid #dadce0;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 4px 16px rgb(0 0 0 / 22%);
        pointer-events: auto;
      }
      h2 {
        margin: 0 32px 10px 0;
        font-size: 16px;
        line-height: 1.4;
        overflow-wrap: anywhere;
      }
      p { margin: 0 0 12px; overflow-wrap: anywhere; }
      .close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 4px;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 20px;
        cursor: pointer;
      }
      button, input, textarea { font: inherit; }
      button:focus-visible, input:focus-visible, textarea:focus-visible {
        outline: 3px solid #1558d6;
        outline-offset: 2px;
      }
      .actions { display: flex; gap: 8px; margin-top: 14px; }
      .actions button {
        min-height: 36px;
        padding: 6px 12px;
        border: 1px solid #5f6368;
        border-radius: 4px;
        background: #fff;
        color: #202124;
        cursor: pointer;
      }
      .actions button.primary {
        border-color: #1558d6;
        background: #1558d6;
        color: #fff;
      }
      label { display: block; margin: 12px 0 4px; font-weight: 600; }
      input, textarea {
        box-sizing: border-box;
        width: 100%;
        padding: 8px;
        border: 1px solid #5f6368;
        border-radius: 4px;
        color: #202124;
        background: #fff;
      }
      textarea { min-height: 96px; resize: vertical; }
      .error { color: #b3261e; }
    </style>
    <aside class="card" aria-label="用語カード">
      <button class="close" type="button" aria-label="閉じる">×</button>
      <div class="content"></div>
    </aside>
  `;

  const card = shadow.querySelector(".card");
  const content = shadow.querySelector(".content");
  shadow.querySelector(".close").addEventListener("click", hideCard);
  document.documentElement.append(host);

  function isKatakana(value) {
    return KATAKANA_PATTERN.test(value);
  }

  function makeElement(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function showCard() {
    host.hidden = false;
    host.style.left = "0px";
    host.style.top = "0px";

    const bounds = card.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    let left = selectionRect.left + (selectionRect.width - bounds.width) / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - bounds.width - margin));

    let top = selectionRect.bottom + gap;
    if (top + bounds.height > window.innerHeight - margin) {
      top = selectionRect.top - bounds.height - gap;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - bounds.height - margin));

    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  }

  function hideCard() {
    lookupId += 1;
    host.hidden = true;
    content.replaceChildren();
  }

  function renderMessage(title, message, actionLabel, onAction) {
    const heading = makeElement("h2", title);
    const status = makeElement("p", message);
    status.setAttribute("role", "status");
    const children = [heading, status];

    if (actionLabel) {
      const actions = makeElement("div", undefined, "actions");
      const button = makeElement("button", actionLabel, "primary");
      button.type = "button";
      button.addEventListener("click", onAction);
      actions.append(button);
      children.push(actions);
    }

    content.replaceChildren(...children);
    showCard();
  }

  function renderRegistered(term, description) {
    const heading = makeElement("h2", term);
    const explanation = makeElement("p", description);
    explanation.setAttribute("role", "status");
    content.replaceChildren(heading, explanation);
    showCard();
  }

  function readTerms() {
    return chrome.storage.local.get(STORAGE_KEY).then((result) => {
      const terms = result[STORAGE_KEY] ?? [];
      if (
        !Array.isArray(terms) ||
        !terms.every(
          (entry) =>
            entry &&
            typeof entry.term === "string" &&
            typeof entry.description === "string",
        )
      ) {
        throw new Error("保存された用語データの形式が正しくありません。");
      }
      return terms;
    });
  }

  async function saveTerm(term, description) {
    const terms = await readTerms();
    if (terms.some((entry) => entry.term === term)) {
      throw new Error("この用語はすでに登録されています。");
    }
    terms.push({ term, description });
    await chrome.storage.local.set({ [STORAGE_KEY]: terms });
  }

  function renderRegistration(term) {
    const registrationLookupId = lookupId;
    const heading = makeElement("h2", "用語を追加");
    const form = document.createElement("form");
    const termLabel = makeElement("label", "用語");
    const termInput = document.createElement("input");
    termInput.type = "text";
    termInput.required = true;
    termInput.value = term;
    termInput.autocomplete = "off";
    termInput.setAttribute("aria-label", "用語");
    termLabel.append(termInput);

    const descriptionLabel = makeElement("label", "解説");
    const descriptionInput = document.createElement("textarea");
    descriptionInput.required = true;
    descriptionInput.setAttribute("aria-label", "解説");
    descriptionLabel.append(descriptionInput);

    const error = makeElement("p", "", "error");
    error.setAttribute("role", "alert");
    const actions = makeElement("div", undefined, "actions");
    const saveButton = makeElement("button", "保存", "primary");
    saveButton.type = "submit";
    const cancelButton = makeElement("button", "キャンセル");
    cancelButton.type = "button";
    cancelButton.addEventListener("click", () => renderUnknown(term));
    actions.append(saveButton, cancelButton);
    form.append(termLabel, descriptionLabel, error, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const newTerm = termInput.value.trim();
      if (!isKatakana(newTerm)) {
        error.textContent = "用語はカタカナで入力してください。";
        termInput.focus();
        return;
      }
      saveButton.disabled = true;
      error.textContent = "";
      try {
        const description = descriptionInput.value.trim();
        await saveTerm(newTerm, description);
        if (registrationLookupId !== lookupId) return;
        renderRegistered(newTerm, description);
      } catch (caughtError) {
        if (registrationLookupId !== lookupId) return;
        console.error("用語を保存できませんでした。", caughtError);
        error.textContent =
          caughtError instanceof Error && caughtError.message.includes("すでに登録")
            ? caughtError.message
            : "用語を保存できませんでした。もう一度お試しください。";
        saveButton.disabled = false;
      }
    });

    content.replaceChildren(heading, form);
    showCard();
    termInput.focus();
  }

  function renderUnknown(term, requestId) {
    renderMessage("未登録の用語です", term, "用語を追加する", () => {
      if (requestId === lookupId) renderRegistration(term);
    });
  }

  async function lookup(term, requestId) {
    try {
      const terms = await readTerms();
      if (requestId !== lookupId) return;
      const found = terms.find((entry) => entry.term === term);
      if (found) {
        renderRegistered(found.term, found.description);
      } else {
        renderUnknown(term, requestId);
      }
    } catch (error) {
      if (requestId !== lookupId) return;
      console.error("用語を読み込めませんでした。", error);
      renderMessage(
        "用語を表示できません",
        "保存データを読み込めませんでした。拡張機能を再読み込みしてお試しください。",
      );
    }
  }

  function checkSelection() {
    pendingSelectionCheck = false;
    const selection = window.getSelection();
    const term = selection?.toString().trim() ?? "";
    if (!selection || !term || !isKatakana(term) || selection.rangeCount === 0) {
      hideCard();
      return;
    }

    selectionRect = selection.getRangeAt(0).getBoundingClientRect();
    if (!selectionRect.width && !selectionRect.height) {
      hideCard();
      return;
    }
    lookup(term, ++lookupId);
  }

  function scheduleSelectionCheck(event) {
    if (host.contains(event.target) || pendingSelectionCheck) return;
    pendingSelectionCheck = true;
    requestAnimationFrame(checkSelection);
  }

  document.addEventListener("mouseup", scheduleSelectionCheck, true);
  document.addEventListener("keyup", scheduleSelectionCheck, true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !host.hidden) hideCard();
    },
    true,
  );
})();
