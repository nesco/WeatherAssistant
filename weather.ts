#!/usr/bin/env node

/**
 * @fileoverview CLI tool to fetch current weather information from weather.com
 * 
 * This module provides a command-line interface to retrieve weather data including:
 * - Today's weather with morning, afternoon, evening, and overnight forecasts
 * - Next two days' weather with high/low temperatures and conditions
 * 
 * All temperature values are returned in Fahrenheit by default.
 * 
 * ## Installation
 * 
 * To use this tool, you need Node.js and npm installed on your system.
 * 
 * 1.  **Install dependencies:**
 *     ```bash
 *     npm install
 *     ```
 * 
 * 2.  **Link the package for local development (optional, but recommended for testing):**
 *     ```bash
 *     npm link
 *     ```
 * 
 * ## Usage
 * 
 * Once installed, you can use the `weather-assistant` command followed by a location.
 * 
 * ```bash
 * weather-assistant "New York, NY"
 * ```
 * 
 * If there are multiple matching locations, you will be prompted to select the correct one.
 * 
 * @author Emmanuel Federbusch
 * @version 1.0.0
 */

import axios from 'axios';
import inquirer from 'inquirer';
import * as cheerio from 'cheerio';

const ENDPOINTS: Record<string, string> = {
  location: 'https://weather.com/api/v1/p/redux-dal',
  weatherToday: 'https://weather.com/weather/today',
}

const SELECTORS: Record<string, string> = {
  // Container selectors
  followingDays: '[data-testid="DailyWeatherModule"] [data-testid="WeatherTable"] > li',
  today: '[id^="WxuTodayWeatherCard-main-"]',

  // Weather information selectors
  chanceOfRain: '[class*="Column--precip--"]',
  condition: '[class*="Column--iconPhrase--"]',
  temperature: '[data-testid="TemperatureValue"]',

}

// Data structure to store the weather of the current day
interface DayWeather {
  morningChanceOfRain: string | null;
  morningCondition: string | null;
  morningTemperature: number | null;
  afternoonChanceOfRain: string | null;
  afternoonCondition: string | null;
  afternoonTemperature: number | null;
  eveningChanceOfRain: string | null;
  eveningCondition: string | null;
  eveningTemperature: number | null;
  overnightChanceOfRain: string | null;
  overnightCondition: string | null;
  overnightTemperature: number | null;
}

// Data structure to store the weather of the next two days
interface DayRoundWeather {
  date: string | null;
  condition: string | null;
  chanceOfRain: string | null;
  tempLow: number | null;
  tempHigh: number | null;
}

