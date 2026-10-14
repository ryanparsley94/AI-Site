export type TimedInterval = { id: number; startMinute: number; endMinute: number };
export type OverlapPosition = { lane: number; laneCount: number };

export function minuteOffset(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Assigns overlapping appointments to side-by-side lanes, independently per overlap group. */
export function layoutOverlaps<T extends TimedInterval>(items: T[]): Map<number, OverlapPosition> {
  const sorted = [...items].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id - b.id);
  const result = new Map<number, OverlapPosition>();
  let group: T[] = [];
  let groupEnd = -Infinity;

  const flush = () => {
    if (!group.length) return;
    const laneEnds: number[] = [];
    const assigned: Array<{ id: number; lane: number }> = [];
    for (const item of group) {
      let lane = laneEnds.findIndex((end) => end <= item.startMinute);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = item.endMinute;
      assigned.push({ id: item.id, lane });
    }
    for (const item of assigned) result.set(item.id, { lane: item.lane, laneCount: laneEnds.length });
    group = [];
    groupEnd = -Infinity;
  };

  for (const item of sorted) {
    if (group.length && item.startMinute >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMinute);
  }
  flush();
  return result;
}

export function eventGeometry(startMinute: number, durationMinutes: number, pixelsPerHour: number) {
  const pxPerMinute = pixelsPerHour / 60;
  return {
    top: startMinute * pxPerMinute,
    height: Math.max(36, Math.max(1, durationMinutes) * pxPerMinute),
  };
}
