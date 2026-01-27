# Deepseek Cowork Deployer

A command-line tool for deploying skills and server modules in the deepseek-cowork project.

## Features

- **Skill Deployment**: Deploy CLAUDE.md and Claude AI skills (e.g., browser-control) to work directories
- **Server Module Deployment**: Deploy custom server modules to user data directory
- **Multi-language Support**: Support English and Chinese deployment (`--lang en|zh`)
- **Backup & Reset**: Backup and reset deployment configurations

## Directory Structure

```
deploy/
├── index.js                    # Main deployer script
├── README.md                   # This file
├── skills/                     # Skill templates
│   ├── js-skills/              # JavaScript skills (English)
│   │   ├── CLAUDE.md
│   │   └── skills/
│   │       └── browser-control/
│   └── i18n/
│       └── zh/
│           └── js-skills/      # JavaScript skills (Chinese)
│
└── user-server-modules/        # Server module templates
    └── demo-module/            # Demo module
        ├── index.js
        ├── static/
        │   └── index.html
        └── README.md
```

## Usage

```bash
node deploy [command] [options]
```

### Skill Commands

Deploy Claude AI skills to work directories (configured in `happy-config.json`):

| Command | Description |
|---------|-------------|
| `deploy` | Deploy CLAUDE.md and skills to work directories |
| `update` | Update references docs |
| `backup` | Backup current config |
| `reset` | Reset config (backup first, then redeploy) |
| `status` | Check config status (default) |

### Module Commands

Deploy server modules to user data directory:

| Command | Description |
|---------|-------------|
| `module` | List available server modules |
| `module <name>` | Deploy specified module |
| `module --list` | List available server modules |
| `module --status` | Check deployed modules status |
| `module --remove <name>` | Remove deployed module |

### Options

| Option | Description |
|--------|-------------|
| `--target <name>` | Specify target work directory (by name) |
| `--lang <en\|zh>` | Specify language (default: en) |
| `--no-backup` | Skip backup when resetting |

## Examples

### Skill Deployment

```bash
# Deploy to all work directories (English)
node deploy deploy

# Deploy to all work directories (Chinese)
node deploy deploy --lang zh

# Deploy to specific work directory
node deploy deploy --target main

# Check deployment status
node deploy status

# Update references docs
node deploy update

# Reset with backup
node deploy reset

# Reset without backup
node deploy reset --no-backup
```

### Server Module Deployment

```bash
# List available modules
node deploy module

# Deploy demo-module
node deploy module demo-module

# Deploy with Chinese messages
node deploy module demo-module --lang zh

# Check deployed modules status
node deploy module --status

# Remove deployed module
node deploy module --remove demo-module
```

## User Data Directory

Server modules are deployed to the user data directory:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\deepseek-cowork\` |
| macOS | `~/Library/Application Support/deepseek-cowork/` |
| Linux | `~/.config/deepseek-cowork/` |

Structure after deployment:

```
{userData}/
├── user-server-modules/           # Deployed modules
│   └── demo-module/
│       ├── index.js
│       ├── static/
│       │   └── index.html
│       └── README.md
└── userServerModulesConfig.js     # Module configuration
```

## Creating Custom Server Modules

See the [demo-module](./user-server-modules/demo-module/README.md) for a complete example.

### Module Structure

```
my-module/
├── index.js           # Module entry point
├── static/            # Static files (optional)
└── README.md          # Module documentation
```

### Module Interface

Your module should export a setup function that returns a service instance:

```javascript
const { EventEmitter } = require('events');

function setupMyModuleService(options = {}) {
    class MyModuleService extends EventEmitter {
        async init() {
            // Initialize logic
        }
        
        setupRoutes(app) {
            // Register Express routes
            app.get('/api/my-module/hello', (req, res) => {
                res.json({ message: 'Hello!' });
            });
        }
        
        async start() {
            this.emit('started');
        }
        
        async stop() {
            this.emit('stopped');
        }
    }
    
    return new MyModuleService();
}

module.exports = { setupMyModuleService };
```

### Available Methods

| Method | Required | Description |
|--------|----------|-------------|
| `init()` | Optional | Initialization logic |
| `setupRoutes(app)` | Optional | Register Express routes |
| `start()` | Optional | Start the service |
| `stop()` | Optional | Stop the service, cleanup resources |

## API Reference

### BrowserControlDeployer

Handles skill deployment to work directories.

```javascript
const { BrowserControlDeployer } = require('./deploy');

const deployer = new BrowserControlDeployer('en'); // or 'zh'
await deployer.deploy();
await deployer.update();
await deployer.backup();
await deployer.reset();
await deployer.status();
```

### ServerModuleDeployer

Handles server module deployment to user data directory.

```javascript
const { ServerModuleDeployer } = require('./deploy');

const deployer = new ServerModuleDeployer('en'); // or 'zh'
deployer.listModules();
await deployer.deployModule('demo-module');
await deployer.removeModule('demo-module');
deployer.moduleStatus();
```

### getUserDataDir

Get the cross-platform user data directory path.

```javascript
const { getUserDataDir } = require('./deploy');

const dataDir = getUserDataDir();
// Windows: C:\Users\{user}\AppData\Roaming\deepseek-cowork
// macOS: /Users/{user}/Library/Application Support/deepseek-cowork
// Linux: /home/{user}/.config/deepseek-cowork
```

## License

MIT
