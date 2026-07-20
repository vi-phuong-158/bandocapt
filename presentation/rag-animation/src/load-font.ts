// Nap font co dau tieng Viet day du qua @remotion/google-fonts de dam bao
// hien thi dung khi render headless (khong phu thuoc font co san tren may render).
import { loadFont } from '@remotion/google-fonts/BeVietnamPro';

export const { fontFamily: BE_VIETNAM_PRO } = loadFont('normal', {
  weights: ['500', '600', '700'],
  subsets: ['vietnamese'],
});
