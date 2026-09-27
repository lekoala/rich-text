/**
 * Shared demo data and suggestion providers. The providers simulate a network: they are async, honour the
 * AbortSignal (the component aborts superseded searches) and answer after a small random delay.
 */

export const people = [
  { id: "u1", name: "Alice Martin", role: "Design" },
  { id: "u2", name: "Alex Marsh", role: "Engineering" },
  { id: "u3", name: "Maria Lopez", role: "Product" },
  { id: "u4", name: "Sam Dubois", role: "Support" },
  { id: "u5", name: "Nina Lambert", role: "Marketing" },
];

export const templates = [
  {
    id: "followup",
    label: "Follow-up",
    hint: "Next step",
    html: "<p><b>Follow-up:</b> check back next week.</p>",
  },
  {
    id: "meeting",
    label: "Meeting notes",
    hint: "Structure",
    html: "<p><b>Decisions</b></p><ul><li>…</li></ul><p><b>Action items</b></p><ol><li>…</li></ol>",
  },
  { id: "thanks", label: "Thanks", hint: "Short reply", html: "<p>Thanks, looks good to me!</p>" },
  // The sanitizer drops the script and the unsafe link: suggestion HTML is not a bypass.
  {
    id: "unsafe",
    label: "Unsafe snippet",
    hint: "Sanitizer check",
    html: '<p>Kept <a href="vbscript:x">text</a><script>alert(1)</script></p>',
  },
];

/**
 * @param {number} ms
 * @param {AbortSignal} signal
 */
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** @param {string} text @param {string} query */
const matches = (text, query) => text.toLowerCase().includes(query.toLowerCase());

/**
 * @param {{ renderRow?: (title: string, detail: string) => Node, onSearch?: (query: string) => void }} [hooks]
 * @returns {import("../src/index.js").SuggestionProvider[]}
 */
export function createProviders({ renderRow, onSearch } = {}) {
  return [
    {
      trigger: "@",
      kind: "mention",
      mentionType: "user",
      async search(query, { signal }) {
        onSearch?.(`@${query}`);
        await delay(80 + Math.random() * 180, signal);
        return people.filter((item) => matches(item.name, query)).slice(0, 6);
      },
      getId: (item) => item.id,
      getLabel: (item) => item.name,
      renderItem: renderRow ? (item) => renderRow(item.name, item.role) : undefined,
    },
    {
      trigger: "/",
      async search(query, { signal }) {
        onSearch?.(`/${query}`);
        await delay(40, signal);
        return templates.filter((item) => matches(item.label, query));
      },
      getLabel: (item) => item.label,
      renderItem: renderRow ? (item) => renderRow(item.label, item.hint) : undefined,
      insert: (item) => ({ type: "html", html: item.html }),
    },
  ];
}
