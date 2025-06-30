#!/usr/bin/env node

import OpenAI from 'openai';
import { Agent, run, tool } from '@openai/agents';
import { z } from 'zod';
import { fetchLocations, fetchWeather } from './weather';
import { getCalendarClient } from './googleAuth';

const openai = new OpenAI();

const locationFetcherTool = tool({
  name: 'location fetcher',


  description: "Retrieve a list of possible places with a city's name or ZIP code, along with the corresponding placeID used by weather.com",
  parameters: z.object({query: z.string()}),
  async execute({ query }) {
   return fetchLocations(query);
  }
})

const weatherFetcherTool = tool({
  name: 'weather fetcher',
  description: "Retrieve current weather plus the two next day weather in JSON from weather.com. Temperature are by default in Fahrenheit and speed in mph.",
  parameters: z.object({placeId: z.string()}),
  async execute({ placeId }) {
   return fetchWeather(placeId);
  }
})


const calendarCreateTool = tool({
  name: 'calendar event creator',
  description:
    'Create a Google Calendar event summarising a weather forecast. '
    + 'Takes title, description, start (DateTime ISO or YYYY-MM-DD), end (DateTime ISO or YYYY-MM-DD), and an optional allDay boolean. '
    + 'For all-day events, provide dates as YYYY-MM-DD.',
  parameters: z.object({
    title: z.string(),
    description: z.string(),
    start: z.string(),
    end: z.string(),
    allDay: z.boolean().nullable().optional(),
  }),
  async execute({ title, description, start, end, allDay }) {
    const calendar = await getCalendarClient();
    
    const event: any = {
      summary: title,
      description,
    };

    if (allDay) {
      event.start = { date: start };
      event.end = { date: end };
    } else {
      event.start = { dateTime: start };
      event.end = { dateTime: end };
    }

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });
    return { htmlLink: res.data.htmlLink };
  },
});



const agent = new Agent({
  name: "Weather Assistant",
  model: 'gpt-4.1',
  instructions: `You are a weather assistant. Use the provided tools to answer questions about the weather, cut short any unrelated question.
  If the user don't provide any location, just ask to repeat his request with locations you could use to infer the weather.
  If you give temperatures give them both in Fahrenheit and Celsius, for speed do the same with mph and kph.
  Current date on the user system is: ${new Date().toISOString().slice(0,10)}
  When you invoke the tool named "calendar event creator":

• Use **exactly** these camelCase keys:  
{
  "title": string,          // required
  "description": string,    // required
  "start": ISO-8601 string, // optional
  "end": ISO-8601 string,    // optional
  "allDay": boolean         // optional
}
• For all-day events, provide dates as YYYY-MM-DD.
• Be sure startDateTime and endDateTime differ (≥ 30 min); otherwise Google rejects the event.
  `,
  tools: [
    locationFetcherTool,
    weatherFetcherTool,
    calendarCreateTool,
  ],
});

const askWeatherAssistant = async () => {
  const instruction = process.argv[2];
  if (!instruction) {
    console.error('Ask a weather related questions');
    process.exit(1);
  }

  try {
    const result = await run(agent, instruction);
    console.log(result.finalOutput);
  } catch (error) {
    console.error("Error :", error);
  }
  
}

if (require.main === module) {
  askWeatherAssistant();
}