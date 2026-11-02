const KEY = "gems-top3";

function validEntry(x) {
  return (
    x && Number.isFinite(x.score) && x.score > 0 &&
    Number.isFinite(x.moves) && x.moves >= 0
  );
}

function better(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  return a.moves < b.moves;
}

export function createStats(storage) {
  function load() {
    try {
      const raw = storage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr
        .filter(validEntry)
        .map((x) => ({ score: Number(x.score), moves: Number(x.moves) }))
        .sort((a, b) => (better(a, b) ? -1 : 1))
        .slice(0, 3);
    } catch {
      return [];
    }
  }

  function save(list) {
    try { storage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }

  return {
    top3: load,
    record(score, moves) {
      if (!Number.isFinite(score) || score <= 0 || !Number.isFinite(moves)) return load();
      const list = load();
      list.push({ score: Number(score), moves: Math.max(0, Math.floor(moves)) });
      list.sort((a, b) => (better(a, b) ? -1 : 1));
      const next = list.slice(0, 3);
      save(next);
      return next;
    },
  };
}
