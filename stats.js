const KEY = "gems-top3";

export function createStats(storage) {
  function load() {
    try {
      const raw = storage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter((x) => Number.isFinite(x)).map(Number).sort((a, b) => b - a).slice(0, 3);
    } catch {
      return [];
    }
  }

  function save(list) {
    try { storage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }

  return {
    top3: load,
    record(score) {
      if (!Number.isFinite(score) || score <= 0) return load();
      const list = load();
      list.push(score);
      list.sort((a, b) => b - a);
      const next = list.slice(0, 3);
      save(next);
      return next;
    },
  };
}
