// 교단 총회·기독교 언론·구인 포털의 청빙 게시판(2026-10-07 조사: robots.txt 허용 + 로그인 없이 공개된 곳만)
// 고신 총회는 자체 게시판 없이 고려신학대학원 게시판(seminaries.mjs의 kts)으로 연결한다.
// 노회·연회 사이트는 대부분 수집 금지이고 글이 거의 없어 넣지 않는다(공고는 총회 게시판 제목에 노회명과 함께 올라옴).
import * as cheerio from 'cheerio';
import { board, linkText, dateText } from './_board.mjs';
import { normRegion, parseSalary } from '../lib.mjs';

const abs = (href, base) => new URL(String(href || '').replace(/:443(?=\/)/, ''), base).href;
const PASTOR_WORDS = /청빙|초빙|전도사|목사|교역자|사역자|강도사|모십니다/;

// Dimode CMS(기장·기침 공통)
const dimode = ({ id, short, name, host, boardNo, filter }) => board({
  id, short, name, group: '교단', home: `${host}/Board/Index/${boardNo}`, filter,
  listUrl: p => `${host}/Board/Index/${boardNo}?page=${p}`,
  row: 'table.table-hover tbody tr:not(.notice)',
  parse: ($, r) => {
    const a = r.find('td.document-title a').first(); if (!a.length) return null;
    const u = new URL(a.attr('href'), host); u.search = '';
    return { title: linkText($, a), url: u.href, date: r.find('td.document-regdate').text().trim() };
  }
});

// RSS 공통(제목·링크·날짜만 읽고 본문은 버림 — 본문에 연락처가 들어 있음)
async function readRss(http, source, url) {
  const xml = await http.request(url, { source });
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('item').map((_, it) => {
    const $it = $(it);
    const link = $it.find('link').first().text().trim().replace(/&amp;/g, '&').replace(/&amp;/g, '&');
    const when = $it.find('pubDate').first().text() || $it.find('dc\\:date').first().text();
    const d = new Date(when);
    return { title: $it.find('title').first().text().trim(), url: link, date: isNaN(d) ? '' : new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10), _desc: $it.find('description').first().text() };
  }).get();
}

