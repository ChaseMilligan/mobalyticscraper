const { chromium } = require('playwright');
const postgres = require('postgres');
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

var corsOptions = {
    origin: "*",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
}

app.use(cors(corsOptions)); // Enable CORS for all routes

const tunnel = localtunnel(PORT, { subdomain: 'mobalyticscraper'}, (err, tunnel) => {
    console.log('Tunnel URL: ' + tunnel.url);
});

// app.js
let { PGHOST, PGDATABASE, PGUSER, PGPASSWORD, ENDPOINT_ID } = process.env;

const sql = postgres({
  host: PGHOST,
  database: PGDATABASE,
  username: PGUSER,
  password: PGPASSWORD,
  port: 5432,
  ssl: 'require',
  connection: {
    options: `project=${ENDPOINT_ID}`,
  },
});

// Function to create the user matches table
async function createUserMatchesTable() {
  const createUserTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      summoner_name VARCHAR(100) NOT NULL UNIQUE,
      pfp_url VARCHAR(255),
      rank VARCHAR(50),
      rank_icon_url VARCHAR(255)
    );
  `;

	const createMatchesTableQuery = `
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      summoner_name VARCHAR(100) NOT NULL,
			matchID VARCHAR(100) NOT NULL UNIQUE,
      queue_type VARCHAR(50),
			game_time_minutes DECIMAL,
			assists INTEGER,
      deaths INTEGER,
      kills INTEGER,
      win VARCHAR(50)
    );
  `;

  try {
		await sql.unsafe(createUserTableQuery);
		await sql.unsafe(createMatchesTableQuery);
    console.log('User matches table created successfully');
  } catch (err) {
    console.error('Error creating user matches table:', err);
  }
}

// Connect to the PostgreSQL server and create the table
createUserMatchesTable();

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

async function extractElements(url, queueType) {
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

    if (queueType === 'solo') {
        if ($('div.m-1spa8xs div.m-jnvb0').text().includes('Ranked Solo')) {
            $('div.m-1spa8xs img.m-17nwc').each((index, element1) => {
                results.rankID.iconUrl = $(element1).attr('src');
            });

            // Extract rank
            $('div.m-1spa8xs div.m-1gydigm').each((index, element2) => {
                results.rankID.rank = $(element2).text();
            });
        }
    } else {
        if ($('div.m-1spa8xs div.m-jnvb0').text().includes('Ranked Flex')) {
            $('div.m-1spa8xs img.m-17nwc').each((index, element1) => {
                results.rankID.iconUrl = $(element1).attr('src');
            });

            // Extract rank
            $('div.m-1spa8xs div.m-1gydigm').each((index, element2) => {
                results.rankID.rank = $(element2).text();
            });
        } else if ($('div.m-1vuvcj3 div.m-jnvb0').text().includes('Ranked Flex')) {
            $('div.m-1vuvcj3 img.m-17nwc').each((index, element1) => {
                if (index !== 0) {
                    return;
                }
                results.rankID.iconUrl = $(element1).attr('src');
            });

            // Extract rank
            $('div.m-1vuvcj3 div.m-1gydigm').each((index, element2) => {
                if (index !== 0) {
                    return;
                }
                results.rankID.rank = $(element2).text();
            });
        }
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
async function getMatchHistory(puuid, startTime, queueType) {
    console.log(queueType)
	try {
		const response = await axios.get(`https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`, {
			headers: { 'X-Riot-Token': apiKey },
			params: {
				startTime: Math.floor(startTime / 1000), // Convert to seconds
				queue: queueType === 'solo' ? 420 : 440, // 420 is the queue ID for Ranked Solo/Duo and 440 is for flex
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

function getFirstDayOfCurrentMonth() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    return firstDay;
}

function splitString(inputString) {
    // Split the string by the hyphen
    let resultArray = inputString.split('-');
    return resultArray;
}

//END RIOT API helpers

async function insertData(data, queueType) {
  const insertUserQuery = `
    INSERT INTO users (
      summoner_name,
      pfp_url,
      rank,
      rank_icon_url
    ) VALUES (
      $1, $2, $3, $4
    );
  `;

	const insertMatchesQuery = `
    INSERT INTO matches (
      summoner_name,
			matchID,
      queue_type,
			game_time_minutes,
			assists,
			deaths,
			kills,
			win
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8
    );
  `;

	try {
		const userValues = [
			data.api.summoner.name,
			data.scrape.pfpUrl,
			data.scrape.rankID.rank,
			data.scrape.rankID.iconUrl
		];

		await sql.unsafe(insertUserQuery, userValues);
    console.log('User data inserted successfully');		
  } catch (err) {
    console.error('Error inserting user data:', err);
	}
	
	try {
		for (const match of data.api.matches) {
			console.log('Inserting match data:', match, queueType)
			const matchValues = [
				data.api.summoner.name,
				`${data.api.summoner.name}_${match.match.matchID}`,				
				queueType,
				match.match.gameTimeMinutes,
				match.match.kda.assists,
				match.match.kda.deaths,
				match.match.kda.kills,
				match.match.win,
			];

			await sql.unsafe(insertMatchesQuery, matchValues);
    	console.log('Match data inserted successfully');
		}
	} catch (err) {
		console.error('Error inserting match data:', err);
	}
}

//RIOT API MAIN
async function main(riotId, tagLine, queueType) {
    console.log('Main function called', queueType)
	const puuid = await getPuuid(riotId, tagLine);

	const today = moment();
	const firstOfMonth = getFirstDayOfCurrentMonth();

	const matchIds = await getMatchHistory(puuid, firstOfMonth.getTime(), queueType);

	const matchDetailsPromises = matchIds.map((matchId) => {
        setTimeout(() => {
            console.log('waiting...')
        }, 5000)
        return getMatchDetails(matchId)
    });
	const matchDetails = await Promise.all(matchDetailsPromises);

	// Filter matches within the desired time frame
	const filteredMatches = matchDetails.filter(match => {
		const matchDate = moment(match?.info.gameStartTimestamp);
		return matchDate.isBetween(firstOfMonth, today);
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
				matchID: match.metadata.matchId,
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

app.use((req, res, next) => {
  const allowedOrigin = '*'; // Without trailing slash
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
	res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.setHeader('Permissions-Policy', 'interest-cohort=()');
  next();
});

app.get('/api/data', async (req, res) => {
    console.log(`Win/Loss Request received for summoner: ${req.query.url}`)
    const queueType = req.query.type === 'solo' ? 'RANKED_SOLO' : 'RANKED_FLEX';

    const url = `https://mobalytics.gg/lol/profile/na/${req.query.url}/overview?c_queue=${queueType}`; // Get the URL from query parameters
    if (!url) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }
    
    try {
        const data = await extractElements(url, req.query.type);
        const riotID = encodeURIComponent(splitString(req.query.url)[0]);
        const tagLine = splitString(req.query.url)[1];
        main(riotID, tagLine, req.query.type).then(results => {
					res.json({ scrape: data, api: results });
					insertData({ scrape: data, api: results }, req.query.type);
            console.log('Data sent successfully');
        }).catch(error => {
            console.error('Error in main function:', error);
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
        console.error(error);
    }
});

app.get('/api/users', async (req, res) => {
		try {
				const users = await sql`SELECT * FROM users`;
				res.json(users);
		} catch (error) {
				res.status(500).json({ error: error.message });
				console.error(error);
		}
});

app.get('/api/matches', async (req, res) => {
		try {
				const summonerName = req.query.summonerName; // Get the summoner name from query parameters
				const matches = await sql`SELECT * FROM matches WHERE summoner_name = ${summonerName}`;
				res.json(matches);
		} catch (error) {
				res.status(500).json({ error: error.message });
				console.error(error);
		}
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});