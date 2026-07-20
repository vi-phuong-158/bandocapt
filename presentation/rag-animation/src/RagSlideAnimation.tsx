import React from 'react';
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS, FONT_FAMILY } from './theme';
import {
  ANCHORS,
  CHAT_EXIT_POINT,
  CONTEXT_BUILDER,
  LEFT_PANEL,
  LLM_PROCESSOR,
  NODE1_RETRIEVAL,
  NODE2_RERANK,
  RIGHT_PANEL,
  SAFE_MARGIN,
  autoControlPoint,
  center,
  docPosition,
} from './geometry';
import { ANSWER_TEXT, CITATIONS, DOCUMENTS, HIGHLIGHTED_DOC_INDEXES, QUESTION_TEXT } from './data';
import { SearchIcon, LayersIcon } from './icons';
import { ChatWindow } from './components/ChatWindow';
import { RagNode } from './components/RagNode';
import { KnowledgeDocument } from './components/KnowledgeDocument';
import { MovingDataPacket } from './components/MovingDataPacket';
import { RetrievalBeam } from './components/RetrievalBeam';
import { ContextBuilder } from './components/ContextBuilder';
import { LlmProcessor } from './components/LlmProcessor';

// ============================================================
// RagSlideAnimation — 720 frame (24s @ 30fps), khong am thanh, loop lien mach.
//
// 6 canh (moc kiem tra 0/120/240/360/480/600/719 la ranh gioi canh):
//   Canh 1 [0-120)   Mo dau & dat cau hoi
//   Canh 2 [120-240) Gui truy van vao he thong (goi -> Node "Truy hoi phan tang")
//   Canh 3 [240-360) Truy hoi phan tang: kho tai lieu bung ra, loc 2/6 tai lieu dung
//   Canh 4 [360-480) Cham diem lai (rerank) + xay ngu canh (ContextBuilder)
//   Canh 5 [480-600) Sinh cau tra loi: LlmProcessor active, chu chay dan trong chat
//   Canh 6 [600-720) Trich dan nguon + duong beam nguoc ve tai lieu goc, roi mo dan
//                     ve trang thai rong (khep vong lap voi frame 0).
//
// Chien luoc loop: mot lop opacity toan cuc (globalFadeOut) mo dan MOI THU ve 0
// trong ~50 frame cuoi; vi cac hieu ung xuat hien (spring/interpolate) o frame 0
// cung xuat phat tu 0, frame 719 (gan nhu rong) va frame 0 (dang bat dau tu rong)
// noi voi nhau khong bi giat — day la cach dam bao "vong lap lien mach" chac chan
// nhat thay vi co ep hai frame trung khop tuyet doi pixel-by-pixel.
// ============================================================

const doc = (i: number) => center(docPosition(i));
const [HL_A, HL_B] = HIGHLIGHTED_DOC_INDEXES; // 2 chi so tai lieu duoc chon (1 va 3)

