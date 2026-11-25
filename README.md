# Omron Safety Layout Studio (Notability → Visio `.vsdx`)

A mobile-first, zero-backend web app for converting **Notability safeguarding design sketches** (PDF or photo) into **native Microsoft Visio (`.vsdx`)** files using Omron's official masters, border, bottom legend, and customizable **OSHA / ANSI / ISO** regulations.

## Features
- **Mobile-First UI:** Works on iPad (right alongside Notability), iPhone, Android, or Windows desktop.
- **Interactive Regulation Selector:** Toggle common **ANSI** (`B11.0`, `B11.18`, `B11.19`, `B11.20`, `B11.26`, `Z244.1`, `Z535`), **ISO** (`12100`, `14119`, `13850`, `14120`, `13855`, `13857`, `13849-1`), and **OSHA** (`29 CFR 1910.212`, `1910.147`, `1910.217`, `1910.219`, `1910.303`, `1910.22`, `1910.144`) standards—plus add any custom standard on the fly.
- **Two Modes:**
  1. **1-Click AI (Gemini):** Upload a Notability PDF/image, enter your Gemini API key (stored only in your browser's `localStorage`), and generate the Visio layout directly.
  2. **Corporate Copy-Paste Mode:** Zero API key needed—copies a custom prompt with your selected regulations so you can use any company-approved AI (Copilot, ChatGPT, Gemini) and paste the JSON back in.
- **Live Multi-Page Preview & Pure-Browser `.vsdx` Export:** Preview every page right on your screen and download a native multi-page `.vsdx` built in-browser with `JSZip`.

## Run Locally (Windows — Zero Installs)
Double-click `start_local_app.bat` to launch on `http://localhost:8080/`.

## Deploy to GitHub Pages
1. Push this repo to `https://github.com/jruble-7027/omron.git`.
2. In GitHub, go to **Settings → Pages → Source: Deploy from a branch (`main` / `/root`)**.
3. Open `https://jruble-7027.github.io/omron/` on any iPad, phone, or PC!
