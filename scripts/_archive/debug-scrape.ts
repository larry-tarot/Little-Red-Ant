import { CompetitorScraper } from '../api/services/scraper/CompetitorScraper.js';

const userId = process.argv[2] || '61dd272d000000002102940c';

async function main() {
    const scraper = new CompetitorScraper();
    try {
        const result = await scraper.scrape(userId);
        console.log('=== SCRAPE RESULT ===');
        console.log('Source:', result.source);
        console.log('Info:', JSON.stringify(result.info, null, 2));
        console.log('Notes count:', result.notes.length);
        console.log('First 3 notes:', JSON.stringify(result.notes.slice(0, 3), null, 2));
    } catch (e: any) {
        console.error('Scrape failed:', e.message);
        console.error(e.stack);
    } finally {
        process.exit(0);
    }
}

main();
