// ============================================================
// geometry.ts — hang so kich thuoc + toan hoc chuyen dong dung chung.
// Moi toa do la tuyet doi trong khung 1920x1080. Tinh toan thuan tuy
// (khong phu thuoc DOM/ref) de ket qua on dinh khi render theo tung frame.
// ============================================================

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const FPS = 30;
export const DURATION_IN_FRAMES = 720; // 24s @ 30fps

export const SAFE_MARGIN = 80; // noi dung quan trong cach mep >= 80px

// ---- Hai khu vuc bo cuc: trai ~42%, phai ~58% (tren vung an toan) ----
export const LEFT_PANEL: Box = {
  x: SAFE_MARGIN,
  y: SAFE_MARGIN,
  width: 740,
  height: VIDEO_HEIGHT - SAFE_MARGIN * 2,
};

export const RIGHT_PANEL: Box = {
  x: 880,
  y: SAFE_MARGIN,
  width: 960,
  height: VIDEO_HEIGHT - SAFE_MARGIN * 2,
};

// ---- Cac card/node trong khu vuc phai (pipeline RAG) ----
export const NODE1_RETRIEVAL: Box = { x: 920, y: 130, width: 300, height: 130 };
export const NODE2_RERANK: Box = { x: 920, y: 470, width: 300, height: 130 };
export const CONTEXT_BUILDER: Box = { x: 1300, y: 460, width: 500, height: 210 };
export const LLM_PROCESSOR: Box = { x: 1120, y: 740, width: 420, height: 210 };

// y = 126 (khong phai 110) de chua nhan "MINH HOA" co dinh o goc tren ben phai
// (nhan chiem khoang 78–115px); dat 110 se bi nhan de len hang the tai lieu dau tien.
export const DOC_GRID_ORIGIN: Point = { x: 1300, y: 126 };
export const DOC_CARD_SIZE = { width: 155, height: 88 };
export const DOC_GRID_GAP = 20;
export const DOC_GRID_COLS = 3;

export const docPosition = (index: number): Box => {
  const col = index % DOC_GRID_COLS;
  const row = Math.floor(index / DOC_GRID_COLS);
  return {
    x: DOC_GRID_ORIGIN.x + col * (DOC_CARD_SIZE.width + DOC_GRID_GAP),
    y: DOC_GRID_ORIGIN.y + row * (DOC_CARD_SIZE.height + DOC_GRID_GAP),
    width: DOC_CARD_SIZE.width,
    height: DOC_CARD_SIZE.height,
  };
};

export const center = (box: Box): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

// Diem "cua ra" cua khung chat, noi goi du lieu cau hoi xuat phat
export const CHAT_EXIT_POINT: Point = { x: LEFT_PANEL.x + LEFT_PANEL.width, y: 560 };

// ---- Cac diem neo co dinh dung cho duong noi (chon canh, khong chon tam,
// de duong ke khong ve xuyen vao giua card) ----
export const ANCHORS = {
  node1Left: { x: NODE1_RETRIEVAL.x, y: center(NODE1_RETRIEVAL).y },
  node1Right: { x: NODE1_RETRIEVAL.x + NODE1_RETRIEVAL.width, y: center(NODE1_RETRIEVAL).y },
  docClusterLeft: { x: DOC_GRID_ORIGIN.x, y: DOC_GRID_ORIGIN.y + 100 }, // giua 2 hang the
  node2Top: { x: center(NODE2_RERANK).x, y: NODE2_RERANK.y },
  node2Right: { x: NODE2_RERANK.x + NODE2_RERANK.width, y: center(NODE2_RERANK).y },
  contextLeft: { x: CONTEXT_BUILDER.x, y: center(CONTEXT_BUILDER).y },
  contextBottom: { x: center(CONTEXT_BUILDER).x, y: CONTEXT_BUILDER.y + CONTEXT_BUILDER.height },
  llmTop: { x: center(LLM_PROCESSOR).x, y: LLM_PROCESSOR.y },
  llmCenter: center(LLM_PROCESSOR),
} as const;

// ============================================================
// Toan hoc Bezier bac 2 — dung chung cho ca duong noi (RetrievalBeam)
// va goi du lieu (MovingDataPacket) de hai thanh phan luon khop quy dao.
// Thuan tuy theo tham so t (0..1) => tinh lai on dinh o moi frame.
// ============================================================
export const quadraticPoint = (t: number, p0: Point, p1: Point, p2: Point): Point => {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
};

export const quadraticPathD = (p0: Point, p1: Point, p2: Point): string =>
  `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;

// Diem dieu khien mac dinh: trung diem p0-p2, day lech theo phuong vuong goc
// mot ty le "bend" de tao duong cong nhe (khong dung gradient/3D, chi la duong 2D).
export const autoControlPoint = (p0: Point, p2: Point, bend = 0.16): Point => {
  const mx = (p0.x + p2.x) / 2;
  const my = (p0.y + p2.y) / 2;
  const dx = p2.x - p0.x;
  const dy = p2.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return { x: mx + nx * len * bend, y: my + ny * len * bend };
};

// Uoc luong do dai duong cong (bang do dai da giac dieu khien, >= do dai cong thuc te)
// dung de dieu khien stroke-dasharray/offset khi "ve" duong noi — khong can do DOM.
export const approxCurveLength = (p0: Point, p1: Point, p2: Point): number =>
  Math.hypot(p1.x - p0.x, p1.y - p0.y) + Math.hypot(p2.x - p1.x, p2.y - p1.y);
