# Weather Assistant CLI

A command-line tool to fetch current weather information from weather.com.

## Installation

To use this tool, you need Node.js and npm installed on your system.

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd weather-assistant
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Link the package for local development (optional, but recommended for testing):**
    ```bash
    npm link
    ```

## Usage

Once installed, you can use the `weather-assistant` command followed by a location.

```bash
weather-assistant "New York, NY"
```

If there are multiple matching locations, you will be prompted to select the correct one.