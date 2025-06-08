# Fee Collector Event Scanner

A production-ready TypeScript backend service for scanning and storing EVM blockchain events from the FeeCollector smart contract. The application efficiently tracks fee collection events across supported chains and provides a REST API for querying the data.

## Features

### Core Functionality
- **Efficient Event Scanning**: Scans blockchain events in batches with progress tracking
- **Smart Resumption**: Avoids rescanning blocks by maintaining scan progress state
- **MongoDB Storage**: Uses Typegoose ODM with optimized indexes for fast queries
- **REST API**: Query events by integrator, token, block range with pagination
- **Multi-Chain Support**: Extensible architecture supporting multiple EVM chains

### Production Features
- **Comprehensive Error Handling**: Retry mechanisms with exponential backoff
- **Rate Limiting**: Built-in API rate limiting for production use
- **Structured Logging**: Winston-based logging with multiple levels
- **Docker Support**: Complete containerization with multi-stage builds
- **Health Monitoring**: Health check endpoints and container health checks
- **Graceful Shutdown**: Proper cleanup on termination signals
- **Comprehensive Testing**: Unit and integration tests with high coverage

## Quick Start

### Prerequisites
- Node.js 18+ or Docker
- MongoDB 7.0+
- Environment variables (see `.env.example`)

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
git clone <repository>
cd fee-collector-scanner
npm install
```

### 2. Setup Environment Variables

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```bash
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/fee-collector-scanner

# Blockchain Configuration
POLYGON_RPC_URL=https://polygon-rpc.com
FEE_COLLECTOR_ADDRESS=0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9

# Scanner Configuration
SCAN_BATCH_SIZE=10000
SCAN_INTERVAL_MS=30000
STARTING_BLOCK=70000000

# API Configuration
PORT=3000
API_RATE_LIMIT=100

# Logging
LOG_LEVEL=info
```

### 3. Setup Local MongoDB

#### Option A Easiest setup: Local MongoDB Installation
```bash
# Install MongoDB (macOS with Homebrew)
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB service
brew services start mongodb-community

# Use default connection string in .env
MONGODB_URI=mongodb://localhost:27017/fee-collector-scanner
```

#### Option B: Using Docker 
```bash
# Start MongoDB container
docker run -d \
  --name fee-collector-mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password123 \
  -e MONGO_INITDB_DATABASE=fee-collector-scanner \
  mongo:7.0

# Update your .env file to use authentication
MONGODB_URI=mongodb://admin:password123@localhost:27017/fee-collector-scanner?authSource=admin
```

### 4. Initialize Database (Optional)

The application will automatically create collections and indexes, but you can manually initialize:

```bash
# Connect to MongoDB and run initialization
mongosh fee-collector-scanner < init-db.js
```

### 5. Run the Application

#### Development Mode (with auto-reload)
```bash
npm run dev
```

#### Production Build
```bash
npm run build
npm start
```

### 6. Verify Setup

Check if the application is running:

```bash
# Health check
curl http://localhost:3000/health

# Scanner status
curl http://localhost:3000/api/events/scanner/status

# Sample events query
curl http://localhost:3000/api/events?limit=5
```

### 7. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Start all services (MongoDB + Application)
docker-compose up -d

# View logs
docker-compose logs -f fee-collector-scanner

# Stop services
docker-compose down
```

### Manual Docker Build

```bash
# Build the image
docker build -t fee-collector-scanner .

# Run with external MongoDB
docker run -p 3000:3000 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/fee-collector-scanner \
  fee-collector-scanner
```

## Development Workflow

