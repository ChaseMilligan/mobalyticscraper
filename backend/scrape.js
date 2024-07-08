const { chromium } = require('playwright');
const cheerio = require('cheerio');
const axios = require('axios');
const moment = require('moment');
require('dotenv').config()
const express = require('express');
const cors = require('cors');
const app = express();
const localtunnel = require('localtunnel');

const PORT = process.env.PORT;
const apiKey = process.env.RIOT_API_KEY;
const region = 'americas';

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

//RIOT API helpers

// Function to get PUUID using Riot ID
async function getPuuid(riotId, tagLine) {
	try {
		const response = await axios.get(`https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${riotId}/${tagLine}`, {
			headers: { 'X-Riot-Token': apiKey }
		});
		return response.data.puuid;
	} catch (error) {
		console.error('Error fetching PUUID:', error);
	}
}

// Function to get match history
async function getMatchHistory(puuid, startTime) {
	try {
		const response = await axios.get(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`, {
			headers: { 'X-Riot-Token': apiKey },
			params: {
				startTime: Math.floor(startTime / 1000), // Convert to seconds
				queue: 420, // 420 is the queue ID for Ranked Solo/Duo
			}
		});
		return response.data;
	} catch (error) {
		console.error('Error fetching match history:', error);
	}
}

// Function to get match details
async function getMatchDetails(matchId) {
	try {
		const response = await axios.get(`https://${region}.api.riotgames.com/lol/match/v5/matches/${matchId}`, {
			headers: { 'X-Riot-Token': apiKey }
		});
		return response.data;
	} catch (error) {
		console.error('Error fetching match details:', error);
	}
}

// Function to get the last Monday
function getLastMonday() {
	const today = moment();
	const dayOfWeek = today.day(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
	if (dayOfWeek === 0) {
		return today.subtract(6, 'days').startOf('day'); // Last Monday if today is Sunday
	} else {
		return today.subtract(dayOfWeek - 1, 'days').startOf('day'); // Last Monday for other days
	}
}

function splitString(inputString) {
    // Split the string by the hyphen
    let resultArray = inputString.split('-');
    return resultArray;
}

//END RIOT API helpers

//RIOT API MAIN
async function main(riotId, tagLine) {
	const puuid = await getPuuid(riotId, tagLine);

	const today = moment();
	const lastMonday = getLastMonday();

	const matchIds = await getMatchHistory(puuid, lastMonday.toDate().getTime());

	const matchDetailsPromises = matchIds.map(matchId => getMatchDetails(matchId));
	const matchDetails = await Promise.all(matchDetailsPromises);

	// Filter matches within the desired time frame
	const filteredMatches = matchDetails.filter(match => {
		const matchDate = moment(match.info.gameStartTimestamp);
		return matchDate.isBetween(lastMonday, today);
	});

	// Extract the required data
	const results = {
	summoner: {
		name: `${decodeURIComponent(riotId.toUpperCase())}#${tagLine.toUpperCase()}`,
	},
	matches: filteredMatches.map(match => {
		const participant = match.info.participants.find(p => p.puuid === puuid);
		return {
			match: {
				gameTimeMinutes: match.info.gameDuration / 60,
				win: participant.win,
				kda: {
					kills: participant.kills,
					assists: participant.assists,
					deaths: participant.deaths,
				}
			},
		};
	})
	};

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
        const riotID = encodeURIComponent(splitString(req.query.url)[0]);
        const tagLine = splitString(req.query.url)[1];
        main(riotID, tagLine).then(results => {
            console.log(results);
            res.json({scrape: data, api: results});
            console.log('Data sent successfully');
        }).catch(error => {
            console.error('Error in main function:', error);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
        console.error(error);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});