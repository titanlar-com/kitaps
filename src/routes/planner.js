// Orders the stops of a bookstore route and suggests the next one. Distances are
// straight lines on the globe, not walking or transit times, so they rank stops
// by nearness and give a rough length; they are not a travel-time promise.

/** @typedef {{ lat: number, lng: number }} LatLng */
/** @typedef {Record<string, LatLng> | Map<string, LatLng>} CoordsById */
/** @typedef {{ id: string, status?: string }} StoreLike */

/** Mean Earth radius (IUGG). */
const EARTH_RADIUS_KM = 6371.0088;
/** Gains smaller than a millimetre are rounding noise and never reorder stops. */
const EPSILON_KM = 1e-6;

/**
 * @param {CoordsById | undefined} coordsById
 * @param {string} id
 * @returns {LatLng | undefined}
 */
function coordOf(coordsById, id) {
  const value = coordsById instanceof Map ? coordsById.get(id)
    : coordsById && Object.hasOwn(coordsById, id) ? coordsById[id] : undefined;
  return value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180 ? value : undefined;
}

/**
 * Great-circle distance in kilometres.
 * @param {LatLng} a
 * @param {LatLng} b
 * @returns {number}
 */
export function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Length of the open path through the stops in this order. Stops without
 * coordinates are skipped, so they add nothing.
 * @param {readonly string[]} ids
 * @param {CoordsById} coordsById
 * @returns {number}
 */
export function routeLengthKm(ids, coordsById) {
  const points = ids.map(id => coordOf(coordsById, id)).filter(Boolean);
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += haversineKm(points[index - 1], points[index]);
  return total;
}

/**
 * The shortest open path found through `points`, as indexes. With `fixedStart`
 * index 0 stays first. Candidates: the given order and a nearest-neighbour path
 * from every allowed start, each improved with 2-opt. The given order is the
 * first candidate and is only replaced by a strictly shorter one, so the result
 * is never longer than the input.
 * @param {LatLng[]} points
 * @param {boolean} fixedStart
 * @returns {number[]}
 */
function shortestOpenPath(points, fixedStart) {
  const count = points.length;
  const indexes = points.map((_, index) => index);
  if (count < 3) return indexes;
  const distance = points.map(from => points.map(to => haversineKm(from, to)));
  /** @param {number[]} order */
  const lengthOf = order => order.reduce((total, stop, index) => index ? total + distance[order[index - 1]][stop] : 0, 0);
  const first = fixedStart ? 1 : 0;

  /** @param {number[]} order */
  const twoOpt = order => {
    const path = [...order];
    for (let improved = true; improved;) {
      improved = false;
      for (let start = first; start < count - 1; start += 1) {
        for (let end = start + 1; end < count; end += 1) {
          // Reversing path[start..end] only changes the edges at its two ends;
          // an open path has no edge before its first stop or after its last.
          const before = (start > 0 ? distance[path[start - 1]][path[start]] : 0) + (end < count - 1 ? distance[path[end]][path[end + 1]] : 0);
          const after = (start > 0 ? distance[path[start - 1]][path[end]] : 0) + (end < count - 1 ? distance[path[start]][path[end + 1]] : 0);
          if (after < before - EPSILON_KM) {
            path.splice(start, end - start + 1, ...path.slice(start, end + 1).reverse());
            improved = true;
          }
        }
      }
    }
    return path;
  };

  /** @param {number} start */
  const nearestNeighbour = start => {
    const path = [start];
    const left = indexes.filter(index => index !== start);
    while (left.length) {
      const last = path[path.length - 1];
      let best = 0;
      for (let index = 1; index < left.length; index += 1) if (distance[last][left[index]] < distance[last][left[best]]) best = index;
      path.push(...left.splice(best, 1));
    }
    return path;
  };

  let best = twoOpt(indexes);
  let bestLength = lengthOf(best);
  for (const start of fixedStart ? [0] : indexes) {
    const candidate = twoOpt(nearestNeighbour(start));
    const length = lengthOf(candidate);
    if (length < bestLength - EPSILON_KM) {
      best = candidate;
      bestLength = length;
    }
  }
  return best;
}

/**
 * A shorter visiting order for the same stops; no id is added or dropped.
 * With `keepFirst` the first stop stays the start, with or without coordinates.
 * Other stops without coordinates keep their relative order and go to the end.
 * @param {readonly string[]} ids
 * @param {CoordsById} coordsById
 * @param {{ keepFirst?: boolean }} [options]
 * @returns {string[]}
 */
export function orderStops(ids, coordsById, { keepFirst = true } = {}) {
  const list = [...ids];
  if (list.length < 2) return list;
  const pinned = keepFirst ? list.slice(0, 1) : [];
  const rest = keepFirst ? list.slice(1) : list;
  const located = rest.filter(id => coordOf(coordsById, id));
  const unlocated = rest.filter(id => !coordOf(coordsById, id));
  const anchored = pinned.length > 0 && coordOf(coordsById, pinned[0]) !== undefined;
  const path = anchored ? [pinned[0], ...located] : located;
  const order = shortestOpenPath(path.map(id => /** @type {LatLng} */ (coordOf(coordsById, id))), anchored).map(index => path[index]);
  return anchored ? [...order, ...unlocated] : [...pinned, ...order, ...unlocated];
}

/**
 * The nearest group of `size` open stores that no route plans yet, in visiting
 * order. Every candidate seeds a group with its nearest neighbours; the group
 * with the shortest path wins. Stores without coordinates cannot be placed and
 * are left out. Returns [] when fewer than two stores qualify.
 * @param {readonly StoreLike[]} stores
 * @param {Iterable<string>} plannedStopIds
 * @param {CoordsById} coordsById
 * @param {number} [size]
 * @returns {string[]}
 */
export function suggestNextRoute(stores, plannedStopIds, coordsById, size = 3) {
  const planned = new Set(plannedStopIds ?? []);
  const seen = new Set();
  /** @type {{ id: string, point: LatLng }[]} */
  const candidates = [];
  for (const store of stores ?? []) {
    if (!store || store.status !== 'open' || planned.has(store.id) || seen.has(store.id)) continue;
    const point = coordOf(coordsById, store.id);
    if (!point) continue;
    seen.add(store.id);
    candidates.push({ id: store.id, point });
  }
  if (candidates.length < 2) return [];
  const wanted = Number.isFinite(size) ? Math.trunc(size) : 3;
  const groupSize = Math.min(Math.max(2, wanted), candidates.length);
  /** @type {string[]} */
  let best = [];
  let bestLength = Infinity;
  for (const seed of candidates) {
    // Array sort is stable, so equally near stores keep the order of `stores`.
    const neighbours = candidates
      .filter(candidate => candidate !== seed)
      .map(candidate => ({ id: candidate.id, km: haversineKm(seed.point, candidate.point) }))
      .sort((left, right) => left.km - right.km)
      .slice(0, groupSize - 1);
    const ordered = orderStops([seed.id, ...neighbours.map(item => item.id)], coordsById, { keepFirst: false });
    const length = routeLengthKm(ordered, coordsById);
    if (length < bestLength - EPSILON_KM) {
      best = ordered;
      bestLength = length;
    }
  }
  return best;
}