### Project Structure
```
src/
├── config/          # Configuration management
│   ├── database.ts  # MongoDB connection setup
│   └── chains.ts    # Blockchain network configurations
├── models/          # Database models (Typegoose)
│   ├── FeeEvent.ts  # Fee collection event model
│   └── ScanProgress.ts # Scanning progress tracking
├── services/        # Business logic services
│   ├── EventScanner.ts # Main scanning service
│   └── FeeCollectorService.ts # Blockchain interaction
├── controllers/     # API request handlers
│   └── EventController.ts # Event API endpoints
├── routes/          # Express route definitions
│   └── events.ts    # Event-related routes
├── utils/           # Utility functions
│   ├── logger.ts    # Logging configuration
│   └── blockchain.ts # Blockchain utilities
├── types/           # TypeScript type definitions
│   └── index.ts     # Shared type definitions
└── app.ts           # Main application entry

tests/
├── controllers/     # API endpoint tests
├── services/        # Service layer tests
├── utils/           # Utility function tests
└── setup.ts         # Test environment setup
```

### Adding New Features

1. **New API Endpoints**: Add to `src/controllers/` and `src/routes/`
2. **New Database Models**: Add to `src/models/` with proper indexing
3. **New Blockchain Networks**: Update `src/config/chains.ts`
4. **New Services**: Add to `src/services/` with comprehensive error handling

### Code Quality

```bash
# Lint code
npm run lint

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

### Environment-Specific Configuration

#### Development
- Detailed console logging
- Auto-reload on file changes
- Relaxed rate limiting

#### Production
- File-based logging only
- Optimized Docker builds
- Strict rate limiting
- Health checks enabled

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### Get Events
```http
GET /events
```

**Query Parameters:**
- `integrator` (optional): Filter by integrator address
- `token` (optional): Filter by token address  
- `fromBlock` (optional): Filter events from block number
- `toBlock` (optional): Filter events to block number
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)

**Example:**
```bash
curl "http://localhost:3000/api/events?integrator=0x1234...&page=1&limit=20"
```

#### Get Events by Integrator
```http
GET /events/integrator/:integrator
```

**Example:**
```bash
curl "http://localhost:3000/api/events/integrator/0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9"
```

#### Get Integrator Statistics
```http
GET /events/integrator/:integrator/stats
```

**Response includes:**
- Total transactions
- Total fees collected (integrator + LiFi)
- Unique tokens used
- Transaction date range

#### Get Scanner Status
```http
GET /events/scanner/status
```

**Response includes:**
- Last scanned block per chain
- Total events found
- Scanning statistics

#### Health Check
```http
GET /health
```

## Testing

### Test Structure

The application includes comprehensive tests covering:

- **API Endpoints**: Full request/response testing with various scenarios
- **Service Layer**: Business logic and error handling
- **Utility Functions**: Address validation, BigNumber conversion, etc.
- **Database Operations**: Model validation and query testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/controllers/EventController.test.ts

# Run tests in watch mode (for development)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Test Database

Tests use MongoDB Memory Server for isolated testing:
- Each test gets a fresh database
- No external dependencies required
- Fast execution and cleanup

### Writing New Tests

1. **API Tests**: Add to `tests/controllers/`
2. **Service Tests**: Add to `tests/services/`
3. **Utility Tests**: Add to `tests/utils/`

Example test structure:
```typescript
describe('FeatureName', () => {
  beforeEach(async () => {
    // Setup test data
  });

  describe('specific functionality', () => {
    it('should handle normal case', async () => {
      // Test implementation
    });

    it('should handle error case', async () => {
      // Error testing
    });
  });
});
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/fee-collector-scanner` |
| `POLYGON_RPC_URL` | Polygon RPC endpoint | `https://polygon-rpc.com` |
| `FEE_COLLECTOR_ADDRESS` | Smart contract address | `0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9` |
| `SCAN_BATCH_SIZE` | Events per scanning batch | `10000` |
| `SCAN_INTERVAL_MS` | Scanning interval in milliseconds | `30000` |
| `STARTING_BLOCK` | Starting block number | `70000000` |
| `PORT` | HTTP server port | `3000` |
| `API_RATE_LIMIT` | Requests per minute per IP | `100` |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |

### Scanner Configuration

The scanner is designed to be efficient and resilient:

