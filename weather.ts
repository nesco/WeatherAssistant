#!/usr/bin/env node

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

    const { selectedLocation } = await inquirer.prompt([
        {
            type: 'list',
            name: 'selectedLocation',
            message: 'Which location did you mean?',
            choices: locationChoices.slice(0, 3),
        },
    ]);

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

    console.log(JSON.stringify(output, null, 2));

  } catch (error) {
    console.error('Error fetching weather data:', error);
  }
};

getWeather();
