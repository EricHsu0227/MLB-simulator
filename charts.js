// Box Seat Baseball — Under The Hood Standard Version (2026) chart data
// Transcribed from the Tri-Fold charts. Format for fielder charts:
//   [lo, hi, text]  or  [lo, hi, {R: text, L: text}]   (RD = red die, 1-9)
// text: "FLD desc ADVANCE-CODES" e.g. "LF aa R1B(C)->3rd"
(function (G) {
const C = {};

// ---------- HITS ----------
const R1B_HM = 'R1B->Hm C->cd C-->3rd';
C.hits = {
  TP1: { E: [[1,5,'CF'],[6,8,'RF'],[9,9,'LF']] },
  'SNinf': { E: [[1,1,'1B'],[2,4,'2B'],[5,7,'SS'],[8,9,'3B']] },
  DB1: {
    E: [[1,1,'LF dtl OFCK'],[2,2,'LF dtl'],[3,4,'LF otw'],[5,5,'CF ilg'],[6,6,'CF btw'],[7,7,{R:'CF irg',L:'RF irg'}],[8,8,{R:'LF ilg',L:'RF dtl'}],[9,9,'RF otw']],
    R1: [[1,2,'LF dtl R1->cd'],[3,4,'LF otw R1->3rd'],[5,5,'CF ilg R1->Hm'],[6,6,'CF otw '+R1B_HM],[7,7,{R:'CF irg R1->OFCK',L:'RF otw R1->OFCK'}],[8,8,{R:'LF ilg R1->OFCK',L:'RF dtl R1->OFCK'}],[9,9,'RF irg R1->3rd']],
    SP: [[1,2,'LF dtl R1->3rd'],[3,4,'LF btw R1->cd'],[5,5,'CF irg R1->OFCK'],[6,6,'CF btw '+R1B_HM],[7,7,{R:'CF irg '+R1B_HM,L:'RF btw '+R1B_HM}],[8,8,{R:'LF ilg '+R1B_HM,L:'RF irg '+R1B_HM}],[9,9,'RF dtl R1->3rd']]
  },
  DB2: {
    E: [[1,1,'LF dtl'],[2,3,'LF otw'],[4,4,'CF ilg OFCK'],[5,5,'CF btw'],[6,6,'CF irg'],[7,7,'RF dtl'],[8,8,'RF otw'],[9,9,'RF irg']],
    R1: [[1,2,'LF dtl R1->cd'],[3,3,'LF btw R1->3rd'],[4,4,'CF ilg R1->Hm'],[5,5,'CF otw '+R1B_HM],[6,6,'CF irg R1->OFCK'],[7,7,'RF dtl R1->OFCK'],[8,8,'RF otw R1->3rd'],[9,9,'RF irg R1->3rd']],
    SP: [[1,2,'LF dtl R1->3rd'],[3,3,'LF otw R1->cd'],[4,4,'CF irg R1->OFCK'],[5,5,'CF btw '+R1B_HM],[6,6,'CF ilg '+R1B_HM],[7,7,'RF dtl '+R1B_HM],[8,8,'RF otw R1->3rd'],[9,9,'RF irg R1->cd']]
  },
  DB3: {
    E: [[1,1,'RF dtl OFCK'],[2,2,'RF dtl'],[3,4,'RF otw'],[5,5,'CF ilg'],[6,6,'CF btw'],[7,7,{R:'CF irg',L:'RF irg'}],[8,8,{R:'LF ilg',L:'RF dtl'}],[9,9,'LF otw']],
    R1: [[1,2,'RF dtl R1->cd'],[3,4,'RF otw R1->3rd'],[5,5,'CF ilg R1->Hm'],[6,6,'CF otw '+R1B_HM],[7,7,{R:'CF irg R1->OFCK',L:'RF otw R1->OFCK'}],[8,8,{R:'LF ilg R1->OFCK',L:'RF dtl R1->OFCK'}],[9,9,'LF ilg R1->3rd']],
    SP: [[1,2,'RF dtl R1->3rd'],[3,4,'RF btw R1->cd'],[5,5,'CF irg R1->OFCK'],[6,6,'CF btw '+R1B_HM],[7,7,{R:'CF irg '+R1B_HM,L:'RF btw '+R1B_HM}],[8,8,{R:'LF ilg '+R1B_HM,L:'RF irg '+R1B_HM}],[9,9,'LF dtl R1->3rd']]
  },
  SN1: {
    E: [[1,1,'LF bl'],[2,3,'LF av'],[4,4,'LF hd'],[5,5,'CF hs OFCK'],[6,6,'CF av'],[7,7,{R:'CF bl',L:'RF av'}],[8,8,{R:'CF aa',L:'RF hd'}],[9,9,'RF aa']],
    R1: [[1,1,'LF aa R1B(C)->3rd'],[2,3,'LF hd R1->2nd(2nd)'],[4,4,'LF av R1A+(A)->3rd'],[5,5,'CF aa R1B(C)->3rd'],[6,6,'CF hd R1->2nd(2nd)'],[7,7,{R:'CF bl R1->OFCK(A3rd)',L:'RF aa R1A+(A)->3rd'}],[8,8,{R:'CF av R1A+(A)->3rd',L:'RF hd R1->2nd(A+3rd)'}],[9,9,'RF bl R1C(C-)->3rd']],
    SP: [[1,1,'LF aa R2->cd(Hm); R1->2nd(OFCK)'],[2,3,'LF hd R2->cd(Hm); R1->2nd(A+3rd)'],[4,4,'LF av R2->Hm(Hm); R1A(B)->3rd'],[5,5,'CF bl R2->Hm(Hm); R1A+(B)->3rd'],[6,6,'CF av R2->cd(Hm); R1->2nd(A+3rd)'],
         [7,7,{R:'CF aa R2->Hm(Hm); R1A+(A)->3rd',L:'RF av R2->cd(cd); R1->2nd(A+3rd)'}],[8,8,{R:'CF hd R2->cd(cd); R1A+(A)->3rd',L:'RF hd R2->cd(Hm); R1->2nd(A+3rd)'}],[9,9,'RF av R2->cd(Hm); R1B(C)->3rd']]
  },
  SN2: {
    E: [[1,1,'LF bl'],[2,2,'LF av'],[3,3,'LF hd'],[4,4,'CF hs'],[5,5,'CF av'],[6,6,'CF bl'],[7,7,'RF hd OFCK'],[8,8,'RF aa'],[9,9,'RF av']],
    R1: [[1,1,'LF aa R1B(C)->3rd'],[2,2,'LF hd R1->2nd(2nd)'],[3,3,'LF av R1A+(A)->3rd'],[4,4,'CF aa R1B(C)->3rd'],[5,5,'CF hd R1->2nd(2nd)'],[6,6,'CF av R1->OFCK(A3rd)'],[7,7,'RF hd R1->2nd(A+3rd)'],[8,8,'RF bl R1C(C-)->3rd'],[9,9,'RF av R1A(B)->3rd']],
    SP: [[1,1,'LF aa R2->cd(Hm); R1->2nd(OFCK)'],[2,2,'LF hd R2->cd(Hm); R1->2nd(A+3rd)'],[3,3,'LF av R2->Hm(Hm); R1A(B)->3rd'],[4,4,'CF aa R2->Hm(Hm); R1A+(B)->3rd'],[5,5,'CF hd R2->cd(Hm); R1->2nd(A+3rd)'],[6,6,'CF av R2->Hm(Hm); R1A+(A)->3rd'],[7,7,'RF hd R2->cd(Hm); R1->2nd(A+3rd)'],[8,8,'RF bl R2->cd(Hm); R1B(C)->3rd'],[9,9,'RF av R2->cd(Hm); R1A(B)->3rd']]
  },
  SN3: {
    E: [[1,1,'LF hd OFCK'],[2,2,'LF av'],[3,3,'CF hs'],[4,4,'CF av'],[5,5,{R:'CF bl',L:'RF bl'}],[6,6,{R:'CF aa',L:'RF hd'}],[7,8,'RF av'],[9,9,'RF aa']],
    R1: [[1,1,'LF bl R1->2nd(2nd)'],[2,2,'LF aa R1A+(A+)->3rd'],[3,3,'CF bl R1A(B)->3rd'],[4,4,'CF av R1->2nd(A+3rd)'],[5,5,{R:'CF aa R1->OFCK(A3rd)',L:'RF bl R1A+(A+)->3rd'}],[6,6,{R:'CF hd R1->OFCK(A3rd)',L:'RF hd R1A+(A+)->3rd'}],[7,8,'RF av R1B(C)->3rd'],[9,9,'RF bl R1A(B)->3rd']],
    SP: [[1,1,'LF hd R2->cd(cd); R1->2nd(2nd)'],[2,2,'LF av R2->cd(Hm); R1->2nd(A3rd)'],[3,3,'CF aa R2->Hm(Hm); R1B(C)->3rd'],[4,4,'CF hd R2->cd(Hm); R1->2nd(A+3rd)'],
         [5,5,{R:'CF bl R2->Hm(Hm); R1A+(A)->3rd',L:'RF av R2->cd(cd); R1->2nd(A+3rd)'}],[6,6,{R:'CF hd R2->cd(cd); R1A+(A)->3rd',L:'RF hd R2->cd(Hm); R1->2nd(A+3rd)'}],[7,8,'RF aa R2->cd(Hm); R1C(C-)->3rd'],[9,9,'RF bl R2->cd(Hm); R1A->3rd(OFCK)']]
  }
};

// ---------- FLY BALLS ----------
const fb = (a, b, c, d) => [[1, a[1], 'LF'], [a[1] + 1, b[1], 'RF'], [b[1] + 1, c[1], 'CF'], [c[1] + 1, 9, { R: 'RF', L: 'LF' }]];
// helper building [LF,RF,CF,split] by end points
function fly(e1, e2, e3, adv) { // ends of LF, RF, CF ranges
  adv = adv || {};
  const t = (f, k) => f + (adv[k] ? ' ' + adv[k] : '');
  const out = [[1, e1, t('LF', 'LF')], [e1 + 1, e2, t('RF', 'RF')], [e2 + 1, e3, t('CF', 'CF')]];
  if (e3 < 9) out.push([e3 + 1, 9, { R: t('RF', 'RF'), L: t('LF', 'LF') }]);
  return out;
}
const LFSP = { LF: 'R3->Hm', RF: 'R3->Hm; R2->cd', CF: 'R3->Hm; R2A->cd' };
const NFSP = { LF: 'R3->cd', RF: 'R3->cd', CF: 'R3->cd' };
C.flies = {
  DF1: { E: [[1,7,'LF'],[8,8,'RF'],[9,9,'CF']], R1: [[1,6,'LF R1A->cd'],[7,8,'RF R1A->cd'],[9,9,'CF R1->cd']],
         SP: [[1,6,'LF R3->Hm; R2->cd; R1A->cd'],[7,8,'RF R3->Hm; R2->3rd; R1A->cd'],[9,9,'CF R3->Hm; R2->3rd; R1->cd']] },
  DF2: { E: [[1,7,'RF'],[8,8,'LF'],[9,9,'CF']], R1: [[1,6,'RF R1A->cd'],[7,8,'LF R1A->cd'],[9,9,'CF R1->cd']],
         SP: [[1,6,'RF R3->Hm; R2->3rd; R1A->cd'],[7,8,'LF R3->Hm; R2->cd; R1A->cd'],[9,9,'CF R3->Hm; R2->3rd; R1->cd']] },
  LF1: { E: fly(3, 4, 8), R1: fly(3, 4, 8), SP: fly(3, 4, 8, LFSP) },
  LF2: { E: fly(1, 3, 7), R1: fly(1, 3, 7), SP: fly(1, 3, 7, LFSP) },
  LF3: { E: fly(2, 3, 7), R1: fly(2, 3, 7), SP: fly(2, 3, 7, LFSP) },
  LF4: { E: fly(1, 4, 8), R1: fly(1, 4, 8), SP: fly(1, 4, 8, LFSP) },
  NF1: { E: fly(2, 4, 8), R1: fly(2, 4, 8), SP: fly(2, 4, 8, NFSP) },
  NF2: { E: fly(1, 3, 7), R1: fly(1, 3, 7), SP: fly(1, 3, 7, NFSP) },
  NF3: { E: fly(2, 3, 7), R1: fly(2, 3, 7), SP: fly(2, 3, 7, NFSP) },
  SF1: { E: fly(2, 4, 8), R1: fly(2, 4, 8), SP: fly(2, 4, 8) },
  SF2: { E: fly(1, 3, 7), R1: fly(1, 3, 7), SP: fly(1, 3, 7) },
  SF3: { E: fly(2, 3, 7), R1: fly(2, 3, 7), SP: fly(2, 3, 7) }
};
C.flies.NF4 = C.flies.NF1; C.flies.SF4 = C.flies.SF1;

// Deep Fly Ck (RD): total HR rating -> red die needed ("r" = reroll on exact)
C.dfck = { 10: 'HR', 9: '0r', 8: '1', 7: '1r', 6: '2', 5: '2r', 4: '3', 3: '3r', 2: '4', 1: '4r', 0: '5', '-1': '5r', '-2': '6', '-3': '6r', '-4': '7', '-5': '7r', '-6': '8', '-7': '8r', '-8': '9', '-9': '9r', '-10': 'NoHR' };

// ---------- GROUND BALLS / POPS / LINE OUTS (fielders) ----------
C.gb = {
  GB1: { E: [[1,3,'3B'],[4,5,'SS'],[6,6,'2B'],[7,7,'1B'],[8,8,{R:'SS',L:'1B*'}],[9,9,{R:'3B',L:'2B'}]],
         R1: [[1,2,'3B'],[3,3,'3B*'],[4,4,'SS*'],[5,5,'SS'],[6,6,'2B*'],[7,7,'1B*'],[8,8,{R:'SS*',L:'1B'}],[9,9,{R:'3B*',L:'2B'}]],
         SP: [[1,2,'3B*'],[3,3,'3B**'],[4,4,'SS*'],[5,5,'SS'],[6,6,'2B'],[7,7,'1B'],[8,8,{R:'SS*',L:'1B*'}],[9,9,{R:'3B',L:'2B'}]] },
  GB2: { E: [[1,2,'3B'],[3,4,'SS'],[5,6,'2B'],[7,7,'1B'],[8,8,{R:'SS',L:'1B*'}],[9,9,{R:'3B',L:'2B'}]],
         R1: [[1,1,'3B*'],[2,2,'3B'],[3,3,'SS*'],[4,4,'SS'],[5,6,'2B'],[7,7,'1B'],[8,8,{R:'SS*',L:'1B*'}],[9,9,{R:'3B',L:'2B*'}]],
         SP: [[1,1,'3B'],[2,2,'3B'],[3,3,'SS*'],[4,4,'SS'],[5,6,'2B'],[7,7,'1B*'],[8,8,{R:'SS*',L:'1B'}],[9,9,{R:'3B**',L:'2B*'}]] },
  GB3: { E: [[1,1,'3B'],[2,3,'SS'],[4,6,'2B'],[7,7,'1B'],[8,8,{R:'SS',L:'1B*'}],[9,9,{R:'3B',L:'2B'}]],
         R1: [[1,1,'3B*'],[2,2,'SS'],[3,3,'SS*'],[4,5,'2B'],[6,6,'2B*'],[7,7,'1B*'],[8,8,{R:'SS*',L:'1B'}],[9,9,{R:'3B',L:'2B'}]],
         SP: [[1,1,'3B'],[2,2,'SS'],[3,3,'SS*'],[4,5,'2B'],[6,6,'2B'],[7,7,'1B'],[8,8,{R:'SS*',L:'1B*'}],[9,9,{R:'3B**',L:'2B*'}]] },
  GB4: { E: [[1,1,'3B'],[2,2,'SS'],[3,5,'2B'],[6,6,'1B*'],[7,7,'1B'],[8,8,{R:'SS',L:'1B'}],[9,9,{R:'3B',L:'2B'}]],
         R1: [[1,1,'3B*'],[2,2,'SS*'],[3,4,'2B'],[5,5,'2B'],[6,6,'1B'],[7,7,'1B'],[8,8,{R:'SS',L:'1B*'}],[9,9,{R:'3B',L:'2B*'}]],
         SP: [[1,1,'3B'],[2,2,'SS*'],[3,4,'2B'],[5,5,'2B'],[6,6,'1B'],[7,7,'1B'],[8,8,{R:'SS',L:'1B*'}],[9,9,{R:'3B**',L:'2B*'}]] },
  PU1: { E: [[1,1,'3B'],[2,3,'SS'],[4,7,'2B'],[8,9,'1B']] },
  PU2: { E: [[1,2,'3B'],[3,6,'SS'],[7,8,'2B'],[9,9,'1B']] },
  FP1: { E: [[1,1,'3B'],[2,2,'2B'],[3,7,'1B'],[8,9,'C']], R1: [[1,1,'3B'],[2,2,'SS'],[3,7,'1B'],[8,9,'C']], SP: [[1,1,'3B'],[2,2,'SS'],[3,7,'1B'],[8,9,'C']] },
  FP2: { E: [[1,5,'3B'],[6,6,'SS'],[7,7,'1B'],[8,9,'C']] },
  LO1: { E: [[1,1,'3B'],[2,3,'SS'],[4,7,'2B'],[8,9,'1B']] },
  LO2: { E: [[1,2,'3B'],[3,6,'SS'],[7,8,'2B'],[9,9,'1B']] }
};

// DP checks (orig GD + pivot DP rating). value = max adjusted GD for DP; 'DP' always; null never
C.dpHG = { 'A+': { '3B': 4, SS: 6, '2B': 5, '1B': 2 }, A: { '3B': 7, SS: 9, '2B': 8, '1B': 5 }, B: { '3B': 9, SS: 9, '2B': 9, '1B': 7 }, C: 'DP', 'C-': 'DP' };
C.dpRG = { 'A+': { '3B': null, SS: -1, '2B': null, '1B': null }, A: { '3B': 0, SS: 2, '2B': 1, '1B': null }, B: { '3B': 4, SS: 6, '2B': 5, '1B': 2 },
           C: { '3B': 7, SS: 9, '2B': 8, '1B': 5 }, 'C-': { '3B': 9, SS: 'DP', '2B': 'DP', '1B': 7 } };
// SG Home Coaches Decision (RD): safe if RD >= value
C.sgHome = { 'A+': 1, A: 3, B: 5, C: 7, 'C-': 9 };
// Line out double play check (orig BD). For two-runner sits: [first runner range, second runner range]
C.loDP = {
  '3B': { '1': [1, 1], '2': [1, 2], '3': [1, 1], '12': [null, [1, 2]], '13': [[1, 1], null], '23': [[1, 1], null], '123': [[1, 1], null] },
  SS: { '1': [1, 1], '2': [1, 1], '3': null, '12': [null, [1, 2]], '13': [[1, 1], null], '23': [null, [1, 1]], '123': [[1, 1], null] },
  '2B': { '1': [1, 3], '2': [1, 2], '3': null, '12': [[1, 1], [2, 3]], '13': null, '23': [[1, 1], null], '123': [null, [1, 1]] },
  '1B': { '1': [1, 4], '2': [1, 1], '3': null, '12': [[1, 3], [4, 4]], '13': [[1, 4], null], '23': [null, [1, 1]], '123': [[1, 2], [3, 3]] }
};
// Infield-in hit check (orig BD)
C.iihc = { HG: [4, 6], LO: [5, 6] };

// ---------- COACH'S DECISION CHARTS (RD) ----------
// value: [A,B,C,D] arm columns; each = min RD to be safe, 'Adv' automatic, null = no advance
const N_ = null;
C.cd = {
  sgl2HmCorner: { 'A+': [3, 3, 1, 1], A: [5, 4, 3, 2], B: [9, 8, 6, 5], C: [N_, N_, 9, 8], 'C-': [N_, N_, N_, 9] },
  sgl2HmCF: { 'A+': ['Adv', 'Adv', 'Adv', 'Adv'], A: [1, 1, 'Adv', 'Adv'], B: [3, 3, 1, 'Adv'], C: [7, 6, 4, 3], 'C-': [9, 8, 7, 6] },
  dbl1Hm01: { 'A+': [3, 2, 1, 'Adv'], A: [5, 4, 3, 2], B: [7, 6, 5, 4], C: [N_, 9, 8, 7], 'C-': [N_, N_, N_, 9] },
  dbl1Hm2: { 'A+': [1, 'Adv', 'Adv', 'Adv'], A: [3, 2, 1, 'Adv'], B: [5, 4, 3, 2], C: [8, 7, 6, 5], 'C-': [N_, 9, 8, 7] },
  fb: { 'A+': [2, 1, 'Adv', 'Adv'], A: [4, 3, 1, 'Adv'], B: [6, 5, 4, 3], C: [8, 7, 6, 5], 'C-': [N_, 9, 8, 7] },
  ofck1to3LC: { 'A+': [5, 4, 3, 2], A: [7, 6, 4, 3], B: [9, 8, 6, 5], C: [N_, 9, 8, 7], 'C-': [N_, N_, N_, N_] },
  ofck1to3RF: { 'A+': [2, 1, 'Adv', 'Adv'], A: [3, 2, 1, 'Adv'], B: [6, 5, 4, 3], C: [9, 8, 7, 6], 'C-': [N_, N_, N_, N_] }
};
// Back base runner advance on fly ball CD plays: [fbType, sit, fielder, runner, minBR]
C.backFB = [
  ['DF', '12', 'LF', 1, 'A+'], ['DF', '123', 'LF', 1, 'B'], ['LF', '12', 'CF', 1, 'B'], ['LF', '12', 'RF', 1, 'A'],
  ['NF', '13', 'LF', 1, 'B'], ['NF', '13', 'CF', 1, 'B'], ['NF', '13', 'RF', 1, 'B'],
  ['NF', '123', 'LF', 2, 'A+', 1, 'A'], ['NF', '123', 'CF', 2, 'A', 1, 'B'], ['NF', '123', 'RF', 2, 'B', 1, 'B'],
  ['NF', '23', 'LF', 2, 'A+'], ['NF', '23', 'CF', 2, 'A'], ['NF', '23', 'RF', 2, 'B']
];
// Trailing BRs adv on CDs (if play at plate) by base running style
C.trailing = { N: { all: [5, 7], btr: [8, 9] }, A: { all: [1, 5], btr: [6, 9] }, C: { all: [9, 9], btr: null } };
C.trailBtr = { 'A+': 2, A: 4, B: 8 };

// ---------- OF CK ----------
// [lo, hi, sngQual, sngAdv, dblQual, dblAdv]   qual: 'MP' | 'Arm' | n (<n)
C.ofck = [
  [84, 99, 'MP', 'Z', 2, 'Z'], [64, 83, 'MP', 'norm', 2, 'Z'], [62, 63, 'MP', 'Z', 'Arm', 'Z'], [59, 61, 'MP', 'norm', 'Arm', 'Z'],
  [52, 58, 'Arm', 'norm', 'Arm', 'Z'], [51, 51, 'Arm', 'norm', 2, 'Z'], [49, 50, 'Arm', 'norm', 3, 'Z'], [45, 48, 4, 'norm', 2, 'Z'],
  [28, 44, 4, 'norm', 3, 'Z'], [25, 27, 4, 'norm', 'Arm', 'Z'], [19, 24, 3, 'norm', 3, 'Z'], [3, 18, 3, 'Z', 3, 'Z'],
  [1, 2, 3, 'Z', 'Arm', 'Z'], [0, 0, 3, 'norm', 'Arm', 'Z']
];
// ARM chart: min RD for DBL, min RD for SGL (else out at 2nd)
C.ofckArm = { A: [8, 4], B: [6, 3], C: [4, 2], D: [2, 1] };

// ---------- RANGE ----------
// Range check (orig GR 0-99) -> [req, bp]; req: 'MP' | 'DNMP' | n (fielder F must be < n)
C.range = (function () {
  const t = new Array(100);
  const set = (lo, hi, req, bp) => { for (let i = lo; i <= hi; i++) t[i] = [req, bp === undefined ? null : bp]; };
  set(99, 99, 'MP', -4); set(98, 98, 'DNMP', 4); set(97, 97, 'DNMP', -3); set(96, 96, 'MP', 3); set(95, 95, 'MP', -2); set(94, 94, 'DNMP', 2);
  set(93, 93, 'DNMP', -1); set(92, 92, 'MP', 1); set(91, 91, 'DNMP', 0); set(90, 90, 'DNMP'); set(80, 89, 'MP'); set(76, 79, 4); set(72, 75, 2);
  set(71, 71, 'DNMP', -4); set(70, 70, 'MP', 4); set(69, 69, 'MP', -3); set(68, 68, 'DNMP', 3); set(67, 67, 'DNMP', -2); set(66, 66, 'MP', 2);
  set(65, 65, 'MP', -1); set(64, 64, 'DNMP', 1); set(63, 63, 'MP', 0); set(61, 62, 'DNMP'); set(52, 60, 4); set(43, 51, 'MP');
  set(42, 42, 4, -3); set(41, 41, 4, 3); set(40, 40, 4, -2); set(39, 39, 4, 2); set(38, 38, 4, -1); set(37, 37, 4, 1); set(21, 36, 3);
  set(20, 20, 3, -4); set(19, 19, 3, 4); set(18, 18, 3, -1); set(17, 17, 3, 1); set(16, 16, 3, 0); set(15, 15, 3, 0); set(6, 14, 2);
  set(5, 5, 2, -4); set(4, 4, 2, 4); set(3, 3, 2, -3); set(2, 2, 2, 3); set(1, 1, 2, -2); set(0, 0, 2, 2);
  return t;
})();
C.bpFieldAdj = { 1: 2, 2: 1, 3: -1, 4: -2 };
// Fielder for GB single range checks: field -> batterSide -> power -> infielder
C.gbSingleFielder = {
  LF: { R: { P: '3B', N: 'SS', W: 'SS' }, L: { P: 'SS', N: 'SS', W: '3B' } },
  CF: { R: { P: 'SS', N: 'SS', W: '2B' }, L: { P: '2B', N: '2B', W: 'SS' } },
  RF: { R: { P: '2B', N: '2B', W: '1B' }, L: { P: '1B', N: '2B', W: '2B' } }
};
// HG/RG turned into SN(gb) after SS/2B range check: fielding outfielder by orig BD
C.gbSingleOF = { SS: { R: ['LF', 'CF'], L: ['CF', 'LF'] }, '2B': { R: ['CF', 'RF'], L: ['RF', 'CF'] } };
C.tripleCheck = { 'A+': [0, 9], A: [2, 9], B: [0, 2] };
C.hrCheck = { P: [0, 9], N: [0, 4], W: [0, 0] };

// ---------- ERRORS ----------
// [Erating, WB, GD] thresholds; required = max E# with (WB,GD) <= roll
C.err = {
  HIT: [[20, 66, 0], [19, 65, 4], [18, 64, 4], [17, 63, 4], [16, 62, 4], [15, 61, 4], [14, 56, 7], [13, 55, 7], [12, 54, 7], [11, 53, 7], [10, 53, 0], [9, 52, 0], [8, 51, 0], [7, 46, 0], [6, 45, 7], [5, 45, 0], [4, 44, 4], [3, 44, 0], [2, 43, 4], [1, 42, 7], [0, 11, 0]],
  FB: [[18, 66, 0], [17, 65, 0], [16, 64, 7], [15, 64, 0], [14, 63, 7], [13, 63, 0], [12, 62, 7], [11, 62, 0], [10, 61, 4], [9, 61, 0], [8, 56, 7], [7, 56, 4], [6, 55, 7], [5, 55, 0], [4, 54, 7], [3, 54, 0], [2, 53, 7], [1, 53, 0], [0, 11, 0]],
  GB: [[20, 55, 7], [19, 52, 7], [18, 51, 4], [17, 44, 1], [16, 42, 4], [15, 35, 4], [14, 34, 4], [13, 33, 4], [12, 26, 4], [11, 24, 4], [10, 21, 4], [9, 15, 4], [8, 12, 1], [7, 11, 1]],
  POP: [[20, 66, 1], [18, 65, 4], [15, 64, 4], [10, 63, 4], [8, 62, 4], [4, 61, 4], [2, 15, 1], [1, 12, 1], [0, 11, 1]]
};
C.errSTL = [[20, 95], [19, 90], [18, 85], [17, 80], [16, 75], [15, 70], [14, 65], [13, 60], [12, 55], [11, 50], [10, 45], [9, 40], [8, 35], [7, 30], [6, 25], [5, 20], [4, 15], [3, 10], [2, 5], [1, 0]];

// ---------- MISC ----------
C.pdie = ['R', '-3', '-2', '-1', '0', '1', '2D', '3E', 'A', 'B'];
C.pdieHBP = ['Rng', '(-3)', '(-2)', '(-1)', '(0)', '(1)', '(2)*D', '(3)*E', '*A', '*B'];
C.specOut = ['HG3', 'RG2', 'RG2', 'RG2', 'RG3', 'LF2', 'NF1', 'NF1', 'NF1', 'SF3'];
// Scoring position hit chart (WBD): [lo, hi, result]
C.sph = {
  W: [[11, 11, 'HBP'], [12, 53, 'SN2'], [54, 64, 'DB2'], [65, 65, 'TP1'], [66, 66, 'HR']],
  N: [[11, 11, 'HBP'], [12, 46, 'SN2'], [51, 63, 'DB2'], [64, 66, 'HR']],
  P: [[11, 11, 'HBP'], [12, 44, 'SN2'], [45, 61, 'DB2'], [62, 66, 'HR']]
};
// Low average batter hit check chart (WBD): rating -> symbol -> [lo,hi]
C.lowAvg = (function () {
  const cols = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
  const rows = {
    R: [null, null, [11, 21], null, [11, 16], null, [11, 15], null, [11, 14]],
    '-3': [null, null, null, null, null, null, null, [11, 15], [15, 23]],
    '-2': [null, null, null, null, null, [11, 16], [16, 24], [16, 24], [24, 31]],
    '-1': [null, null, null, [11, 21], [21, 26], [21, 26], [25, 33], [25, 33], [32, 36]],
    '0': [[11, 23], [11, 23], [22, 32], [22, 32], [31, 36], [31, 36], [34, 42], [34, 42], [41, 44]],
    '1': [[24, 36], [24, 36], [33, 43], [33, 43], [41, 46], [41, 46], [43, 51], [43, 51], [45, 53]],
    '2': [[41, 53], [41, 53], [44, 54], [44, 54], [51, 56], [51, 56], [52, 56], [52, 56], [54, 61]],
    '3': [[54, 66], [54, 66], [55, 66], [55, 66], [61, 66], [61, 66], [61, 66], [61, 66], [62, 66]]
  };
  return { cols, rows };
})();
// Fatigued pitcher (Level 2): fatigue -> max RD that lets batter result stand
C.fatigue2 = [[0, -1, 0], [-1.0001, -2, 2], [-2.0001, -3, 4], [-3.0001, -4, 7]];
// Rare play chart (WBD)
C.rare = [[11, 16, 'WILD'], [21, 21, 'SF-LF'], [22, 22, 'SF-CF'], [23, 23, 'SF-RF'], [24, 24, 'HG-P-E'], [25, 42, 'HG-P'], [43, 46, 'RG-P'], [51, 51, 'SG-P-E'], [52, 61, 'SG-P'], [62, 62, 'LO-P'], [63, 63, 'SG-C'], [64, 64, 'PU-C'], [65, 65, 'FNF-LF'], [66, 66, 'FNF-RF']];
// PB/WP check: catcher F -> max (RD + pitcher WP) for wild pitch / passed ball
C.pbwp = { 1: 3, 2: 5, 3: 7, 4: 9 };

// ---------- STOLEN BASES ----------
C.jump2 = { '-3': null, '-2': 12, '-1': 15, 0: 23, 1: 35, 2: 43, 3: 51, 4: 54, 5: 63, 6: 65 };
C.jump3 = { '-3': null, '-2': 11, '-1': 12, 0: 14, 1: 21, 2: 23, 3: 25, 4: 31, 5: 32, 6: 34 };
// Stolen base attempt (modern): SBR total -> max WB for safe steal (16..)
C.sbModern = { '-5': 16, '-4.5': 23, '-4': 25, '-3.5': 31, '-3': 32, '-2.5': 34, '-2': 36, '-1.5': 41, '-1': 43, '-0.5': 45, '0': 51, '0.5': 52, '1': 54, '1.5': 56, '2': 61, '2.5': 63, '3': 64 };
C.catcherArm = { A: -2, B: -1, C: 0, D: 1, E: 2 };
C.pickoff = { Ex: [9, null], Vg: [7, 8], Fr: [4, 5], Md: [1, 2], Pr: [-1, 0] }; // [PO max RD, balk min RD]
// Auto steal attempt (orig RD): RD -> required combined SBF  (2nd base). 9: by BD L/M/H
C.auto2 = { 0: -1, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, '9L': 8, '9M': null, '9H': -2 };
C.auto3 = { '0L': -2, '0M': -1, '0H': 0, '1L': 1, '1M': 2, '1H': 3, '2L': 4, '2M': 5, '2H': 6, '3L': 7, '3M': null, '3H': null };

// ---------- BUNTS ----------
C.sac = {
  Ex: [[11, 12, 'WILD'], [13, 63, 'SAC'], [64, 65, 'LEAD'], [66, 66, 'PDP']],
  Vg: [[11, 12, 'WILD'], [13, 54, 'SAC'], [55, 62, 'LEAD'], [63, 63, '3BF'], [64, 64, '1BF'], [65, 65, 'FORCE'], [66, 66, 'PDP']],
  Fr: [[11, 12, 'WILD'], [13, 46, 'SAC'], [51, 54, 'LEAD'], [55, 55, '3BF'], [56, 56, '1BF'], [61, 63, 'FORCE'], [64, 65, 'K'], [66, 66, 'PDP']],
  Md: [[11, 12, 'WILD'], [13, 41, 'SAC'], [42, 45, 'LEAD'], [46, 46, '3BF'], [51, 51, '1BF'], [52, 62, 'FORCE'], [63, 65, 'K'], [66, 66, 'PDP']],
  Pr: [[11, 11, 'WILD'], [12, 16, 'SAC'], [21, 24, 'LEAD'], [25, 25, '3BF'], [26, 26, '1BF'], [31, 61, 'FORCE'], [62, 65, 'K'], [66, 66, 'PDP']]
};
C.squeeze = {
  Ex: [[11, 43, 'SAC'], [44, 53, 'MISS'], [54, 55, 'HOME'], [56, 64, 'K'], [65, 66, 'DP']],
  Vg: [[11, 41, 'SAC'], [42, 53, 'MISS'], [54, 55, 'HOME'], [56, 64, 'K'], [65, 66, 'DP']],
  Fr: [[11, 35, 'SAC'], [36, 53, 'MISS'], [54, 55, 'HOME'], [56, 64, 'K'], [65, 66, 'DP']],
  Md: [[11, 33, 'SAC'], [34, 53, 'MISS'], [54, 55, 'HOME'], [56, 64, 'K'], [65, 66, 'DP']],
  Pr: [[11, 31, 'SAC'], [34, 53, 'MISS'], [54, 55, 'HOME'], [56, 64, 'K'], [65, 66, 'DP']]
};
C.leadBR = { 'A+': 0, A: 2, B: 5, C: 8, 'C-': 99 };
C.buntField = { 4: 0, 3: 3, 2: 7, 1: 99 }; // F rating -> min RD for sacrifice (99 = force out)
C.buntFielder = ['3B', 'P', 'P', 'P', 'P', 'P', '1B', 'C', 'C', 'C'];

// ---------- ADVANCED INFIELD SINGLES ----------
C.infSingle = {
  '3B': ['A', 'B', 'C', 'D', 'D', 'D', 'E', 'E', 'F', 'G'],
  SS: ['H', 'I', 'I', 'J', 'J', 'D', 'D', 'E', 'K', 'L'],
  '2B': ['M', 'M', 'N', 'O', 'P', 'D', 'D', 'L', 'K', 'Q'],
  '1B': ['G', 'M', 'D', 'D', 'B', 'B', 'B', 'B', 'B', 'A']
};
C.infDesc = {
  A: ["Slow roller that fielder doesn't pick up", '*'], B: ['Slow roller and fielder has no play', '*'], C: ["Slow roller and fielder's throw is too late at first", '*'],
  D: ["Grounder smashed off fielder's body and retrieved in shallow OF", '**'], E: ["High chopper and fielder's throw is too late at first", '*'], F: ['High chopper and fielder has no play', '*'],
  G: ["Hard grounder down the line that's knocked down and no play", '*+'], H: ['Grounder to left side deep into the hole that is only deflected', '*'],
  I: ["Grounder to left side deep into the hole and fielder's throw is late", '*'], J: ['Grounder to left side deep into the hole - fielder makes no throw', '*'],
  K: ["High chopper over mound and fielder's throw is too late at first", '*'], L: ['Hard grounder up the middle that can only be knocked down', '*+'],
  M: ['Grounder to right side into the hole that is only deflected', '***'], N: ['Hard grounder up the middle and no throw made', '*'],
  O: ['Hard grounder up the middle and throw is offline and late', '*'], P: ['Hard grounder up the middle and throw is late', '*'], Q: ['High chopper over the mound and there is no play', '*']
};

// ---------- WEATHER ----------
C.wxAdj = [-4, -3, -2, -1, 0, 0, 1, 2, 3, 4];
C.windDir = { 1: 'Out to LF', 2: 'Out to CF', 3: 'Out to RF', 4: 'L to R', 5: 'In from LF', 6: 'In from CF', 7: 'In from RF', 8: 'R to L' };
C.retroWind = { tolf: 1, tocf: 2, torf: 3, ltor: 4, fromlf: 5, fromcf: 6, fromrf: 7, rtol: 8 };

C.BRORD = { 'A+': 5, A: 4, B: 3, C: 2, 'C-': 1 };
G.BSB_CHARTS = C;
})(typeof window !== 'undefined' ? window : globalThis);
