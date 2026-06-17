# Command Reference

## Edge/Node Functions Initialization

For projects needing server-side functions, run before first deploy:

```bash
edgeone pages init
```

Pure static projects skip this.

## Local Development

```bash
edgeone pages dev    # http://localhost:8088/
```

## Environment Variables

```bash
edgeone pages env ls          # List all
edgeone pages env pull        # Pull to local .env
edgeone pages env add KEY val # Add
edgeone pages env rm KEY      # Remove
```

## Project Linking

```bash
edgeone pages link
```

## Token Management

| Task | How |
|------|-----|
| Save token | Stored in `.edgeone/.token` (auto-added to `.gitignore`) |
| Update token | Delete `.edgeone/.token`, then deploy again — prompted to enter and save a new one |
| Use saved token | Automatic — the agent reads `.edgeone/.token` before each token deploy |

## Full Command Reference

| Action | Command |
|--------|---------|
| Install CLI | `npm install -g edgeone@latest` |
| Check version | `edgeone -v` |
| Login (China) | `edgeone login --site china` |
| Login (Global) | `edgeone login --site global` |
| View login info | `edgeone whoami` |
| Logout | `edgeone logout` |
| Switch account | `edgeone switch` |
| Init functions | `edgeone pages init` |
| Local dev | `edgeone pages dev` |
| Link project | `edgeone pages link` |
| Deploy | `edgeone pages deploy` |
| Deploy new project | `edgeone pages deploy -n <name>` |
| Deploy preview | `edgeone pages deploy -e preview` |
| Deploy with token | `edgeone pages deploy -t <token>` |
