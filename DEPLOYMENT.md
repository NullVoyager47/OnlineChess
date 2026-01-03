# Deployment Guide

## Backend on Render

1. **Push your code to GitHub** (if not already)
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Create a Render account**
   - Go to https://render.com
   - Sign up with GitHub

3. **Deploy the backend**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `onlinechess-server` (or anything)
     - **Root Directory**: `server`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Plan**: Free
   - Click "Create Web Service"
   - Wait for deployment (2-3 minutes)
   - Copy your service URL (e.g., `https://onlinechess-server.onrender.com`)

## Frontend on GitHub Pages

1. **Update frontend to use production backend**
   
   In your terminal (in the `frontend` folder):
   ```bash
   # Set the production socket URL (replace with YOUR Render URL)
   $Env:VITE_SOCKET_URL="https://onlinechess-server.onrender.com"
   
   # Build the frontend
   npm run build
   ```

2. **Deploy to GitHub Pages**

   Two options:

   ### Option A: Manual deployment
   ```bash
   # Install gh-pages
   npm install -D gh-pages
   
   # Deploy
   npx gh-pages -d dist
   ```

   ### Option B: GitHub Actions (automated)
   
   Create `.github/workflows/deploy.yml` in your repo root:
   ```yaml
   name: Deploy to GitHub Pages

   on:
     push:
       branches: [ main ]
     workflow_dispatch:

   jobs:
     build-deploy:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         
         - name: Setup Node
           uses: actions/setup-node@v3
           with:
             node-version: '20'
             
         - name: Install and build
           working-directory: ./frontend
           env:
             VITE_SOCKET_URL: https://YOUR_RENDER_URL.onrender.com
           run: |
             npm install
             npm run build
             
         - name: Deploy
           uses: peaceiris/actions-gh-pages@v3
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./frontend/dist
   ```

3. **Enable GitHub Pages**
   - Go to your repo → Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` → `/ (root)` → Save
   - Wait 1-2 minutes
   - Your site will be at `https://YOUR_USERNAME.github.io/YOUR_REPO/`

## Testing

1. Visit your GitHub Pages URL
2. Click "Go online"
3. Open another browser/tab with the same URL
4. Start matchmaking on both
5. Play chess!

## Troubleshooting

- **Backend sleeping**: Render free tier sleeps after 15 min of inactivity. First connection takes ~30 seconds to wake up.
- **Connection errors**: Check browser console for WebSocket errors. Verify `VITE_SOCKET_URL` points to your Render URL.
- **GitHub Pages 404**: Make sure you pushed to `gh-pages` branch and enabled Pages in settings.
