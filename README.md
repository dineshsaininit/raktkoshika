# Raktkoshika web (frontend demo)

Clickable frontend for the Raktkoshika digital blood bank network. All data is sample data held in the browser. There is no backend, real login or real payment yet.

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
| `src/store/store.tsx` | Every action (order, hold, settle, donate). Replace these with API calls when the backend exists |
| `src/pages/shared` | Screens used by several portals: find blood, order, wallet, chat, camps |
| `src/pages/{user,referral,bank,franchise,admin}` | Screens for each portal |
| `src/styles/app.css` | Design tokens and all styles, including dark mode |

## Check before launch

- Processing charges in `rules.ts` come from press reports of the NBTC June 2022 guidelines. Confirm against the current circular.
- Donor eligibility rules and government register formats are drafts. Have a medical officer and the State FDA/SBTC confirm them.
- The logo in `src/ui/kit.tsx` is a redraw. Replace it with the original artwork.