- **Batch Processing**: Processes blocks in configurable batches to manage memory and API limits
- **Progress Tracking**: Maintains scan progress in database to resume from interruptions
- **Duplicate Prevention**: Uses unique indexes to prevent duplicate event storage
- **Error Recovery**: Implements retry logic with exponential backoff
- **Rate Limiting**: Respectful delays between API calls to avoid overwhelming RPC providers

## Database Schema

### FeeEvent Collection
```typescript
{
  token: string;           // Token contract address
  integrator: string;      // Integrator address
  integratorFee: string;   // Fee amount for integrator (as string)
  lifiFee: string;         // Fee amount for LiFi (as string)
  blockNumber: number;     // Block number of transaction
  transactionHash: string; // Transaction hash
  logIndex: number;        // Log index within transaction
  timestamp: Date;         // Block timestamp
  chain: string;           // Blockchain name
  createdAt: Date;         // Record creation time
}
```

### ScanProgress Collection
```typescript
{
  chain: string;              // Chain name
  lastScannedBlock: number;   // Last processed block
  lastScanTime: Date;         // Time of last scan
  totalEventsFound: number;   // Total events discovered
  totalBlocksScanned: number; // Total blocks processed
}
```

## Architecture

### Key Components

1. **EventScanner**: Core scanning service with batch processing and progress tracking
2. **FeeCollectorService**: Blockchain interaction layer using ethers.js
3. **DatabaseConfig**: MongoDB connection management with retry logic
4. **EventController**: REST API handlers with validation and pagination

## Monitoring and Logging

### Logging
- Structured JSON logging with Winston
- Multiple log levels (error, warn, info, debug)
- Separate error and combined log files
- Console output in development mode

### Health Monitoring
- Health check endpoint at `/health`
- Database connection status
- Scanner status monitoring
- Docker health checks configured

### Error Handling
- Comprehensive try-catch blocks throughout
- Graceful degradation on API failures
- Retry mechanisms with exponential backoff
- Proper HTTP status codes and error messages

## Production Considerations

### Performance Optimizations
- Database indexes for efficient queries
- Connection pooling for MongoDB
- Batch processing to reduce memory usage
- Rate limiting to prevent abuse

### Security Features
- Helmet.js for security headers
- Input validation with Joi
- Non-root Docker user
- Environment variable configuration

### Scalability
- Stateless design for horizontal scaling
- Progress tracking allows multiple scanner instances
- Database indexes support high query loads
- Docker containerization for easy deployment

## Development

### Available Scripts
```bash
npm run dev        # Start development server with auto-reload
npm run build      # Build TypeScript to JavaScript
npm start          # Start production server
npm run lint       # Run ESLint
npm test           # Run Jest tests
npm run test:watch # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

### Adding New Chains

1. Add chain configuration to `src/config/chains.ts`
2. Update environment variables for new RPC endpoints
3. The scanner will automatically support the new chain

## Troubleshooting

### Common Issues

1. **Connection Errors**: Check RPC endpoint availability and rate limits
2. **Database Issues**: Verify MongoDB connection and authentication
3. **High Memory Usage**: Reduce `SCAN_BATCH_SIZE` for constrained environments
4. **Missing Events**: Check starting block configuration and RPC reliability

### Development Issues

1. **TypeScript Errors**: Run `npm run build` to check for compilation issues
2. **Test Failures**: Ensure MongoDB Memory Server can start (may need additional setup on some systems)
3. **Port Conflicts**: Change `PORT` in `.env` if 3000 is already in use

### Monitoring Commands
```bash
# Check Docker container logs
docker-compose logs -f fee-collector-scanner

# Check database connection
docker-compose exec fee-collector-scanner npm run health

# View scanning progress
curl http://localhost:3000/api/events/scanner/status

# Monitor application logs
tail -f logs/combined.log
```

### Performance Tuning

1. **Batch Size**: Adjust `SCAN_BATCH_SIZE` based on RPC provider limits
2. **Scan Interval**: Modify `SCAN_INTERVAL_MS` for more/less frequent scanning
3. **Database Indexes**: Monitor query performance and add indexes as needed
4. **Memory Usage**: Use Docker memory limits in production

## License

MIT