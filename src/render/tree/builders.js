// Процедурные построители скелетов и точек кроны для 4 широтных пород деревьев.

function mulberry32(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function addCurvedSegment(segments, x, y, angle, length, widthStart, widthEnd, bend, steps, depth) {
  let cx = x;
  let cy = y;
  let ca = angle;
  const stepLen = length / steps;

  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    ca += bend * (i === 0 ? 0.5 : 1);
    const nx = cx + Math.cos(ca) * stepLen;
    const ny = cy - Math.sin(ca) * stepLen;
    segments.push({
      x1: cx,
      y1: cy,
      x2: nx,
      y2: ny,
      width: widthStart + (widthEnd - widthStart) * ((t0 + t1) / 2),
      depth,
    });
    cx = nx;
    cy = ny;
  }

  return { x: cx, y: cy, angle: ca };
}

function buildOak(random, baseX, baseY) {
  const segments = [];
  const clusters = [];
  const lean = (random() - 0.5) * 0.14;
  const trunk = addCurvedSegment(segments, baseX, baseY, Math.PI / 2 + lean, 36, 9.5, 5.5, (random() - 0.5) * 0.08, 3, 4);

  segments.push({ x1: baseX - 2, y1: baseY, x2: baseX - 8, y2: baseY - 5, width: 2.5, depth: 4 });
  segments.push({ x1: baseX + 2, y1: baseY, x2: baseX + 8, y2: baseY - 5, width: 2.5, depth: 4 });

  function grow(x, y, angle, length, width, depth) {
    const bend = (random() - 0.5) * 0.16;
    const end = addCurvedSegment(segments, x, y, angle, length, width, Math.max(1, width * 0.68), bend, depth >= 2 ? 2 : 1, depth);

    if (depth === 0) {
      if (random() > 0.08) {
        clusters.push({
          x: end.x,
          y: end.y,
          rx: 9 + random() * 5,
          ry: 7 + random() * 4,
          depth,
          phase: random() * Math.PI * 2,
          sway: 0.6 + random() * 0.8,
        });
      }
      return;
    }

    if (depth <= 2 && end.y < baseY - 46 && (depth === 1 || Math.abs(end.x - baseX) > 10) && random() > 0.25) {
      clusters.push({
        x: (x + end.x) / 2 + (random() - 0.5) * 4,
        y: (y + end.y) / 2 + (random() - 0.5) * 3,
        rx: 8 + random() * 4,
        ry: 6 + random() * 4,
        depth,
        phase: random() * Math.PI * 2,
        sway: 0.5 + random() * 0.85,
      });
    }

    const forks = depth === 3 ? 3 : random() < 0.65 ? 2 : 3;
    for (let i = 0; i < forks; i += 1) {
      const baseSpread = depth === 3 ? 0.68 : 0.55;
      const spread = (i - (forks - 1) / 2) * (baseSpread + random() * 0.28) + (random() - 0.5) * 0.16;
      grow(
        end.x,
        end.y,
        end.angle + spread,
        length * (0.7 + random() * 0.14),
        Math.max(1, width * 0.64),
        depth - 1,
      );
    }
  }

  grow(trunk.x, trunk.y, trunk.angle, 32, 5.5, 3);
  return { segments, clusters, fronds: [], baseX, baseY, species: 'oak' };
}

