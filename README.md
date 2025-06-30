# Stremio AIO (All-In-One) Catalog Builder

A powerful Stremio add-on that allows you to combine unlimited MDBList playlists into a single, unified catalog. Perfect for creating custom movie and TV show collections from multiple sources.

## Features

- 🎬 **Unlimited Playlists**: Add as many MDBList playlists as you want
- 🔄 **Auto-Sync**: Automatically fetches and caches content from MDBList
- 🎯 **Smart Filtering**: Genre-based filtering and deduplication
- 📱 **Modern UI**: Beautiful, responsive web interface for playlist management
- ⚡ **Fast Performance**: Efficient caching and parallel data fetching
- 🔗 **Easy Installation**: One-click Stremio add-on installation
- 🎭 **Both Movies & Series**: Full support for both content types

## Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <repository-url>
cd stremio-aio-catalog-builder

# Install dependencies
npm install

# Start the server
npm start
```

### 2. Configuration

1. Open your browser and go to `http://localhost:3000`
2. A unique user token will be automatically generated for you
3. Add your MDBList playlists using the web interface
4. Copy the generated Stremio add-on URL
5. Install the add-on in Stremio

### 3. Adding MDBList Playlists

To add a playlist, you'll need:
- **Playlist Name**: A friendly name for your playlist
- **MDBList ID**: The numeric ID from the MDBList URL (e.g., `12345` from `https://mdblist.com/lists/12345`)
- **API Key**: Your MDBList API key (get one free at [MDBList](https://mdblist.com/preferences/))

## How It Works

### Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Interface │────│   Node.js/Express│────│   MDBList API   │
│   (Management)  │    │      Server      │    │   (Data Source) │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                       ┌──────────────────┐
                       │   Stremio Client │
                       │   (Add-on Host)  │
                       └──────────────────┘
```

### Data Flow

1. **User Management**: Web interface allows adding/removing MDBList playlists
2. **Data Fetching**: Server fetches playlist data from MDBList API in parallel
3. **Data Processing**: Content is converted to Stremio format, deduplicated, and sorted
4. **Caching**: Results are cached for 1 hour to improve performance
5. **Stremio Integration**: Serves standard Stremio add-on manifest and catalog endpoints

### Stremio Add-on Structure

The add-on provides:
- **Manifest**: `/[userToken]/manifest.json` - Add-on configuration
- **Movie Catalog**: `/[userToken]/catalog/movie/aio-movies.json` - Combined movie listings
- **Series Catalog**: `/[userToken]/catalog/series/aio-series.json` - Combined TV show listings

## API Endpoints

### Stremio Add-on Endpoints

- `GET /:userToken/manifest.json` - Add-on manifest
- `GET /:userToken/catalog/:type/:id.json` - Catalog listings (with optional genre filtering and pagination)

### Management API

- `POST /api/generate-token` - Generate a new user token
- `GET /api/playlists/:userToken` - Get user's playlists
- `POST /api/playlists/:userToken` - Add a new playlist
- `DELETE /api/playlists/:userToken/:playlistId` - Remove a playlist
- `POST /api/test-mdblist` - Test MDBList connection

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and customize:

```bash
# Server port (default: 3000)
PORT=3000

# Cache TTL in seconds (default: 3600 = 1 hour)
CACHE_TTL=3600

# Maximum items per page (default: 100)
MAX_ITEMS_PER_PAGE=100
```

### MDBList Setup

1. Sign up at [MDBList](https://mdblist.com/register)
2. Get your free API key from [Preferences](https://mdblist.com/preferences/)
3. Create or find existing lists you want to include
4. Note the list ID from the URL (e.g., `https://mdblist.com/lists/12345` → ID is `12345`)

## Features in Detail

### Smart Content Processing

- **Deduplication**: Automatically removes duplicate entries based on IMDB ID
- **Sorting**: Content sorted by IMDB rating (descending) then by year (descending)
- **Format Conversion**: MDBList data converted to Stremio-compatible format
- **Genre Filtering**: Built-in genre filtering (Action, Comedy, Drama, Horror, Thriller, Sci-Fi)

### Performance Optimizations

- **Parallel Fetching**: All playlists fetched simultaneously for faster loading
- **Intelligent Caching**: 1-hour cache prevents excessive API calls
- **Pagination**: 100 items per page for optimal performance
- **Error Handling**: Graceful handling of API failures and network issues

### User Experience

- **Real-time Validation**: Test MDBList connections before adding
- **Visual Feedback**: Toast notifications for all actions
- **Responsive Design**: Works great on desktop and mobile
- **One-Click Installation**: Direct Stremio protocol integration

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses `nodemon` for automatic server restarts on file changes.

### Project Structure

```
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── public/
│   └── index.html         # Web interface
├── .env.example           # Environment variables example
└── README.md             # This file
```

## Troubleshooting

### Common Issues

**"Connection failed" when testing MDBList**
- Verify your API key is correct
- Check that the list ID exists and is public
- Ensure you have internet connectivity

**"No playlists added yet" in Stremio**
- Make sure you've added at least one playlist via the web interface
- Verify the add-on URL is correctly copied to Stremio
- Check that your user token hasn't changed

**Slow loading in Stremio**
- Large playlists may take time to load initially
- Subsequent loads will be faster due to caching
- Consider splitting very large lists into smaller ones

### Logs and Debugging

Server logs will show:
- MDBList API requests and responses
- Cache hits/misses
- Error details for troubleshooting

## Deployment

### Local Deployment

The app runs locally by default. To make it accessible to Stremio on other devices:

1. Ensure your computer allows incoming connections on the specified port
2. Use your computer's IP address instead of `localhost` in the add-on URL
3. Consider using a reverse proxy like nginx for HTTPS

### Production Deployment

For production deployment:

1. Use a proper database instead of in-memory storage
2. Implement user authentication if needed
3. Set up HTTPS for secure connections
4. Use a process manager like PM2
5. Configure proper logging and monitoring

## Contributing

Feel free to submit issues and pull requests. Some areas for improvement:

- Database integration for persistent storage
- User authentication and authorization
- Advanced filtering and search options
- Support for additional metadata sources
- Performance optimizations for large catalogs

## License

MIT License - feel free to use this project for any purpose.

## Credits

- Built for the [Stremio](https://stremio.com) ecosystem
- Powered by [MDBList](https://mdblist.com) data
- Uses the Stremio Add-on SDK specification