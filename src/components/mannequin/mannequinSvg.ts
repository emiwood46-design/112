import { MANNEQUIN_HEIGHT, MANNEQUIN_WIDTH } from "@/domain/slots";
import type { MannequinKind } from "@/domain/types";

/**
 * Нейтральный силуэт манекена в полный рост. Система координат совпадает
 * с координатами слотов (600 × 1200), поэтому вещи «садятся» на анатомию.
 * Левая половина рук/ног рисуется один раз и отражается.
 */
const SHAPES: Record<MannequinKind, { head: string; neck: string; torso: string; arm: string; hand: string; leg: string; foot: string }> = {
  female: {
    head: '<ellipse cx="300" cy="112" rx="46" ry="58"/>',
    neck: "M282 160 L318 160 L322 212 L278 212 Z",
    torso:
      "M278 200 C250 204 222 208 206 226 C196 238 198 262 202 290 C208 340 232 392 238 440 C242 478 214 520 208 566 C206 584 208 600 212 612 L388 612 C392 600 394 584 392 566 C386 520 358 478 362 440 C368 392 392 340 398 290 C402 262 404 238 394 226 C378 208 350 204 322 200 Z",
    arm: "M210 222 C190 228 178 248 176 282 C172 340 168 400 164 460 C160 520 162 570 168 622 L188 622 C190 572 194 522 200 466 C206 410 214 350 222 300 Z",
    hand: '<ellipse cx="178" cy="645" rx="14" ry="26"/>',
    leg: "M212 590 C206 680 214 770 226 850 C234 930 240 1010 246 1092 L284 1092 C286 1010 290 930 294 850 C298 770 300 690 302 612 Z",
    foot: "M244 1086 L286 1086 C290 1104 288 1124 280 1134 C268 1142 248 1140 240 1130 C234 1118 238 1100 244 1086 Z",
  },
  male: {
    head: '<ellipse cx="300" cy="108" rx="50" ry="62"/>',
    neck: "M276 160 L324 160 L330 218 L270 218 Z",
    torso:
      "M270 206 C236 210 196 214 180 236 C170 252 174 280 182 314 C192 360 222 410 230 460 C234 500 226 540 224 580 C222 598 224 612 226 622 L374 622 C376 612 378 598 376 580 C374 540 366 500 370 460 C378 410 408 360 418 314 C426 280 430 252 420 236 C404 214 364 210 330 206 Z",
    arm: "M186 230 C164 238 152 262 150 300 C146 360 144 420 142 480 C140 540 144 590 150 640 L172 640 C174 592 178 542 184 486 C190 430 198 370 208 318 Z",
    hand: '<ellipse cx="161" cy="664" rx="15" ry="28"/>',
    leg: "M226 600 C222 690 228 780 236 860 C242 940 246 1020 250 1092 L290 1092 C292 1020 294 940 296 860 C298 780 300 690 302 622 Z",
    foot: "M246 1086 L292 1086 C296 1104 294 1126 284 1136 C270 1144 250 1142 242 1132 C236 1118 240 1100 246 1086 Z",
  },
};

export function mannequinSvg(kind: MannequinKind): string {
  const s = SHAPES[kind];
  const half = `<path d="${s.arm}"/>${s.hand}<path d="${s.leg}"/><path d="${s.foot}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MANNEQUIN_WIDTH}" height="${MANNEQUIN_HEIGHT}" viewBox="0 0 ${MANNEQUIN_WIDTH} ${MANNEQUIN_HEIGHT}">
<defs>
<linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
<stop offset="0" stop-color="#d6cdc1"/><stop offset="0.5" stop-color="#ebe5dc"/><stop offset="1" stop-color="#d6cdc1"/>
</linearGradient>
<radialGradient id="sh" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>
<ellipse cx="300" cy="1140" rx="150" ry="22" fill="url(#sh)"/>
<g fill="url(#g)">
<g>${half}</g>
<g transform="translate(${MANNEQUIN_WIDTH} 0) scale(-1 1)">${half}</g>
<path d="${s.torso}"/>
<path d="${s.neck}"/>
${s.head}
</g>
</svg>`;
}

export function mannequinDataUrl(kind: MannequinKind): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mannequinSvg(kind))}`;
}
