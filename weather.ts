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
import minimist from 'minimist';
import * as cheerio from 'cheerio';

import { getCalendarClient } from './googleAuth';

const ENDPOINTS: Record<string, string> = {
  location: 'https://weather.com/api/v1/p/redux-dal',
  weatherToday: 'https://weather.com/weather/today',
}

const SELECTORS: Record<string, string> = {
  // Contaner selectors
  followingDays: '[data-testid="DailyWeatherModule"] [data-testid="WeatherTable"] > li',
  today: '[id^="WxuTodayWeatherCard-main-"]',
  todayDetails: '[data-testid="TodaysDetailsModule"]',


  // Weather information selectors
  currentTemp: '[class*="CurrentConditions--tempValue--"]',
  currentCondition: '[class*="CurrentConditions--phraseValue"]',

  chanceOfRain: '[class*="Column--precip--"]',
  condition: '[class*="Column--iconPhrase--"]',
  temperature: '[data-testid="TemperatureValue"]',
  wind: '[data-testid="Wind"]',
  percentage: '[data-testid="PercentageValue"]',

  uvIndex: '[data-testid="UVIndexValue"]', 

  // Period of day selector
  periodOfDay: '[class*="Column--active--"]',
  time: '[class*="CurrentConditions--timestamp--"]',

}

// Data structure to store the weather of the current day
interface DayWeather {
  // Global
  tempHigh: number | null;
  tempLow: number | null;

  // Current
  currentTime: string | null;
  currentTemp: number | null;
  currentFeltTemp: number | null;
  currentCondition: string | null;
  currentHumidity: string | null;
  currentUvIndex: string | null;
  currentWind: string | null;

  // Breakdown
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
  currentDayStage: string | null;
}

// Data structure to store the weather of the next two days
interface DayRoundWeather {
  date: string | null;
  condition: string | null;
  chanceOfRain: string | null;
  tempLow: number | null;
  tempHigh: number | null;
}

interface Location {
  placeId: string;
  name: string;
}

// Helpers
const normalizeTemperature = (temp: string): number | null => {
  return temp.length > 0 ? parseInt(temp.replace('°', ''), 10) : null;
}

const displayWeather = async (location: string, today: DayWeather, next: DayRoundWeather[]) => {
    const chalk = (await import('chalk')).default;

    console.log(`\n${chalk.bold.yellowBright(`Weather for ${location}`)}\n`);


    console.log(chalk.bold.cyan(`Today's Details`));
    console.log(`High: ${today.tempHigh}°F, Low: ${today.tempLow}°F`);
    console.log(`As of ${today.currentTime} - ${today.currentCondition} - ${today.currentTemp}°F felt ${today.currentFeltTemp}°F - UV Index: ${today.currentUvIndex}`);
    console.log(`UV Index: ${today.currentUvIndex} - Wind: ${today.currentWind} - Humidity: ${today.currentHumidity}`);

    console.log(chalk.bold.cyan(`\nToday's Forecast`));
    if (today.currentDayStage) {
      console.log(chalk.bold.magenta(`Current period: ${today.currentDayStage}`))
    }
    console.log(`${chalk.bold('Morning:')} ${today.morningCondition} - ${today.morningTemperature}°F with a ${today.morningChanceOfRain} chance of rain.`);
    console.log(`${chalk.bold('Afternoon:')} ${today.afternoonCondition} - ${today.afternoonTemperature}°F with a ${today.afternoonChanceOfRain} chance of rain.`);
    console.log(`${chalk.bold('Evening:')} ${today.eveningCondition} - ${today.eveningTemperature}°F with a ${today.eveningChanceOfRain} chance of rain.`);
    console.log(`${chalk.bold('Overnight:')} ${today.overnightCondition} - ${today.overnightTemperature}°F with a ${today.overnightChanceOfRain} chance of rain.`);

    console.log(chalk.bold.cyan(`\nUpcoming Days`));
    next.forEach(day => {
        console.log(`${chalk.bold(day.date || 'Unknown Date')}: ${day.condition} - High: ${day.tempHigh}°F, Low: ${day.tempLow}°F with a ${day.chanceOfRain} chance of rain.`);
    });

}

/**
 * Fetches the most probable locations and their IDs from weather.com based on a search query
 * 
 * @param query - A string containing a city name or zip code to search for
 * @returns Promise containing an array of Location objects with placeId and formatted name
 */
export const fetchLocations = async (query: string): Promise<Location[]> => {
  const locationResponse = await axios.post(ENDPOINTS.location, [
    {
      name: 'getSunV3LocationSearchUrlConfig',
      params: { query, language: 'en-US', locationType: 'locale' },
    },
  ]);

  const dalResponse = locationResponse.data.dal.getSunV3LocationSearchUrlConfig;
  const dynamicKey = Object.keys(dalResponse)[0];
  const locationsRaw = dalResponse[dynamicKey].data.location;

  const locations: Location[] = [];
  if (locationsRaw && locationsRaw.placeId) {
    for (let i = 0; i < locationsRaw.placeId.length; i++) {
      locations.push({
          placeId: locationsRaw.placeId[i],
          name: `${locationsRaw.city[i]}, ${locationsRaw.adminDistrict[i]}, ${locationsRaw.country[i]}`,
      });
    }
  }
  return locations
}

/**
 * Fetches today's weather and the next two days' weather from weather.com
 * Temperatures are given in Fahrenheits (°F)
 * 
 * @param placeId - The place ID from weather.com location search
 * @returns Promise containing today's weather data and next two days' weather data
 */
