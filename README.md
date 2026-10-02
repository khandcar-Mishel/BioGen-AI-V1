# BioGen AI — Protein Design Studio

A web studio for de novo protein design with RFdiffusion. Click *Generate*, a pipeline runs on serverless GPUs
(RFdiffusion → ProteinMPNN → AlphaFold2), and the ranked designs come back to be explored in 3D.

| Path | What it is |
|---|---|
| `frontend/` | The app (React + Vite). RFdiffusion studio: design form, live per-design progress, ranked results with pLDDT-coloured 3D, denoising playback, run history |
| `compute/modal/` | The GPU backend on [Modal](https://modal.com): [`biogen_modal_app.py`](compute/modal/biogen_modal_app.py) and its [README](compute/modal/README.md) (architecture, API, tuning) |
| `backend/diffusion.ipynb` | The ColabDesign notebook the backend implements (reference) |
| `backend/app/` | A small local mock API (simulated jobs) for UI work without a GPU |
| `biogen-ai/` | An earlier UI prototype, not connected to a backend |

## Run it

```bash
# 1. GPU backend (once). Details and options: compute/modal/README.md
pip install modal && modal setup
cp .env.example .env     # set AUTH_EMAIL, AUTH_PASSWORD and JWT_SECRET (openssl rand -hex 32)
pip install python-dotenv && modal secret create biogen-secrets --from-dotenv .env --force
modal run compute/modal/biogen_modal_app.py::download_weights      # ~5 GB
modal deploy compute/modal/biogen_modal_app.py                     # prints the gateway URL

# 2. Frontend
cd frontend
echo 'VITE_BACKEND_URL=https://<workspace>--biogen-rfdiffusion-api.modal.run' > .env
npm install && npm run dev
```

Open the app and launch the studio: it is behind a sign-in. Use the `AUTH_EMAIL` / `AUTH_PASSWORD` from your `.env`
(there is no sign-up; the account comes from the environment).

## Tests

```bash
python -m unittest compute/modal/test_biogen_modal_app.py -v       # backend logic (needs: pip install modal numpy)
cd frontend && npm run build                                       # type-check + production build
```
