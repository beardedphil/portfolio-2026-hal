# Vite + React Scaffold

An opinionated Vite + React scaffold (template) that deploys successfully on first commit and provides a consistent baseline for new projects.

## Features

- ✅ **Zero-config deployment** - Deploys to Vercel on first commit without manual changes
- ✅ **Version metadata** - Displays app name, environment, git commit SHA, and build timestamp
- ✅ **Version JSON endpoint** - Access `/version.json` for build metadata
- ✅ **Idle-aware reload** - Automatically refreshes UI when app returns from background/idle state
- ✅ **Supabase integration** - Environment variable configuration with clear error messages

## Quick Start

1. **Use this template** to create a new repository
2. **Clone your new repository**
3. **Install dependencies:**
   ```bash
   npm install
   ```
4. **Start development server:**
   ```bash
   npm run dev
   ```
5. **Deploy to Vercel:**
   - Connect your repository to Vercel
   - Vercel will automatically detect the Vite configuration
   - The app will deploy successfully on first commit

## Configuration

### Supabase (Optional)

If you want to use Supabase, create a `.env` file:

```bash
cp .env.example .env
```

Then add your Supabase credentials:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The app will show a clear error message if these variables are missing, but will continue to work without them.

### App Name

Set a custom app name via environment variable:

```
VITE_APP_NAME=My Awesome App
```

## Project Structure

```
.
├── public/          # Static assets
├── src/
│   ├── components/  # React components
│   │   ├── Version.tsx
│   │   └── SupabaseStatus.tsx
│   ├── hooks/       # Custom React hooks
│   │   └── useIdleReload.ts
│   ├── App.tsx      # Main app component
│   ├── App.css
│   ├── App.tsx
│   ├── main.tsx     # Entry point
│   └── index.css    # Global styles
├── vite/            # Vite plugins
│   └── version-plugin.ts
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json      # Vercel deployment config
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run type-check` - Run TypeScript type checking

## Version Information

The scaffold includes version metadata that's automatically generated during build:

- **App Name** - From `VITE_APP_NAME` env var or default
- **Environment** - `development`, `preview`, or `production` (auto-detected on Vercel)
- **Git Commit SHA** - Full commit hash from git
- **Build Timestamp** - ISO timestamp of when the build was created

This information is:
- Displayed in the UI in the "Version" section
- Available via `/version.json` endpoint
- Automatically updated on each build

## Idle-Aware Reload

The scaffold includes an "idle-aware reload" feature that automatically refreshes the UI when:
- The app has been idle in the background for 5+ minutes
- The user returns to the app (tab becomes visible or window gains focus)

This ensures users always see the latest version without needing to manually refresh.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub/GitLab/Bitbucket
2. Import the repository in Vercel
3. Vercel will auto-detect the Vite configuration
4. Deploy!

The `vercel.json` file ensures proper routing for the SPA.

### Other Platforms

The scaffold should work on any platform that supports:
- Node.js build environment
- Static file serving
- SPA routing (rewrite all routes to `index.html`)

## License

MIT
