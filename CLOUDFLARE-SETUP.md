# Cloudflare Workers Setup Guide

This guide will help you deploy the Stremio AIO Catalog Builder to Cloudflare Workers for free, serverless hosting.

## Prerequisites

1. **Cloudflare Account**: Sign up at [Cloudflare](https://cloudflare.com) (free tier is sufficient)
2. **Node.js**: Install Node.js 16+ from [nodejs.org](https://nodejs.org)
3. **Git**: For cloning the repository

## Step-by-Step Setup

### 1. Clone and Prepare the Project

```bash
# Clone the repository
git clone <your-repository-url>
cd stremio-aio-catalog-builder

# Copy the Cloudflare-specific package.json
cp package-cloudflare.json package.json

# Install Wrangler CLI
npm install
```

### 2. Login to Cloudflare

```bash
# Login to your Cloudflare account
npx wrangler login
```

This will open a browser window for you to authenticate with Cloudflare.

### 3. Create KV Namespace

Cloudflare Workers KV is used to store user playlists data.

```bash
# Create the production KV namespace
npx wrangler kv:namespace create PLAYLISTS

# Create the preview KV namespace (for development)
npx wrangler kv:namespace create PLAYLISTS --preview
```

**Important**: Copy the namespace IDs from the output. You'll need them in the next step.

Example output:
```
🌀 Creating namespace with title "stremio-aio-catalog-PLAYLISTS"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "PLAYLISTS", id = "abc123def456" }
```

### 4. Update wrangler.toml

Edit the `wrangler.toml` file and replace the placeholder KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "PLAYLISTS"
preview_id = "your-preview-kv-namespace-id-here"  # From step 3
id = "your-production-kv-namespace-id-here"       # From step 3
```

### 5. Configure Your Worker Name (Optional)

In `wrangler.toml`, you can customize the worker name:

```toml
name = "your-custom-addon-name"  # This will be your subdomain
```

### 6. Deploy to Cloudflare Workers

```bash
# Deploy to production
npm run deploy

# Or deploy to staging first
npm run deploy:staging
```

### 7. Get Your Worker URL

After deployment, Wrangler will show your Worker URL:
```
Published stremio-aio-catalog (1.23s)
  https://stremio-aio-catalog.your-subdomain.workers.dev
```

## Usage

1. **Visit your Worker URL** in a browser
2. **Add MDBList playlists** using the web interface
3. **Copy the generated add-on URL** (will be something like: `https://your-worker.workers.dev/[token]/manifest.json`)
4. **Install in Stremio** by pasting the URL in Stremio's add-on installation

## Development

### Local Development

```bash
# Run the worker locally
npm run dev
```

This starts a local development server at `http://localhost:8787`

### View Logs

```bash
# Tail production logs
npm run tail
```

### Update Deployment

Simply run the deploy command again after making changes:

```bash
npm run deploy
```

## Configuration Options

### Environment Variables

You can set environment variables in `wrangler.toml`:

```toml
[vars]
CACHE_TTL = "7200"           # Cache time in seconds (default: 3600)
MAX_ITEMS_PER_PAGE = "50"    # Items per page (default: 100)
```

### Custom Domain (Optional)

If you have a custom domain in Cloudflare:

1. Add a route in `wrangler.toml`:
```toml
routes = [
  { pattern = "stremio.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

2. Deploy with the route:
```bash
npm run deploy
```

## Troubleshooting

### Common Issues

**"Namespace not found" error**
- Ensure you've created the KV namespaces and updated the IDs in `wrangler.toml`

**"Script not found" error**
- Make sure you're in the correct directory and `src/worker.js` exists

**"Authentication failed" error**
- Run `npx wrangler login` again

**Deployment takes too long**
- Check your internet connection
- Try deploying to staging first: `npm run deploy:staging`

### Performance Optimization

**Caching**: The worker automatically caches MDBList API responses for 1 hour using Cloudflare's edge cache.

**KV Storage**: User playlists are stored in Cloudflare KV, which has eventual consistency (usually under 60 seconds).

**Rate Limits**: Cloudflare Workers free tier includes:
- 100,000 requests per day
- 10ms CPU time per request
- Usually sufficient for personal use

## Advanced Configuration

### Multiple Environments

You can set up different environments (staging/production):

```toml
[env.staging]
name = "stremio-aio-catalog-staging"

[env.production]
name = "stremio-aio-catalog-production"
```

Deploy to specific environment:
```bash
npx wrangler deploy --env staging
npx wrangler deploy --env production
```

### Monitoring

View analytics in the Cloudflare dashboard:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to "Workers & Pages"
3. Click on your worker name
4. View the "Analytics" tab

## Security Notes

- **API Keys**: MDBList API keys are stored in Cloudflare KV (encrypted at rest)
- **User Tokens**: Generated randomly, no personal data stored
- **CORS**: Properly configured for Stremio integration
- **HTTPS**: All traffic automatically encrypted via Cloudflare

## Costs

- **Cloudflare Workers Free Tier**: 100,000 requests/day (usually enough for personal use)
- **KV Storage**: First 1GB free, then $0.50/GB per month
- **Bandwidth**: Free on Cloudflare's network

For most personal use cases, this setup runs completely free!

## Support

If you encounter issues:

1. Check the [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
2. View logs with `npm run tail`
3. Test locally with `npm run dev`
4. Check the [Wrangler Documentation](https://developers.cloudflare.com/workers/wrangler/)

## Migration from Node.js Version

If you have an existing Node.js deployment:

1. Your playlist data won't transfer automatically
2. Users will need to re-add their playlists
3. The add-on URLs will change to your new Workers domain
4. Consider running both versions temporarily during migration