export const fetchWeather = async (placeId: string): Promise<{today: DayWeather, next: DayRoundWeather[]}> => {

  // Then fetch the weather page from weather.com
  const weatherPageUrl = `${ENDPOINTS.weatherToday}/l/${placeId}`;
  const weatherPage = await axios.get(weatherPageUrl);

  // Then scrap the data from the website
  const $ = cheerio.load(weatherPage.data);

  const getText = (selector: string, context?: any) => {
    const element = $(selector, context);
    if (element.length > 0) {
      const text = element.text().trim();
      return text || null;
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
    // clone so we don't mangle the real DOM  
    // then remove every child element/text node  
    // then read what's left (the "1%")
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
    return normalizeTemperature(text || "");
  };

  // Extract today detail
  const todayDetailsCard = $(SELECTORS.todayDetails);

  const currentTemp = getTemp(SELECTORS.currentTemp);
  const currentFeltTemp = getTemp(SELECTORS.temperature, todayDetailsCard);
  const currentCondition = getText(SELECTORS.currentCondition);
  const currentTime = getText(SELECTORS.time)?.replace("As of ", "") || null;
  const currentUvIndex = getText(SELECTORS.uvIndex, todayDetailsCard);
  const currentWind = getText(SELECTORS.wind, todayDetailsCard);
  const currentHumidity = getPercentage(SELECTORS.percentage, todayDetailsCard);


  const highTemp = normalizeTemperature(todayDetailsCard.find(SELECTORS.temperature).first().text());
  const lowTemp = normalizeTemperature(todayDetailsCard.find(SELECTORS.temperature).last().text());

  // Extract info by quarters
  const todayCard = SELECTORS.today;
  const getSegmentData = (segment: number) => {
      const segmentEl = $(`${todayCard} ul > li:nth-child(${segment})`);
      return {
          temp: getTemp(SELECTORS.temperature, segmentEl),
          condition: getText(SELECTORS.condition, segmentEl),
          rain: getPercentage(SELECTORS.chanceOfRain, segmentEl),
          active: segmentEl.is(SELECTORS.periodOfDay),
      };
  };

  const morning = getSegmentData(1);
  const afternoon = getSegmentData(2);
  const evening = getSegmentData(3);
  const overnight = getSegmentData(4);

  let currentDayStage: string | null = null;
  if (morning.active) {
    currentDayStage = 'Morning';
  } else if (afternoon.active) {
    currentDayStage = 'Afternoon';
  } else if (evening.active) {
    currentDayStage = 'Evening';
  } else if (overnight.active) {
    currentDayStage = 'Overnight';
  }

  const today: DayWeather = {
    // Global
    tempHigh: highTemp,
    tempLow: lowTemp,
    
    // Current
    currentTime: currentTime,
    currentUvIndex: currentUvIndex,
    currentCondition: currentCondition,
    currentTemp: currentTemp,
    currentFeltTemp: currentFeltTemp,
    currentWind: currentWind,
    currentHumidity: currentHumidity,

    // Breakdown
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
    currentDayStage,
  };

  const next: DayRoundWeather[] = [];
$(SELECTORS.followingDays).slice(1).each((i, el) => {
      const dayCard = $(el);
      const highTemp = normalizeTemperature(dayCard.find(SELECTORS.temperature).first().text());
      const lowTemp = normalizeTemperature(dayCard.find(SELECTORS.temperature).last().text());

      next.push({
          date: getText('h3 span', dayCard),
          condition: getText(SELECTORS.condition, dayCard),
          chanceOfRain: getPercentage(SELECTORS.chanceOfRain, dayCard),
          tempHigh: highTemp,
          tempLow: lowTemp,
      });
  });

    return {today, next}
}

/**
 * Provides a Text User Interface (TUI) to fetch weather data from weather.com
 * 
 * This function serves as the main entry point for the weather assistant CLI tool.
 * It handles the complete workflow of:
 * 1. Accepting a location query from command line arguments
 * 2. Fetching possible matching locations from weather.com
 * 3. Allowing user selection when multiple locations match (in interactive mode)
 * 4. Retrieving detailed weather data for the selected location
 * 5. Displaying formatted weather information to the user
 * 
 * @async
 * @function weatherTUI
 * @throws {Error} When location query is missing, no locations found, or weather fetch fails
 */
const weatherTUI = async () => {
  const argv = minimist(process.argv.slice(2));
  const query = argv._[0];          // city
  const toCalendar = argv.calendar; // boolean

  if (!query) {
    console.error('Please provide a city or zip code.');
    process.exit(1);
  }

  try {
  
    // First retrieve the possible locations for the given query
    const locations = await fetchLocations(query);

    // Then ask the user which is right
    // Take the first on non-interactive environments
    const locationChoices = locations.slice(0, 3).map(location => ({
      name: location.name,
      value: location
    }));

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
          choices: locationChoices,
        },
      ]);
      selectedLocation = answer.selectedLocation;
    } else {
      selectedLocation = locationChoices[0].value;
    }

    const {today, next} = await fetchWeather(selectedLocation.placeId);
    // Finally display the data
    displayWeather(selectedLocation.name, today, next)

    if (toCalendar) {
      const calendar = await getCalendarClient();
      const event: any = {
        summary: `Weather – ${selectedLocation.name}`,
        description: `High ${today.tempHigh}°F / Low ${today.tempLow}°F\n`
                   + `${today.currentCondition}`,
        start: { date: new Date().toISOString().slice(0,10) },
        end:   { date: new Date().toISOString().slice(0,10) },
      };

      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });
      console.log('✔ Added to Google Calendar');
    }

  } catch (error) {
    console.error('Error fetching weather data:', error);
  }
};


if (require.main === module) {
  weatherTUI();
}
