// Cloudflare Worker for Stremio AIO Catalog Builder

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

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

// Helper function to add CORS headers
function addCorsHeaders(response) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// Helper function to handle CORS preflight
function handleCors() {
  return addCorsHeaders(new Response(null, { status: 200 }));
}

// Helper function to fetch MDBList data with caching
async function fetchMDBListData(listId, apiKey, cacheKey) {
  try {
    // Try to get from cache first
    const cached = await caches.default.match(`https://cache.internal/${cacheKey}`);
    if (cached) {
      const data = await cached.json();
      return data;
    }

    // Fetch from MDBList API
    const response = await fetch(`https://mdblist.com/api/lists/${listId}?apikey=${apiKey}`, {
      headers: {
        'User-Agent': 'Stremio-AIO-Catalog/1.0.0'
      }
    });

    if (!response.ok) {
      throw new Error(`MDBList API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Cache the response for 1 hour
    const cacheResponse = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=3600'
      }
    });
    
    await caches.default.put(`https://cache.internal/${cacheKey}`, cacheResponse);
    
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

// Generate random user token
function generateUserToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Get playlists from KV storage
async function getPlaylists(userToken, env) {
  try {
    const data = await env.PLAYLISTS.get(userToken);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting playlists:', error);
    return [];
  }
}

// Save playlists to KV storage
async function savePlaylists(userToken, playlists, env) {
  try {
    await env.PLAYLISTS.put(userToken, JSON.stringify(playlists));
    return true;
  } catch (error) {
    console.error('Error saving playlists:', error);
    return false;
  }
}

// Route handlers
async function handleManifest(request, userToken, env) {
  const userManifest = { ...manifest };
  
  if (userToken) {
    const playlists = await getPlaylists(userToken, env);
    if (playlists.length > 0) {
      userManifest.id = `community.stremio-aio-catalog-${userToken}`;
      userManifest.name = `AIO Catalog (${playlists.length} playlists)`;
    }
  }
  
  return addCorsHeaders(new Response(JSON.stringify(userManifest), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function handleCatalog(request, userToken, type, id, env) {
  const url = new URL(request.url);
  const genre = url.searchParams.get('genre');
  const skip = parseInt(url.searchParams.get('skip') || '0');
  
  try {
    const playlists = await getPlaylists(userToken, env);
    
    if (playlists.length === 0) {
      return addCorsHeaders(new Response(JSON.stringify({ metas: [] }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    let allItems = [];
    
    // Fetch all playlists in parallel
    const playlistPromises = playlists.map(async (playlist) => {
      const cacheKey = `mdblist_${playlist.listId}`;
      return await fetchMDBListData(playlist.listId, playlist.apiKey, cacheKey);
    });
    
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
    const limit = parseInt(env.MAX_ITEMS_PER_PAGE || '100');
    const startIndex = skip;
    const endIndex = startIndex + limit;
    const paginatedItems = uniqueItems.slice(startIndex, endIndex);

    return addCorsHeaders(new Response(JSON.stringify({ metas: paginatedItems }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.error('Error fetching catalog:', error);
    return addCorsHeaders(new Response(JSON.stringify({ error: 'Failed to fetch catalog' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

async function handleGetPlaylists(userToken, env) {
  const playlists = await getPlaylists(userToken, env);
  return addCorsHeaders(new Response(JSON.stringify(playlists), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function handleAddPlaylist(request, userToken, env) {
  try {
    const { name, listId, apiKey } = await request.json();
    
    if (!name || !listId || !apiKey) {
      return addCorsHeaders(new Response(JSON.stringify({ error: 'Name, List ID, and API Key are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    const playlists = await getPlaylists(userToken, env);
    
    const playlist = {
      id: Date.now().toString(),
      name,
      listId,
      apiKey,
      addedAt: new Date().toISOString()
    };
    
    playlists.push(playlist);
    await savePlaylists(userToken, playlists, env);
    
    return addCorsHeaders(new Response(JSON.stringify(playlist), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

async function handleRemovePlaylist(userToken, playlistId, env) {
  const playlists = await getPlaylists(userToken, env);
  
  const index = playlists.findIndex(p => p.id === playlistId);
  if (index === -1) {
    return addCorsHeaders(new Response(JSON.stringify({ error: 'Playlist not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
  
  playlists.splice(index, 1);
  await savePlaylists(userToken, playlists, env);
  
  return addCorsHeaders(new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function handleGenerateToken() {
  const userToken = generateUserToken();
  return addCorsHeaders(new Response(JSON.stringify({ userToken }), {
    headers: { 'Content-Type': 'application/json' }
  }));
}

async function handleTestMDBList(request) {
  try {
    const { listId, apiKey } = await request.json();
    
    const cacheKey = `test_${listId}_${Date.now()}`;
    const data = await fetchMDBListData(listId, apiKey, cacheKey);
    
    if (data) {
      return addCorsHeaders(new Response(JSON.stringify({ 
        success: true, 
        listName: data.name,
        itemCount: data.items ? data.items.length : 0
      }), {
        headers: { 'Content-Type': 'application/json' }
      }));
    } else {
      return addCorsHeaders(new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch list data' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  } catch (error) {
    return addCorsHeaders(new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    }));
  }
}

// Main fetch handler
export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Routes
    
    // Serve the main page
    if (pathname === '/') {
      return addCorsHeaders(new Response(HTML_CONTENT, {
        headers: { 'Content-Type': 'text/html' }
      }));
    }
    
    // Default manifest
    if (pathname === '/manifest.json') {
      return handleManifest(request, null, env);
    }
    
    // User-specific manifest
    const manifestMatch = pathname.match(/^\/([^\/]+)\/manifest\.json$/);
    if (manifestMatch) {
      return handleManifest(request, manifestMatch[1], env);
    }
    
    // Catalog endpoints
    const catalogMatch = pathname.match(/^\/([^\/]+)\/catalog\/([^\/]+)\/([^\/]+)\.json$/);
    if (catalogMatch) {
      return handleCatalog(request, catalogMatch[1], catalogMatch[2], catalogMatch[3], env);
    }
    
    // API endpoints
    if (pathname.startsWith('/api/')) {
      // Generate token
      if (pathname === '/api/generate-token' && request.method === 'POST') {
        return handleGenerateToken();
      }
      
      // Test MDBList
      if (pathname === '/api/test-mdblist' && request.method === 'POST') {
        return handleTestMDBList(request);
      }
      
      // Playlist management
      const playlistMatch = pathname.match(/^\/api\/playlists\/([^\/]+)(?:\/([^\/]+))?$/);
      if (playlistMatch) {
        const userToken = playlistMatch[1];
        const playlistId = playlistMatch[2];
        
        if (request.method === 'GET' && !playlistId) {
          return handleGetPlaylists(userToken, env);
        }
        
        if (request.method === 'POST' && !playlistId) {
          return handleAddPlaylist(request, userToken, env);
        }
        
        if (request.method === 'DELETE' && playlistId) {
          return handleRemovePlaylist(userToken, playlistId, env);
        }
      }
    }
    
    // 404 for unknown routes
    return addCorsHeaders(new Response('Not Found', { status: 404 }));
  }
};

// HTML content (embedded for simplicity in Workers)
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stremio AIO Catalog Builder</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        .gradient-bg {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .card-hover:hover {
            transform: translateY(-2px);
            transition: transform 0.2s ease-in-out;
        }
        .toast {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            transition: all 0.3s ease;
        }
    </style>
</head>
<body class="bg-gray-100 min-h-screen">
    <!-- Toast Container -->
    <div id="toast-container"></div>

    <!-- Header -->
    <header class="gradient-bg text-white shadow-lg">
        <div class="container mx-auto px-6 py-8">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-4xl font-bold flex items-center">
                        <i class="fas fa-stream mr-3"></i>
                        Stremio AIO Catalog Builder
                    </h1>
                    <p class="text-blue-100 mt-2">Build unlimited MDBList playlists into a single Stremio add-on</p>
                    <p class="text-blue-200 text-sm mt-1">
                        <i class="fas fa-cloud mr-1"></i>
                        Powered by Cloudflare Workers
                    </p>
                </div>
                <div class="text-right">
                    <div class="bg-white bg-opacity-20 px-4 py-2 rounded-lg">
                        <span class="text-sm">Your Token:</span>
                        <div class="font-mono text-lg" id="user-token">Loading...</div>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <main class="container mx-auto px-6 py-8">
        <!-- Add-on URL Section -->
        <section class="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <i class="fas fa-link mr-3 text-blue-600"></i>
                Your Stremio Add-on URL
            </h2>
            <div class="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-gray-300">
                <div class="flex items-center space-x-3">
                    <input type="text" id="addon-url" readonly 
                           class="flex-1 bg-white border border-gray-300 rounded-lg px-4 py-2 font-mono text-sm"
                           placeholder="Add playlists to generate your add-on URL">
                    <button onclick="copyUrl()" 
                            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                        <i class="fas fa-copy mr-2"></i>Copy
                    </button>
                    <button onclick="installAddon()" 
                            class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors">
                        <i class="fas fa-plus mr-2"></i>Install in Stremio
                    </button>
                </div>
                <p class="text-sm text-gray-600 mt-2">
                    <i class="fas fa-info-circle mr-1"></i>
                    Copy this URL and paste it in Stremio's add-on installation page
                </p>
            </div>
        </section>

        <!-- Add Playlist Section -->
        <section class="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <i class="fas fa-plus-circle mr-3 text-green-600"></i>
                Add MDBList Playlist
            </h2>
            <form id="add-playlist-form" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Playlist Name</label>
                        <input type="text" id="playlist-name" required
                               class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                               placeholder="e.g., My Movie Collection">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">MDBList ID</label>
                        <input type="text" id="list-id" required
                               class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                               placeholder="e.g., 12345">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">MDBList API Key</label>
                    <input type="password" id="api-key" required
                           class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                           placeholder="Your MDBList API key">
                </div>
                <div class="flex space-x-3">
                    <button type="button" onclick="testConnection()" 
                            class="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded-lg transition-colors">
                        <i class="fas fa-flask mr-2"></i>Test Connection
                    </button>
                    <button type="submit" 
                            class="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors">
                        <i class="fas fa-plus mr-2"></i>Add Playlist
                    </button>
                </div>
            </form>
        </section>

        <!-- Playlists List -->
        <section class="bg-white rounded-xl shadow-lg p-6">
            <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <i class="fas fa-list mr-3 text-purple-600"></i>
                Your Playlists
                <span id="playlist-count" class="ml-2 bg-purple-100 text-purple-800 text-sm px-2 py-1 rounded-full">0</span>
            </h2>
            <div id="playlists-container">
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-inbox text-6xl mb-4"></i>
                    <p class="text-lg">No playlists added yet</p>
                    <p class="text-sm">Add your first MDBList playlist above to get started</p>
                </div>
            </div>
        </section>
    </main>

    <!-- Footer -->
    <footer class="bg-gray-800 text-white py-8 mt-12">
        <div class="container mx-auto px-6 text-center">
            <p>&copy; 2024 Stremio AIO Catalog Builder. Built for the community.</p>
            <div class="mt-4 space-x-4">
                <a href="https://mdblist.com" target="_blank" class="text-blue-400 hover:text-blue-300">
                    <i class="fas fa-external-link-alt mr-1"></i>MDBList
                </a>
                <a href="https://stremio.com" target="_blank" class="text-blue-400 hover:text-blue-300">
                    <i class="fas fa-external-link-alt mr-1"></i>Stremio
                </a>
            </div>
        </div>
    </footer>

    <script>
        let userToken = null;
        let playlists = [];

        // Initialize the app
        document.addEventListener('DOMContentLoaded', async () => {
            await initializeUserToken();
            await loadPlaylists();
            updateUI();
        });

        // Initialize user token
        async function initializeUserToken() {
            try {
                const response = await fetch('/api/generate-token', { method: 'POST' });
                const data = await response.json();
                userToken = data.userToken;
                document.getElementById('user-token').textContent = userToken;
            } catch (error) {
                console.error('Error generating token:', error);
                showToast('Error generating user token', 'error');
            }
        }

        // Load playlists
        async function loadPlaylists() {
            if (!userToken) return;
            
            try {
                const response = await fetch(\`/api/playlists/\${userToken}\`);
                playlists = await response.json();
                renderPlaylists();
                updateUI();
            } catch (error) {
                console.error('Error loading playlists:', error);
                showToast('Error loading playlists', 'error');
            }
        }

        // Update UI elements
        function updateUI() {
            const count = playlists.length;
            document.getElementById('playlist-count').textContent = count;
            
            if (count > 0 && userToken) {
                const addonUrl = \`\${window.location.origin}/\${userToken}/manifest.json\`;
                document.getElementById('addon-url').value = addonUrl;
            } else {
                document.getElementById('addon-url').value = '';
            }
        }

        // Render playlists
        function renderPlaylists() {
            const container = document.getElementById('playlists-container');
            
            if (playlists.length === 0) {
                container.innerHTML = \`
                    <div class="text-center py-12 text-gray-500">
                        <i class="fas fa-inbox text-6xl mb-4"></i>
                        <p class="text-lg">No playlists added yet</p>
                        <p class="text-sm">Add your first MDBList playlist above to get started</p>
                    </div>
                \`;
                return;
            }

            container.innerHTML = playlists.map(playlist => \`
                <div class="border border-gray-200 rounded-lg p-4 mb-3 card-hover">
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <h3 class="font-semibold text-lg text-gray-800">\${playlist.name}</h3>
                            <p class="text-sm text-gray-600">List ID: \${playlist.listId}</p>
                            <p class="text-xs text-gray-500">Added: \${new Date(playlist.addedAt).toLocaleDateString()}</p>
                        </div>
                        <div class="flex space-x-2">
                            <button onclick="removePlaylist('\${playlist.id}')" 
                                    class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition-colors">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            \`).join('');
        }

        // Add playlist form handler
        document.getElementById('add-playlist-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('playlist-name').value;
            const listId = document.getElementById('list-id').value;
            const apiKey = document.getElementById('api-key').value;
            
            try {
                const response = await fetch(\`/api/playlists/\${userToken}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, listId, apiKey })
                });
                
                if (response.ok) {
                    showToast('Playlist added successfully!', 'success');
                    document.getElementById('add-playlist-form').reset();
                    await loadPlaylists();
                } else {
                    const error = await response.json();
                    showToast(error.error || 'Error adding playlist', 'error');
                }
            } catch (error) {
                console.error('Error adding playlist:', error);
                showToast('Error adding playlist', 'error');
            }
        });

        // Test connection
        async function testConnection() {
            const listId = document.getElementById('list-id').value;
            const apiKey = document.getElementById('api-key').value;
            
            if (!listId || !apiKey) {
                showToast('Please enter List ID and API Key', 'warning');
                return;
            }
            
            try {
                const response = await fetch('/api/test-mdblist', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listId, apiKey })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showToast(\`Connection successful! Found "\${data.listName}" with \${data.itemCount} items\`, 'success');
                } else {
                    showToast(data.error || 'Connection failed', 'error');
                }
            } catch (error) {
                console.error('Error testing connection:', error);
                showToast('Error testing connection', 'error');
            }
        }

        // Remove playlist
        async function removePlaylist(playlistId) {
            if (!confirm('Are you sure you want to remove this playlist?')) return;
            
            try {
                const response = await fetch(\`/api/playlists/\${userToken}/\${playlistId}\`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    showToast('Playlist removed successfully!', 'success');
                    await loadPlaylists();
                } else {
                    showToast('Error removing playlist', 'error');
                }
            } catch (error) {
                console.error('Error removing playlist:', error);
                showToast('Error removing playlist', 'error');
            }
        }

        // Copy URL to clipboard
        function copyUrl() {
            const urlInput = document.getElementById('addon-url');
            if (!urlInput.value) {
                showToast('Add some playlists first to generate URL', 'warning');
                return;
            }
            
            urlInput.select();
            document.execCommand('copy');
            showToast('Add-on URL copied to clipboard!', 'success');
        }

        // Install addon in Stremio
        function installAddon() {
            const url = document.getElementById('addon-url').value;
            if (!url) {
                showToast('Add some playlists first to generate URL', 'warning');
                return;
            }
            
            const stremioUrl = \`stremio://\${encodeURIComponent(url)}\`;
            window.open(stremioUrl, '_blank');
            showToast('Opening Stremio... If it doesn\\'t open automatically, copy the URL manually', 'info');
        }

        // Show toast notification
        function showToast(message, type = 'info') {
            const colors = {
                success: 'bg-green-500',
                error: 'bg-red-500',
                warning: 'bg-yellow-500',
                info: 'bg-blue-500'
            };
            
            const icons = {
                success: 'fa-check-circle',
                error: 'fa-exclamation-triangle',
                warning: 'fa-exclamation-circle',
                info: 'fa-info-circle'
            };
            
            const toast = document.createElement('div');
            toast.className = \`toast \${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-3\`;
            toast.innerHTML = \`
                <i class="fas \${icons[type]}"></i>
                <span>\${message}</span>
                <button onclick="this.parentElement.remove()" class="ml-4 text-white hover:text-gray-200">
                    <i class="fas fa-times"></i>
                </button>
            \`;
            
            document.getElementById('toast-container').appendChild(toast);
            
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 5000);
        }
    </script>
</body>
</html>`;