const getWeather = async () => {
  const query = process.argv[2];
  if (!query) {
    console.error('Please provide a city or zip code.');
    process.exit(1);
  }

  try {
    const locationResponse = await axios.post(ENDPOINTS.location, [
      {
        name: 'getSunV3LocationSearchUrlConfig',
        params: { query, language: 'en-US', locationType: 'locale' },
      },
    ]);

    const dalResponse = locationResponse.data.dal.getSunV3LocationSearchUrlConfig;
    const dynamicKey = Object.keys(dalResponse)[0];
    const locations = dalResponse[dynamicKey].data.location;

    const locationChoices = [];
    if (locations && locations.placeId) {
      for (let i = 0; i < locations.placeId.length; i++) {
        locationChoices.push({
          name: `${locations.city[i]}, ${locations.adminDistrict[i]}, ${locations.country[i]}`,
          value: {
            placeId: locations.placeId[i],
            display: `${locations.city[i]}, ${locations.adminDistrict[i]}, ${locations.country[i]}`,
          }
        });
      }
    }

    if (locationChoices.length === 0) {
      console.error('No locations found for the given query.');
      process.exit(1);
    }

    let selectedLocation;
    if (locationChoices.length > 1 && process.stdout.isTTY) {
      const answer = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedLocation',
          message: 'Which location did you mean?',
          choices: locationChoices.slice(0, 3),
        },
      ]);
      selectedLocation = answer.selectedLocation;
    } else {
      selectedLocation = locationChoices[0].value;
    }

    const weatherPageUrl = `${ENDPOINTS.weatherToday}/l/${selectedLocation.placeId}`;
    const weatherPage = await axios.get(weatherPageUrl);
    const $ = cheerio.load(weatherPage.data);

    const getText = (selector: string, context?: any) => {
      const element = $(selector, context);
      if (element.length > 0) {
        return element.text().trim();
      }
      console.error(`Warning: Selector not found: ${selector}`);
      return null;
    };

    const getPercentage = (selector: string, context?: any) => {
      const $el = $(selector, context);
      if (!$el.length) {
        console.error(`Warning: Selector not found: ${selector}`);
        return null;
      }
      // clone so we don’t mangle the real DOM  
      // then remove every child element/text node  
      // then read what's left (the “1%”)
      return $el
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim();
    };
    


    const getTemp = (selector: string, context?: any) => {
      const text = getText(selector, context);
      return text ? parseInt(text.replace('°', ''), 10) : null;
    };

    const todayCard = SELECTORS.today;
    const getSegmentData = (segment: number) => {
        const segmentEl = $(`${todayCard} ul > li:nth-child(${segment})`);
        return {
            temp: getTemp(SELECTORS.temperature, segmentEl),
            condition: getText(SELECTORS.condition, segmentEl),
            rain: getPercentage(SELECTORS.chanceOfRain, segmentEl),
        };
    };

    const morning = getSegmentData(1);
    const afternoon = getSegmentData(2);
    const evening = getSegmentData(3);
    const overnight = getSegmentData(4);

    const today: DayWeather = {
      morningTemperature: morning.temp,
      morningCondition: morning.condition,
      morningChanceOfRain: morning.rain,
      afternoonTemperature: afternoon.temp,
      afternoonCondition: afternoon.condition,
      afternoonChanceOfRain: afternoon.rain,
      eveningTemperature: evening.temp,
      eveningCondition: evening.condition,
      eveningChanceOfRain: evening.rain,
      overnightTemperature: overnight.temp,
      overnightCondition: overnight.condition,
      overnightChanceOfRain: overnight.rain,
    };

    const next: DayRoundWeather[] = [];
  $(SELECTORS.followingDays).slice(1, 3).each((i, el) => {
        const dayCard = $(el);
        const highTemp = dayCard.find(SELECTORS.temperature).first();
        const lowTemp = dayCard.find(SELECTORS.temperature).last();

        next.push({
            date: getText('h3 span', dayCard),
            condition: getText(SELECTORS.condition, dayCard),
            chanceOfRain: getPercentage(SELECTORS.chanceOfRain, dayCard),
            tempHigh: highTemp.length > 0 ? parseInt(highTemp.text().replace('°', ''), 10) : null,
            tempLow: lowTemp.length > 0 ? parseInt(lowTemp.text().replace('°', ''), 10) : null,
        });
    });

    const output = {
      location: selectedLocation.display,
      today,
      next,
    };

    const chalk = (await import('chalk')).default;

    console.log(`\n${chalk.bold.yellowBright(`Weather for ${output.location}`)}\n`);

    console.log(chalk.bold.cyan(`Today's Forecast`));
    console.log(`${chalk.bold('Morning:')} ${output.today.morningCondition} - ${output.today.morningTemperature}°F with a ${output.today.morningChanceOfRain} chance of rain.`);
    console.log(`${chalk.bold('Afternoon:')} ${output.today.afternoonCondition} - ${output.today.afternoonTemperature}°F with a ${output.today.afternoonChanceOfRain} chance of rain.`);
    console.log(`${chalk.bold('Evening:')} ${output.today.eveningCondition} - ${output.today.eveningTemperature}°F with a ${output.today.eveningChanceOfRain} chance of rain.`);
    console.log(`${chalk.bold('Overnight:')} ${output.today.overnightCondition} - ${output.today.overnightTemperature}°F with a ${output.today.overnightChanceOfRain} chance of rain.`);

    console.log(chalk.bold.cyan(`\nUpcoming Days`));
    output.next.forEach(day => {
        console.log(`${chalk.bold(day.date || 'Unknown Date')}: ${day.condition} - High: ${day.tempHigh}°F, Low: ${day.tempLow}°F with a ${day.chanceOfRain} chance of rain.`);
    });


  } catch (error) {
    console.error('Error fetching weather data:', error);
  }
};

getWeather();
