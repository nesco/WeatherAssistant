# Weather Assistant CLI

A command-line tool to fetch current weather information from weather.com and create Google Calendar events.

## Installation

To use this tool, you need Node.js and npm installed on your system.

1. **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd weather-assistant
    ```

2. **Install dependencies:**

    ```bash
    npm install
    ```

3. **Link the package for local development (optional, but recommended for testing):**

    ```bash
    npm link
    ```

4. **Connect to you Google Calendat account**
    1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
    2. Create a new project.
    3. Enable the **Google Calendar API**.
    4. Create an **OAuth 2.0 Client ID** for a **Desktop app**.
    5. Download the credentials and save them as `credentials.json` in the root of this project.

## Usage

Once installed, you can use the `weather-assistant` command followed by a queston about the weather at your location to get the weather. The assistant can also create Google Calendar events.

To launch the weather TUI directly, run:
```bash
npm run tui "New York, NY"
```

If there are multiple matching locations, you will be prompted to select the correct one.

## Approach + Key Engineering & Product decision

- CLI to iterate faster on the engineering part
- Scrap the data directly from an HTML page instead of using the API by using CSS selectors. Also a product decision here as it's to demonstrate my engineering skills
- Build a TUI to be able to test the private API built over scraping weather.com
- Only retrieve the data from a single page ("/today") to limit latency
- Use the OpenAI API as their agent framework in Typescript is pleasent to work with
