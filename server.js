const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Cache with 1 hour TTL
const cache = new NodeCache({ stdTTL: 3600 });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for playlists (in production, use a database)
let userPlaylists = {};

// Stremio add-on manifest
const manifest = {
  id: 'community.stremio-aio-catalog',
  version: '1.0.0',
  name: 'AIO Catalog Builder',
  description: 'All-In-One catalog builder for MDBList playlists',
  logo: 'https://via.placeholder.com/256x256/2196F3/ffffff?text=AIO',
  background: 'https://via.placeholder.com/1920x1080/1976D2/ffffff?text=AIO+Catalog',
  resources: ['catalog'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'aio-movies',
      name: 'AIO Movies',
      extra: [
        { name: 'genre', options: ['action', 'comedy', 'drama', 'horror', 'thriller', 'sci-fi'] },
        { name: 'skip', isRequired: false }
      ]
    },
    {
      type: 'series',
      id: 'aio-series',
      name: 'AIO Series',
      extra: [
        { name: 'genre', options: ['action', 'comedy', 'drama', 'horror', 'thriller', 'sci-fi'] },
        { name: 'skip', isRequired: false }
      ]
    }
  ]
};

// Helper function to fetch MDBList data
async function fetchMDBListData(listId, apiKey) {
  try {
    const cacheKey = `mdblist_${listId}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      return cachedData;
    }

    const response = await axios.get(`https://mdblist.com/api/lists/${listId}`, {
      params: { apikey: apiKey },
      timeout: 10000
    });

    const data = response.data;
    cache.set(cacheKey, data);
    return data;
  } catch (error) {
    console.error(`Error fetching MDBList ${listId}:`, error.message);
    return null;
  }
}

// Helper function to convert MDBList item to Stremio format
function convertToStremioFormat(item) {
  const stremioItem = {
    id: item.imdb_id || item.tmdb_id?.toString() || item.id?.toString(),
    type: item.mediatype === 'show' ? 'series' : 'movie',
    name: item.title,
    poster: item.poster_url || `https://via.placeholder.com/300x450/424242/ffffff?text=${encodeURIComponent(item.title)}`,
    background: item.backdrop_url,
    description: item.description || item.plot,
    year: item.year,
    imdbRating: item.imdb_rating,
    genres: item.genres || [],
    director: item.director ? [item.director] : undefined,
    cast: item.cast || undefined,
    runtime: item.runtime,
    country: item.country,
    language: item.language
  };

  // Clean up undefined values
  Object.keys(stremioItem).forEach(key => {
    if (stremioItem[key] === undefined || stremioItem[key] === null) {
      delete stremioItem[key];
    }
  });

  return stremioItem;
}

// Routes

// Serve the configuration page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get manifest
app.get('/manifest.json', (req, res) => {
  res.json(manifest);
});

// Get manifest with user configuration
app.get('/:userToken/manifest.json', (req, res) => {
  const { userToken } = req.params;
  const userManifest = { ...manifest };
  
  if (userPlaylists[userToken]) {
    userManifest.id = `community.stremio-aio-catalog-${userToken}`;
    userManifest.name = `AIO Catalog (${userPlaylists[userToken].length} playlists)`;
  }
  
  res.json(userManifest);
});

// Get catalog
app.get('/:userToken/catalog/:type/:id.json', async (req, res) => {
  const { userToken, type, id } = req.params;
  const { genre, skip = 0 } = req.query;
  
  try {
    const playlists = userPlaylists[userToken] || [];
    
    if (playlists.length === 0) {
      return res.json({ metas: [] });
    }

    let allItems = [];
    
    // Fetch all playlists in parallel
    const playlistPromises = playlists.map(playlist => 
      fetchMDBListData(playlist.listId, playlist.apiKey)
    );
    
    const playlistResults = await Promise.all(playlistPromises);
    
    // Combine all items
    playlistResults.forEach((playlistData, index) => {
      if (playlistData && playlistData.items) {
        const playlistInfo = playlists[index];
        playlistData.items.forEach(item => {
          if (item.mediatype === type || (type === 'movie' && item.mediatype === 'movie') || (type === 'series' && item.mediatype === 'show')) {
            const stremioItem = convertToStremioFormat(item);
            stremioItem.playlistName = playlistInfo.name;
            allItems.push(stremioItem);
          }
        });
      }
    });

    // Filter by genre if specified
    if (genre && genre !== 'all') {
      allItems = allItems.filter(item => 
        item.genres && item.genres.some(g => 
          g.toLowerCase().includes(genre.toLowerCase())
        )
      );
    }

    // Remove duplicates based on IMDB ID
    const uniqueItems = allItems.reduce((acc, item) => {
      if (!acc.find(existing => existing.id === item.id)) {
        acc.push(item);
      }
      return acc;
    }, []);

    // Sort by IMDB rating (descending) and year (descending)
    uniqueItems.sort((a, b) => {
      if (b.imdbRating !== a.imdbRating) {
        return (b.imdbRating || 0) - (a.imdbRating || 0);
      }
      return (b.year || 0) - (a.year || 0);
    });

    // Implement pagination
    const limit = 100;
    const startIndex = parseInt(skip);
    const endIndex = startIndex + limit;
    const paginatedItems = uniqueItems.slice(startIndex, endIndex);

    res.json({ metas: paginatedItems });
  } catch (error) {
    console.error('Error fetching catalog:', error);
    res.status(500).json({ error: 'Failed to fetch catalog' });
  }
});

// API Routes for playlist management

// Get user playlists
app.get('/api/playlists/:userToken', (req, res) => {
  const { userToken } = req.params;
  const playlists = userPlaylists[userToken] || [];
  res.json(playlists);
});

// Add playlist
app.post('/api/playlists/:userToken', (req, res) => {
  const { userToken } = req.params;
  const { name, listId, apiKey } = req.body;
  
  if (!name || !listId || !apiKey) {
    return res.status(400).json({ error: 'Name, List ID, and API Key are required' });
  }
  
  if (!userPlaylists[userToken]) {
    userPlaylists[userToken] = [];
  }
  
  const playlist = {
    id: Date.now().toString(),
    name,
    listId,
    apiKey,
    addedAt: new Date().toISOString()
  };
  
  userPlaylists[userToken].push(playlist);
  res.json(playlist);
});

// Remove playlist
app.delete('/api/playlists/:userToken/:playlistId', (req, res) => {
  const { userToken, playlistId } = req.params;
  
  if (!userPlaylists[userToken]) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const index = userPlaylists[userToken].findIndex(p => p.id === playlistId);
  if (index === -1) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  
  userPlaylists[userToken].splice(index, 1);
  res.json({ success: true });
});

// Generate user token
app.post('/api/generate-token', (req, res) => {
  const userToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  res.json({ userToken });
});

// Test MDBList connection
app.post('/api/test-mdblist', async (req, res) => {
  const { listId, apiKey } = req.body;
  
  try {
    const data = await fetchMDBListData(listId, apiKey);
    if (data) {
      res.json({ 
        success: true, 
        listName: data.name,
        itemCount: data.items ? data.items.length : 0
      });
    } else {
      res.status(400).json({ success: false, error: 'Failed to fetch list data' });
    }
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Stremio AIO Catalog Builder running on port ${PORT}`);
  console.log(`Configuration interface: http://localhost:${PORT}`);
});