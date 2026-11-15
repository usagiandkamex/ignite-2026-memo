export const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export function overlaps(a, b) {
  return a.id !== b.id && a.day === b.day &&
    minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}

export function conflictPairs(sessions) {
  return sessions.flatMap((session, index) =>
    sessions.slice(index + 1).filter(other => overlaps(session, other)).map(other => [session, other]));
}

export function relevantConflictPairs(sessions, visible) {
  const visibleIds = new Set(visible.map(item => item.id));
  return conflictPairs(sessions).filter(([a, b]) =>
    (a.priority && b.priority) || visibleIds.has(a.id) || visibleIds.has(b.id));
}

// Connected overlap groups share a lane count, including chained overlaps.
export function layoutDay(sessions) {
  const sorted = [...sessions].sort((a, b) =>
    minutes(a.start) - minutes(b.start) || minutes(b.end) - minutes(a.end) || a.id.localeCompare(b.id));
  const result = [];
  let group = [];
  let groupEnd = -1;
  function flush() {
    const assigned = new Map();
    function assign(items, offset) {
      const ends = [];
      for (const session of items) {
        let lane = ends.findIndex(end => end <= minutes(session.start));
        if (lane === -1) lane = ends.length;
        ends[lane] = minutes(session.end);
        assigned.set(session.id, offset + lane);
      }
      return ends.length;
    }
    const plannedLanes = assign(group.filter(session => session.priority), 0);
    const candidateLanes = assign(group.filter(session => !session.priority), plannedLanes);
    const lanes = plannedLanes + candidateLanes;
    result.push(...group.map(session => ({...session, lane: assigned.get(session.id), lanes})));
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

export function dayColumnMinWidth(layout, week) {
  const lanes = Math.max(1, ...layout.map(item => item.lanes));
  return Math.max(week ? 260 : 0, lanes * 100);
}

export function sessionGaps(sessions) {
  const sorted = [...sessions].sort((a, b) =>
    a.day - b.day || minutes(a.start) - minutes(b.start) || minutes(b.end) - minutes(a.end));
  const gaps = [];
  let latest;
  for (const item of sorted) {
    if (!latest || item.day !== latest.day) {
      latest = item;
      continue;
    }
    const gap = minutes(item.start) - minutes(latest.end);
    if (gap >= 15) gaps.push({day: item.day, start: latest.end, end: item.start, minutes: gap});
    if (minutes(item.end) > minutes(latest.end)) latest = item;
  }
  return gaps;
}

export function transferWarnings(sessions) {
  const sorted = [...sessions].sort((a, b) => a.day - b.day || minutes(a.start) - minutes(b.start));
  return sorted.flatMap((session, index) => {
    const next = sorted[index + 1];
    if (!next || next.day !== session.day) return [];
    const gap = minutes(next.start) - minutes(session.end);
    const building = value => value.split(" | ")[0];
    const sameBuilding = building(session.place) === building(next.place);
    const needsTransfer = sameBuilding ? gap === 0 && session.place !== next.place : gap < 20;
    return gap >= 0 && needsTransfer ? [{from: session, to: next, gap, sameBuilding}] : [];
  });
}