export default [
  board({
    id: 'pck', short: 'pk', name: '예장통합 총회', group: '교단', home: 'https://www.pck.or.kr/bbs/board.php?bo_table=SM05_05',
    listUrl: p => `https://www.pck.or.kr/bbs/board.php?bo_table=SM05_05&page=${p}`,
    row: 'form#fboardlist tr[align=center]',
    parse: ($, r, base) => {
      if (!r.find('span.media-list-subject').length || r.find('img[src*="icon_notice"]').length) return null;
      const a = r.find('td.mw_basic_list_subject a[href*="wr_id="]').first();
      const status = r.find('td.mw_basic_list_hit').first().text().trim();
      return { title: r.find('span.media-list-subject').first().text().replace(/\s+/g, ' ').trim(), url: abs(a.attr('href'), base), date: r.find('td.mw_basic_list_datetime').text().trim(), closed: !!status && !/모집\s*중/.test(status) };
    }
  }),
  dimode({ id: 'prok', short: 'pr', name: '기장 총회', host: 'https://www.prok.org', boardNo: 176244 }),
  dimode({ id: 'kbaptist', short: 'kb', name: '기침 총회', host: 'https://www.koreabaptist.or.kr', boardNo: 21317, filter: r => PASTOR_WORDS.test(r.title) }),
  board({
    id: 'kehc', short: 'ke', name: '기성 총회', group: '교단', home: 'https://www.kehc.org/home/recruit/view_list/page/0',
    listUrl: p => `https://www.kehc.org/home/recruit/view_list/page/${50 * (p - 1)}`,
    row: 'table tbody tr',
    parse: ($, r) => {
      const tds = r.find('td'); if (tds.length < 6 || /공지/.test(tds.eq(0).text())) return null;
      const a = r.find('td.ellipsis a[href^="javascript:read_post("]').first(); const m = String(a.attr('href') || '').match(/read_post\((\d+)\)/);
      if (!m) return null;
      return { title: linkText($, a), url: `https://www.kehc.org/home/recruit/read_post/${m[1]}/page/0`, date: dateText(tds.eq(5).text()), tags: [tds.eq(2).text().trim()].filter(Boolean), closed: !/진행/.test(tds.eq(1).text()) };
    }
  }),
  {
    id: 'cjob', short: 'cj', name: '기독정보넷', group: '구인 사이트', enabled: true, pages: 1,
    home: 'https://www.cjob.co.kr/bbs/board.php?bo_table=offerKG',
    async collect({ http }) {
      // 목록에는 날짜가 없어 RSS를 쓴다. 본문(_desc)에서는 교단만 읽고 나머지(연락처 등)는 버린다.
      return (await readRss(http, this, 'https://www.cjob.co.kr/bbs/rss.php?bo_table=offerKG')).map(({ _desc, ...it }) => {
        const m = String(_desc || '').match(/소속\s*교단\s*:\s*(?:<br\s*\/?>)?\s*([^<\n]{1,30})/);
        return { ...it, denomination: m ? m[1].trim() : null, pay: parseSalary(String(_desc || '').replace(/<br\s*\/?>/g, ' ')), payChecked: true };
      });
    }
  },
  board({
    id: 'pckworld', short: 'pw', name: '한국기독공보', group: '기독교 언론', noDetail: true, home: 'https://www.pckworld.com/adsearch/',
    listUrl: p => `https://www.pckworld.com/adsearch/?page=${p}`,
    row: 'ul.grid li.grid-item', filter: r => PASTOR_WORDS.test(r.title),
    parse: ($, r) => {
      const a = r.find('a[href^="javascript:adview("]').first(); const m = String(a.attr('href') || '').match(/adview\('(\d+)'/);
      if (!m) return null;
      const title = a.find('span').first().text().trim();            // "부목사청빙(소망교회)"
      const church = (title.match(/\(([^)]+)\)\s*$/) || [])[1];
      const d = (String(a.find('img').attr('src') || '').match(/(\d{4})(\d{2})(\d{2})\d{6}\./) || []).slice(1).join('-');
      return { title, church, url: `https://www.pckworld.com/ad_view.php?aid=${m[1]}`, date: d };
    }
  }),
  {
    id: 'repress', short: 'rp', name: '기독교개혁신보', group: '기독교 언론', enabled: true, pages: 1,
    home: 'https://www.repress.kr/',
    async collect({ http }) {
      // 섹션 필터가 이 봇에는 적용되지 않아 전체 기사 RSS에서 '청빙'만 고른다
      return (await readRss(http, this, 'https://cdn.repress.kr/rss/gn_rss_allArticle.xml')).filter(it => /청빙/.test(it.title)).map(({ _desc, ...it }) => it);
    }
  },
  board({
    id: 'cdaily', short: 'cd', name: '기독일보 크리스천잡스', group: '기독교 언론', noDetail: true, home: 'https://bbs.kr.christianitydaily.com/?bo_table=minister',
    listUrl: p => `https://bbs.kr.christianitydaily.com/?bo_table=minister&page=${p}`,
    row: 'tbody.hover > tr:not(.notice)',
    parse: ($, r) => {
      const tds = r.find('td'); const a = tds.eq(2).find('a[href*="wr_id="]').first(); if (!a.length) return null;
      const place = tds.eq(1).text().trim();
      const kr = normRegion(place);   // 대부분 미국 도시 → 해외
      return { title: linkText($, a), url: abs(a.attr('href'), 'https://bbs.kr.christianitydaily.com/'), date: dateText(tds.eq(4).text()), regionText: kr ? place : '해외' };
    }
  }),
  board({
    id: 'minitries', short: 'mn', name: '청빙넷', group: '구인 사이트', home: 'https://minitries.co.kr/',
    listUrl: p => `https://minitries.co.kr/?q=YToxOntzOjEyOiJrZXl3b3JkX3R5cGUiO3M6MzoiYWxsIjt9&page=${p}`,
    row: 'ul.li_body.holder', filter: r => PASTOR_WORDS.test(r.title),   // 사이트 공지가 섞임
    parse: ($, r) => {
      const a = r.find('a.list_text_title').first(); if (!a.length) return null;
      return { title: linkText($, a), url: abs(a.attr('href'), 'https://minitries.co.kr/'), date: dateText(r.find('li.time').attr('title') || r.find('li.time').text()) };
    }
  })
];
