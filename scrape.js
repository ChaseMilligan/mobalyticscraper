const { chromium } = require('playwright');
const cheerio = require('cheerio');
const express = require('express');
const cors = require('cors'); // Import cors
const app = express();
const PORT = 5000;

app.use(cors()); // Enable CORS for all routes

function removeNonNumerical(input) {
  // Remove all non-numerical characters
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
        wins: [],
        losses: [],
        times: []
    };

    $('div.m-15s0h17').each((index, element) => {
        results.wins.push(removeNonNumerical($(element).text()));
	});
	
	$('div.m-122nwo5').each((index, element) => {
        results.losses.push(removeNonNumerical($(element).text()));
    });

    $('span.m-1htw35x').each((index, element) => {
        if ($(element).text().includes('minutes')) {
            results.times.push(removeNonNumerical($(element).text()));
        }
    });
    console.log(results);
    return results;
}

app.get('/api/data', async (req, res) => {
    console.log(`${req.query.gameMode} Win/Loss Request received for summoner: ${req.query.url}`)
    const url = `https://mobalytics.gg/lol/profile/na/${req.query.url}/overview?c_queue=${req.query.gameMode}`; // Get the URL from query parameters
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