// 게시판 목록 공통 틀 — 학교마다 "주소·행 선택자·한 행 읽는 법"만 적으면 출처가 된다.
// 서버가 그린 HTML 목록(그누보드, K2Web, XE, ASP 등) 대부분에 쓴다.
import * as cheerio from 'cheerio';

// 교회 구인 글만 남길 때(일반 취업·행사 글이 섞인 게시판)
export const JOB_WORDS = /청빙|초빙|모십니다|모집|구인|구합니다|사역자|교역자|전도사|목사|강도사|간사|반주|채용/;

/** 링크 글자만(새 글 표시·아이콘 제외) */
export function linkText($, a) {
  const c = a.clone();
  c.find('img, i, .new, .new_icon, .newArtcl, .ico, .icon, .cnt_cmt, .sound_only, span.grp').remove();
  return c.text().replace(/\s+/g, ' ').trim();
}
/** 문자열에서 첫 날짜(YYYY-MM-DD, YYYY.MM.DD, MM-DD, HH:MM) */
export function dateText(s) {
  const m = String(s || '').match(/\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{2}[-./]\d{1,2}[-./]\d{1,2}|\b\d{1,2}[-./]\d{1,2}\b|\b\d{1,2}:\d{2}\b/);
  return m ? m[0] : '';
}

/**
 * @param {object} c
 *  id, short, name, home, enabled, pages, encoding, permission, disabledReason
 *  listUrl(page)            목록 주소
 *  request?(page)           POST가 필요하면 {method, body, headers}
 *  row                      행 선택자
 *  parse($, $row, base)     → {title, url, date, church?, location?, regionText?, tags?} | null
 *  filter?                  true면 JOB_WORDS로 거름, 함수면 그 함수로
 */
export function board(c) {
  return {
    id: c.id, short: c.short, name: c.name, home: c.home, group: c.group || '신학교',
    enabled: c.enabled ?? true, pages: c.pages ?? 1,
    permission: c.permission || '', disabledReason: c.disabledReason,
    async collect({ http }) {
      const out = [];
      for (let page = 1; page <= this.pages; page++) {
        const url = c.listUrl(page);
        const req = c.request ? c.request(page) : {};
        const html = await http.request(url, { source: this, encoding: c.encoding || 'utf-8', ...req });
        const $ = cheerio.load(html);
        const rows = $(c.row);
        rows.each((_, el) => {
          let r;
          try { r = c.parse($, $(el), url); } catch { r = null; }
          if (!r || !r.title || !r.url) return;
          const keep = c.filter === true ? JOB_WORDS.test(r.title) : typeof c.filter === 'function' ? c.filter(r) : true;
          if (keep) out.push(r);
        });
        if (!rows.length) break;
      }
      return out;
    }
  };
}
