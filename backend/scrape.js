const { chromium } = require('playwright');
const cheerio = require('cheerio');
require('dotenv').config()
const express = require('express');
const cors = require('cors'); // Import cors
const app = express();
const PORT = process.env.PORT;
const localtunnel = require('localtunnel');

app.use(cors()); // Enable CORS for all routes

const tunnel = localtunnel(PORT, { subdomain: 'mobalyticscraper'}, (err, tunnel) => {
    console.log('Tunnel URL: ' + tunnel.url);
});

function removeNonNumerical(input) {
  let numericalString = input.replace(/\D/g, '');

  return numericalString;
}

async function scrapeHTML(url) {
    const browser = await chromium.launch({
        headless: true,
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const htmlContent = await page.content();
    await browser.close();
    return htmlContent;
}

async function extractElements(url) {
    const htmlContent = await scrapeHTML(url);
    const $ = cheerio.load(htmlContent);
    const results = {
        pfpUrl: '',
        sequence: [],
        times: [],
        rankID: {
            iconUrl: '',
            rank: '',
        }
    };

    // Extract wins and losses along with their order
    $('div.m-15s0h17, div.m-122nwo5').each((index, element) => {
        const isWin = $(element).hasClass('m-15s0h17');
        const resultType = isWin ? 'win' : 'loss';
        let resultTime = '';
        
        results.sequence.push({
            type: resultType,
            value: removeNonNumerical($(element).text())
        });
    });

    $('span.m-1htw35x').each((index, element) => {
        if ($(element).text().includes('minutes')) {
            results.times.push(removeNonNumerical($(element).text()));
        }
    });

    // Extract profile picture URL
    $('div.m-fdr2vm img').each((index, element) => {
        results.pfpUrl = $(element).attr('src');
    });

    if ($('div.m-1spa8xs div.m-jnvb0').text().includes('Ranked Solo')) {
        $('div.m-1spa8xs img.m-17nwc').each((index, element1) => {
            results.rankID.iconUrl = $(element1).attr('src');
        });

        // Extract rank
        $('div.m-1spa8xs div.m-1gydigm').each((index, element2) => {
            results.rankID.rank = $(element2).text();
        });
    }

    console.log(results);
    return results;
}

app.get('/api/data', async (req, res) => {
    console.log(`Win/Loss Request received for summoner: ${req.query.url}`)
    const url = `https://mobalytics.gg/lol/profile/na/${req.query.url}/overview?c_queue=RANKED_SOLO`; // Get the URL from query parameters
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    try {
        console.log(`Scraping data from: ${url}`);
        const data = await extractElements(url);
        res.json(data);
        console.log('Data sent successfully');
    } catch (error) {
        res.status(500).json({ error: error.message });
        console.error(error);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});