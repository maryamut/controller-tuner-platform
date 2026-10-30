# Full Stack Developer — Take-Home Exercise

**Project:** Controller Tuner Platform  
**Time we expect:** about 4–6 hours  
**Please send it back within:** 48 hours of receiving it  
**Stack:** FastAPI · React + Tailwind CSS · Docker Compose

---

## Why this exercise

We’re building a controller-tuning platform for dynamical systems. The physics engine that loads user-defined Python dynamics and runs simulations already lives in `src/core/`. Control engineers currently use a Streamlit prototype (`streamlit/app.py`) to try ideas.

We’d like to turn that into a small web app that the rest of the team can use. This exercise is a chance for us to work through that problem together: you get a realistic slice of the work, and we get to see how you approach backend APIs, React UIs, and Docker packaging.

You don’t need any control-theory background. The engine is a black box — just call it the way the Streamlit app does.

---

## What you’ll receive

```
controller-tuner/
|-- src/                          # shared engine (please treat as read-only)
|   |-- __init__.py
|   `-- core/
|       |-- __init__.py
|       |-- dynamics.py           # loads user .py & integrates ODEs
|       |-- simulator.py          # params -> trajectory + metrics
|       `-- metrics.py
|
|-- streamlit/                    # reference UI (read-only)
|   |-- app.py
|   `-- requirements.txt
|
|-- case_studies/                 # ready-to-upload test systems
|   |-- BallBeam.py
|   |-- DCMotor.py
|   `-- InvPendulum.py
|
`-- README.md
```

**Quick orientation**

1. Run the Streamlit app so you can see the intended flow:
   ```bash
   cd streamlit
   pip install -r requirements.txt
   streamlit run app.py
   ```
2. In your FastAPI code, import the engine the same way:
   ```python
   from src.core.dynamics import DynamicalSystem
   from src.core.simulator import Simulator
   ```
3. Use the files in `case_studies/` for end-to-end testing — each one defines a compatible `dynamics(t, x, u)`.

---

## What we’d like you to build

A thin productization of the Streamlit prototype:

1. **FastAPI backend** that exposes the engine over a small REST API  
2. **React + Tailwind frontend** that covers the main user flow  
3. **Docker Compose** so both services start with a single command

Aim for a clean vertical slice that works end-to-end. Polish is welcome, but a working core path matters more than covering every edge case.

### Backend

Create a `backend/` directory. Please use `src.core` directly — no need to re-implement physics or metrics.

Suggested endpoints (feel free to adjust names or group them if something cleaner fits your design):

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/upload` | Accept a `.py` file, load it with `DynamicalSystem`, keep it in memory, return metadata |
| `GET`  | `/api/v1/systems/{system_id}/schema` | Return slider min/max ranges for a controller type (`P`, `PI`, `PD`, `PID`, `FSF`) |
| `POST` | `/api/v1/systems/{system_id}/simulate` | Run one simulation with the chosen gains and return time series + metrics |

**Example contracts** (illustrative — you can refine the shapes as long as the frontend can consume them):

`POST /api/v1/upload`  
Request: `multipart/form-data` with a single `file` field (`.py` only).  
Response:
```json
{
  "system_id": "uuid-string",
  "name": "BallBeam",
  "num_states": 2
}
```

`GET /api/v1/systems/{system_id}/schema?controller_type=PID`  
Response:
```json
{
  "Kp": {"min": 0.1, "max": 60.0},
  "Ki": {"min": 0.0, "max": 5.0},
  "Kd": {"min": 0.0, "max": 20.0}
}
```

`POST /api/v1/systems/{system_id}/simulate`  
Request body:
```json
{
  "controller_type": "PID",
  "params": { "Kp": 15.0, "Ki": 0.5, "Kd": 2.0 },
  "system_config": {
    "dt": 0.01,
    "max_time": 5.0,
    "target": 0.0,
    "min_control": -10.0,
    "max_control": 10.0
  }
}
```
(You can keep `system_config` optional and apply sensible defaults if omitted.)

