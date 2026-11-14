// Фасад дерева: объединяет скелет, крону, тень и листопад.

import { treeSeed, buildTree, drawShadow, drawSkeleton } from './tree/skeleton.js';
import { drawFoliage, drawLeafFall } from './tree/foliage.js';

export { treeSeed, buildTree, drawShadow, drawLeafFall };

/**
 * Рисует дерево целиком.
 * @param {import('./surface.js').Surface} surface
 * @param {object} tree
 * @param {{
 *   foliage: object, timeMs: number, windAmp: number, windDirDeg: number,
 *   light: number, snowLoad: number, snowColor: number, wetness: number
 * }} options
 */
export function drawTree(surface, tree, {
  foliage,
  timeMs,
  windAmp,
  windDirDeg,
  light,
  snowLoad,
  snowColor,
  wetness,
}) {
  const radians = ((windDirDeg ?? 0) * Math.PI) / 180;
  const lean = -Math.sin(radians) * windAmp * 6;
  const seconds = timeMs / 1000;

  const sway = (y) => {
    const height = Math.max(0, tree.baseY - y);
    const factor = (height / 120) ** 1.7;
    return (
      lean * factor +
      windAmp * factor * 13 * Math.sin(seconds * 1.05 + y * 0.021) +
      windAmp * factor * 4 * Math.sin(seconds * 3.1 + y * 0.09)
    );
  };

  drawSkeleton(surface, tree, { sway, light, snowLoad, snowColor, wetness });
  drawFoliage(surface, tree, { foliage, seconds, windAmp, light, snowLoad, snowColor, sway });
}
