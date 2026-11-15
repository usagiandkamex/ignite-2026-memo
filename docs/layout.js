export const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export function overlaps(a, b) {
  return a.id !== b.id && a.day === b.day &&
    minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}

export function conflictPairs(sessions) {
  return sessions.flatMap((session, index) =>
    sessions.slice(index + 1).filter(other => overlaps(session, other)).map(other => [session, other]));
}

// Connected overlap groups share a lane count, including chained overlaps.
export function layoutDay(sessions) {
  const sorted = [...sessions].sort((a, b) =>
    minutes(a.start) - minutes(b.start) || minutes(b.end) - minutes(a.end) || a.id.localeCompare(b.id));
  const result = [];
  let group = [];
  let groupEnd = -1;
  function flush() {
    const ends = [];
    const placed = group.map(session => {
      let lane = ends.findIndex(end => end <= minutes(session.start));
      if (lane === -1) lane = ends.length;
      ends[lane] = minutes(session.end);
      return {...session, lane};
    });
    result.push(...placed.map(session => ({...session, lanes: ends.length})));
    group = [];
  }
  for (const session of sorted) {
    if (group.length && minutes(session.start) >= groupEnd) flush();
    groupEnd = group.length ? Math.max(groupEnd, minutes(session.end)) : minutes(session.end);
    group.push(session);
  }
  flush();
  return result;
}

export function transferWarnings(sessions) {
  const sorted = [...sessions].sort((a, b) => a.day - b.day || minutes(a.start) - minutes(b.start));
  return sorted.flatMap((session, index) => {
    const next = sorted[index + 1];
    if (!next || next.day !== session.day) return [];
    const gap = minutes(next.start) - minutes(session.end);
    const building = value => value.split(" | ")[0];
    return gap >= 0 && gap < 20 && building(session.place) !== building(next.place)
      ? [{from: session, to: next, gap}] : [];
  });
}
