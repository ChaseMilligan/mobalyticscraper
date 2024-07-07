const axios = require('axios');
const moment = require('moment');
require('dotenv').config()

const apiKey = process.env.RIOT_API_KEY;
const riotId = 'chilligan'; // Riot ID
const tagLine = 'na1'; // Tag Line
const region = 'americas'; // e.g., 'americas', 'europe', 'asia'

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
  
  // Function to get Summoner Info using PUUID
  async function getSummonerInfo(puuid) {
    try {
      const response = await axios.get(`https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`, {
        headers: { 'X-Riot-Token': apiKey }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching summoner info:', error);
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
  
  // Main function
  async function main() {
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
    const results = filteredMatches.map(match => {
      const participant = match.info.participants.find(p => p.puuid === puuid);
      return {
        match: {
          gameTimeMinutes: match.info.gameDuration / 60,
          win: participant.win,
        },
        kda: {
          kills: participant.kills,
          assists: participant.assists,
          deaths: participant.deaths,
        }
      };
    });
  
    return results;
  }
  
  main().then(results => {
    console.log(results);
  }).catch(error => {
    console.error('Error in main function:', error);
  });