Response:
```json
{
  "success": true,
  "time_points": [0.0, 0.01, ...],
  "trajectory": [1.0, 0.99, ...],
  "control_signals": [10.0, 9.8, ...],
  "metrics": {
    "mse": 0.12,
    "settling_time": 1.23,
    "overshoot": 5.5,
    "stable": true,
    "ss_error": 0.001
  }
}
```

**Backend notes**
- Pydantic models for validation are appreciated.
- In-memory storage is fine — no database needed.
- Enable CORS for the React dev server (`localhost:5173` or `localhost:3000`).
- Proper status codes (`404` when the system id is unknown, etc.) help a lot.

### Frontend

Create a `frontend/` directory. The core flow we care about is:

1. Upload a `.py` dynamics file  
2. Choose a controller type and adjust gains with sliders (driven by the schema endpoint)  
3. Run a simulation and show the results  

**Minimum useful UI**
- File picker limited to `.py` files; after upload, show the system name / state count  
- Controller dropdown (`P` / `PI` / `PD` / `PID` / `FSF`) + one slider per gain from the schema  
- “Run Simulation” button  
- Two simple time-series charts: system response (with a horizontal target line if easy) and control input  
- A small metrics panel (at least the values returned by the backend) and a stable / unstable indicator  

Sensible defaults for simulation settings (`dt`, `max_time`, target, control limits, …) are enough. You don’t need to surface every Streamlit knob unless you have time left.

**Frontend notes**
- Tailwind for styling  
- React hooks for state is fine — no need for an external state library  
- Loading and error feedback (disabled button, spinner, short message) make the experience feel finished  
- Put the API base URL in an environment variable (e.g. `VITE_API_URL`)

### Docker

A `docker-compose.yml` at the repo root that brings both services up with:

```bash
docker-compose up --build
```

- Frontend should be able to reach the backend without hard-coded container IPs  
- Backend needs to import `src.core` (volume mount or `PYTHONPATH`)  

Expected layout after your work:

```
controller-tuner/
|-- src/                  # provided
|-- streamlit/            # provided
|-- case_studies/         # provided
|-- backend/              # your FastAPI app + Dockerfile
|-- frontend/             # your React app + Dockerfile
|-- docker-compose.yml
`-- README.md             # short notes on how to run it
```

---

## How we’ll try it

We’ll use the files in `case_studies/`:

| File | States | Rough description |
|------|--------|-------------------|
| `BallBeam.py` | 2 | Ball on a beam; input = beam angle |
| `DCMotor.py` | 2 | Motor speed & current; input = voltage |
| `InvPendulum.py` | 2 | Inverted pendulum; input = torque |

Happy path: upload one of them → pick PID → move the sliders a bit → run simulation → see a trajectory and some metrics.

---

## What we’re looking for

| Area | We care about |
|------|----------------|
| Code quality | Clear structure, minimal duplication, especially no re-implementation of `src.core` |
| API | Sensible REST shape, validation, understandable errors |
| React | Component boundaries that make sense, async handling, loading/error states |
| Docker | Compose file that actually starts both services cleanly |
| README | A few sentences on how to run it and any assumptions you made |

If something is ambiguous, pick a reasonable approach, note it in the README, and keep going. We’re more interested in judgment and a working result than in perfect adherence to every detail.

---

## Optional extras (only if you have time left)

- A small unit test around upload + simulate  
- A “reset to defaults” button on the frontend  
- Basic safety check that uploaded `.py` files don’t contain obvious dangerous imports  

None of these are required for a solid submission.

---

## How to send it back

Push the work to a GitHub repo (public or private with access for us). Please keep the provided `src/`, `streamlit/`, and `case_studies/` folders unchanged, and add your `backend/`, `frontend/`, `docker-compose.yml`, and an updated `README.md`.

We’ll review by running:

```bash
docker-compose up --build
```

and walking through the upload → simulate path with `BallBeam.py`.

---

Thanks for taking the time. Looking forward to seeing how you’d approach this with us.
