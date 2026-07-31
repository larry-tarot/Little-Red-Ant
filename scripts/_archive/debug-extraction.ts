import { chromium } from 'playwright';
import { extractProfileFromDomScript } from '../api/services/scraper/utils/ProfileExtractor.js';

const mockHtml = `
<!DOCTYPE html>
<html>
<head><title>Mock XHS Profile</title></head>
<body>
  <div class="user-info-panel">
    <h1 class="name">测试博主</h1>
    <img class="avatar" src="https://example.com/avatar.jpg" />
    <p class="desc">这是一个测试简介</p>
    <div class="data">
      <div><span>12.5万</span> 粉丝</div>
      <div><span>328</span> 笔记</div>
      <div><span>88.6万</span> 获赞与收藏</div>
    </div>
  </div>
  <div class="note-item">
    <div class="title">笔记标题 1</div>
    <div class="like-count">1.2万</div>
    <a href="/explore/abc123">link</a>
  </div>
  <div class="note-item">
    <div class="title">笔记标题 2</div>
    <div class="like-count">856</div>
    <a href="/explore/def456">link</a>
  </div>
</body>
</html>
`;

const mockHtmlWithSSR = `
<!DOCTYPE html>
<html>
<head><title>Mock XHS Profile SSR</title></head>
<body>
  <script>
    window.__INITIAL_STATE__ = {
      user: {
        userPageData: {
          basicInfo: {
            nickname: 'SSR博主',
            image: 'https://example.com/ssr-avatar.jpg',
            desc: 'SSR测试简介'
          },
          interactions: [
            { name: '粉丝', count: '100万' },
            { name: '笔记', count: '500' },
            { name: '获赞与收藏', count: '200万' }
          ]
        }
      }
    };
  </script>
  <div class="user-info-panel">
    <h1 class="name">DOM博主</h1>
    <div class="data">
      <div><span>10</span> 粉丝</div>
      <div><span>1</span> 笔记</div>
    </div>
  </div>
</body>
</html>
`;

async function testExtraction(name: string, html: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.setContent(html);

    const result = await page.evaluate(extractProfileFromDomScript() as any);
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(result, null, 2));

    await browser.close();
}

async function main() {
    await testExtraction('DOM Only', mockHtml);
    await testExtraction('SSR Priority', mockHtmlWithSSR);
}

main().catch(console.error);
