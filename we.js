// Win expectancy (home team) from simulated Box Seat run distributions
(function (G) {
const F = {"0":[0.7124,0.16,0.0632,0.0312,0.0184,0.0108,0.0024,0.0008,0,0,0.0004,0,0,0.0004,0],"1":[0.5984,0.1604,0.1112,0.0608,0.0372,0.0168,0.0072,0.0044,0.002,0.0012,0.0004,0,0,0,0],"2":[0.4192,0.2976,0.1508,0.0672,0.0344,0.02,0.0056,0.0024,0.0016,0,0.0008,0.0004,0,0,0],"3":[0.4072,0.228,0.13,0.1248,0.0624,0.0272,0.008,0.0076,0.0024,0.0008,0.0008,0.0008,0,0,0],"4":[0.1784,0.5344,0.148,0.0756,0.0376,0.0164,0.006,0.002,0.0012,0,0.0004,0,0,0,0],"5":[0.1648,0.4388,0.146,0.1256,0.068,0.0324,0.0136,0.0072,0.002,0.0012,0.0004,0,0,0,0],"6":[0.1652,0.2796,0.278,0.1532,0.064,0.0328,0.0124,0.01,0.0028,0.0016,0.0004,0,0,0,0],"7":[0.1516,0.272,0.2072,0.1308,0.1104,0.0652,0.0328,0.0144,0.0096,0.0028,0.0024,0.0004,0.0004,0,0],"8":[0.8132,0.1108,0.0484,0.016,0.0096,0.0012,0,0.0008,0,0,0,0,0,0,0],"9":[0.728,0.112,0.0876,0.0432,0.0148,0.0092,0.004,0.0004,0.0008,0,0,0,0,0,0],"10":[0.5744,0.2428,0.102,0.0484,0.02,0.0068,0.0032,0.0016,0.0004,0.0004,0,0,0,0,0],"11":[0.586,0.1652,0.0824,0.0904,0.048,0.0176,0.008,0.0008,0.0004,0.0008,0.0004,0,0,0,0],"12":[0.3472,0.4764,0.1072,0.0436,0.0168,0.004,0.0032,0.0016,0,0,0,0,0,0,0],"13":[0.3764,0.3412,0.1144,0.0964,0.0408,0.0192,0.0048,0.0048,0.0012,0.0004,0.0004,0,0,0,0],"14":[0.3156,0.2916,0.2228,0.094,0.0428,0.0176,0.0072,0.0044,0.0028,0.0008,0.0004,0,0,0,0],"15":[0.3248,0.2588,0.1596,0.0908,0.0896,0.0452,0.0184,0.01,0.0028,0,0,0,0,0,0],"16":[0.9232,0.0524,0.0172,0.0052,0.0004,0.0004,0.0008,0.0004,0,0,0,0,0,0,0],"17":[0.862,0.0632,0.0512,0.0148,0.0048,0.002,0.0016,0.0004,0,0,0,0,0,0,0],"18":[0.718,0.1896,0.0624,0.0212,0.0068,0.0004,0.0016,0,0,0,0,0,0,0,0],"19":[0.7212,0.1336,0.0592,0.0536,0.022,0.0064,0.0024,0.0016,0,0,0,0,0,0,0],"20":[0.7104,0.2052,0.0552,0.0204,0.0056,0.002,0.0012,0,0,0,0,0,0,0,0],"21":[0.7008,0.1496,0.0596,0.058,0.022,0.0072,0.002,0.0008,0,0,0,0,0,0,0],"22":[0.6908,0.0364,0.19,0.0532,0.0192,0.0076,0.0016,0.0004,0.0004,0.0004,0,0,0,0,0],"23":[0.6376,0.0816,0.1348,0.0468,0.0688,0.014,0.0108,0.0032,0.002,0.0004,0,0,0,0,0]}; // key outs*8+bases (bit0=1st,bit1=2nd,bit2=3rd) -> P(runs k) rest of half-inning
const MAXI = 15, DMAX = 25;
const f0 = F[0], fx = F[2]; // start of half; extra innings start with runner on 2nd
const V = {}; // V[inn][half][diff+DMAX] at START of half (diff = home - away)
const clamp = (d) => Math.max(-DMAX, Math.min(DMAX, d));
function startDist(inn, auto) { return inn >= 10 && auto ? fx : f0; }
function get(inn, half, diff, auto) {
  if (inn > MAXI) inn = MAXI;
  const k = inn + ':' + half + ':' + (auto ? 1 : 0);
  return V[k][clamp(diff) + DMAX];
}
function build(auto) {
  for (let inn = MAXI; inn >= 1; inn--) {
    for (let half = 1; half >= 0; half--) {
      const arr = new Array(2 * DMAX + 1);
      for (let d = -DMAX; d <= DMAX; d++) arr[d + DMAX] = halfWE(inn, half, d, startDist(inn, auto), auto);
      V[inn + ':' + half + ':' + (auto ? 1 : 0)] = arr;
    }
  }
}
function nextAfterHalf(inn, half, d, auto) {
  // state after the half ends with diff d
  if (half === 0) { if (inn >= 9 && d > 0) return 1; return inn > MAXI - 1 && half === 0 ? approxBottom(inn, d, auto) : getSafe(inn, 1, d, auto); }
  if (inn >= 9 && d !== 0) return d > 0 ? 1 : 0;
  return getSafe(inn + 1, 0, d, auto);
}
function approxBottom(inn, d, auto) { return getSafe(Math.min(inn, MAXI), 1, d, auto); }
function getSafe(inn, half, d, auto) { const ii = Math.min(inn, MAXI); const k = ii + ':' + half + ':' + (auto ? 1 : 0); if (!V[k]) return d > 0 ? 0.6 : d < 0 ? 0.4 : 0.5; return V[k][clamp(d) + DMAX]; }
function halfWE(inn, half, d, dist, auto) {
  let p = 0;
  for (let k = 0; k < dist.length; k++) {
    if (!dist[k]) continue;
    if (half === 0) p += dist[k] * nextAfterHalf(inn, 0, d - k, auto);
    else {
      const nd = d + k;
      if (inn >= 9 && nd > 0) p += dist[k];
      else p += dist[k] * nextAfterHalf(inn, 1, nd, auto);
    }
  }
  return p;
}
// iterate a few times so extra-inning values converge (MAXI refers to itself)
for (let it = 0; it < 4; it++) { build(true); build(false); }
function we(st) {
  // st: {inning, half, outs, bases:[bool,bool,bool], diff (home-away), over, winner, auto}
  if (st.over) return st.winner === 1 ? 1 : st.winner === 0 ? 0 : 0.5;
  const auto = st.auto !== false;
  const key = Math.min(2, st.outs) * 8 + (st.bases[0] ? 1 : 0) + (st.bases[1] ? 2 : 0) + (st.bases[2] ? 4 : 0);
  return halfWE(st.inning, st.half, st.diff, F[key], auto);
}
G.BSB_WE = we;
})(typeof window !== 'undefined' ? window : globalThis);