function buildBirch(random, baseX, baseY) {
  const segments = [];
  const clusters = [];
  const lean = (random() - 0.5) * 0.14;
  const mid = addCurvedSegment(segments, baseX, baseY, Math.PI / 2 + lean, 38, 6.2, 4.2, -lean * 0.3, 3, 4);
  const top = addCurvedSegment(segments, mid.x, mid.y, mid.angle + (random() - 0.5) * 0.08, 42, 4.2, 2.2, (random() - 0.5) * 0.1, 3, 3);

  function grow(x, y, angle, length, width, depth) {
    const bend = depth <= 1 ? (angle > Math.PI / 2 ? 0.24 : -0.24) : (random() - 0.5) * 0.12;
    const end = addCurvedSegment(segments, x, y, angle, length, width, Math.max(1, width * 0.6), bend, 2, depth);

    if (depth === 0) {
      clusters.push({
        x: end.x,
        y: end.y + 3,
        rx: 6 + random() * 3.5,
        ry: 7 + random() * 4,
        depth,
        phase: random() * Math.PI * 2,
        sway: 0.8 + random() * 0.9,
      });
      return;
    }

    if (depth === 1 && random() > 0.2) {
      clusters.push({
        x: (x + end.x) / 2,
        y: (y + end.y) / 2 + 2,
        rx: 6 + random() * 3,
        ry: 6 + random() * 3,
        depth,
        phase: random() * Math.PI * 2,
        sway: 0.7 + random() * 0.8,
      });
    }

    for (let i = 0; i < 2; i += 1) {
      const spread = (i === 0 ? -1 : 1) * (0.36 + random() * 0.22);
      grow(end.x, end.y, end.angle + spread, length * (0.72 + random() * 0.12), Math.max(1, width * 0.62), depth - 1);
    }
  }

  grow(mid.x, mid.y, Math.PI / 2 + 0.58, 25, 3, 2);
  grow(mid.x, mid.y, Math.PI / 2 - 0.55, 25, 3, 2);
  const upperY = (mid.y + top.y) / 2;
  const upperX = (mid.x + top.x) / 2;
  grow(upperX, upperY, Math.PI / 2 + 0.45, 24, 2.5, 2);
  grow(upperX, upperY, Math.PI / 2 - 0.45, 24, 2.5, 2);
  grow(top.x, top.y, top.angle, 22, 2.2, 2);

  return { segments, clusters, fronds: [], baseX, baseY, species: 'birch' };
}

function buildConifer(random, baseX, baseY) {
  const segments = [];
  const clusters = [];
  const topY = baseY - 122;
  addCurvedSegment(segments, baseX, baseY, Math.PI / 2 + (random() - 0.5) * 0.04, 122, 7.5, 1, 0, 6, 4);

  const tiers = 7;
  for (let tier = 0; tier < tiers; tier += 1) {
    const t = tier / (tiers - 1);
    const y = Math.round(baseY - 26 - t * 84);
    const span = Math.round(41 * (1 - t * 0.72) + (random() - 0.5) * 3);
    const droop = 4 + (1 - t) * 4;

    segments.push({ x1: baseX, y1: y, x2: baseX - span * 0.72, y2: y + droop, width: Math.max(1, 3 - t * 2), depth: 2 });
    segments.push({ x1: baseX, y1: y, x2: baseX + span * 0.72, y2: y + droop, width: Math.max(1, 3 - t * 2), depth: 2 });

    clusters.push({
      x: baseX + (random() - 0.5) * 2,
      y: y - 2,
      rx: span,
      ry: Math.round(16 - t * 4),
      tier,
      phase: random() * Math.PI * 2,
      sway: 0.35 + t * 0.65,
    });
  }

  clusters.push({ x: baseX, y: topY + 7, rx: 8, ry: 14, tier: tiers, phase: random() * Math.PI * 2, sway: 1 });
  return { segments, clusters, fronds: [], baseX, baseY, species: 'conifer' };
}

function buildTropical(random, baseX, baseY) {
  const segments = [];
  const fronds = [];
  const leanDir = random() < 0.5 ? -1 : 1;
  const trunk = addCurvedSegment(
    segments,
    baseX,
    baseY,
    Math.PI / 2 + leanDir * (0.14 + random() * 0.1),
    102,
    6,
    3,
    -leanDir * 0.045,
    7,
    4,
  );

  const frondCount = 7;
  for (let i = 0; i < frondCount; i += 1) {
    const t = i / (frondCount - 1);
    const angle = -0.3 + t * (Math.PI + 0.6) + (random() - 0.5) * 0.15;
    fronds.push({
      x: trunk.x,
      y: trunk.y,
      angle,
      length: 26 + random() * 11,
      droop: 0.35 + random() * 0.25,
      phase: random() * Math.PI * 2,
      sway: 0.7 + random() * 0.7,
    });
  }

  return { segments, clusters: [], fronds, crown: { x: trunk.x, y: trunk.y }, baseX, baseY, species: 'tropical' };
}

/**
 * Строит геометрию ствола, ветвей и кроны с учётом породы дерева.
 * @param {number} seed
 * @param {{baseX?: number, baseY?: number, species?: 'conifer'|'birch'|'oak'|'tropical'}} [options]
 */
export function buildTree(seed, { baseX = 80, baseY = 179, species = 'oak' } = {}) {
  const random = mulberry32(seed);
  if (species === 'conifer') return buildConifer(random, baseX, baseY);
  if (species === 'birch') return buildBirch(random, baseX, baseY);
  if (species === 'tropical') return buildTropical(random, baseX, baseY);
  return buildOak(random, baseX, baseY);
}