export const RagSlideAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const clampOpts = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  // ---------------- Canh 1: mo dau & dat cau hoi ----------------
  const chatEntrance = spring({ frame, fps, config: { damping: 26 }, durationInFrames: 40 });
  const nodesEntrance = spring({ frame: Math.max(0, frame - 8), fps, config: { damping: 26 }, durationInFrames: 36 });
  const questionReveal = spring({ frame: Math.max(0, frame - 45), fps, config: { damping: 26 }, durationInFrames: 30 });

  // ---------------- Canh 2: gui truy van ----------------
  const statusOpacity =
    interpolate(frame, [120, 145], [0, 1], clampOpts) * interpolate(frame, [470, 492], [1, 0], clampOpts);
  const node1Active = interpolate(frame, [150, 235], [0, 1], clampOpts);

  // ---------------- Canh 3: truy hoi phan tang ----------------
  const docsDim = interpolate(frame, [320, 355], [1, 0.35], clampOpts);

  // ---------------- Canh 4: cham diem lai + xay ngu canh ----------------
  const node2Active = interpolate(frame, [380, 440], [0, 1], clampOpts);
  const contextBuild = interpolate(frame, [400, 475], [0, 1], clampOpts);

  // ---------------- Canh 5: sinh cau tra loi ----------------
  const llmActive = interpolate(frame, [490, 540], [0, 1], clampOpts);
  const pulseCycle = (frame % 40) / 40;
  const llmPulse = interpolate(pulseCycle, [0, 0.5, 1], [0.85, 1, 0.85]);
  const answerOpacity = interpolate(frame, [485, 505], [0, 1], clampOpts);
  const answerCharCount = Math.round(interpolate(frame, [500, 595], [0, ANSWER_TEXT.length], clampOpts));
  const statusDots = '.'.repeat(1 + Math.floor((frame % 30) / 10));

  // ---------------- Canh 6: khep vong lap ----------------
  const globalFadeOut = interpolate(frame, [668, 719], [1, 0], clampOpts);

  // Diem dieu khien Bezier co dinh cho tung duong noi (tinh mot lan, khong doi theo frame)
  const cp = {
    query: autoControlPoint(CHAT_EXIT_POINT, ANCHORS.node1Left),
    node1ToDocs: autoControlPoint(ANCHORS.node1Right, ANCHORS.docClusterLeft),
    docAToNode2: autoControlPoint(doc(HL_A), ANCHORS.node2Top, -0.15),
    docBToNode2: autoControlPoint(doc(HL_B), ANCHORS.node2Top, -0.1),
    node2ToContext: autoControlPoint(ANCHORS.node2Right, ANCHORS.contextLeft),
    contextToLlm: autoControlPoint(ANCHORS.contextBottom, ANCHORS.llmTop),
    citeA: autoControlPoint(ANCHORS.llmCenter, doc(HL_A), 0.12),
    citeB: autoControlPoint(ANCHORS.llmCenter, doc(HL_B), -0.12),
  };

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      {/* Luoi cham rat mo phia sau khu vuc phai — goi cam giac "ban ve ky thuat"
          cho vung pipeline, van la hoa tiet phang 2D (khong gradient/3D), khong
          doi theo frame nen khong lam nhieu chuyen dong chinh. */}
      <svg style={{ position: 'absolute', left: RIGHT_PANEL.x, top: RIGHT_PANEL.y, overflow: 'visible' }} width={RIGHT_PANEL.width} height={RIGHT_PANEL.height}>
        <defs>
          <pattern id="pipeline-dot-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1.4" cy="1.4" r="1.4" fill={COLORS.dotGrid} />
          </pattern>
        </defs>
        <rect width={RIGHT_PANEL.width} height={RIGHT_PANEL.height} fill="url(#pipeline-dot-grid)" opacity={0.55} />
      </svg>

      {/* Vach ngan mong giua hai khu vuc */}
      <div
        style={{
          position: 'absolute',
          left: (LEFT_PANEL.x + LEFT_PANEL.width + RIGHT_PANEL.x) / 2,
          top: 80,
          width: 2,
          height: 920,
          background: COLORS.panelDivider,
        }}
      />

      {/* NHAN MINH HOA — co dinh, KHONG mo dan theo globalFadeOut va KHONG phu
          thuoc frame: video hien mot cau tra loi thu tuc trong nhu tu van that,
          nen nhan nay phai co mat o MOI frame de nguoi xem khong hieu nham. */}
      <div
        style={{
          position: 'absolute',
          right: SAFE_MARGIN,
          top: 78,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: COLORS.white,
          border: `2px solid ${COLORS.teal}`,
          borderRadius: 999,
          padding: '8px 18px',
        }}
      >
        <div style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.teal }} />
        <span style={{ fontFamily: FONT_FAMILY, fontSize: 17, fontWeight: 700, color: COLORS.deepBlue, letterSpacing: 0.6 }}>
          MINH HOẠ — nội dung ví dụ, không phải tư vấn chính thức
        </span>
      </div>

      {/* Lop noi dung — mo dan ve 0 o cuoi video de khep vong lap */}
      <AbsoluteFill style={{ opacity: globalFadeOut }}>
        {/* Nhan tieu de nho tren khu vuc phai */}
        <div
          style={{
            position: 'absolute',
            left: RIGHT_PANEL.x,
            top: 82,
            opacity: nodesEntrance,
            fontFamily: FONT_FAMILY,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 3,
            color: COLORS.blueSoft,
          }}
        >
          QUY TRÌNH XỬ LÝ RAG
        </div>

        {/* ============ KHU VUC TRAI: ChatWindow ============ */}
        <ChatWindow
          x={LEFT_PANEL.x}
          y={LEFT_PANEL.y}
          width={LEFT_PANEL.width}
          height={LEFT_PANEL.height}
          entrance={chatEntrance}
          questionText={QUESTION_TEXT}
          questionReveal={questionReveal}
          statusOpacity={statusOpacity}
          statusDots={statusDots}
          answerOpacity={answerOpacity}
          answerText={ANSWER_TEXT.slice(0, answerCharCount)}
          citations={CITATIONS.map((c, i) => ({
            label: c.label,
            reveal: spring({
              frame: Math.max(0, frame - (612 + i * 15)),
              fps,
              config: { damping: 26 },
              durationInFrames: 22,
            }),
          }))}
        />

        {/* ============ KHU VUC PHAI: pipeline RAG ============ */}

        <RagNode
          x={NODE1_RETRIEVAL.x}
          y={NODE1_RETRIEVAL.y}
          width={NODE1_RETRIEVAL.width}
          height={NODE1_RETRIEVAL.height}
          label="Truy hồi phân tầng"
          subLabel="Lọc đúng thẩm quyền, đúng cấp"
          Icon={SearchIcon}
          activeAmount={node1Active}
          entrance={nodesEntrance}
        />

        {DOCUMENTS.map((d, i) => {
          const pos = docPosition(i);
          const reveal = spring({
            frame: Math.max(0, frame - (245 + i * 12)),
            fps,
            config: { damping: 26 },
            durationInFrames: 24,
          });
          const opacity = reveal * (d.highlighted ? 1 : docsDim);
          const scale = 0.85 + reveal * 0.15;
          return (
            <KnowledgeDocument
              key={d.id}
              x={pos.x}
              y={pos.y}
              width={pos.width}
              height={pos.height}
              label={d.label}
              opacity={opacity}
              scale={scale}
              highlighted={d.highlighted}
            />
          );
        })}

        <RagNode
          x={NODE2_RERANK.x}
          y={NODE2_RERANK.y}
          width={NODE2_RERANK.width}
          height={NODE2_RERANK.height}
          label="Chấm điểm lại"
          subLabel="AI xếp hạng lại kết quả"
          Icon={LayersIcon}
          activeAmount={node2Active}
          entrance={nodesEntrance}
        />

        <ContextBuilder
          x={CONTEXT_BUILDER.x}
          y={CONTEXT_BUILDER.y}
          width={CONTEXT_BUILDER.width}
          height={CONTEXT_BUILDER.height}
          buildProgress={contextBuild}
          slotLabels={[DOCUMENTS[HL_A].label, DOCUMENTS[HL_B].label]}
          entrance={nodesEntrance}
        />

        <LlmProcessor
          x={LLM_PROCESSOR.x}
          y={LLM_PROCESSOR.y}
          width={LLM_PROCESSOR.width}
          height={LLM_PROCESSOR.height}
          active={llmActive}
          pulse={llmPulse}
          entrance={nodesEntrance}
        />

        {/* ---------- Cac duong noi + goi du lieu (nhat thoi, dung Sequence) ---------- */}

        {/* Canh 2: cau hoi -> Node 1 */}
        <Sequence from={122} durationInFrames={100} layout="none">
          {(() => {
            const local = frame - 122;
            const progress = interpolate(local, [3, 78], [0, 1], clampOpts);
            return (
              <>
                <RetrievalBeam id="query" p0={CHAT_EXIT_POINT} p1={cp.query} p2={ANCHORS.node1Left} progress={progress} />
                <MovingDataPacket p0={CHAT_EXIT_POINT} p1={cp.query} p2={ANCHORS.node1Left} progress={progress} />
              </>
            );
          })()}
        </Sequence>

        {/* Canh 3: Node 1 -> cum tai lieu (duong tham chieu, khong goi rieng) */}
        <Sequence from={235} durationInFrames={45} layout="none">
          {(() => {
            const progress = interpolate(frame - 235, [0, 35], [0, 1], clampOpts);
            return (
              <RetrievalBeam
                id="node1-docs"
                p0={ANCHORS.node1Right}
                p1={cp.node1ToDocs}
                p2={ANCHORS.docClusterLeft}
                progress={progress}
              />
            );
          })()}
        </Sequence>

        {/* Canh 4: 2 tai lieu duoc chon -> Node 2 (Cham diem lai) */}
        <Sequence from={365} durationInFrames={90} layout="none">
          {(() => {
            const local = frame - 365;
            const progressA = interpolate(local, [4, 68], [0, 1], clampOpts);
            const progressB = interpolate(local, [14, 78], [0, 1], clampOpts);
            return (
              <>
                <RetrievalBeam id="docA-node2" p0={doc(HL_A)} p1={cp.docAToNode2} p2={ANCHORS.node2Top} progress={progressA} />
                <RetrievalBeam id="docB-node2" p0={doc(HL_B)} p1={cp.docBToNode2} p2={ANCHORS.node2Top} progress={progressB} />
                <MovingDataPacket p0={doc(HL_A)} p1={cp.docAToNode2} p2={ANCHORS.node2Top} progress={progressA} />
                <MovingDataPacket p0={doc(HL_B)} p1={cp.docBToNode2} p2={ANCHORS.node2Top} progress={progressB} />
              </>
            );
          })()}
        </Sequence>

        {/* Canh 4: Node 2 -> ContextBuilder */}
        <Sequence from={390} durationInFrames={70} layout="none">
          {(() => {
            const progress = interpolate(frame - 390, [0, 55], [0, 1], clampOpts);
            return (
              <RetrievalBeam id="node2-context" p0={ANCHORS.node2Right} p1={cp.node2ToContext} p2={ANCHORS.contextLeft} progress={progress} />
            );
          })()}
        </Sequence>

        {/* Canh 5: ContextBuilder -> LlmProcessor */}
        <Sequence from={480} durationInFrames={65} layout="none">
          {(() => {
            const local = frame - 480;
            const progress = interpolate(local, [3, 48], [0, 1], clampOpts);
            return (
              <>
                <RetrievalBeam id="context-llm" p0={ANCHORS.contextBottom} p1={cp.contextToLlm} p2={ANCHORS.llmTop} progress={progress} />
                <MovingDataPacket p0={ANCHORS.contextBottom} p1={cp.contextToLlm} p2={ANCHORS.llmTop} progress={progress} />
              </>
            );
          })()}
        </Sequence>

        {/* Canh 6: duong beam nguoc — chung minh cau tra loi co can cu */}
        <Sequence from={614} durationInFrames={72} layout="none">
          {(() => {
            const local = frame - 614;
            const progressA = interpolate(local, [0, 50], [0, 1], clampOpts);
            const progressB = interpolate(local, [10, 60], [0, 1], clampOpts);
            return (
              <>
                <RetrievalBeam id="cite-docA" p0={ANCHORS.llmCenter} p1={cp.citeA} p2={doc(HL_A)} progress={progressA} dashed opacity={0.85} />
                <RetrievalBeam id="cite-docB" p0={ANCHORS.llmCenter} p1={cp.citeB} p2={doc(HL_B)} progress={progressB} dashed opacity={0.85} />
              </>
            );
          })()}
        </Sequence>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
