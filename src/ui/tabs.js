// Tab shell for the side panel.
//
// This wraps the existing panels rather than reaching into them: the cursor
// panel keeps its own module and its own markup, and gains a sibling.

export function createTabs(root, tabs) {
  const list = root.querySelector(".panel-tabs");
  const buttons = new Map();

  function show(id) {
    for (const [tabId, button] of buttons) {
      const active = tabId === id;
      button.setAttribute("aria-selected", String(active));
      button.classList.toggle("is-active", active);
      const panel = root.querySelector(`#${tabId}`);
      panel.hidden = !active;
    }
  }

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "panel-tab";
    button.id = `${tab.id}-tab`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", tab.id);
    button.textContent = tab.label;
    button.addEventListener("click", () => show(tab.id));
    list.append(button);
    buttons.set(tab.id, button);
  }

  show(tabs[0].id);

  return { show };
}
