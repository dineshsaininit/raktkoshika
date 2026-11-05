# Raktkoshika web (frontend demo)

Frontend for the Raktkoshika digital blood bank network, plus a Node + MongoDB backend in `server/`.

By default all data is sample data held in the browser. To use the backend, follow `server/README.md`
and set `VITE_API_URL` in `.env.local` (see `.env.example`). Real payment and OTP login are not built yet.

## Run it

```
npm install
npm run dev
```

Open the address Vite prints. `npm run build` creates a static site in `dist/` that any static host can serve.

## Layout

| Path | What it holds |
|---|---|
| `src/data/rules.ts` | Blood rules: compatibility, shelf life, charges, donation gaps, order stages |
| `src/data/seed.ts` | Sample centres, stock, orders, wallets and people |
| `src/store/store.tsx` | Every action (order, hold, settle, donate). With `VITE_API_URL` set, each action is also sent to the server and the screen reloads the server's data |
| `src/api/client.ts` | API client: sign-in per portal, requests, live change feed |
| `server/` | Backend: Express API, MongoDB models, seed, tests |
| `src/pages/shared` | Screens used by several portals: find blood, order, wallet, chat, camps |
| `src/pages/{user,referral,bank,franchise,admin}` | Screens for each portal |
| `src/styles/app.css` | Design tokens and all styles, including dark mode |

## Check before launch

- Processing charges in `rules.ts` come from press reports of the NBTC June 2022 guidelines. Confirm against the current circular.
- Donor eligibility rules and government register formats are drafts. Have a medical officer and the State FDA/SBTC confirm them.
- The logo in `src/ui/kit.tsx` is a redraw. Replace it with the original artwork.
