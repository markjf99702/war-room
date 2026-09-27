// Pointy-top hexes on an "odd-r" grid: odd rows sit half a hex to the right.
// Directions and corner edges share an index, so edge i of a hex borders its neighbour in DIRS[i].

export const SIZE = 10;
const W = Math.sqrt(3) * SIZE;

// E, SE, SW, W, NW, NE
const EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const ODD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];

export function center(col, row) {
  return [W * (col + 0.5 * (row & 1)) + W / 2, SIZE * 1.5 * row + SIZE];
}

export function neighbor(col, row, dir) {
  const [dc, dr] = (row & 1 ? ODD : EVEN)[dir];
  return [col + dc, row + dr];
}

// Corner i sits at angle 60i - 30 degrees; edge i runs from corner i to corner i + 1.
export function corners(x, y, s = SIZE) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    out.push([x + s * Math.cos(a), y + s * Math.sin(a)]);
  }
  return out;
}

export function distance(c1, r1, c2, r2) {
  const x1 = c1 - (r1 - (r1 & 1)) / 2, z1 = r1;
  const x2 = c2 - (r2 - (r2 & 1)) / 2, z2 = r2;
  const dx = x1 - x2, dz = z1 - z2, dy = -dx - dz;
  return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
}

export const HEX_W = W;
