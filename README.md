## Description
[This project](https://chasemilligan.github.io/mobalyticscraper/) is a web scraping tool that uses [Node.js](https://nodejs.org/en) and [Playwright](https://playwright.dev/). I made it specifically to look at my friends and my stats over the last 10 solo queue games to see who gained the most LP in the least amount of time. But you can use it too! Just copy and paste you and your friends Riot ID's into the search bar separated by commas to see how you stack up against them!

## Installation
To install the necessary dependencies and set up the environment, run the following command:

```sh
npm run init
```

## Usage
To start the application, use the following command:

```sh
npm run start
```
This will execute the scrape.js script, which contains the main logic for scraping and serving data.

### Dependencies
- [cheerio](https://www.npmjs.com/package/cheerio) ^1.0.0-rc.12
- [cors](https://www.npmjs.com/package/cors) ^2.8.5
- [express](https://www.npmjs.com/package/express) ^4.19.2
- [playwright](https://www.npmjs.com/package/playwright) ^1.45.1
